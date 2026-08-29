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

/** True when a profile has ANSWERED the four-wheel-drive question.
 *
 *  The column is nullable on purpose and the three states are load-bearing:
 *  NULL means never asked, `true` and `false` are both real answers. A plain
 *  truthiness check would read "answered: no 4WD" as "never answered" and
 *  re-ask that person on every app open forever, which is how a well-meaning
 *  gate becomes a nag people learn to dismiss without reading.
 *
 *  Shared by the onboarding step, the pre-checkout gate and the app-open
 *  backstop so the three can never disagree about what "answered" means, the
 *  same reason hasEmergencyContact lives here. */
export function hasFourWheelDriveAnswer(
  profile: { has_four_wheel_drive?: boolean | null } | null | undefined,
): boolean {
  return profile?.has_four_wheel_drive === true || profile?.has_four_wheel_drive === false
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

/** The retreat safety set as the PUBLIC (guest) booking modal collects it.
 *
 *  One home for the shape, because TypeScript cannot catch the thing that
 *  broke here. A handler typed `(r: {dietary, medical}) => void` is
 *  structurally assignable to `onSubmit: (r: GuestSafetyAnswers) => void`:
 *  accepting fewer properties than you are handed is legal. So 65646d56 added
 *  the emergency contact to the modal and to event.tsx, campout-type.tsx kept
 *  its two-field `book(reqs)` signature, the compiler stayed silent, and every
 *  camp-out page booking posted an empty emergency contact into a server that
 *  hard-requires one. The buyer filled the form, the server said it was blank,
 *  and there was no way through. */
export interface GuestSafetyAnswers {
  dietary: string
  medical: string
  emergencyName: string
  emergencyPhone: string
  emergencyRelationship: string
}

/** Map collected answers onto the snake_case keys guest-ticket-checkout reads.
 *
 *  EVERY caller of that function builds its safety fields through here. The
 *  point is that adding a field to the server gate is one edit in one place
 *  instead of a hunt through call sites, and a caller that forgets cannot
 *  compile a half-payload by hand. Pinned by safety-gate-coverage.test.ts,
 *  which reads the page sources and fails if a fetch site builds these keys
 *  itself. */
export function guestSafetyPayload(answers: GuestSafetyAnswers) {
  return {
    dietary: answers.dietary,
    medical: answers.medical,
    emergency_name: answers.emergencyName,
    emergency_phone: answers.emergencyPhone,
    emergency_relationship: answers.emergencyRelationship,
  }
}

/** Heading for the app-open safety gate, naming only what is actually asked.
 *
 *  The gate renders one to three field groups (dietary, medical, emergency
 *  contact) and the heading has to match the body, because a heading that
 *  names a field the body does not show reads as a broken form and teaches
 *  people to distrust the prompt.
 *
 *  The case this exists for is emergency-contact-only. Measured 2026-08-28,
 *  8 of the 10 upcoming-overnight seats with nobody to call had already
 *  answered dietary and medical, so the single most common way this gate can
 *  ever open is with the emergency-contact group alone. The heading it
 *  previously fell through to was "Any dietary requirements?" over a body
 *  holding no dietary field at all.
 *
 *  Shared with the ariaLabel so the screen-reader announcement and the
 *  visible heading can never disagree. */
export function safetyGateHeading(need: {
  dietary: boolean
  medical: boolean
  emergency: boolean
  fourWheelDrive?: boolean
}): string {
  const count =
    Number(need.dietary) + Number(need.medical) + Number(need.emergency) + Number(!!need.fourWheelDrive)
  if (count > 1) return 'A couple of details for your event'
  if (need.emergency) return 'Who should we call in an emergency?'
  if (need.medical) return 'Any medical needs or allergies?'
  if (need.dietary) return 'Any dietary requirements?'
  return 'Do you have a four-wheel drive?'
}
