#!/usr/bin/env node
/**
 * reconcile-recurring-donations.mjs
 *
 * WHY THIS EXISTS
 * ---------------
 * recurring_donations is populated ONLY by the Stripe webhook endpoint
 * we_1TGZkqCNw9X8EsOR..., and that endpoint was created 2026-03-30. Every
 * subscription started before that date raised its `customer.subscription.created`
 * event into a void, so the app never recorded it.
 *
 * Measured 2026-09-23 against the LIVE account acct_1MTfbPCNw9X8EsOR:
 *   Stripe: 33 subscriptions, 7 of them active.
 *   recurring_donations: 2 rows.
 * The only two rows present arrived via `invoice.payment_succeeded` on their
 * ANNUAL RENEWAL anniversaries (subs created 2024-08-27 and 2024-09-09; rows
 * created 2026-08-27 and 2026-09-09). So the table was slowly filling itself one
 * donor per anniversary, and every donor not yet due was invisible to the app.
 *
 * A donor with no row sees a blank /profile/donations (RLS is
 * `user_id = auth.uid()`) and cannot self-cancel (create-checkout's
 * `cancel_subscription` authorises on the same column). That is the whole bug.
 *
 * An earlier fix hardcoded two subscription ids into a migration. That fixed two
 * donors and measured the DB rather than the population, which is how 31 of 33
 * stayed invisible. This script reads Stripe as the source of truth instead, so
 * it stays correct as the population changes and can be re-run any time.
 *
 * SAFETY
 *   - Read-only by default. Writes only with --apply.
 *   - Never creates, modifies or cancels anything AT Stripe. Stripe is read-only here.
 *   - Never overwrites an existing user_id (a claimed row stays claimed).
 *   - Never clears a value: Stripe only fills fields the DB has left NULL, except
 *     for status / billing_interval / cancelled_at, where Stripe is authoritative.
 *   - is_public is left at the column default (false), so no donor-wall surface moves.
 *
 * USAGE
 *   STRIPE_SECRET_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/reconcile-recurring-donations.mjs            # dry run, prints drift
 *   ... node scripts/reconcile-recurring-donations.mjs --apply  # writes, then claims
 *   ... node scripts/reconcile-recurring-donations.mjs --json   # machine-readable drift
 *
 * Exit codes: 0 clean or applied, 1 drift found in dry-run, 2 bad usage/env, 3 error.
 */

import { createClient } from '@supabase/supabase-js'
import {
  mapStripeStatus,
  rowFromSubscription,
  diffRow,
  UNMAPPABLE,
} from './lib/recurring-donations-map.mjs'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tjutlbzekfouwsiaplbr.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY

const APPLY = process.argv.includes('--apply')
const AS_JSON = process.argv.includes('--json')

if (!SERVICE_KEY || !STRIPE_KEY) {
  console.error('reconcile-recurring-donations: set SUPABASE_SERVICE_ROLE_KEY and STRIPE_SECRET_KEY')
  process.exit(2)
}

const log = (...a) => { if (!AS_JSON) console.log(...a) }

/* ---------------------------------------------------------------- Stripe --- */

