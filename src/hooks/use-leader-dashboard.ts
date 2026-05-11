import { useQuery, keepPreviousData, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { sumMetricWeighted } from '@/lib/impact-metrics'
import { fetchImpactRows } from '@/lib/impact-query'

/* ------------------------------------------------------------------ */
/*  Leader dashboard data hooks                                        */
/*                                                                     */
/*  Extracted from pages/leader/index.tsx so they can be reused for    */
/*  data prefetching. Each hook has a corresponding prefetch function.  */
/* ------------------------------------------------------------------ */

/* ── Dashboard overview ── */

interface UpcomingEvent {
  id: string
  title: string
  date_start: string
  address: string | null
  cover_image_url: string | null
  check_in_code: string | null
}

interface RecentMember {
  id: string
  user_id: string
  joined_at: string
  profiles: { display_name: string | null; avatar_url: string | null } | null
}

export interface LeaderDashboardData {
  activeMembers: number
  upcomingEvents: UpcomingEvent[]
  eventsThisMonth: number
  hoursThisMonth: number
  recentMembers: RecentMember[]
  attendanceRate: number
}

interface ImpactRow {
  hours_total: number
  events?: Record<string, unknown>
  [key: string]: unknown
}

interface PastEventRow {
  id: string
  title?: string
  date_start?: string
}

async function fetchLeaderDashboard(collectiveId: string): Promise<LeaderDashboardData> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [
    membersRes,
    upcomingEventsRes,
    monthEventsRes,
    monthHoursRes,
    recentActivityRes,
  ] = await Promise.all([
    supabase
      .from('collective_members')
      .select('id', { count: 'exact', head: true })
      .eq('collective_id', collectiveId)
      .eq('status', 'active'),
    supabase
      .from('events')
      .select('id, title, date_start, address, cover_image_url, check_in_code')
      .eq('collective_id', collectiveId)
      .gte('date_start', now.toISOString())
      .neq('status', 'cancelled')
      .neq('status', 'draft')
      .order('date_start', { ascending: true })
      .limit(5),
    supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('collective_id', collectiveId)
      .gte('date_start', startOfMonth),
    supabase
      .from('event_impact')
      .select('hours_total, events!inner(collective_id)')
      .eq('events.collective_id', collectiveId)
      .gte('logged_at', startOfMonth),
    supabase
      .from('collective_members')
      .select('id, user_id, joined_at, profiles(display_name, avatar_url)')
      .eq('collective_id', collectiveId)
      .eq('status', 'active')
      .order('joined_at', { ascending: false })
      .limit(5),
  ])

  const totalHours = ((monthHoursRes.data ?? []) as unknown as ImpactRow[]).reduce(
    (sum: number, row) => sum + (row.hours_total ?? 0),
    0,
  )

  const { data: allEventIds } = await supabase
    .from('events')
    .select('id')
    .eq('collective_id', collectiveId)
    .lt('date_start', now.toISOString())

  let attendanceRate = 0
  const eventIds = (allEventIds ?? []).map((e) => e.id)

  if (eventIds.length > 0) {
    const { count: totalReg } = await supabase
      .from('event_registrations')
      .select('id', { count: 'exact', head: true })
      .in('event_id', eventIds)
      .in('status', ['registered', 'attended'])

    const { count: totalAttended } = await supabase
      .from('event_registrations')
      .select('id', { count: 'exact', head: true })
      .in('event_id', eventIds)
      .eq('status', 'attended')

    if (totalReg && totalReg > 0) {
      attendanceRate = Math.round(((totalAttended ?? 0) / totalReg) * 100)
    }
  }

  return {
    activeMembers: membersRes.count ?? 0,
    upcomingEvents: (upcomingEventsRes.data ?? []) as unknown as UpcomingEvent[],
    eventsThisMonth: monthEventsRes.count ?? 0,
    hoursThisMonth: Math.round(totalHours),
    recentMembers: (recentActivityRes.data ?? []) as unknown as RecentMember[],
    attendanceRate,
  }
}

