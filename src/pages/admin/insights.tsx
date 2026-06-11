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
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  CalendarDays, Users, UserCheck, Repeat, Clock, Leaf, TreePine, Trash2,
  Waves, Eye, Ruler, Sprout, Sparkles, Droplets, Mountain, Flower2, Bug,
  Flame, Fish, Wind, ExternalLink, Copy, Check, Download, Table as TableIcon,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAdminHeader } from '@/components/admin-layout'
import { AdminHeroStat, AdminHeroStatRow, type HeroStatColor } from '@/components/admin-hero-stat'
import { Dropdown } from '@/components/dropdown'
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
import { dateRangeOptions, getDateRangeStart, type DateRange } from '@/hooks/use-admin-dashboard'
import { ACTIVITY_TYPE_OPTIONS, ACTIVITY_TYPE_LABELS } from '@/hooks/use-events'
import { useCollectives } from '@/hooks/use-collective'
import type { AttendanceMetrics } from '@/lib/attendance-metrics'

/* ------------------------------------------------------------------ */
/*  Metric icon + colour registry                                      */
/* ------------------------------------------------------------------ */

const METRIC_ICONS: Record<string, (s: number) => ReactNode> = {
  tree: (s) => <TreePine size={s} />, leaf: (s) => <Leaf size={s} />,
  weed: (s) => <Sprout size={s} />, trash: (s) => <Trash2 size={s} />,
  wave: (s) => <Waves size={s} />, eye: (s) => <Eye size={s} />,
  area: (s) => <Ruler size={s} />, clock: (s) => <Clock size={s} />,
  sparkle: (s) => <Sparkles size={s} />, droplet: (s) => <Droplets size={s} />,
  mountain: (s) => <Mountain size={s} />, flower: (s) => <Flower2 size={s} />,
  bug: (s) => <Bug size={s} />, flame: (s) => <Flame size={s} />,
  fish: (s) => <Fish size={s} />, wind: (s) => <Wind size={s} />,
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
    <div id={id} className="scroll-mt-24 flex items-end justify-between gap-3 mb-3">
      <div>
        <h2 className="font-heading text-[13px] font-bold uppercase tracking-widest text-neutral-700/70">{title}</h2>
        {hint && <p className="text-xs text-neutral-400 mt-0.5">{hint}</p>}
      </div>
      {action}
    </div>
  )
}

/** Click-to-select wrapper. Shows a corner check so the affordance is obvious. */
function Selectable({ k, sel, onToggle, children }: { k: string; sel: Set<string>; onToggle: (k: string) => void; children: ReactNode }) {
  const on = sel.has(k)
  return (
    <div
      onClick={() => onToggle(k)}
      role="button"
      aria-pressed={on}
      className={cn('group relative cursor-pointer rounded-2xl transition-all', on && 'ring-2 ring-primary-500 ring-offset-2')}
    >
      <span className={cn(
        'absolute top-2 right-2 z-10 w-5 h-5 rounded-full flex items-center justify-center transition-all',
        on ? 'bg-primary-600 text-white' : 'bg-white/70 text-neutral-300 ring-1 ring-neutral-200 opacity-0 group-hover:opacity-100',
      )}>
        <Check size={12} strokeWidth={3} />
      </span>
      {children}
    </div>
  )
}

function CopyTableButton({ onCopy, copied, label = 'Copy table' }: { onCopy: () => void; copied: boolean; label?: string }) {
  return (
    <button type="button" onClick={onCopy}
      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary-700 hover:text-primary-800 px-2.5 py-1 rounded-lg hover:bg-primary-50 transition-colors cursor-pointer">
      {copied ? <Check size={12} /> : <TableIcon size={12} />} {copied ? 'Copied' : label}
    </button>
  )
}

