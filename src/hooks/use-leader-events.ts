import { useQuery, keepPreviousData, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database.types'

type Event = Tables<'events'>

export interface LeaderEvent {
  id: string
  title: string
  date_start: Event['date_start']
  date_end: Event['date_end']
  address: Event['address']
  cover_image_url: Event['cover_image_url']
  activity_type: Event['activity_type']
  status: Event['status']
  event_registrations: { count: number }[]
  checked_in_count: number
  /** Names of *other* host collectives (excluding the current scope). Empty when not co-hosted. */
  cohost_names: string[]
}

/* ------------------------------------------------------------------ */
/*  Leader events page hooks                                           */
/*                                                                     */
/*  Extracted from pages/leader/events.tsx for reuse + prefetch.       */
/* ------------------------------------------------------------------ */

/* ── Collective events list ── */

async function fetchLeaderCollectiveEvents(collectiveId: string, filter: string) {
  const now = new Date().toISOString()

  // Resolve via event_hosts so co-hosted events show up in the leader's list
  // too - not just events where this collective is the primary host. Two-step
  // (event_hosts → ids → events) is used instead of an embedded join because
  // PostgREST FK inference through a view isn't reliable for filtering.
  const { data: hostRows } = await supabase
    .from('event_hosts')
    .select('event_id')
    .eq('collective_id', collectiveId)
  const candidateIds = (hostRows ?? [])
    .map((r) => r.event_id)
    .filter((id): id is string => !!id)
  if (candidateIds.length === 0) return [] as LeaderEvent[]

  let eventsQ = supabase
    .from('events')
    .select('id, title, date_start, date_end, address, cover_image_url, activity_type, status, event_registrations(count)')
    .in('id', candidateIds)
    .order('date_start', { ascending: filter === 'upcoming' })

  if (filter === 'upcoming') {
    eventsQ = eventsQ.gte('date_start', now)
      .neq('status', 'draft').neq('status', 'cancelled')
  } else if (filter === 'past') {
    eventsQ = eventsQ.lt('date_start', now)
      .neq('status', 'draft').neq('status', 'cancelled')
  } else if (filter === 'draft') {
    eventsQ = eventsQ.eq('status', 'draft')
  }

  const { data: events } = await eventsQ.limit(50)
  if (!events?.length) return [] as LeaderEvent[]

  const eventIds = events.map((e) => e.id)

  // Co-host names: pull every (event_id, collective_id) → name and bucket per
  // event, excluding the collective whose page we're on.
  const [{ data: checkedInRows }, { data: hostNameRows }] = await Promise.all([
    supabase
      .from('event_registrations')
      .select('event_id')
      .in('event_id', eventIds)
      .not('checked_in_at', 'is', null),
    supabase
      .from('event_hosts')
      .select('event_id, collectives:collective_id(id, name)')
      .in('event_id', eventIds),
  ])

  const checkedInMap = new Map<string, number>()
  for (const row of checkedInRows ?? []) {
    checkedInMap.set(row.event_id, (checkedInMap.get(row.event_id) ?? 0) + 1)
  }

  type HostNameRow = { event_id: string; collectives: { id: string; name: string } | null }
  const cohostsByEvent = new Map<string, string[]>()
  for (const row of (hostNameRows ?? []) as unknown as HostNameRow[]) {
    if (!row.collectives) continue
    if (row.collectives.id === collectiveId) continue
    const list = cohostsByEvent.get(row.event_id) ?? []
    list.push(row.collectives.name)
    cohostsByEvent.set(row.event_id, list)
  }

  return events.map((e) => ({
    ...e,
    checked_in_count: checkedInMap.get(e.id) ?? 0,
    cohost_names: cohostsByEvent.get(e.id) ?? [],
  })) as LeaderEvent[]
}

export function useLeaderCollectiveEvents(collectiveId: string | undefined, filter: string) {
  return useQuery({
    queryKey: ['leader-events', collectiveId, filter],
    queryFn: () => fetchLeaderCollectiveEvents(collectiveId!, filter),
    enabled: !!collectiveId,
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

export function prefetchLeaderCollectiveEvents(queryClient: QueryClient, collectiveId: string) {
  return queryClient.prefetchQuery({
    queryKey: ['leader-events', collectiveId, 'upcoming'],
    queryFn: () => fetchLeaderCollectiveEvents(collectiveId, 'upcoming'),
    staleTime: 2 * 60 * 1000,
  })
}

/* ── Event stats ── */

export interface LeaderEventStats {
  total: number
  upcoming: number
  past: number
  drafts: number
}

async function fetchEventStats(collectiveId: string): Promise<LeaderEventStats> {
  const now = new Date().toISOString()

  // Host-aware: collect every event id this collective hosts (primary or
  // co-host), then run separate count queries against the events table.
  const { data: hostRows } = await supabase
    .from('event_hosts')
    .select('event_id')
    .eq('collective_id', collectiveId)
  const ids = (hostRows ?? [])
    .map((r) => r.event_id)
    .filter((id): id is string => !!id)
  if (ids.length === 0) return { total: 0, upcoming: 0, past: 0, drafts: 0 }

  const [upcomingRes, pastRes, draftRes] = await Promise.all([
    supabase.from('events').select('id', { count: 'exact', head: true })
      .in('id', ids).gte('date_start', now)
      .neq('status', 'draft').neq('status', 'cancelled'),
    supabase.from('events').select('id', { count: 'exact', head: true })
      .in('id', ids).lt('date_start', now)
      .neq('status', 'draft').neq('status', 'cancelled'),
    supabase.from('events').select('id', { count: 'exact', head: true })
      .in('id', ids).eq('status', 'draft'),
  ])

  return {
    total: ids.length,
    upcoming: upcomingRes.count ?? 0,
    past: pastRes.count ?? 0,
    drafts: draftRes.count ?? 0,
  }
}

export function useLeaderEventStats(collectiveId: string | undefined) {
  return useQuery({
    queryKey: ['leader-event-stats', collectiveId],
    queryFn: () => fetchEventStats(collectiveId!),
    enabled: !!collectiveId,
    staleTime: 2 * 60 * 1000,
  })
}

export function prefetchLeaderEventStats(queryClient: QueryClient, collectiveId: string) {
  return queryClient.prefetchQuery({
    queryKey: ['leader-event-stats', collectiveId],
    queryFn: () => fetchEventStats(collectiveId),
    staleTime: 2 * 60 * 1000,
  })
}
