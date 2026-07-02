import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  fetchCanonicalImpactRows,
  composeSummaryMetrics,
  fetchBaselineSettings,
  BASELINE_TREES,
  BASELINE_RUBBISH_KG,
  BASELINE_EVENTS,
  BASELINE_ATTENDEES,
  BASELINE_HOURS,
} from '@/lib/impact-query'

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
      // Public stats read the ONE shared national max-rule composition, so the
      // /public/download event + native-plant numbers match /admin/insights
      // (this replaces the old flat BASELINE_EVENTS + post-2026 count that
      // diverged). native_plants has no national baseline, so it composes to
      // recorded-only.
      const windowEndIso = new Date().toISOString()
      const [canonical, baseline, profilesRes, collectivesRes] = await Promise.all([
        fetchCanonicalImpactRows({ effectiveStartIso: null, windowEndIso }),
        fetchBaselineSettings(),
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('collectives').select('id', { count: 'exact', head: true }).eq('is_active', true).neq('is_national', true),
      ])

      const lump = {
        trees: baseline?.trees ?? BASELINE_TREES,
        rubbish_kg: baseline?.rubbishKg ?? BASELINE_RUBBISH_KG,
        events: baseline?.events ?? BASELINE_EVENTS,
        attendees: baseline?.attendees ?? BASELINE_ATTENDEES,
        hours: baseline?.hours ?? BASELINE_HOURS,
      }
      const composed = composeSummaryMetrics(canonical.rows, {
        metricKeys: ['native_plants'],
        applyNationalBaseline: true,
        effectiveStartIso: null,
        windowEndIso,
        lump,
      })

      return {
        volunteers:   profilesRes.count ?? FALLBACK_STATS.volunteers,
        collectives:  collectivesRes.count ?? FALLBACK_STATS.collectives,
        nativePlants: composed.metrics['native_plants'] || FALLBACK_STATS.nativePlants,
        events:       composed.totalEvents,
      }
    },
    staleTime: 30 * 60 * 1000,
    placeholderData: FALLBACK_STATS,
  })
}
