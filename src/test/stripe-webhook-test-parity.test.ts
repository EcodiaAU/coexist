/**
 * `stripe-webhook` and `stripe-webhook-test` are two files that must agree.
 *
 * They cannot be one file: the test function reads STRIPE_SECRET_KEY_TEST and
 * STRIPE_WEBHOOK_SECRET_TEST while Supabase project secrets are function-wide,
 * so test mode needs its own deployment. That is a real constraint, and the
 * cost of it is that every donations fix has to be hand-copied into a second
 * file which nothing was watching.
 *
 * It had already drifted. On 2026-09-23 the live function was fixed so a failed
 * card reaches a donor with no account, a recovered card clears `past_due`, and
 * a cancellation reaches the owner named on the row. The test function, which is
 * ENABLED at Stripe on the same six events, kept the old logic on all three
 * branches. A session validating donation behaviour there would have watched the
 * pre-fix code pass and concluded the live function was fine.
 *
 * So this suite does not restate the handlers. It reads BOTH FROM SOURCE and
 * asserts the markers that carry each fix are present in each, which is the only
 * way a one-sided edit fails loudly. Sibling of recurring-message-coupling.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8')

const LIVE = read('supabase/functions/stripe-webhook/index.ts')
const TEST = read('supabase/functions/stripe-webhook-test/index.ts')
const BOTH: Array<[string, string]> = [
  ['stripe-webhook', LIVE],
  ['stripe-webhook-test', TEST],
]

/**
 * The marker for each fix: something that CANNOT be present unless the fix is.
 * A comment would satisfy a grep without changing behaviour, so every marker
 * here is executable syntax.
 */
const SHARED_MARKERS: Array<{ fix: string; marker: RegExp }> = [
  {
    fix: 'payment_failed takes the donor email, not user_id alone',
    marker: /\.select\('user_id, donor_email, donor_name'\)/,
  },
  {
    fix: 'payment_failed writes past_due, not the old paused proxy',
    marker: /\.update\(\{ status: 'past_due' \}\)/,
  },
  {
    fix: 'sendTemplateEmail resolves a recipient instead of forwarding a null',
    marker: /const recipient = userId \? \{ userId \} : toEmail \? \{ to: toEmail \} : null/,
  },
  {
    fix: 'payment_succeeded clears past_due, narrowed so cancelled and paused are never resurrected',
    marker: /\.update\(\{ status: 'active' \}\)\s*\n\s*\.eq\('stripe_subscription_id', subscriptionId\)\s*\n\s*\.eq\('status', 'past_due'\)/,
  },
  {
    fix: 'subscription.deleted reads the owner off the row, not sub.metadata',
    marker: /const \{ data: cancelledRow \} = await supabase/,
  },
  {
    fix: 'the ledger message is interval-aware',
    marker: /const recurringMessage = \(interval: string \| null \| undefined\) =>/,
  },
]

/** Every message string a webhook can write against a recurring charge. */
function vocabulary(src: string, name: string): string[] {
  const block = src.match(/const RECURRING_MESSAGE: Record<string, string> = \{([\s\S]*?)\}/)
  if (!block) throw new Error(`RECURRING_MESSAGE map not found in ${name}`)
  const values = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  const fallback = src.match(/RECURRING_MESSAGE\[interval \?\? ''\] \?\? '([^']+)'/)
  if (!fallback) throw new Error(`recurringMessage fallback not found in ${name}`)
  return [...values, fallback[1]].sort()
}

describe('stripe-webhook-test tracks stripe-webhook on the donations branches', () => {
  for (const { fix, marker } of SHARED_MARKERS) {
    it(`both functions carry: ${fix}`, () => {
      for (const [name, src] of BOTH) {
        expect(marker.test(src), `${name} is missing this fix`).toBe(true)
      }
    })
  }

  it('both write the same recurring vocabulary, fallback included', () => {
    // Not just "both have a map". The test copy once fell back to the MONTHLY
    // spelling where live falls back to the period-neutral one, which is the
    // same wrong-period claim the map exists to end.
    expect(vocabulary(TEST, 'stripe-webhook-test')).toEqual(
      vocabulary(LIVE, 'stripe-webhook'),
    )
  })

  it('neither function hardcodes a recurring message at a write site', () => {
    for (const [name, src] of BOTH) {
      const writeSites = [...src.matchAll(/message: '([^']*recurring donation)'/gi)]
      expect(writeSites.map((m) => m[1]), `${name} hardcodes a ledger message`).toEqual([])
    }
  })

  it('neither function awards points against a null user id', () => {
    // An account-less gift has no user_id, and most backfilled rows are exactly
    // that, so an unguarded award_points calls the RPC with null on nearly every
    // recurring charge.
    for (const [name, src] of BOTH) {
      expect(
        /if \(points > 0 && donorUserId\)/.test(src),
        `${name} awards points without a user-id guard`,
      ).toBe(true)
    }
  })

  it('the markers discriminate: none of them matches the pre-fix source', () => {
    // A marker that also matches the OLD code would let this whole suite pass
    // against a function that was never fixed, which is the failure mode this
    // file exists to prevent. Rebuild the pre-fix shapes and assert they fail.
    const preFix = [
      `.select('user_id')\n          .eq('stripe_subscription_id', subscriptionId)\n          .single()`,
      `.update({ status: 'paused' })`,
      `body: { type, userId, data },`,
      `const meta = sub.metadata ?? {}\n        if (meta.user_id) {`,
      `message: 'Monthly recurring donation',`,
      `if (points > 0) {`,
    ].join('\n')
    for (const { fix, marker } of SHARED_MARKERS) {
      expect(marker.test(preFix), `marker for "${fix}" matches pre-fix source`).toBe(false)
    }
  })
})
