// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'
import {
  buildTicketConfirmation,
  classifySendResult,
  type ContentClient,
} from '../_shared/ticket-confirmation-content.ts'

/**
 * transactional-email-drain - sends the transactional email that somebody is
 * owed, independently of whatever was supposed to send it the first time.
 *
 * Called by pg_cron every 5 minutes (`cron_transactional_email_drain`), and
 * safe to call by hand.
 *
 * WHY IT EXISTS. Seven Murbpook campout buyers paid AU$70 and never got a
 * confirmation. Nothing threw: their tickets are all `confirmed` and Stripe got
 * its 200. Only the email leg failed (a 401 on server-to-server
 * functions.invoke, fixed in f99bd578), and because the send was an inline
 * side effect of the webhook with no record and no queue, a transient failure
 * was indistinguishable from a success and unrecoverable either way.
 *
 * THE ONE RULE THIS FUNCTION EXISTS TO ENFORCE: an email that we failed to send
 * is still OWED. It stays owed, on a backoff, until it is sent, deliberately
 * declined, or has exhausted its attempts loudly.
 *
 * TWO SENDERS, ONE CLAIM. The webhook still attempts the send inline, because a
 * buyer should get their ticket in seconds rather than on the next cron tick.
 * This function is what makes that attempt's failure survivable. Both settle the
 * SAME outbox row, and `claim_transactional_email_batch` takes a lease with
 * FOR UPDATE SKIP LOCKED, so the two cannot both send one email.
 *
 * THE AUTHORIZATION HEADER IS LOAD-BEARING, NOT BOILERPLATE. supabase-js does
 * not attach a key to functions.invoke, so omitting it here would reproduce the
 * exact 401 this whole mechanism was built to survive, in the component whose
 * job is surviving it.
 */

const BATCH_LIMIT = 25

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface OutboxRow {
  id: string
  dedupe_key: string
  template: string
  user_id: string | null
  to_email: string | null
  ticket_id: string | null
  context: Record<string, unknown> | null
  attempts: number
  max_attempts: number
}

Deno.serve(withSentry('transactional-email-drain', async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  const supabase = createClient(supabaseUrl, serviceKey)

  // Optional: run the reconciliation sweep before draining, so a ticket that
  // paid but was never enqueued at all (a Stripe delivery that never arrived,
  // a function killed before it wrote anything) is picked up in the same pass.
  let reconciled = 0
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const skipReconcile = (body as { skip_reconcile?: boolean })?.skip_reconcile === true
    if (!skipReconcile) {
      const { data: recon, error: reconErr } = await supabase.rpc(
        'reconcile_ticket_confirmation_outbox',
        { p_limit: 200, p_dry_run: false },
      )
      if (reconErr) {
        console.error('[drain] reconcile failed:', reconErr.message)
      } else {
        reconciled = Array.isArray(recon) ? recon.length : 0
        if (reconciled > 0) {
          console.log(`[drain] reconciliation enqueued ${reconciled} unconfirmed paid ticket(s)`)
        }
      }
    }
  } catch (err) {
    console.error('[drain] reconcile threw:', (err as Error).message)
  }

  const { data: claimed, error: claimErr } = await supabase.rpc(
    'claim_transactional_email_batch',
    { p_limit: BATCH_LIMIT },
  )
  if (claimErr) {
    console.error('[drain] claim failed:', claimErr.message)
    return json({ ok: false, error: claimErr.message }, 500)
  }

  const rows = (claimed ?? []) as OutboxRow[]
  const results: Array<{ id: string; template: string; outcome: string; detail?: string }> = []

  for (const row of rows) {
    try {
      if (row.template !== 'ticket_confirmation') {
        // The outbox is template-agnostic by design, but only the templates
        // wired below can be rendered. An unknown one is left for a human
        // rather than guessed at: a wrong-template email is worse than a late
        // one. Burns an attempt so it cannot spin.
        const detail = `no renderer for template '${row.template}'`
        await supabase.rpc('settle_transactional_email', {
          p_id: row.id, p_outcome: 'retry', p_error: detail,
        })
        results.push({ id: row.id, template: row.template, outcome: 'unrenderable', detail })
        continue
      }

      if (!row.ticket_id) {
        await supabase.rpc('settle_transactional_email', {
          p_id: row.id, p_outcome: 'retry', p_error: 'ticket_confirmation row carries no ticket_id',
        })
        results.push({ id: row.id, template: row.template, outcome: 'malformed' })
        continue
      }

      // Guest-ness is intent recorded by the webhook (there is no persisted
      // column for it). Undefined means the reconciliation sweep created this
      // row from paid state alone, and the builder then picks the magic link,
      // which reaches a guest AND a member.
      const ctxGuest = row.context?.guest
      const guest = typeof ctxGuest === 'boolean' ? ctxGuest : undefined

      const payload = await buildTicketConfirmation(
        supabase as unknown as ContentClient,
        {
          ticketId: row.ticket_id,
          appUrl: Deno.env.get('APP_URL') ?? 'https://app.coexistaus.org',
          guest,
        },
      )

      // Addressed by userId, never by a literal `to`, so send-email runs its
      // real production path: notification preferences, marketing opt-out and
      // the email_suppressions dead-address gate all apply. Bypassing that with
      // a raw address would mail somebody who asked us not to.
      const { data: sendBody, error: sendErr } = await supabase.functions.invoke('send-email', {
        headers: { Authorization: `Bearer ${serviceKey}` },
        body: { type: payload.type, userId: payload.userId, ticketId: payload.ticketId, data: payload.data },
      })

      // functions.invoke RESOLVES on a non-2xx rather than throwing, and sets
      // `error` instead. That is the exact shape that made ten call sites
      // report success while every email 401'd, so a non-null error here is a
      // retryable failure and is never read as a send.
      const classified = sendErr
        ? { outcome: 'retry' as const, detail: `invoke error: ${(sendErr as Error).message}` }
        : classifySendResult(200, sendBody as Record<string, unknown> | null)

      await supabase.rpc('settle_transactional_email', {
        p_id: row.id,
        p_outcome: classified.outcome,
        p_error: classified.outcome === 'sent' ? null : classified.detail,
      })
      results.push({
        id: row.id,
        template: row.template,
        outcome: classified.outcome,
        detail: classified.outcome === 'sent' ? undefined : classified.detail,
      })
    } catch (err) {
      const detail = (err as Error).message
      await supabase.rpc('settle_transactional_email', {
        p_id: row.id, p_outcome: 'retry', p_error: detail,
      })
      results.push({ id: row.id, template: row.template, outcome: 'threw', detail })
    }
  }

  const tally = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1
    return acc
  }, {})

  console.log(`[drain] reconciled=${reconciled} claimed=${rows.length} ${JSON.stringify(tally)}`)
  return json({ ok: true, reconciled, claimed: rows.length, tally, results })
}))
