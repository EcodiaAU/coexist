/**
 * Canonical impact data fetcher - framework-agnostic core.
 *
 * Single source of truth for all event_impact queries across every surface
 * (the Vite app AND the Next.js marketing site). The Supabase client is
 * INJECTED as the first argument so this module never imports a runtime
 * client - the app binds its browser singleton, the marketing site binds a
 * server client. This is the doctrinally-required single canonical aggregation
 * (single-canonical-aggregation-feeds-all-dashboard-surfaces): never copied.
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

import { IMPACT_SELECT_COLUMNS, BUILTIN_COLUMNS, type EventHostShare } from './impact-metrics'

/**
 * The injected client type, defined STRUCTURALLY so shared/ depends on no
 * @supabase/* package and no app types. The aggregation only ever calls
 * `.from(table)` and chains PostgREST builder methods, so a minimal `from`
 * signature is all the contract needs.
 *
 * Why structural and not `Pick<SupabaseClient<Database>, 'from'>`: the app and
 * the web site each resolve their own copy of @supabase/postgrest-js, whose
 * PostgrestQueryBuilder carries a `private` member. Two copies are nominally
 * incompatible, so importing the real type here breaks whichever side resolves
 * the "other" copy. A self-owned interface sidesteps that entirely; both
 * concrete clients satisfy it (a typed `from` is assignable to one returning
 * the builder-shaped type below). Runtime correctness is pinned by
 * src/test/impact-core.test.ts.
 */
// The PostgREST builder is chained dynamically and differs structurally
// between the app's and the site's resolved copy of @supabase/postgrest-js
// (which carries a `private` member). Typing it `any` keeps shared/ decoupled
// from every @supabase package; both concrete clients satisfy the `from`
// contract, and src/test/impact-core.test.ts pins runtime correctness.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ImpactQueryBuilder = any

export interface ImpactClient {
  from: (relation: string) => ImpactQueryBuilder
}

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
/*  THE RULE - MAX(baseline, recorded), never below baseline           */
/*                                                                     */
/*  Kurt reports to funders; the displayed figure must never fall      */
/*  below the org's stated baseline. Where our recorded data exceeds   */
/*  the baseline, we surface the larger (truthful) figure. This is a   */
/*  per-metric, per-window GREATEST, computed ONCE (never baseline +   */
/*  recorded), so it can never double-count.                           */
/*  Source of truth: drafts/coexist-impact-parity/README_STATUS.md     */
/*  section "THE RULE (Tate, 2026-07-02)".                             */
/* ------------------------------------------------------------------ */

/**
 * Per-year NATIONAL baselines from the MS365 OVERALL tab (the canonical source;
 * richer than the trees-only app_settings keys). These are Co-Exist's official
 * per-year national figures. A `null` means the source is genuinely blank for
 * that (year, metric) and it must render as no-data, NOT zero (e.g. 2023
 * trees/rubbish - "a shit year for their data collection", Tate 2026-07-02).
 *
 * 2025 IS included: the OVERALL tab carries a 2025 national line, and THE RULE
 * takes MAX(baseline_2025, recorded_2025) per metric so a window that fully
 * contains calendar 2025 never drops below the stated 2025 national (e.g. trees
 * max(15,635, 15,940) = 15,940). Windows that only partially cover 2025 (Past
 * FY = Jul 2025 - Jun 2026) do NOT fully contain it, so they use recorded only
 * and are unaffected. 2026 is deliberately omitted: it is the live granular
 * year with no national lump; recorded stands alone.
 * <!-- source: drafts/coexist-impact-parity/DESIGN.md s0 OVERALL tab -->
 */
export interface YearNationalBaseline {
  attendees: number | null
  events: number | null
  trees: number | null
  rubbish_kg: number | null
  hours: number | null
}

