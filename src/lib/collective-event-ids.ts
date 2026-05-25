import { supabase } from '@/lib/supabase'

/**
 * Returns every event_id for which the given collective is a host - either
 * the primary (events.collective_id) or an accepted co-host
 * (collective_event_collaborators.status='accepted').
 *
 * Backed by the public.event_hosts view (security_invoker, inherits RLS),
 * so the result is the same set of events the user is allowed to see via
 * the underlying tables.
 *
 * Origin: Jess 2026-05-25 P1 - "event hosted by two collectives only shows
 * up under 1". Pre-existing leader/admin hooks already routed through
 * event_hosts; the public/member-facing surfaces (collective detail,
 * discover filter, home next-event, home collective carousel) were still
 * filtering on events.collective_id only and silently dropped co-hosted
 * events from any collective that wasn't the primary.
 *
 * Returns null when the input collectiveId is falsy so callers can short-
 * circuit on enabled-guards. Returns [] when the collective genuinely
 * hosts nothing - distinct from "no input yet".
 */
export async function fetchEventIdsForCollective(
  collectiveId: string | null | undefined,
): Promise<string[] | null> {
  if (!collectiveId) return null
  const { data, error } = await supabase
    .from('event_hosts')
    .select('event_id')
    .eq('collective_id', collectiveId)
  if (error) throw error
  const ids = (data ?? [])
    .map((r) => r.event_id as string | null)
    .filter((id): id is string => !!id)
  return Array.from(new Set(ids))
}

/**
 * Multi-collective variant. Returns the union of event ids hosted by ANY of
 * the supplied collective ids (primary or accepted co-host). Used by
 * useCollectiveUpcomingEvents which spans all of the user's collectives.
 */
export async function fetchEventIdsForCollectives(
  collectiveIds: string[],
): Promise<string[]> {
  if (collectiveIds.length === 0) return []
  const { data, error } = await supabase
    .from('event_hosts')
    .select('event_id')
    .in('collective_id', collectiveIds)
  if (error) throw error
  const ids = (data ?? [])
    .map((r) => r.event_id as string | null)
    .filter((id): id is string => !!id)
  return Array.from(new Set(ids))
}
