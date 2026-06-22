import 'server-only'
import { getServerSupabase } from './supabase-server'
import {
  fetchImpactRows,
  applyBaselineRemainder,
  BASELINE_ATTENDEES,
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
  /** Cumulative people who have taken part (baseline-inclusive). */
  volunteers: number
  collectives: number
  /** Plants + trees in the ground (baseline-inclusive). The live site's
   *  "native plants planted" figure is this combined ecological output. */
  plants: number
  rubbishKg: number
  events: number
}

export async function getPublicImpactStats(): Promise<PublicImpactStats> {
  const supabase = getServerSupabase()
  const now = new Date().toISOString()

  const [live, legacy, collectivesRes, eventsRes] = await Promise.all([
    // post-baseline live rows (national, unweighted)
    fetchImpactRows(supabase, { timeRange: 'all-time' }),
    // all non-legacy-excluded rows incl pre-baseline, to compute legacy sums
    fetchImpactRows(supabase, { includeLegacy: true, skipBaselineDateFilter: true }),
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
  const liveAttendees = sumMetric(live.rows, 'attendees')
  const legacyTrees = sumMetric(legacy.legacyRows, 'trees_planted')
  const legacyRubbish = sumMetric(legacy.legacyRows, 'rubbish_kg')
  const legacyAttendees = sumMetric(legacy.legacyRows, 'attendees')

  // All figures are baseline-inclusive (canonical cumulative totals) so the
  // marketing site matches or exceeds the hand-typed live-site numbers and
  // stays consistent with the app's /impact dashboard. The baseline remainder
  // is applied once per metric via the shared helper.
  const treesPlanted = applyBaselineRemainder(liveTrees, legacyTrees, BASELINE_TREES, true)

  return {
    volunteers: applyBaselineRemainder(liveAttendees, legacyAttendees, BASELINE_ATTENDEES, true),
    collectives: collectivesRes.count ?? 0,
    plants: treesPlanted + liveNative,
    rubbishKg: Math.round(
      applyBaselineRemainder(liveRubbish, legacyRubbish, BASELINE_RUBBISH_KG, true),
    ),
    events: eventsRes.count ?? 0,
  }
}
