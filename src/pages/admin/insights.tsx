/**
 * Admin > Insights - one place for Co-Exist staff to GET stats.
 *
 * Built around what staff actually do with these numbers: grant
 * acquittals, funding applications, impact reports. So every stat is
 * SELECTABLE and one click copies the selection as a clean unbranded
 * table (rich HTML for Docs/Word, tab-separated for Sheets). Whole
 * tables (by collective, retention, year-on-year) copy in one click
 * too, and the raw data behind the numbers downloads as CSV.
 *
 * ONE filter bar (date + collective + activity) drives everything.
 * Every number reads from the canonical hooks (useImpactObservations +
 * coexist_attendance_metrics + useYearOverYear), no bespoke SQL, so the
 * totals are the same trusted numbers as before (see
 * patterns/co-exist-stats-canonical-aggregation-architecture).
 */
import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Database } from '@/types/database.types'
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  CalendarDays, Users, UserCheck, Repeat, Clock, Leaf, TreePine, Trash2,
  Waves, Eye, Ruler, Sprout, Sparkles, Droplets, Mountain, Flower2, Bug,
  Flame, Fish, Wind, ExternalLink, Copy, Check, Download, Table as TableIcon,
  X, TrendingUp, Info, ShieldCheck,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAdminHeader } from '@/components/admin-layout'
import { AdminHeroStat, AdminHeroStatRow, type HeroStatColor } from '@/components/admin-hero-stat'
import { Dropdown } from '@/components/dropdown'
import { MultiSelect } from '@/components/multi-select'
import { SearchBar } from '@/components/search-bar'
import { Badge } from '@/components/badge'
import { useToast } from '@/components/toast'
import { adminVariants } from '@/lib/admin-motion'
import { cn } from '@/lib/cn'
import { copyTables, downloadCsv, type TableSpec } from '@/lib/copy-table'
import {
  useImpactObservations, useYearOverYear, type ObservationFilters,
} from '@/hooks/use-admin-impact-observations'
import { useImpactMetricDefs } from '@/hooks/use-impact-metric-defs'
import type { ImpactMetricDef } from '@/lib/impact-metrics'
import { dateRangeOptions, getDateRangeStart, useTrendData, type DateRange } from '@/hooks/use-admin-dashboard'
import { nationalHistoricalRemainder } from '@/lib/impact-query'
import { TrendChart } from '@/components/trend-chart'
import { ACTIVITY_TYPE_FILTER_OPTIONS, ACTIVITY_TYPE_LABELS } from '@/hooks/use-events'
import { useCollectives } from '@/hooks/use-collective'
import type { AttendanceMetrics } from '@/lib/attendance-metrics'

/* ------------------------------------------------------------------ */
/*  Metric icon + colour registry                                      */
/* ------------------------------------------------------------------ */

const METRIC_ICONS: Record<string, (s: number) => ReactNode> = {
  tree: (s) => <TreePine data-eos-id="src/pages/admin/insights.tsx#0" size={s} />, leaf: (s) => <Leaf data-eos-id="src/pages/admin/insights.tsx#1" size={s} />,
  weed: (s) => <Sprout data-eos-id="src/pages/admin/insights.tsx#2" size={s} />, trash: (s) => <Trash2 data-eos-id="src/pages/admin/insights.tsx#3" size={s} />,
  wave: (s) => <Waves data-eos-id="src/pages/admin/insights.tsx#4" size={s} />, eye: (s) => <Eye data-eos-id="src/pages/admin/insights.tsx#5" size={s} />,
  area: (s) => <Ruler data-eos-id="src/pages/admin/insights.tsx#6" size={s} />, clock: (s) => <Clock data-eos-id="src/pages/admin/insights.tsx#7" size={s} />,
  sparkle: (s) => <Sparkles data-eos-id="src/pages/admin/insights.tsx#8" size={s} />, droplet: (s) => <Droplets data-eos-id="src/pages/admin/insights.tsx#9" size={s} />,
  mountain: (s) => <Mountain data-eos-id="src/pages/admin/insights.tsx#10" size={s} />, flower: (s) => <Flower2 data-eos-id="src/pages/admin/insights.tsx#11" size={s} />,
  bug: (s) => <Bug data-eos-id="src/pages/admin/insights.tsx#12" size={s} />, flame: (s) => <Flame data-eos-id="src/pages/admin/insights.tsx#13" size={s} />,
  fish: (s) => <Fish data-eos-id="src/pages/admin/insights.tsx#14" size={s} />, wind: (s) => <Wind data-eos-id="src/pages/admin/insights.tsx#15" size={s} />,
}
const ICON_TO_COLOR: Record<string, HeroStatColor> = {
  tree: 'moss', leaf: 'sprout', weed: 'sprout', trash: 'sky', wave: 'info',
  eye: 'warning', area: 'plum', clock: 'bark', sparkle: 'warning',
  droplet: 'info', mountain: 'bark', flower: 'primary', bug: 'moss',
  flame: 'coral', fish: 'info', wind: 'primary',
}
function metricIcon(def: ImpactMetricDef, size = 18): ReactNode {
  return (METRIC_ICONS[def.icon] ?? METRIC_ICONS.leaf)(size)
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Label for a genuinely-untracked figure (no baseline, no recorded data). */
const NO_DATA_LABEL = 'No data recorded'

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}
function fmtNum(n: number | null | undefined): string {
  if (n == null) return '-'
  return n.toLocaleString('en-AU')
}
function fmtMetricVal(val: number | null | undefined, def: ImpactMetricDef): string {
  if (val == null) return '-'
  const s = def.decimal ? val.toLocaleString('en-AU', { maximumFractionDigits: 1 }) : val.toLocaleString('en-AU')
  return def.unit ? `${s} ${def.unit}` : s
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}
function activityToBadge(type: string) {
  return type.replace(/_/g, '-') as Parameters<typeof Badge>[0] extends { activity?: infer A } ? NonNullable<A> : never
}

/* ------------------------------------------------------------------ */
/*  Selectable stat registry                                          */
/* ------------------------------------------------------------------ */

interface StatItem {
  key: string
  group: string
  label: string
  /** display string for the UI + table */
  value: string
}

/* ------------------------------------------------------------------ */
/*  Small components                                                   */
/* ------------------------------------------------------------------ */

function Section({ id, title, hint, action }: { id: string; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div data-eos-id="src/pages/admin/insights.tsx#16" id={id} className="scroll-mt-24 flex items-end justify-between gap-3 mb-3">
      <div data-eos-id="src/pages/admin/insights.tsx#17">
        <h2 data-eos-id="src/pages/admin/insights.tsx#18" className="font-heading text-[13px] font-bold uppercase tracking-widest text-neutral-700/70">{title}</h2>
        {hint && <p data-eos-id="src/pages/admin/insights.tsx#19" className="text-xs text-neutral-400 mt-0.5">{hint}</p>}
      </div>
      {action}
    </div>
  )
}

/** Click-to-select wrapper. Shows a corner check so the affordance is obvious. */
function Selectable({ k, sel, onToggle, children }: { k: string; sel: Set<string>; onToggle: (k: string) => void; children: ReactNode }) {
  const on = sel.has(k)
  return (
    <div data-eos-id="src/pages/admin/insights.tsx#20"
      onClick={() => onToggle(k)}
      role="button"
      aria-pressed={on}
      className={cn('group relative cursor-pointer rounded-md transition-all', on && 'ring-2 ring-primary-500 ring-offset-2')}
    >
      <span data-eos-id="src/pages/admin/insights.tsx#21" className={cn(
        'absolute top-2 right-2 z-10 w-5 h-5 rounded-full flex items-center justify-center transition-all',
        on ? 'bg-primary-600 text-white' : 'bg-white/70 text-neutral-300 ring-1 ring-neutral-200 opacity-0 group-hover:opacity-100',
      )}>
        <Check data-eos-id="src/pages/admin/insights.tsx#22" size={12} strokeWidth={3} />
      </span>
      {children}
    </div>
  )
}

function CopyTableButton({ onCopy, copied, label = 'Copy table' }: { onCopy: () => void; copied: boolean; label?: string }) {
  return (
    <button data-eos-id="src/pages/admin/insights.tsx#23" type="button" onClick={onCopy}
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary-700 hover:text-primary-800 px-2.5 py-1 rounded-sm hover:bg-primary-50 transition-colors cursor-pointer">
      {copied ? <Check data-eos-id="src/pages/admin/insights.tsx#24" size={12} /> : <TableIcon data-eos-id="src/pages/admin/insights.tsx#25" size={12} />} {copied ? 'Copied' : label}
    </button>
  )
}

