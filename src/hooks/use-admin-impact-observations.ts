import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { IMPACT_SELECT_COLUMNS, sumMetric, isBuiltinMetric } from '@/lib/impact-metrics'
import type { ImpactMetricDef } from '@/lib/impact-metrics'
import { getDateRangeBounds, type DateRange } from '@/hooks/use-admin-dashboard'
import { wallClockNow } from '@/lib/date-format'
import {
  IMPACT_BASELINE_DATE,
  BASELINE_TREES,
  BASELINE_RUBBISH_KG,
  BASELINE_EVENTS,
  BASELINE_ATTENDEES,
  BASELINE_HOURS,
  fetchBaselineSettings,
} from '@/lib/impact-query'
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
}

export interface YearSummary {
  year: number
  events: number
  attendees: number
  estimatedHours: number
  /** Aggregated metric totals keyed by metric def key */
  metrics: Record<string, number>
}

export interface ImpactSummary {
  totalEvents: number
  totalAttendees: number
  totalEstimatedHours: number
  /** Aggregated metric totals keyed by metric def key */
  metrics: Record<string, number>
}

/**
 * Per-activity legacy event_impact distribution (the coexist_impact_legacy_by_activity
 * RPC return shape). Used to attribute the pre-2026 baseline_remainder
 * proportionally across activity types so the per-activity-scoped views
 * reconcile with the All Types view's totals.
 */
export interface LegacyDistribution {
  totals: {
    event_count: number
    attendees: number
    hours: number
    trees: number
    rubbish: number
  }
  by_activity: Record<string, {
    event_count: number
    attendees: number
    hours: number
    trees: number
    rubbish: number
  }>
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
          summary: { totalEvents: 0, totalAttendees: 0, totalEstimatedHours: 0, metrics: {} } as ImpactSummary,
          collectiveBreakdown: [] as CollectiveBreakdown[],
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
      // For scoped date ranges (week / month / quarter / year), we still
      // skip legacy - those rows are pre-2026 and don't belong in a "this
      // week" view.
      const isNationalAllTime = isAllTime && !hasCollectiveScope && !filters.activityType
      const includeLegacy = isAllTime
      // When the user narrows to one activity_type on an all-time view we
      // still want the baseline-remainder share to flow into this scope,
      // proportional to the legacy distribution - otherwise sum-of-parts
      // doesn't equal All Types (Tate 2026-06-12 common-sense matrix probe).
      const isActivityScopedAllTime = isAllTime && !hasCollectiveScope && !!filters.activityType
      const effectiveStart = rangeStart
        ?? (includeLegacy ? null : new Date(IMPACT_BASELINE_DATE).toISOString())
      const nowIso = new Date().toISOString()

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

      // Fetch events and (when national all-time OR activity-scoped all-time)
      // baseline settings in parallel. Baseline values come from app_settings
      // rather than the hardcoded constants so admin updates are reflected
      // without a code deploy. The activity-scoped-all-time case also pulls
      // the per-activity legacy distribution so we can attribute the
      // baseline_remainder proportionally and keep sum-of-parts == All Types.
      const needsBaseline = isNationalAllTime || isActivityScopedAllTime
      const [eventsResult, baselineSettings, legacyDist] = await Promise.all([
        eventsQuery,
        needsBaseline ? fetchBaselineSettings() : Promise.resolve(null),
        isActivityScopedAllTime
          ? supabase.rpc('coexist_impact_legacy_by_activity').then((r) => r.data as unknown as LegacyDistribution | null)
          : Promise.resolve(null),
      ])
      const { data: eventsData, error: eventsErr } = eventsResult
      if (eventsErr) throw eventsErr

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

      // Transform rows
      const rows: EventImpactRow[] = filtered.map((r) => {
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
      })