function CohortBar({ label, count, total, rm }: { label: string; count: number; total: number; rm: boolean }) {
  const p = pct(count, total)
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-14 shrink-0 text-sm text-neutral-600">{label}</span>
      <div className="flex-1 h-7 rounded-lg bg-neutral-100 overflow-hidden">
        <motion.div className="h-full bg-primary-400 rounded-lg"
          initial={rm ? { width: `${Math.max(p, count > 0 ? 3 : 0)}%` } : { width: 0 }}
          animate={{ width: `${Math.max(p, count > 0 ? 3 : 0)}%` }} transition={{ duration: 0.6 }} />
      </div>
      <span className="w-24 shrink-0 text-right text-sm tabular-nums text-neutral-700">{count} <span className="text-neutral-400">({p}%)</span></span>
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
  const [collectiveId, setCollectiveId] = useState('')
  const [activityType, setActivityType] = useState('')
  const [search, setSearch] = useState('')

  const { data: collectives } = useCollectives({ includeNational: true })
  const { activeDefs } = useImpactMetricDefs()

  const filters: ObservationFilters = useMemo(() => ({
    dateRange,
    collectiveId: collectiveId || undefined,
    activityType: (activityType || undefined) as ObservationFilters['activityType'],
    search: search || undefined,
  }), [dateRange, collectiveId, activityType, search])

  const { data: obs, isLoading: obsLoading } = useImpactObservations(filters, activeDefs)
  const { data: yoy } = useYearOverYear(activeDefs)

  const fromDate = useMemo(() => {
    const s = getDateRangeStart(dateRange)
    return s ? s.slice(0, 10) : '2018-01-01'
  }, [dateRange])
  const { data: att } = useQuery({
    queryKey: ['insights-attendance', dateRange, collectiveId],
    queryFn: async (): Promise<AttendanceMetrics> => {
      const { data, error } = await supabase.rpc('coexist_attendance_metrics', {
        p_collective_ids: collectiveId ? [collectiveId] : null, p_from: fromDate, p_to: todayIso(),
      })
      if (error) throw error
      return data as unknown as AttendanceMetrics
    },
  })

  const collectiveOptions = useMemo(
    () => [{ value: '', label: 'All Collectives' }, ...[...(collectives ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.name }))],
    [collectives],
  )
  const activityOptions = useMemo(
    () => [{ value: '', label: 'All Types' }, ...ACTIVITY_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))],
    [],
  )
  const collectiveLabel = collectiveId ? (collectives?.find((c) => c.id === collectiveId)?.name ?? 'Collective') : 'All collectives'
  const dateLabel = dateRangeOptions.find((o) => o.value === dateRange)?.label ?? 'All time'
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
      out.push({ key: 'at_new', group: 'Attendance', label: 'New people', value: fmtNum(att.new_attendees) })
      out.push({ key: 'at_returning', group: 'Attendance', label: 'Returning people', value: fmtNum(att.returning_attendees) })
      out.push({ key: 'at_registrations', group: 'Attendance', label: 'Registrations', value: fmtNum(att.registrations) })
      out.push({ key: 'at_signins', group: 'Attendance', label: 'Sign-ins', value: fmtNum(att.signins) })
      out.push({ key: 'at_followthrough', group: 'Attendance', label: 'Sign-in rate', value: `${att.followthrough_pct}%` })
      out.push({ key: 'at_avgevents', group: 'Attendance', label: 'Avg events per person', value: String(att.retention.avg_events_per_attendee) })
      out.push({ key: 'ret_1', group: 'Recurrence', label: 'Attended 1 event', value: fmtNum(att.retention.attended_1) })
      out.push({ key: 'ret_2', group: 'Recurrence', label: 'Attended 2 events', value: fmtNum(att.retention.attended_2) })
      out.push({ key: 'ret_3', group: 'Recurrence', label: 'Attended 3 events', value: fmtNum(att.retention.attended_3) })
      out.push({ key: 'ret_45', group: 'Recurrence', label: 'Attended 4-5 events', value: fmtNum(att.retention.attended_4_to_5) })
      out.push({ key: 'ret_6', group: 'Recurrence', label: 'Attended 6+ events', value: fmtNum(att.retention.attended_6_plus) })
      const repeat = att.unique_attendees - att.retention.attended_1
      out.push({ key: 'at_repeat', group: 'Attendance', label: 'Came back (2+ events)', value: `${fmtNum(repeat)} (${pct(repeat, att.unique_attendees)}%)` })
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
  const collectiveTableSpec: TableSpec = useMemo(() => ({
    title: scopeLine,
    headers: ['Collective', 'Events', 'Attendees', ...visibleDefs.slice(0, 4).map((d) => `${d.label}${d.unit ? ` (${d.unit})` : ''}`), 'Est. hours'],
    rows: sortedCollectives.map((c) => [c.name, c.eventCount, c.attendees, ...visibleDefs.slice(0, 4).map((d) => c.metrics[d.key] ?? 0), c.estimatedHours]),
  }), [sortedCollectives, visibleDefs, scopeLine])

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

  const yearTableSpec: TableSpec | null = useMemo(() => (yoy && yoy.length) ? ({
    title: `Year on year · Co-Exist`,
    headers: ['Year', 'Events', 'Attendees', 'Est. hours', ...topMetrics.map((m) => m.def.label)],
    rows: [...yoy].sort((a, b) => a.year - b.year).map((y) => [y.year, y.events, y.attendees, y.estimatedHours, ...topMetrics.map((m) => y.metrics[m.def.key] ?? 0)]),
  }) : null, [yoy, topMetrics])

  async function copyTableSpec(spec: TableSpec | null, id: string) {
    if (!spec) return
    const ok = await copyTables([spec])
    flashCopied(id)
    toast.success(ok ? 'Table copied. Paste into your doc.' : 'Copied (plain text).')
  }

  const jump = [
    { id: 'overview', label: 'Overview' }, { id: 'impact', label: 'Impact' },
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
    <motion.div className="pb-28" variants={v.stagger} initial="hidden" animate="visible">
      {/* ── Sticky filter bar + jump nav ── */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 px-4 pb-3 bg-white/90 backdrop-blur border-b border-neutral-100 mb-6" style={{ paddingTop: 'calc(var(--safe-top, 0px) + 0.75rem)' }}>
        <div className="flex flex-wrap items-center gap-2">
          <Dropdown options={dateRangeOptions} value={dateRange} onChange={(x) => setDateRange(x as DateRange)} className="w-36" />
          <Dropdown options={collectiveOptions} value={collectiveId} onChange={setCollectiveId} className="w-44" />
          <Dropdown options={activityOptions} value={activityType} onChange={setActivityType} className="w-40" />
          <div className="hidden md:flex items-center gap-0.5 ml-auto text-[11px] font-medium text-neutral-400">
            {jump.map((j) => (
              <a key={j.id} href={`#${j.id}`} className="px-2 py-1 rounded-md hover:bg-neutral-100 hover:text-neutral-700 transition-colors">{j.label}</a>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-neutral-400 mt-2">Tap any number to select it, then copy your selection as a table. {scopeLine}</p>
      </div>

      <div className="space-y-10">
        {/* ── Overview ── */}
        <div>
          <Section id="overview" title="Overview"
            action={<SelectAll keys={['hl_events', 'hl_attendees', 'hl_hours', 'at_unique', 'at_repeat']} sel={selected} onSet={selectMany} />} />
          <motion.div variants={v.fadeUp}>
            <AdminHeroStatRow className="!max-w-none grid-cols-2 sm:!grid-cols-3 lg:!grid-cols-5">
              <Selectable k="hl_events" sel={selected} onToggle={toggle}><AdminHeroStat value={obs?.summary.totalEvents ?? 0} label="Events" icon={<CalendarDays size={18} />} color="primary" reducedMotion delay={0} /></Selectable>
              <Selectable k="hl_attendees" sel={selected} onToggle={toggle}><AdminHeroStat value={obs?.summary.totalAttendees ?? 0} label="Attendances" icon={<Users size={18} />} color="warning" reducedMotion delay={0} /></Selectable>
              <Selectable k="at_unique" sel={selected} onToggle={toggle}><AdminHeroStat value={att?.unique_attendees ?? 0} label="Unique people" icon={<UserCheck size={18} />} color="moss" reducedMotion delay={0} sub={att ? `${att.new_attendees} new` : undefined} /></Selectable>
              <Selectable k="at_repeat" sel={selected} onToggle={toggle}><AdminHeroStat value={att ? att.unique_attendees - att.retention.attended_1 : 0} label="Came back" icon={<Repeat size={18} />} color="sprout" reducedMotion delay={0} sub={att ? `${pct(att.unique_attendees - att.retention.attended_1, att.unique_attendees)}% 2+ events` : undefined} /></Selectable>
              <Selectable k="hl_hours" sel={selected} onToggle={toggle}><AdminHeroStat value={obs?.summary.totalEstimatedHours ?? 0} label="Est. vol hours" icon={<Clock size={18} />} color="bark" reducedMotion delay={0} /></Selectable>
            </AdminHeroStatRow>
          </motion.div>
        </div>

        {/* ── Impact ── */}
        <div>
          <Section id="impact" title="Impact" hint="What our events put back into the land, in this window."
            action={<SelectAll keys={visibleDefs.map((d) => `im_${d.key}`)} sel={selected} onSet={selectMany} />} />
          <motion.div variants={v.fadeUp}>
            <AdminHeroStatRow className="!max-w-none grid-cols-2 sm:!grid-cols-3 lg:!grid-cols-5">
              {visibleDefs.map((def) => (
                <Selectable key={def.key} k={`im_${def.key}`} sel={selected} onToggle={toggle}>
                  <AdminHeroStat value={Math.round((obs?.summary.metrics[def.key] ?? 0) * (def.decimal ? 10 : 1)) / (def.decimal ? 10 : 1)}
                    label={`${def.label}${def.unit ? ` (${def.unit})` : ''}`} icon={metricIcon(def)} color={ICON_TO_COLOR[def.icon] ?? 'glass'} reducedMotion delay={0} />
                </Selectable>
              ))}
              {visibleDefs.length === 0 && !obsLoading && <p className="col-span-full text-sm text-neutral-400 py-4">No impact logged in this window.</p>}
            </AdminHeroStatRow>
          </motion.div>
        </div>

        {/* ── Attendance & recurrence ── */}
        {att && (
          <div>
            <Section id="attendance" title="Attendance & recurrence" hint="Who came, who came back, and how registrations convert to sign-ins."
              action={<SelectAll keys={['at_unique', 'at_new', 'at_returning', 'at_registrations', 'at_signins', 'at_followthrough', 'at_avgevents', 'ret_1', 'ret_2', 'ret_3', 'ret_45', 'ret_6']} sel={selected} onSet={selectMany} />} />
            <motion.div variants={v.fadeUp} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* selectable mini stats */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { k: 'at_unique', label: 'Unique people', val: fmtNum(att.unique_attendees) },
                  { k: 'at_followthrough', label: 'Sign-in rate', val: `${att.followthrough_pct}%` },
                  { k: 'at_new', label: 'New people', val: fmtNum(att.new_attendees) },
                  { k: 'at_returning', label: 'Returning people', val: fmtNum(att.returning_attendees) },
                  { k: 'at_registrations', label: 'Registrations', val: fmtNum(att.registrations) },
                  { k: 'at_signins', label: 'Sign-ins', val: fmtNum(att.signins) },
                ].map((s) => {
                  const on = selected.has(s.k)
                  return (
                    <button key={s.k} type="button" onClick={() => toggle(s.k)}
                      className={cn('relative text-left rounded-xl border p-3.5 transition-all cursor-pointer', on ? 'border-primary-500 ring-1 ring-primary-500 bg-primary-50/40' : 'border-neutral-200 bg-white hover:border-neutral-300')}>
                      <span className={cn('absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center', on ? 'bg-primary-600 text-white' : 'text-neutral-300')}>
                        {on ? <Check size={10} strokeWidth={3} /> : <span className="w-3 h-3 rounded-full ring-1 ring-neutral-200" />}
                      </span>
                      <p className="text-xl font-bold text-neutral-900 tabular-nums">{s.val}</p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">{s.label}</p>
                    </button>
                  )
                })}
              </div>
              {/* recurrence table */}
              <div className="rounded-2xl bg-white shadow-sm border border-neutral-100 p-5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-neutral-900">Attendee recurrence</p>
                  <CopyTableButton onCopy={() => copyTableSpec(retentionTableSpec, 'ret')} copied={copied === 'ret'} />
                </div>
                <p className="text-xs text-neutral-500 mb-3">How many unique people came to N events.</p>
                <CohortBar label="1 event" count={att.retention.attended_1} total={att.unique_attendees} rm={rm} />
                <CohortBar label="2 events" count={att.retention.attended_2} total={att.unique_attendees} rm={rm} />
                <CohortBar label="3 events" count={att.retention.attended_3} total={att.unique_attendees} rm={rm} />
                <CohortBar label="4-5" count={att.retention.attended_4_to_5} total={att.unique_attendees} rm={rm} />
                <CohortBar label="6+" count={att.retention.attended_6_plus} total={att.unique_attendees} rm={rm} />
              </div>
            </motion.div>
          </div>
        )}

        {/* ── By collective ── */}
        {sortedCollectives.length > 0 && (
          <div>
            <Section id="collectives" title="By collective"
              action={<CopyTableButton onCopy={() => copyTableSpec(collectiveTableSpec, 'coll')} copied={copied === 'coll'} />} />
            <motion.div variants={v.fadeUp} className="rounded-2xl bg-white shadow-sm border border-neutral-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 text-left text-[11px] uppercase tracking-wider text-neutral-400">
                      <th className="px-4 py-3 font-semibold">Collective</th>
                      <th className="px-3 py-3 font-semibold text-right">Events</th>
                      <th className="px-3 py-3 font-semibold text-right">Attendees</th>
                      {visibleDefs.slice(0, 4).map((def) => <th key={def.key} className="px-3 py-3 font-semibold text-right">{def.label}{def.unit ? ` (${def.unit})` : ''}</th>)}
                      <th className="px-3 py-3 font-semibold text-right">Est. hrs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCollectives.map((c) => (
                      <tr key={c.collectiveId} className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50 transition-colors cursor-pointer" onClick={() => setCollectiveId(c.collectiveId)}>
                        <td className="px-4 py-3 font-semibold text-neutral-900">{c.name}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-neutral-700">{c.eventCount}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-neutral-700">{fmtNum(c.attendees)}</td>
                        {visibleDefs.slice(0, 4).map((def) => <td key={def.key} className="px-3 py-3 text-right tabular-nums text-neutral-700">{fmtMetricVal(c.metrics[def.key] ?? 0, def)}</td>)}
                        <td className="px-3 py-3 text-right tabular-nums text-neutral-700">{fmtNum(c.estimatedHours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        )}

        {/* ── Event impact log ── */}
        <div>
          <Section id="events" title="Event impact log" hint={sortedEvents.length ? `${sortedEvents.length} event${sortedEvents.length !== 1 ? 's' : ''} in scope` : undefined}
            action={<button type="button" onClick={() => downloadCsv('coexist-events.csv', eventCsvSpec())} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary-700 hover:text-primary-800 px-2.5 py-1 rounded-lg hover:bg-primary-50 cursor-pointer"><Download size={12} /> CSV</button>} />
          <motion.div variants={v.fadeUp} className="mb-3">
            <SearchBar value={search} onChange={setSearch} placeholder="Search events..." compact className="max-w-sm" />
          </motion.div>
          <motion.div variants={v.fadeUp} className="rounded-2xl bg-white shadow-sm border border-neutral-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 text-left text-[11px] uppercase tracking-wider text-neutral-400">
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-3 py-3 font-semibold min-w-[180px]">Event</th>
                    <th className="px-3 py-3 font-semibold">Collective</th>
                    <th className="px-3 py-3 font-semibold text-center">Type</th>
                    {visibleDefs.map((def) => <th key={def.key} className="px-3 py-3 font-semibold text-right">{def.label}{def.unit ? ` (${def.unit})` : ''}</th>)}
                    <th className="px-3 py-3 font-semibold text-right">Est. hrs</th>
                  </tr>
                </thead>
                <tbody>
                  {displayEvents.length === 0 ? (
                    <tr><td colSpan={5 + visibleDefs.length} className="px-4 py-12 text-center text-sm text-neutral-500">No impact data matches your filters</td></tr>
                  ) : displayEvents.map((row) => (
                    <tr key={row.eventId} className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50 transition-colors group">
                      <td className="px-4 py-3 text-xs text-neutral-500 tabular-nums whitespace-nowrap">{fmtDate(row.date)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <Link to={`/events/${row.eventId}`} className="text-sm font-medium text-neutral-900 hover:text-neutral-700 line-clamp-1">{row.title}</Link>
                          <ExternalLink size={12} className="text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          {row.isLegacy && <Badge variant="default" size="sm">Legacy</Badge>}
                        </div>
                        {row.attendance != null && <span className="text-[11px] text-neutral-500">{row.attendance} attendees</span>}
                      </td>
                      <td className="px-3 py-3 text-xs text-neutral-500 whitespace-nowrap">{row.collectiveName}</td>
                      <td className="px-3 py-3 text-center"><Badge variant="activity" activity={activityToBadge(row.activityType)} size="sm">{ACTIVITY_TYPE_LABELS[row.activityType] ?? row.activityType}</Badge></td>
                      {visibleDefs.map((def) => <td key={def.key} className="px-3 py-3 text-right tabular-nums text-neutral-900">{fmtMetricVal(row.metrics[def.key] ?? null, def)}</td>)}
                      <td className="px-3 py-3 text-right tabular-nums text-neutral-900">{row.estimatedVolHours != null ? row.estimatedVolHours.toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!showAllEvents && sortedEvents.length > 25 && (
              <div className="border-t border-neutral-100 px-4 py-3 text-center">
                <button type="button" onClick={() => setShowAllEvents(true)} className="text-xs font-semibold text-primary-600 hover:text-primary-700 cursor-pointer">Show all {sortedEvents.length} events</button>
              </div>
            )}
          </motion.div>
        </div>

        {/* ── Year on year (comparison table for grant narratives) ── */}
        {yearTableSpec && yearTableSpec.rows.length > 1 && (
          <div>
            <Section id="years" title="Year on year" hint="Growth across years - useful for funding narratives."
              action={<CopyTableButton onCopy={() => copyTableSpec(yearTableSpec, 'yr')} copied={copied === 'yr'} />} />
            <motion.div variants={v.fadeUp} className="rounded-2xl bg-white shadow-sm border border-neutral-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 text-left text-[11px] uppercase tracking-wider text-neutral-400">
                      {yearTableSpec.headers.map((h, i) => <th key={h} className={cn('px-3 py-3 font-semibold', i === 0 ? 'pl-4 text-left' : 'text-right')}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {yearTableSpec.rows.map((r, ri) => (
                      <tr key={ri} className="border-b border-neutral-50 last:border-0">
                        {r.map((c, ci) => <td key={ci} className={cn('px-3 py-3 tabular-nums', ci === 0 ? 'pl-4 font-semibold text-neutral-900' : 'text-right text-neutral-700')}>{typeof c === 'number' ? c.toLocaleString() : c}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        )}

        {/* ── Raw data (CSV) ── */}
        <div>
          <Section id="data" title="Raw data" hint="The data behind the numbers, for spreadsheets." />
          <motion.div variants={v.fadeUp} className="flex flex-wrap gap-2">
            <button type="button" onClick={() => downloadCsv('coexist-events.csv', eventCsvSpec())} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-neutral-200 text-sm font-medium text-neutral-700 hover:border-neutral-300 cursor-pointer"><Download size={14} /> Event impact log</button>
            <button type="button" onClick={() => downloadCsv('coexist-by-collective.csv', collectiveTableSpec)} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-neutral-200 text-sm font-medium text-neutral-700 hover:border-neutral-300 cursor-pointer"><Download size={14} /> By collective</button>
            {retentionTableSpec && <button type="button" onClick={() => downloadCsv('coexist-recurrence.csv', retentionTableSpec)} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-neutral-200 text-sm font-medium text-neutral-700 hover:border-neutral-300 cursor-pointer"><Download size={14} /> Attendee recurrence</button>}
            {yearTableSpec && <button type="button" onClick={() => downloadCsv('coexist-year-on-year.csv', yearTableSpec)} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-neutral-200 text-sm font-medium text-neutral-700 hover:border-neutral-300 cursor-pointer"><Download size={14} /> Year on year</button>}
          </motion.div>
        </div>
      </div>

      {/* ── Sticky selection bar ──
          Sits ABOVE the mobile bottom tab bar (which /admin renders on
          small screens) via bottom-24, then drops to bottom-6 from md
          where the layout uses the sidebar and there is no tab bar.
          Extra safe-area padding clears the home indicator. */}
      {selected.size > 0 && (
        <div
          className="fixed bottom-[88px] md:bottom-6 left-3 right-3 md:left-1/2 md:right-auto md:-translate-x-1/2 z-40 flex items-center justify-between md:justify-start gap-2 px-3 py-2.5 rounded-2xl bg-white text-neutral-900 ring-1 ring-neutral-200 shadow-2xl shadow-neutral-900/25"
          style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <span className="text-sm font-semibold tabular-nums text-neutral-900 whitespace-nowrap shrink-0 pl-1">{selected.size} selected</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" onClick={copySelected} className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold px-3 py-2 rounded-xl bg-primary-600 text-white hover:bg-primary-700 active:scale-[0.98] transition-all cursor-pointer">
              {copied === 'sel' ? <Check size={15} /> : <Copy size={15} />}<span>{copied === 'sel' ? 'Copied' : 'Copy table'}</span>
            </button>
            <button type="button" onClick={csvSelected} aria-label="Download CSV" className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium px-3 py-2 rounded-xl bg-neutral-100 text-neutral-700 hover:bg-neutral-200 active:scale-[0.98] transition-all cursor-pointer"><Download size={15} />CSV</button>
            <button type="button" onClick={clearSel} aria-label="Clear selection" className="p-2 rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 active:scale-[0.98] transition-all cursor-pointer shrink-0"><X size={16} /></button>
          </div>
        </div>
      )}
    </motion.div>
  )
}

/* select-all toggle for a section */
function SelectAll({ keys, sel, onSet }: { keys: string[]; sel: Set<string>; onSet: (keys: string[], on: boolean) => void }) {
  if (keys.length === 0) return null
  const allOn = keys.every((k) => sel.has(k))
  return (
    <button type="button" onClick={() => onSet(keys, !allOn)}
      className="text-[11px] font-semibold text-neutral-500 hover:text-primary-700 px-2 py-1 rounded-lg hover:bg-primary-50 transition-colors cursor-pointer">
      {allOn ? 'Deselect all' : 'Select all'}
    </button>
  )
}
