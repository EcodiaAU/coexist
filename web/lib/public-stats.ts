import 'server-only'
import { getServerSupabase } from './supabase-server'
import {
  fetchCanonicalImpactRows,
  composeSummaryMetrics,
  fetchBaselineSettings,
  BASELINE_ATTENDEES,
  BASELINE_RUBBISH_KG,
  BASELINE_TREES,
  BASELINE_EVENTS,
  BASELINE_HOURS,
} from '@shared/impact-core'

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
  const windowEndIso = new Date().toISOString()

  // The marketing site runs the EXACT same max-rule composition the app's
  // /admin/insights uses (shared/impact-core), with the server service-role
  // client. Zero drift: one aggregation, two clients. This replaces the old
  // applyBaselineRemainder total-vs-total math that diverged from insights.
  const [canonical, baseline, collectivesRes] = await Promise.all([
    fetchCanonicalImpactRows(supabase, { effectiveStartIso: null, windowEndIso }),
    fetchBaselineSettings(supabase),
    supabase
      .from('collectives')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .neq('is_national', true),
  ])

  const lump = {
    trees: baseline?.trees ?? BASELINE_TREES,
    rubbish_kg: baseline?.rubbishKg ?? BASELINE_RUBBISH_KG,
    events: baseline?.events ?? BASELINE_EVENTS,
    attendees: baseline?.attendees ?? BASELINE_ATTENDEES,
    hours: baseline?.hours ?? BASELINE_HOURS,
  }
  const composed = composeSummaryMetrics(canonical.rows, {
    metricKeys: ['trees_planted', 'rubbish_kg'],
    applyNationalBaseline: true,
    effectiveStartIso: null,
    windowEndIso,
    lump,
  })

  return {
    volunteers: composed.totalAttendees,
    collectives: collectivesRes.count ?? 0,
    // Trees only, to keep the "Trees planted" hero label truthful. native_plants
    // is a separate metric and is deliberately NOT folded in here.
    plants: composed.metrics['trees_planted'] ?? 0,
    rubbishKg: Math.round(composed.metrics['rubbish_kg'] ?? 0),
    events: composed.totalEvents,
  }
}