      // Summary - sum from the returned rows (live + legacy when included).
      //
      // Baseline handling (revised 2026-05-19 after CDP-verified double-count):
      //   - BASELINE_* constants are Tate's pre-2026 sheet total (the canonical
      //     pre-2026 truth: 2022 + 2024 + 2025 figures). Hardcoded fact.
      //   - Legacy import rows in the DB are a SUBSET of pre-2026 history that
      //     was imported per-collective. Some collectives have it, some don't.
      //   - LIVE rows on pre-2026 events (5,627 trees on 2024 events, 1,505 on
      //     2025 events as of the verify probe) double-count: they're already
      //     inside the BASELINE constant. Excluding them from the SUMMARY (not
      //     the row list - users still want to see 2024/2025 events listed)
      //     is the fix.
      //
      //   Formula for national all-time:
      //     summary = sum(live rows on POST-2026 events)
      //             + sum(legacy rows)
      //             + max(0, BASELINE - sum(legacy))
      //
      //     When sum(legacy) <= BASELINE: collapses to sum(2026_live) + BASELINE
      //     which is the canonical pre-2026-as-constant model.
      //
      //   For per-collective: just sum(live + legacy) for that collective. No
      //   baseline addition - baselines are national, not per-collective.
      //   For time-scoped: just sum(live), no legacy, no baseline.
      const showNationalBaseline = isAllTime && !hasCollectiveScope && !filters.activityType
      const baselineDateIso = new Date(IMPACT_BASELINE_DATE).toISOString()

      // For the national-all-time SUMMARY we exclude live rows on pre-2026
      // events (double-counting against BASELINE). The row list below still
      // shows the full `rows` array so users see 2024/2025 events. The same
      // exclusion applies to the activity-scoped all-time view - the
      // proportional baseline_remainder share covers pre-2026 history, so
      // including pre-2026 live rows would double-count exactly the same way
      // the All Types view's exclusion guards against.
      const summableLive: typeof filtered = (showNationalBaseline || isActivityScopedAllTime)
        ? filtered.filter((r) => (r.events.date_start ?? '') >= baselineDateIso)
        : filtered

      const summableRows: Record<string, unknown>[] = [
        ...(summableLive as unknown as Record<string, unknown>[]),
        ...(filteredLegacy as unknown as Record<string, unknown>[]),
      ]

      const summaryMetrics: Record<string, number> = {}
      for (const key of metricKeys) {
        summaryMetrics[key] = sumMetric(summableRows, key)
      }

      // Proportional baseline_remainder share when the user has narrowed to a
      // single activity_type on an all-time view. share = this activity's
      // legacy contribution / global legacy total. The full baseline_remainder
      // mass equals the activity's All Types share once summed across types,
      // so sum-of-parts == All Types view (Tate 2026-06-12 common-sense probe).
      // Activities with zero legacy contribution for a metric receive zero share -
      // we have no signal that the unimported pre-2026 history covered them.
      function proportionalShare(metricLegacyKey: 'trees' | 'rubbish' | 'event_count' | 'attendees' | 'hours'): number {
        if (!isActivityScopedAllTime || !legacyDist || !filters.activityType) return 0
        const total = legacyDist.totals?.[metricLegacyKey] ?? 0
        if (total <= 0) return 0
        const slice = legacyDist.by_activity?.[filters.activityType]?.[metricLegacyKey] ?? 0
        return slice / total
      }

      if (showNationalBaseline || isActivityScopedAllTime) {
        const bTrees   = baselineSettings?.trees     ?? BASELINE_TREES
        const bRubbish = baselineSettings?.rubbishKg ?? BASELINE_RUBBISH_KG
        if (metricKeys.includes('trees_planted')) {
          const legacyTrees = sumMetric(filteredLegacy as unknown as Record<string, unknown>[], 'trees_planted')
          const fullRemainder = Math.max(0, bTrees - (legacyDist?.totals?.trees ?? legacyTrees))
          const share = showNationalBaseline ? 1 : proportionalShare('trees')
          summaryMetrics['trees_planted'] = (summaryMetrics['trees_planted'] ?? 0) + fullRemainder * share
        }
        if (metricKeys.includes('rubbish_kg')) {
          const legacyRubbish = sumMetric(filteredLegacy as unknown as Record<string, unknown>[], 'rubbish_kg')
          const fullRemainder = Math.max(0, bRubbish - (legacyDist?.totals?.rubbish ?? legacyRubbish))
          const share = showNationalBaseline ? 1 : proportionalShare('rubbish')
          summaryMetrics['rubbish_kg'] = (summaryMetrics['rubbish_kg'] ?? 0) + fullRemainder * share
        }
      }

      // Attendees: prefer the numeric `attendees` column; legacy rows often
      // carry their count in the notes field ("Legacy import: 123 attendees").
      // summableLive is the live-row subset that goes into the summary (excludes
      // pre-2026 live rows for national-all-time to avoid double-counting baseline).
      const liveAttendeeSum = Math.round(sumMetric(summableLive as unknown as Record<string, unknown>[], 'attendees'))
      let legacyAttendeeSum = 0
      for (const r of filteredLegacy) {
        const att = r.attendees != null
          ? Number(r.attendees) || 0
          : (parseAttendance(r.notes as string | null) ?? 0)
        legacyAttendeeSum += att
      }
      const totalAttendees = liveAttendeeSum + legacyAttendeeSum
      const totalEstimatedHours = Math.round(sumMetric(summableRows, 'hours_total'))
      const uniqueEventIds = new Set([
        ...summableLive.map((r) => r.events.id),
        ...filteredLegacy.map((r) => r.event_id),
      ])

