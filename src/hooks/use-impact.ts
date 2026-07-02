import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  fetchImpactRows,
  fetchBaselineSettings,
  fetchCanonicalImpactRows,
  composeSummaryMetrics,
  BASELINE_TREES,
  BASELINE_RUBBISH_KG,
  BASELINE_EVENTS,
  BASELINE_ATTENDEES,
  BASELINE_HOURS,
} from '@/lib/impact-query'
import { useAuth } from '@/hooks/use-auth'

/**
 * The metric keys THE RULE aggregates for the canonical-impact shape. Passed to
 * composeSummaryMetrics so the shared path (same as /admin/insights) produces
 * every field these surfaces render.
 */
const CANONICAL_METRIC_KEYS = [
  'trees_planted', 'rubbish_kg', 'invasive_weeds_pulled', 'coastline_cleaned_m',
]

/** Window start for a coarse time range (all-time = open; current-year = Jan 1). */
function rangeStartIso(timeRange: 'all-time' | 'current-year'): string | null {
  if (timeRange === 'all-time') return null
  return new Date(new Date().getFullYear(), 0, 1).toISOString()
}

/* ------------------------------------------------------------------ */
/*  Canonical impact shape                                             */
/* ------------------------------------------------------------------ */

export interface CanonicalImpact {
  eventsAttended: number
  volunteerHours: number
  eventsHeld: number
  treesPlanted: number
  invasiveWeedsPulled: number
  rubbishCollectedKg: number
  cleanupSites: number
  coastlineCleanedM: number
  collectivesCount: number
  leadersEmpowered: number
}

export interface NationalImpact extends CanonicalImpact {
  totalMembers: number
}

type TimeRange = 'all-time' | 'current-year'

/* ------------------------------------------------------------------ */
/*  National impact                                                    */
/* ------------------------------------------------------------------ */

