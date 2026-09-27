/**
 * Release on resale: what a member sees about a ticket they RELEASED.
 *
 * Inside the refund cutoff a member can release their ticket (see
 * release_my_ticket and the self-service sheet). The row goes to status
 * 'cancelled' with released_at set, the seat goes back on sale, and they are
 * refunded in full once someone else buys a paid ticket. Until then the member
 * must be able to see that the ticket is released and that a refund may follow,
 * so My Tickets keeps showing it instead of letting it vanish.
 *
 * States, derived from the row alone:
 *   awaiting   - released, no refund yet, and the event has not started (or a
 *                buyer is already paired and the refund is in flight).
 *   refunded   - Stripe accepted the refund (resale_refunded_at), or the
 *                charge.refunded webhook has already flipped it to 'refunded'.
 *   not_resold - the event started and nobody bought a ticket after the
 *                release, so there is no refund.
 */

export type TicketReleaseState = 'awaiting' | 'refunded' | 'not_resold'

export interface ReleasableTicket {
  status: string
  released_at?: string | null
  resold_by_ticket_id?: string | null
  resale_refunded_at?: string | null
  event_date?: string | null
}

export function ticketReleaseState(t: ReleasableTicket, now: Date = new Date()): TicketReleaseState | null {
  if (!t.released_at) return null
  if (t.resale_refunded_at || t.status === 'refunded') return 'refunded'
  // Paired with a buyer before the event: the refund is owed even if the
  // Stripe call is still being retried after the event has started.
  if (t.resold_by_ticket_id) return 'awaiting'
  if (t.event_date && new Date(t.event_date) <= now) return 'not_resold'
  return 'awaiting'
}

export const RELEASE_STATE_COPY: Record<TicketReleaseState, string> = {
  awaiting: "Released. You'll be refunded when someone takes your spot.",
  refunded: 'Released and refunded. It can take a few days to land back on your card.',
  not_resold: "Released. Nobody took your spot before the event, so it wasn't refunded.",
}

/** Statuses My Tickets shows as live tickets. A released ticket is added on top. */
export const MY_TICKETS_LIVE_STATUSES = ['confirmed', 'checked_in', 'reserved'] as const

/**
 * The PostgREST `or` filter My Tickets uses: every live ticket, plus any ticket
 * the member released (which is 'cancelled' or, once refunded, 'refunded').
 */
export const MY_TICKETS_OR_FILTER =
  `status.in.(${MY_TICKETS_LIVE_STATUSES.join(',')}),released_at.not.is.null`
