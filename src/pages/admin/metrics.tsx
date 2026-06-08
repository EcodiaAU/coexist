/**
 * Admin > Metrics - live attendance & retention explorer.
 *
 * Tate 2026-06-09: rebuilt to match the Impact dashboard's design language (the
 * proven admin quality bar) - dark hero header (useAdminHeader), compact filter
 * pills, stats that AUTO-LOAD on mount and re-query on filter change (no "Show
 * metrics" button), and AdminHeroStat cards. Distinct from /admin/reports (canned
 * CSV/PDF exports): this is the live retention-cohort story Reports cannot tell.
 * Engine: coexist_attendance_metrics SQL function (migration 20260608100000).
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { Repeat, TrendingUp, Users, UserCheck, CalendarDays, Copy, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useCollectives } from '@/hooks/use-collective'
import { useToast } from '@/components/toast'
import { useAdminHeader } from '@/components/admin-layout'
import { AdminHeroStat, AdminHeroStatRow } from '@/components/admin-hero-stat'
import { Dropdown } from '@/components/dropdown'
import { adminVariants } from '@/lib/admin-motion'
import { dateRangeOptions, getDateRangeStart, type DateRange } from '@/hooks/use-admin-dashboard'
import { formatAttendanceMetricsMd, type AttendanceMetrics } from '@/lib/attendance-metrics'

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}
function metricsToCsv(m: AttendanceMetrics): string {
  const rows: [string, string | number][] = [
    ['Events held', m.events_in_scope], ['Events with attendance', m.events_with_attendance],
    ['Total attendances', m.total_attendances], ['Unique attendees', m.unique_attendees],
    ['New attendees', m.new_attendees], ['Returning attendees', m.returning_attendees],
    ['Registrations', m.registrations], ['Sign-ins', m.signins], ['Follow-through %', m.followthrough_pct],
    ['Registered attendances', m.registered_attendances], ['Walk-in attendances', m.walkin_attendances],
    ['Attended 1 event', m.retention.attended_1], ['Attended 2 events', m.retention.attended_2],
    ['Attended 3 events', m.retention.attended_3], ['Attended 4-5 events', m.retention.attended_4_to_5],
    ['Attended 6+ events', m.retention.attended_6_plus],
  ]
  return ['Metric,Value', ...rows.map(([k, val]) => `${k},${val}`)].join('\n')
}

function CohortBar({ label, count, total, delay }: { label: string; count: number; total: number; delay: number }) {
  const p = pct(count, total)
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-14 shrink-0 text-sm text-neutral-600">{label}</span>
      <div className="flex-1 h-7 rounded-lg bg-neutral-100 overflow-hidden">
        <motion.div className="h-full bg-primary-400 rounded-lg" initial={{ width: 0 }}
          animate={{ width: `${Math.max(p, count > 0 ? 3 : 0)}%` }} transition={{ duration: 0.6, delay }} />
      </div>
      <span className="w-24 shrink-0 text-right text-sm tabular-nums text-neutral-700">{count} <span className="text-neutral-400">({p}%)</span></span>
    </div>
  )
}

export default function AdminMetricsPage() {
  useAdminHeader('Attendance & Retention')
  const rm = !!useReducedMotion()
  const v = adminVariants(rm)
  const { toast } = useToast()
  const { data: collectives } = useCollectives({ includeNational: false })

  const [dateRange, setDateRange] = useState<DateRange>('year')
  const [collectiveId, setCollectiveId] = useState('')
  const [copied, setCopied] = useState<'md' | 'csv' | null>(null)

  const collectiveOptions = useMemo(
    () => [{ value: '', label: 'All Collectives' }, ...[...(collectives ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.name }))],
    [collectives],
  )
  const fromDate = useMemo(() => { const s = getDateRangeStart(dateRange); return s ? s.slice(0, 10) : '2018-01-01' }, [dateRange])
  const toDate = todayIso()

  const { data: m, isLoading } = useQuery({
    queryKey: ['attendance-metrics', dateRange, collectiveId],
    queryFn: async (): Promise<AttendanceMetrics> => {
      const { data, error } = await supabase.rpc('coexist_attendance_metrics', {
        p_collective_ids: collectiveId ? [collectiveId] : null, p_from: fromDate, p_to: toDate,
      })
      if (error) throw error
      return data as unknown as AttendanceMetrics
    },
  })

  async function copy(kind: 'md' | 'csv') {
    if (!m) return
    try {
      await navigator.clipboard.writeText(kind === 'md' ? formatAttendanceMetricsMd(m) : metricsToCsv(m))
      setCopied(kind); setTimeout(() => setCopied(null), 1500)
    } catch { toast({ title: 'Copy failed', variant: 'error' }) }
  }

  const repeat = m ? m.unique_attendees - m.retention.attended_1 : 0

  return (
    <motion.div className="py-6 space-y-8 pb-24" variants={v.stagger} initial="hidden" animate="visible">
      {/* Filter bar - matches Impact */}
      <motion.div variants={v.fadeUp} className="flex flex-wrap items-center gap-3">
        <Dropdown options={dateRangeOptions} value={dateRange} onChange={(val) => setDateRange(val as DateRange)} className="w-40" />
        <Dropdown options={collectiveOptions} value={collectiveId} onChange={setCollectiveId} className="w-48" />
        <p className="text-sm text-neutral-400 ml-auto hidden sm:block">Who came, who came back, and how registrations convert to sign-ins.</p>
      </motion.div>

      {isLoading || !m ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-24 rounded-2xl bg-neutral-50 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />)}
          </div>
          <div className="h-56 rounded-2xl bg-neutral-50 animate-pulse" />
        </div>
      ) : (
        <>
          {/* Headline stats */}
          <motion.div variants={v.fadeUp}>
            <AdminHeroStatRow className="!max-w-none grid-cols-2 sm:!grid-cols-3 lg:!grid-cols-5">
              <AdminHeroStat value={m.events_in_scope} label="Events held" icon={<CalendarDays size={18} />} color="primary" reducedMotion={rm} delay={0} sub={`${m.events_with_attendance} with sign-ins`} />
              <AdminHeroStat value={m.total_attendances} label="Attendances" icon={<Users size={18} />} color="warning" reducedMotion={rm} delay={1} sub={`${m.avg_attendance_per_active_event} avg / event`} />
              <AdminHeroStat value={m.unique_attendees} label="Unique people" icon={<UserCheck size={18} />} color="moss" reducedMotion={rm} delay={2} sub={`${m.registered_attendances} reg · ${m.walkin_attendances} walk-in`} />
              <AdminHeroStat value={repeat} label="Came back" icon={<Repeat size={18} />} color="sprout" reducedMotion={rm} delay={3} sub={`${pct(repeat, m.unique_attendees)}% attended 2+`} />
              <AdminHeroStat value={m.signins} label="Signed in" icon={<TrendingUp size={18} />} color="success" reducedMotion={rm} delay={4} sub={`${m.followthrough_pct}% of ${m.registrations} regos`} />
            </AdminHeroStatRow>
          </motion.div>

          {/* Return frequency */}
          <motion.div variants={v.fadeUp} className="rounded-2xl bg-white shadow-sm border border-neutral-100 p-5">
            <p className="text-sm font-semibold text-neutral-900">Return frequency</p>
            <p className="text-xs text-neutral-500 mb-3">How many unique people came to N events in this window.</p>
            <CohortBar label="1 event" count={m.retention.attended_1} total={m.unique_attendees} delay={0.05} />
            <CohortBar label="2 events" count={m.retention.attended_2} total={m.unique_attendees} delay={0.1} />
            <CohortBar label="3 events" count={m.retention.attended_3} total={m.unique_attendees} delay={0.15} />
            <CohortBar label="4-5" count={m.retention.attended_4_to_5} total={m.unique_attendees} delay={0.2} />
            <CohortBar label="6+" count={m.retention.attended_6_plus} total={m.unique_attendees} delay={0.25} />
            <p className="text-xs text-neutral-500 mt-3 pt-3 border-t border-neutral-100">
              New: <span className="font-semibold text-neutral-700">{m.new_attendees}</span> · Returning: <span className="font-semibold text-neutral-700">{m.returning_attendees}</span> · Avg {m.retention.avg_events_per_attendee} events/person · Most by one person: {m.retention.max_events_by_one_person}
            </p>
          </motion.div>

          {/* Per collective */}
          {m.per_collective.length > 1 && (
            <motion.div variants={v.fadeUp} className="rounded-2xl bg-white shadow-sm border border-neutral-100 p-5 overflow-x-auto">
              <p className="text-sm font-semibold text-neutral-900 mb-3">By collective</p>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wide text-neutral-400">
                  <th className="font-semibold pb-2">Collective</th><th className="font-semibold pb-2 text-right">Events</th><th className="font-semibold pb-2 text-right">Attendances</th><th className="font-semibold pb-2 text-right">Unique</th>
                </tr></thead>
                <tbody>
                  {[...m.per_collective].sort((a, b) => b.attendances - a.attendances).map((c) => (
                    <tr key={c.collective_id ?? c.name} className="border-t border-neutral-100">
                      <td className="py-2 text-neutral-800">{c.name ?? 'Unknown'}</td>
                      <td className="py-2 text-right tabular-nums text-neutral-700">{c.events}</td>
                      <td className="py-2 text-right tabular-nums text-neutral-700">{c.attendances}</td>
                      <td className="py-2 text-right tabular-nums text-neutral-700">{c.unique_attendees}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          )}

          {/* Export */}
          <motion.div variants={v.fadeUp} className="flex items-center gap-4">
            <span className="text-xs text-neutral-400">Export for your own report:</span>
            <button type="button" onClick={() => copy('md')} className="flex items-center gap-1.5 text-sm font-medium text-primary-600">
              {copied === 'md' ? <Check size={15} /> : <Copy size={15} />} Markdown
            </button>
            <button type="button" onClick={() => copy('csv')} className="flex items-center gap-1.5 text-sm font-medium text-primary-600">
              {copied === 'csv' ? <Check size={15} /> : <Copy size={15} />} CSV
            </button>
          </motion.div>
        </>
      )}
    </motion.div>
  )
}
