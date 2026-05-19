/**
 * Canonical impact data fetcher.
 *
 * Single source of truth for all event_impact queries across the app.
 * Every dashboard, hook, and page MUST go through fetchImpactRows() - 
 * never query event_impact directly for aggregation purposes.
 *
 * Rules enforced here (and nowhere else):
 *  1. Baseline date: only rows from events on/after 2026-01-01 are returned
 *     from the live DB. Pre-baseline totals are covered by baseline constants.
 *  2. Legacy row exclusion: rows with notes LIKE 'Legacy import:%' are
 *     excluded from live queries (they are pre-baseline attendance records).
 *     Pass includeLegacy=true only when a collective needs all-time totals.
 *  3. Scope: collective and user scopes always use a two-step event-IDs-first
 *     approach - embedded PostgREST join filters are unreliable for scoping.
 *  4. Baseline constants: defined once here, re-exported for all consumers.
 */

import { supabase } from '@/lib/supabase'
import { IMPACT_SELECT_COLUMNS, type EventHostShare } from '@/lib/impact-metrics'

/* ------------------------------------------------------------------ */
/*  Baseline constants - single source of truth                        */
/* ------------------------------------------------------------------ */

export const IMPACT_BASELINE_DATE      = '2026-01-01'
export const BASELINE_TREES            = 36_637  // pre-2026 sheet total: 17,300 (2022) + 3,702 (2024) + 15,635 (2025)
export const BASELINE_RUBBISH_KG       = 4_900   // matches app_settings impact_baseline_rubbish_kg (was incorrectly 4_794)
export const BASELINE_EVENTS           = 340
export const BASELINE_ATTENDEES        = 5_500
export const BASELINE_HOURS            = 11_000

/* ------------------------------------------------------------------ */
/*  Scope types                                                        */
/* ------------------------------------------------------------------ */

export type ImpactTimeRange = 'all-time' | 'current-year' | 'custom'

export interface ImpactScope {
  /** Filter to a single collective. Omit for national/global. */
  collectiveId?: string
  /** Filter to a specific list of event IDs (e.g. events a user attended). */
  eventIds?: string[]
  timeRange?: ImpactTimeRange
  /** Custom start date (ISO string). Used when timeRange='custom'. */
  rangeStart?: string
  /**
   * Include legacy import rows (notes LIKE 'Legacy import:%').
   * Only set true for collective all-time queries that need pre-2026 attendance.
   * National queries never include legacy rows - the baseline constants cover them.
   */
  includeLegacy?: boolean
  /**
   * Skip the baseline date lower-bound filter.
   * Only set true for public-stats which intentionally sums all non-legacy rows.
   */
  skipBaselineDateFilter?: boolean
}

/* ------------------------------------------------------------------ */
/*  Row types                                                          */
/* ------------------------------------------------------------------ */

export type ImpactRow = Record<string, unknown>

export interface FetchImpactResult {
  /** Live (non-legacy) rows from post-baseline events */
  rows: ImpactRow[]
  /** Legacy import rows - only populated when includeLegacy=true */
  legacyRows: ImpactRow[]
  /** All event IDs that matched the scope (post-baseline) */
  eventIds: string[]
  /** Count of events that matched the scope */
  eventCount: number
  /**
   * Per-event host share, populated when scope.collectiveId is set. Use with
   * sumMetricWeighted() to attribute multi-host events fairly so per-collective
   * totals add to the national total without double counting. National scope
   * (no collectiveId) returns an empty map - sums are unweighted.
   */
  shareByEventId: Map<string, EventHostShare>
}

/* ------------------------------------------------------------------ */
/*  Core fetcher                                                       */
/* ------------------------------------------------------------------ */

/**
 * Fetch impact rows for the given scope.
 *
 * Step 1 - resolve event IDs for the scope (if needed).
 * Step 2 - fetch event_impact rows scoped to those IDs.
 *
 * Returns live rows and optionally legacy rows separately so callers
 * can combine them or keep them apart as needed.
 */
