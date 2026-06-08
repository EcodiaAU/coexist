/**
 * Admin > Metrics - live attendance & retention explorer.
 *
 * Tate 2026-06-08/09: surface the metrics Reports can't - who came, who came
 * back, and the follow-through from registration to sign-in - scoped by
 * collective(s) + date range, rendered so a non-technical exec can read it at a
 * glance. Markdown / CSV are EXPORT buttons (for pasting into their own docs),
 * not the primary view. Distinct from /admin/reports (canned CSV/PDF exports);
 * this is the flexible retention-cohort story. Engine: coexist_attendance_metrics
 * SQL function (migration 20260608100000).
 */
import { useState, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { BarChart3, Copy, Check, Loader2, Users, UserCheck, Repeat, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useCollectives } from '@/hooks/use-collective'
import { useToast } from '@/components/toast'
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
    ['Events held', m.events_in_scope],
    ['Events with attendance', m.events_with_attendance],
    ['Total attendances', m.total_attendances],
    ['Unique attendees', m.unique_attendees],
    ['New attendees', m.new_attendees],
    ['Returning attendees', m.returning_attendees],
    ['Registrations', m.registrations],
    ['Sign-ins', m.signins],
    ['Follow-through %', m.followthrough_pct],
    ['Registered attendances', m.registered_attendances],
    ['Walk-in attendances', m.walkin_attendances],
    ['Avg attendance per active event', m.avg_attendance_per_active_event],
    ['Attended 1 event', m.retention.attended_1],
    ['Attended 2 events', m.retention.attended_2],
    ['Attended 3 events', m.retention.attended_3],
    ['Attended 4-5 events', m.retention.attended_4_to_5],
    ['Attended 6+ events', m.retention.attended_6_plus],
  ]
  return ['Metric,Value', ...rows.map(([k, v]) => `${k},${v}`)].join('\n')
}

/* ---- small presentational pieces ---- */

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-neutral-200 p-4">
      <div className="flex items-center gap-2 text-primary-600">{icon}<span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{label}</span></div>
      <p className="mt-2 text-3xl font-heading font-bold text-neutral-900 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-neutral-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function CohortBar({ label, count, total }: { label: string; count: number; total: number }) {
  const p = pct(count, total)
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-16 shrink-0 text-sm text-neutral-600">{label}</span>
      <div className="flex-1 h-7 rounded-lg bg-neutral-100 overflow-hidden">
        <div className="h-full bg-primary-400 rounded-lg transition-all" style={{ width: `${Math.max(p, count > 0 ? 4 : 0)}%` }} />
      </div>
      <span className="w-24 shrink-0 text-right text-sm tabular-nums text-neutral-700">{count} <span className="text-neutral-400">({p}%)</span></span>
    </div>
  )
}

