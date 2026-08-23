/**
 * Canonical "spots taken" semantics for an event - the single source of truth
 * every surface must agree with.
 *
 * Co-Exist tracks event participation across two tables with two status enums:
 *   - event_tickets.status    = pending | confirmed | cancelled | refunded | checked_in | reserved   (the BUYING layer)
 *   - event_registrations.status = invited | registered | attended | cancelled            (the RSVP layer)
 *
 * The banner ("X/Y spots filled") historically counted the RSVP layer (via the
 * event_going_count RPC) while the leader ticket-sales panel counted the buying
 * layer. For a TICKETED event those are two different populations, so the two
 * surfaces disagreed (Myall Park: 25 going vs 22 valid tickets). This module
 * pins ONE definition so no surface can drift again.
 *
 * A taken SPOT (capacity occupancy) is not the same as PAID revenue: a free
 * (price_cents = 0) or full-comp ticket still occupies a seat and counts here.
 * Whether money was actually taken is answered against Stripe, never inferred
 * from a status column.
 *
 * The authoritative count lives server-side in the `event_spots_taken` RPC
 * (SECURITY DEFINER, RLS-independent). These pure helpers exist so client code
 * counts identically wherever it already holds the rows (the leader sales
 * summary, ticket-type remaining) and so the ticketed/non-ticketed decision is
 * written down in exactly one place.
 */

/**
 * Ticket statuses that OCCUPY a seat: what the banner and sales panel display.
 *
 * `reserved` is in here because an organiser hold IS a taken seat. The whole
 * point of holding a spot for someone on a full event (Angelica, 2026-08-24) is
 * that nobody else can buy it out from under them, so it has to read as filled
 * everywhere the confirmed seats do. It is NOT paid revenue: see
 * `PAID_TICKET_STATUSES` for the money question, which is answered against
 * Stripe and never inferred from a status column.
 */
export const SPOT_TAKING_TICKET_STATUSES = ['confirmed', 'checked_in', 'reserved'] as const

/** Statuses where the seat is occupied AND money has actually been taken. */
export const PAID_TICKET_STATUSES = ['confirmed', 'checked_in'] as const

/** An organiser hold: seat taken, payment still owed. */
export const HELD_TICKET_STATUSES = ['reserved'] as const

/**
 * Ticket statuses that HOLD inventory during checkout. Includes `pending` so a
 * ticket mid-checkout is not oversold from under the buyer; this is deliberately
 * a superset of SPOT_TAKING (the displayed count) and is used only for the
 * per-ticket-type `remaining` calculation, never for the "spots filled" display.
 */
export const INVENTORY_HOLD_TICKET_STATUSES = ['pending', 'confirmed', 'checked_in', 'reserved'] as const

/** Registration statuses that count as "going" for a non-ticketed event. */
export const GOING_REGISTRATION_STATUSES = ['registered', 'attended'] as const

type TicketRow = { status: string | null; quantity: number | null }

function sumQuantityForStatuses(
  rows: readonly TicketRow[] | null | undefined,
  statuses: readonly string[],
): number {
  if (!rows?.length) return 0
  const allow = new Set(statuses)
  let n = 0
  for (const row of rows) {
    if (row.status != null && allow.has(row.status)) n += row.quantity ?? 1
  }
  return n
}

/** Seats occupied by valid tickets (confirmed + checked_in + reserved holds). */
export function ticketSpotsTaken(rows: readonly TicketRow[] | null | undefined): number {
  return sumQuantityForStatuses(rows, SPOT_TAKING_TICKET_STATUSES)
}

/** Seats that have actually been PAID for (excludes unpaid organiser holds). */
export function ticketSpotsPaid(rows: readonly TicketRow[] | null | undefined): number {
  return sumQuantityForStatuses(rows, PAID_TICKET_STATUSES)
}

/** Seats currently held for an invitee who has not paid yet. */
export function ticketSpotsHeld(rows: readonly TicketRow[] | null | undefined): number {
  return sumQuantityForStatuses(rows, HELD_TICKET_STATUSES)
}

/** Tickets holding inventory (pending + confirmed + checked_in), summing quantity. */
export function ticketInventoryHeld(rows: readonly TicketRow[] | null | undefined): number {
  return sumQuantityForStatuses(rows, INVENTORY_HOLD_TICKET_STATUSES)
}

/**
 * The one canonical "spots taken" number for an event. Ticketed events count
 * valid tickets; non-ticketed events count going registrations. Mirrors the
 * `event_spots_taken` SQL RPC exactly.
 */
export function computeSpotsTaken(input: {
  isTicketed: boolean
  /** Valid-ticket seats for a ticketed event (e.g. event_spots_taken RPC, or ticketSpotsTaken(rows)). */
  ticketSpotsTaken: number
  /** Going registrations for a non-ticketed event (e.g. event_going_count RPC). */
  registrationsGoing: number
}): number {
  return input.isTicketed ? input.ticketSpotsTaken : input.registrationsGoing
}
