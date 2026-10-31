import { supabase } from '@/lib/supabase'
import { isPlaceholderDisplayName } from '@/lib/onboarding-name'

/**
 * Sign in with Apple hands us the person's name, so the app must not ask for
 * it again (App Review Guideline 4.0, cited on 2.3.58 on 2026-10-22).
 *
 * Apple sends the name ONLY on the first authorisation of this app by that
 * Apple ID; every later sign-in returns null, and the ID token never carries
 * it. So we save whatever arrives, never overwrite a name with nothing, and
 * onboarding skips the name step for an Apple account whether or not a name
 * arrived (see isAppleSignInAccount in onboarding-name.ts).
 */

export interface AppleCredentialName {
  firstName: string
  lastName: string
}

const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** The name from a @capgo/capacitor-social-login Apple result profile, or null. */
export function readAppleCredentialName(profile: unknown): AppleCredentialName | null {
  if (!profile || typeof profile !== 'object') return null
  const p = profile as Record<string, unknown>
  const firstName = clean(p.givenName)
  const lastName = clean(p.familyName)
  if (!firstName && !lastName) return null
  return { firstName, lastName }
}

/**
 * The profile columns to write for a name Apple supplied: only halves the
 * profile does not already hold, and the display name only while it is still
 * a default we filled in (the private-relay local part or "New User").
 */
export function appleNamePatch(
  current: { first_name?: string | null; last_name?: string | null; display_name?: string | null } | null,
  name: AppleCredentialName,
  email: string | null,
): Record<string, string> {
  const patch: Record<string, string> = {}
  if (name.firstName && !clean(current?.first_name)) patch.first_name = name.firstName
  if (name.lastName && !clean(current?.last_name)) patch.last_name = name.lastName
  const shown = name.firstName || name.lastName
  if (shown && isPlaceholderDisplayName(current?.display_name, email)) patch.display_name = shown
  return patch
}

/** Write the Apple-supplied name onto the member's own profile row. */
export async function saveAppleCredentialName(
  userId: string,
  name: AppleCredentialName,
  email: string | null,
): Promise<void> {
  const { data: current, error: readError } = await supabase
    .from('profiles')
    .select('first_name, last_name, display_name')
    .eq('id', userId)
    .maybeSingle()
  if (readError) throw readError
  const patch = appleNamePatch(current, name, email)
  if (Object.keys(patch).length === 0) return
  const { error } = await supabase
    .from('profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw error
}
