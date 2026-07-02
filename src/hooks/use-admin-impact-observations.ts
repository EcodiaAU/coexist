import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { IMPACT_SELECT_COLUMNS, sumMetric, isBuiltinMetric } from '@/lib/impact-metrics'
import type { ImpactMetricDef } from '@/lib/impact-metrics'
import { getDateRangeBounds, type DateRange } from '@/hooks/use-admin-dashboard'
import { wallClockNow } from '@/lib/date-format'
import {
  IMPACT_BASELINE_DATE,
  GRANULAR_ERA_START,
  PER_YEAR_NATIONAL_BASELINES,
  BASELINE_TREES,
  BASELINE_RUBBISH_KG,
  BASELINE_EVENTS,
  BASELINE_ATTENDEES,
  BASELINE_HOURS,
  baselineAxisForMetric,
  fullyContainedBaselineYears,
  yearCellValue,
  composeSummaryMetrics,
  fetchBaselineSettings,
} from '@/lib/impact-query'
import type { CanonicalImpactRow } from '@/lib/impact-query'
import type { Database } from '@/types/database.types'

type ActivityType = Database['public']['Enums']['activity_type']

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ObservationFilters {
  dateRange: DateRange
  /** Single-collective scope (legacy; still honoured by the dashboard tab). */
  collectiveId?: string
  /**
   * Multi-collective scope. When non-empty this takes precedence over
   * `collectiveId` and the query returns the combined stats of every listed
   * collective. Empty/absent means "all collectives" (national view).
   */
  collectiveIds?: string[]
  activityType?: ActivityType
  search?: string
  /** yyyy-mm-dd, inclusive. Only read when dateRange === 'custom'. */
  customStart?: string
  /** yyyy-mm-dd, inclusive (widened to end-of-day). Only read when dateRange === 'custom'. */
  customEnd?: string
}

export interface EventImpactRow {
  eventId: string
  title: string
  date: string
  collectiveName: string
  collectiveId: string
  activityType: ActivityType
  /** All metric values keyed by metric def key (builtin + custom) */
  metrics: Record<string, number | null>
  notes: string | null
  isLegacy: boolean
  attendance: number | null
  estimatedVolHours: number | null
}

export interface CollectiveBreakdown {
  collectiveId: string
  name: string
  eventCount: number
  attendees: number
  /** Aggregated metric totals keyed by metric def key */
  metrics: Record<string, number>
  estimatedHours: number
  /**
   * True when this collective's figures for the window are pre-2025
   * leader-reported estimates (the 11 synthetic 2024 "Historical Data
   * Backfill" lumps), NOT real per-event recorded data. The UI must label
   * these clearly as low-confidence estimates.
   */
  isEstimate?: boolean
}

export interface YearSummary {
  year: number
  /** null = no data recorded (untracked, no baseline) - render as a dash, not 0. */
  events: number | null
  attendees: number | null
  estimatedHours: number | null
  /**
   * Aggregated metric totals keyed by metric def key. A `null` cell means the
   * metric was genuinely NOT tracked that year (no baseline, no recorded rows)
   * and must render as "no data recorded", never 0. A numeric 0 is a real
   * tracked zero.
   */
  metrics: Record<string, number | null>
}

/**
 * How much to trust the figures for the selected window, driven by the era it
 * spans (DESIGN.md s6):
 *  - 'granular'  : window sits entirely on/after 2025-01-01 -> real per-event,
 *                  per-collective, per-date data. Full fidelity.
 *  - 'mixed'     : window overlaps both the granular era and a pre-2025 era.
 *  - 'national'  : window is entirely pre-2025 -> national annual lumps only,
 *                  cannot be sliced by collective or by date within the year.
 */
export type WindowConfidence = 'granular' | 'mixed' | 'national'

/** Per-figure provenance so the UI can honestly label estimates. */
export type FigureProvenance = 'recorded' | 'baseline' | 'estimate' | 'no-data'

export interface ImpactSummary {
  totalEvents: number
  totalAttendees: number
  totalEstimatedHours: number
  /** Aggregated metric totals keyed by metric def key */
  metrics: Record<string, number>
  /**
   * Per-figure provenance. Keys: 'events','attendees','hours' + each metric
   * def key. 'baseline' means THE RULE floored the figure at the org's stated
   * baseline (recorded was lower or absent); 'recorded' means our data met or
   * exceeded it; 'no-data' means the source is genuinely blank for the window
   * (render as no-data, never zero); 'estimate' is reserved for leader-reported
   * pre-2025 collective figures surfaced in the drill-down.
   */
  provenance: Record<string, FigureProvenance>
}