function CohortBar({ label, count, total, rm }: { label: string; count: number; total: number; rm: boolean }) {
  const p = pct(count, total)
  return (
    <div data-eos-id="src/pages/admin/insights.tsx#26" className="flex items-center gap-3 py-1.5">
      <span data-eos-id="src/pages/admin/insights.tsx#27" className="w-14 shrink-0 text-sm text-neutral-600">{label}</span>
      <div data-eos-id="src/pages/admin/insights.tsx#28" className="flex-1 h-7 rounded-sm bg-neutral-100 overflow-hidden">
        <motion.div data-eos-id="src/pages/admin/insights.tsx#29" className="h-full bg-primary-400 rounded-sm"
          initial={rm ? { width: `${Math.max(p, count > 0 ? 3 : 0)}%` } : { width: 0 }}
          animate={{ width: `${Math.max(p, count > 0 ? 3 : 0)}%` }} transition={{ duration: 0.6 }} />
      </div>
      <span data-eos-id="src/pages/admin/insights.tsx#30" className="w-24 shrink-0 text-right text-sm tabular-nums text-neutral-700">{count} <span data-eos-id="src/pages/admin/insights.tsx#31" className="text-neutral-400">({p}%)</span></span>
    </div>
  )
}

/* ================================================================== */
/*  Page                                                              */
/* ================================================================== */

