import 'server-only'
import { getServerSupabase } from './supabase-server'
import {
  fetchImpactRows,
  applyBaselineRemainder,
  BASELINE_RUBBISH_KG,
  BASELINE_TREES,
} from '@shared/impact-core'
import { sumMetric } from '@shared/impact-metrics'

/**
 * Canonical public impact totals for the marketing site, computed SERVER-SIDE.
 *
 * The app's usePublicStats hook runs in the browser, where event_impact is
 * RLS-locked to authenticated users, so anon visitors silently fall back to
 * baseline constants. The marketing site must show accurate live numbers, so
 * it runs the SAME canonical aggregation (shared/impact-core) with the server
 * service-role client. Zero drift from the app - one aggregation, two clients.
 */
export interface PublicImpactStats {
  volunteers: number
  collectives: number
  nativePlants: number
  treesPlanted: number
  rubbishKg: number
  events: number
}

export async function getPublicImpactStats(): Promise<PublicImpactStats> {
  const supabase = getServerSupabase()
  const now = new Date().toISOString()

  const [live, legacy, volunteersRes, collectivesRes, eventsRes] = await Promise.all([
    // post-baseline live rows (national, unweighted)
    fetchImpactRows(supabase, { timeRange: 'all-time' }),
    // all non-legacy-excluded rows incl pre-baseline, to compute legacy sums
    fetchImpactRows(supabase, { includeLegacy: true, skipBaselineDateFilter: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase
      .from('collectives')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .neq('is_national', true),
    supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .lt('date_start', now)
      .gte('date_start', new Date('2026-01-01').toISOString()),
  ])

  const liveTrees = sumMetric(live.rows, 'trees_planted')
  const liveNative = sumMetric(live.rows, 'native_plants')
  const liveRubbish = sumMetric(live.rows, 'rubbish_kg')
  const legacyTrees = sumMetric(legacy.legacyRows, 'trees_planted')
  const legacyRubbish = sumMetric(legacy.legacyRows, 'rubbish_kg')

  return {
    volunteers: volunteersRes.count ?? 0,
    collectives: collectivesRes.count ?? 0,
    // native plants + trees are both ecological outputs the site surfaces;
    // baseline tree remainder is added once via the canonical helper.
    nativePlants: liveNative,
    treesPlanted: applyBaselineRemainder(liveTrees, legacyTrees, BASELINE_TREES, true),
    rubbishKg: Math.round(
      applyBaselineRemainder(liveRubbish, legacyRubbish, BASELINE_RUBBISH_KG, true),
    ),
    events: eventsRes.count ?? 0,
  }
}
