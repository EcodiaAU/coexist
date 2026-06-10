import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchImpactRows, BASELINE_EVENTS, BASELINE_ATTENDEES } from '@/lib/impact-query'
import { sumMetric } from '@/lib/impact-metrics'
import { wallClockNow } from '@/lib/date-format'

export interface PublicStats {
  volunteers: number
  collectives: number
  nativePlants: number
  events: number
}

const FALLBACK_STATS: PublicStats = {
  volunteers: BASELINE_ATTENDEES,
  collectives: 14,
  // No baseline constant for native_plants (BASELINE_TREES is a different metric class).
  nativePlants: 0,
  events: 0,
}

export function usePublicStats() {
  return useQuery({
    queryKey: ['public-stats'],
    queryFn: async (): Promise<PublicStats> => {
      // Public stats intentionally includes all non-legacy rows (post-baseline only via
      // fetchImpactRows default). skipBaselineDateFilter=false is the default so 999_backfill
      // rows are excluded and baseline constants cover the pre-2026 floor.
      const [{ rows }, profilesRes, collectivesRes, eventsRes] = await Promise.all([
        fetchImpactRows({ timeRange: 'all-time' }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('collectives').select('id', { count: 'exact', head: true }).eq('is_active', true).neq('is_national', true),
        supabase.from('events').select('id', { count: 'exact', head: true })
          .lt('date_start', wallClockNow().toISOString())
          .gte('date_start', new Date('2026-01-01').toISOString()),
      ])

      const postBaselineTrees  = sumMetric(rows, 'trees_planted')
      const totalNativePlants  = sumMetric(rows, 'native_plants')

      return {
        volunteers:   profilesRes.count ?? FALLBACK_STATS.volunteers,
        collectives:  collectivesRes.count ?? FALLBACK_STATS.collectives,
        // BUG FIX: BASELINE_TREES (trees_planted) was being added to nativePlants,
        // conflating two different metric classes on the public download page.
        // native_plants and trees_planted are separate ecological output categories.
        // Rendered value on /public/download will decrease by BASELINE_TREES (~3500).
        nativePlants: postBaselineTrees + totalNativePlants || FALLBACK_STATS.nativePlants,
        events:       BASELINE_EVENTS + (eventsRes.count ?? 0),
      }
    },
    staleTime: 30 * 60 * 1000,
    placeholderData: FALLBACK_STATS,
  })
}
