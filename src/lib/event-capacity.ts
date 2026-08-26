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

/** A ticket row as the leader sales panel reads it. */
type SalesRow = TicketRow & { price_cents: number | null; ticket_type_id: string }

export interface TicketSalesSummary {
  /** Money actually taken: PAID statuses only. An unpaid hold is not revenue. */
  totalRevenue: number
  /** Seats occupied: SPOT_TAKING, matching the banner and event_spots_taken. */
  totalSold: number
  /** Of those seats, the ones held for someone who has not paid yet. */
  totalHeld: number
  totalCheckedIn: number
  byType: Record<string, { sold: number; revenue: number }>
}

/**
 * The leader ticket-sales panel, computed in one place.
 *
 * SOLD and REVENUE answer different questions and therefore use different
 * status sets. A `reserved` seat is occupied (so it counts as sold, and the
 * banner agrees) but unpaid (so it must NOT count as revenue). Summing
 * price_cents over the spot-taking set instead of the paid set overstates
 * takings by the full price of every outstanding hold.
 */
export function summariseTicketSales(rows: readonly SalesRow[] | null | undefined): TicketSalesSummary {
  const empty: TicketSalesSummary = { totalRevenue: 0, totalSold: 0, totalHeld: 0, totalCheckedIn: 0, byType: {} }
  if (!rows?.length) return empty

  const spotTaking = new Set<string>(SPOT_TAKING_TICKET_STATUSES)
  const paid = new Set<string>(PAID_TICKET_STATUSES)
  const held = new Set<string>(HELD_TICKET_STATUSES)

  const out: TicketSalesSummary = { totalRevenue: 0, totalSold: 0, totalHeld: 0, totalCheckedIn: 0, byType: {} }
  for (const row of rows) {
    const status = row.status
    if (status == null || !spotTaking.has(status)) continue

    const qty = row.quantity ?? 1
    const cents = row.price_cents ?? 0

    out.totalSold += qty
    if (status === 'checked_in') out.totalCheckedIn += qty
    if (held.has(status)) out.totalHeld += qty

    if (!out.byType[row.ticket_type_id]) out.byType[row.ticket_type_id] = { sold: 0, revenue: 0 }
    out.byType[row.ticket_type_id].sold += qty

    if (paid.has(status)) {
      out.totalRevenue += cents
      out.byType[row.ticket_type_id].revenue += cents
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/*  Ticket status presentation: ONE table, every surface derives       */
/* ------------------------------------------------------------------ */

/** Every value of the `event_tickets.status` enum, in schema order. */
export const TICKET_STATUSES = ['pending', 'confirmed', 'cancelled', 'refunded', 'checked_in', 'reserved'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

/**
 * The visual family a status belongs to. `error` is for statuses where the seat
 * is GONE. Nothing else is allowed to render red.
 */
export type TicketStatusTone = 'success' | 'checkedIn' | 'warning' | 'error' | 'unknown'

/** The seat is gone. The only statuses permitted the error tone. */
export const TERMINAL_GONE_TICKET_STATUSES = ['cancelled', 'refunded'] as const

/**
 * Statuses still moving toward a final state, so a surface watching a ticket
 * has to keep watching.
 *
 * `reserved` sits here beside `pending` because a member who has just paid for
 * an organiser hold stays on `reserved` until the Stripe webhook flips the row
 * in place (stripe-webhook confirms `.in(['pending', 'reserved'])`), which is
 * the identical redirect race `pending` already covered.
 */
export const RESOLVING_TICKET_STATUSES = ['pending', 'reserved'] as const

/**
 * The same set under its SERVER-side reading: live, but the money is not in.
 *
 * `RESOLVING` names what a watching surface does (keep polling). `UNSETTLED`
 * names what is true of the seat (taken, unpaid), which is what a server
 * decision turns on: this is the set a comp may promote to confirmed, and the
 * set the Stripe webhook confirms in place. One array, two readings, so the two
 * halves of the codebase cannot drift apart over which statuses are unpaid.
 */
export const UNSETTLED_TICKET_STATUSES = RESOLVING_TICKET_STATUSES

/**
 * A ticket that still EXISTS for this person on this event: not terminal.
 *
 * DERIVED from `TICKET_STATUSES` minus `TERMINAL_GONE_TICKET_STATUSES` rather
 * than spelled out, so a seventh status is live unless explicitly declared
 * gone. The failure direction is deliberate: an unrecognised status counts as
 * "they already hold a ticket", so an idempotency lookup reuses the row instead
 * of inserting a second seat.
 *
 * The Deno twin at `supabase/functions/_shared/ticket-status.ts` derives this
 * identically, and `src/test/ticket-status-query-sets.test.ts` fails the build
 * if the two ever disagree.
 */
export const LIVE_TICKET_STATUSES = TICKET_STATUSES.filter(
  (s): s is TicketStatus => !(TERMINAL_GONE_TICKET_STATUSES as readonly string[]).includes(s),
)

interface TicketStatusPresentation {
  /** Dense label for a badge pill (leader panel, ticket cards). */
  badgeLabel: string
  /** Human label for a member-facing status line. */
  label: string
  tone: TicketStatusTone
}

/**
 * The single status table.
 *
 * Typed as a TOTAL Record over TicketStatus, so adding a seventh status to the
 * enum fails the build right here instead of silently landing in a fallback
 * branch on some page nobody remembered to visit.
 *
 * That is the entire point. `reserved` was added as a sixth status on
 * 2026-08-24 and FIVE sites switched on ticket status without being revisited:
 * the leader badge (a live hold in dead-ticket red), the member confirmation
 * page status line (raw red string "reserved" one line under "Total paid
 * $80.00 AUD"), that page's success animation ("You are going, your ticket is
 * confirmed" over an unpaid hold), its "You are all set" block, and its poll
 * predicate, which returned false for anything but `pending` so the page
 * stopped polling instantly and never self-resolved without a manual refresh.
 * Presentation is derived from here now, never re-implemented at a call site.
 *
 * A hold is amber, not red: seat taken, money still owed, which is what
 * `pending` already means.
 */
const TICKET_STATUS_PRESENTATION: Record<TicketStatus, TicketStatusPresentation> = {
  pending: { badgeLabel: 'pending', label: 'Pending', tone: 'warning' },
  confirmed: { badgeLabel: 'confirmed', label: 'Confirmed', tone: 'success' },
  cancelled: { badgeLabel: 'cancelled', label: 'Cancelled', tone: 'error' },
  refunded: { badgeLabel: 'refunded', label: 'Refunded', tone: 'error' },
  checked_in: { badgeLabel: 'In', label: 'Checked In', tone: 'checkedIn' },
  reserved: { badgeLabel: 'Held', label: 'Spot held', tone: 'warning' },
}

/** An unrecognised status reads neutral. It must never fall through to red. */
const UNKNOWN_PRESENTATION: TicketStatusPresentation = { badgeLabel: 'unknown', label: 'Unknown', tone: 'unknown' }

const BADGE_CLASS: Record<TicketStatusTone, string> = {
  success: 'bg-success-100 text-success-700',
  checkedIn: 'bg-moss-100 text-moss-700',
  warning: 'bg-warning-100 text-warning-700',
  error: 'bg-error-100 text-error-700',
  unknown: 'bg-neutral-100 text-neutral-600',
}

const TEXT_CLASS: Record<TicketStatusTone, string> = {
  success: 'text-success-600',
  checkedIn: 'text-success-600',
  warning: 'text-warning-600',
  error: 'text-error-600',
  unknown: 'text-neutral-600',
}

function presentationFor(status: string | null | undefined): TicketStatusPresentation {
  // hasOwnProperty, not `in`: `'toString' in obj` is true through the prototype
  // and would hand back undefined.
  if (status != null && Object.prototype.hasOwnProperty.call(TICKET_STATUS_PRESENTATION, status)) {
    return TICKET_STATUS_PRESENTATION[status as TicketStatus]
  }
  return UNKNOWN_PRESENTATION
}

/**
 * Everything a surface needs to render one ticket status, resolved from the one
 * table. Every rendering helper below is a thin projection of this; no call site
 * re-implements the mapping.
 */
export interface ResolvedTicketStatus {
  /** Dense label for a leader-panel pill. */
  badgeLabel: string
  /** Human label for anything a member reads. */
  label: string
  tone: TicketStatusTone
  /** Pill treatment: background plus foreground. */
  badgeClassName: string
  /** Plain text treatment. */
  textClassName: string
  /** Still moving toward a final state. */
  resolving: boolean
}

export function ticketStatusPresentation(status: string | null | undefined): ResolvedTicketStatus {
  const p = presentationFor(status)
  const raw = String(status ?? 'unknown')
  const known = p !== UNKNOWN_PRESENTATION
  return {
    badgeLabel: known ? p.badgeLabel : raw,
    label: known ? p.label : raw,
    tone: p.tone,
    badgeClassName: BADGE_CLASS[p.tone],
    textClassName: TEXT_CLASS[p.tone],
    resolving: isResolvingTicketStatus(status),
  }
}

/** The tone a status renders in, on any surface. Exported so tests lock the class. */
export function ticketStatusTone(status: string | null | undefined): TicketStatusTone {
  return presentationFor(status).tone
}

/**
 * How one ticket status reads as a dense BADGE pill: the leader ticket panel.
 */
export function ticketStatusBadge(status: string | null | undefined): { label: string; className: string } {
  const p = ticketStatusPresentation(status)
  return { label: p.badgeLabel, className: p.badgeClassName }
}

/**
 * How one ticket status reads as a member-facing TEXT line: the ticket
 * confirmation page. Same table, different projection, so the two surfaces
 * cannot disagree about what a status means.
 */
export function ticketStatusText(status: string | null | undefined): { label: string; className: string } {
  const p = ticketStatusPresentation(status)
  return { label: p.label, className: p.textClassName }
}

/**
 * Is this ticket still resolving toward a final state? A surface polling for a
 * settled ticket keeps polling while this is true; the caller bounds the window.
 */
export function isResolvingTicketStatus(status: string | null | undefined): boolean {
  return status != null && (RESOLVING_TICKET_STATUSES as readonly string[]).includes(status)
}

/* ------------------------------------------------------------------ */
/*  Attendance classification: the one rule for "is this person going" */
/* ------------------------------------------------------------------ */

/** Where one person lands on the leader roster. 'hidden' = not rendered. */
export type AttendanceScenario =
  | 'checkedIn'
  | 'expected'
  | 'waitlist'
  | 'notAttending'
  | 'noTicket'
  | 'hidden'

/**
 * Decide how one registration reads on the roster, given the tickets that
 * person actually holds.
 *
 * Extracted as a pure function on 2026-08-25 because this decision WAS the bug.
 * It lived inline in useEventRoster's query callback, untestable, and one
 * branch of it ("active registration, no valid ticket, on a ticketed event")
 * returned 'expected', i.e. counted as going. That branch was written to
 * grandfather a one-off Eventbrite import and then silently absorbed every
 * ghost RSVP the unguarded chat "Going" button created, which is how Wild
 * Mountains read 28 going against a limit of 25 while only 26 tickets existed
 * and only 16 had been paid for.
 *
 * The rule now: on a ticketed event, GOING MEANS HOLDING A TICKET. Nothing else
 * counts, so the leader roster, the event page and the public page cannot
 * disagree. Someone registered without a ticket is neither counted nor hidden;
 * they surface as 'noTicket' for the organiser to comp in or remove.
 */
export function classifyAttendance(input: {
  isTicketed: boolean
  /** event_registrations.status */
  registrationStatus: string | null
  /** confirmed + checked_in tickets this person holds */
  validTicketCount: number
  /** any ticket of theirs is checked_in */
  ticketCheckedIn: boolean
}): AttendanceScenario {
  const { isTicketed, registrationStatus, validTicketCount, ticketCheckedIn } = input

  // Physically present is ground truth and outranks every ticket question.
  if (registrationStatus === 'attended' || ticketCheckedIn) return 'checkedIn'

  // A valid ticket seats the person even if their registration row still says
  // waitlisted. Someone who paid must never sit on the waitlist below capacity
  // (the Kieren case, Angelica 2026-07-09).
  if (validTicketCount > 0) return 'expected'

  if (registrationStatus === 'waitlisted') {
    // Ticketed events have no RSVP waitlist: the ticket is the only model, so a
    // waitlisted row with no ticket is noise on the leader roster.
    return isTicketed ? 'hidden' : 'waitlist'
  }

  if (registrationStatus === 'cancelled') return 'hidden'

  // Active registration, no ticket at all.
  return isTicketed ? 'noTicket' : 'expected'
}