export const PER_YEAR_NATIONAL_BASELINES: Record<number, YearNationalBaseline> = {
  2022: { attendees: 12,    events: 4,   trees: 17_300, rubbish_kg: 1_370,    hours: null },
  2023: { attendees: 250,   events: 24,  trees: null,   rubbish_kg: null,     hours: null },
  2024: { attendees: 1_824, events: 120, trees: 3_702,  rubbish_kg: 1_830,    hours: null },
  2025: { attendees: 3_134, events: 192, trees: 15_635, rubbish_kg: 1_691.34, hours: null },
}

/** The oldest era with real per-collective / per-date granular rows. */
export const GRANULAR_ERA_START = '2025-01-01'

/**
 * Map an ObservationFilters metric key to the baseline metric axis. Only the
 * five axes the baselines carry are mappable; anything else has no baseline
 * floor (returns undefined -> recorded value stands alone).
 */
export type BaselineMetricAxis = keyof YearNationalBaseline
export function baselineAxisForMetric(key: string): BaselineMetricAxis | undefined {
  switch (key) {
    case 'trees_planted': return 'trees'
    case 'rubbish_kg':    return 'rubbish_kg'
    case 'hours_total':   return 'hours'
    default:              return undefined
  }
}

/**
 * The whole-history national floor for the ALL-TIME window (the undated
 * app_settings lumps). Overridable from app_settings by the caller.
 */
export interface WholeHistoryBaseline {
  attendees: number
  events: number
  trees: number
  rubbish_kg: number
  hours: number
}

/**
 * The calendar date (YYYY-MM-DD) of an ISO-ish timestamp, read from its DATE
 * PART directly (not via a Date instant). Comparing on the calendar date avoids
 * a timezone off-by-one: `new Date('2022-01-01T00:00:00.000Z')` is a UTC instant
 * that, on a host behind UTC, sorts BEFORE a locally-built `new Date(2022,0,1)`,
 * which made a window starting exactly on 1 Jan fail the "fully contains" test
 * and silently drop that year's baseline (2022's 17,300 trees). The window
 * bounds are always ISO strings whose leading 10 chars are the calendar date.
 */