async function stripeGet(path) {
  const res = await fetch('https://api.stripe.com' + path, {
    headers: { Authorization: `Bearer ${STRIPE_KEY}` },
  })
  if (!res.ok) throw new Error(`Stripe ${path} -> ${res.status} ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

/**
 * Every subscription, every status, with the customer expanded so donor identity
 * comes back in the same call. Pages explicitly: a `limit=100` that silently drops
 * subscription 101 is the same class of bug this script exists to fix.
 */
async function allSubscriptions() {
  const out = []
  let startingAfter = null
  for (let page = 0; page < 100; page++) {
    const q = new URLSearchParams({ limit: '100', status: 'all' })
    q.append('expand[]', 'data.customer')
    if (startingAfter) q.set('starting_after', startingAfter)
    const body = await stripeGet('/v1/subscriptions?' + q.toString())
    out.push(...body.data)
    if (!body.has_more || body.data.length === 0) return out
    startingAfter = body.data[body.data.length - 1].id
  }
  throw new Error('subscription pagination did not terminate after 100 pages')
}

/* ------------------------------------------------------------------ main --- */

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const subs = await allSubscriptions()
  log(`Stripe: ${subs.length} subscriptions (${subs.filter((s) => s.status === 'active').length} active)`)

  const { data: existing, error: readErr } = await supabase
    .from('recurring_donations')
    .select('*')
  if (readErr) throw new Error('read recurring_donations: ' + readErr.message)
  log(`recurring_donations: ${existing.length} rows`)

  const byStripeId = new Map(existing.map((r) => [r.stripe_subscription_id, r]))

  const toInsert = []
  const toUpdate = []
  const skipped = []

  for (const sub of subs) {
    if (mapStripeStatus(sub.status) === UNMAPPABLE) {
      skipped.push({ sub: sub.id, reason: `unmappable Stripe status "${sub.status}"` })
      continue
    }
    const desired = rowFromSubscription(sub)
    const current = byStripeId.get(sub.id)
    if (!current) { toInsert.push(desired); continue }
    const patch = diffRow(current, desired)
    if (Object.keys(patch).length) toUpdate.push({ id: current.id, sub: sub.id, patch })
  }

  /* The other direction. A row whose subscription Stripe has never heard of is
   * either a hand-written test row or a record pointing at a different Stripe
   * account, and it shows a donor a gift that cannot be cancelled (the cancel
   * call has nothing to cancel). Reported, never auto-deleted: destroying a
   * donation record is not a thing a reconciler should decide. */
  const stripeIds = new Set(subs.map((s) => s.id))
  const notInStripe = existing
    .filter((r) => !stripeIds.has(r.stripe_subscription_id))
    .map((r) => ({ row: r.id, sub: r.stripe_subscription_id, status: r.status, email: r.donor_email }))

  const report = {
    stripe_subscriptions: subs.length,
    stripe_active: subs.filter((s) => s.status === 'active').length,
    db_rows_before: existing.length,
    missing_from_db: toInsert.length,
    drifted: toUpdate.length,
    rows_stripe_does_not_know: notInStripe,
    skipped,
    applied: APPLY,
  }

  if (!APPLY) {
    if (AS_JSON) console.log(JSON.stringify(report, null, 2))
    else {
      log('')
      log(`MISSING from recurring_donations: ${toInsert.length}`)
      for (const r of toInsert) {
        log(`  + ${r.stripe_subscription_id}  ${r.status.padEnd(9)} ${r.donor_email ?? '(no email)'} $${r.amount}/${r.billing_interval}`)
      }
      log(`DRIFTED: ${toUpdate.length}`)
      for (const u of toUpdate) log(`  ~ ${u.sub} ${JSON.stringify(u.patch)}`)
      if (notInStripe.length) {
        log(`IN THE APP BUT NOT IN STRIPE: ${notInStripe.length} (reported only, never deleted)`)
        for (const r of notInStripe) log(`  ? ${r.sub} ${r.status} ${r.email ?? '(no email)'}`)
      }
      if (skipped.length) { log(`SKIPPED: ${skipped.length}`); for (const s of skipped) log(`  ! ${s.sub}: ${s.reason}`) }
      log('')
      log(toInsert.length + toUpdate.length + notInStripe.length === 0
        ? 'Clean: the app agrees with Stripe.'
        : 'Re-run with --apply to write the inserts and drift fixes.')
    }
    process.exit(toInsert.length + toUpdate.length + notInStripe.length === 0 ? 0 : 1)
  }

  /* ---- apply ---- */
  if (toInsert.length) {
    const { error } = await supabase.from('recurring_donations').insert(toInsert)
    if (error) throw new Error('insert: ' + error.message)
    log(`inserted ${toInsert.length}`)
  }
  for (const u of toUpdate) {
    const { error } = await supabase.from('recurring_donations').update(u.patch).eq('id', u.id)
    if (error) throw new Error(`update ${u.sub}: ${error.message}`)
  }
  if (toUpdate.length) log(`updated ${toUpdate.length}`)

  /* Link every row whose donor already holds a confirmed account. This is the
   * SAME definer function the auth.users trigger and the webhook call, so the
   * backfill exercises the live claim path rather than a parallel one. */
  const emails = [...new Set(
    [...toInsert.map((r) => r.donor_email), ...existing.map((r) => r.donor_email)]
      .filter(Boolean).map((e) => e.trim().toLowerCase()),
  )]
  let claimedRecurring = 0
  for (const email of emails) {
    const { data, error } = await supabase.rpc('claim_donations_for_email', { p_email: email })
    if (error) { console.error(`claim ${email}: ${error.message}`); continue }
    const row = Array.isArray(data) ? data[0] : data
    if (row?.recurring_claimed) {
      claimedRecurring += row.recurring_claimed
      log(`  claimed ${row.recurring_claimed} recurring + ${row.donations_claimed} one-off for ${email}`)
    }
  }

  const { count } = await supabase
    .from('recurring_donations')
    .select('id', { count: 'exact', head: true })
  const { count: linked } = await supabase
    .from('recurring_donations')
    .select('id', { count: 'exact', head: true })
    .not('user_id', 'is', null)

  report.db_rows_after = count
  report.rows_linked_to_an_account = linked
  report.recurring_claimed_this_run = claimedRecurring
  if (AS_JSON) console.log(JSON.stringify(report, null, 2))
  else {
    log('')
    log(`recurring_donations now ${count} rows, ${linked} linked to an account.`)
    log('Rows still unlinked belong to donors with no confirmed account; the')
    log('auth.users trigger claims each one the moment that donor signs up.')
  }
}

main().catch((err) => { console.error('reconcile failed:', err.message); process.exit(3) })
