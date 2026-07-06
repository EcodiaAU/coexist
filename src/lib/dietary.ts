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