export async function fetchImpactRows(scope: ImpactScope = {}): Promise<FetchImpactResult> {
  const {
    collectiveId,
    eventIds: providedEventIds,
    timeRange = 'all-time',
    rangeStart,
    includeLegacy = false,
    skipBaselineDateFilter = false,
  } = scope

  const now = new Date().toISOString()
  const baselineDate = new Date(IMPACT_BASELINE_DATE).toISOString()
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString()

  // Determine the effective lower date bound for event_start.
  // When includeLegacy=true we need pre-2026 events (backfill + legacy imports),
  // so the baseline date floor must not apply to the ID resolution query.
  let effectiveStart: string | null
  if (includeLegacy) {
    // All-time collective view: no lower bound - pick up everything
    effectiveStart = null
  } else if (skipBaselineDateFilter) {
    effectiveStart = null
  } else if (timeRange === 'current-year') {
    effectiveStart = yearStart > baselineDate ? yearStart : baselineDate
  } else if (timeRange === 'custom' && rangeStart) {
    effectiveStart = rangeStart
  } else {
    // all-time national/admin: baseline date is the floor (pre-2026 covered by constants)
    effectiveStart = baselineDate
  }

  // ── Step 1: resolve event IDs ────────────────────────────────────────

  let resolvedEventIds: string[]
  let eventCount: number
  // Populated only for collective scope. Maps event_id -> this collective's
  // host share for that event so sumMetricWeighted can attribute fairly.
  const shareByEventId = new Map<string, EventHostShare>()

  if (providedEventIds) {
    // Caller already knows the event IDs (e.g. user's attended events)
    resolvedEventIds = providedEventIds
    eventCount = providedEventIds.length
  } else if (collectiveId) {
    // Multi-host attribution: resolve via event_hosts so events where this
    // collective is the primary OR an accepted co-host both count. Two-step
    // (event_hosts → ids → events) is used instead of an embedded join because
    // PostgREST FK inference through a view isn't reliable for filtering.
    const { data: hostRows, error: hostsErr } = await supabase
      .from('event_hosts')
      .select('event_id, host_index, host_count')
      .eq('collective_id', collectiveId)
    if (hostsErr) throw hostsErr

    type HostRow = {
      event_id: string | null
      host_index: number | null
      host_count: number | null
    }
    const candidateShare = new Map<string, EventHostShare>()
    for (const r of (hostRows ?? []) as HostRow[]) {
      if (!r.event_id || candidateShare.has(r.event_id)) continue
      candidateShare.set(r.event_id, {
        host_index: r.host_index ?? 0,
        host_count: r.host_count ?? 1,
      })
    }
    const candidateIds = Array.from(candidateShare.keys())

    if (candidateIds.length === 0) {
      resolvedEventIds = []
      eventCount = 0
    } else {
      // Filter the candidate ids by the events table: status, date floor, etc.
      let q = supabase
        .from('events')
        .select('id')
        .in('id', candidateIds)
        .lt('date_start', now)
      if (!includeLegacy) q = q.in('status', ['published', 'completed'])
      if (effectiveStart) q = q.gte('date_start', effectiveStart)
      const { data: eventRows, error: eventsErr } = await q
      if (eventsErr) throw eventsErr

      const matchedIds = (eventRows ?? []).map((e) => e.id)
      for (const id of matchedIds) {
        const share = candidateShare.get(id)
        if (share) shareByEventId.set(id, share)
      }
      resolvedEventIds = matchedIds
      eventCount = matchedIds.length
    }
  } else if (effectiveStart) {
    // National / time-scoped (no collective filter): unweighted, every event
    // counts once. Stays on the events table since event_hosts adds no value
    // here and only makes the query more expensive.
    const buildQuery = (statusFilter: boolean) => {
      let q = supabase
        .from('events')
        .select('id', { count: 'exact' })
        .lt('date_start', now)
      if (statusFilter) q = q.in('status', ['published', 'completed'])
      if (effectiveStart) q = q.gte('date_start', effectiveStart)
      return q
    }

    if (includeLegacy) {
      const [allEventsRes, realEventsRes] = await Promise.all([
        buildQuery(false),
        buildQuery(true),
      ])
      if (allEventsRes.error) throw allEventsRes.error
      resolvedEventIds = (allEventsRes.data ?? []).map((e) => e.id)
      eventCount = realEventsRes.count ?? 0
    } else {
      const eventsRes = await buildQuery(true)
      if (eventsRes.error) throw eventsRes.error
      resolvedEventIds = (eventsRes.data ?? []).map((e) => e.id)
      eventCount = eventsRes.count ?? 0
    }
  } else {
    // National / global with no lower date bound. Two sub-cases land here:
    //   (a) includeLegacy=true → all-time national needing pre-2026 backfill
    //       events so their legacy impact rows can be summed. We must NOT
    //       apply the baselineDate floor or the third surface (/admin) ends
    //       up smaller than /admin/impact (which fetches legacy itself).
    //   (b) skipBaselineDateFilter=true → public-stats path that intentionally
    //       sums all non-legacy rows; same: no baseline floor.
    // In both cases resolvedEventIds must include pre-2026 events so step 2
    // picks their impact rows up. eventCount stays scoped to live published/
    // completed events (matching the displayed "events held" semantics).
    const buildQuery = (statusFilter: boolean) => {
      let q = supabase
        .from('events')
        .select('id', { count: 'exact' })
        .lt('date_start', now)
      if (statusFilter) q = q.in('status', ['published', 'completed'])
      return q
    }

    if (includeLegacy) {
      const [allEventsRes, realEventsRes] = await Promise.all([
        buildQuery(false),
        buildQuery(true),
      ])
      if (allEventsRes.error) throw allEventsRes.error
      resolvedEventIds = (allEventsRes.data ?? []).map((e) => e.id)
      eventCount = realEventsRes.count ?? 0
    } else {
      const eventsRes = await buildQuery(true)
      if (eventsRes.error) throw eventsRes.error
      resolvedEventIds = (eventsRes.data ?? []).map((e) => e.id)
      eventCount = eventsRes.count ?? 0
    }
  }

  // ── Step 2: fetch impact rows ────────────────────────────────────────

  if (resolvedEventIds.length === 0) {
    return { rows: [], legacyRows: [], eventIds: [], eventCount: 0, shareByEventId }
  }

  // Build the base query scoped to the resolved event IDs.
  // Split into chunks if necessary to stay under PostgREST URL limits.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetchChunked = async (filter: (q: any) => any) => {
    const CHUNK = 200
    const allRows: ImpactRow[] = []
    for (let i = 0; i < resolvedEventIds.length; i += CHUNK) {
      const chunk = resolvedEventIds.slice(i, i + CHUNK)
      const q = filter(
        supabase
          .from('event_impact')
          .select(IMPACT_SELECT_COLUMNS)
          .in('event_id', chunk)
          .range(0, 9999)
      )
      const { data, error } = await q
      if (error) throw error
      allRows.push(...((data ?? []) as ImpactRow[]))
    }
    return allRows
  }

  // Live rows: exclude legacy imports
  const liveRows = await fetchChunked((q) =>
    q.or('notes.is.null,notes.not.like.Legacy import:%')
  )

  // Legacy rows: only if requested
  let legacyRows: ImpactRow[] = []
  if (includeLegacy) {
    legacyRows = await fetchChunked((q) =>
      q.like('notes', 'Legacy import:%')
    )
  }

  return {
    rows: liveRows,
    legacyRows,
    eventIds: resolvedEventIds,
    eventCount,
    shareByEventId,
  }
}