function calendarDatePart(iso: string): string {
  // Fast path: 'YYYY-MM-DD...' - take the first 10 chars.
  if (/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso.slice(0, 10)
  // Fallback for any other parseable form: format from the Date's UTC fields.
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

/**
 * Which baseline years the window [from, to] FULLY contains. A calendar year Y
 * is fully contained iff `from <= Y-01-01` AND `to >= Y-12-31`, compared as
 * CALENDAR DATES (inclusive on both ends). Lexicographic comparison of
 * YYYY-MM-DD strings is exact and timezone-proof, so a window starting on
 * 1 Jan of Y (e.g. 2022-01-01) correctly includes Y.
 */
export function fullyContainedBaselineYears(
  fromIso: string | null,
  toIso: string | null,
): number[] {
  // Open bounds: -Infinity start / "today" end.
  const fromDate = fromIso ? calendarDatePart(fromIso) : '0000-01-01'
  const toDate = toIso ? calendarDatePart(toIso) : calendarDatePart(new Date().toISOString())
  const years: number[] = []
  for (const yearStr of Object.keys(PER_YEAR_NATIONAL_BASELINES)) {
    const year = Number(yearStr)
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`
    if (fromDate <= yearStart && toDate >= yearEnd) years.push(year)
  }
  return years.sort((a, b) => a - b)
}

/**
 * THE RULE, composed PER YEAR then summed (the honest multi-year formula).
 *
 *   displayed(metric, window)
 *     = SUM over each fully-contained pre-2025 baseline year of
 *         MAX(baseline_year_metric, recorded_year_metric)
 *     + SUM of recorded for every OTHER year in the window (baseline-less
 *       years like 2026, plus any partial-year edge portion - national
 *       baselines cannot be sub-divided within a year, so a partial year uses
 *       its in-window recorded rows only).
 *
 * Applying MAX per year (not one grand total-vs-total MAX) is what stops a
 * baseline-only year (e.g. 2022 trees 17,300 with zero event rows) from being
 * silently dropped when the grand recorded total already exceeds the grand
 * baseline total. It is still a MAX per year, never baseline+recorded, so a
 * year cannot double-count.
 *
 * DUAL FLOOR (Tate's rule: a metric may NEVER show below what Kurt currently
 * shows). The per-year composition can, for some metrics, sum BELOW the single
 * whole-history app_settings lump (e.g. attendees per-year 12+250+1,824+3,134 =
 * 5,220 < the 5,500 whole-history lump). Since the lump is Kurt's stated
 * 2022-2025 total, the displayed figure must also be floored by it:
 *
 *   displayed = MAX( perYearComposed ,
 *                    wholeHistoryLump + recorded for years AFTER the baseline era )
 *
 * The lump floor only applies when the window fully contains the ENTIRE baseline
 * era (every year in PER_YEAR_NATIONAL_BASELINES) - the lump is a 2022-2025
 * aggregate that cannot be sliced to a narrower window. Post-era years (2026+)
 * are added on top because they are not inside the lump.
 *
 * @param recordedByYear  in-window recorded/estimated sum for this metric,
 *                        bucketed by the event's calendar year.
 * @param fullYears       the fully-contained baseline years (from
 *                        fullyContainedBaselineYears) whose national lump may
 *                        floor the recorded figure.
 * @param wholeHistoryLump optional whole-history app_settings lump for this
 *                        metric (covers 2022-2025). Applied as the second floor
 *                        only when the window fully contains the whole era.
 * @returns { total, provenance, byYear } where provenance is:
 *          'recorded'  - recorded met/exceeded the baseline (or no baseline
 *                        applied anywhere),
 *          'baseline'  - a baseline floor (per-year or whole-history lump) won,
 *          'no-data'   - nothing recorded and every applicable baseline year is
 *                        genuinely blank (render as no-data, never zero).
 */
export function composeMaxRuleTotal(
  metricAxis: BaselineMetricAxis,
  recordedByYear: Record<number, number>,
  fullYears: number[],
  wholeHistoryLump?: number,
): { total: number; provenance: 'recorded' | 'baseline' | 'no-data'; flooredYears: number[] } {
  const fullYearSet = new Set(fullYears)
  const seenYears = new Set<number>([
    ...fullYears,
    ...Object.keys(recordedByYear).map(Number),
  ])

  let total = 0
  let anyBaselineFloored = false
  let anyRecorded = false
  let anyBlankBaselineYear = false
  const flooredYears: number[] = []

  for (const year of seenYears) {
    const recorded = recordedByYear[year] ?? 0
    if (recorded > 0) anyRecorded = true

    const yb = PER_YEAR_NATIONAL_BASELINES[year]
    const baseline = fullYearSet.has(year) && yb ? yb[metricAxis] : undefined

    if (baseline == null) {
      // Baseline-less year (2026), partial-year edge, or genuinely-blank
      // baseline (2023 trees) -> recorded only. A blank baseline on a
      // fully-contained year with no recorded rows is a no-data signal.
      if (fullYearSet.has(year) && yb && yb[metricAxis] === null && recorded === 0) {
        anyBlankBaselineYear = true
      }
      total += recorded
      continue
    }

    const yearMax = Math.max(baseline, recorded)
    if (baseline > recorded) { anyBaselineFloored = true; flooredYears.push(year) }
    total += yearMax
  }

  // ── Second floor: the whole-history lump (Kurt's stated 2022-2025 total) ──
  // Only when the window fully contains the ENTIRE baseline era. The lump
  // alternative = lump + recorded for years strictly after the baseline era.
  const allBaselineYears = Object.keys(PER_YEAR_NATIONAL_BASELINES).map(Number)
  const lastBaselineYear = Math.max(...allBaselineYears)
  const containsWholeEra = allBaselineYears.every((yr) => fullYearSet.has(yr))
  if (wholeHistoryLump != null && wholeHistoryLump > 0 && containsWholeEra) {
    let postEraRecorded = 0
    for (const [yStr, v] of Object.entries(recordedByYear)) {
      if (Number(yStr) > lastBaselineYear) postEraRecorded += v
    }
    const lumpComposed = wholeHistoryLump + postEraRecorded
    if (lumpComposed > total) {
      total = lumpComposed
      anyBaselineFloored = true // the stated lump floored the figure up
    }
  }

  const provenance: 'recorded' | 'baseline' | 'no-data' =
    anyBaselineFloored ? 'baseline'
    : anyRecorded ? 'recorded'
    : anyBlankBaselineYear ? 'no-data'
    : 'recorded'

  return { total, provenance, flooredYears }
}

/**
 * THE RULE for a single year cell (year-over-year table), with a NO-DATA
 * sentinel. Given the national baseline for that (metric, year) - `null` when
 * the source is genuinely blank / absent - and the recorded in-year figure:
 *   - baseline present  -> MAX(baseline, recorded)  (always a number);
 *   - no baseline, recorded > 0 -> recorded (tracked);
 *   - no baseline, recorded == 0 -> null (NO DATA: untracked, render a dash,
 *     NEVER 0, matching the headline cards' no-data semantics).
 * A real tracked zero (recorded 0 WITH a baseline, or a 0 baseline) still
 * returns a number, so it renders as 0.
 */
export function yearCellValue(baseline: number | null | undefined, recorded: number): number | null {
  if (baseline == null) return recorded > 0 ? recorded : null
  return Math.max(baseline, recorded)
}

/**
 * The national-historical remainder for a per-collective breakdown. The
 * headline totals include the pre-2025 NATIONAL baselines (mainly 2022) that
 * have no per-collective attribution, so the collective rows sum below the
 * headline. This returns headline - sum(collective rows), clamped at 0, so a
 * single explicit "National historical" row makes the breakdown reconcile to
 * the headline exactly (collectives + remainder == headline, by construction).
 */
export function nationalHistoricalRemainder(
  headlineTotal: number,
  sumOfCollectiveRows: number,
): number {
  return Math.max(0, headlineTotal - sumOfCollectiveRows)
}

/* ------------------------------------------------------------------ */
/*  ONE canonical summary composition (every surface consumes this)    */
/* ------------------------------------------------------------------ */

/**
 * A single in-window impact row, normalised so the composition is
 * framework-agnostic and every surface can feed it from its own query. The
 * caller has already:
 *   - filtered to the window and status (cancelled EXCLUDED),
 *   - resolved the event calendar year,
 *   - resolved attendees/hours (numeric column, or the legacy-notes parse),
 *   - deduplicated nothing (events are counted by distinct eventId here).
 */
export interface CanonicalImpactRow {
  /** Event calendar year (from date_start). Drives the per-year MAX. */
  year: number
  /** Distinct event id (for the events count). */
  eventId: string
  /** Attendees for this row (0 if none). */
  attendees: number
  /** Volunteer hours for this row (0 if none). */
  hours: number
  /** Value of an impact metric key for this row (builtin or custom; 0 if none). */
  metric: (key: string) => number
}

export interface ComposeSummaryScope {
  /** The impact metric def keys to aggregate. */
  metricKeys: string[]
  /**
   * Apply the NATIONAL baseline floor (per-year MAX + dual whole-history lump).
   * TRUE only for an un-narrowed national view (no collective, no activity) -
   * baselines are national figures that cannot be sliced. FALSE for a
   * collective- or activity-scoped view -> pure recorded, no floor.
   */
  applyNationalBaseline: boolean
  /** Inclusive window start ISO (null = open / all-time). */
  effectiveStartIso: string | null
  /** Inclusive window end ISO. */
  windowEndIso: string
  /**
   * Whole-history national lumps (app_settings 2022-2025 totals) for the dual
   * floor. Only consulted when applyNationalBaseline and the window contains
   * the whole baseline era. Omit for a scoped view.
   */
  lump?: WholeHistoryBaseline | null
}

export interface ComposedSummary {
  metrics: Record<string, number>
  totalEvents: number
  totalAttendees: number
  totalEstimatedHours: number
  /**
   * Per-figure provenance. Keys: 'events','attendees','hours' + each metric
   * key. 'baseline' = a baseline floor won; 'recorded' = our data met/exceeded
   * it; 'no-data' = genuinely blank (render as no-data, never 0).
   */
  provenance: Record<string, 'recorded' | 'baseline' | 'no-data'>
}

/**
 * THE canonical max-rule summary composition. This is the ONE code path every
 * impact surface consumes (insights headline, member home, /admin overview,
 * /admin/impact, public stats). Given normalised in-window rows and the scope,
 * it returns the same numbers /admin/insights shows:
 *   - national un-narrowed: per-year MAX(baseline_year, recorded_year) via
 *     fullyContainedBaselineYears + composeMaxRuleTotal, plus the dual
 *     whole-history-lump floor, plus no-data provenance.
 *   - collective/activity scoped: recorded-only (no national floor).
 * Cancelled exclusion and window/status filtering are the CALLER's job (done in
 * the query), so this stays a pure, testable function shared across surfaces.
 */
export function composeSummaryMetrics(
  rows: CanonicalImpactRow[],
  scope: ComposeSummaryScope,
): ComposedSummary {
  const { metricKeys, applyNationalBaseline, effectiveStartIso, windowEndIso, lump } = scope

  const fullYears = applyNationalBaseline
    ? fullyContainedBaselineYears(effectiveStartIso, windowEndIso)
    : []

  const lumpFor = (axis: BaselineMetricAxis): number | undefined => {
    if (!applyNationalBaseline || !lump) return undefined
    return lump[axis]
  }

  // Bucket a metric by year across the rows.
  const byYearForMetric = (key: string): Record<number, number> => {
    const out: Record<number, number> = {}
    for (const r of rows) out[r.year] = (out[r.year] ?? 0) + (r.metric(key) || 0)
    return out
  }

  const metrics: Record<string, number> = {}
  const provenance: Record<string, 'recorded' | 'baseline' | 'no-data'> = {}
  for (const key of metricKeys) {
    const axis = baselineAxisForMetric(key)
    if (!axis) {
      const recorded = rows.reduce((s, r) => s + (r.metric(key) || 0), 0)
      metrics[key] = recorded
      provenance[key] = recorded > 0 ? 'recorded' : 'no-data'
      continue
    }
    const composed = composeMaxRuleTotal(axis, byYearForMetric(key), fullYears, lumpFor(axis))
    metrics[key] = composed.total
    provenance[key] = composed.provenance
  }

  // Summary-level axes (events / attendees / hours).
  const attendeesByYear: Record<number, number> = {}
  const hoursByYear: Record<number, number> = {}
  const eventIdsByYear = new Map<number, Set<string>>()
  for (const r of rows) {
    attendeesByYear[r.year] = (attendeesByYear[r.year] ?? 0) + (r.attendees || 0)
    hoursByYear[r.year] = (hoursByYear[r.year] ?? 0) + (r.hours || 0)
    let s = eventIdsByYear.get(r.year)
    if (!s) { s = new Set(); eventIdsByYear.set(r.year, s) }
    s.add(r.eventId)
  }
  const eventsByYear: Record<number, number> = {}
  for (const [y, s] of eventIdsByYear) eventsByYear[y] = s.size

  const ev = composeMaxRuleTotal('events', eventsByYear, fullYears, applyNationalBaseline && lump ? lump.events : undefined)
  const at = composeMaxRuleTotal('attendees', attendeesByYear, fullYears, applyNationalBaseline && lump ? lump.attendees : undefined)
  const hr = composeMaxRuleTotal('hours', hoursByYear, fullYears, applyNationalBaseline && lump ? lump.hours : undefined)

  provenance['events'] = ev.provenance
  provenance['attendees'] = at.provenance
  provenance['hours'] = hr.provenance

  return {
    metrics,
    totalEvents: Math.round(ev.total),
    totalAttendees: Math.round(at.total),
    totalEstimatedHours: Math.round(hr.total),
    provenance,
  }
}

/* ------------------------------------------------------------------ */
/*  ONE canonical fetch+normalise (client-injected)                    */
/* ------------------------------------------------------------------ */

/** Parse a legacy-import attendee count from the notes text, if present. */
function parseLegacyAttendance(notes: unknown): number {
  if (typeof notes !== 'string') return 0
  const m = notes.match(/Legacy import:\s*(\d+)\s*attendees/)
  return m ? parseInt(m[1], 10) : 0
}

export interface CanonicalFetchScope {
  /** Filter to a single collective (national when omitted). */
  collectiveId?: string
  /** Filter to a single activity type. */
  activityType?: string
  /** Inclusive window start ISO (null/undefined = open lower bound). */
  effectiveStartIso?: string | null
  /** Inclusive window end ISO (defaults to now). */
  windowEndIso?: string
}

export interface CanonicalFetchResult {
  rows: CanonicalImpactRow[]
  /** Distinct event ids in scope (for cleanup-site / secondary queries). */
  eventIds: string[]
  /** event_id -> collective_id, for a per-collective breakdown. */
  collectiveByEvent: Map<string, string>
}

/**
 * THE ONE fetch+normalise path. Resolves in-window, NON-CANCELLED
 * (published/completed) events for the scope, joins their live + legacy impact
 * rows, and returns normalised CanonicalImpactRow[] ready for
 * composeSummaryMetrics. Every surface (member home, /admin, /admin/impact,
 * public stats) uses this so they read the exact same rows the insights page
 * composes from. Client-injected (like fetchImpactRows) so shared/ imports no
 * runtime @supabase package.
 */
export async function fetchCanonicalImpactRows(
  client: ImpactClient,
  scope: CanonicalFetchScope = {},
): Promise<CanonicalFetchResult> {
  const nowIso = new Date().toISOString()
  const windowEndIso = scope.windowEndIso ?? nowIso
  const effectiveStart = scope.effectiveStartIso ?? null

  // Step 1: resolve in-window, non-cancelled events for the scope.
  let eventsQuery = client
    .from('events')
    .select('id, date_start, collective_id')
    .in('status', ['published', 'completed'])
    .lt('date_start', nowIso)
  if (effectiveStart) eventsQuery = eventsQuery.gte('date_start', effectiveStart)
  eventsQuery = eventsQuery.lte('date_start', windowEndIso)
  if (scope.collectiveId) eventsQuery = eventsQuery.eq('collective_id', scope.collectiveId)
  if (scope.activityType) eventsQuery = eventsQuery.eq('activity_type', scope.activityType)

  const { data: eventsData, error: eventsErr } = await eventsQuery
  if (eventsErr) throw eventsErr

  type EventRow = { id: string; date_start: string | null; collective_id: string | null }
  const eventById = new Map<string, EventRow>()
  const collectiveByEvent = new Map<string, string>()
  for (const e of (eventsData ?? []) as EventRow[]) {
    eventById.set(e.id, e)
    if (e.collective_id) collectiveByEvent.set(e.id, e.collective_id)
  }
  const eventIds = [...eventById.keys()]
  if (eventIds.length === 0) return { rows: [], eventIds: [], collectiveByEvent }

  // Step 2: fetch impact rows (live + legacy) for those events, chunked.
  const CHUNK = 200
  const impactRows: (Record<string, unknown> & { event_id: string })[] = []
  for (let i = 0; i < eventIds.length; i += CHUNK) {
    const chunk = eventIds.slice(i, i + CHUNK)
    const { data, error } = await client
      .from('event_impact')
      .select(`${IMPACT_SELECT_COLUMNS}, event_id`)
      .in('event_id', chunk)
      .range(0, 9999)
    if (error) throw error
    impactRows.push(...((data ?? []) as (Record<string, unknown> & { event_id: string })[]))
  }

  // Step 3: normalise to canonical rows (year from event date_start).
  const rows: CanonicalImpactRow[] = []
  for (const r of impactRows) {
    const ev = eventById.get(r.event_id)
    if (!ev) continue
    const year = new Date(ev.date_start ?? '').getFullYear()
    const attendees = r.attendees != null ? Number(r.attendees) || 0 : parseLegacyAttendance(r.notes)
    const hours = Number(r.hours_total) || 0
    rows.push({
      year,
      eventId: r.event_id,
      attendees,
      hours,
      metric: (key: string) => {
        if (BUILTIN_COLUMNS.has(key)) return Number(r[key]) || 0
        const cm = r.custom_metrics as Record<string, unknown> | null
        return Number(cm?.[key]) || 0
      },
    })
  }
  return { rows, eventIds, collectiveByEvent }
}

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
export async function fetchImpactRows(
  client: ImpactClient,
  scope: ImpactScope = {},
): Promise<FetchImpactResult> {
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
    const { data: hostRows, error: hostsErr } = await client
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
      let q = client
        .from('events')
        .select('id')
        .in('id', candidateIds)
        .lt('date_start', now)
      if (!includeLegacy) q = q.in('status', ['published', 'completed'])
      if (effectiveStart) q = q.gte('date_start', effectiveStart)
      const { data: eventRows, error: eventsErr } = await q
      if (eventsErr) throw eventsErr

      const matchedIds = ((eventRows ?? []) as { id: string }[]).map((e) => e.id)
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
      let q = client
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
      resolvedEventIds = ((allEventsRes.data ?? []) as { id: string }[]).map((e) => e.id)
      eventCount = realEventsRes.count ?? 0
    } else {
      const eventsRes = await buildQuery(true)
      if (eventsRes.error) throw eventsRes.error
      resolvedEventIds = ((eventsRes.data ?? []) as { id: string }[]).map((e) => e.id)
      eventCount = eventsRes.count ?? 0
    }
  } else {
    // National / global - apply the baselineDate floor unconditionally.
    //
    // The BASELINE_* constants are the canonical pre-2026 totals (Tate's sheet:
    // 2022 + 2024 + 2025). Live rows attached to pre-2026 events would
    // double-count against those baselines, so we exclude them here and let
    // callers add the BASELINE constant on top.
    //
    // Note: legacy rows on POST-2026 events (data-entry mis-flags) are picked
    // up here too. That's fine - they go in legacyRows, callers can subtract
    // them from the baseline remainder. There aren't many.
    const eventsRes = await client
      .from('events')
      .select('id', { count: 'exact' })
      .in('status', ['published', 'completed'])
      .lt('date_start', now)
      .gte('date_start', baselineDate)
    if (eventsRes.error) throw eventsRes.error

    resolvedEventIds = ((eventsRes.data ?? []) as { id: string }[]).map((e) => e.id)
    eventCount = eventsRes.count ?? 0
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
        client
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
export async function fetchBaselineSettings(client: ImpactClient): Promise<{
  attendees: number
  events: number
  trees: number
  rubbishKg: number
  hours: number
  /** Per-year tree breakdown sourced from app_settings per-year keys. */
  treesByYear: { year: number; trees: number }[]
}> {
  const { data } = await client
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
  client: ImpactClient,
  year: 2022 | 2024 | 2025,
): Promise<{ trees: number; events: number; attendees: number; hours: number }> {
  const { data } = await client
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
