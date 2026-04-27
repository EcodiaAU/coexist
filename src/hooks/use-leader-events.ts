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
  // too — not just events where this collective is the primary host.
  let hostsQ = supabase
    .from('event_hosts')
    .select(
      'event_id, events!inner(id, title, date_start, date_end, address, cover_image_url, activity_type, status, event_registrations(count))',
    )
    .eq('collective_id', collectiveId)
    .order('events(date_start)', { ascending: filter === 'upcoming' })

  if (filter === 'upcoming') {
    hostsQ = hostsQ.gte('events.date_start', now)
      .neq('events.status', 'draft').neq('events.status', 'cancelled')
  } else if (filter === 'past') {
    hostsQ = hostsQ.lt('events.date_start', now)
      .neq('events.status', 'draft').neq('events.status', 'cancelled')
  } else if (filter === 'draft') {
    hostsQ = hostsQ.eq('events.status', 'draft')
  }

  const { data: hostRows } = await hostsQ.limit(50)
  if (!hostRows?.length) return [] as LeaderEvent[]

  type HostRow = {
    event_id: string
    events: {
      id: string
      title: string
      date_start: string
      date_end: string | null
      address: string | null
      cover_image_url: string | null
      activity_type: Event['activity_type']
      status: Event['status']
      event_registrations: { count: number }[]
    }
  }
  const events = (hostRows as unknown as HostRow[]).map((r) => r.events)
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

  // Host-aware: count via event_hosts so co-hosted events also appear in the
  // leader's stats.
  const [totalRes, upcomingRes, pastRes, draftRes] = await Promise.all([
    supabase.from('event_hosts').select('event_id', { count: 'exact', head: true })
      .eq('collective_id', collectiveId),
    supabase.from('event_hosts').select('event_id, events!inner(date_start, status)', { count: 'exact', head: true })
      .eq('collective_id', collectiveId).gte('events.date_start', now)
      .neq('events.status', 'draft').neq('events.status', 'cancelled'),
    supabase.from('event_hosts').select('event_id, events!inner(date_start, status)', { count: 'exact', head: true })
      .eq('collective_id', collectiveId).lt('events.date_start', now)
      .neq('events.status', 'draft').neq('events.status', 'cancelled'),
    supabase.from('event_hosts').select('event_id, events!inner(status)', { count: 'exact', head: true })
      .eq('collective_id', collectiveId).eq('events.status', 'draft'),
  ])

  return {
    total: totalRes.count ?? 0,
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
