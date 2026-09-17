/**
 * The invite header decision: does the host's typed header travel, or does the
 * press fall back to the defaults each channel had before the field existed?
 *
 * This lives in its own module because it is the single rule the whole feature
 * rests on and it was previously an inline expression inside event-detail.tsx,
 * where nothing could test it. The four channels do NOT share one default (the
 * chat card on a first press is the bare event title, the in-app row says
 * "invited to", push and email say "invited:"), and an explicit subject is the
 * TOP tier of send-email's precedence chain, above the system_email_overrides
 * row that /admin/email writes. So forwarding a header the host never chose
 * silently overwrites the admin's subject and flattens three distinct channel
 * defaults into one string.
 *
 * WHY THE TRIM IS ON BOTH SIDES. The first version compared a trimmed typed
 * value against an UNTRIMMED prefill:
 *
 *   inviteHeader.trim() !== invitePrefilledHeader
 *
 * The prefill is built from the event title, and 11 of 474 live events carry a
 * trailing space in `title` (for example "North Stradbroke Island Trip "). For
 * those events the two sides could never be equal, so an UNTOUCHED press
 * reported itself as edited and forwarded a header on every channel. Verified
 * on the deployed bundle 2026-09-17: the Header field on event 7fd4bf79 opens
 * with a value ending in a space. Comparing like against like is the fix.
 */
export function resolveInviteHeader(
  typed: string,
  prefilled: string,
): string | undefined {
  const trimmed = typed.trim()
  // A cleared box is not a header. A blank subject line must never send, and a
  // host who empties the field is asking for the default back, not for nothing.
  if (trimmed === '') return undefined
  // Untouched, including a paste that restores the original text and any edit
  // that only adds surrounding whitespace.
  if (trimmed === prefilled.trim()) return undefined
  return trimmed
}

/**
 * The string the box opens with, with the event name already written into it
 * rather than a {{event_title}} placeholder. The title is trimmed so the host
 * is never shown a stray trailing space they cannot see and cannot remove
 * without the field reporting itself as edited.
 */
export function buildInvitePrefilledHeader(
  title: string,
  alreadyInvited: boolean,
): string {
  const clean = title.trim()
  return alreadyInvited ? `Reminder: ${clean}` : `You're invited: ${clean}`
}
