/**
 * What onboarding knows about a new member's name, and whether it must ask.
 *
 * Two jobs, both from 2026-10-19:
 *
 * 1. Last name is mandatory when creating an account (Jess Ditchfield via
 *    Tate). The email sign-up form now asks for it, but Google and Apple
 *    sign-ups never see that form, so onboarding asks anyone still missing
 *    either half.
 *
 * 2. A default is not a name. handle_new_user falls back to the email's local
 *    part when the provider sends no name, and Sign in with Apple sends none,
 *    so an Apple member became "bk2pv6nhy2" (their private-relay address) and
 *    onboarding, seeing a non-empty display name, never asked. Measured on
 *    2026-10-19: 257 of 638 Apple accounts, 90 of them in the last 30 days,
 *    and that is most of what read to Co-Exist staff as fake names.
 */

/** The literal the profile-bootstrap fallback in use-auth writes. */
export const NEW_USER_FALLBACK = 'New User'

export interface NameProfile {
  display_name?: string | null
  first_name?: string | null
  last_name?: string | null
}

const clean = (s: string | null | undefined) => (s ?? '').trim()

/** True when a display name is a default we filled in, not one a person chose. */
export function isPlaceholderDisplayName(displayName: string | null | undefined, email: string | null | undefined): boolean {
  const dn = clean(displayName)
  if (!dn || dn === NEW_USER_FALLBACK) return true
  const local = clean(email).split('@')[0]
  return !!local && dn.toLowerCase() === local.toLowerCase()
}

/** Onboarding asks for a name unless the profile already holds both halves. */
export function needsNameStep(profile: NameProfile | null | undefined): boolean {
  return !clean(profile?.first_name) || !clean(profile?.last_name)
}

/**
 * Pre-fill for the name step. Real first/last win; otherwise a real display
 * name (Google sends "Jess Ditchfield") is split on its first space. A
 * placeholder pre-fills nothing, so an Apple member is not handed their own
 * relay address to confirm.
 */
export function initialNameParts(
  profile: NameProfile | null | undefined,
  email: string | null | undefined,
): { firstName: string; lastName: string } {
  let firstName = clean(profile?.first_name)
  let lastName = clean(profile?.last_name)
  const dn = clean(profile?.display_name)
  if ((!firstName || !lastName) && !isPlaceholderDisplayName(dn, email)) {
    const [head, ...rest] = dn.split(/\s+/)
    if (!firstName) firstName = head ?? ''
    if (!lastName && rest.length > 0) lastName = rest.join(' ')
  }
  return { firstName, lastName }
}