/* ------------------------------------------------------------------ */
/*  Cross-surface national aggregate                                   */
/* ------------------------------------------------------------------ */

/**
 * The canonical national rollup for any all-time metric. Used by every
 * surface that displays a national stat (homepage, /admin, /admin/impact,
 * /impact, /profile, /admin/collectives summary) so the same scope always
 * reports the same number.
 *
 * Math: live + legacy + max(0, baseline - sum_legacy)
 *
 *   When sum_legacy <= baseline: total = sum(live) + baseline  (same as old)
 *   When sum_legacy >  baseline: total = sum(live) + sum_legacy (legacy is
 *                                the truthful pre-2026 contribution; the
 *                                baseline constant has been surpassed)
 *
 * Without this helper, the homepage was using sum(live) + baseline while
 * /admin/impact (post-v54) was using sum(live + legacy) + remainder. They
 * diverged whenever sum(legacy) > baseline (e.g. trees: 43,769 legacy vs
 * 36,637 baseline gave a 7,000-tree gap between surfaces).
 */
export function applyBaselineRemainder(
  liveSum: number,
  legacySum: number,
  baseline: number,
  addBaseline: boolean,
): number {
  if (!addBaseline) return liveSum + legacySum
  const remainder = Math.max(0, baseline - legacySum)
  return liveSum + legacySum + remainder
}

