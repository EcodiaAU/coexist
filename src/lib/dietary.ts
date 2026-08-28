/* ------------------------------------------------------------------ */
/*  Dietary gate shared constants                                      */
/*                                                                     */
/*  Lives outside dietary-gate.tsx so non-component modules (hooks,    */
/*  pages) can import them without breaking React fast refresh.        */
/* ------------------------------------------------------------------ */

/** React-query key for the "holds a ticket to an upcoming ticketed event"
 *  eligibility check. Invalidate after a ticket purchase/claim so the
 *  DietaryGate re-evaluates immediately. */
export const DIETARY_GATE_QUERY_KEY = ['dietary-gate-upcoming-ticketed']

/** Sentinel written to profiles.dietary_requirements when the user
 *  explicitly answers "no dietary requirements". Distinguishes
 *  "answered: none" from empty/null = "never answered" (which keeps the
 *  gate armed). */
export const NO_DIETARY_SENTINEL = 'None'

/** Sentinel written to profiles.medical_requirements when the user
 *  explicitly answers "no medical / allergy conditions". Same distinction
 *  as NO_DIETARY_SENTINEL: empty/null = "never answered" (gate stays armed),
 *  the sentinel = "answered: none" (never re-nags). */
export const NO_MEDICAL_SENTINEL = 'None'

/** event_tickets.status values that count as a LIVE seat for the safety gate.
 *
 *  A seat counts when someone is expected to turn up, not when money has
 *  landed. 'reserved' is an organiser-created hold (reserve-event-spot): a
 *  named person on a real roster who is the only source of their own
 *  emergency contact, so duty-of-care applies to them exactly as it does to a
 *  paid seat. Leaving it out is why the two Murbpook hold-holders were never
 *  once asked (found 2026-08-28, seat count 15, gaps 4).
 *
 *  'cancelled' and 'refunded' are deliberately absent: that seat is gone.
 *  The full column domain is the event_tickets_status_check constraint
 *  (pending, confirmed, cancelled, refunded, checked_in, reserved). */
export const LIVE_TICKET_STATUSES = ['pending', 'confirmed', 'checked_in', 'reserved'] as const

/** event_registrations.status values that count as a LIVE seat.
 *
 *  'invited' is deliberately absent. It is the bulk-import state and carries
 *  4,861 rows, most of whom never accepted; arming a blocking modal on it
 *  would nag thousands of people who hold no seat. A registration counts once
 *  the person has actually registered or attended. */
export const LIVE_REGISTRATION_STATUSES = ['registered', 'attended'] as const

/** True when a profile has a REACHABLE emergency contact on file.
 *
 *  Name AND phone are both required, because a contact you cannot ring is not
 *  a contact. Whitespace is not an answer. There is deliberately no "None"
 *  sentinel here, unlike dietary and medical: those have a legitimate none, a
 *  remote camp-out with nobody to call does not.
 *
 *  Shared by the app-open DietaryGate backstop and the pre-checkout gate in
 *  event-detail so the two can never disagree about what "has a contact"
 *  means. */
export function hasEmergencyContact(
  profile: { emergency_contact_name?: string | null; emergency_contact_phone?: string | null } | null | undefined,
): boolean {
  return !!(profile?.emergency_contact_name ?? '').trim()
    && !!(profile?.emergency_contact_phone ?? '').trim()
}

/** The activity_type enum value that classifies an event as a camp-out.
 *  Camp-outs are multi-day / overnight and the only ticketed event class
 *  today; medical requirements are mandated at purchase for these events
 *  (dietary is mandated for every ticketed event). Verified 2026-07-08:
 *  every upcoming ticketed event has activity_type = 'camp_out'. */
export const CAMPOUT_ACTIVITY_TYPE = 'camp_out'

/** True when an event is a camp-out (needs medical + dietary at purchase). */
export function isCampoutActivity(activityType: string | null | undefined): boolean {
  return activityType === CAMPOUT_ACTIVITY_TYPE
}
