/**
 * Cancelled events are admin-only (migration 20261009120000).
 *
 * RLS now hides a cancelled event from every non-admin and from anon, so for a
 * member or a collective leader the row simply stops existing: an embed of
 * `events` comes back null and `useEventDetail` resolves to null. Admins
 * (`is_admin_or_staff`: profiles.role national_leader, manager or admin) still
 * read the row with `status = 'cancelled'`.
 *
 * Every surface that reads an event therefore has two shapes of "cancelled" to
 * handle, and these helpers are the one place that rule lives.
 */

export interface MaybeStatusedEvent {
  status?: string | null
}

/** True when the event is gone for this viewer: hidden by RLS (null) or cancelled. */
export function isEventGone(event: MaybeStatusedEvent | null | undefined): boolean {
  return !event || event.status === 'cancelled'
}

/**
 * Should an RSVP ("Going") on an announcement for this event be refused?
 * Only once the event lookup has RESOLVED: while it is still in flight the
 * caller hands the tap to the event page, which knows more. A resolved null
 * means RLS hid it (cancelled, or the viewer cannot see it); an admin sees the
 * cancelled row itself.
 */
export function rsvpBlockedForEvent(resolved: boolean, event: MaybeStatusedEvent | null | undefined): boolean {
  return resolved && isEventGone(event)
}

/**
 * The global roles `is_admin_or_staff` passes, i.e. who RLS still shows a
 * cancelled event to. Deliberately NOT `useAuth().isStaff`: that is rank >= 3,
 * which also counts the global `leader` role (38 profiles on 2026-10-09), and
 * RLS hides cancelled events from them.
 */
export const RLS_ADMIN_ROLES: readonly string[] = ['national_leader', 'manager', 'admin']

export function canReadCancelledEvents(role: string | null | undefined): boolean {
  return !!role && RLS_ADMIN_ROLES.includes(role)
}

/**
 * Where a leader lands after cancelling an event. Anyone RLS hides a cancelled
 * event from can no longer read the event they just cancelled, so staying put
 * shows "Event not found"; send them to their events list. An admin still sees
 * the cancelled banner, so they stay (null = do not navigate).
 */
export function landingAfterCancel(role: string | null | undefined): string | null {
  return canReadCancelledEvents(role) ? null : '/leader/events'
}

export interface DatedTicket {
  event_date?: string | null
}

/**
 * Split My Tickets into upcoming and past. A ticket whose event is hidden
 * (cancelled, so the embed is null and there is no event_date) belongs in
 * neither list and is dropped, so the empty state must be computed from these
 * two sets and never from the raw ticket count.
 */
export function splitTicketsByEventDate<T extends DatedTicket>(
  tickets: readonly T[] | null | undefined,
  now: Date = new Date(),
): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = []
  const past: T[] = []
  for (const t of tickets ?? []) {
    if (!t.event_date) continue
    if (new Date(t.event_date) >= now) upcoming.push(t)
    else past.push(t)
  }
  return { upcoming, past }
}