      const bEvents    = baselineSettings?.events    ?? BASELINE_EVENTS
      const bAttendees = baselineSettings?.attendees ?? BASELINE_ATTENDEES
      const bHours     = baselineSettings?.hours     ?? BASELINE_HOURS

      // Baseline remainder for the count-shaped metrics. For each: subtract
      // the legacy-contribution from the national baseline and add the
      // leftover. Cap at zero so over-coverage doesn't make the total drop.
      // For activity-scoped all-time, scale the remainder by the activity's
      // proportional share of the legacy distribution (Tate 2026-06-12).
      const hoursLegacySum = Math.round(sumMetric(filteredLegacy as unknown as Record<string, unknown>[], 'hours_total'))

      const eventsRemainderFull    = Math.max(0, bEvents    - (legacyDist?.totals?.event_count ?? new Set(filteredLegacy.map((r) => r.event_id)).size))
      const attendeesRemainderFull = Math.max(0, bAttendees - (legacyDist?.totals?.attendees ?? legacyAttendeeSum))
      const hoursRemainderFull     = Math.max(0, bHours     - (legacyDist?.totals?.hours ?? hoursLegacySum))

      const eventsRemainder    = showNationalBaseline ? eventsRemainderFull
                                : isActivityScopedAllTime ? eventsRemainderFull    * proportionalShare('event_count')
                                : 0
      const attendeesRemainder = showNationalBaseline ? attendeesRemainderFull
                                : isActivityScopedAllTime ? attendeesRemainderFull * proportionalShare('attendees')
                                : 0
      const hoursRemainder     = showNationalBaseline ? hoursRemainderFull
                                : isActivityScopedAllTime ? hoursRemainderFull     * proportionalShare('hours')
                                : 0

      const summary: ImpactSummary = {
        // Counts must stay whole numbers - the proportional share can produce
        // fractional remainders. Round to nearest int for events/attendees/hours.
        totalEvents:         Math.round(uniqueEventIds.size + eventsRemainder),
        totalAttendees:      Math.round(totalAttendees      + attendeesRemainder),
        totalEstimatedHours: Math.round(totalEstimatedHours + hoursRemainder),
        metrics: summaryMetrics,
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
      const legacyEventIdsByCollective = new Map<string, Set<string>>()
      for (const r of filteredLegacy) {
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
      const collectiveBreakdown = [...byCollective.values()].sort(
        (a, b) => b.eventCount - a.eventCount,
      )

      return { rows, summary, collectiveBreakdown }
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
      const { data, error } = await supabase
        .from('event_impact')
        .select(`${IMPACT_SELECT_COLUMNS}, logged_at, events!inner(date_start, date_end)`)
        .or('notes.is.null,notes.not.like.Legacy import:%')
        .gte('events.date_start', new Date(IMPACT_BASELINE_DATE).toISOString())
        .lt('events.date_start', wallClockNow().toISOString())

      if (error) throw error

      const metricKeys = metricDefs.map((d) => d.key)

      type Row = Record<string, unknown> & {
        events: { date_start: string; date_end: string | null } | null
      }
      const rows = (data ?? []) as unknown as Row[]
      const byYear = new Map<number, Row[]>()

      for (const r of rows) {
        // Group by event date, not logged_at
        const year = new Date(r.events?.date_start ?? (r.logged_at as string)).getFullYear()
        const arr = byYear.get(year) ?? []
        arr.push(r)
        byYear.set(year, arr)
      }

      const summaries: YearSummary[] = [...byYear.entries()]
        .map(([year, yearRows]) => {
          let attendees = 0
          for (const r of yearRows) {
            const att = parseAttendance(r.notes as string | null) ?? 0
            attendees += att
          }

          const metrics: Record<string, number> = {}
          for (const key of metricKeys) {
            metrics[key] = sumMetric(yearRows as Record<string, unknown>[], key)
          }

          const hours = Math.round(sumMetric(yearRows as Record<string, unknown>[], 'hours_total'))

          return { year, events: yearRows.length, attendees, estimatedHours: hours, metrics }
        })
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
