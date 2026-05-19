import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { IMPACT_SELECT_COLUMNS, sumMetric, isBuiltinMetric } from '@/lib/impact-metrics'
import type { ImpactMetricDef } from '@/lib/impact-metrics'
import { getDateRangeStart, type DateRange } from '@/hooks/use-admin-dashboard'
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
  collectiveId?: string
  activityType?: ActivityType
  search?: string
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
      const rangeStart = getDateRangeStart(filters.dateRange)
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
      const isNationalAllTime = isAllTime && !filters.collectiveId && !filters.activityType
      const includeLegacy = isAllTime
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
      if (filters.collectiveId) eventsQuery = eventsQuery.eq('collective_id', filters.collectiveId)
      if (filters.activityType) eventsQuery = eventsQuery.eq('activity_type', filters.activityType)

      // Fetch events and (when national all-time) baseline settings in parallel.
      // This avoids a sequential round-trip and ensures baseline values come
      // from app_settings rather than the hardcoded constants, so admin updates
      // to app_settings are reflected without a code deploy.
      const [eventsResult, baselineSettings] = await Promise.all([
        eventsQuery,
        isNationalAllTime ? fetchBaselineSettings() : Promise.resolve(null),
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
      // Baseline handling (new model, 2026-05-19):
      //   - The legacy import rows in the DB represent pre-2026 history that
      //     HAS been imported (per-collective). Their sum is the imported
      //     portion of pre-2026 totals.
      //   - The BASELINE_* constants represent the FULL pre-2026 national
      //     total. The DIFFERENCE (baseline - sum_legacy) is the leftover
      //     pre-2026 history that hasn't been imported as rows.
      //   - National summary = sum(live + legacy) + max(0, baseline - sum_legacy)
      //     so totals stay consistent: sum_per_collective(live + legacy)
      //     + leftover-unimported = national total.
      //   - Per-collective summary = sum(live + legacy) for that collective.
      //     No baseline addition - baselines are a national rollup, not a
      //     per-collective number.
      const showNationalBaseline = isAllTime && !filters.collectiveId && !filters.activityType

      const summableRows: Record<string, unknown>[] = [
        ...(filtered as unknown as Record<string, unknown>[]),
        ...(filteredLegacy as unknown as Record<string, unknown>[]),
      ]

      const summaryMetrics: Record<string, number> = {}
      for (const key of metricKeys) {
        summaryMetrics[key] = sumMetric(summableRows, key)
      }
      if (showNationalBaseline) {
        const bTrees    = baselineSettings?.trees     ?? BASELINE_TREES
        const bRubbish  = baselineSettings?.rubbishKg ?? BASELINE_RUBBISH_KG
        if (metricKeys.includes('trees_planted')) {
          // Already in summaryMetrics: live + legacy. Leftover = baseline -
          // legacy_contribution. Cap at zero so legacy over-covering baseline
          // doesn't subtract from live totals.
          const legacyTrees = sumMetric(filteredLegacy as unknown as Record<string, unknown>[], 'trees_planted')
          const remainder = Math.max(0, bTrees - legacyTrees)
          summaryMetrics['trees_planted'] = (summaryMetrics['trees_planted'] ?? 0) + remainder
        }
        if (metricKeys.includes('rubbish_kg')) {
          const legacyRubbish = sumMetric(filteredLegacy as unknown as Record<string, unknown>[], 'rubbish_kg')
          const remainder = Math.max(0, bRubbish - legacyRubbish)
          summaryMetrics['rubbish_kg'] = (summaryMetrics['rubbish_kg'] ?? 0) + remainder
        }
      }

      // Attendees: prefer the numeric `attendees` column; legacy rows often
      // carry their count in the notes field ("Legacy import: 123 attendees").
      const liveAttendeeSum = Math.round(sumMetric(filtered as unknown as Record<string, unknown>[], 'attendees'))
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
        ...rows.map((r) => r.eventId),
        ...filteredLegacy.map((r) => r.event_id),
      ])

      const bEvents    = baselineSettings?.events    ?? BASELINE_EVENTS
      const bAttendees = baselineSettings?.attendees ?? BASELINE_ATTENDEES
      const bHours     = baselineSettings?.hours     ?? BASELINE_HOURS

      // Baseline remainder for the count-shaped metrics. For each: subtract
      // the legacy-contribution from the national baseline and add the
      // leftover. Cap at zero so over-coverage doesn't make the total drop.
      const legacyEventCount = new Set(filteredLegacy.map((r) => r.event_id)).size
      const eventsRemainder    = showNationalBaseline ? Math.max(0, bEvents    - legacyEventCount)  : 0
      const attendeesRemainder = showNationalBaseline ? Math.max(0, bAttendees - legacyAttendeeSum) : 0
      const hoursLegacySum     = Math.round(sumMetric(filteredLegacy as unknown as Record<string, unknown>[], 'hours_total'))
      const hoursRemainder     = showNationalBaseline ? Math.max(0, bHours     - hoursLegacySum)    : 0

      const summary: ImpactSummary = {
        totalEvents:         uniqueEventIds.size + eventsRemainder,
        totalAttendees:      totalAttendees      + attendeesRemainder,
        totalEstimatedHours: totalEstimatedHours + hoursRemainder,
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
        const isFirstSightingOfEvent = !legacyIds.has(r.event_id)
        legacyIds.add(r.event_id)
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
        .lt('events.date_start', new Date().toISOString())

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
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const { data: events, error } = await supabase
        .from('events')
        .select('id, title, activity_type, date_end, date_start, status, collective_id, collectives(name)')
        .in('status', ['completed', 'published'])
        .gte('date_start', thirtyDaysAgo.toISOString())
        .lte('date_start', new Date().toISOString())
        .order('date_start', { ascending: false })

      if (error) throw error

      // Filter to events that have actually ended
      const now = new Date()
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