export function useLeaderDashboard(collectiveId: string | undefined) {
  return useQuery({
    queryKey: ['leader-dashboard', collectiveId],
    queryFn: () => fetchLeaderDashboard(collectiveId!),
    enabled: !!collectiveId,
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

export function prefetchLeaderDashboard(queryClient: QueryClient, collectiveId: string) {
  return queryClient.prefetchQuery({
    queryKey: ['leader-dashboard', collectiveId],
    queryFn: () => fetchLeaderDashboard(collectiveId),
    staleTime: 2 * 60 * 1000,
  })
}

/* ── Full impact stats ── */

export interface CollectiveFullStats {
  eventsAttended: number
  volunteerHours: number
  treesPlanted: number
  invasiveWeedsPulled: number
  rubbishKg: number
  cleanupSites: number
  coastlineCleanedM: number
  leadersEmpowered: number
  eventsLogged: number
  totalMembers: number
  totalEvents: number
  attendanceRate: number
}

async function fetchCollectiveFullStats(collectiveId: string): Promise<CollectiveFullStats | null> {
  const now = new Date().toISOString()

  const [{ rows, legacyRows, eventIds, eventCount, shareByEventId }, membersRes, rpcRes] =
    await Promise.all([
      // All-time: include legacy rows for full historical picture. fetchImpactRows
      // already resolves via event_hosts internally.
      fetchImpactRows({ collectiveId, timeRange: 'all-time', includeLegacy: true }),
      supabase.from('collective_members').select('id', { count: 'exact', head: true })
        .eq('collective_id', collectiveId).eq('status', 'active'),
      // leaders_lifetime from canonical RPC replaces the stale app_settings counter
      // (migration 20260511000000 adds leaders_current + leaders_lifetime to the RPC).
      supabase.rpc('get_collective_stats', { p_collective_id: collectiveId }),
    ])

  // Cleanup-site count uses the same event id set as the impact rollup so it
  // includes co-hosted events. eventIds is already host-scoped.
  let cleanupCount = 0
  if (eventIds.length > 0) {
    const { count } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .in('id', eventIds)
      .eq('activity_type', 'clean_up')
      .lt('date_start', now)
    cleanupCount = count ?? 0
  }

  const allRows = [...rows, ...legacyRows] as Record<string, unknown>[]

  // Multi-host aware sum: each row contributes only this collective's share so
  // co-hosted events don't double-count when summed across collectives.
  const sumW = (key: string) => sumMetricWeighted(allRows, key, shareByEventId)

  let attendanceCount = 0
  let attendanceRate = 0
  if (eventIds.length > 0) {
    const [{ count: totalReg }, { count: totalAttended }] = await Promise.all([
      supabase.from('event_registrations').select('id', { count: 'exact', head: true })
        .in('event_id', eventIds).in('status', ['registered', 'attended']),
      supabase.from('event_registrations').select('id', { count: 'exact', head: true })
        .in('event_id', eventIds).eq('status', 'attended'),
    ])
    attendanceCount = totalAttended ?? 0
    if (totalReg && totalReg > 0) {
      attendanceRate = Math.round(((totalAttended ?? 0) / totalReg) * 100)
    }
  }

  return {
    eventsAttended:      attendanceCount,
    volunteerHours:      Math.round(sumW('hours_total')),
    treesPlanted:        sumW('trees_planted'),
    invasiveWeedsPulled: sumW('invasive_weeds_pulled'),
    rubbishKg:           Math.round(sumW('rubbish_kg') * 10) / 10,
    cleanupSites:        cleanupCount,
    coastlineCleanedM:   Math.round(sumW('coastline_cleaned_m')),
    leadersEmpowered:    (rpcRes.data as Record<string, number> | null)?.leaders_lifetime ?? 0,
    eventsLogged:        eventCount,
    totalMembers:        membersRes.count ?? 0,
    totalEvents:         eventCount,
    attendanceRate,
  }
}

export function useCollectiveFullStats(collectiveId: string | undefined) {
  return useQuery({
    queryKey: ['leader-impact-full', collectiveId],
    queryFn: () => fetchCollectiveFullStats(collectiveId!),
    enabled: !!collectiveId,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

export function prefetchCollectiveFullStats(queryClient: QueryClient, collectiveId: string) {
  return queryClient.prefetchQuery({
    queryKey: ['leader-impact-full', collectiveId],
    queryFn: () => fetchCollectiveFullStats(collectiveId),
    staleTime: 5 * 60 * 1000,
  })
}

/* ── Engagement scores ── */

async function fetchEngagementScores(collectiveId: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: recentEvents } = await supabase
    .from('events')
    .select('id')
    .eq('collective_id', collectiveId)
    .gte('date_start', thirtyDaysAgo)

  const recentEventIds = (recentEvents ?? []).map((e: { id: string }) => e.id)

  let activeUserIds = new Set<string>()
  if (recentEventIds.length > 0) {
    const { data: activeMembers } = await supabase
      .from('event_registrations')
      .select('user_id')
      .in('event_id', recentEventIds)
      .in('status', ['attended', 'registered'])

    activeUserIds = new Set((activeMembers ?? []).map((r) => r.user_id))
  }

  const { data: allMembers } = await supabase
    .from('collective_members')
    .select('user_id, profiles(display_name, avatar_url)')
    .eq('collective_id', collectiveId)
    .eq('status', 'active')

  const members = allMembers ?? []
  const active = members.filter((m) => activeUserIds.has(m.user_id))
  const atRisk = members.filter((m) => !activeUserIds.has(m.user_id))

  return { active, atRisk, total: members.length }
}

export function useEngagementScores(collectiveId: string | undefined) {
  return useQuery({
    queryKey: ['leader-engagement', collectiveId],
    queryFn: () => fetchEngagementScores(collectiveId!),
    enabled: !!collectiveId,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

export function prefetchEngagementScores(queryClient: QueryClient, collectiveId: string) {
  return queryClient.prefetchQuery({
    queryKey: ['leader-engagement', collectiveId],
    queryFn: () => fetchEngagementScores(collectiveId),
    staleTime: 5 * 60 * 1000,
  })
}

/* ── Pending items ── */

async function fetchPendingItems(collectiveId: string) {
  const { data: pastEvents } = await supabase
    .from('events')
    .select('id, title, date_start')
    .eq('collective_id', collectiveId)
    .lt('date_start', new Date().toISOString())
    .neq('status', 'cancelled')
    .neq('status', 'draft')
    .order('date_start', { ascending: false })
    .limit(10)

  const events = (pastEvents ?? []) as unknown as PastEventRow[]
  if (!events.length) return []

  const { data: loggedEvents } = await supabase
    .from('event_impact')
    .select('event_id')
    .in(
      'event_id',
      events.map((e) => e.id),
    )

  const loggedIds = new Set(((loggedEvents ?? []) as unknown as { event_id: string }[]).map((l) => l.event_id))
  return events
    .filter((e) => !loggedIds.has(e.id))
    .map((e) => ({
      id: e.id,
      type: 'impact_not_logged' as const,
      message: `Impact not logged for "${e.title}"`,
      date: e.date_start,
    }))
}

export function usePendingItems(collectiveId: string | undefined) {
  return useQuery({
    queryKey: ['leader-pending', collectiveId],
    queryFn: () => fetchPendingItems(collectiveId!),
    enabled: !!collectiveId,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

export function prefetchPendingItems(queryClient: QueryClient, collectiveId: string) {
  return queryClient.prefetchQuery({
    queryKey: ['leader-pending', collectiveId],
    queryFn: () => fetchPendingItems(collectiveId),
    staleTime: 5 * 60 * 1000,
  })
}

/* ── Calendar ── */

interface CalendarEvent {
  id: string
  title: string
  date_start: string
}

export function useEventCalendar(collectiveId: string | undefined, month: Date) {
  return useQuery({
    queryKey: ['leader-calendar', collectiveId, month.toISOString()],
    queryFn: async () => {
      if (!collectiveId) return []

      const start = new Date(month.getFullYear(), month.getMonth(), 1)
      const end = new Date(month.getFullYear(), month.getMonth() + 1, 0)

      const { data, error } = await supabase
        .from('events')
        .select('id, title, date_start')
        .eq('collective_id', collectiveId)
        .gte('date_start', start.toISOString())
        .lte('date_start', end.toISOString())
      if (error) throw error

      return (data ?? []) as unknown as CalendarEvent[]
    },
    enabled: !!collectiveId,
    staleTime: 5 * 60 * 1000,
  })
}
