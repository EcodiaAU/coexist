/**
 * Sold-out flag for events whose tickets sold out on an external platform
 * (e.g. Eventbrite) while native in-app sales should be closed.
 *
 * Stored as `event_extras.sold_out === true` (a jsonb column the campout
 * claim_token also lives in). It is deliberately independent of native ticket
 * capacity: a campout can be sold out on Eventbrite while its native
 * `event_ticket_types.capacity` still shows spots, because the two ticketing
 * paths are separate. The per-event claim link (`/claim/:id/:token`) bypasses
 * this entirely so Eventbrite buyers can still grab a free ticket + join the
 * group chat.
 */
export function isEventSoldOut(
  event: { event_extras?: unknown } | null | undefined,
): boolean {
  const extras = event?.event_extras
  if (!extras || typeof extras !== 'object') return false
  return (extras as Record<string, unknown>).sold_out === true
}