export function useNationalImpact(timeRange: TimeRange = 'all-time') {
  return useQuery({
    queryKey: ['national-impact', timeRange],
    queryFn: async (): Promise<NationalImpact> => {
      const isAllTime = timeRange === 'all-time'
      const effectiveStartIso = rangeStartIso(timeRange)
      const windowEndIso = new Date().toISOString()

      // ONE shared path: fetch canonical rows + compose via the SAME max-rule
      // function /admin/insights uses, so the homepage / national numbers match
      // insights exactly for the same scope (this replaces the old
      // applyBaselineRemainder total-vs-total math that diverged).
      const [canonical, baseline, membersRes, collectivesRes, leadersCountRes] =
        await Promise.all([
          fetchCanonicalImpactRows({ effectiveStartIso, windowEndIso }),
          fetchBaselineSettings(),
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
          supabase.from('collectives').select('id', { count: 'exact', head: true }).eq('is_active', true).neq('is_national', true),
          supabase.from('app_settings').select('value').eq('key', 'leaders_empowered_total').single(),
        ])

      if (membersRes.error) throw membersRes.error
      if (collectivesRes.error) throw collectivesRes.error

      const lump = {
        trees: baseline?.trees ?? BASELINE_TREES,
        rubbish_kg: baseline?.rubbishKg ?? BASELINE_RUBBISH_KG,
        events: baseline?.events ?? BASELINE_EVENTS,
        attendees: baseline?.attendees ?? BASELINE_ATTENDEES,
        hours: baseline?.hours ?? BASELINE_HOURS,
      }

      const composed = composeSummaryMetrics(canonical.rows, {
        metricKeys: CANONICAL_METRIC_KEYS,
        // National view: apply the baseline floor only on all-time (a
        // current-year window contains no fully-contained baseline year, so it
        // resolves to recorded-only anyway; passing the flag keeps it explicit).
        applyNationalBaseline: true,
        effectiveStartIso,
        windowEndIso,
        lump: isAllTime ? lump : null,
      })

      // Cleanup sites: unique addresses from cleanup events in scope.
      const cleanupAddresses = new Set<string>()
      if (canonical.eventIds.length > 0) {
        const { data: cleanupEvents } = await supabase
          .from('events')
          .select('address')
          .in('id', canonical.eventIds)
          .in('activity_type', ['clean_up'])
        for (const e of cleanupEvents ?? []) {
          const addr = (e.address ?? '').trim().toLowerCase()
          if (addr) cleanupAddresses.add(addr)
        }
      }

      return {
        eventsAttended:      composed.totalAttendees,
        volunteerHours:      composed.totalEstimatedHours,
        eventsHeld:          composed.totalEvents,
        treesPlanted:        composed.metrics['trees_planted'] ?? 0,
        invasiveWeedsPulled: composed.metrics['invasive_weeds_pulled'] ?? 0,
        rubbishCollectedKg:  composed.metrics['rubbish_kg'] ?? 0,
        cleanupSites:        cleanupAddresses.size,
        coastlineCleanedM:   Math.round(composed.metrics['coastline_cleaned_m'] ?? 0),
        collectivesCount:    collectivesRes.count ?? 0,
        leadersEmpowered:    (leadersCountRes.data?.value as { count?: number })?.count ?? 0,
        totalMembers:        membersRes.count ?? 0,
      }
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

/* ------------------------------------------------------------------ */
/*  Collective impact                                                  */
/* ------------------------------------------------------------------ */

export function useCollectiveImpact(collectiveId: string | undefined, timeRange: TimeRange = 'all-time') {
  return useQuery({
    queryKey: ['collective-impact', collectiveId, timeRange],
    queryFn: async (): Promise<CanonicalImpact | null> => {
      if (!collectiveId) return null

      const effectiveStartIso = rangeStartIso(timeRange)
      const windowEndIso = new Date().toISOString()

      // Collective scope: recorded-only via the SAME shared path (NO national
      // baseline floor - baselines are national and cannot be sliced to a
      // collective), so this collective's totals match its row in the insights
      // By-collective table for the same window. leaders_lifetime still comes
      // from the RPC (a leadership counter, not an impact rollup).
      const [canonical, rpcRes] = await Promise.all([
        fetchCanonicalImpactRows({ collectiveId, effectiveStartIso, windowEndIso }),
        supabase.rpc('get_collective_stats', { p_collective_id: collectiveId }),
      ])

      const leadersEmpowered = (rpcRes.data as Record<string, number> | null)?.leaders_lifetime ?? 0

      if (canonical.rows.length === 0) {
        return {
          eventsAttended: 0, volunteerHours: 0, eventsHeld: 0,
          treesPlanted: 0, invasiveWeedsPulled: 0, rubbishCollectedKg: 0,
          cleanupSites: 0, coastlineCleanedM: 0, collectivesCount: 1,
          leadersEmpowered,
        }
      }

      const composed = composeSummaryMetrics(canonical.rows, {
        metricKeys: CANONICAL_METRIC_KEYS,
        applyNationalBaseline: false,
        effectiveStartIso,
        windowEndIso,
      })

      // Cleanup sites: unique addresses from cleanup events in scope.
      const cleanupAddresses = new Set<string>()
      if (canonical.eventIds.length > 0) {
        const { data: cleanupEvents } = await supabase
          .from('events')
          .select('address')
          .in('id', canonical.eventIds)
          .in('activity_type', ['clean_up'])
        for (const e of cleanupEvents ?? []) {
          const addr = (e.address ?? '').trim().toLowerCase()
          if (addr) cleanupAddresses.add(addr)
        }
      }

      return {
        eventsAttended:      composed.totalAttendees,
        volunteerHours:      composed.totalEstimatedHours,
        eventsHeld:          composed.totalEvents,
        treesPlanted:        composed.metrics['trees_planted'] ?? 0,
        invasiveWeedsPulled: composed.metrics['invasive_weeds_pulled'] ?? 0,
        rubbishCollectedKg:  composed.metrics['rubbish_kg'] ?? 0,
        cleanupSites:        cleanupAddresses.size,
        coastlineCleanedM:   Math.round(composed.metrics['coastline_cleaned_m'] ?? 0),
        collectivesCount:    1,
        leadersEmpowered,
      }
    },
    enabled: !!collectiveId,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

/* ------------------------------------------------------------------ */
/*  Custom metrics aggregation                                         */
/* ------------------------------------------------------------------ */

export interface AggregatedCustomMetric {
  key: string
  total: number
}

function aggregateCustomMetrics(
  rows: Record<string, unknown>[],
  limit?: number,
): AggregatedCustomMetric[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const cm = row.custom_metrics as Record<string, unknown> | null
    if (!cm || typeof cm !== 'object') continue
    for (const [key, val] of Object.entries(cm)) {
      const n = Number(val) || 0
      if (n > 0) totals.set(key, (totals.get(key) ?? 0) + n)
    }
  }
  const sorted = Array.from(totals.entries())
    .map(([key, total]) => ({ key, total }))
    .sort((a, b) => b.total - a.total)
  return limit ? sorted.slice(0, limit) : sorted
}

export function useCollectiveCustomMetrics(collectiveId: string | undefined) {
  return useQuery({
    queryKey: ['collective-custom-metrics', collectiveId],
    queryFn: async (): Promise<AggregatedCustomMetric[]> => {
      if (!collectiveId) return []
      const { rows } = await fetchImpactRows({ collectiveId, timeRange: 'all-time', includeLegacy: false })
      return aggregateCustomMetrics(rows)
    },
    enabled: !!collectiveId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useNationalCustomMetrics(limit = 5) {
  return useQuery({
    queryKey: ['national-custom-metrics', limit],
    queryFn: async (): Promise<AggregatedCustomMetric[]> => {
      const { rows } = await fetchImpactRows({ timeRange: 'all-time' })
      return aggregateCustomMetrics(rows, limit)
    },
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Monthly activity                                                   */
/* ------------------------------------------------------------------ */

interface MonthlyActivity {
  month: string
  count: number
}

export function useMonthlyActivity(userId?: string) {
  const { user } = useAuth()
  const id = userId ?? user?.id

  return useQuery({
    queryKey: ['monthly-activity', id],
    queryFn: async (): Promise<MonthlyActivity[]> => {
      if (!id) throw new Error('No user ID')

      const { data: registrations } = await supabase
        .from('event_registrations')
        .select('registered_at')
        .eq('user_id', id)
        .eq('status', 'attended')
        .order('registered_at', { ascending: true })

      if (!registrations?.length) return []

      const monthCounts = new Map<string, number>()
      for (const reg of registrations) {
        const date = new Date(reg.registered_at!)
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1)
      }

      return Array.from(monthCounts.entries()).map(([month, count]) => ({ month, count }))
    },
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Impact by category                                                 */
/* ------------------------------------------------------------------ */

interface ImpactByCategory {
  category: string
  count: number
}

export function useImpactByCategory(userId?: string) {
  const { user } = useAuth()
  const id = userId ?? user?.id

  return useQuery({
    queryKey: ['impact-by-category', id],
    queryFn: async (): Promise<ImpactByCategory[]> => {
      if (!id) throw new Error('No user ID')

      const { data: registrations } = await supabase
        .from('event_registrations')
        .select('event_id, events(activity_type)')
        .eq('user_id', id)
        .eq('status', 'attended')

      if (!registrations?.length) return []

      const categoryCounts = new Map<string, number>()
      for (const reg of registrations) {
        const actType = (reg.events as { activity_type: string } | null)?.activity_type ?? 'other'
        categoryCounts.set(actType, (categoryCounts.get(actType) ?? 0) + 1)
      }

      return Array.from(categoryCounts.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count)
    },
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Streak                                                             */
/* ------------------------------------------------------------------ */

interface StreakData {
  currentWeeks: number
  longestWeeks: number
  currentMonths: number
  longestMonths: number
}

export function useStreak(userId?: string) {
  const { user } = useAuth()
  const id = userId ?? user?.id

  return useQuery({
    queryKey: ['streak', id],
    queryFn: async (): Promise<StreakData> => {
      if (!id) throw new Error('No user ID')

      const { data: registrations } = await supabase
        .from('event_registrations')
        .select('registered_at')
        .eq('user_id', id)
        .eq('status', 'attended')
        .order('registered_at', { ascending: true })

      if (!registrations?.length) {
        return { currentWeeks: 0, longestWeeks: 0, currentMonths: 0, longestMonths: 0 }
      }

      const weeks = new Set<string>()
      const months = new Set<string>()

      for (const reg of registrations) {
        const date = new Date(reg.registered_at!)
        const startOfYear = new Date(date.getFullYear(), 0, 1)
        const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / 86400000)
        const weekNum = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7)
        weeks.add(`${date.getFullYear()}-W${weekNum}`)
        months.add(`${date.getFullYear()}-${date.getMonth()}`)
      }

      const now = new Date()
      const startOfYear = new Date(now.getFullYear(), 0, 1)
      const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000)
      const currentWeekNum = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7)
      const currentWeekKey = `${now.getFullYear()}-W${currentWeekNum}`
      const currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`

      const lastWeekDate = new Date(now.getTime() - 7 * 86400000)
      const lStartOfYear = new Date(lastWeekDate.getFullYear(), 0, 1)
      const lDayOfYear = Math.floor((lastWeekDate.getTime() - lStartOfYear.getTime()) / 86400000)
      const lastWeekNum = Math.ceil((lDayOfYear + lStartOfYear.getDay() + 1) / 7)
      const lastWeekKey = `${lastWeekDate.getFullYear()}-W${lastWeekNum}`

      const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastMonthKey = `${lastMonthDate.getFullYear()}-${lastMonthDate.getMonth()}`

      const calcStreak = (sortedKeys: string[], isWeek: boolean, currentKey: string, lastKey: string) => {
        if (sortedKeys.length === 0) return { current: 0, longest: 0 }
        let current = 1
        let longest = 1
        for (let i = 1; i < sortedKeys.length; i++) {
          const prev = sortedKeys[i - 1]
          const curr = sortedKeys[i]
          let isConsecutive = false
          if (isWeek) {
            const [prevY, prevW] = prev.split('-W').map(Number)
            const [currY, currW] = curr.split('-W').map(Number)
            isConsecutive =
              (currY === prevY && currW === prevW + 1) ||
              (currY === prevY + 1 && prevW >= 52 && currW === 1)
          } else {
            const [prevY, prevM] = prev.split('-').map(Number)
            const [currY, currM] = curr.split('-').map(Number)
            isConsecutive =
              (currY === prevY && currM === prevM + 1) ||
              (currY === prevY + 1 && prevM === 11 && currM === 0)
          }
          if (isConsecutive) {
            current++
            if (current > longest) longest = current
          } else {
            current = 1
          }
        }
        const lastEntry = sortedKeys[sortedKeys.length - 1]
        const isActive = lastEntry === currentKey || lastEntry === lastKey
        return { current: isActive ? current : 0, longest }
      }

      const weekArr = Array.from(weeks).sort()
      const monthArr = Array.from(months).sort()
      const weekStreak = calcStreak(weekArr, true, currentWeekKey, lastWeekKey)
      const monthStreak = calcStreak(monthArr, false, currentMonthKey, lastMonthKey)

      return {
        currentWeeks: weekStreak.current,
        longestWeeks: weekStreak.longest,
        currentMonths: monthStreak.current,
        longestMonths: monthStreak.longest,
      }
    },
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  })
}
