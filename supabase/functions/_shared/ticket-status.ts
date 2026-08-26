/**
 * event_tickets.status - the named sets, Deno side.
 *
 * WHY THIS FILE EXISTS
 *
 * `reserved` was added as a sixth ticket status on 2026-08-24 and every site
 * that switched on status had to be found by hand. The RENDER half of that class
 * was made structurally safe on 2026-08-26: `TICKET_STATUS_PRESENTATION` in
 * `src/lib/event-capacity.ts` is a TOTAL `Record<TicketStatus, ...>`, so a
 * seventh status fails the build instead of landing in a fallback branch.
 *
 * That technique cannot reach the other half. Seven sites filtered
 * `event_tickets` by a status set spelled out INLINE inside a query
 * (`.in('status', ['pending', 'confirmed', 'checked_in'])`), and no type can
 * force a literal array to be exhaustive. Three of those were HIGH severity:
 * two double-seat bugs (claim + grant) and one member-visible orphaned hold
 * (cancel-event). All three were the same array, copied three times, each copy
 * silently wrong the moment a sixth status existed.
 *
 * So the sets get names, and a query says what it MEANS. A future status is
 * added in ONE place, and `src/test/ticket-status-query-sets.test.ts` fails the
 * build if these sets ever drift from `src/lib/event-capacity.ts` or from the
 * `event_tickets_status_check` constraint in the migrations.
 *
 * WHY A TWIN RATHER THAN AN IMPORT
 *
 * Edge functions are bundled from `supabase/functions/`, and a relative import
 * reaching up out of that root (`../../../src/lib/...`) is not a shape this
 * repo has ever deployed. `_shared/` IS the proven Deno-side module location
 * (every function here already imports `_shared/sentry.ts`). Gambling three
 * live client edge functions on an unproven bundler path to save a duplicated
 * array would be the wrong trade, so the duplication is deliberate and the
 * parity test is what makes it safe: the twin cannot drift silently.
 */

/** Every value of the `event_tickets.status` check constraint, in schema order. */
export const TICKET_STATUSES = [
  'pending',
  'confirmed',
  'cancelled',
  'refunded',
  'checked_in',
  'reserved',
] as const

export type TicketStatus = (typeof TICKET_STATUSES)[number]

/**
 * The seat is GONE. A ticket in one of these states occupies nothing, owes
 * nothing, and is never reused.
 */
export const TERMINAL_GONE_TICKET_STATUSES = ['cancelled', 'refunded'] as const

/**
 * A ticket that still EXISTS for this person on this event: not terminal.
 *
 * DERIVED from the two above rather than spelled out, which is the whole point.
 * A seventh status is live unless it is explicitly declared terminal, so the
 * failure direction is safe: an unrecognised status counts as "they already
 * have a ticket" (reuse it) instead of "they have none" (insert a second seat),
 * which is exactly the double-seat bug this file closes.
 */
export const LIVE_TICKET_STATUSES = TICKET_STATUSES.filter(
  (s): s is TicketStatus => !(TERMINAL_GONE_TICKET_STATUSES as readonly string[]).includes(s),
)

/**
 * Live but not yet settled: the seat is theirs, the money is not in.
 *
 * `pending` is mid-checkout. `reserved` is an organiser hold. Both are unpaid,
 * and both are what the Stripe webhook confirms in place
 * (`.in(['pending', 'reserved'])`), so this set is the definition of "still
 * moving toward a final state" on the server side too.
 *
 * This is the set a COMP may promote to confirmed: giving someone a free ticket
 * is a decision to settle an unpaid seat, and it must never rewrite a seat that
 * has already been paid for.
 */
export const UNSETTLED_TICKET_STATUSES = ['pending', 'reserved'] as const

/** Seats that are occupied for capacity purposes. A hold IS a taken seat. */
export const SPOT_TAKING_TICKET_STATUSES = ['confirmed', 'checked_in', 'reserved'] as const

/** Seats where money has actually been taken. An unpaid hold is not revenue. */
export const PAID_TICKET_STATUSES = ['confirmed', 'checked_in'] as const

/**
 * Pick the ONE live ticket to reuse when a person has more than one.
 *
 * They should never have two, but the double-seat bugs this file closes were
 * live in production, so rows created by them exist. The old code asked for a
 * single row with `.maybeSingle()`, which returns an ERROR (not a row) when two
 * match; every call site dropped that error and fell through to INSERT, adding
 * a THIRD seat. Choosing deterministically instead means the next claim or
 * grant heals the duplicate rather than compounding it.
 *
 * Order of preference: a settled seat outranks an unsettled one, so a comp can
 * never overwrite a ticket somebody has already paid for.
 */
const REUSE_PREFERENCE: readonly string[] = ['checked_in', 'confirmed', 'reserved', 'pending']

export function pickTicketToReuse<T extends { status: string | null }>(
  rows: readonly T[] | null | undefined,
): T | null {
  if (!rows?.length) return null
  let best: T | null = null
  let bestRank = Number.MAX_SAFE_INTEGER
  for (const row of rows) {
    const idx = row.status == null ? -1 : REUSE_PREFERENCE.indexOf(row.status)
    // An unrecognised live status ranks last but still beats inserting a second
    // seat, which is the failure this whole module exists to prevent.
    const rank = idx === -1 ? REUSE_PREFERENCE.length : idx
    if (rank < bestRank) {
      best = row
      bestRank = rank
    }
  }
  return best
}

/** Is this ticket live but unpaid, so a comp may settle it in place? */
export function isUnsettledTicketStatus(status: string | null | undefined): boolean {
  return status != null && (UNSETTLED_TICKET_STATUSES as readonly string[]).includes(status)
}
