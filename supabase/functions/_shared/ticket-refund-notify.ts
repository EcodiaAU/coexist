/**
 * Event-ticket refund notification (2026-08-26).
 *
 * WHY THIS EXISTS. A refunded Co-Exist member was never usefully told. Three
 * separate surfaces can start a ticket refund:
 *   1. revoke-event-ticket   - the organiser's "Refund and remove" button.
 *   2. self-service-ticket   - the member refunding their own ticket.
 *   3. the Stripe dashboard  - a human issuing the refund by hand.
 * None of them talks to the others, and (3) never touches our code at all.
 * The ONE place all three converge is Stripe's charge.refunded webhook, which
 * is also the only point at which the refund is confirmed rather than merely
 * requested. That is why the notification fires from the webhook and from
 * nowhere else.
 *
 * Grounded live case: event_tickets 45e658d2-bb40-4747-9bc6-9ef88eb430ab went
 * status='refunded' at 2026-08-20T22:44:33Z for $80.00 against
 * pi_3TsHNOCNw9X8EsOR0bJwSkYM on the "Wild Mountains Conservation Campout".
 * The holder heard nothing.
 *
 * TWO DEFECTS ARE CLOSED HERE.
 *   a) The email that existed spoke about an "order #45e658d2". A ticket is not
 *      a merch order: the member needs the EVENT named, the amount, and where
 *      the money is going back to.
 *   b) There was no idempotence marker at all. Stripe retries charge.refunded
 *      on any non-2xx and on its own schedule, so a retry storm meant four
 *      identical refund emails to one member. The guard is now a PERSISTED
 *      column (event_tickets.refund_notified_at), claimed by a single
 *      conditional UPDATE ... WHERE refund_notified_at IS NULL. Postgres
 *      row-locks that statement, so two concurrent deliveries cannot both
 *      claim it, and the guard survives a cold function instance.
 *
 * A FAILED SEND RELEASES THE CLAIM. Consuming the one notification on a
 * transient Resend failure would silently cost the member their only telling,
 * so the marker goes back to NULL and the next Stripe retry tries again. A
 * DELIBERATE suppression (an admin disabling the template) keeps the claim,
 * because retrying that forever is a storm with no recipient at the end of it.
 */

export interface UpdateResult {
  data: Array<{ id: string }> | null
  error: unknown
}

/**
 * The slice of the PostgREST builder this module uses. Declared structurally so
 * the unit test can stand in a fake that exercises the REAL query shape,
 * including the `.is('refund_notified_at', null)` claim, rather than a
 * paraphrase of it.
 */
export interface RefundNotifyClient {
  from(table: string): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: unknown): {
        is(column: string, value: null): { select(columns: string): PromiseLike<UpdateResult> }
        select(columns: string): PromiseLike<UpdateResult>
      }
    }
    select(columns: string): {
      eq(column: string, value: unknown): {
        maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>
      }
    }
  }
}

export interface RefundEmail {
  type: string
  userId: string
  data: Record<string, unknown>
}

export interface RefundNotifyArgs {
  ticketId: string
  eventId: string
  userId: string
  ticketCode: string | null
  /** charge.amount_refunded, in cents, exactly as Stripe reported it. */
  amountRefundedCents: number
  nowIso: string
}

export interface RefundNotifyDeps {
  db: RefundNotifyClient
  /**
   * Reports what actually happened. `ok` means Resend accepted it; `suppressed`
   * means we deliberately did not send (admin-disabled template, opt-out). A
   * sender that returns success on a failure is the silent-data-loss shape this
   * whole module exists to stop, so the two are never collapsed.
   */
  sendEmail: (email: RefundEmail) => Promise<{ ok: boolean; suppressed: boolean }>
}

export type RefundNotifyOutcome =
  | 'sent'
  | 'already_notified'
  | 'suppressed'
  | 'send_failed'
  | 'claim_failed'

export async function notifyTicketRefund(
  deps: RefundNotifyDeps,
  args: RefundNotifyArgs,
): Promise<{ sent: boolean; outcome: RefundNotifyOutcome }> {
  const tickets = () => deps.db.from('event_tickets')

  // 1. Finalise the ticket. Registration + campout chat membership are DERIVED
  //    from this by trg_reconcile_event_ticket_state (dupe-aware), never set
  //    here. Safe to repeat on a retry.
  await tickets()
    .update({ status: 'refunded', updated_at: args.nowIso })
    .eq('id', args.ticketId)
    .select('id')

  // 2. Claim the notification. One conditional statement, so the database
  //    decides the winner rather than this process.
  const { data: claimed, error: claimError } = await tickets()
    .update({ refund_notified_at: args.nowIso })
    .eq('id', args.ticketId)
    .is('refund_notified_at', null)
    .select('id')

  if (claimError) {
    // Never send on an unknown claim state: an unguarded send is exactly the
    // four-emails-to-one-member failure. Stripe retries; we try again then.
    console.error('[refund-notify] claim failed, not sending:', args.ticketId, claimError)
    return { sent: false, outcome: 'claim_failed' }
  }
  if (!claimed || claimed.length === 0) {
    return { sent: false, outcome: 'already_notified' }
  }

  // 3. Name the event. Same lookup and date formatting the ticket_confirmation
  //    email uses, so the two read as one system.
  const { data: ev } = await deps.db
    .from('events')
    .select('title, date_start, address')
    .eq('id', args.eventId)
    .maybeSingle()

  const dateStart = ev?.date_start as string | null | undefined
  const refundAmount = (args.amountRefundedCents ?? 0) / 100

  const result = await deps.sendEmail({
    type: 'ticket_refunded',
    userId: args.userId,
    data: {
      name: '',
      event_title: (ev?.title as string | undefined) ?? 'your event',
      event_date: dateStart
        ? new Date(dateStart).toLocaleDateString('en-AU', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
        : '',
      event_location: (ev?.address as string | undefined) ?? '',
      ticket_code: args.ticketCode ?? '',
      refund_amount: refundAmount.toFixed(2),
      currency: 'AUD',
    },
  })

  if (result.ok) return { sent: true, outcome: 'sent' }
  if (result.suppressed) return { sent: false, outcome: 'suppressed' }

  // Transient failure: give the notification back so the next retry can send it.
  console.error('[refund-notify] send failed, releasing claim:', args.ticketId)
  await tickets()
    .update({ refund_notified_at: null })
    .eq('id', args.ticketId)
    .select('id')
  return { sent: false, outcome: 'send_failed' }
}
