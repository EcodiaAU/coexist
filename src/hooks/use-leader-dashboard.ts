import { useQuery, keepPreviousData, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchCanonicalImpactRows, composeSummaryMetrics } from '@/lib/impact-query'
import { wallClockNow } from '@/lib/date-format'

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
  // Floating-local: event.date_start is wall-clock-as-UTC. Build `now`
  // and `startOfMonth` in the same wall-clock-as-UTC space so a leader
  // querying at 8pm AEST doesn't see today's morning events still
  // listed under "upcoming" and doesn't have "events this month" miss
  // the first of the month before UTC midnight rolls over.
  const now = wallClockNow()
  const startOfMonth = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0,
  )).toISOString()

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
  // Floating-local cutoff for "cleanup events that have happened" -
  // see fetchLeaderDashboard for the rationale.
  const now = wallClockNow().toISOString()

  const windowEndIso = now
  const [canonical, membersRes, rpcRes] =
    await Promise.all([
      // ONE shared path: canonical rows for this collective (recorded-only,
      // cancelled-excluded, INCLUDING legacy/estimate rows), scoped by the
      // event's primary collective_id - the SAME attribution the insights
      // By-collective table uses. This replaces the old event_hosts +
      // sumMetricWeighted path so the leader-home "Collective Impact" card
      // matches this collective's insights row exactly (Tate's callout).
      fetchCanonicalImpactRows({ collectiveId, effectiveStartIso: null, windowEndIso }),
      supabase.from('collective_members').select('id', { count: 'exact', head: true })
        .eq('collective_id', collectiveId).eq('status', 'active'),
      // leaders_lifetime from the canonical RPC (a leadership counter, not an
      // impact rollup).
      supabase.rpc('get_collective_stats', { p_collective_id: collectiveId }),
    ])

  const eventIds = canonical.eventIds

  const composed = composeSummaryMetrics(canonical.rows, {
    metricKeys: ['trees_planted', 'invasive_weeds_pulled', 'rubbish_kg', 'coastline_cleaned_m'],
    applyNationalBaseline: false,
    effectiveStartIso: null,
    windowEndIso,
  })

  // Cleanup-site count over the in-scope events.
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
    // Canonical "Attendances" = composeSummaryMetrics totalAttendees (from
    // event_impact.attendees), matching insights / home / collective for the
    // same collective. attendanceCount (event_registrations status='attended',
    // app check-ins) is a DIFFERENT figure and is used ONLY for attendanceRate
    // (the sign-in rate %), not for this card.
    eventsAttended:      composed.totalAttendees,
    volunteerHours:      composed.totalEstimatedHours,
    treesPlanted:        composed.metrics['trees_planted']        ?? 0,
    invasiveWeedsPulled: composed.metrics['invasive_weeds_pulled'] ?? 0,
    rubbishKg:           Math.round((composed.metrics['rubbish_kg'] ?? 0) * 10) / 10,
    cleanupSites:        cleanupCount,
    coastlineCleanedM:   Math.round(composed.metrics['coastline_cleaned_m'] ?? 0),
    leadersEmpowered:    (rpcRes.data as Record<string, number> | null)?.leaders_lifetime ?? 0,
    eventsLogged:        composed.totalEvents,
    totalMembers:        membersRes.count ?? 0,
    totalEvents:         composed.totalEvents,
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
  // Floating-local: 30 days ago in viewer-wall-clock space, since the
  // filter compares against event.date_start (wall-clock-as-UTC).
  const thirtyDaysAgo = new Date(wallClockNow().getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

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
  // Floating-local: "past" by viewer wall-clock, not absolute UTC.
  const wcNow = wallClockNow().toISOString()
  const { data: pastEvents } = await supabase
    .from('events')
    .select('id, title, date_start')
    .eq('collective_id', collectiveId)
    .lt('date_start', wcNow)
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

      // Floating-local: caller's `month` Date carries the viewer's
      // wall-clock-month via its local-tz accessors. Build start/end
      // as wall-clock-as-UTC instants so the comparison against
      // events.date_start (wall-clock-as-UTC) lines up day-for-day.
      const start = new Date(Date.UTC(month.getFullYear(), month.getMonth(), 1, 0, 0, 0, 0))
      const end = new Date(Date.UTC(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999))

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