export default function AdminMetricsPage() {
  const shouldReduceMotion = useReducedMotion()
  const { toast } = useToast()
  const { data: collectives } = useCollectives({ includeNational: false })

  const [selected, setSelected] = useState<string[]>([])
  const [from, setFrom] = useState('2026-01-01')
  const [to, setTo] = useState(todayIso())
  const [loading, setLoading] = useState(false)
  const [m, setM] = useState<AttendanceMetrics | null>(null)
  const [copied, setCopied] = useState<'md' | 'csv' | null>(null)

  const sortedCollectives = useMemo(
    () => [...(collectives ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [collectives],
  )
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  async function generate() {
    setLoading(true); setM(null)
    try {
      const { data, error } = await supabase.rpc('coexist_attendance_metrics', {
        p_collective_ids: selected.length ? selected : null,
        p_from: from,
        p_to: to,
      })
      if (error) throw error
      setM(data as unknown as AttendanceMetrics)
    } catch (err) {
      toast({ title: 'Could not load metrics', description: err instanceof Error ? err.message : 'Unknown error', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function copy(kind: 'md' | 'csv') {
    if (!m) return
    try {
      await navigator.clipboard.writeText(kind === 'md' ? formatAttendanceMetricsMd(m) : metricsToCsv(m))
      setCopied(kind); setTimeout(() => setCopied(null), 1500)
    } catch { toast({ title: 'Copy failed', variant: 'error' }) }
  }

  const repeat = m ? m.unique_attendees - m.retention.attended_1 : 0
  const scopeLabel = m
    ? (m.scope.collective_names.length ? m.scope.collective_names.join(', ') : 'All collectives (national)')
    : ''

  return (
    <motion.div
      initial={shouldReduceMotion ? undefined : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-4xl px-4 py-6 space-y-6"
    >
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
          <BarChart3 size={22} className="text-primary-600" />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold text-neutral-900">Attendance & Retention</h1>
          <p className="text-sm text-neutral-500">Who came, who came back, and how registrations convert to sign-ins.</p>
        </div>
      </div>

      {/* Scope */}
      <div className="rounded-2xl bg-white ring-1 ring-neutral-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-neutral-900">Collectives</p>
          <button type="button" className="text-xs font-medium text-primary-600" onClick={() => setSelected([])}>
            {selected.length ? `Clear (${selected.length})` : 'National'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {sortedCollectives.map((c) => {
            const on = selected.includes(c.id)
            return (
              <button key={c.id} type="button" onClick={() => toggle(c.id)}
                className={'px-3 py-1.5 rounded-full text-sm font-medium ring-1 transition-colors ' +
                  (on ? 'bg-primary-100 text-primary-800 ring-primary-300' : 'bg-white text-neutral-600 ring-neutral-200 hover:bg-neutral-50')}>
                {c.name}
              </button>
            )
          })}
        </div>
        <div className="grid grid-cols-2 gap-4 pt-1">
          <label className="text-sm"><span className="block font-semibold text-neutral-900 mb-1">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2" /></label>
          <label className="text-sm"><span className="block font-semibold text-neutral-900 mb-1">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2" /></label>
        </div>
        <button type="button" onClick={generate} disabled={loading}
          className="w-full rounded-xl bg-primary-600 text-white font-semibold py-3 flex items-center justify-center gap-2 disabled:opacity-60">
          {loading ? <Loader2 size={18} className="animate-spin" /> : <BarChart3 size={18} />}
          {loading ? 'Loading...' : 'Show metrics'}
        </button>
      </div>

      {/* Results */}
      {m && (
        <motion.div initial={shouldReduceMotion ? undefined : { opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
          <p className="text-sm text-neutral-500">
            <span className="font-semibold text-neutral-700">{scopeLabel}</span> · {m.events_in_scope} events held ({m.events_with_attendance} with sign-ins)
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={<Users size={15} />} label="Attendances" value={String(m.total_attendances)} sub={`${m.avg_attendance_per_active_event} avg / event`} />
            <StatCard icon={<UserCheck size={15} />} label="Unique people" value={String(m.unique_attendees)} sub={`${m.registered_attendances} registered · ${m.walkin_attendances} walk-in`} />
            <StatCard icon={<Repeat size={15} />} label="Came back" value={`${pct(repeat, m.unique_attendees)}%`} sub={`${repeat} of ${m.unique_attendees} attended 2+`} />
            <StatCard icon={<TrendingUp size={15} />} label="Follow-through" value={`${m.followthrough_pct}%`} sub={`${m.signins} of ${m.registrations} regos signed in`} />
          </div>

          {/* Return frequency */}
          <div className="rounded-2xl bg-white ring-1 ring-neutral-200 p-5">
            <p className="text-sm font-semibold text-neutral-900">Return frequency</p>
            <p className="text-xs text-neutral-500 mb-3">How many unique people came to N events in this window.</p>
            <CohortBar label="1 event" count={m.retention.attended_1} total={m.unique_attendees} />
            <CohortBar label="2 events" count={m.retention.attended_2} total={m.unique_attendees} />
            <CohortBar label="3 events" count={m.retention.attended_3} total={m.unique_attendees} />
            <CohortBar label="4-5" count={m.retention.attended_4_to_5} total={m.unique_attendees} />
            <CohortBar label="6+" count={m.retention.attended_6_plus} total={m.unique_attendees} />
            <p className="text-xs text-neutral-500 mt-3 pt-3 border-t border-neutral-100">
              New: <span className="font-semibold text-neutral-700">{m.new_attendees}</span> · Returning: <span className="font-semibold text-neutral-700">{m.returning_attendees}</span> · Avg {m.retention.avg_events_per_attendee} events/person · Most by one person: {m.retention.max_events_by_one_person}
            </p>
          </div>

          {/* Per collective */}
          {m.per_collective.length > 1 && (
            <div className="rounded-2xl bg-white ring-1 ring-neutral-200 p-5 overflow-x-auto">
              <p className="text-sm font-semibold text-neutral-900 mb-3">By collective</p>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wide text-neutral-400">
                  <th className="font-semibold pb-2">Collective</th><th className="font-semibold pb-2 text-right">Events</th><th className="font-semibold pb-2 text-right">Attendances</th><th className="font-semibold pb-2 text-right">Unique</th>
                </tr></thead>
                <tbody>
                  {m.per_collective.map((c) => (
                    <tr key={c.collective_id ?? c.name} className="border-t border-neutral-100">
                      <td className="py-2 text-neutral-800">{c.name ?? 'Unknown'}</td>
                      <td className="py-2 text-right tabular-nums text-neutral-700">{c.events}</td>
                      <td className="py-2 text-right tabular-nums text-neutral-700">{c.attendances}</td>
                      <td className="py-2 text-right tabular-nums text-neutral-700">{c.unique_attendees}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Export */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-400">Export for your own report:</span>
            <button type="button" onClick={() => copy('md')} className="flex items-center gap-1.5 text-sm font-medium text-primary-600">
              {copied === 'md' ? <Check size={15} /> : <Copy size={15} />} Markdown
            </button>
            <button type="button" onClick={() => copy('csv')} className="flex items-center gap-1.5 text-sm font-medium text-primary-600">
              {copied === 'csv' ? <Check size={15} /> : <Copy size={15} />} CSV
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