/* ------------------------------------------------------------------ */
/*  Baseline helpers                                                   */
/* ------------------------------------------------------------------ */

/** Load baseline numbers from app_settings (used by national/admin hooks). */
export async function fetchBaselineSettings(): Promise<{
  attendees: number
  events: number
  trees: number
  rubbishKg: number
  hours: number
  /** Per-year tree breakdown sourced from app_settings per-year keys. */
  treesByYear: { year: number; trees: number }[]
}> {
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', [
      'impact_baseline_attendees',
      'impact_baseline_events',
      'impact_baseline_trees',
      'impact_baseline_rubbish_kg',
      'impact_baseline_hours',
      'impact_baseline_trees_2022',
      'impact_baseline_trees_2024',
      'impact_baseline_trees_2025',
    ])

  const m: Record<string, number> = {}
  for (const row of data ?? []) {
    m[row.key] = (row.value as { count?: number })?.count ?? 0
  }

  const treesByYear: { year: number; trees: number }[] = [
    { year: 2022, trees: m['impact_baseline_trees_2022'] ?? 17300 },
    { year: 2024, trees: m['impact_baseline_trees_2024'] ?? 3702 },
    { year: 2025, trees: m['impact_baseline_trees_2025'] ?? 15635 },
  ].filter((y) => y.trees > 0)

  return {
    attendees: m['impact_baseline_attendees'] ?? BASELINE_ATTENDEES,
    events:    m['impact_baseline_events']    ?? BASELINE_EVENTS,
    trees:     m['impact_baseline_trees']     ?? BASELINE_TREES,
    rubbishKg: m['impact_baseline_rubbish_kg'] ?? BASELINE_RUBBISH_KG,
    hours:     m['impact_baseline_hours']     ?? BASELINE_HOURS,
    treesByYear,
  }
}

/**
 * Load per-year baseline numbers for a specific year.
 * Returns tree, event, attendee, and hour counts sourced from app_settings
 * per-year keys (e.g. impact_baseline_trees_2025). Hardcoded defaults act
 * as fallback when a key is absent from app_settings.
 * Used by the drift cron to compare actual year-by-year data against the
 * master sheet without relying on hardcoded constants.
 */
export async function fetchBaselineByYear(
  year: 2022 | 2024 | 2025,
): Promise<{ trees: number; events: number; attendees: number; hours: number }> {
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', [
      `impact_baseline_trees_${year}`,
      `impact_baseline_events_${year}`,
      `impact_baseline_attendees_${year}`,
      `impact_baseline_hours_${year}`,
    ])

  const m: Record<string, number> = {}
  for (const row of data ?? []) {
    m[row.key] = (row.value as { count?: number })?.count ?? 0
  }

  // Per-year fallbacks from the known master-sheet breakdown
  const defaults: Record<number, { trees: number; events: number; attendees: number; hours: number }> = {
    2022: { trees: 17300, events: 0, attendees: 0, hours: 0 },
    2024: { trees: 3702,  events: 0, attendees: 0, hours: 0 },
    2025: { trees: 15635, events: 340, attendees: 5500, hours: 11000 },
  }
  const d = defaults[year] ?? { trees: 0, events: 0, attendees: 0, hours: 0 }

  return {
    trees:     m[`impact_baseline_trees_${year}`]     ?? d.trees,
    events:    m[`impact_baseline_events_${year}`]    ?? d.events,
    attendees: m[`impact_baseline_attendees_${year}`] ?? d.attendees,
    hours:     m[`impact_baseline_hours_${year}`]     ?? d.hours,
  }
}
