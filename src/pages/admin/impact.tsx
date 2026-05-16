import { useState, useMemo, useRef, useCallback, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { motion, useReducedMotion, useInView, AnimatePresence } from 'framer-motion'
import {
  TreePine,
  Trash2,
  Clock,
  BarChart3,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Database,
  AlertTriangle,
  Leaf,
  Users,
  Sprout,
  Waves,
  Eye,
  Ruler,
  Sparkles,
  Droplets,
  Mountain,
  Flower2,
  Bug,
  Flame,
  Fish,
  Wind,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAdminHeader } from '@/components/admin-layout'
import { AdminHeroStat, AdminHeroStatRow, type HeroStatColor } from '@/components/admin-hero-stat'
import { Dropdown } from '@/components/dropdown'
import { SearchBar } from '@/components/search-bar'
import { Badge } from '@/components/badge'
// TabBar removed - single-tab page now
import { adminVariants } from '@/lib/admin-motion'
import { cn } from '@/lib/cn'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import {
  useImpactObservations,
  useYearOverYear,
  useImpactDataQuality,
  useEventsMissingImpact,
  type ObservationFilters,
  type CollectiveBreakdown,
  type EventImpactRow,
  type YearSummary,
} from '@/hooks/use-admin-impact-observations'
import {
  useImpactMetricDefs,
} from '@/hooks/use-impact-metric-defs'
import type { ImpactMetricDef } from '@/lib/impact-metrics'
// isBuiltinMetric removed - metrics config UI removed
import { dateRangeOptions, type DateRange } from '@/hooks/use-admin-dashboard'
import { ACTIVITY_TYPE_OPTIONS, ACTIVITY_TYPE_LABELS } from '@/hooks/use-events'
import { useCollectives } from '@/hooks/use-collective'
import { useNotifyLeadersForImpactForm } from '@/hooks/use-impact-form-tasks'
import { Button } from '@/components/button'
import { Skeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
// supabase direct import removed - metrics config UI removed

/* ------------------------------------------------------------------ */
/*  Icon registry                                                       */
/* ------------------------------------------------------------------ */

const METRIC_ICONS: Record<string, (size: number) => ReactNode> = {
  tree:     (s) => <TreePine size={s} />,
  leaf:     (s) => <Leaf size={s} />,
  weed:     (s) => <Sprout size={s} />,
  trash:    (s) => <Trash2 size={s} />,
  wave:     (s) => <Waves size={s} />,
  eye:      (s) => <Eye size={s} />,
  area:     (s) => <Ruler size={s} />,
  clock:    (s) => <Clock size={s} />,
  sparkle:  (s) => <Sparkles size={s} />,
  droplet:  (s) => <Droplets size={s} />,
  mountain: (s) => <Mountain size={s} />,
  flower:   (s) => <Flower2 size={s} />,
  bug:      (s) => <Bug size={s} />,
  flame:    (s) => <Flame size={s} />,
  fish:     (s) => <Fish size={s} />,
  wind:     (s) => <Wind size={s} />,
}

const iconComponents: Record<string, ReactNode> = {
  tree: <TreePine size={16} className="text-success-600" />,
  trash: <Trash2 size={16} className="text-error-500" />,
  wave: <Waves size={16} className="text-info-500" />,
  leaf: <Leaf size={16} className="text-primary-500" />,
  eye: <Eye size={16} className="text-warning-500" />,
  area: <Ruler size={16} className="text-plum-500" />,
  weed: <Sprout size={16} className="text-moss-600" />,
  clock: <Clock size={16} className="text-neutral-400" />,
  sparkle: <Sparkles size={16} className="text-warning-400" />,
  droplet: <Droplets size={16} className="text-info-400" />,
  mountain: <Mountain size={16} className="text-bark-500" />,
  flower: <Flower2 size={16} className="text-primary-500" />,
  bug: <Bug size={16} className="text-moss-500" />,
  flame: <Flame size={16} className="text-error-400" />,
  fish: <Fish size={16} className="text-info-600" />,
  wind: <Wind size={16} className="text-neutral-400" />,
}

function metricIcon(def: ImpactMetricDef, size = 18): ReactNode {
  return (METRIC_ICONS[def.icon] ?? METRIC_ICONS.leaf)(size)
}

/** Map metric icon keys to hero stat color presets */
const ICON_TO_COLOR: Record<string, HeroStatColor> = {
  tree: 'moss', leaf: 'sprout', weed: 'sprout', trash: 'sky',
  wave: 'info', eye: 'warning', area: 'plum', clock: 'bark',
  sparkle: 'warning', droplet: 'info', mountain: 'bark',
  flower: 'primary', bug: 'moss', flame: 'coral', fish: 'info', wind: 'primary',
}

/** Map metric icon keys to bar chart gradient classes */
const ICON_TO_BAR: Record<string, string> = {
  tree: 'from-moss-400 to-moss-500', leaf: 'from-sprout-400 to-sprout-500',
  weed: 'from-sprout-400 to-sprout-500', trash: 'from-bark-400 to-bark-500',
  wave: 'from-info-400 to-info-500', eye: 'from-warning-400 to-warning-500',
  area: 'from-plum-400 to-plum-500', clock: 'from-bark-400 to-bark-500',
  sparkle: 'from-warning-400 to-warning-500', droplet: 'from-info-400 to-info-500',
  mountain: 'from-bark-400 to-bark-500', flower: 'from-primary-400 to-primary-500',
  bug: 'from-moss-400 to-moss-500', flame: 'from-coral-400 to-coral-500',
  fish: 'from-info-400 to-info-500', wind: 'from-primary-400 to-primary-500',
}

/* ------------------------------------------------------------------ */
/*  Metric form options                                                 */
/* ------------------------------------------------------------------ */

const ICON_OPTIONS = [
  { value: 'tree', label: 'Tree' },
  { value: 'leaf', label: 'Leaf' },
  { value: 'weed', label: 'Sprout' },
  { value: 'trash', label: 'Trash' },
  { value: 'area', label: 'Ruler' },
  { value: 'eye', label: 'Eye' },
  { value: 'wave', label: 'Wave' },
  { value: 'clock', label: 'Clock' },
  { value: 'sparkle', label: 'Sparkle' },
  { value: 'droplet', label: 'Droplet' },
  { value: 'mountain', label: 'Mountain' },
  { value: 'flower', label: 'Flower' },
  { value: 'bug', label: 'Bug' },
  { value: 'flame', label: 'Flame' },
  { value: 'fish', label: 'Fish' },
  { value: 'wind', label: 'Wind' },
]

const emptyForm = (): Partial<ImpactMetricDef> & { key: string } => ({
  key: '',
  label: '',
  unit: '',
  icon: 'leaf',
  decimal: false,
  is_active: true,
  survey_linkable: true,
})

/* ------------------------------------------------------------------ */
/*  Dashboard helpers                                                   */
/* ------------------------------------------------------------------ */

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtMetric(val: number | null, def: ImpactMetricDef): string {
  if (val == null || val === 0) return '-'
  const s = def.decimal
    ? val.toLocaleString('en-AU', { maximumFractionDigits: 1 })
    : val.toLocaleString('en-AU')
  return def.unit ? `${s} ${def.unit}` : s
}

function fmtNum(n: number | null) {
  if (n == null || n === 0) return '-'
  return n.toLocaleString('en-AU')
}

function activityToBadge(type: string) {
  return type.replace(/_/g, '-') as Parameters<typeof Badge>[0] extends { activity: infer A } ? A : never
}

/* ------------------------------------------------------------------ */
/*  Sort                                                               */
/* ------------------------------------------------------------------ */

type SortDir = 'asc' | 'desc'

function sortRows(rows: EventImpactRow[], field: string, dir: SortDir) {
  const m = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    switch (field) {
      case 'date': return m * (new Date(a.date).getTime() - new Date(b.date).getTime())
      case 'title': return m * a.title.localeCompare(b.title)
      case 'collective': return m * a.collectiveName.localeCompare(b.collectiveName)
      case 'hours': return m * ((a.estimatedVolHours ?? 0) - (b.estimatedVolHours ?? 0))
      default: return m * ((a.metrics[field] ?? 0) - (b.metrics[field] ?? 0))
    }
  })
}

