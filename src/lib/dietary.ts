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
