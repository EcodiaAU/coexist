import { useQuery, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { sumMetric } from '@/lib/impact-metrics'
import { fetchImpactRows, fetchBaselineSettings } from '@/lib/impact-query'

/* ------------------------------------------------------------------ */
/*  Admin dashboard data hooks                                         */
/* ------------------------------------------------------------------ */

/* ── Date range helpers ── */

export type DateRange = 'week' | 'month' | 'quarter' | 'year' | 'all'

export function getDateRangeStart(range: DateRange): string | null {
  const now = new Date()
  switch (range) {
    case 'week':    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    case 'month':   return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    case 'quarter': return new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString()
    case 'year':    return new Date(now.getFullYear(), 0, 1).toISOString()
    case 'all':     return null
  }
}

export const dateRangeOptions = [
  { value: 'week',    label: 'This Week' },
  { value: 'month',   label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'year',    label: 'This Year' },
  { value: 'all',     label: 'All Time' },
]

/* ── Admin overview ── */

export interface AdminOverviewData {
  totalMembers: number
  totalCollectives: number
  totalEvents: number
  totalAttendees: number
  totalTrees: number
  totalHours: number
  totalRubbish: number
  totalLeadersEmpowered: number
  periodMembers: number
  periodEvents: number
}

/**
 * Admin overview stats - optionally scoped to a single collective.
 *
 * Scope handling:
 * - collectiveId='' / undefined → national (all collectives), baseline applied when all-time
 * - collectiveId=<uuid>         → that collective only, NEVER apply national baseline
 *   (baseline constants are national totals and wouldn't make sense added to one
 *   collective's numbers - would double-attribute history).
 *
 * Member/collective counts stay national regardless of scope because they're
 * not impact-scoped (a member belongs to the app, not a single collective).
 */
async function fetchAdminOverview(dateRange: DateRange, collectiveId?: string): Promise<AdminOverviewData> {
  const rangeStart = getDateRangeStart(dateRange)
  const isAllTime = dateRange === 'all'
  const scopedToCollective = !!collectiveId
  const now = new Date().toISOString()

  // Events-count query is scope-aware: collective filter is applied when set.
  const eventsCountQueryBase = supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .in('status', ['published', 'completed'])
    .lt('date_start', now)

  const scopedEventsCount = collectiveId
    ? eventsCountQueryBase.eq('collective_id', collectiveId)
    : eventsCountQueryBase

  const [{ rows, eventCount }, baseline, membersRes, collectivesRes, leadersRes, periodMembersRes, periodEventsRes] =
    await Promise.all([
      fetchImpactRows({
        collectiveId,
        timeRange: isAllTime ? 'all-time' : 'custom',
        rangeStart: rangeStart ?? undefined,
      }),
      // Baselines are national all-time constants - only apply when we're ACTUALLY
      // asking for the national all-time view. Never add them to a single-collective
      // view (they're not that collective's history) and never when a date range
      // cuts off pre-2026 data.
      isAllTime && !scopedToCollective ? fetchBaselineSettings() : Promise.resolve(null),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('collectives').select('id', { count: 'exact', head: true }).eq('is_active', true).neq('is_national', true),
      supabase.from('app_settings').select('value').eq('key', 'leaders_empowered_total').single(),
      rangeStart
        ? supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', rangeStart)
        : Promise.resolve({ count: 0, error: null }),
      rangeStart
        ? (collectiveId
            ? supabase.from('events').select('id', { count: 'exact', head: true })
                .eq('collective_id', collectiveId)
                .gte('date_start', rangeStart).lt('date_start', now)
            : supabase.from('events').select('id', { count: 'exact', head: true })
                .gte('date_start', rangeStart).lt('date_start', now))
        : scopedEventsCount,
    ])

  if (membersRes.error) throw membersRes.error
  if (collectivesRes.error) throw collectivesRes.error

  const b = baseline ?? { attendees: 0, events: 0, trees: 0, rubbishKg: 0, hours: 0 }
  const addBaseline = isAllTime && !scopedToCollective

  return {
    totalMembers:      membersRes.count ?? 0,
    totalCollectives:  collectivesRes.count ?? 0,
    totalEvents:       eventCount                                        + (addBaseline ? b.events    : 0),
    totalAttendees:    Math.round(sumMetric(rows, 'attendees'))          + (addBaseline ? b.attendees : 0),
    totalTrees:        sumMetric(rows, 'trees_planted')                  + (addBaseline ? b.trees     : 0),
    totalHours:        Math.round(sumMetric(rows, 'hours_total'))        + (addBaseline ? b.hours     : 0),
    totalRubbish:      Math.round(sumMetric(rows, 'rubbish_kg')          + (addBaseline ? b.rubbishKg : 0)),
    totalLeadersEmpowered: (leadersRes.data?.value as { count?: number })?.count ?? 0,
    periodMembers:     periodMembersRes.count ?? 0,
    periodEvents:      periodEventsRes.count ?? 0,
  }
}

export function useAdminOverview(dateRange: DateRange, collectiveId?: string) {
  return useQuery({
    queryKey: ['admin-overview', dateRange, collectiveId ?? 'all'],
    queryFn: () => fetchAdminOverview(dateRange, collectiveId),
    staleTime: 2 * 60 * 1000,
  })
}

export function prefetchAdminOverview(queryClient: QueryClient, dateRange: DateRange = 'all', collectiveId?: string) {
  return queryClient.prefetchQuery({
    queryKey: ['admin-overview', dateRange, collectiveId ?? 'all'],
    queryFn: () => fetchAdminOverview(dateRange, collectiveId),
    staleTime: 2 * 60 * 1000,
  })
}

/* ── Trend data ── */

export interface TrendMonth {
  month: string
  members: number
  events: number
}

async function fetchTrendData(): Promise<TrendMonth[]> {
  const now = new Date()

  const ranges = Array.from({ length: 6 }, (_, idx) => {
    const i = 5 - idx
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)
    const monthLabel = start.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })
    return { start, end, monthLabel }
  })

  const results = await Promise.all(
    ranges.map(async ({ start, end, monthLabel }) => {
      const [membersRes, eventsRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true })
          .gte('created_at', start.toISOString()).lte('created_at', end.toISOString()),
        supabase.from('events').select('id', { count: 'exact', head: true })
          .gte('date_start', start.toISOString())
          .lte('date_start', new Date(Math.min(end.getTime(), now.getTime())).toISOString()),
      ])
      return { month: monthLabel, members: membersRes.count ?? 0, events: eventsRes.count ?? 0 }
    }),
  )

  return results
}

export function useTrendData() {
  return useQuery({
    queryKey: ['admin-trends'],
    queryFn: fetchTrendData,
    staleTime: 10 * 60 * 1000,
  })
}

export function prefetchTrendData(queryClient: QueryClient) {
  return queryClient.prefetchQuery({
    queryKey: ['admin-trends'],
    queryFn: fetchTrendData,
    staleTime: 10 * 60 * 1000,
  })
}
