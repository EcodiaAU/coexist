/**
 * Admin > Insights - the single unified stats surface.
 *
 * Tate 2026-06-11: the earlier version was a tab wrapper over three
 * separate pages (Impact / Attendance / Reports) which still "did the
 * same thing as each other". This is the real unification: ONE filter
 * bar (date + collective + activity) drives the whole page, the headline
 * numbers and every section read from the SAME canonical hooks
 * (useImpactObservations + coexist_attendance_metrics + useYearOverYear),
 * and the export/report tools live in one drawer at the bottom.
 *
 * Accuracy: every number is sourced from the canonical impact-query
 * chain (see patterns/co-exist-stats-canonical-aggregation-architecture).
 * No bespoke SQL here.
 */
import { useMemo, useState, useRef, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  CalendarDays, Users, UserCheck, Repeat, Clock, Leaf,
  TreePine, Trash2, Waves, Eye, Ruler, Sprout, Sparkles, Droplets,
  Mountain, Flower2, Bug, Flame, Fish, Wind, Database,
  AlertTriangle, ChevronDown, ChevronUp, ExternalLink, Download,
} from 'lucide-react'
import { lazy, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useAdminHeader } from '@/components/admin-layout'
import { AdminHeroStat, AdminHeroStatRow, type HeroStatColor } from '@/components/admin-hero-stat'
import { Dropdown } from '@/components/dropdown'
import { SearchBar } from '@/components/search-bar'
import { Badge } from '@/components/badge'
import { useToast } from '@/components/toast'
import { adminVariants } from '@/lib/admin-motion'
import { cn } from '@/lib/cn'
import {
  useImpactObservations, useYearOverYear, useImpactDataQuality,
  useEventsMissingImpact, type ObservationFilters,
} from '@/hooks/use-admin-impact-observations'
import { useImpactMetricDefs } from '@/hooks/use-impact-metric-defs'
import type { ImpactMetricDef } from '@/lib/impact-metrics'
import { dateRangeOptions, getDateRangeStart, type DateRange } from '@/hooks/use-admin-dashboard'
import { ACTIVITY_TYPE_OPTIONS, ACTIVITY_TYPE_LABELS } from '@/hooks/use-events'
import { useCollectives } from '@/hooks/use-collective'
import { useNotifyLeadersForImpactForm } from '@/hooks/use-impact-form-tasks'
import type { AttendanceMetrics } from '@/lib/attendance-metrics'

const AdminReportsPage = lazy(() => import('@/pages/admin/reports'))

/* ------------------------------------------------------------------ */
/*  Metric icon + colour registry (mirrors the Impact page)            */
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