function sortCollectives(rows: CollectiveBreakdown[], field: string, dir: SortDir) {
  const m = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    switch (field) {
      case 'name': return m * a.name.localeCompare(b.name)
      case 'events': return m * (a.eventCount - b.eventCount)
      case 'attendees': return m * (a.attendees - b.attendees)
      case 'hours': return m * (a.estimatedHours - b.estimatedHours)
      default: return m * ((a.metrics[field] ?? 0) - (b.metrics[field] ?? 0))
    }
  })
}

/* ------------------------------------------------------------------ */
/*  Sortable header cell                                               */
/* ------------------------------------------------------------------ */

function SortHeader({
  label,
  field,
  currentField,
  currentDir,
  onSort,
  className,
}: {
  label: string
  field: string
  currentField: string
  currentDir: SortDir
  onSort: (f: string) => void
  className?: string
}) {
  const active = currentField === field
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={cn(
        'flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-colors cursor-pointer select-none',
        active ? 'text-neutral-700' : 'text-neutral-400 hover:text-neutral-600',
        className,
      )}
    >
      {label}
      {active && (currentDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Year-over-year chart                                               */
/* ------------------------------------------------------------------ */

function YoYChart({ data, defs, rm }: { data: YearSummary[]; defs: ImpactMetricDef[]; rm: boolean }) {
  const metricTotals = defs.map((d) => ({
    def: d,
    total: data.reduce((s, y) => s + (y.metrics[d.key] ?? 0), 0),
  })).filter((m) => m.total > 0).sort((a, b) => b.total - a.total)

  const topMetrics = metricTotals.slice(0, 3)

  const bars: { key: string; label: string; color: string; unit: string; getValue: (y: YearSummary) => number }[] = [
    { key: '_attendees', label: 'Attendees', color: 'from-warning-400 to-warning-500', unit: '', getValue: (y) => y.attendees },
    ...topMetrics.map((m) => ({
      key: m.def.key,
      label: m.def.label,
      color: ICON_TO_BAR[m.def.icon] ?? 'from-primary-400 to-primary-500',
      unit: m.def.unit,
      getValue: (y: YearSummary) => y.metrics[m.def.key] ?? 0,
    })),
    { key: '_hours', label: 'Est. Vol Hours', color: 'from-bark-400 to-bark-500', unit: '', getValue: (y) => y.estimatedHours },
  ]

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-neutral-100 p-5">
      <h3 className="font-heading text-sm font-semibold text-neutral-900 mb-5">
        Year-over-Year Impact
      </h3>
      <div className="space-y-4">
        {data.map((d) => (
          <div key={d.year}>
            <span className="text-xs font-bold text-neutral-600 tabular-nums">{d.year}</span>
            <span className="text-[10px] text-neutral-400 ml-2">{d.events} events</span>
            <div className="mt-1.5 space-y-1">
              {bars.map((bar) => {
                const val = bar.getValue(d)
                const max = Math.max(...data.map((x) => bar.getValue(x)), 1)
                return (
                  <div key={bar.key} className="flex items-center gap-2">
                    <div className="w-20 text-[10px] text-neutral-400 text-right truncate">{bar.label}</div>
                    <div className="flex-1 h-3.5 bg-neutral-50 rounded-full overflow-hidden">
                      <motion.div
                        className={cn('h-full rounded-full bg-gradient-to-r', bar.color)}
                        initial={rm ? { width: `${(val / max) * 100}%` } : { width: 0 }}
                        animate={{ width: `${Math.max((val / max) * 100, val > 0 ? 2 : 0)}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                      />
                    </div>
                    <span className="w-16 text-[11px] font-semibold text-neutral-700 tabular-nums text-right">
                      {val > 0 ? `${val.toLocaleString()}${bar.unit ? ` ${bar.unit}` : ''}` : '-'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Data quality panel                                                 */
/* ------------------------------------------------------------------ */

function DataQualityPanel() {
  const { data } = useImpactDataQuality()
  if (!data) return null

  const total = data.legacyCount + data.appCount
  const legacyPct = total > 0 ? Math.round((data.legacyCount / total) * 100) : 0

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-neutral-100 p-5">
      <h3 className="flex items-center gap-2 font-heading text-sm font-semibold text-neutral-900 mb-4">
        <Database size={16} className="text-neutral-400" />
        Data Quality
      </h3>
      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-neutral-500 font-medium">Data Source</span>
            <span className="text-neutral-400">{total} impact logs</span>
          </div>

          <div className="flex h-3 rounded-full overflow-hidden bg-neutral-50">
            <div
              className="bg-gradient-to-r from-primary-400 to-primary-500 transition-all duration-500"
              style={{ width: `${legacyPct}%` }}
            />
            <div
              className="bg-gradient-to-r from-sprout-400 to-sprout-500 transition-all duration-500"
              style={{ width: `${100 - legacyPct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary-400" />
              <span className="text-neutral-500">Legacy ({data.legacyCount})</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sprout-400" />
              <span className="text-neutral-500">App ({data.appCount})</span>
            </span>
          </div>
        </div>

        {data.eventsWithoutImpact > 0 && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-warning-50 border border-warning-200/50">
            <AlertTriangle size={14} className="text-warning-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-warning-700">
                {data.eventsWithoutImpact} completed event{data.eventsWithoutImpact !== 1 ? 's' : ''} without impact logs
              </p>
              <p className="text-[11px] text-warning-500 mt-0.5">Leaders haven't submitted impact data yet</p>
            </div>
          </div>
        )}

        {data.zeroMetricEvents > 0 && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-neutral-50 border border-neutral-100">
            <Leaf size={14} className="text-neutral-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-neutral-600">
                {data.zeroMetricEvents} log{data.zeroMetricEvents !== 1 ? 's' : ''} with all metrics at zero
              </p>
              <p className="text-[11px] text-neutral-400 mt-0.5">Recreational events or missing data entry</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// NOTE: MetricForm and MetricsTab removed - scope simplification.
// Impact metrics are now controlled directly in the database.
// Admin metric config UI will be a future paid feature.

/* ------------------------------------------------------------------ */
/*  Dashboard tab content                                              */
/* ------------------------------------------------------------------ */

function DashboardTab() {
  const rm = !!useReducedMotion()
  const v = adminVariants(rm)

  const { activeDefs } = useImpactMetricDefs()

  const [dateRange, setDateRange] = useState<DateRange>('all')
  const [collectiveId, setCollectiveId] = useState<string>('')
  const [activityType, setActivityType] = useState<string>('')
  const [search, setSearch] = useState('')

  const filters: ObservationFilters = useMemo(
    () => ({
      dateRange,
      collectiveId: collectiveId || undefined,
      activityType: (activityType || undefined) as ObservationFilters['activityType'],
      search: search || undefined,
    }),
    [dateRange, collectiveId, activityType, search],
  )

  const { data, isLoading } = useImpactObservations(filters, activeDefs)
  const { data: yoyData } = useYearOverYear(activeDefs)
  const { data: collectives } = useCollectives({ includeNational: true })
  const { data: missingImpact } = useEventsMissingImpact()
  const notifyLeaders = useNotifyLeadersForImpactForm()
  const { toast } = useToast()
  const [nudgingEvent, setNudgingEvent] = useState<string | null>(null)
  const showLoading = useDelayedLoading(isLoading)

  // Drift status badge - reads last run result from app_settings (written by nightly cron)
  const { data: driftRow } = useQuery({
    queryKey: ['stats-drift-status'],
    queryFn: async () => {
      const { data: row } = await supabase
        .from('app_settings')
        .select('value, updated_at')
        .eq('key', 'stats_drift_last_run')
        .maybeSingle()
      return row
    },
    staleTime: 5 * 60 * 1000,
  })
  const driftStatus = driftRow?.value as { run_at?: string; status?: string; delta?: Record<string, unknown> } | null | undefined

  const visibleDefs = useMemo(() => {
    if (!data) return activeDefs.filter((d) => d.key !== 'hours_total')
    return activeDefs.filter((d) =>
      d.key !== 'hours_total' && data.rows.some((r) => (r.metrics[d.key] ?? 0) > 0),
    )
  }, [activeDefs, data])

  const [eventSort, setEventSort] = useState('date')
  const [eventDir, setEventDir] = useState<SortDir>('desc')
  const [collSort, setCollSort] = useState('events')
  const [collDir, setCollDir] = useState<SortDir>('desc')
  const [showAllEvents, setShowAllEvents] = useState(false)

  const toggleSort = (field: string, current: string, setField: (f: string) => void, dir: SortDir, setDir: (d: SortDir) => void) => {
    if (current === field) setDir(dir === 'asc' ? 'desc' : 'asc')
    else { setField(field); setDir('desc') }
  }

  const sortedEvents = useMemo(
    () => (data ? sortRows(data.rows, eventSort, eventDir) : []),
    [data, eventSort, eventDir],
  )
  const displayEvents = showAllEvents ? sortedEvents : sortedEvents.slice(0, 50)

  const sortedCollectives = useMemo(() => {
    if (!data) return []
    const breakdown = new Map(data.collectiveBreakdown.map((c) => [c.collectiveId, c]))
    for (const c of collectives ?? []) {
      if (!breakdown.has(c.id)) {
        const metrics: Record<string, number> = {}
        for (const d of activeDefs) metrics[d.key] = 0
        breakdown.set(c.id, {
          collectiveId: c.id,
          name: c.name,
          eventCount: 0,
          attendees: 0,
          metrics,
          estimatedHours: 0,
        })
      }
    }
    return sortCollectives([...breakdown.values()], collSort, collDir)
  }, [data, collectives, activeDefs, collSort, collDir])

  const collectiveOptions = useMemo(
    () => [{ value: '', label: 'All Collectives' }, ...(collectives ?? []).map((c) => ({ value: c.id, label: c.name }))],
    [collectives],
  )
  const activityOptions = useMemo(
    () => [{ value: '', label: 'All Types' }, ...ACTIVITY_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))],
    [],
  )

  const chartRef = useRef<HTMLDivElement>(null)
  const chartInView = useInView(chartRef, { once: true, margin: '-60px' })

  if (showLoading) {
    return (
      <div className="py-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-neutral-50 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 rounded-xl bg-neutral-50 animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <motion.div
      className="py-6 space-y-8 pb-24"
      variants={v.stagger}
      initial="hidden"
      animate="visible"
    >
      {/* ── Filter bar ── */}
      <motion.div variants={v.fadeUp} className="flex flex-wrap items-center gap-3">
        <Dropdown options={dateRangeOptions} value={dateRange} onChange={(v) => setDateRange(v as DateRange)} className="w-36" />
        <Dropdown options={collectiveOptions} value={collectiveId} onChange={setCollectiveId} className="w-44" />
        <Dropdown options={activityOptions} value={activityType} onChange={setActivityType} className="w-40" />
        <SearchBar value={search} onChange={setSearch} placeholder="Search events..." compact className="flex-1 min-w-[160px]" />
      </motion.div>

      {/* ── Master sheet drift status badge ── */}
      {driftStatus && (
        <motion.div variants={v.fadeUp}>
          {driftStatus.status === 'drift' ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-warning-50 border border-warning-200 text-warning-700 text-xs font-medium w-fit">
              <AlertTriangle size={13} />
              Stats drift detected vs master sheet - check status board
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-success-50 border border-success-200 text-success-700 text-xs font-medium w-fit">
              <Database size={13} />
              Stats synced with master sheet
              {driftStatus.run_at && (
                <span className="text-success-500 font-normal ml-1">
                  ({Math.round((Date.now() - new Date(driftStatus.run_at).getTime()) / 3600000)}h ago)
                </span>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* ── Summary cards ── */}
      <motion.div variants={v.fadeUp}>
        <AdminHeroStatRow className="!max-w-none grid-cols-2 sm:!grid-cols-3 md:!grid-cols-4 lg:!grid-cols-5 xl:!grid-cols-6 2xl:!grid-cols-8">
          <AdminHeroStat value={data?.summary.totalEvents ?? 0} label="Events" icon={<BarChart3 size={18} />} color="primary" reducedMotion={rm} delay={0} />
          <AdminHeroStat value={data?.summary.totalAttendees ?? 0} label="Attendees" icon={<Users size={18} />} color="warning" reducedMotion={rm} delay={0.04} />
          {activeDefs.filter((d) => d.key !== 'hours_total').map((def, i) => {
            const val = data?.summary.metrics[def.key] ?? 0
            if (val === 0 && !data) return null
            return (
              <AdminHeroStat
                key={def.key}
                value={Math.round(val * (def.decimal ? 10 : 1)) / (def.decimal ? 10 : 1)}
                label={`${def.label}${def.unit ? ` (${def.unit})` : ''}`}
                icon={metricIcon(def)}
                color={ICON_TO_COLOR[def.icon] ?? 'glass'}
                reducedMotion={rm}
                delay={0.08 + i * 0.04}
              />
            )
          })}
          <AdminHeroStat value={data?.summary.totalEstimatedHours ?? 0} label="Est. Vol Hours" icon={<Clock size={18} />} color="bark" reducedMotion={rm} delay={0.08 + activeDefs.length * 0.04} />
        </AdminHeroStatRow>
      </motion.div>

      {/* ── Events missing impact ── */}
      {(missingImpact?.length ?? 0) > 0 && (
        <motion.div variants={v.fadeUp}>
          <div className="rounded-2xl bg-warning-50 border border-warning-200/50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-warning-600 shrink-0" />
              <h3 className="text-sm font-semibold text-warning-800">
                {missingImpact!.length} event{missingImpact!.length !== 1 ? 's' : ''} missing impact data
              </h3>
            </div>
            <p className="text-xs text-warning-700">
              These events ended in the last 30 days but no leader has logged impact yet.
            </p>
            <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
              {missingImpact!.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/70">
                  <Link
                    to={`/events/${e.id}/impact`}
                    className="flex-1 min-w-0 hover:opacity-80 active:scale-[0.99] transition-all"
                  >
                    <p className="text-sm font-medium text-neutral-800 truncate">{e.title}</p>
                    <p className="text-[11px] text-neutral-400">
                      {e.collective_name ?? 'Unknown'} · {ACTIVITY_TYPE_LABELS[e.activity_type] ?? e.activity_type} · {e.days_since}d ago
                    </p>
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setNudgingEvent(e.id)
                      notifyLeaders.mutate(
                        { eventId: e.id, eventTitle: e.title, collectiveId: e.collective_id },
                        {
                          onSuccess: (result) => {
                            toast.success(`Reminder sent to ${result?.sent ?? 0} leader${(result?.sent ?? 0) !== 1 ? 's' : ''}`)
                            setNudgingEvent(null)
                          },
                          onError: () => {
                            toast.error('Failed to send reminder')
                            setNudgingEvent(null)
                          },
                        },
                      )
                    }}
                    disabled={nudgingEvent === e.id}
                    className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-warning-200 text-warning-800 hover:bg-warning-300 active:scale-[0.97] transition-all shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {nudgingEvent === e.id ? 'Sending...' : 'Nudge'}
                  </button>
                  <span className={cn(
                    'text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0',
                    e.days_since > 7 ? 'bg-error-100 text-error-700' : e.days_since > 3 ? 'bg-warning-100 text-warning-700' : 'bg-neutral-100 text-neutral-500',
                  )}>
                    {e.days_since}d
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Per-collective breakdown ── */}
      {sortedCollectives.length > 0 && (
        <motion.div variants={v.fadeUp}>
          <h2 className="font-heading text-[13px] font-bold text-neutral-700/60 uppercase tracking-widest mb-3">By Collective</h2>
          <div className="rounded-2xl bg-white shadow-sm border border-neutral-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100">
                    <th className="px-4 py-3 text-left">
                      <SortHeader label="Collective" field="name" currentField={collSort} currentDir={collDir} onSort={(f) => toggleSort(f, collSort, setCollSort, collDir, setCollDir)} />
                    </th>
                    <th className="px-3 py-3 text-center">
                      <SortHeader label="Events" field="events" currentField={collSort} currentDir={collDir} onSort={(f) => toggleSort(f, collSort, setCollSort, collDir, setCollDir)} className="justify-center" />
                    </th>
                    <th className="px-3 py-3 text-center">
                      <SortHeader label="Attendees" field="attendees" currentField={collSort} currentDir={collDir} onSort={(f) => toggleSort(f, collSort, setCollSort, collDir, setCollDir)} className="justify-center" />
                    </th>
                    {visibleDefs.map((def) => (
                      <th key={def.key} className="px-3 py-3 text-center">
                        <SortHeader
                          label={`${def.label}${def.unit ? ` (${def.unit})` : ''}`}
                          field={def.key}
                          currentField={collSort}
                          currentDir={collDir}
                          onSort={(f) => toggleSort(f, collSort, setCollSort, collDir, setCollDir)}
                          className="justify-center"
                        />
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center">
                      <SortHeader label="Est. Hours" field="hours" currentField={collSort} currentDir={collDir} onSort={(f) => toggleSort(f, collSort, setCollSort, collDir, setCollDir)} className="justify-center" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCollectives.map((c) => (
                    <tr
                      key={c.collectiveId}
                      className="border-b border-neutral-50 last:border-b-0 hover:bg-neutral-50 transition-colors cursor-pointer"
                      onClick={() => setCollectiveId(c.collectiveId)}
                    >
                      <td className="px-4 py-3 text-left font-semibold text-neutral-900 text-sm">{c.name}</td>
                      <td className="px-3 py-3 text-center font-medium text-neutral-900 tabular-nums">{c.eventCount}</td>
                      <td className="px-3 py-3 text-center font-medium text-neutral-900 tabular-nums">{fmtNum(c.attendees)}</td>
                      {visibleDefs.map((def) => (
                        <td key={def.key} className="px-3 py-3 text-center font-medium text-neutral-900 tabular-nums">
                          {fmtMetric(c.metrics[def.key] ?? 0, def)}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-center font-medium text-neutral-900 tabular-nums">{fmtNum(c.estimatedHours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Event impact log ── */}
      <motion.div variants={v.fadeUp}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-[13px] font-bold text-neutral-500/60 uppercase tracking-widest">Event Impact Log</h2>
          {sortedEvents.length > 0 && (
            <span className="text-xs text-neutral-500 font-medium">{sortedEvents.length} event{sortedEvents.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="rounded-2xl bg-white shadow-sm border border-neutral-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100">
                  <th className="px-4 py-3 text-left">
                    <SortHeader label="Date" field="date" currentField={eventSort} currentDir={eventDir} onSort={(f) => toggleSort(f, eventSort, setEventSort, eventDir, setEventDir)} />
                  </th>
                  <th className="px-3 py-3 text-left min-w-[180px]">
                    <SortHeader label="Event" field="title" currentField={eventSort} currentDir={eventDir} onSort={(f) => toggleSort(f, eventSort, setEventSort, eventDir, setEventDir)} />
                  </th>
                  <th className="px-3 py-3 text-left">
                    <SortHeader label="Collective" field="collective" currentField={eventSort} currentDir={eventDir} onSort={(f) => toggleSort(f, eventSort, setEventSort, eventDir, setEventDir)} />
                  </th>
                  <th className="px-3 py-3 text-center">
                    <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Type</span>
                  </th>
                  {visibleDefs.map((def) => (
                    <th key={def.key} className="px-3 py-3 text-center">
                      <SortHeader
                        label={`${def.label}${def.unit ? ` (${def.unit})` : ''}`}
                        field={def.key}
                        currentField={eventSort}
                        currentDir={eventDir}
                        onSort={(f) => toggleSort(f, eventSort, setEventSort, eventDir, setEventDir)}
                        className="justify-center"
                      />
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center">
                    <SortHeader label="Est. Hours" field="hours" currentField={eventSort} currentDir={eventDir} onSort={(f) => toggleSort(f, eventSort, setEventSort, eventDir, setEventDir)} className="justify-center" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayEvents.length === 0 ? (
                  <tr>
                    <td colSpan={4 + visibleDefs.length + 1} className="px-4 py-12 text-center text-sm text-neutral-500">
                      No impact data matches your filters
                    </td>
                  </tr>
                ) : (
                  displayEvents.map((row) => (
                    <tr key={row.eventId} className="border-b border-neutral-50 last:border-b-0 hover:bg-neutral-50 transition-colors group">
                      <td className="px-4 py-3 text-xs text-neutral-500 tabular-nums whitespace-nowrap">{fmtDate(row.date)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <Link to={`/events/${row.eventId}`} className="text-sm font-medium text-neutral-900 hover:text-neutral-700 transition-colors line-clamp-1">
                            {row.title}
                          </Link>
                          <ExternalLink size={12} className="text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          {row.isLegacy && <Badge variant="default" size="sm">Legacy</Badge>}
                        </div>
                        {row.attendance != null && <span className="text-[11px] text-neutral-500">{row.attendance} attendees</span>}
                      </td>
                      <td className="px-3 py-3 text-xs text-neutral-500 whitespace-nowrap">{row.collectiveName}</td>
                      <td className="px-3 py-3 text-center">
                        <Badge variant="activity" activity={activityToBadge(row.activityType)} size="sm">
                          {ACTIVITY_TYPE_LABELS[row.activityType] ?? row.activityType}
                        </Badge>
                      </td>
                      {visibleDefs.map((def) => (
                        <td key={def.key} className="px-3 py-3 text-center font-medium text-neutral-900 tabular-nums">
                          {fmtMetric(row.metrics[def.key] ?? null, def)}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-center font-medium text-neutral-900 tabular-nums">
                        {row.estimatedVolHours != null ? `${row.estimatedVolHours.toLocaleString()} hrs` : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!showAllEvents && sortedEvents.length > 50 && (
            <div className="border-t border-neutral-100 px-4 py-3 text-center">
              <button type="button" onClick={() => setShowAllEvents(true)} className="text-xs font-semibold text-primary-500 hover:text-primary-700 transition-colors cursor-pointer">
                Show all {sortedEvents.length} events
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Year-over-year + Data quality ── */}
      <div ref={chartRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {yoyData && yoyData.length > 0 && (
          <motion.div variants={v.fadeUp}>
            <YoYChart data={yoyData} defs={activeDefs} rm={rm || !chartInView} />
          </motion.div>
        )}
        <motion.div variants={v.fadeUp}>
          <DataQualityPanel />
        </motion.div>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminImpactPage() {
  useAdminHeader('Impact')

  return (
    <div>
      <DashboardTab />
    </div>
  )
}