export default function AdminInsightsPage() {
  useAdminHeader('Insights')
  const rm = !!useReducedMotion()
  const v = adminVariants(rm)
  const { toast } = useToast()

  const [dateRange, setDateRange] = useState<DateRange>('all')
  // Multi-select collective scope. Empty = all collectives (national view);
  // 2+ selected returns their combined stats.
  const [collectiveIds, setCollectiveIds] = useState<string[]>([])
  const [activityType, setActivityType] = useState('')
  const [search, setSearch] = useState('')
  // Custom window (yyyy-mm-dd). Seeded to first-of-this-month -> today the
  // first time 'custom' is picked so a board report for "this month so far"
  // is one click; the user then narrows to a discrete past month.
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const handleDateRangeChange = (next: DateRange) => {
    if (next === 'custom' && (!customStart || !customEnd)) {
      const now = new Date()
      const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      setCustomStart((s) => s || firstOfMonth)
      setCustomEnd((e) => e || todayIso())
    }
    setDateRange(next)
  }
  // Custom range is only "active" once both ends are present and ordered;
  // an in-progress edit (one field cleared, or start after end) holds the
  // queries rather than firing a bad window.
  const customValid = dateRange !== 'custom' || (!!customStart && !!customEnd && customStart <= customEnd)

  const dateRangeOptionsWithCustom = useMemo(
    () => [...dateRangeOptions, { value: 'custom', label: 'Custom range' }],
    [],
  )

  const { data: collectives } = useCollectives({ includeNational: true })
  const { activeDefs } = useImpactMetricDefs()

  const filters: ObservationFilters = useMemo(() => ({
    dateRange,
    collectiveIds: collectiveIds.length ? collectiveIds : undefined,
    activityType: (activityType || undefined) as ObservationFilters['activityType'],
    search: search || undefined,
    customStart: dateRange === 'custom' ? customStart : undefined,
    customEnd: dateRange === 'custom' ? customEnd : undefined,
  }), [dateRange, collectiveIds, activityType, search, customStart, customEnd])

  const { data: obs, isLoading: obsLoading } = useImpactObservations(filters, activeDefs)
  const { data: yoy } = useYearOverYear(activeDefs)
  const { data: trends } = useTrendData()

  // THE RULE surfaces (max vs baseline + honesty labelling). `meta` carries the
  // window confidence band, whether the per-collective drill-down is real
  // recorded data or pre-2025 estimate, and which pre-2025 years are
  // national-lump only. `provenance` is per figure.
  const meta = obs?.meta
  const provenance = obs?.summary.provenance ?? {}
  /**
   * Sub-label that surfaces THE RULE's provenance on a stat card. 'baseline'
   * = floored at the org's stated figure (our records were lower or absent);
   * 'estimate' = pre-2025 leader-reported estimate; else no sub (recorded).
   */
  const provSub = (provKey: string): string | undefined => {
    const p = provenance[provKey]
    if (p === 'baseline') return 'stated baseline'
    if (p === 'estimate') return 'estimate'
    if (p === 'no-data') return 'no data recorded'
    return undefined
  }

  const fromDate = useMemo(() => {
    if (dateRange === 'custom') return customStart || '2018-01-01'
    const s = getDateRangeStart(dateRange)
    return s ? s.slice(0, 10) : '2018-01-01'
  }, [dateRange, customStart])
  // p_to is inclusive of the day in coexist_attendance_metrics
  // ((date_start AT TIME ZONE 'UTC')::date <= v_to), so a yyyy-mm-dd end date
  // counts events on that whole day.
  const toDate = useMemo(
    () => (dateRange === 'custom' ? (customEnd || todayIso()) : todayIso()),
    [dateRange, customEnd],
  )
  const { data: att } = useQuery({
    queryKey: ['insights-attendance', dateRange, collectiveIds, activityType, customStart, customEnd],
    queryFn: async (): Promise<AttendanceMetrics> => {
      const { data, error } = await supabase.rpc('coexist_attendance_metrics', {
        p_collective_ids: collectiveIds.length ? collectiveIds : undefined,
        p_from: fromDate,
        p_to: toDate,
        p_activity_types: activityType
          ? [activityType as Database['public']['Enums']['activity_type']]
          : undefined,
      })
      if (error) throw error
      return data as unknown as AttendanceMetrics
    },
    enabled: customValid,
  })

  const collectiveOptions = useMemo(
    () => [...(collectives ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.name })),
    [collectives],
  )
  const activityOptions = useMemo(
    () => [{ value: '', label: 'All Types' }, ...ACTIVITY_TYPE_FILTER_OPTIONS.map((o) => ({ value: o.value, label: o.label }))],
    [],
  )
  // Scope-line label: none -> "All collectives"; up to two -> their names joined;
  // three or more -> "N collectives" so the copied-table title stays tight.
  const collectiveLabel = useMemo(() => {
    if (collectiveIds.length === 0) return 'All collectives'
    const names = collectiveIds
      .map((id) => collectives?.find((c) => c.id === id)?.name)
      .filter((n): n is string => !!n)
    if (names.length === 0) return `${collectiveIds.length} collectives`
    if (names.length <= 2) return names.join(' + ')
    return `${names.length} collectives`
  }, [collectiveIds, collectives])
  // For a custom window show the actual dates ("1 Jun - 30 Jun 2026") so the
  // scope line, copied tables and CSV titles all read the selected range. The
  // start year is dropped when it matches the end year to keep it tight.
  const customWindowLabel = useMemo(() => {
    if (!customStart || !customEnd) return 'Custom range'
    const s = new Date(`${customStart}T00:00:00Z`)
    const e = new Date(`${customEnd}T00:00:00Z`)
    const sameYear = s.getUTCFullYear() === e.getUTCFullYear()
    const sOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC', ...(sameYear ? {} : { year: 'numeric' }) }
    const eOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }
    return `${s.toLocaleDateString('en-AU', sOpts)} - ${e.toLocaleDateString('en-AU', eOpts)}`
  }, [customStart, customEnd])
  const dateLabel = dateRange === 'custom'
    ? customWindowLabel
    : (dateRangeOptions.find((o) => o.value === dateRange)?.label ?? 'All time')
  const activityLabel = activityType ? (ACTIVITY_TYPE_LABELS[activityType] ?? activityType) : null
  const scopeLine = `Co-Exist · ${collectiveLabel} · ${dateLabel}${activityLabel ? ` · ${activityLabel}` : ''}`

  const visibleDefs = useMemo(() => {
    if (!obs) return activeDefs.filter((d) => d.key !== 'hours_total')
    return activeDefs.filter((d) => d.key !== 'hours_total' && obs.rows.some((r) => (r.metrics[d.key] ?? 0) > 0))
  }, [activeDefs, obs])

  const topMetrics = useMemo(() => {
    if (!obs) return []
    return [...visibleDefs].map((d) => ({ def: d, total: obs.summary.metrics[d.key] ?? 0 }))
      .filter((m) => m.total > 0).sort((a, b) => b.total - a.total).slice(0, 3)
  }, [visibleDefs, obs])

  const sortedCollectives = useMemo(() => obs ? [...obs.collectiveBreakdown].sort((a, b) => b.attendees - a.attendees) : [], [obs])

  // National-historical reconciliation row. The headline totals include the
  // pre-2025 NATIONAL baselines (mainly 2022) that have NO per-collective
  // breakdown, so the By-collective rows sum BELOW the headline. Without this
  // row a funder can add the columns and see they do not reach the headline.
  // We compute, PER METRIC, remainder = headline_total - sum(collective rows),
  // and surface it as one explicit final row so collectives + this row == the
  // headline exactly, by construction. Shown only when a remainder is positive.
  const nationalHistorical = useMemo(() => {
    if (!obs) return null
    const o = obs
    const sumCol = (pick: (c: (typeof o.collectiveBreakdown)[number]) => number) =>
      o.collectiveBreakdown.reduce((s, c) => s + pick(c), 0)
    const eventsRem    = nationalHistoricalRemainder(o.summary.totalEvents,         sumCol((c) => c.eventCount))
    const attendeesRem = nationalHistoricalRemainder(o.summary.totalAttendees,      sumCol((c) => c.attendees))
    const hoursRem     = nationalHistoricalRemainder(o.summary.totalEstimatedHours, sumCol((c) => c.estimatedHours))
    const metricsRem: Record<string, number> = {}
    for (const def of activeDefs) {
      metricsRem[def.key] = nationalHistoricalRemainder(o.summary.metrics[def.key] ?? 0, sumCol((c) => c.metrics[def.key] ?? 0))
    }
    const hasAny = eventsRem > 0 || attendeesRem > 0 || hoursRem > 0 || Object.values(metricsRem).some((v) => v > 0)
    return hasAny ? { eventsRem, attendeesRem, hoursRem, metricsRem } : null
  }, [obs, activeDefs])
  const sortedEvents = useMemo(() => obs ? [...obs.rows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : [], [obs])
  const [showAllEvents, setShowAllEvents] = useState(false)
  const displayEvents = showAllEvents ? sortedEvents : sortedEvents.slice(0, 25)

  /* ── the flat registry of selectable single stats ── */
  const statItems: StatItem[] = useMemo(() => {
    const out: StatItem[] = []
    if (obs) {
      out.push({ key: 'hl_events', group: 'Overview', label: 'Events held', value: fmtNum(obs.summary.totalEvents) })
      out.push({ key: 'hl_attendees', group: 'Overview', label: 'Total attendances', value: fmtNum(obs.summary.totalAttendees) })
      out.push({ key: 'hl_hours', group: 'Overview', label: 'Estimated volunteer hours', value: fmtNum(obs.summary.totalEstimatedHours) })
      for (const def of visibleDefs) {
        out.push({ key: `im_${def.key}`, group: 'Impact', label: `${def.label}${def.unit ? ` (${def.unit})` : ''}`, value: fmtMetricVal(obs.summary.metrics[def.key] ?? 0, def) })
      }
    }
    if (att) {
      out.push({ key: 'at_unique', group: 'Attendance', label: 'Unique people', value: fmtNum(att.unique_attendees) })
      out.push({ key: 'at_new', group: 'Attendance', label: 'New people (came once)', value: fmtNum(att.new_attendees) })
      out.push({ key: 'at_returning', group: 'Attendance', label: 'Returning people (2+ events)', value: fmtNum(att.returning_attendees) })
      out.push({ key: 'at_returnrate', group: 'Attendance', label: 'Return rate', value: `${att.return_rate_pct}%` })
      out.push({ key: 'at_registrations', group: 'Attendance', label: 'Registrations', value: fmtNum(att.registrations) })
      out.push({ key: 'at_signins', group: 'Attendance', label: 'Sign-ins', value: fmtNum(att.signins) })
      out.push({ key: 'at_followthrough', group: 'Attendance', label: 'Sign-in rate', value: `${att.followthrough_pct}%` })
      out.push({ key: 'at_avgevents', group: 'Attendance', label: 'Avg events per person', value: String(att.retention.avg_events_per_attendee) })
      out.push({ key: 'ret_1', group: 'Recurrence', label: 'Attended 1 event', value: fmtNum(att.retention.attended_1) })
      out.push({ key: 'ret_2', group: 'Recurrence', label: 'Attended 2 events', value: fmtNum(att.retention.attended_2) })
      out.push({ key: 'ret_3', group: 'Recurrence', label: 'Attended 3 events', value: fmtNum(att.retention.attended_3) })
      out.push({ key: 'ret_45', group: 'Recurrence', label: 'Attended 4-5 events', value: fmtNum(att.retention.attended_4_to_5) })
      out.push({ key: 'ret_6', group: 'Recurrence', label: 'Attended 6+ events', value: fmtNum(att.retention.attended_6_plus) })
    }
    return out
  }, [obs, att, visibleDefs])

  /* ── selection state ── */
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggle = (k: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(k)) next.delete(k); else next.add(k)
    return next
  })
  const selectMany = (keys: string[], on: boolean) => setSelected((prev) => {
    const next = new Set(prev)
    for (const k of keys) { if (on) next.add(k); else next.delete(k) }
    return next
  })
  const clearSel = () => setSelected(new Set())

  const [copied, setCopied] = useState<string | null>(null)
  const flashCopied = (id: string) => { setCopied(id); setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600) }

  async function copySelected() {
    const rows = statItems.filter((s) => selected.has(s.key)).map((s) => [s.label, s.value] as (string | number)[])
    if (!rows.length) return
    const ok = await copyTables([{ title: scopeLine, headers: ['Metric', 'Value'], rows }])
    flashCopied('sel')
    toast.success(ok ? 'Copied as a table. Paste into your doc.' : 'Copied (plain text).')
  }
  function csvSelected() {
    const rows = statItems.filter((s) => selected.has(s.key)).map((s) => [s.label, s.value] as (string | number)[])
    if (!rows.length) return
    downloadCsv('coexist-stats.csv', { headers: ['Metric', 'Value'], rows })
  }

  /* ── whole-table specs (selectable group + copy) ── */
  // Export includes the national-historical reconciliation row so a downloaded
  // CSV / pasted table ties out to the headline exactly (collectives + this
  // row == headline, per column).
  const collectiveTableSpec: TableSpec = useMemo(() => {
    const cols = visibleDefs.slice(0, 4)
    const rows: (string | number)[][] = sortedCollectives.map((c) => [c.name, c.eventCount, c.attendees, ...cols.map((d) => c.metrics[d.key] ?? 0), c.estimatedHours])
    if (nationalHistorical) {
      rows.push([
        'National historical (pre-2025, no collective breakdown)',
        nationalHistorical.eventsRem,
        nationalHistorical.attendeesRem,
        ...cols.map((d) => nationalHistorical.metricsRem[d.key] ?? 0),
        nationalHistorical.hoursRem,
      ])
    }
    return {
      title: scopeLine,
      headers: ['Collective', 'Events', 'Attendees', ...cols.map((d) => `${d.label}${d.unit ? ` (${d.unit})` : ''}`), 'Est. hours'],
      rows,
    }
  }, [sortedCollectives, visibleDefs, scopeLine, nationalHistorical])

  const retentionTableSpec: TableSpec | null = useMemo(() => att ? ({
    title: `Attendee recurrence · ${scopeLine}`,
    headers: ['Events attended', 'People', '% of unique'],
    rows: [
      ['1', att.retention.attended_1, pct(att.retention.attended_1, att.unique_attendees)],
      ['2', att.retention.attended_2, pct(att.retention.attended_2, att.unique_attendees)],
      ['3', att.retention.attended_3, pct(att.retention.attended_3, att.unique_attendees)],
      ['4-5', att.retention.attended_4_to_5, pct(att.retention.attended_4_to_5, att.unique_attendees)],
      ['6+', att.retention.attended_6_plus, pct(att.retention.attended_6_plus, att.unique_attendees)],
    ],
  }) : null, [att, scopeLine])

  // A null year-cell is genuinely untracked -> "No data recorded" (never 0),
  // matching the headline cards. Real tracked zeros render as 0. Used for both
  // the on-page table and the CSV/copy export so they stay consistent.
  const yearCell = (v: number | null): string | number => (v == null ? NO_DATA_LABEL : v)
  const yearTableSpec: TableSpec | null = useMemo(() => (yoy && yoy.length) ? ({
    title: `Year on year · Co-Exist`,
    headers: ['Year', 'Events', 'Attendees', 'Est. hours', ...topMetrics.map((m) => m.def.label)],
    rows: [...yoy].sort((a, b) => a.year - b.year).map((y) => [
      y.year,
      yearCell(y.events),
      yearCell(y.attendees),
      yearCell(y.estimatedHours),
      ...topMetrics.map((m) => yearCell(y.metrics[m.def.key] ?? null)),
    ]),
  }) : null, [yoy, topMetrics])

  async function copyTableSpec(spec: TableSpec | null, id: string) {
    if (!spec) return
    const ok = await copyTables([spec])
    flashCopied(id)
    toast.success(ok ? 'Table copied. Paste into your doc.' : 'Copied (plain text).')
  }

  const jump = [
    { id: 'overview', label: 'Overview' }, { id: 'growth', label: 'Growth' },
    { id: 'impact', label: 'Impact' },
    { id: 'attendance', label: 'Attendance' }, { id: 'collectives', label: 'By collective' },
    { id: 'years', label: 'Years' }, { id: 'data', label: 'Raw data' },
  ]

  const eventCsvSpec = (): TableSpec => ({
    headers: ['Date', 'Event', 'Collective', 'Type', 'Attendees', ...visibleDefs.map((d) => `${d.label}${d.unit ? ` (${d.unit})` : ''}`), 'Est. hours', 'Source'],
    rows: sortedEvents.map((r) => [
      fmtDate(r.date), r.title, r.collectiveName, ACTIVITY_TYPE_LABELS[r.activityType] ?? r.activityType,
      r.attendance ?? '', ...visibleDefs.map((d) => r.metrics[d.key] ?? 0), r.estimatedVolHours ?? '', r.isLegacy ? 'Legacy' : 'App',
    ]),
  })

  return (
    <motion.div data-eos-id="src/pages/admin/insights.tsx#32" className="pb-28" variants={v.stagger} initial="hidden" animate="visible">
      {/* ── Sticky filter bar + jump nav ── */}
      <div data-eos-id="src/pages/admin/insights.tsx#33" className="sticky top-0 z-20 -mx-4 -mt-4 px-4 pb-3 bg-white/90 backdrop-blur border-b border-neutral-100 mb-6" style={{ paddingTop: 'calc(var(--safe-top, 0px) + 0.75rem)' }}>
        <div data-eos-id="src/pages/admin/insights.tsx#34" className="flex flex-wrap items-center gap-2">
          <Dropdown data-eos-id="src/pages/admin/insights.tsx#35" options={dateRangeOptionsWithCustom} value={dateRange} onChange={(x) => handleDateRangeChange(x as DateRange)} className="w-36" />
          {dateRange === 'custom' && (
            <div data-eos-id="src/pages/admin/insights.tsx#36" className="flex items-center gap-1.5">
              <input data-eos-id="src/pages/admin/insights.tsx#37"
                type="date"
                aria-label="From date"
                value={customStart}
                max={customEnd || todayIso()}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-11 rounded-full bg-surface-3 px-4 text-[16px] sm:text-sm text-neutral-900 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
              />
              <span data-eos-id="src/pages/admin/insights.tsx#38" className="text-sm text-neutral-400">to</span>
              <input data-eos-id="src/pages/admin/insights.tsx#39"
                type="date"
                aria-label="To date"
                value={customEnd}
                min={customStart || undefined}
                max={todayIso()}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-11 rounded-full bg-surface-3 px-4 text-[16px] sm:text-sm text-neutral-900 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
              />
            </div>
          )}
          <MultiSelect data-eos-id="src/pages/admin/insights.tsx#40"
            options={collectiveOptions}
            value={collectiveIds}
            onChange={setCollectiveIds}
            allLabel="All Collectives"
            countLabel={(n) => `${n} collectives`}
            className="w-44"
          />
          <Dropdown data-eos-id="src/pages/admin/insights.tsx#41" options={activityOptions} value={activityType} onChange={setActivityType} className="w-40" />
          <div data-eos-id="src/pages/admin/insights.tsx#42" className="hidden md:flex items-center gap-0.5 ml-auto text-[11px] font-medium text-neutral-400">
            {jump.map((j) => (
              <a data-eos-href="dynamic" data-eos-href-label="Id" data-eos-href-scope="item" data-eos-id="src/pages/admin/insights.tsx#43" data-eos-var="j.label" data-eos-var-label="Label" data-eos-var-scope="item" data-eos-var-src="literal" key={j.id} href={`#${j.id}`} className="px-2 py-1 rounded-md hover:bg-neutral-100 hover:text-neutral-700 transition-colors">{j.label}</a>
            ))}
          </div>
        </div>
        <div data-eos-id="src/pages/admin/insights.tsx#44" className="flex flex-wrap items-center gap-2 mt-2">
          <p data-eos-id="src/pages/admin/insights.tsx#45" className="text-[11px] text-neutral-400">Tap any number to select it, then copy your selection as a table. {scopeLine}</p>
          {meta && <ConfidenceChip data-eos-id="src/pages/admin/insights.tsx#46" meta={meta} />}
        </div>
        {meta && meta.nationalOnlyYears.length > 0 && (
          <div data-eos-id="src/pages/admin/insights.tsx#47" className="mt-2 flex items-start gap-2 px-3 py-2 rounded-sm bg-warning-50 border border-warning-200 text-warning-800 text-[11px] w-fit max-w-full">
            <Info data-eos-id="src/pages/admin/insights.tsx#48" size={13} className="shrink-0 mt-0.5 text-warning-500" />
            <span data-eos-id="src/pages/admin/insights.tsx#49" data-eos-var="meta.nationalOnlyYears" data-eos-var-label="National only years" data-eos-var-scope="prop">
              {meta.nationalOnlyYears.sort().join(', ')} {meta.nationalOnlyYears.length > 1 ? 'are' : 'is'} shown as
              national annual figures (no per-collective or per-date breakdown existed before 2025). Figures for these
              years cannot be sliced by collective. Where a year has no figure for a metric it shows "no data recorded",
              never zero.
            </span>
          </div>
        )}
      </div>

      <div data-eos-id="src/pages/admin/insights.tsx#50" className="space-y-10">
        {/* ── Overview ── */}
        <div data-eos-id="src/pages/admin/insights.tsx#51">
          <Section data-eos-id="src/pages/admin/insights.tsx#52" id="overview" title="Overview"
            action={<SelectAll data-eos-id="src/pages/admin/insights.tsx#53" keys={['hl_events', 'hl_attendees', 'hl_hours', 'at_unique', 'at_returning']} sel={selected} onSet={selectMany} />} />
          <motion.div data-eos-id="src/pages/admin/insights.tsx#54" variants={v.fadeUp}>
            <AdminHeroStatRow data-eos-id="src/pages/admin/insights.tsx#55" className="!max-w-none grid-cols-2 sm:!grid-cols-3 lg:!grid-cols-5">
              <Selectable data-eos-id="src/pages/admin/insights.tsx#56" k="hl_events" sel={selected} onToggle={toggle}><AdminHeroStat data-eos-id="src/pages/admin/insights.tsx#57" value={obs?.summary.totalEvents ?? 0} label="Events" icon={<CalendarDays data-eos-id="src/pages/admin/insights.tsx#58" size={18} />} color="primary" reducedMotion delay={0} sub={provSub('events')} /></Selectable>
              <Selectable data-eos-id="src/pages/admin/insights.tsx#59" k="hl_attendees" sel={selected} onToggle={toggle}><AdminHeroStat data-eos-id="src/pages/admin/insights.tsx#60" value={obs?.summary.totalAttendees ?? 0} label="Attendances" icon={<Users data-eos-id="src/pages/admin/insights.tsx#61" size={18} />} color="warning" reducedMotion delay={0} sub={provSub('attendees')} /></Selectable>
              <Selectable data-eos-id="src/pages/admin/insights.tsx#62" k="at_unique" sel={selected} onToggle={toggle}><AdminHeroStat data-eos-id="src/pages/admin/insights.tsx#63" value={att?.unique_attendees ?? 0} label="Unique people" icon={<UserCheck data-eos-id="src/pages/admin/insights.tsx#64" size={18} />} color="moss" reducedMotion delay={0} sub={att ? `${att.new_attendees} new` : undefined} /></Selectable>
              <Selectable data-eos-id="src/pages/admin/insights.tsx#65" k="at_returning" sel={selected} onToggle={toggle}><AdminHeroStat data-eos-id="src/pages/admin/insights.tsx#66" value={att?.returning_attendees ?? 0} label="Came back" icon={<Repeat data-eos-id="src/pages/admin/insights.tsx#67" size={18} />} color="sprout" reducedMotion delay={0} sub={att ? `${att.return_rate_pct}% return rate` : undefined} /></Selectable>
              <Selectable data-eos-id="src/pages/admin/insights.tsx#68" k="hl_hours" sel={selected} onToggle={toggle}><AdminHeroStat data-eos-id="src/pages/admin/insights.tsx#69" value={obs?.summary.totalEstimatedHours ?? 0} label="Est. vol hours" icon={<Clock data-eos-id="src/pages/admin/insights.tsx#70" size={18} />} color="bark" reducedMotion delay={0} sub={provSub('hours')} /></Selectable>
            </AdminHeroStatRow>
          </motion.div>
        </div>

        {/* ── Growth over time ── */}
        {trends && trends.length > 0 && (
          <div data-eos-id="src/pages/admin/insights.tsx#71">
            <Section data-eos-id="src/pages/admin/insights.tsx#72" id="growth" title="Growth over time" hint="New members and events per month, last 6 months." />
            <motion.div data-eos-id="src/pages/admin/insights.tsx#73" variants={v.fadeUp} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TrendChart data-eos-id="src/pages/admin/insights.tsx#74"
                data={trends}
                dataKey="members"
                label="Member Growth"
                icon={<TrendingUp data-eos-id="src/pages/admin/insights.tsx#75" size={17} className="text-primary-600" />}
                accentFrom="var(--color-primary-600)"
                accentTo="var(--color-primary-400)"
              />
              <TrendChart data-eos-id="src/pages/admin/insights.tsx#76"
                data={trends}
                dataKey="events"
                label="Event Frequency"
                icon={<CalendarDays data-eos-id="src/pages/admin/insights.tsx#77" size={17} className="text-moss-600" />}
                accentFrom="var(--color-moss-600)"
                accentTo="var(--color-moss-400)"
              />
            </motion.div>
          </div>
        )}

        {/* ── Impact ── */}
        <div data-eos-id="src/pages/admin/insights.tsx#78">
          <Section data-eos-id="src/pages/admin/insights.tsx#79" id="impact" title="Impact" hint="What our events put back into the land, in this window."
            action={<SelectAll data-eos-id="src/pages/admin/insights.tsx#80" keys={visibleDefs.map((d) => `im_${d.key}`)} sel={selected} onSet={selectMany} />} />
          <motion.div data-eos-id="src/pages/admin/insights.tsx#81" variants={v.fadeUp}>
            <AdminHeroStatRow data-eos-id="src/pages/admin/insights.tsx#82" className="!max-w-none grid-cols-2 sm:!grid-cols-3 lg:!grid-cols-5">
              {visibleDefs.map((def) => (
                <Selectable data-eos-id="src/pages/admin/insights.tsx#83" key={def.key} k={`im_${def.key}`} sel={selected} onToggle={toggle}>
                  <AdminHeroStat data-eos-id="src/pages/admin/insights.tsx#84" value={Math.round((obs?.summary.metrics[def.key] ?? 0) * (def.decimal ? 10 : 1)) / (def.decimal ? 10 : 1)}
                    label={`${def.label}${def.unit ? ` (${def.unit})` : ''}`} icon={metricIcon(def)} color={ICON_TO_COLOR[def.icon] ?? 'glass'} reducedMotion delay={0} sub={provSub(def.key)} />
                </Selectable>
              ))}
              {visibleDefs.length === 0 && !obsLoading && <p data-eos-id="src/pages/admin/insights.tsx#85" className="col-span-full text-sm text-neutral-400 py-4">No impact logged in this window.</p>}
            </AdminHeroStatRow>
          </motion.div>
        </div>

        {/* ── Attendance & recurrence ── */}
        {att && (
          <div data-eos-id="src/pages/admin/insights.tsx#86">
            <Section data-eos-id="src/pages/admin/insights.tsx#87" id="attendance" title="Attendance & recurrence" hint="Who came, who came back, and how registrations convert to sign-ins."
              action={<SelectAll data-eos-id="src/pages/admin/insights.tsx#88" keys={['at_unique', 'at_returnrate', 'at_new', 'at_returning', 'at_registrations', 'at_signins', 'at_followthrough', 'at_avgevents', 'ret_1', 'ret_2', 'ret_3', 'ret_45', 'ret_6']} sel={selected} onSet={selectMany} />} />
            <motion.div data-eos-id="src/pages/admin/insights.tsx#89" variants={v.fadeUp} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* selectable mini stats */}
              <div data-eos-id="src/pages/admin/insights.tsx#90" className="grid grid-cols-2 gap-3">
                {[
                  { k: 'at_unique', label: 'Unique people', val: fmtNum(att.unique_attendees) },
                  { k: 'at_returnrate', label: 'Return rate', val: `${att.return_rate_pct}%` },
                  { k: 'at_new', label: 'New people (came once)', val: fmtNum(att.new_attendees) },
                  { k: 'at_returning', label: 'Returning (2+ events)', val: fmtNum(att.returning_attendees) },
                  { k: 'at_followthrough', label: 'Sign-in rate', val: `${att.followthrough_pct}%` },
                  { k: 'at_avgevents', label: 'Avg per person', val: String(att.retention.avg_events_per_attendee) },
                  { k: 'at_registrations', label: 'Registrations', val: fmtNum(att.registrations) },
                  { k: 'at_signins', label: 'Sign-ins', val: fmtNum(att.signins) },
                ].map((s) => {
                  const on = selected.has(s.k)
                  return (
                    <button data-eos-id="src/pages/admin/insights.tsx#91" key={s.k} type="button" onClick={() => toggle(s.k)}
                      className={cn('relative text-left rounded-sm border p-3.5 transition-all cursor-pointer', on ? 'border-primary-500 ring-1 ring-primary-500 bg-primary-50/40' : 'border-neutral-200 bg-white hover:border-neutral-300')}>
                      <span data-eos-id="src/pages/admin/insights.tsx#92" className={cn('absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center', on ? 'bg-primary-600 text-white' : 'text-neutral-300')}>
                        {on ? <Check data-eos-id="src/pages/admin/insights.tsx#93" size={10} strokeWidth={3} /> : <span data-eos-id="src/pages/admin/insights.tsx#94" className="w-3 h-3 rounded-full ring-1 ring-neutral-200" />}
                      </span>
                      <p data-eos-id="src/pages/admin/insights.tsx#95" data-eos-var="s.val" data-eos-var-label="Val" data-eos-var-scope="item" className="text-xl font-bold text-neutral-900 tabular-nums">{s.val}</p>
                      <p data-eos-id="src/pages/admin/insights.tsx#96" data-eos-var="s.label" data-eos-var-label="Label" data-eos-var-scope="item" className="text-[11px] text-neutral-500 mt-0.5">{s.label}</p>
                    </button>
                  )
                })}
              </div>
              {/* recurrence table */}
              <div data-eos-id="src/pages/admin/insights.tsx#97" className="rounded-md bg-white shadow-sm border border-neutral-100 p-5">
                <div data-eos-id="src/pages/admin/insights.tsx#98" className="flex items-center justify-between mb-1">
                  <p data-eos-id="src/pages/admin/insights.tsx#99" className="text-sm font-semibold text-neutral-900">Attendee recurrence</p>
                  <CopyTableButton data-eos-id="src/pages/admin/insights.tsx#100" onCopy={() => copyTableSpec(retentionTableSpec, 'ret')} copied={copied === 'ret'} />
                </div>
                <p data-eos-id="src/pages/admin/insights.tsx#101" className="text-xs text-neutral-500 mb-3">How many unique people came to N events.</p>
                <div data-eos-id="src/pages/admin/insights.tsx#102" className="mb-3 rounded-sm bg-sprout-50/60 border border-sprout-100 px-3 py-2">
                  <p data-eos-id="src/pages/admin/insights.tsx#103" data-eos-var="att.return_rate_pct" data-eos-var-label="Return rate pct" data-eos-var-scope="prop" className="text-2xl font-bold text-sprout-700 tabular-nums leading-none">{att.return_rate_pct}%</p>
                  <p data-eos-id="src/pages/admin/insights.tsx#104" data-eos-var="att.returning_attendees,att.unique_attendees" data-eos-var-label="Returning attendees, Unique attendees" data-eos-var-scope="prop" className="text-[11px] text-neutral-600 mt-1">return rate · {fmtNum(att.returning_attendees)} of {fmtNum(att.unique_attendees)} people came to 2+ events</p>
                </div>
                <CohortBar data-eos-id="src/pages/admin/insights.tsx#105" label="1 event" count={att.retention.attended_1} total={att.unique_attendees} rm={rm} />
                <CohortBar data-eos-id="src/pages/admin/insights.tsx#106" label="2 events" count={att.retention.attended_2} total={att.unique_attendees} rm={rm} />
                <CohortBar data-eos-id="src/pages/admin/insights.tsx#107" label="3 events" count={att.retention.attended_3} total={att.unique_attendees} rm={rm} />
                <CohortBar data-eos-id="src/pages/admin/insights.tsx#108" label="4-5" count={att.retention.attended_4_to_5} total={att.unique_attendees} rm={rm} />
                <CohortBar data-eos-id="src/pages/admin/insights.tsx#109" label="6+" count={att.retention.attended_6_plus} total={att.unique_attendees} rm={rm} />
              </div>
            </motion.div>
          </div>
        )}

        {/* ── By collective ── */}
        {sortedCollectives.length > 0 && (
          <div data-eos-id="src/pages/admin/insights.tsx#110">
            <Section data-eos-id="src/pages/admin/insights.tsx#111" id="collectives" title="By collective"
              hint={meta && !meta.collectiveBreakdownTrustworthy ? 'Pre-2025 rows are leader-reported estimates, not exact recorded data. Real per-collective data starts in 2025.' : undefined}
              action={<CopyTableButton data-eos-id="src/pages/admin/insights.tsx#112" onCopy={() => copyTableSpec(collectiveTableSpec, 'coll')} copied={copied === 'coll'} />} />
            <motion.div data-eos-id="src/pages/admin/insights.tsx#113" variants={v.fadeUp} className="rounded-md bg-white shadow-sm border border-neutral-100 overflow-hidden">
              <div data-eos-id="src/pages/admin/insights.tsx#114" className="overflow-x-auto">
                <table data-eos-id="src/pages/admin/insights.tsx#115" className="w-full text-sm">
                  <thead data-eos-id="src/pages/admin/insights.tsx#116">
                    <tr data-eos-id="src/pages/admin/insights.tsx#117" className="border-b border-neutral-100 text-left text-[11px] uppercase tracking-wider text-neutral-400">
                      <th data-eos-id="src/pages/admin/insights.tsx#118" className="px-4 py-3 font-semibold">Collective</th>
                      <th data-eos-id="src/pages/admin/insights.tsx#119" className="px-3 py-3 font-semibold text-right">Events</th>
                      <th data-eos-id="src/pages/admin/insights.tsx#120" className="px-3 py-3 font-semibold text-right">Attendees</th>
                      {visibleDefs.slice(0, 4).map((def) => <th data-eos-id="src/pages/admin/insights.tsx#121" data-eos-var="def.label,def.unit" data-eos-var-label="Label, Unit" data-eos-var-scope="item" key={def.key} className="px-3 py-3 font-semibold text-right">{def.label}{def.unit ? ` (${def.unit})` : ''}</th>)}
                      <th data-eos-id="src/pages/admin/insights.tsx#122" className="px-3 py-3 font-semibold text-right">Est. hrs</th>
                    </tr>
                  </thead>
                  <tbody data-eos-id="src/pages/admin/insights.tsx#123">
                    {sortedCollectives.map((c) => {
                      const isSelected = collectiveIds.includes(c.collectiveId)
                      return (
                      <tr data-eos-id="src/pages/admin/insights.tsx#124"
                        key={c.collectiveId}
                        title={isSelected ? 'Remove from selection' : 'Add to selection'}
                        className={cn(
                          'border-b border-neutral-50 last:border-0 transition-colors cursor-pointer',
                          isSelected ? 'bg-primary-50 hover:bg-primary-100' : 'hover:bg-neutral-50',
                        )}
                        onClick={() => setCollectiveIds((prev) => prev.includes(c.collectiveId) ? prev.filter((id) => id !== c.collectiveId) : [...prev, c.collectiveId])}
                      >
                        <td data-eos-id="src/pages/admin/insights.tsx#125" className="px-4 py-3 font-semibold text-neutral-900">
                          <span data-eos-id="src/pages/admin/insights.tsx#126" data-eos-var="c.name" data-eos-var-label="Name" data-eos-var-scope="item" className="inline-flex items-center gap-1.5">
                            {c.name}
                            {c.isEstimate && (
                              <span data-eos-id="src/pages/admin/insights.tsx#127" title="Pre-2025 leader-reported estimate, not exact recorded data" className="inline-flex items-center gap-1 rounded-sm bg-warning-50 text-warning-700 text-[10px] font-semibold px-1.5 py-0.5">
                                <Info data-eos-id="src/pages/admin/insights.tsx#128" size={10} /> Estimate
                              </span>
                            )}
                          </span>
                        </td>
                        <td data-eos-id="src/pages/admin/insights.tsx#129" data-eos-var="c.eventCount" data-eos-var-label="Event count" data-eos-var-scope="item" className="px-3 py-3 text-right tabular-nums text-neutral-700">{c.eventCount}</td>
                        <td data-eos-id="src/pages/admin/insights.tsx#130" data-eos-var="c.attendees" data-eos-var-label="Attendees" data-eos-var-scope="item" className="px-3 py-3 text-right tabular-nums text-neutral-700">{fmtNum(c.attendees)}</td>
                        {visibleDefs.slice(0, 4).map((def) => <td data-eos-id="src/pages/admin/insights.tsx#131" data-eos-var="c.metrics.[..]" data-eos-var-label="]" data-eos-var-scope="item" key={def.key} className="px-3 py-3 text-right tabular-nums text-neutral-700">{fmtMetricVal(c.metrics[def.key] ?? 0, def)}</td>)}
                        <td data-eos-id="src/pages/admin/insights.tsx#132" data-eos-var="c.estimatedHours" data-eos-var-label="Estimated hours" data-eos-var-scope="item" className="px-3 py-3 text-right tabular-nums text-neutral-700">{fmtNum(c.estimatedHours)}</td>
                      </tr>
                      )
                    })}
                    {nationalHistorical && (
                      <tr data-eos-id="src/pages/admin/insights.tsx#133"
                        className="border-t-2 border-neutral-200 bg-neutral-50/70"
                        title="Stated national historical figures for years before per-collective tracking (mainly 2022). These cannot be attributed to any collective, so they appear only here. Collectives + this row = the headline total."
                      >
                        <td data-eos-id="src/pages/admin/insights.tsx#134" className="px-4 py-3 font-medium text-neutral-500 italic">
                          <span data-eos-id="src/pages/admin/insights.tsx#135" className="inline-flex items-center gap-1.5">
                            <Info data-eos-id="src/pages/admin/insights.tsx#136" size={11} className="text-neutral-400" />
                            National historical (pre-2025, no collective breakdown)
                          </span>
                        </td>
                        <td data-eos-id="src/pages/admin/insights.tsx#137" data-eos-var="nationalHistorical.eventsRem" data-eos-var-label="Events rem" data-eos-var-scope="prop" className="px-3 py-3 text-right tabular-nums text-neutral-500 italic">{nationalHistorical.eventsRem > 0 ? fmtNum(nationalHistorical.eventsRem) : '-'}</td>
                        <td data-eos-id="src/pages/admin/insights.tsx#138" data-eos-var="nationalHistorical.attendeesRem" data-eos-var-label="Attendees rem" data-eos-var-scope="prop" className="px-3 py-3 text-right tabular-nums text-neutral-500 italic">{nationalHistorical.attendeesRem > 0 ? fmtNum(nationalHistorical.attendeesRem) : '-'}</td>
                        {visibleDefs.slice(0, 4).map((def) => <td data-eos-id="src/pages/admin/insights.tsx#139" data-eos-var="nationalHistorical.metricsRem.[..]" data-eos-var-label="]" data-eos-var-scope="prop" key={def.key} className="px-3 py-3 text-right tabular-nums text-neutral-500 italic">{(nationalHistorical.metricsRem[def.key] ?? 0) > 0 ? fmtMetricVal(nationalHistorical.metricsRem[def.key], def) : '-'}</td>)}
                        <td data-eos-id="src/pages/admin/insights.tsx#140" data-eos-var="nationalHistorical.hoursRem" data-eos-var-label="Hours rem" data-eos-var-scope="prop" className="px-3 py-3 text-right tabular-nums text-neutral-500 italic">{nationalHistorical.hoursRem > 0 ? fmtNum(nationalHistorical.hoursRem) : '-'}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {nationalHistorical && (
                <p data-eos-id="src/pages/admin/insights.tsx#141" className="px-4 py-2.5 text-[11px] text-neutral-400 border-t border-neutral-100">
                  The final row is Co-Exist's stated national historical figure for years before per-collective tracking began (mainly 2022). It cannot be attributed to a collective, so it sits outside the breakdown. Collectives plus this row equal the headline total.
                </p>
              )}
            </motion.div>
          </div>
        )}

        {/* ── Event impact log ── */}
        <div data-eos-id="src/pages/admin/insights.tsx#142">
          <Section data-eos-id="src/pages/admin/insights.tsx#143" id="events" title="Event impact log" hint={sortedEvents.length ? `${sortedEvents.length} event${sortedEvents.length !== 1 ? 's' : ''} in scope` : undefined}
            action={<button data-eos-id="src/pages/admin/insights.tsx#144" type="button" onClick={() => downloadCsv('coexist-events.csv', eventCsvSpec())} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary-700 hover:text-primary-800 px-2.5 py-1 rounded-sm hover:bg-primary-50 cursor-pointer"><Download data-eos-id="src/pages/admin/insights.tsx#145" size={12} /> CSV</button>} />
          <motion.div data-eos-id="src/pages/admin/insights.tsx#146" variants={v.fadeUp} className="mb-3">
            <SearchBar data-eos-id="src/pages/admin/insights.tsx#147" value={search} onChange={setSearch} placeholder="Search events..." compact className="max-w-sm" />
          </motion.div>
          <motion.div data-eos-id="src/pages/admin/insights.tsx#148" variants={v.fadeUp} className="rounded-md bg-white shadow-sm border border-neutral-100 overflow-hidden">
            <div data-eos-id="src/pages/admin/insights.tsx#149" className="overflow-x-auto">
              <table data-eos-id="src/pages/admin/insights.tsx#150" className="w-full text-sm">
                <thead data-eos-id="src/pages/admin/insights.tsx#151">
                  <tr data-eos-id="src/pages/admin/insights.tsx#152" className="border-b border-neutral-100 text-left text-[11px] uppercase tracking-wider text-neutral-400">
                    <th data-eos-id="src/pages/admin/insights.tsx#153" className="px-4 py-3 font-semibold">Date</th>
                    <th data-eos-id="src/pages/admin/insights.tsx#154" className="px-3 py-3 font-semibold min-w-[180px]">Event</th>
                    <th data-eos-id="src/pages/admin/insights.tsx#155" className="px-3 py-3 font-semibold">Collective</th>
                    <th data-eos-id="src/pages/admin/insights.tsx#156" className="px-3 py-3 font-semibold text-center">Type</th>
                    {visibleDefs.map((def) => <th data-eos-id="src/pages/admin/insights.tsx#157" data-eos-var="def.label,def.unit" data-eos-var-label="Label, Unit" data-eos-var-scope="item" key={def.key} className="px-3 py-3 font-semibold text-right">{def.label}{def.unit ? ` (${def.unit})` : ''}</th>)}
                    <th data-eos-id="src/pages/admin/insights.tsx#158" className="px-3 py-3 font-semibold text-right">Est. hrs</th>
                  </tr>
                </thead>
                <tbody data-eos-id="src/pages/admin/insights.tsx#159">
                  {displayEvents.length === 0 ? (
                    <tr data-eos-id="src/pages/admin/insights.tsx#160"><td data-eos-id="src/pages/admin/insights.tsx#161" colSpan={5 + visibleDefs.length} className="px-4 py-12 text-center text-sm text-neutral-500">No impact data matches your filters</td></tr>
                  ) : displayEvents.map((row) => (
                    <tr data-eos-id="src/pages/admin/insights.tsx#162" key={row.eventId} className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50 transition-colors group">
                      <td data-eos-id="src/pages/admin/insights.tsx#163" data-eos-var="row.date" data-eos-var-label="Date" data-eos-var-scope="item" className="px-4 py-3 text-xs text-neutral-500 tabular-nums whitespace-nowrap">{fmtDate(row.date)}</td>
                      <td data-eos-id="src/pages/admin/insights.tsx#164" className="px-3 py-3">
                        <div data-eos-id="src/pages/admin/insights.tsx#165" className="flex items-center gap-2">
                          <Link data-eos-id="src/pages/admin/insights.tsx#166" data-eos-var="row.title" data-eos-var-label="Title" data-eos-var-scope="item" to={`/events/${row.eventId}`} className="text-sm font-medium text-neutral-900 hover:text-neutral-700 line-clamp-1">{row.title}</Link>
                          <ExternalLink data-eos-id="src/pages/admin/insights.tsx#167" size={12} className="text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          {row.isLegacy && <Badge data-eos-id="src/pages/admin/insights.tsx#168" variant="default" size="sm">Legacy</Badge>}
                        </div>
                        {row.attendance != null && <span data-eos-id="src/pages/admin/insights.tsx#169" data-eos-var="row.attendance" data-eos-var-label="Attendance" data-eos-var-scope="item" className="text-[11px] text-neutral-500">{row.attendance} attendees</span>}
                      </td>
                      <td data-eos-id="src/pages/admin/insights.tsx#170" data-eos-var="row.collectiveName" data-eos-var-label="Collective name" data-eos-var-scope="item" className="px-3 py-3 text-xs text-neutral-500 whitespace-nowrap">{row.collectiveName}</td>
                      <td data-eos-id="src/pages/admin/insights.tsx#171" className="px-3 py-3 text-center"><Badge data-eos-id="src/pages/admin/insights.tsx#172" data-eos-var="ACTIVITY_TYPE_LABELS.[..]" data-eos-var-label="]" data-eos-var-scope="prop" variant="activity" activity={activityToBadge(row.activityType)} size="sm">{ACTIVITY_TYPE_LABELS[row.activityType] ?? row.activityType}</Badge></td>
                      {visibleDefs.map((def) => <td data-eos-id="src/pages/admin/insights.tsx#173" data-eos-var="row.metrics.[..]" data-eos-var-label="]" data-eos-var-scope="item" key={def.key} className="px-3 py-3 text-right tabular-nums text-neutral-900">{fmtMetricVal(row.metrics[def.key] ?? null, def)}</td>)}
                      <td data-eos-id="src/pages/admin/insights.tsx#174" data-eos-var="row.estimatedVolHours" data-eos-var-label="Estimated vol hours" data-eos-var-scope="item" className="px-3 py-3 text-right tabular-nums text-neutral-900">{row.estimatedVolHours != null ? row.estimatedVolHours.toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!showAllEvents && sortedEvents.length > 25 && (
              <div data-eos-id="src/pages/admin/insights.tsx#175" className="border-t border-neutral-100 px-4 py-3 text-center">
                <button data-eos-id="src/pages/admin/insights.tsx#176" type="button" onClick={() => setShowAllEvents(true)} className="text-xs font-semibold text-primary-600 hover:text-primary-700 cursor-pointer">Show all {sortedEvents.length} events</button>
              </div>
            )}
          </motion.div>
        </div>

        {/* ── Year on year (comparison table for grant narratives) ── */}
        {yearTableSpec && yearTableSpec.rows.length > 1 && (
          <div data-eos-id="src/pages/admin/insights.tsx#177">
            <Section data-eos-id="src/pages/admin/insights.tsx#178" id="years" title="Year on year" hint="Growth across years - useful for funding narratives."
              action={<CopyTableButton data-eos-id="src/pages/admin/insights.tsx#179" onCopy={() => copyTableSpec(yearTableSpec, 'yr')} copied={copied === 'yr'} />} />
            <motion.div data-eos-id="src/pages/admin/insights.tsx#180" variants={v.fadeUp} className="rounded-md bg-white shadow-sm border border-neutral-100 overflow-hidden">
              <div data-eos-id="src/pages/admin/insights.tsx#181" className="overflow-x-auto">
                <table data-eos-id="src/pages/admin/insights.tsx#182" className="w-full text-sm">
                  <thead data-eos-id="src/pages/admin/insights.tsx#183">
                    <tr data-eos-id="src/pages/admin/insights.tsx#184" className="border-b border-neutral-100 text-left text-[11px] uppercase tracking-wider text-neutral-400">
                      {yearTableSpec.headers.map((h, i) => <th data-eos-id="src/pages/admin/insights.tsx#185" key={h} className={cn('px-3 py-3 font-semibold', i === 0 ? 'pl-4 text-left' : 'text-right')}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody data-eos-id="src/pages/admin/insights.tsx#186">
                    {yearTableSpec.rows.map((r, ri) => (
                      <tr data-eos-id="src/pages/admin/insights.tsx#187" key={ri} className="border-b border-neutral-50 last:border-0">
                        {r.map((c, ci) => <td data-eos-id="src/pages/admin/insights.tsx#188" data-eos-var="c.toLocaleString" data-eos-var-label="To locale string" data-eos-var-scope="item" key={ci} className={cn('px-3 py-3 tabular-nums', ci === 0 ? 'pl-4 font-semibold text-neutral-900' : 'text-right text-neutral-700')}>{typeof c === 'number' ? c.toLocaleString() : c}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        )}

        {/* ── Raw data (CSV) ── */}
        <div data-eos-id="src/pages/admin/insights.tsx#189">
          <Section data-eos-id="src/pages/admin/insights.tsx#190" id="data" title="Raw data" hint="The data behind the numbers, for spreadsheets." />
          <motion.div data-eos-id="src/pages/admin/insights.tsx#191" variants={v.fadeUp} className="flex flex-wrap gap-2">
            <button data-eos-id="src/pages/admin/insights.tsx#192" type="button" onClick={() => downloadCsv('coexist-events.csv', eventCsvSpec())} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-sm bg-white border border-neutral-200 text-sm font-medium text-neutral-700 hover:border-neutral-300 cursor-pointer"><Download data-eos-id="src/pages/admin/insights.tsx#193" size={14} /> Event impact log</button>
            <button data-eos-id="src/pages/admin/insights.tsx#194" type="button" onClick={() => downloadCsv('coexist-by-collective.csv', collectiveTableSpec)} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-sm bg-white border border-neutral-200 text-sm font-medium text-neutral-700 hover:border-neutral-300 cursor-pointer"><Download data-eos-id="src/pages/admin/insights.tsx#195" size={14} /> By collective</button>
            {retentionTableSpec && <button data-eos-id="src/pages/admin/insights.tsx#196" type="button" onClick={() => downloadCsv('coexist-recurrence.csv', retentionTableSpec)} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-sm bg-white border border-neutral-200 text-sm font-medium text-neutral-700 hover:border-neutral-300 cursor-pointer"><Download data-eos-id="src/pages/admin/insights.tsx#197" size={14} /> Attendee recurrence</button>}
            {yearTableSpec && <button data-eos-id="src/pages/admin/insights.tsx#198" type="button" onClick={() => downloadCsv('coexist-year-on-year.csv', yearTableSpec)} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-sm bg-white border border-neutral-200 text-sm font-medium text-neutral-700 hover:border-neutral-300 cursor-pointer"><Download data-eos-id="src/pages/admin/insights.tsx#199" size={14} /> Year on year</button>}
          </motion.div>
        </div>
      </div>

      {/* ── Sticky selection bar ──
          Sits ABOVE the mobile bottom tab bar (which /admin renders on
          small screens) via bottom-24, then drops to bottom-6 from md
          where the layout uses the sidebar and there is no tab bar.
          Extra safe-area padding clears the home indicator. */}
      {selected.size > 0 && (
        <div data-eos-id="src/pages/admin/insights.tsx#200"
          className="fixed bottom-[88px] md:bottom-6 left-3 right-3 md:left-1/2 md:right-auto md:-translate-x-1/2 z-40 flex items-center justify-between md:justify-start gap-2 px-3 py-2.5 rounded-md bg-white text-neutral-900 ring-1 ring-neutral-200 shadow-sm"
          style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <span data-eos-id="src/pages/admin/insights.tsx#201" data-eos-var="selected.size" data-eos-var-label="Size" data-eos-var-scope="prop" className="text-sm font-semibold tabular-nums text-neutral-900 whitespace-nowrap shrink-0 pl-1">{selected.size} selected</span>
          <div data-eos-id="src/pages/admin/insights.tsx#202" className="flex items-center gap-1.5 shrink-0">
            <button data-eos-id="src/pages/admin/insights.tsx#203" type="button" onClick={copySelected} className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold px-3 py-2 rounded-sm bg-primary-600 text-white hover:bg-primary-700 active:scale-[0.98] transition-all cursor-pointer">
              {copied === 'sel' ? <Check data-eos-id="src/pages/admin/insights.tsx#204" size={15} /> : <Copy data-eos-id="src/pages/admin/insights.tsx#205" size={15} />}<span data-eos-id="src/pages/admin/insights.tsx#206">{copied === 'sel' ? 'Copied' : 'Copy table'}</span>
            </button>
            <button data-eos-id="src/pages/admin/insights.tsx#207" type="button" onClick={csvSelected} aria-label="Download CSV" className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium px-3 py-2 rounded-sm bg-neutral-100 text-neutral-700 hover:bg-neutral-200 active:scale-[0.98] transition-all cursor-pointer"><Download data-eos-id="src/pages/admin/insights.tsx#208" size={15} />CSV</button>
            <button data-eos-id="src/pages/admin/insights.tsx#209" type="button" onClick={clearSel} aria-label="Clear selection" className="p-2 rounded-sm text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 active:scale-[0.98] transition-all cursor-pointer shrink-0"><X data-eos-id="src/pages/admin/insights.tsx#210" size={16} /></button>
          </div>
        </div>
      )}
    </motion.div>
  )
}

/**
 * Window confidence chip. Communicates how much to trust the numbers for the
 * selected range (THE RULE honesty labelling):
 *  - granular: real per-event, per-collective, per-date data (2025-forward).
 *  - mixed: overlaps the granular era and a pre-2025 national-only era.
 *  - national: entirely pre-2025 - national annual figures only.
 */
function ConfidenceChip({ meta }: { meta: import('@/hooks/use-admin-impact-observations').ObservationsMeta }) {
  const map = {
    granular: { label: 'Verified per-event data', cls: 'bg-success-50 text-success-700 border-success-200', icon: <ShieldCheck data-eos-id="src/pages/admin/insights.tsx#211" size={11} /> },
    mixed:    { label: 'Recent verified + pre-2025 estimates', cls: 'bg-warning-50 text-warning-700 border-warning-200', icon: <Info data-eos-id="src/pages/admin/insights.tsx#212" size={11} /> },
    national: { label: 'National estimates (pre-2025)', cls: 'bg-warning-50 text-warning-700 border-warning-200', icon: <Info data-eos-id="src/pages/admin/insights.tsx#213" size={11} /> },
  } as const
  const c = map[meta.confidence]
  return (
    <span data-eos-id="src/pages/admin/insights.tsx#214" data-eos-var="c.icon,c.label" data-eos-var-label="Icon, Label" data-eos-var-scope="prop" className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold', c.cls)}>
      {c.icon} {c.label}
    </span>
  )
}

/* select-all toggle for a section */
function SelectAll({ keys, sel, onSet }: { keys: string[]; sel: Set<string>; onSet: (keys: string[], on: boolean) => void }) {
  if (keys.length === 0) return null
  const allOn = keys.every((k) => sel.has(k))
  return (
    <button data-eos-id="src/pages/admin/insights.tsx#215" type="button" onClick={() => onSet(keys, !allOn)}
      className="text-[11px] font-semibold text-neutral-500 hover:text-primary-700 px-2 py-1 rounded-sm hover:bg-primary-50 transition-colors cursor-pointer">
      {allOn ? 'Deselect all' : 'Select all'}
    </button>
  )
}
