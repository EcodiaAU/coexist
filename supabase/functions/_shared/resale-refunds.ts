/**
 * Release-on-resale refund sweep (2026-09-27).
 *
 * A member who can no longer come, inside the refund cutoff, RELEASES their
 * ticket (self-service-ticket action 'release' -> release_my_ticket). The seat
 * goes back on sale and the waitlist sweep offers it. They are refunded in full
 * once someone else buys a paid ticket to that event.
 *
 * The DATABASE decides who is owed: claim_resale_refunds() pairs each pending
 * release with a later paid buyer, FIFO, under a per-event advisory lock, and
 * stamps resold_by_ticket_id. This module only moves the money for the rows it
 * is handed, then records that Stripe accepted it. The member is told by the
 * charge.refunded webhook (_shared/ticket-refund-notify.ts), which flips the
 * ticket to 'refunded' whatever status it held, exactly as for every other
 * refund path.
 *
 * WHY NO IDEMPOTENCY KEY. A refund with no amount refunds whatever is left on
 * the charge, and Stripe never refunds more than was charged, so a second call
 * cannot move money twice: it fails "already refunded", which is read here as
 * success. A Stripe idempotency key would add nothing to that and would cost
 * something real: Stripe caches the FIRST result for a key for 24 hours,
 * failures included, so one transient 500 would pin the refund for a day.
 *
 * FAILURE IS A RETRY, NEVER A DROP. If Stripe refuses, the pairing is released
 * (resold_by_ticket_id back to NULL) so the next sweep, five minutes later,
 * pairs and tries again. If this process dies between the stamp and the call,
 * claim_resale_refunds re-offers the stamp after 15 minutes.
 *
 * Deno-free on purpose (no URL imports) so vitest can exercise the real logic.
 */

export interface ResaleClaimRow {
  ticket_id: string
  stripe_payment_intent_id: string | null
  event_id: string
  user_id: string
  resold_by_ticket_id: string
  is_retry: boolean
}

export interface ResaleSweepDeps {
  /** rpc('claim_resale_refunds'), service role. */
  claim: () => PromiseLike<{ data: ResaleClaimRow[] | null; error: { message: string } | null }>
  /** stripe.refunds.create({ payment_intent }). Throws on failure. */
  refund: (paymentIntentId: string) => Promise<unknown>
  /** Record that Stripe accepted the refund. */
  markRefunded: (ticketId: string, nowIso: string) => PromiseLike<{ error: { message: string } | null }>
  /** Give the pairing back so the next sweep retries it. */
  releaseClaim: (ticketId: string, nowIso: string) => PromiseLike<{ error: { message: string } | null }>
  now?: () => string
}

export interface ResaleSweepResult {
  claimed: number
  refunded: number
  failed: number
  errors: string[]
}

export const ALREADY_REFUNDED_RE = /already been refunded|already refunded|charge_already_refunded/i

export async function runResaleRefundSweep(deps: ResaleSweepDeps): Promise<ResaleSweepResult> {
  const now = deps.now ?? (() => new Date().toISOString())
  const out: ResaleSweepResult = { claimed: 0, refunded: 0, failed: 0, errors: [] }

  const { data, error } = await deps.claim()
  if (error) {
    out.errors.push(`claim: ${error.message}`)
    return out
  }
  const rows = data ?? []
  out.claimed = rows.length

  for (const row of rows) {
    if (!row.stripe_payment_intent_id) {
      // The claim only pairs rows WITH an intent. Reaching here means the row
      // changed under us; give it back rather than guess.
      out.failed++
      out.errors.push(`${row.ticket_id}: no payment intent`)
      await deps.releaseClaim(row.ticket_id, now())
      continue
    }

    let accepted = false
    try {
      await deps.refund(row.stripe_payment_intent_id)
      accepted = true
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err)
      if (ALREADY_REFUNDED_RE.test(msg)) {
        accepted = true
      } else {
        out.failed++
        out.errors.push(`${row.ticket_id}: stripe ${msg}`)
        const { error: relErr } = await deps.releaseClaim(row.ticket_id, now())
        if (relErr) out.errors.push(`${row.ticket_id}: release ${relErr.message}`)
      }
    }

    if (accepted) {
      const { error: markErr } = await deps.markRefunded(row.ticket_id, now())
      if (markErr) {
        // Money moved but the stamp did not. The 15-minute re-offer tries again
        // and Stripe answers "already refunded", which lands the stamp then.
        out.errors.push(`${row.ticket_id}: stamp ${markErr.message}`)
      }
      out.refunded++
    }
  }

  return out
}
