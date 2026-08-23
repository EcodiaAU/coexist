/**
 * Member-facing ticket terms: PLACEHOLDER, NOT FINAL WORDING.
 *
 * The refund / transfer / held-spot terms shown to members are legal copy and
 * are OWED BY ANGELICA + TATE. They have not landed as at 2026-08-24. Nothing
 * in this file is real policy and none of it was drafted by EcodiaOS: inventing
 * refund terms and showing them to a paying member would be a live commercial
 * commitment made by a machine.
 *
 * While TICKET_TERMS_PENDING is true every member-facing self-service surface
 * renders TICKET_TERMS_PLACEHOLDER as a visible "terms pending" notice instead
 * of policy text. The mechanics still work; only the wording is withheld.
 *
 * TO CLOSE THIS OUT:
 *   1. Angelica + Tate agree the refund / transfer / hold wording.
 *   2. Replace TICKET_TERMS below with the agreed copy.
 *   3. Set TICKET_TERMS_PENDING = false.
 *   4. Turn the per-event flags on (events.self_service_refund_enabled /
 *      self_service_transfer_enabled), which default to FALSE precisely so that
 *      nothing member-facing can go live on placeholder wording.
 */

/** True until the real wording lands. Gates every member-facing terms surface. */
export const TICKET_TERMS_PENDING = true

/** Shown in place of policy text while the wording is outstanding. */
export const TICKET_TERMS_PLACEHOLDER =
  'Ticket terms are being finalised. Your organiser will confirm the exact refund and transfer conditions for this event.'

/**
 * The real terms. EMPTY ON PURPOSE while TICKET_TERMS_PENDING is true.
 * Do not populate these from a guess, a template, or another organisation's
 * policy: they are a commercial commitment to a paying member.
 */
export const TICKET_TERMS = {
  refund: '',
  transfer: '',
  heldSpot: '',
} as const

/** The copy a surface should actually render for a given term. */
export function ticketTermsCopy(kind: keyof typeof TICKET_TERMS): string {
  if (TICKET_TERMS_PENDING) return TICKET_TERMS_PLACEHOLDER
  return TICKET_TERMS[kind] || TICKET_TERMS_PLACEHOLDER
}
