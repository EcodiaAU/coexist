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

/** The slice of a Supabase auth user that says how the account signs in. */
export interface SignInIdentity {
  app_metadata?: { provider?: string; providers?: unknown } | null
  identities?: { provider?: string }[] | null
}

/**
 * True when the account signs in with Apple. App Review Guideline 4.0 (cited
 * on 2.3.58, 2026-10-22): after Sign in with Apple the app must not ask for
 * the name or email again, because Apple already supplied them. Apple sends the
 * name only on the first authorisation, so a returning Apple ID arrives with
 * none, and the mandatory-last-name rule of 2026-10-19 cannot apply to these
 * accounts. The name Apple did send is saved at sign-in (lib/apple-signin-name).
 */
export function isAppleSignInAccount(user: SignInIdentity | null | undefined): boolean {
  if (!user) return false
  if (user.app_metadata?.provider === 'apple') return true
  const providers = user.app_metadata?.providers
  if (Array.isArray(providers) && providers.includes('apple')) return true
  return (user.identities ?? []).some((i) => i?.provider === 'apple')
}

/**
 * Onboarding asks for a name unless the profile already holds both halves.
 * Never for a Sign in with Apple account (see isAppleSignInAccount).
 */
export function needsNameStep(
  profile: NameProfile | null | undefined,
  opts: { appleSignIn?: boolean } = {},
): boolean {
  if (opts.appleSignIn) return false
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
