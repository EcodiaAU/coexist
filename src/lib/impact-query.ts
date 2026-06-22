/**
 * Canonical impact data fetcher - app binding.
 *
 * The aggregation logic now lives in the framework-agnostic shared/ layer
 * (shared/impact-core.ts) so the Next.js marketing site can reuse the exact
 * same canonical math with zero drift. This file binds the app's browser
 * Supabase singleton to those injected functions and re-exports the identical
 * public surface every app call site already imports - so nothing in the app
 * changes. See single-canonical-aggregation-feeds-all-dashboard-surfaces.
 */

import { supabase } from '@/lib/supabase'
import * as core from '../../shared/impact-core'

// Constants + pure helpers pass straight through.
export {
  IMPACT_BASELINE_DATE,
  BASELINE_TREES,
  BASELINE_RUBBISH_KG,
  BASELINE_EVENTS,
  BASELINE_ATTENDEES,
  BASELINE_HOURS,
  applyBaselineRemainder,
} from '../../shared/impact-core'

export type {
  ImpactTimeRange,
  ImpactScope,
  ImpactRow,
  FetchImpactResult,
} from '../../shared/impact-core'

// Client-bound wrappers preserve the app's existing call signatures exactly.
export function fetchImpactRows(
  scope: core.ImpactScope = {},
): Promise<core.FetchImpactResult> {
  return core.fetchImpactRows(supabase, scope)
}

export function fetchBaselineSettings(): ReturnType<typeof core.fetchBaselineSettings> {
  return core.fetchBaselineSettings(supabase)
}

export function fetchBaselineByYear(
  year: 2022 | 2024 | 2025,
): ReturnType<typeof core.fetchBaselineByYear> {
  return core.fetchBaselineByYear(supabase, year)
}
