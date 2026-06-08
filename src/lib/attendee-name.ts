/**
 * Canonical attendee name.
 *
 * Origin: Tate 2026-06-08, Co-Exist team meeting. "Attendees display name needs
 * to be their First and Last name and both shown everywhere (shrunk if long,
 * not truncated) so leaders can tell different people with the same first name
 * apart."
 *
 * Leaders disambiguate people by full name, so attendee-facing surfaces show
 * "First Last", falling back to display_name (a self-chosen handle) only when
 * the real name is missing. Pair with <FitText> to shrink long names to fit
 * rather than truncating them with an ellipsis.
 */

export interface NameParts {
  first_name?: string | null
  last_name?: string | null
  display_name?: string | null
}

/**
 * "First Last" for an attendee. Falls back to display_name, then a supplied
 * fallback (default "Unknown"). Trims and collapses so a missing half doesn't
 * leave a dangling space.
 */
export function attendeeName(
  p: NameParts | null | undefined,
  fallback = 'Unknown',
): string {
  if (!p) return fallback
  const full = [p.first_name, p.last_name]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(' ')
  if (full) return full
  const dn = (p.display_name ?? '').trim()
  return dn || fallback
}
