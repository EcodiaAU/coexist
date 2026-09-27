/**
 * Member-facing ticket terms.
 *
 * The refund / transfer / held-spot terms shown to members are legal copy and
 * are OWED BY ANGELICA + TATE. The wording below was supplied on 2026-09-27
 * with the release-on-resale feature and APPROVED BY TATE the same day ("finish
 * absolutely everything and push it live"), so TICKET_TERMS_PENDING is false
 * and the per-event flags default on. Nothing in this file may be
 * reworded by EcodiaOS on its own: changing refund terms shown to a paying
 * member is a live commercial commitment made by a machine.
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
export const TICKET_TERMS_PENDING = false

/** Shown in place of policy text while the wording is outstanding. */
export const TICKET_TERMS_PLACEHOLDER =
  'Ticket terms are being finalised. Your organiser will confirm the exact refund and transfer conditions for this event.'

/**
 * The terms, exactly as supplied (2026-09-27). NOT SHOWN while
 * TICKET_TERMS_PENDING is true. Do not edit these from a guess, a template, or
 * another organisation's policy: they are a commercial commitment to a paying
 * member. `refund` describes BOTH self-service paths: a direct refund before
 * the cutoff, and release-on-resale inside it.
 */
export const TICKET_TERMS = {
  refund:
    "Can't make it? Refund your ticket in the app up to 7 days before the event. Inside 7 days you can release it instead: it goes back on sale, and you're refunded in full as soon as someone else buys it. If nobody does, it isn't refunded.",
  transfer:
    'You can pass your ticket to a friend any time before the event. They take your spot. Nothing is refunded, so sort payment between you.',
  heldSpot:
    "We've held a spot for you. Pay by the date shown to confirm it, or it goes to the next person on the waitlist.",
} as const

/** The copy a surface should actually render for a given term. */
export function ticketTermsCopy(kind: keyof typeof TICKET_TERMS): string {
  if (TICKET_TERMS_PENDING) return TICKET_TERMS_PLACEHOLDER
  return TICKET_TERMS[kind] || TICKET_TERMS_PLACEHOLDER
}