export interface ObservationsMeta {
  /** Confidence band for the whole window (drives the UI chip). */
  confidence: WindowConfidence
  /**
   * True when the per-collective drill-down for this window is trustworthy
   * real per-event data (window on/after the granular era). When false, any
   * per-collective figures are pre-2025 leader-reported ESTIMATES.
   */
  collectiveBreakdownTrustworthy: boolean
  /** Pre-2025 calendar years fully inside the window (national-lump only). */
  nationalOnlyYears: number[]
}

export interface DataQuality {
  eventsWithoutImpact: number
  zeroMetricEvents: number
  legacyCount: number
  appCount: number
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SEED_ADMIN = 'a0000000-0000-0000-0000-000000000001'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseAttendance(notes: string | null): number | null {
  if (!notes) return null
  const m = notes.match(/Legacy import:\s*(\d+)\s*attendees/)
  return m ? parseInt(m[1]) : null
}

/**
 * Year-table row filter: keep only rows whose event is NOT cancelled. Keeps the
 * year-over-year aggregation aligned with the headline (which counts only
 * published/completed events). A missing status is treated as included (the DB
 * query already scopes status; this is a defensive in-memory guard).
 */
export function excludeCancelledYoY(
  row: { events: { status?: string } | null },
): boolean {
  return row.events?.status !== 'cancelled'
}

/** Extract a single metric value from a raw impact row */
function getMetricValue(row: Record<string, unknown>, key: string): number | null {
  if (isBuiltinMetric(key)) {
    const v = row[key]
    return v != null ? Number(v) || 0 : null
  }
  // Custom metric - inside custom_metrics jsonb
  const cm = row.custom_metrics as Record<string, unknown> | null
  const v = cm?.[key]
  return v != null ? Number(v) || 0 : null
}

/* ------------------------------------------------------------------ */
/*  Main observations hook                                             */
/* ------------------------------------------------------------------ */

type RawRow = Record<string, unknown> & {
  events: {
    id: string
    title: string
    date_start: string
    date_end: string | null
    collective_id: string
    activity_type: ActivityType
    created_by: string
    collectives: { name: string } | null
  }
}

/**
 * Fetches event_impact rows and aggregates them using the provided metric defs.
 * Pass activeDefs from useImpactMetricDefs() so the hook aggregates both
 * builtin and custom metrics dynamically.
 */
export function useImpactObservations(filters: ObservationFilters, metricDefs: ImpactMetricDef[]) {
  return useQuery({
    queryKey: ['admin-impact-observations', filters, metricDefs.map((d) => d.key)],
    queryFn: async () => {
      const isCustom = filters.dateRange === 'custom'
      // Guard: a custom range with missing or inverted dates must NOT fire a
      // query - without an end bound it would silently widen to all events
      // since the baseline and report misleading numbers. Return an empty
      // result until both ends are valid (start <= end).
      if (isCustom && (!filters.customStart || !filters.customEnd || filters.customStart > filters.customEnd)) {
        return {
          rows: [] as EventImpactRow[],
          summary: { totalEvents: 0, totalAttendees: 0, totalEstimatedHours: 0, metrics: {}, provenance: {} } as ImpactSummary,
          collectiveBreakdown: [] as CollectiveBreakdown[],
          meta: { confidence: 'granular', collectiveBreakdownTrustworthy: true, nationalOnlyYears: [] } as ObservationsMeta,
        }
      }
      // Resolve the effective collective scope. `collectiveIds` (multi-select)
      // wins when present; otherwise fall back to the single `collectiveId`.
      // An empty result means the national ("all collectives") view.
      const collectiveIds = filters.collectiveIds?.length
        ? filters.collectiveIds
        : (filters.collectiveId ? [filters.collectiveId] : [])
      const hasCollectiveScope = collectiveIds.length > 0

      const bounds = getDateRangeBounds(filters.dateRange, filters.customStart, filters.customEnd)
      const rangeStart = bounds.start
      // Inclusive end-of-day ISO for a custom window; null (open end = "now")
      // for every other range, preserving the legacy start-only behaviour.
      const customEndIso = bounds.end
      const isAllTime = filters.dateRange === 'all'

      // Always include legacy rows on any all-time view, regardless of
      // whether a collective filter is applied. This is the only way to
      // keep stats consistent across surfaces (per Tate 2026-05-19):
      // Brisbane in the national breakdown row MUST show the same numbers
      // as Brisbane shown in the filtered summary card. Previously legacy
      // was gated to collective-scoped views, which made the per-collective
      // numbers in the national breakdown table differ from the same
      // collective's numbers in the filtered view.
      //
      // To avoid double-counting pre-2026 history (the doubling bug the
      // gate was originally added to fix), the national summary now adds
      // a BASELINE REMAINDER rather than the full BASELINE constants.
      // Remainder = max(0, BASELINE - sum_of_legacy_rows). When the legacy
      // imports cover most of pre-2026 history, the remainder shrinks
      // toward zero and the national total = sum(live + legacy) +
      // remainder = sum(live + legacy) + leftover_unimported_history.
      //
      // Legacy (Forms-imported) rows are NOT necessarily pre-2026: the
      // migration imported real events dated all through 2025 (e.g. Melbourne's
      // Aug-Nov 2025 tree plantings) as "Legacy import" rows. A scoped/custom
      // window that overlaps those dates (a financial year, "this year", a
      // custom range reaching back into 2025) MUST count them - they are real
      // events inside the window. We always fetch legacy for the in-window
      // events; because the events query is already date-bounded, a legacy row
      // only ever comes back for an event whose date_start is inside the
      // window, so there is no risk of pre-window pollution. Baseline is only
      // ever added on the all-time national view, so counting legacy on a
      // scoped range never double-counts against a baseline.
      // THE RULE (Tate 2026-07-02): displayed = GREATEST(baseline, recorded),
      // per metric, per window, never below baseline. The baseline floor
      // applies whenever the window has NO collective / activity narrowing
      // (baselines are national figures that cannot be sliced by collective or
      // activity - DESIGN.md s6). It is a MAX over recorded, computed once, so
      // it can never double-count. This replaces the old baseline-REMAINDER +
      // proportional-share machinery, whose sum-based shape carried the
      // double-count risk flagged in insights.patch.
      const applyNationalBaseline = !hasCollectiveScope && !filters.activityType
      const includeLegacy = true
      const effectiveStart = rangeStart
        ?? (includeLegacy ? null : new Date(IMPACT_BASELINE_DATE).toISOString())
      const nowIso = new Date().toISOString()
      // Window upper bound for the baseline-floor year-containment test.
      const windowEndIso = customEndIso ?? nowIso

      // ── Step 1: resolve event IDs matching filters ──
      //
      // Previously this query used embedded PostgREST filters
      // (`events!inner(...).eq('events.collective_id', id)`). The canonical
      // fetchImpactRows explicitly avoids that pattern - see impact-query.ts
      // doc comment: "embedded PostgREST join filters are unreliable for
      // scoping". This was the root cause of /admin/impact showing unfiltered
      // (effectively national) numbers when a collective was selected.
      //
      // The two-step approach - filter events first, then fetch impact rows
      // scoped to those IDs - is reliable and matches the rest of the codebase.
      let eventsQuery = supabase
        .from('events')
        .select('id, title, date_start, date_end, collective_id, activity_type, created_by, collectives(name)')
        .in('status', ['published', 'completed'])
        .lt('date_start', nowIso)
      if (effectiveStart) eventsQuery = eventsQuery.gte('date_start', effectiveStart)
      // Custom range upper bound: cap at the selected end-of-day. The .lt(now)
      // bound above still holds (events "held" are past events); for a custom
      // window ending in the past this is the tighter, decisive bound.
      if (customEndIso) eventsQuery = eventsQuery.lte('date_start', customEndIso)
      if (hasCollectiveScope) {
        eventsQuery = collectiveIds.length === 1
          ? eventsQuery.eq('collective_id', collectiveIds[0])
          : eventsQuery.in('collective_id', collectiveIds)
      }
      if (filters.activityType) eventsQuery = eventsQuery.eq('activity_type', filters.activityType)

      // The per-year national baselines THE RULE floors against are the
      // canonical OVERALL-tab figures in PER_YEAR_NATIONAL_BASELINES (the
      // app_settings per-year keys are unreliable for non-trees axes - see
      // DESIGN.md s0). We ALSO read the whole-history app_settings lumps
      // (2022-2025 totals) as the SECOND floor so a per-year composition can
      // never drop a headline metric below Kurt's stated figure (dual floor).
      const [eventsResult, baselineSettings] = await Promise.all([
        eventsQuery,
        applyNationalBaseline ? fetchBaselineSettings() : Promise.resolve(null),
      ])
      const { data: eventsData, error: eventsErr } = eventsResult
      if (eventsErr) throw eventsErr

      // Whole-history lump per metric axis (app_settings, with constant
      // fallbacks). Only used when the window fully contains the whole 2022-2025
      // baseline era (composeMaxRuleTotal enforces that).
      const lump = {
        trees:      baselineSettings?.trees     ?? BASELINE_TREES,
        rubbish_kg: baselineSettings?.rubbishKg ?? BASELINE_RUBBISH_KG,
        events:     baselineSettings?.events    ?? BASELINE_EVENTS,
        attendees:  baselineSettings?.attendees ?? BASELINE_ATTENDEES,
        hours:      baselineSettings?.hours     ?? BASELINE_HOURS,
      }
      const eventById = new Map<string, RawRow['events']>()
      for (const e of eventsData ?? []) {
        eventById.set(e.id, e as unknown as RawRow['events'])
      }
      const eventIds = [...eventById.keys()]

      // ── Step 2: fetch impact rows for those event IDs (chunked) ──
      //
      // When includeLegacy is true, we make a second pass per chunk that
      // fetches ONLY legacy rows (notes LIKE 'Legacy import:%') - these
      // carry pre-2026 historical attendance/metrics for the events in
      // scope (typically backfill events attached to a collective).
      type ImpactRowRaw = Record<string, unknown> & { event_id: string }
      const CHUNK = 200
      const liveImpactRows: ImpactRowRaw[] = []
      const legacyImpactRows: ImpactRowRaw[] = []
      if (eventIds.length > 0) {
        for (let i = 0; i < eventIds.length; i += CHUNK) {
          const chunk = eventIds.slice(i, i + CHUNK)
          const liveQ = supabase
            .from('event_impact')
            .select(`${IMPACT_SELECT_COLUMNS}, event_id`)
            .in('event_id', chunk)
            .or('notes.is.null,notes.not.like.Legacy import:%')
            .order('logged_at', { ascending: false })
          const legacyQ = includeLegacy
            ? supabase
                .from('event_impact')
                .select(`${IMPACT_SELECT_COLUMNS}, event_id`)
                .in('event_id', chunk)
                .like('notes', 'Legacy import:%')
            : null
          const [{ data: liveData, error: liveErr }, legacyRes] = await Promise.all([
            liveQ,
            legacyQ ?? Promise.resolve({ data: null, error: null }),
          ])
          if (liveErr) throw liveErr
          if (legacyRes.error) throw legacyRes.error
          // Cast through unknown: select() template-string type parser
          // can't statically validate our dynamic column list.
          liveImpactRows.push(...((liveData ?? []) as unknown as ImpactRowRaw[]))
          legacyImpactRows.push(...((legacyRes.data ?? []) as unknown as ImpactRowRaw[]))
        }
      }

      // Reattach event info by joining in-memory.
      const rawRows: RawRow[] = []
      for (const r of liveImpactRows) {
        const ev = eventById.get(r.event_id)
        if (!ev) continue
        rawRows.push({ ...r, events: ev } as RawRow)
      }
      const legacyRawRows: RawRow[] = []
      for (const r of legacyImpactRows) {
        const ev = eventById.get(r.event_id)
        if (!ev) continue
        legacyRawRows.push({ ...r, events: ev } as RawRow)
      }

      const searchLower = filters.search?.toLowerCase()
      const filtered = searchLower
        ? rawRows.filter((r) => r.events.title.toLowerCase().includes(searchLower))
        : rawRows
      // Apply the same title search to legacy rows - otherwise summary totals
      // diverge from the displayed row list when the user searches.
      const filteredLegacy = searchLower
        ? legacyRawRows.filter((r) => r.events.title.toLowerCase().includes(searchLower))
        : legacyRawRows

      const metricKeys = metricDefs.map((d) => d.key)

      // Transform a raw impact row into an EventImpactRow.
      const toRow = (r: RawRow): EventImpactRow => {
        const parsed = parseAttendance(r.notes as string | null)
        const estimatedVolHours = Number(r.hours_total) || null

        const metrics: Record<string, number | null> = {}
        for (const key of metricKeys) {
          metrics[key] = getMetricValue(r, key)
        }

        // Prefer the explicit attendees column; only fall back to parsed notes
        // when attendees is null/undefined. Using `||` here would lose a
        // legitimate zero attendance and silently substitute the notes parse.
        const attendanceFinal = r.attendees != null
          ? Number(r.attendees) || 0
          : parsed

        return {
          eventId: r.events.id,
          title: r.events.title,
          date: r.events.date_start,
          collectiveName: r.events.collectives?.name ?? 'Unknown',
          collectiveId: r.events.collective_id,
          activityType: r.events.activity_type,
          metrics,
          notes: r.notes as string | null,
          isLegacy:
            r.events.created_by === SEED_ADMIN ||
            ((r.notes as string) ?? '').startsWith('Legacy import'),
          attendance: attendanceFinal,
          estimatedVolHours,
        }
      }

      // Live rows always list. On a scoped/custom range, legacy (Forms-imported)
      // events inside the window are real events the user expects to see, so
      // list them too - otherwise the summary counts them but the raw-data table
      // omits them, and the two disagree. On the all-time view we keep the
      // established behaviour (legacy folds into the summary + breakdown via the
      // baseline model, but is not enumerated per-event in the row list).
      const rows: EventImpactRow[] = [
        ...filtered.map(toRow),
        ...(!isAllTime ? filteredLegacy.map(toRow) : []),
      ]

      // ── Summary under THE RULE via the ONE shared composition ──
      //
      // Build normalised in-window rows (live + legacy - both are real dated
      // events; cancelled already excluded by the events query) and hand them
      // to composeSummaryMetrics in shared/impact-core.ts. This is the single
      // code path every impact surface consumes, so /admin/insights and every
      // other surface report identical numbers for the same scope.
      const eventYear = (dateStart: string | null | undefined): number =>
        new Date(dateStart ?? '').getFullYear()
      const toCanonical = (r: RawRow, legacy: boolean): CanonicalImpactRow => ({
        year: eventYear(r.events.date_start),
        eventId: (legacy ? (r.event_id as string) : r.events.id),
        attendees: r.attendees != null
          ? Number(r.attendees) || 0
          : (legacy ? (parseAttendance(r.notes as string | null) ?? 0) : 0),
        hours: Number(r.hours_total) || 0,
        metric: (key: string) => getMetricValue(r, key) ?? 0,
      })
      const canonicalRows: CanonicalImpactRow[] = [
        ...filtered.map((r) => toCanonical(r, false)),
        ...filteredLegacy.map((r) => toCanonical(r, true)),
      ]

      const composed = composeSummaryMetrics(canonicalRows, {
        metricKeys,
        applyNationalBaseline,
        effectiveStartIso: effectiveStart,
        windowEndIso,
        lump: applyNationalBaseline ? lump : null,
      })

      const summary: ImpactSummary = {
        totalEvents:         composed.totalEvents,
        totalAttendees:      composed.totalAttendees,
        totalEstimatedHours: composed.totalEstimatedHours,
        metrics:             composed.metrics,
        provenance:          composed.provenance as Record<string, FigureProvenance>,
      }

      // Collective breakdown - fold both live event rows and legacy imports.
      // Legacy rows are per-collective historical aggregates attached to
      // backfill events; on an all-time view they should be visible in the
      // breakdown so collectives with pre-2026 history aren't under-counted.
      const byCollective = new Map<string, CollectiveBreakdown>()
      for (const r of rows) {
        const existing = byCollective.get(r.collectiveId)
        if (existing) {
          existing.eventCount++
          existing.attendees += r.attendance ?? 0
          existing.estimatedHours += r.estimatedVolHours ?? 0
          for (const key of metricKeys) {
            existing.metrics[key] = (existing.metrics[key] ?? 0) + (r.metrics[key] ?? 0)
          }
        } else {
          const metrics: Record<string, number> = {}
          for (const key of metricKeys) {
            metrics[key] = r.metrics[key] ?? 0
          }
          byCollective.set(r.collectiveId, {
            collectiveId: r.collectiveId,
            name: r.collectiveName,
            eventCount: 1,
            attendees: r.attendance ?? 0,
            metrics,
            estimatedHours: r.estimatedVolHours ?? 0,
          })
        }
      }
      // Fold legacy rows into the breakdown. Each distinct legacy event_id is
      // a distinct historical event that was imported via backfill, so we
      // bump eventCount once per unique legacy event_id per collective. This
      // keeps the breakdown row's eventCount consistent with the summary
      // card's totalEvents (which uses uniqueEventIds including legacy event
      // ids). Without it, selecting a collective produced one number in the
      // summary (e.g. Brisbane = 36 events) and a different number in the
      // breakdown table (Brisbane = 11 events) for the same query.
      //
      // ONLY on the all-time view: there `rows` holds live rows only, so legacy
      // needs a separate fold. On a scoped/custom range `rows` already includes
      // the in-window legacy events (see the toRow concat above), so the loop
      // over `rows` already folded them - folding filteredLegacy again would
      // double-count attendees/metrics for those collectives.
      const legacyEventIdsByCollective = new Map<string, Set<string>>()
      if (isAllTime) for (const r of filteredLegacy) {
        const ev = r.events as unknown as RawRow['events'] | undefined
        if (!ev) continue
        const collectiveId = ev.collective_id
        const collectiveName = ev.collectives?.name ?? 'Unknown'
        const parsedAtt = r.attendees != null
          ? Number(r.attendees) || 0
          : (parseAttendance(r.notes as string | null) ?? 0)
        const hours = Number(r.hours_total) || 0
        // Track distinct legacy event ids per collective so we count
        // historical events once even if a backfill carried multiple rows.
        let legacyIds = legacyEventIdsByCollective.get(collectiveId)
        if (!legacyIds) {
          legacyIds = new Set<string>()
          legacyEventIdsByCollective.set(collectiveId, legacyIds)
        }
        const isFirstSightingOfEvent = !legacyIds.has(r.event_id as string)
        legacyIds.add(r.event_id as string)
        const existing = byCollective.get(collectiveId)
        if (existing) {
          if (isFirstSightingOfEvent && !rows.some((row) => row.eventId === r.event_id)) {
            // Bump eventCount only when this legacy event_id is NEW to this
            // collective AND wasn't already counted via a live impact row -
            // an event can have both a live and a legacy row (e.g. legacy
            // imported, then a leader logged additional impact); we don't
            // want to count it twice.
            existing.eventCount += 1
          }
          existing.attendees += parsedAtt
          existing.estimatedHours += hours
          for (const key of metricKeys) {
            existing.metrics[key] = (existing.metrics[key] ?? 0) + (getMetricValue(r, key) ?? 0)
          }
        } else {
          const metrics: Record<string, number> = {}
          for (const key of metricKeys) {
            metrics[key] = getMetricValue(r, key) ?? 0
          }
          byCollective.set(collectiveId, {
            collectiveId,
            name: collectiveName,
            // Live didn't have this collective at all - so this is the
            // first event we're counting for it.
            eventCount: 1,
            attendees: parsedAtt,
            metrics,
            estimatedHours: hours,
          })
        }
      }
      // Flag pre-2025 collectives as ESTIMATES. Real per-collective data only
      // exists from 2025-01-01 (the synthetic 2024 "Historical Data Backfill"
      // lumps are Charlie's manual leader-reported estimates, low confidence -
      // kept per Tate 2026-07-02 but never presented as exact recorded data).
      // A collective whose events are ALL pre-granular-era is an estimate; a
      // collective with any real 2025+ event is trustworthy for that portion.
      const collectiveHasGranular = new Map<string, boolean>()
      for (const r of rows) {
        const isGranular = (r.date ?? '') >= new Date(GRANULAR_ERA_START).toISOString()
        collectiveHasGranular.set(
          r.collectiveId,
          (collectiveHasGranular.get(r.collectiveId) ?? false) || isGranular,
        )
      }
      for (const c of byCollective.values()) {
        // Only pre-2025 collectives (no granular event at all) are estimates.
        if (c.eventCount > 0 && collectiveHasGranular.get(c.collectiveId) === false) {
          c.isEstimate = true
        }
      }

      const collectiveBreakdown = [...byCollective.values()].sort(
        (a, b) => b.eventCount - a.eventCount,
      )

      // ── Window confidence (drives the UI chip) ──
      // granular: window entirely on/after 2025-01-01. national: entirely
      // before. mixed: straddles. All-time is 'mixed' (it reaches pre-2025).
      const granularStartMs = new Date(GRANULAR_ERA_START).getTime()
      const fromMs = effectiveStart ? new Date(effectiveStart).getTime() : -Infinity
      const toMs = new Date(windowEndIso).getTime()
      let confidence: WindowConfidence
      if (fromMs >= granularStartMs) confidence = 'granular'
      else if (toMs < granularStartMs) confidence = 'national'
      else confidence = 'mixed'

      // Pre-2025 calendar years fully inside the window that are national-lump
      // ONLY (no real per-collective / per-date rows exist for them). 2025 has
      // a national baseline too, but it is the granular era with real per-event
      // data, so it is NOT a national-only year - exclude it from the banner.
      const nationalOnlyYears = fullyContainedBaselineYears(effectiveStart, windowEndIso)
        .filter((yr) => new Date(GRANULAR_ERA_START).getFullYear() > yr)

      const meta: ObservationsMeta = {
        confidence,
        // The drill-down is trustworthy real data only when the window sits
        // entirely in the granular era; otherwise any per-collective figure is
        // (at least partly) a pre-2025 estimate.
        collectiveBreakdownTrustworthy: confidence === 'granular',
        nationalOnlyYears,
      }

      return { rows, summary, collectiveBreakdown, meta }
    },
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

/* ------------------------------------------------------------------ */
/*  Year-over-year summary                                             */
/* ------------------------------------------------------------------ */

export function useYearOverYear(metricDefs: ImpactMetricDef[]) {
  return useQuery({
    queryKey: ['admin-impact-yoy', metricDefs.map((d) => d.key)],
    queryFn: async () => {
      // Pull BOTH live and legacy rows across ALL years (no 2026 floor) so the
      // year-on-year table can show every year including the pre-2025 estimate
      // lumps. THE RULE is then applied per year: each figure is
      // MAX(national baseline for the year, recorded for the year), and
      // baseline-only years (2022/2023 with no event rows) are injected so they
      // are never dropped - the same per-year composition as the headline.
      const { data, error } = await supabase
        .from('event_impact')
        .select(`${IMPACT_SELECT_COLUMNS}, logged_at, events!inner(date_start, date_end, status)`)
        .lt('events.date_start', wallClockNow().toISOString())
        // Exclude cancelled events so the year table matches the headline (the
        // headline query already filters to published/completed). Without this,
        // a cancelled 2026 event with impact inflated the 2026 row (18,154 vs
        // the correct 18,074).
        .in('events.status', ['published', 'completed'])

      if (error) throw error

      const metricKeys = metricDefs.map((d) => d.key)

      type Row = Record<string, unknown> & {
        events: { date_start: string; date_end: string | null; status?: string } | null
      }
      // Exclude cancelled events so the year table matches the headline. The DB
      // query already filters status, but an in-memory guard keeps the year
      // aggregation correct even if a cancelled row ever slips through (a
      // cancelled 2026 event with 80 trees was inflating 2026 to 18,154).
      const rows = ((data ?? []) as unknown as Row[]).filter(excludeCancelledYoY)
      const byYear = new Map<number, Row[]>()

      for (const r of rows) {
        // Group by event date, not logged_at
        const year = new Date(r.events?.date_start ?? (r.logged_at as string)).getFullYear()
        const arr = byYear.get(year) ?? []
        arr.push(r)
        byYear.set(year, arr)
      }

      // Every year we must emit: years with recorded rows PLUS every baseline
      // year (so 2022/2023 appear even with zero event rows).
      const allYears = new Set<number>([
        ...byYear.keys(),
        ...Object.keys(PER_YEAR_NATIONAL_BASELINES).map(Number),
      ])

      // Per-year attendee count from the numeric column (fallback to the notes
      // parse for legacy rows that carry the count in text).
      const recordedAttendees = (yearRows: Row[]): number => {
        let a = 0
        for (const r of yearRows) {
          a += r.attendees != null
            ? Number(r.attendees) || 0
            : (parseAttendance(r.notes as string | null) ?? 0)
        }
        return a
      }

      // Per-year cell under THE RULE, with a NO-DATA sentinel. Returns:
      //  - MAX(baseline, recorded) when a per-year baseline exists;
      //  - recorded when recorded > 0 and there is no baseline (tracked);
      //  - null (NO DATA) when there is NO baseline AND recorded is 0 -> the
      //    metric was genuinely not tracked that year (e.g. 2023 trees/rubbish),
      //    so the table must render "no data recorded", NOT 0. A real tracked
      //    zero (recorded 0 with a baseline, or a metric with a 0 baseline)
      //    still renders 0, matching the headline cards' no-data semantics.
      const cell = (axis: 'trees' | 'rubbish_kg' | 'attendees' | 'events' | 'hours', year: number, recorded: number): number | null =>
        yearCellValue(PER_YEAR_NATIONAL_BASELINES[year]?.[axis], recorded)

      const summaries: YearSummary[] = [...allYears]
        .map((year) => {
          const yearRows = byYear.get(year) ?? []
          const recAtt = recordedAttendees(yearRows)
          const attendees = cell('attendees', year, recAtt)

          const metrics: Record<string, number | null> = {}
          for (const key of metricKeys) {
            const recorded = sumMetric(yearRows as Record<string, unknown>[], key)
            const axis = baselineAxisForMetric(key)
            // Metrics with no baseline axis at all pass baseline=null, so
            // yearCellValue yields recorded (>0) or no-data (0).
            metrics[key] = axis ? cell(axis, year, recorded) : yearCellValue(null, recorded)
          }

          const recHours = Math.round(sumMetric(yearRows as Record<string, unknown>[], 'hours_total'))
          const hours = cell('hours', year, recHours)
          // Distinct events in-year; floored at the national event baseline.
          const recEvents = new Set(
            yearRows.map((r) => (r as { event_id?: string }).event_id).filter((id): id is string => !!id),
          ).size
          const events = cell('events', year, recEvents)

          return { year, events, attendees, estimatedHours: hours, metrics }
        })
        // Drop a fabricated all-no-data / all-zero row (e.g. a future baseline
        // year with nothing at all) so the table stays honest. A null cell is
        // treated as "not a positive value" here.
        .filter((s) =>
          (s.events ?? 0) > 0 ||
          (s.attendees ?? 0) > 0 ||
          Object.values(s.metrics).some((v) => (v ?? 0) > 0),
        )
        .sort((a, b) => a.year - b.year)

      return summaries
    },
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Data quality                                                       */
/* ------------------------------------------------------------------ */

export function useImpactDataQuality() {
  return useQuery({
    queryKey: ['admin-impact-data-quality'],
    queryFn: async () => {
      const { data: events, error: evError } = await supabase
        .from('events')
        .select('id')
        .eq('status', 'completed')

      if (evError) throw evError

      const { data: impacts, error: impError } = await supabase
        .from('event_impact')
        .select(
          'event_id, trees_planted, rubbish_kg, invasive_weeds_pulled, hours_total, coastline_cleaned_m, native_plants, wildlife_sightings, area_restored_sqm, notes, logged_by',
        )

      if (impError) throw impError

      const impactEventIds = new Set((impacts ?? []).map((i) => i.event_id))
      const eventsWithoutImpact = (events ?? []).filter(
        (e) => !impactEventIds.has(e.id),
      ).length

      const zeroMetricEvents = (impacts ?? []).filter((i) => {
        const nums = [
          i.trees_planted, i.rubbish_kg, i.invasive_weeds_pulled,
          i.hours_total, i.coastline_cleaned_m, i.native_plants,
          i.wildlife_sightings, i.area_restored_sqm,
        ]
        return nums.every((n) => !n || n === 0)
      }).length

      const legacyCount = (impacts ?? []).filter(
        (i) =>
          i.logged_by === SEED_ADMIN ||
          ((i.notes as string) ?? '').startsWith('Legacy import'),
      ).length
      const appCount = (impacts ?? []).length - legacyCount

      return { eventsWithoutImpact, zeroMetricEvents, legacyCount, appCount } satisfies DataQuality
    },
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Events missing impact (gap analysis for admin)                     */
/* ------------------------------------------------------------------ */

export interface EventMissingImpact {
  id: string
  title: string
  activity_type: string
  date_end: string
  collective_id: string
  collective_name: string | null
  days_since: number
}

/**
 * Returns completed/published events from the last 30 days that have
 * no event_impact row. Gives admins a clear list of "who hasn't logged".
 */
export function useEventsMissingImpact() {
  return useQuery({
    queryKey: ['admin-events-missing-impact'],
    queryFn: async () => {
      // Floating-local: thirty days ago in wall-clock-as-UTC space.
      const wcNow = wallClockNow()
      const thirtyDaysAgo = new Date(wcNow.getTime())
      thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30)

      const { data: events, error } = await supabase
        .from('events')
        .select('id, title, activity_type, date_end, date_start, status, collective_id, collectives(name)')
        .in('status', ['completed', 'published'])
        .gte('date_start', thirtyDaysAgo.toISOString())
        .lte('date_start', wcNow.toISOString())
        .order('date_start', { ascending: false })

      if (error) throw error

      // Filter to events that have actually ended (wall-clock comparison)
      const now = wcNow
      const ended = (events ?? []).filter((e) => {
        const end = new Date(e.date_end ?? e.date_start)
        return end <= now
      })
      if (ended.length === 0) return []

      const eventIds = ended.map((e) => e.id)
      const { data: impacts } = await supabase
        .from('event_impact')
        .select('event_id')
        .in('event_id', eventIds)

      const loggedIds = new Set((impacts ?? []).map((i) => i.event_id))

      return ended
        .filter((e) => !loggedIds.has(e.id))
        .map((e) => {
          const endDate = new Date(e.date_end ?? e.date_start)
          return {
            id: e.id,
            title: e.title,
            activity_type: e.activity_type,
            date_end: e.date_end ?? e.date_start,
            collective_id: e.collective_id,
            collective_name: (e.collectives as unknown as { name: string } | null)?.name ?? null,
            days_since: Math.floor((now.getTime() - endDate.getTime()) / 86400000),
          }
        }) as EventMissingImpact[]
    },
    staleTime: 5 * 60 * 1000,
  })
}