// Mirror the Impact page's cast so the activity badge union resolves
// without `undefined`.
function activityToBadge(type: string) {
  return type.replace(/_/g, '-') as Parameters<typeof Badge>[0] extends { activity?: infer A } ? NonNullable<A> : never
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
  if (n == null || n === 0) return '-'
  return n.toLocaleString('en-AU')
}
function fmtMetric(val: number | null | undefined, def: ImpactMetricDef): string {
  if (val == null || val === 0) return '-'
  const s = def.decimal ? val.toLocaleString('en-AU', { maximumFractionDigits: 1 }) : val.toLocaleString('en-AU')
  return def.unit ? `${s} ${def.unit}` : s
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ------------------------------------------------------------------ */
/*  Section shell + cohort bar                                         */
/* ------------------------------------------------------------------ */

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-3">
        <h2 className="font-heading text-[13px] font-bold uppercase tracking-widest text-neutral-700/70">{title}</h2>
        {hint && <p className="text-xs text-neutral-400 mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
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
      <span className="w-24 shrink-0 text-right text-sm tabular-nums text-neutral-700">
        {count} <span className="text-neutral-400">({p}%)</span>
      </span>
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

  // ── ONE shared filter bar drives everything ──
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
  const { data: dataQuality } = useImpactDataQuality()
  const { data: missingImpact } = useEventsMissingImpact()
  const notifyLeaders = useNotifyLeadersForImpactForm()
  const [nudging, setNudging] = useState<string | null>(null)

  // Attendance metrics share the same filter bar (date + collective).
  const fromDate = useMemo(() => {
    const s = getDateRangeStart(dateRange)
    return s ? s.slice(0, 10) : '2018-01-01'
  }, [dateRange])
  const { data: att } = useQuery({
    queryKey: ['insights-attendance', dateRange, collectiveId],
    queryFn: async (): Promise<AttendanceMetrics> => {
      const { data, error } = await supabase.rpc('coexist_attendance_metrics', {
        p_collective_ids: collectiveId ? [collectiveId] : null,
        p_from: fromDate, p_to: todayIso(),
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

  // metrics that actually have a value in scope (skip hours_total - shown separately)
  const visibleDefs = useMemo(() => {
    if (!obs) return activeDefs.filter((d) => d.key !== 'hours_total')
    return activeDefs.filter((d) => d.key !== 'hours_total' && obs.rows.some((r) => (r.metrics[d.key] ?? 0) > 0))
  }, [activeDefs, obs])

  const topMetrics = useMemo(() => {
    if (!obs) return []
    return [...visibleDefs]
      .map((d) => ({ def: d, total: obs.summary.metrics[d.key] ?? 0 }))
      .filter((m) => m.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3)
  }, [visibleDefs, obs])

  const sortedCollectives = useMemo(() => {
    if (!obs) return []
    return [...obs.collectiveBreakdown].sort((a, b) => b.attendees - a.attendees)
  }, [obs])

  const [showAllEvents, setShowAllEvents] = useState(false)
  const sortedEvents = useMemo(() => obs ? [...obs.rows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : [], [obs])
  const displayEvents = showAllEvents ? sortedEvents : sortedEvents.slice(0, 25)

  const [exportOpen, setExportOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)

  const repeat = att ? att.unique_attendees - att.retention.attended_1 : 0

  const jump = [
    { id: 'impact', label: 'Impact' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'collectives', label: 'By collective' },
    { id: 'trends', label: 'Trends' },
    { id: 'health', label: 'Data health' },
    { id: 'export', label: 'Export' },
  ]

  return (
    <motion.div className="pb-24" variants={v.stagger} initial="hidden" animate="visible">
      {/* ── Sticky filter bar + jump nav ── */}
      <div ref={filterRef} className="sticky top-0 z-20 -mx-4 px-4 py-3 bg-white/85 backdrop-blur border-b border-neutral-100 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Dropdown options={dateRangeOptions} value={dateRange} onChange={(x) => setDateRange(x as DateRange)} className="w-36" />
          <Dropdown options={collectiveOptions} value={collectiveId} onChange={setCollectiveId} className="w-44" />
          <Dropdown options={activityOptions} value={activityType} onChange={setActivityType} className="w-40" />
          <div className="hidden md:flex items-center gap-1 ml-auto text-[11px] font-medium text-neutral-400">
            {jump.map((j) => (
              <a key={j.id} href={`#${j.id}`} className="px-2 py-1 rounded-md hover:bg-neutral-100 hover:text-neutral-700 transition-colors">{j.label}</a>
            ))}
          </div>
        </div>
      </div>

      {/* ── Headline band: the whole story in one row ── */}
      <motion.div variants={v.fadeUp} className="mb-8">
        <AdminHeroStatRow className="!max-w-none grid-cols-2 sm:!grid-cols-3 lg:!grid-cols-4 xl:!grid-cols-6">
          <AdminHeroStat value={obs?.summary.totalEvents ?? 0} label="Events" icon={<CalendarDays size={18} />} color="primary" reducedMotion={rm} delay={0} />
          <AdminHeroStat value={obs?.summary.totalAttendees ?? 0} label="Attendees" icon={<Users size={18} />} color="warning" reducedMotion={rm} delay={0.04} />
          <AdminHeroStat value={att?.unique_attendees ?? 0} label="Unique people" icon={<UserCheck size={18} />} color="moss" reducedMotion={rm} delay={0.08} sub={att ? `${att.new_attendees} new` : undefined} />
          <AdminHeroStat value={repeat} label="Came back" icon={<Repeat size={18} />} color="sprout" reducedMotion={rm} delay={0.12} sub={att ? `${pct(repeat, att.unique_attendees)}% 2+ events` : undefined} />
          <AdminHeroStat value={obs?.summary.totalEstimatedHours ?? 0} label="Est. vol hours" icon={<Clock size={18} />} color="bark" reducedMotion={rm} delay={0.16} />
          {topMetrics[0] && (
            <AdminHeroStat
              value={Math.round((topMetrics[0].total) * (topMetrics[0].def.decimal ? 10 : 1)) / (topMetrics[0].def.decimal ? 10 : 1)}
              label={`${topMetrics[0].def.label}${topMetrics[0].def.unit ? ` (${topMetrics[0].def.unit})` : ''}`}
              icon={metricIcon(topMetrics[0].def)} color={ICON_TO_COLOR[topMetrics[0].def.icon] ?? 'glass'} reducedMotion={rm} delay={0.2} />
          )}
        </AdminHeroStatRow>
      </motion.div>

      <div className="space-y-10">
        {/* ── Impact ── */}
        <Section id="impact" title="Impact" hint="What our events put back into the land, in this window.">
          <motion.div variants={v.fadeUp}>
            <AdminHeroStatRow className="!max-w-none grid-cols-2 sm:!grid-cols-3 lg:!grid-cols-5">
              {visibleDefs.map((def, i) => (
                <AdminHeroStat key={def.key}
                  value={Math.round((obs?.summary.metrics[def.key] ?? 0) * (def.decimal ? 10 : 1)) / (def.decimal ? 10 : 1)}
                  label={`${def.label}${def.unit ? ` (${def.unit})` : ''}`}
                  icon={metricIcon(def)} color={ICON_TO_COLOR[def.icon] ?? 'glass'} reducedMotion={rm} delay={i * 0.04} />
              ))}
              {visibleDefs.length === 0 && !obsLoading && (
                <p className="col-span-full text-sm text-neutral-400 py-4">No impact logged in this window.</p>
              )}
            </AdminHeroStatRow>
          </motion.div>
        </Section>

        {/* ── Attendance & retention ── */}
        {att && (
          <Section id="attendance" title="Attendance & retention" hint="Who came, who came back, and how registrations convert to sign-ins.">
            <motion.div variants={v.fadeUp} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-2xl bg-white shadow-sm border border-neutral-100 p-5">
                <p className="text-sm font-semibold text-neutral-900">Return frequency</p>
                <p className="text-xs text-neutral-500 mb-3">How many unique people came to N events.</p>
                <CohortBar label="1 event" count={att.retention.attended_1} total={att.unique_attendees} rm={rm} />
                <CohortBar label="2 events" count={att.retention.attended_2} total={att.unique_attendees} rm={rm} />
                <CohortBar label="3 events" count={att.retention.attended_3} total={att.unique_attendees} rm={rm} />
                <CohortBar label="4-5" count={att.retention.attended_4_to_5} total={att.unique_attendees} rm={rm} />
                <CohortBar label="6+" count={att.retention.attended_6_plus} total={att.unique_attendees} rm={rm} />
              </div>
              <div className="rounded-2xl bg-white shadow-sm border border-neutral-100 p-5 flex flex-col justify-center gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-2xl font-bold text-neutral-900 tabular-nums">{att.followthrough_pct}%</p>
                    <p className="text-xs text-neutral-500">Sign-in rate ({fmtNum(att.signins)} of {fmtNum(att.registrations)} registrations)</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-neutral-900 tabular-nums">{fmtNum(att.new_attendees)}</p>
                    <p className="text-xs text-neutral-500">New people ({pct(att.new_attendees, att.unique_attendees)}% of unique)</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-neutral-900 tabular-nums">{fmtNum(att.returning_attendees)}</p>
                    <p className="text-xs text-neutral-500">Returning people</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-neutral-900 tabular-nums">{att.retention.avg_events_per_attendee}</p>
                    <p className="text-xs text-neutral-500">Avg events / person (max {att.retention.max_events_by_one_person})</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </Section>
        )}

        {/* ── By collective ── */}
        {sortedCollectives.length > 0 && (
          <Section id="collectives" title="By collective">
            <motion.div variants={v.fadeUp} className="rounded-2xl bg-white shadow-sm border border-neutral-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 text-left text-[11px] uppercase tracking-wider text-neutral-400">
                      <th className="px-4 py-3 font-semibold">Collective</th>
                      <th className="px-3 py-3 font-semibold text-right">Events</th>
                      <th className="px-3 py-3 font-semibold text-right">Attendees</th>
                      {visibleDefs.slice(0, 4).map((def) => (
                        <th key={def.key} className="px-3 py-3 font-semibold text-right">{def.label}{def.unit ? ` (${def.unit})` : ''}</th>
                      ))}
                      <th className="px-3 py-3 font-semibold text-right">Est. hrs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCollectives.map((c) => (
                      <tr key={c.collectiveId} className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50 transition-colors cursor-pointer" onClick={() => setCollectiveId(c.collectiveId)}>
                        <td className="px-4 py-3 font-semibold text-neutral-900">{c.name}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-neutral-700">{c.eventCount}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-neutral-700">{fmtNum(c.attendees)}</td>
                        {visibleDefs.slice(0, 4).map((def) => (
                          <td key={def.key} className="px-3 py-3 text-right tabular-nums text-neutral-700">{fmtMetric(c.metrics[def.key] ?? 0, def)}</td>
                        ))}
                        <td className="px-3 py-3 text-right tabular-nums text-neutral-700">{fmtNum(c.estimatedHours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </Section>
        )}

        {/* ── Event impact log ── */}
        <Section id="events" title="Event impact log" hint={sortedEvents.length ? `${sortedEvents.length} event${sortedEvents.length !== 1 ? 's' : ''} in scope` : undefined}>
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
                    {visibleDefs.map((def) => (
                      <th key={def.key} className="px-3 py-3 font-semibold text-right">{def.label}{def.unit ? ` (${def.unit})` : ''}</th>
                    ))}
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
                      <td className="px-3 py-3 text-center">
                        <Badge variant="activity" activity={activityToBadge(row.activityType)} size="sm">
                          {ACTIVITY_TYPE_LABELS[row.activityType] ?? row.activityType}
                        </Badge>
                      </td>
                      {visibleDefs.map((def) => (
                        <td key={def.key} className="px-3 py-3 text-right tabular-nums text-neutral-900">{fmtMetric(row.metrics[def.key] ?? null, def)}</td>
                      ))}
                      <td className="px-3 py-3 text-right tabular-nums text-neutral-900">{row.estimatedVolHours != null ? `${row.estimatedVolHours.toLocaleString()}` : '-'}</td>
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
        </Section>

        {/* ── Trends ── */}
        {yoy && yoy.length > 0 && (
          <Section id="trends" title="Year on year" hint="How the headline numbers have moved across years.">
            <motion.div variants={v.fadeUp} className="rounded-2xl bg-white shadow-sm border border-neutral-100 p-5 space-y-4">
              {yoy.map((y) => {
                const bars = [
                  { label: 'Attendees', val: y.attendees, max: Math.max(...yoy.map((x) => x.attendees), 1), color: 'from-warning-400 to-warning-500' },
                  ...topMetrics.map((m) => ({ label: m.def.label, val: y.metrics[m.def.key] ?? 0, max: Math.max(...yoy.map((x) => x.metrics[m.def.key] ?? 0), 1), color: 'from-primary-400 to-primary-500' })),
                  { label: 'Est. hrs', val: y.estimatedHours, max: Math.max(...yoy.map((x) => x.estimatedHours), 1), color: 'from-bark-400 to-bark-500' },
                ]
                return (
                  <div key={y.year}>
                    <span className="text-xs font-bold text-neutral-600 tabular-nums">{y.year}</span>
                    <span className="text-[10px] text-neutral-400 ml-2">{y.events} events</span>
                    <div className="mt-1.5 space-y-1">
                      {bars.map((b) => (
                        <div key={b.label} className="flex items-center gap-2">
                          <div className="w-20 text-[10px] text-neutral-400 text-right truncate">{b.label}</div>
                          <div className="flex-1 h-3.5 bg-neutral-50 rounded-full overflow-hidden">
                            <motion.div className={cn('h-full rounded-full bg-gradient-to-r', b.color)}
                              initial={rm ? { width: `${(b.val / b.max) * 100}%` } : { width: 0 }}
                              animate={{ width: `${Math.max((b.val / b.max) * 100, b.val > 0 ? 2 : 0)}%` }} transition={{ duration: 0.6 }} />
                          </div>
                          <span className="w-16 text-[11px] font-semibold text-neutral-700 tabular-nums text-right">{b.val > 0 ? b.val.toLocaleString() : '-'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </motion.div>
          </Section>
        )}

        {/* ── Data health ── */}
        <Section id="health" title="Data health" hint="Where the numbers come from and what is still missing.">
          <motion.div variants={v.fadeUp} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {dataQuality && (
              <div className="rounded-2xl bg-white shadow-sm border border-neutral-100 p-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-900 mb-4"><Database size={16} className="text-neutral-400" />Data source</h3>
                {(() => {
                  const total = dataQuality.legacyCount + dataQuality.appCount
                  const legacyPct = total > 0 ? Math.round((dataQuality.legacyCount / total) * 100) : 0
                  return (
                    <>
                      <div className="flex h-3 rounded-full overflow-hidden bg-neutral-50">
                        <div className="bg-gradient-to-r from-primary-400 to-primary-500" style={{ width: `${legacyPct}%` }} />
                        <div className="bg-gradient-to-r from-sprout-400 to-sprout-500" style={{ width: `${100 - legacyPct}%` }} />
                      </div>
                      <div className="flex justify-between mt-1.5 text-[11px] text-neutral-500">
                        <span><span className="inline-block w-2 h-2 rounded-full bg-primary-400 mr-1" />Legacy ({dataQuality.legacyCount})</span>
                        <span><span className="inline-block w-2 h-2 rounded-full bg-sprout-400 mr-1" />App ({dataQuality.appCount})</span>
                      </div>
                    </>
                  )
                })()}
                {dataQuality.zeroMetricEvents > 0 && (
                  <p className="text-[11px] text-neutral-400 mt-3 pt-3 border-t border-neutral-100">{dataQuality.zeroMetricEvents} log{dataQuality.zeroMetricEvents !== 1 ? 's' : ''} with all metrics at zero (recreational or missing entry).</p>
                )}
              </div>
            )}
            {(missingImpact?.length ?? 0) > 0 && (
              <div className="rounded-2xl bg-warning-50 border border-warning-200/50 p-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-warning-800 mb-2"><AlertTriangle size={16} className="text-warning-600" />{missingImpact!.length} event{missingImpact!.length !== 1 ? 's' : ''} missing impact</h3>
                <p className="text-xs text-warning-700 mb-3">Ended in the last 30 days with no impact logged yet.</p>
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
                  {missingImpact!.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/70">
                      <Link to={`/events/${e.id}/impact`} className="flex-1 min-w-0 hover:opacity-80">
                        <p className="text-sm font-medium text-neutral-800 truncate">{e.title}</p>
                        <p className="text-[11px] text-neutral-400">{e.collective_name ?? 'Unknown'} · {e.days_since}d ago</p>
                      </Link>
                      <button type="button" disabled={nudging === e.id}
                        onClick={() => {
                          setNudging(e.id)
                          notifyLeaders.mutate({ eventId: e.id, eventTitle: e.title, collectiveId: e.collective_id }, {
                            onSuccess: (r) => { toast.success(`Reminder sent to ${r?.sent ?? 0} leader${(r?.sent ?? 0) !== 1 ? 's' : ''}`); setNudging(null) },
                            onError: () => { toast.error('Failed to send reminder'); setNudging(null) },
                          })
                        }}
                        className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-warning-200 text-warning-800 hover:bg-warning-300 disabled:opacity-50 shrink-0 cursor-pointer">
                        {nudging === e.id ? 'Sending...' : 'Nudge'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </Section>

        {/* ── Export & reports (drawer) ── */}
        <Section id="export" title="Export & reports" hint="Download a spreadsheet or build a custom report.">
          <motion.div variants={v.fadeUp} className="rounded-2xl bg-white shadow-sm border border-neutral-100 overflow-hidden">
            <button type="button" onClick={() => setExportOpen((o) => !o)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 transition-colors cursor-pointer">
              <span className="flex items-center gap-2 text-sm font-semibold text-neutral-900"><Download size={15} className="text-primary-600" />Quick exports &amp; custom report builder</span>
              {exportOpen ? <ChevronUp size={16} className="text-neutral-400" /> : <ChevronDown size={16} className="text-neutral-400" />}
            </button>
            {exportOpen && (
              <div className="border-t border-neutral-100 px-1 sm:px-3 pb-3">
                <Suspense fallback={<div className="py-10 text-center text-sm text-neutral-400">Loading export tools...</div>}>
                  <AdminReportsPage embedded />
                </Suspense>
              </div>
            )}
          </motion.div>
        </Section>
      </div>
    </motion.div>
  )
}
