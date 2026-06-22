/**
 * Admin Reports
 *
 * Merged surface that replaces the old separate /admin/reports (metric builder)
 * and /admin/exports (export cards) pages. Two tabs share one filter bar:
 *
 *   - Quick Exports - the 11 canned exports (members, attendance, impact,
 *     survey, donations, orders, charity annual, reconciliation, GST,
 *     donation tax). PDFs go through the generate-pdf edge function; CSVs
 *     are built in the browser.
 *
 *   - Custom Report - pick metrics, scope, date range; outputs a tidy
 *     summary CSV or printable PDF. The report-type radio shapes whether
 *     output is rolled-up totals (national/collective/annual/donor) or
 *     a per-event breakdown (event).
 *
 * Leaders still get the old metric-builder via pages/reports/index.tsx; this
 * page is admin-only.
 */
import { useState, useMemo } from 'react'
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion'
import { adminVariants, tabFade } from '@/lib/admin-motion'
import {
    Download,
    Users,
    CalendarDays,
    TreePine,
    ClipboardList,
    DollarSign,
    ShoppingBag,
    FileText,
    Receipt,
    BarChart3,
    Calendar,
    AlertTriangle,
    Check,
    Loader2,
    SlidersHorizontal,
    FileSpreadsheet,
} from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { AdminHeroStat, AdminHeroStatRow } from '@/components/admin-hero-stat'
import { Button } from '@/components/button'
import { Dropdown } from '@/components/dropdown'
import { Input } from '@/components/input'
import { Chip } from '@/components/chip'
import { StaggeredList, StaggeredItem } from '@/components/scroll-reveal'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { useCollectives } from '@/hooks/use-collective'
import { useAuth } from '@/hooks/use-auth'
import {
  IMPACT_SELECT_COLUMNS,
  sumMetric,
  sumMetricWeighted,
  type EventHostShare,
} from '@/lib/impact-metrics'
import { fetchImpactRows } from '@/lib/impact-query'

/* ================================================================== */
/*  Shared CSV helpers                                                 */
/* ================================================================== */

