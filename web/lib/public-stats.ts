import 'server-only'
import { getServerSupabase } from './supabase-server'
import {
  fetchImpactRows,
  applyBaselineRemainder,
  BASELINE_ATTENDEES,
  BASELINE_RUBBISH_KG,
  BASELINE_TREES,
  BASELINE_EVENTS,
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
  /** Trees planted (baseline-inclusive), matching the app's /impact
   *  dashboard. native_plants is a separate metric and is not included. */
  plants: number
  rubbishKg: number
  events: number
}

export async function getPublicImpactStats(): Promise<PublicImpactStats> {
  const supabase = getServerSupabase()
  const now = new Date().toISOString()

  const baselineIso = new Date('2026-01-01').toISOString()
  const [live, legacy, collectivesRes, eventsRes, legacyEventsRes] = await Promise.all([
    // post-baseline live rows (national, unweighted)
    fetchImpactRows(supabase, { timeRange: 'all-time' }),
    // all non-legacy-excluded rows incl pre-baseline, to compute legacy sums
    fetchImpactRows(supabase, { includeLegacy: true, skipBaselineDateFilter: true }),
    supabase
      .from('collectives')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .neq('is_national', true),
    // post-baseline past events (live meetup count)
    supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .lt('date_start', now)
      .gte('date_start', baselineIso),
    // pre-baseline past events (rows that exist before 2026) - the legacy count
    supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .lt('date_start', baselineIso),
  ])

  const liveTrees = sumMetric(live.rows, 'trees_planted')
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
    // Trees only, to match the app's /impact dashboard exactly and keep the
    // "Trees planted" hero label truthful. native_plants (a separate metric,
    // 520 at time of writing) is deliberately NOT folded in here.
    plants: treesPlanted,
    rubbishKg: Math.round(
      applyBaselineRemainder(liveRubbish, legacyRubbish, BASELINE_RUBBISH_KG, true),
    ),
    // Meetups: baseline-inclusive like every other metric (the app's /impact
    // dashboard shows ~480, not the bare post-2026 count). Pre-2026 meetups are
    // captured by BASELINE_EVENTS (340); the helper avoids double-counting any
    // pre-2026 event rows that already exist.
    events: applyBaselineRemainder(eventsRes.count ?? 0, legacyEventsRes.count ?? 0, BASELINE_EVENTS, true),
  }
}
