/**
 * Admin > Metrics
 *
 * The capable, un-branded metrics surface (Tate 2026-06-08): pick a scope
 * (collectives + date range), get plain markdown an exec pastes straight into
 * their own report. No charts, no PDF, no branding - just the numbers and the
 * maths execs actually ask for (attendances, unique attendees, return-frequency
 * cohorts, new vs returning, per-collective breakdown).
 *
 * All the work happens in the SQL engine coexist_attendance_metrics()
 * (migration 20260608100000); this page is a thin scope-picker + md renderer.
 */
import { useState, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { BarChart3, Copy, Check, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useCollectives } from '@/hooks/use-collective'
import { useToast } from '@/components/toast'
import {
  formatAttendanceMetricsMd,
  type AttendanceMetrics,
} from '@/lib/attendance-metrics'

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function AdminMetricsPage() {
  const shouldReduceMotion = useReducedMotion()
  const { toast } = useToast()
  const { data: collectives } = useCollectives({ includeNational: false })

  const [selected, setSelected] = useState<string[]>([])
  const [from, setFrom] = useState('2026-01-01')
  const [to, setTo] = useState(todayIso())
  const [loading, setLoading] = useState(false)
  const [md, setMd] = useState('')
  const [copied, setCopied] = useState(false)

  const sortedCollectives = useMemo(
    () => [...(collectives ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [collectives],
  )

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  async function generate() {
    setLoading(true)
    setMd('')
    try {
      const { data, error } = await supabase.rpc('coexist_attendance_metrics', {
        p_collective_ids: selected.length ? selected : null,
        p_from: from,
        p_to: to,
      })
      if (error) throw error
      setMd(formatAttendanceMetricsMd(data as unknown as AttendanceMetrics))
    } catch (err) {
      toast({
        title: 'Could not generate metrics',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  async function copyMd() {
    try {
      await navigator.clipboard.writeText(md)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast({ title: 'Copy failed', description: 'Select the text and copy manually.', variant: 'error' })
    }
  }

  return (
    <motion.div
      initial={shouldReduceMotion ? undefined : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-3xl px-4 py-6 space-y-6"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
          <BarChart3 size={20} className="text-primary-600" />
        </div>
        <div>
          <h1 className="font-heading text-xl font-bold text-neutral-900">Metrics</h1>
          <p className="text-sm text-neutral-500">
            Pick a scope, get plain markdown for your own report.
          </p>
        </div>
      </div>

      {/* Scope: collectives */}
      <div className="rounded-xl bg-white ring-1 ring-neutral-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-neutral-900">Collectives</p>
          <button
            type="button"
            className="text-xs text-primary-600 font-medium"
            onClick={() => setSelected([])}
          >
            {selected.length ? 'Clear (national)' : 'All collectives (national)'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {sortedCollectives.map((c) => {
            const on = selected.includes(c.id)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                className={
                  'px-3 py-1.5 rounded-full text-sm font-medium ring-1 transition-colors ' +
                  (on
                    ? 'bg-primary-100 text-primary-800 ring-primary-300'
                    : 'bg-white text-neutral-600 ring-neutral-200 hover:bg-neutral-50')
                }
              >
                {c.name}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-neutral-400">
          {selected.length === 0
            ? 'No collectives selected = national (all collectives).'
            : `${selected.length} selected.`}
        </p>
      </div>

      {/* Scope: dates */}
      <div className="rounded-xl bg-white ring-1 ring-neutral-200 p-4 grid grid-cols-2 gap-4">
        <label className="text-sm">
          <span className="block font-semibold text-neutral-900 mb-1">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="block font-semibold text-neutral-900 mb-1">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={generate}
        disabled={loading}
        className="w-full rounded-xl bg-primary-600 text-white font-semibold py-3 flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {loading ? <Loader2 size={18} className="animate-spin" /> : <BarChart3 size={18} />}
        {loading ? 'Generating...' : 'Generate metrics'}
      </button>

      {/* Output: plain markdown */}
      {md && (
        <div className="rounded-xl bg-white ring-1 ring-neutral-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-neutral-900">Markdown</p>
            <button
              type="button"
              onClick={copyMd}
              className="flex items-center gap-1.5 text-xs font-medium text-primary-600"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <textarea
            readOnly
            value={md}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full h-[28rem] rounded-lg border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs leading-relaxed text-neutral-800"
          />
        </div>
      )}
    </motion.div>
  )
}