function escapeCsv(val: unknown): string {
  const s = String(val ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n')
}

function downloadBlob(content: string, type: string, filename: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const downloadCsv = (csv: string, filename: string) =>
  downloadBlob(csv, 'text/csv', filename)

/** Browser-side CSV row cap to prevent OOM on huge datasets. */
const EXPORT_ROW_LIMIT = 10_000

/* ================================================================== */
/*  Quick Exports - export card definitions                            */
/* ================================================================== */

interface ExportType {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  formats: ('csv' | 'pdf')[]
  color: string
}

const exportTypes: ExportType[] = [
  {
    id: 'members',
    title: 'Member List',
    description: 'Name, email, join date, events attended, total hours',
    icon: <Users size={20} />,
    formats: ['csv'],
    color: 'bg-primary-400/25 text-primary-900',
  },
  {
    id: 'attendance',
    title: 'Event Attendance',
    description: 'Per event: name, checked in Y/N, time',
    icon: <CalendarDays size={20} />,
    formats: ['csv'],
    color: 'bg-moss-400/25 text-moss-900',
  },
  {
    id: 'impact-pdf',
    title: 'Impact Report',
    description: 'Headline totals, per-collective breakdown, activity-type breakdown, leadership roster. Honours date + collective filters.',
    icon: <TreePine size={20} />,
    formats: ['pdf'],
    color: 'bg-secondary-400/25 text-secondary-900',
  },
  {
    id: 'impact-csv',
    title: 'Impact Data (Raw)',
    description: 'Raw impact data per event for analysis',
    icon: <BarChart3 size={20} />,
    formats: ['csv'],
    color: 'bg-primary-400/30 text-primary-900',
  },
  {
    id: 'survey',
    title: 'Survey Results',
    description: 'All survey responses with question data',
    icon: <ClipboardList size={20} />,
    formats: ['csv'],
    color: 'bg-plum-400/25 text-plum-900',
  },
  {
    id: 'financial',
    title: 'Donation Report',
    description: 'All donations received with donor details',
    icon: <DollarSign size={20} />,
    formats: ['csv'],
    color: 'bg-bark-400/25 text-bark-900',
  },
  {
    id: 'orders',
    title: 'Merch Orders',
    description: 'Order list for fulfilment with shipping details',
    icon: <ShoppingBag size={20} />,
    formats: ['csv'],
    color: 'bg-moss-400/30 text-moss-900',
  },
  {
    id: 'charity-annual',
    title: 'Charity Annual Report',
    description: 'ACNC-formatted annual report for compliance',
    icon: <FileText size={20} />,
    formats: ['pdf'],
    color: 'bg-secondary-400/30 text-secondary-900',
  },
  {
    id: 'reconciliation',
    title: 'Financial Reconciliation',
    description: 'Compare Stripe payments vs Supabase records',
    icon: <Receipt size={20} />,
    formats: ['csv'],
    color: 'bg-bark-400/30 text-bark-900',
  },
  {
    id: 'gst',
    title: 'GST Report',
    description: 'Australian GST on merch sales, BAS-ready format',
    icon: <Receipt size={20} />,
    formats: ['csv'],
    color: 'bg-plum-400/30 text-plum-900',
  },
  {
    id: 'donation-tax',
    title: 'Donation Tax Report',
    description: 'Annual summary of tax-deductible donations per donor (DGR). Donors with multiple emails may appear as separate entries - review before submitting to ACNC.',
    icon: <DollarSign size={20} />,
    formats: ['csv', 'pdf'],
    color: 'bg-primary-400/25 text-primary-900',
  },
]

/* ================================================================== */
/*  Custom Report - metric / type definitions                          */
/* ================================================================== */

type ReportType = 'collective' | 'national' | 'event' | 'annual' | 'donor'

const reportTypes: { value: ReportType; label: string; description: string }[] = [
  { value: 'national',   label: 'National Impact',   description: 'All collectives aggregated - good for board & grants' },
  { value: 'collective', label: 'Collective Impact', description: 'Single collective rolled up to totals' },
  { value: 'event',      label: 'Per-Event',         description: 'One row per event with each metric' },
  { value: 'annual',     label: 'Annual Charity (ACNC)', description: 'Full-year totals including donations and members' },
  { value: 'donor',      label: 'Donor Impact',      description: 'Donations summed alongside impact achieved in the period' },
]

/** Maps UI metric labels to the underlying source. */
const METRIC_MAP: Record<string, { key: string; label: string; transform?: (v: number) => string }> = {
  'Event attendances':              { key: '__attendance', label: 'Event Attendances' },
  'Est. volunteer hours':           { key: 'hours_total', label: 'Est. Volunteer Hours' },
  'Trees planted':                  { key: 'trees_planted', label: 'Trees Planted' },
  'Litter removed (tonnes)':        { key: 'rubbish_kg', label: 'Litter Removed (tonnes)', transform: (v) => String(Math.round((v / 1000) * 100) / 100) },
  'Cleanup events held':            { key: '__cleanup_events', label: 'Cleanup Events Held' },
  'Number of collectives':          { key: '__collectives', label: 'Number of Collectives' },
  'Young adult leaders trained':    { key: '__leaders', label: 'Young Adult Leaders Trained' },
}

const impactMetrics = Object.keys(METRIC_MAP)

const datePresets = [
  { value: 'custom',       label: 'Custom Range' },
  { value: 'this-month',   label: 'This Month' },
  { value: 'this-quarter', label: 'This Quarter' },
  { value: 'this-year',    label: 'This Year' },
  { value: 'last-fy',      label: 'Last Financial Year' },
]

/** Resolve a date preset to an inclusive [start, end] range (ISO). */
function getDateRange(preset: string, customStart: string, customEnd: string): { start: string; end: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  switch (preset) {
    case 'this-month':
      return {
        start: new Date(year, month, 1).toISOString(),
        end:   new Date(year, month + 1, 0, 23, 59, 59).toISOString(),
      }
    case 'this-quarter': {
      const qStart = Math.floor(month / 3) * 3
      return {
        start: new Date(year, qStart, 1).toISOString(),
        end:   new Date(year, qStart + 3, 0, 23, 59, 59).toISOString(),
      }
    }
    case 'this-year':
      return {
        start: new Date(year, 0, 1).toISOString(),
        end:   new Date(year, 11, 31, 23, 59, 59).toISOString(),
      }
    case 'last-fy':
      // AU FY runs 1 Jul - 30 Jun. If we're before July, "last FY" ended last
      // June; otherwise it ended this June.
      if (month < 6) {
        return {
          start: new Date(year - 2, 6, 1).toISOString(),
          end:   new Date(year - 1, 5, 30, 23, 59, 59).toISOString(),
        }
      }
      return {
        start: new Date(year - 1, 6, 1).toISOString(),
        end:   new Date(year, 5, 30, 23, 59, 59).toISOString(),
      }
    case 'custom':
    default:
      return {
        start: customStart ? new Date(customStart).toISOString() : new Date(year, 0, 1).toISOString(),
        end:   customEnd   ? new Date(customEnd + 'T23:59:59').toISOString() : now.toISOString(),
      }
  }
}

/* ================================================================== */
/*  Custom Report - aggregate data fetcher                             */
/* ================================================================== */

interface CustomRow { metric: string; value: string }

/** Roll up selected metrics into one summary row per metric. */
async function fetchSummaryMetrics(
  selectedMetrics: Set<string>,
  dateRange: { start: string; end: string },
  scope: 'national' | 'collective',
  selectedCollective: string,
): Promise<CustomRow[]> {
  const results: CustomRow[] = []

  const impactKeys = Array.from(selectedMetrics).filter(
    (m) => METRIC_MAP[m] && !METRIC_MAP[m].key.startsWith('__'),
  )
  const needsImpact = impactKeys.length > 0

  let impactRows: Record<string, unknown>[] = []
  let shareByEventId: Map<string, EventHostShare> = new Map()
  if (needsImpact) {
    if (scope === 'collective' && selectedCollective) {
      const result = await fetchImpactRows({
        collectiveId: selectedCollective,
        timeRange: 'custom',
        rangeStart: dateRange.start,
      })
      shareByEventId = result.shareByEventId
      if (result.eventIds.length > 0) {
        const { data: dateRows } = await supabase
          .from('events')
          .select('id, date_start')
          .in('id', result.eventIds)
          .gt('date_start', dateRange.end)
        const tooLate = new Set((dateRows ?? []).map((r) => r.id))
        impactRows = result.rows.filter((r) => !tooLate.has(r.event_id as string))
        for (const id of tooLate) shareByEventId.delete(id)
      } else {
        impactRows = result.rows
      }
    } else {
      const { data, error } = await supabase
        .from('event_impact')
        .select(`${IMPACT_SELECT_COLUMNS}, events!inner(collective_id, date_start)`)
        .gte('events.date_start', dateRange.start)
        .lte('events.date_start', dateRange.end)
        .range(0, 9999)
      if (error) throw error
      impactRows = (data ?? []) as unknown as Record<string, unknown>[]
    }
  }

  for (const metricLabel of selectedMetrics) {
    const def = METRIC_MAP[metricLabel]
    if (!def) continue

    if (def.key === '__attendance') {
      if (scope === 'collective' && selectedCollective) {
        const { data: hostRows } = await supabase
          .from('event_hosts')
          .select('event_id')
          .eq('collective_id', selectedCollective)
        const candidateIds = (hostRows ?? [])
          .map((r) => r.event_id)
          .filter((id): id is string => !!id)
        if (candidateIds.length === 0) {
          results.push({ metric: def.label, value: '0' })
        } else {
          const { data: eventRows } = await supabase
            .from('events')
            .select('id')
            .in('id', candidateIds)
            .gte('date_start', dateRange.start)
            .lte('date_start', dateRange.end)
          const eventIds = (eventRows ?? []).map((e) => e.id)
          if (eventIds.length === 0) {
            results.push({ metric: def.label, value: '0' })
          } else {
            const { count } = await supabase
              .from('event_registrations')
              .select('id', { count: 'exact', head: true })
              .in('event_id', eventIds)
              .eq('status', 'attended')
            results.push({ metric: def.label, value: String(count ?? 0) })
          }
        }
      } else {
        const { count } = await supabase
          .from('event_registrations')
          .select('id, events!inner(date_start)', { count: 'exact', head: true })
          .eq('status', 'attended')
          .gte('events.date_start', dateRange.start)
          .lte('events.date_start', dateRange.end)
        results.push({ metric: def.label, value: String(count ?? 0) })
      }
    } else if (def.key === '__cleanup_events') {
      if (scope === 'collective' && selectedCollective) {
        const { data: hostRows } = await supabase
          .from('event_hosts')
          .select('event_id')
          .eq('collective_id', selectedCollective)
        const candidateIds = (hostRows ?? [])
          .map((r) => r.event_id)
          .filter((id): id is string => !!id)
        if (candidateIds.length === 0) {
          results.push({ metric: def.label, value: '0' })
        } else {
          const { count } = await supabase
            .from('events')
            .select('id', { count: 'exact', head: true })
            .in('id', candidateIds)
            .eq('activity_type', 'clean_up')
            .gte('date_start', dateRange.start)
            .lte('date_start', dateRange.end)
          results.push({ metric: def.label, value: String(count ?? 0) })
        }
      } else {
        const { count } = await supabase
          .from('events')
          .select('id', { count: 'exact', head: true })
          .in('activity_type', ['clean_up'])
          .gte('date_start', dateRange.start)
          .lte('date_start', dateRange.end)
        results.push({ metric: def.label, value: String(count ?? 0) })
      }
    } else if (def.key === '__collectives') {
      const { count } = await supabase
        .from('collectives')
        .select('id', { count: 'exact', head: true })
      results.push({ metric: def.label, value: String(count ?? 0) })
    } else if (def.key === '__leaders') {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'leaders_empowered_total')
        .single()
      const count = (data?.value as { count?: number })?.count ?? 0
      results.push({ metric: def.label, value: String(count) })
    } else {
      const raw = scope === 'collective' && selectedCollective
        ? sumMetricWeighted(impactRows, def.key, shareByEventId)
        : sumMetric(impactRows, def.key)
      const formatted = def.transform ? def.transform(raw) : String(Math.round(raw))
      results.push({ metric: def.label, value: formatted })
    }
  }

  return results
}

interface PerEventReport {
  headers: string[]
  rows: string[][]
}

/**
 * Per-event report: one row per event with selected impact metrics as columns.
 * Pseudo-metrics that don't make sense per-event (__cleanup_events,
 * __collectives, __leaders) are dropped silently.
 */
async function fetchPerEventReport(
  selectedMetrics: Set<string>,
  dateRange: { start: string; end: string },
  scope: 'national' | 'collective',
  selectedCollective: string,
): Promise<PerEventReport> {
  const eventColumns = Array.from(selectedMetrics)
    .map((m) => METRIC_MAP[m])
    .filter((def) => def && !def.key.startsWith('__') || def?.key === '__attendance')

  // Pull events in range, optionally scoped to a collective via event_hosts.
  let candidateEventIds: string[] | null = null
  if (scope === 'collective' && selectedCollective) {
    const { data: hostRows } = await supabase
      .from('event_hosts')
      .select('event_id')
      .eq('collective_id', selectedCollective)
    candidateEventIds = (hostRows ?? [])
      .map((r) => r.event_id)
      .filter((id): id is string => !!id)
    if (candidateEventIds.length === 0) {
      return { headers: ['Event', 'Date'], rows: [] }
    }
  }

  let eventsQuery = supabase
    .from('events')
    .select('id, title, date_start')
    .gte('date_start', dateRange.start)
    .lte('date_start', dateRange.end)
    .order('date_start', { ascending: false })
    .limit(EXPORT_ROW_LIMIT)
  if (candidateEventIds) eventsQuery = eventsQuery.in('id', candidateEventIds)
  const { data: events, error: eventsErr } = await eventsQuery
  if (eventsErr) throw eventsErr

  const eventList = events ?? []
  const eventIds = eventList.map((e) => e.id)

  // Impact rows keyed by event_id.
  const impactByEvent: Map<string, Record<string, unknown>> = new Map()
  if (eventIds.length > 0) {
    const { data: impactRows } = await supabase
      .from('event_impact')
      .select(IMPACT_SELECT_COLUMNS)
      .in('event_id', eventIds)
    for (const r of (impactRows ?? []) as unknown as Record<string, unknown>[]) {
      impactByEvent.set(r.event_id as string, r)
    }
  }

  // Attendance counts (one query if needed).
  const attendanceByEvent: Map<string, number> = new Map()
  const needsAttendance = Array.from(selectedMetrics).some((m) => METRIC_MAP[m]?.key === '__attendance')
  if (needsAttendance && eventIds.length > 0) {
    const { data: regs } = await supabase
      .from('event_registrations')
      .select('event_id')
      .in('event_id', eventIds)
      .eq('status', 'attended')
    for (const r of (regs ?? []) as { event_id: string }[]) {
      attendanceByEvent.set(r.event_id, (attendanceByEvent.get(r.event_id) ?? 0) + 1)
    }
  }

  const headers = ['Event', 'Date', ...eventColumns.map((c) => c!.label)]
  const rows: string[][] = eventList.map((e) => {
    const impact = impactByEvent.get(e.id) ?? {}
    return [
      e.title ?? e.id,
      typeof e.date_start === 'string' ? e.date_start.slice(0, 10) : '',
      ...eventColumns.map((def) => {
        if (!def) return ''
        if (def.key === '__attendance') return String(attendanceByEvent.get(e.id) ?? 0)
        const raw = Number(impact[def.key] ?? 0)
        return def.transform ? def.transform(raw) : String(Math.round(raw))
      }),
    ]
  })

  return { headers, rows }
}

/* ================================================================== */
/*  Print-window helper - reused for custom-report PDF                 */
/* ================================================================== */

function openPrintableTable(title: string, headers: string[], rows: string[][], dateRange: string) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const headerCells = headers.map((h) => `<th>${esc(h)}</th>`).join('')
  const bodyRows = rows.map((row, i) => {
    const bg = i % 2 === 0 ? '#fff' : '#f9f9f9'
    const cells = row.map((c) => `<td>${esc(String(c ?? ''))}</td>`).join('')
    return `<tr style="background:${bg}">${cells}</tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
  h1 { color: #1a6b3c; margin: 0; }
  h2 { margin: 8px 0 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { border: 1px solid #ddd; padding: 8px; background: #1a6b3c; color: #fff; text-align: left; }
  td { border: 1px solid #ddd; padding: 6px; }
  .footer { text-align: center; color: #999; margin-top: 24px; font-size: 10px; }
  @media print {
    body { margin: 20px; }
    button { display: none !important; }
    @page { margin: 1.5cm; }
  }
</style>
</head>
<body>
  <div style="text-align:center;margin-bottom:24px;">
    <h1>Co-Exist Australia</h1>
    <h2>${esc(title)}</h2>
    <p style="color:#666;margin:0;">${dateRange ? `Period: ${esc(dateRange)}` : `Generated: ${new Date().toLocaleDateString('en-AU')}`}</p>
  </div>
  <button onclick="window.print()" style="display:block;margin:0 auto 20px;padding:8px 24px;background:#1a6b3c;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;">Save as PDF</button>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <p class="footer">Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC &bull; Co-Exist Australia</p>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return !!win
}

/* ================================================================== */
/*  Page                                                               */
/* ================================================================== */

type TabKey = 'quick' | 'custom'

function ReportsPageHeader({ heroContent }: { heroContent: React.ReactNode }) {
  useAdminHeader('Reports', { heroContent })
  return null
}

/**
 * embedded=true lets the Insights wrapper host this page as a tab
 * without the page-level useAdminHeader call. The wrapper sets one
 * header for the whole tabbed surface.
 */
export default function AdminReportsPage({ embedded = false }: { embedded?: boolean } = {}) {
  // -------- Shared filters --------
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [scope, setScope] = useState('national')
  const { hasCapability } = useAuth()
  const canExport = hasCapability('manage_exports')
  // Default to Quick Exports if the admin has export rights, otherwise drop
  // them straight into Custom Report - the only thing they can use.
  const [tab, setTab] = useState<TabKey>(canExport ? 'quick' : 'custom')
  const { toast } = useToast()
  const shouldReduceMotion = useReducedMotion()
  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  const { data: collectives } = useCollectives()
  const scopeOptions = useMemo(() => [
    { value: 'national', label: 'National' },
    ...((collectives ?? []).map((c) => ({ value: c.id, label: c.name }))),
  ], [collectives])

  const dateRangeError = dateStart && dateEnd && dateEnd < dateStart
    ? 'End date must be on or after start date'
    : null
  const collectiveFilter = scope !== 'national' ? scope : null

  // -------- Hero header --------
  const heroStats = useMemo(() => (
    <AdminHeroStatRow>
      <AdminHeroStat
        value={exportTypes.length}
        label="Quick Exports"
        icon={<Download size={18} />}
        color="moss"
        delay={0}
        reducedMotion={!!shouldReduceMotion}
      />
      <AdminHeroStat
        value={impactMetrics.length}
        label="Metrics Available"
        icon={<BarChart3 size={18} />}
        color="primary"
        delay={1}
        reducedMotion={!!shouldReduceMotion}
      />
    </AdminHeroStatRow>
  ), [shouldReduceMotion])

  // Hosted by the Insights wrapper when embedded; standalone otherwise.

  /* -------- Quick Exports: handler -------- */
  const [generating, setGenerating] = useState<string | null>(null)
  const [truncationWarning, setTruncationWarning] = useState<string | null>(null)

  const handleQuickExport = async (exportId: string, format: 'csv' | 'pdf') => {
    if (dateRangeError) {
      toast.error('Fix the date range before exporting')
      return
    }

    setGenerating(exportId)
    setTruncationWarning(null)
    try {
      if (format === 'pdf') {
        const { data, error } = await supabase.functions.invoke('generate-pdf', {
          body: { exportId, dateStart, dateEnd, scope, collectiveId: collectiveFilter },
        })
        if (error) throw error
        if (data?.html) {
          const blob = new Blob([data.html], { type: 'text/html' })
          const url = URL.createObjectURL(blob)
          const win = window.open(url, '_blank')
          setTimeout(() => URL.revokeObjectURL(url), 10_000)
          if (!win) toast.error('Allow popups to open the PDF preview')
        }
        toast.success('PDF generated')
        return
      }

      let csv = ''
      let rowCount = 0
      const fname = `co-exist-${exportId}-${new Date().toISOString().slice(0, 10)}.csv`

      if (exportId === 'members') {
        if (collectiveFilter) {
          let query = supabase
            .from('collective_members')
            .select('joined_at, role, profiles(display_name, email, role, created_at)')
            .eq('collective_id', collectiveFilter)
            .order('joined_at', { ascending: false })
            .limit(EXPORT_ROW_LIMIT)
          if (dateStart) query = query.gte('joined_at', dateStart)
          if (dateEnd) query = query.lte('joined_at', dateEnd + 'T23:59:59')
          const { data, error } = await query
          if (error) throw error
          const rows = data ?? []
          rowCount = rows.length
          csv = toCsv(
            ['Name', 'Email', 'Global Role', 'Collective Role', 'Join Date'],
            rows.map((r) => [
              r.profiles?.display_name, r.profiles?.email,
              r.profiles?.role, r.role, r.joined_at,
            ]),
          )
        } else {
          let query = supabase
            .from('profiles')
            .select('display_name, email, role, created_at')
            .order('created_at', { ascending: false })
            .limit(EXPORT_ROW_LIMIT)
          if (dateStart) query = query.gte('created_at', dateStart)
          if (dateEnd) query = query.lte('created_at', dateEnd + 'T23:59:59')
          const { data, error } = await query
          if (error) throw error
          const rows = data ?? []
          rowCount = rows.length
          csv = toCsv(
            ['Name', 'Email', 'Role', 'Join Date'],
            rows.map((r) => [r.display_name, r.email, r.role, r.created_at]),
          )
        }
      } else if (exportId === 'attendance') {
        const selectCols = collectiveFilter
          ? 'event_id, user_id, registered_at, checked_in_at, events!inner(title, collective_id), profiles(display_name)'
          : 'event_id, user_id, registered_at, checked_in_at, events(title), profiles(display_name)'
        let query = supabase
          .from('event_registrations')
          .select(selectCols)
          .order('registered_at', { ascending: false })
          .limit(EXPORT_ROW_LIMIT)
        if (collectiveFilter) query = query.eq('events.collective_id', collectiveFilter)
        if (dateStart) query = query.gte('registered_at', dateStart)
        if (dateEnd) query = query.lte('registered_at', dateEnd + 'T23:59:59')
        const { data, error } = await query
        if (error) throw error
        const rows = (data ?? []) as typeof data
        rowCount = rows.length
        csv = toCsv(
          ['Event', 'Name', 'Checked In', 'Check-in Time'],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rows.map((r: any) => [
            r.events?.title, r.profiles?.display_name,
            r.checked_in_at ? 'Yes' : 'No', r.checked_in_at ?? '',
          ]),
        )
      } else if (exportId === 'impact-csv') {
        const selectCols = collectiveFilter
          ? 'event_id, trees_planted, hours_total, rubbish_kg, area_restored_sqm, native_plants, wildlife_sightings, invasive_weeds_pulled, coastline_cleaned_m, logged_at, events!inner(title, collective_id)'
          : 'event_id, trees_planted, hours_total, rubbish_kg, area_restored_sqm, native_plants, wildlife_sightings, invasive_weeds_pulled, coastline_cleaned_m, logged_at, events(title)'
        let query = supabase
          .from('event_impact')
          .select(selectCols)
          .order('logged_at', { ascending: false })
          .limit(EXPORT_ROW_LIMIT)
        if (collectiveFilter) query = query.eq('events.collective_id', collectiveFilter)
        if (dateStart) query = query.gte('logged_at', dateStart)
        if (dateEnd) query = query.lte('logged_at', dateEnd + 'T23:59:59')
        const { data, error } = await query
        if (error) throw error
        const rows = (data ?? []) as typeof data
        rowCount = rows.length
        csv = toCsv(
          ['Event', 'Trees', 'Hours', 'Rubbish (kg)', 'Area Restored (m2)', 'Native Plants', 'Wildlife Sightings', 'Invasive Weeds Pulled', 'Coastline Cleaned (m)', 'Date'],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rows.map((r: any) => [
            r.events?.title ?? r.event_id, r.trees_planted ?? 0,
            r.hours_total ?? 0, r.rubbish_kg ?? 0,
            r.area_restored_sqm ?? 0, r.native_plants ?? 0, r.wildlife_sightings ?? 0,
            r.invasive_weeds_pulled ?? 0, r.coastline_cleaned_m ?? 0, r.logged_at,
          ]),
        )
      } else if (exportId === 'survey') {
        const selectCols = collectiveFilter
          ? 'id, survey_id, event_id, user_id, answers, submitted_at, surveys(title, questions), events!inner(title, collective_id), profiles(display_name)'
          : 'id, survey_id, event_id, user_id, answers, submitted_at, surveys(title, questions), events(title), profiles(display_name)'
        let query = supabase
          .from('survey_responses')
          .select(selectCols)
          .order('submitted_at', { ascending: false })
          .limit(EXPORT_ROW_LIMIT)
        if (collectiveFilter) query = query.eq('events.collective_id', collectiveFilter)
        if (dateStart) query = query.gte('submitted_at', dateStart)
        if (dateEnd) query = query.lte('submitted_at', dateEnd + 'T23:59:59')
        const { data, error } = await query
        if (error) throw error
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const surveyData = (data ?? []) as any[]
        rowCount = surveyData.length

        // Map question IDs to their text from the survey definition. Wrap
        // per-row so one malformed questions blob can't abort the export.
        const questionMap = new Map<string, string>()
        for (const r of surveyData) {
          const rawQs = r.surveys?.questions
          let questions: unknown = rawQs
          if (typeof rawQs === 'string') {
            try { questions = JSON.parse(rawQs) } catch { continue }
          }
          if (Array.isArray(questions)) {
            for (const q of questions) {
              if (q.id && q.text && !questionMap.has(q.id)) {
                questionMap.set(q.id, q.text)
              }
            }
          }
        }

        const allKeys: string[] = []
        const seenKeys = new Set<string>()
        for (const key of questionMap.keys()) {
          seenKeys.add(key)
          allKeys.push(key)
        }
        for (const r of surveyData) {
          const answers = (r.answers && typeof r.answers === 'object') ? r.answers as Record<string, unknown> : {}
          for (const key of Object.keys(answers)) {
            if (!seenKeys.has(key)) {
              seenKeys.add(key)
              allKeys.push(key)
            }
          }
        }

        const questionHeaders = allKeys.map((k) => questionMap.get(k) ?? k)

        csv = toCsv(
          ['Response ID', 'Survey', 'Event', 'Respondent', ...questionHeaders, 'Submitted'],
          surveyData.map((r) => {
            const answers = (r.answers && typeof r.answers === 'object') ? r.answers as Record<string, unknown> : {}
            return [
              r.id,
              r.surveys?.title ?? r.survey_id,
              r.events?.title ?? r.event_id ?? '',
              r.profiles?.display_name ?? r.user_id,
              ...allKeys.map((k) => {
                const val = answers[k]
                if (val == null) return ''
                if (Array.isArray(val)) return val.join('; ')
                if (typeof val === 'boolean') return val ? 'Yes' : 'No'
                return String(val)
              }),
              r.submitted_at,
            ]
          }),
        )
      } else if (exportId === 'financial') {
        let query = supabase
          .from('donations')
          .select('id, amount_cents, currency, donor_name, donor_email, receipt_number, created_at')
          .order('created_at', { ascending: false })
          .limit(EXPORT_ROW_LIMIT)
        if (dateStart) query = query.gte('created_at', dateStart)
        if (dateEnd) query = query.lte('created_at', dateEnd + 'T23:59:59')
        const { data, error } = await query
        if (error) throw error
        const rows = data ?? []
        rowCount = rows.length
        csv = toCsv(
          ['ID', 'Amount', 'Currency', 'Donor Name', 'Donor Email', 'Receipt #', 'Date'],
          rows.map((r) => [
            r.id, ((r.amount_cents ?? 0) / 100).toFixed(2), r.currency ?? 'AUD',
            r.donor_name, r.donor_email, r.receipt_number, r.created_at,
          ]),
        )
      } else if (exportId === 'orders') {
        let query = supabase
          .from('merch_orders')
          .select('id, status, total_cents, shipping_name, shipping_address, shipping_city, shipping_state, shipping_postcode, created_at')
          .order('created_at', { ascending: false })
          .limit(EXPORT_ROW_LIMIT)
        if (dateStart) query = query.gte('created_at', dateStart)
        if (dateEnd) query = query.lte('created_at', dateEnd + 'T23:59:59')
        const { data, error } = await query
        if (error) throw error
        const rows = data ?? []
        rowCount = rows.length
        csv = toCsv(
          ['Order ID', 'Status', 'Total', 'Name', 'Address', 'City', 'State', 'Postcode', 'Date'],
          rows.map((r) => [
            r.id, r.status, ((r.total_cents ?? 0) / 100).toFixed(2),
            r.shipping_name, r.shipping_address, r.shipping_city,
            r.shipping_state, r.shipping_postcode, r.created_at,
          ]),
        )
      } else if (exportId === 'reconciliation') {
        let query = supabase
          .from('payments')
          .select('id, stripe_payment_id, amount_cents, status, type, created_at')
          .order('created_at', { ascending: false })
          .limit(EXPORT_ROW_LIMIT)
        if (dateStart) query = query.gte('created_at', dateStart)
        if (dateEnd) query = query.lte('created_at', dateEnd + 'T23:59:59')
        const { data, error } = await query
        if (error) throw error
        const rows = data ?? []
        rowCount = rows.length
        csv = toCsv(
          ['ID', 'Stripe Payment ID', 'Amount', 'Status', 'Type', 'Date'],
          rows.map((r) => [
            r.id, r.stripe_payment_id, ((r.amount_cents ?? 0) / 100).toFixed(2),
            r.status, r.type, r.created_at,
          ]),
        )
      } else if (exportId === 'gst') {
        let query = supabase
          .from('merch_orders')
          .select('id, total_cents, gst_cents, status, created_at')
          .eq('status', 'delivered')
          .order('created_at', { ascending: false })
          .limit(EXPORT_ROW_LIMIT)
        if (dateStart) query = query.gte('created_at', dateStart)
        if (dateEnd) query = query.lte('created_at', dateEnd + 'T23:59:59')
        const { data, error } = await query
        if (error) throw error
        const rows = data ?? []
        rowCount = rows.length
        csv = toCsv(
          ['Order ID', 'Total (ex GST)', 'GST', 'Total (inc GST)', 'Date'],
          rows.map((r) => {
            const gst = (r.gst_cents ?? 0) / 100
            const total = (r.total_cents ?? 0) / 100
            return [r.id, (total - gst).toFixed(2), gst.toFixed(2), total.toFixed(2), r.created_at]
          }),
        )
      } else if (exportId === 'donation-tax') {
        let query = supabase
          .from('donations')
          .select('donor_name, donor_email, amount_cents, receipt_number, created_at')
          .order('donor_email')
          .limit(EXPORT_ROW_LIMIT)
        if (dateStart) query = query.gte('created_at', dateStart)
        if (dateEnd) query = query.lte('created_at', dateEnd + 'T23:59:59')
        const { data, error } = await query
        if (error) throw error
        const rawRows = data ?? []
        rowCount = rawRows.length
        const byDonor: Record<string, { name: string; email: string; total: number; count: number }> = {}
        for (const d of rawRows) {
          const key = d.donor_email ?? 'unknown'
          if (!byDonor[key]) byDonor[key] = { name: d.donor_name ?? '', email: key, total: 0, count: 0 }
          byDonor[key].total += (d.amount_cents ?? 0)
          byDonor[key].count++
        }
        csv = toCsv(
          ['Donor Name', 'Email', 'Total Donated', 'Donation Count'],
          Object.values(byDonor).map((d) => [d.name, d.email, (d.total / 100).toFixed(2), d.count]),
        )
      }

      if (!csv) {
        toast.error('No data to export')
        return
      }

      if (rowCount === EXPORT_ROW_LIMIT) {
        setTruncationWarning(
          `Export truncated at ${EXPORT_ROW_LIMIT.toLocaleString()} rows. Apply a date range or scope to a collective to get complete data.`,
        )
      }

      downloadCsv(csv, fname)
      toast.success('Export downloaded')
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setGenerating(null)
    }
  }

  /* -------- Custom Report state -------- */
  const [reportType, setReportType] = useState<ReportType>('national')
  const [datePreset, setDatePreset] = useState('custom')
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(new Set(impactMetrics))
  const [customGenerating, setCustomGenerating] = useState(false)
  const [customError, setCustomError] = useState<string | null>(null)

  const toggleMetric = (metric: string) => {
    setSelectedMetrics((prev) => {
      const next = new Set(prev)
      if (next.has(metric)) next.delete(metric)
      else next.add(metric)
      return next
    })
  }

  // The report-type radio narrows scope and date semantics, so it actually
  // shapes the output now (previously it was cosmetic).
  const effectiveScope: 'national' | 'collective' =
    reportType === 'collective' ? 'collective'
    : reportType === 'national' || reportType === 'annual' || reportType === 'donor' ? 'national'
    : (scope === 'national' ? 'national' : 'collective')

  const effectiveCollective = effectiveScope === 'collective'
    ? (reportType === 'collective' ? (scope !== 'national' ? scope : '') : (collectiveFilter ?? ''))
    : ''

  // For annual + donor types, force "this-year" / "last-fy" semantics if the
  // user hasn't picked a preset that already implies a year.
  const effectivePreset = reportType === 'annual' && datePreset === 'custom' && !dateStart && !dateEnd
    ? 'this-year'
    : datePreset

  const generateCustom = async (format: 'pdf' | 'csv') => {
    if (selectedMetrics.size === 0 && reportType !== 'donor' && reportType !== 'annual') {
      toast.error('Pick at least one metric')
      return
    }
    if (reportType === 'collective' && !effectiveCollective) {
      toast.error('Pick a collective in the Scope filter above')
      return
    }
    if (dateRangeError) {
      toast.error('Fix the date range first')
      return
    }

    setCustomGenerating(true)
    setCustomError(null)

    try {
      const dateRange = getDateRange(effectivePreset, dateStart, dateEnd)
      const dateLabel = `${dateRange.start.slice(0, 10)} to ${dateRange.end.slice(0, 10)}`

      let title = ''
      let headers: string[] = []
      let rows: string[][] = []

      if (reportType === 'event') {
        // Per-event detail table.
        const report = await fetchPerEventReport(
          selectedMetrics,
          dateRange,
          effectiveScope,
          effectiveCollective,
        )
        title = effectiveScope === 'collective'
          ? `Per-Event Report - ${collectives?.find((c) => c.id === effectiveCollective)?.name ?? 'Collective'}`
          : 'Per-Event Report - National'
        headers = report.headers
        rows = report.rows
      } else {
        // Summary metric table.
        const summary = await fetchSummaryMetrics(
          selectedMetrics,
          dateRange,
          effectiveScope,
          effectiveCollective,
        )
        let extraRows: { metric: string; value: string }[] = []

        if (reportType === 'annual') {
          // ACNC-style: tack on key non-impact totals.
          const { count: memberCount } = await supabase
            .from('profiles').select('id', { count: 'exact', head: true })
          const { data: donAgg } = await supabase
            .from('donations')
            .select('amount_cents, donor_email')
            .gte('created_at', dateRange.start)
            .lte('created_at', dateRange.end)
          const totalDon = (donAgg ?? []).reduce((s, d) => s + (d.amount_cents ?? 0), 0)
          const uniqueDonors = new Set((donAgg ?? []).map((d) => d.donor_email).filter(Boolean)).size
          extraRows = [
            { metric: 'Total Members (all time)', value: String(memberCount ?? 0) },
            { metric: 'Donations Received', value: `$${(totalDon / 100).toFixed(2)}` },
            { metric: 'Unique Donors', value: String(uniqueDonors) },
          ]
        } else if (reportType === 'donor') {
          // Donor impact: pair donations alongside impact achieved.
          const { data: donAgg } = await supabase
            .from('donations')
            .select('amount_cents, donor_email')
            .gte('created_at', dateRange.start)
            .lte('created_at', dateRange.end)
          const totalDon = (donAgg ?? []).reduce((s, d) => s + (d.amount_cents ?? 0), 0)
          const uniqueDonors = new Set((donAgg ?? []).map((d) => d.donor_email).filter(Boolean)).size
          extraRows = [
            { metric: 'Donations in Period', value: `$${(totalDon / 100).toFixed(2)}` },
            { metric: 'Unique Donors in Period', value: String(uniqueDonors) },
          ]
        }

        const titlePrefix =
          reportType === 'national'   ? 'National Impact'
          : reportType === 'collective' ? `Collective Impact - ${collectives?.find((c) => c.id === effectiveCollective)?.name ?? ''}`
          : reportType === 'annual'   ? 'Annual Charity Report'
          : 'Donor Impact'
        title = titlePrefix
        headers = ['Metric', 'Value']
        rows = [...summary, ...extraRows].map((r) => [r.metric, r.value])
      }

      const safeKind = reportType
      const filename = `co-exist-report-${safeKind}-${new Date().toISOString().slice(0, 10)}`

      if (format === 'csv') {
        downloadCsv(toCsv(headers, rows), `${filename}.csv`)
        toast.success('Report downloaded')
      } else {
        const opened = openPrintableTable(title, headers, rows, dateLabel)
        if (!opened) toast.error('Allow popups to open the PDF preview')
        else toast.success('PDF ready - use the Save as PDF button in the print preview')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate report'
      setCustomError(msg)
      toast.error(msg)
    } finally {
      setCustomGenerating(false)
    }
  }

  /* -------- Render -------- */
  return (
    <div>
      {embedded ? null : <ReportsPageHeader heroContent={heroStats} />}
      <motion.div className="space-y-6" variants={stagger} initial="hidden" animate="visible">
        {/* Tabs */}
        <motion.div variants={fadeUp} className="flex gap-2 border-b border-neutral-200">
          {canExport && (
            <TabButton active={tab === 'quick'} onClick={() => setTab('quick')} icon={<Download size={15} />} label="Quick Exports" />
          )}
          <TabButton active={tab === 'custom'} onClick={() => setTab('custom')} icon={<SlidersHorizontal size={15} />} label="Custom Report" />
        </motion.div>

        {/* Shared filter bar */}
        <motion.div variants={fadeUp} className="flex flex-col gap-3 p-4 bg-white rounded-xl shadow-sm">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 text-sm text-neutral-400 shrink-0">
              <Calendar size={16} />
              Filters:
            </div>
            <Input
              label="Start Date"
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="flex-1"
            />
            <Input
              label="End Date"
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              error={dateRangeError ?? undefined}
              className="flex-1"
            />
            <Dropdown
              options={scopeOptions}
              value={scope}
              onChange={setScope}
              label="Scope"
              className="w-52"
            />
          </div>
          {dateRangeError && (
            <p className="text-sm text-red-600 flex items-center gap-1.5">
              <AlertTriangle size={14} />
              {dateRangeError}
            </p>
          )}
        </motion.div>

        {/* Truncation warning (Quick Exports only) */}
        {truncationWarning && tab === 'quick' && (
          <motion.div
            variants={fadeUp}
            className="flex items-start gap-3 p-4 bg-warning-50 border border-warning-200 rounded-xl text-sm text-warning-800"
          >
            <AlertTriangle size={18} className="shrink-0 mt-0.5 text-warning-500" />
            <span>{truncationWarning}</span>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {tab === 'quick' && canExport ? (
            <motion.div key="quick" {...tabFade}>
              <StaggeredList className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {exportTypes.map((exp) => (
                  <StaggeredItem
                    key={exp.id}
                    className={cn(
                      'p-4 rounded-xl shadow-sm',
                      exp.color.split(' ')[0],
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'flex items-center justify-center w-10 h-10 rounded-lg shrink-0',
                          exp.color.split(' ')[0],
                          exp.color.split(' ')[1],
                        )}
                      >
                        {exp.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-heading text-sm font-semibold text-neutral-900">
                          {exp.title}
                        </h3>
                        <p className="text-xs text-neutral-400 mt-0.5">
                          {exp.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-3">
                      {exp.formats.map((format) => (
                        <Button
                          key={format}
                          variant="secondary"
                          size="sm"
                          icon={<Download size={14} />}
                          onClick={() => handleQuickExport(exp.id, format)}
                          loading={generating === exp.id}
                          disabled={!!dateRangeError}
                        >
                          {format.toUpperCase()}
                        </Button>
                      ))}
                    </div>
                  </StaggeredItem>
                ))}
              </StaggeredList>
            </motion.div>
          ) : (
            <motion.div key="custom" {...tabFade} className="space-y-6">
              {/* Report type */}
              <section>
                <h2 className="font-heading text-sm font-semibold text-neutral-900 mb-2">
                  Report Type
                </h2>
                <div className="space-y-2">
                  {reportTypes.map((rt) => (
                    <button
                      key={rt.value}
                      type="button"
                      onClick={() => setReportType(rt.value)}
                      className={cn(
                        'w-full flex items-start gap-3 p-3 rounded-xl text-left min-h-11',
                        'active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none',
                        reportType === rt.value
                          ? 'bg-white ring-1 ring-primary-300 shadow-sm'
                          : 'bg-white shadow-sm hover:bg-neutral-50',
                      )}
                    >
                      <div
                        className={cn(
                          'flex items-center justify-center w-5 h-5 rounded-full border-2 mt-0.5 shrink-0',
                          reportType === rt.value
                            ? 'border-primary-600 bg-primary-800'
                            : 'border-neutral-200',
                        )}
                      >
                        {reportType === rt.value && (
                          <Check size={12} className="text-white" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-neutral-900">{rt.label}</p>
                        <p className="text-xs text-neutral-500 mt-0.5">{rt.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
                {reportType === 'collective' && effectiveScope === 'collective' && !effectiveCollective && (
                  <p className="mt-2 text-xs text-warning-700 flex items-center gap-1.5">
                    <AlertTriangle size={12} />
                    Pick a collective in the Scope filter above to run a collective report.
                  </p>
                )}
              </section>

              {/* Date preset (optional shortcut over the date inputs) */}
              <section>
                <h2 className="font-heading text-sm font-semibold text-neutral-900 mb-2">
                  Date Preset
                </h2>
                <Dropdown
                  options={datePresets}
                  value={datePreset}
                  onChange={setDatePreset}
                />
                <p className="text-xs text-neutral-400 mt-1.5">
                  Custom uses the Start/End dates above. Presets override them.
                </p>
              </section>

              {/* Metric selector - only meaningful for impact reports */}
              {reportType !== 'donor' && reportType !== 'annual' && (
                <section>
                  <h2 className="font-heading text-sm font-semibold text-neutral-900 mb-2">
                    Metrics to Include
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {impactMetrics.map((metric) => (
                      <Chip
                        key={metric}
                        label={metric}
                        selected={selectedMetrics.has(metric)}
                        onSelect={() => toggleMetric(metric)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Generating state */}
              {customGenerating && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-neutral-50 border border-neutral-200">
                  <Loader2 size={18} className="text-primary-600 animate-spin" />
                  <div>
                    <p className="text-sm font-medium text-primary-900">Generating report&hellip;</p>
                    <p className="text-xs text-primary-600 mt-0.5">Querying data across selected metrics</p>
                  </div>
                </div>
              )}

              {/* Error */}
              {customError && !customGenerating && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200">
                  <p className="text-sm font-medium text-red-900">Report generation failed</p>
                  <p className="text-xs text-red-600 mt-0.5">{customError}</p>
                </div>
              )}

              {/* Generate buttons */}
              <div className="flex gap-3">
                <Button
                  variant="primary"
                  icon={<Download size={16} />}
                  onClick={() => generateCustom('pdf')}
                  loading={customGenerating}
                  disabled={!!dateRangeError}
                >
                  Generate PDF
                </Button>
                <Button
                  variant="secondary"
                  icon={<FileSpreadsheet size={16} />}
                  onClick={() => generateCustom('csv')}
                  loading={customGenerating}
                  disabled={!!dateRangeError}
                >
                  Download CSV
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

/* ================================================================== */
/*  Local components                                                   */
/* ================================================================== */

function TabButton({
  active, onClick, icon, label,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors',
        'border-b-2 -mb-px',
        active
          ? 'border-primary-600 text-primary-700'
          : 'border-transparent text-neutral-500 hover:text-neutral-700',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

