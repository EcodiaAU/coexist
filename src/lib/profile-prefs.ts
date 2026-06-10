import { supabase } from '@/lib/supabase'

/**
 * Safely patch a user's notification_preferences JSONB column.
 *
 * Why this exists: two settings pages (/settings/privacy, /settings/notifications)
 * both write to the same notification_preferences JSONB. A naive
 * `.update({ notification_preferences: <whole object> })` replaces the entire
 * JSONB, which meant one page could silently wipe the other's fields.
 *
 * The concrete bug: users setting profile_visible=false on /settings/privacy
 * would later find it flipped back to true after visiting /settings/notifications
 * - because the notifications page initialised profileVisible=true locally,
 * then wrote the full JSONB with that default before the hydration effect had
 * replaced it with the real DB value.
 *
 * This helper fetches the current JSONB, shallow-merges the patch, and writes
 * back. Single source of truth for both pages.
 *
 * Race note: if two tabs are open on the same user, last-write-wins. Rare in a
 * mobile app and not worse than the old bug.
 */
export async function patchNotificationPrefs(
  userId: string,
  patch: Record<string, unknown>,
): Promise<{ error: Error | null }> {
  try {
    const { data, error: fetchErr } = await supabase
      .from('profiles')
      .select('notification_preferences')
      .eq('id', userId)
      .single()
    if (fetchErr) return { error: fetchErr }

    const current = (data?.notification_preferences ?? {}) as Record<string, unknown>
    const merged = { ...current, ...patch }

    const { error: writeErr } = await supabase
      .from('profiles')
      .update({ notification_preferences: merged } as unknown as Record<string, unknown>)
      .eq('id', userId)
    return { error: writeErr }
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) }
  }
}
