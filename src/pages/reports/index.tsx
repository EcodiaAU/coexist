import { useState, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
    Download, Loader2
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { useAdminHeader, useIsAdminLayout } from '@/components/admin-layout'
import { useLeaderHeader, useIsLeaderLayout } from '@/components/leader-layout'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Dropdown } from '@/components/dropdown'
import { Chip } from '@/components/chip'
import { buildReportHtml, openReportWindow, writeReportWindow } from '@/lib/print-report'
import { supabase } from '@/lib/supabase'
import { IMPACT_SELECT_COLUMNS, sumMetric, sumMetricWeighted, type EventHostShare } from '@/lib/impact-metrics'
import { fetchImpactRows } from '@/lib/impact-query'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

/* ------------------------------------------------------------------ */
/*  Types & constants                                                  */
/* ------------------------------------------------------------------ */

// Leader collective roles (collective-scoped tier). National scope + the
// cross-collective report is gated to admin/manager only (finding 340).
const LEADER_COLLECTIVE_ROLES = ['assist_leader', 'co_leader', 'leader']

const datePresets = [
  { value: 'this-month', label: 'This Month' },
  { value: 'this-quarter', label: 'This Quarter' },
  { value: 'this-year', label: 'This Year' },
  { value: 'last-fy', label: 'Last Financial Year' },
  { value: 'custom', label: 'Custom Range' },
]

const scopeOptions = [
  { value: 'national', label: 'National' },
  { value: 'state', label: 'By State/Region' },
  { value: 'collective', label: 'Specific Collective' },
]

/** Maps UI metric labels → DB column keys used in event_impact */
const METRIC_MAP: Record<string, { key: string; label: string; transform?: (v: number) => string }> = {
  'Event attendances':        { key: '__attendance', label: 'Event Attendances' },
  'Est. volunteer hours':     { key: 'hours_total', label: 'Est. Volunteer Hours' },
  'Trees planted':            { key: 'trees_planted', label: 'Trees Planted' },
  'Litter removed (tonnes)': { key: 'rubbish_kg', label: 'Litter Removed (tonnes)', transform: (v) => String(Math.round((v / 1000) * 100) / 100) },
  'Cleanup events held':      { key: '__cleanup_events', label: 'Cleanup Events Held' },
  'Number of collectives':    { key: '__collectives', label: 'Number of Collectives' },
  'Young adult leaders trained': { key: '__leaders', label: 'Young Adult Leaders Trained' },
}

const impactMetrics = Object.keys(METRIC_MAP)

/* ------------------------------------------------------------------ */
/*  Date range helpers                                                 */
/* ------------------------------------------------------------------ */

function getDateRange(preset: string, customStart: string, customEnd: string): { start: string; end: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  switch (preset) {
    case 'this-month':
      return {
        start: new Date(year, month, 1).toISOString(),
        end: new Date(year, month + 1, 0, 23, 59, 59).toISOString(),
      }
    case 'this-quarter': {
      const qStart = Math.floor(month / 3) * 3
      return {
        start: new Date(year, qStart, 1).toISOString(),
        end: new Date(year, qStart + 3, 0, 23, 59, 59).toISOString(),
      }
    }
    case 'this-year':
      return {
        start: new Date(year, 0, 1).toISOString(),
        end: new Date(year, 11, 31, 23, 59, 59).toISOString(),
      }
    case 'last-fy':
      // Australian financial year: 1 Jul - 30 Jun
      // If before July, last FY = (year-2)/(year-1). If July+, last FY = (year-1)/year
      if (month < 6) {
        return {
          start: new Date(year - 2, 6, 1).toISOString(),
          end: new Date(year - 1, 5, 30, 23, 59, 59).toISOString(),
        }
      }
      return {
        start: new Date(year - 1, 6, 1).toISOString(),
        end: new Date(year, 5, 30, 23, 59, 59).toISOString(),
      }
    case 'custom':
      return {
        start: customStart ? new Date(customStart).toISOString() : new Date(year, 0, 1).toISOString(),
        end: customEnd ? new Date(customEnd + 'T23:59:59').toISOString() : now.toISOString(),
      }
    default:
      return { start: new Date(year, 0, 1).toISOString(), end: now.toISOString() }
  }
}


/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

function useCollectivesList() {
  return useQuery({
    queryKey: ['collectives-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collectives')
        .select('id, name')
        .order('name')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Report data fetcher                                                */
/* ------------------------------------------------------------------ */

async function fetchReportData(
  selectedMetrics: Set<string>,
  dateRange: { start: string; end: string },
  scope: string,
  selectedCollective: string,
): Promise<{ metric: string; value: string }[]> {
  const results: { metric: string; value: string }[] = []

  // Fetch impact rows if any impact-related metrics are selected
  const impactKeys = Array.from(selectedMetrics).filter(
    (m) => METRIC_MAP[m] && !METRIC_MAP[m].key.startsWith('__'),
  )
  const needsImpact = impactKeys.length > 0

  // Fetch event_impact rows with date + scope filtering via joined events.
  //
  // Multi-host: for collective scope we resolve via event_hosts (so co-hosted
  // events count) and apply share weighting at sum time. National scope keeps
  // the direct events join - every event counts once.
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
      // Trim events that started after dateRange.end (fetchImpactRows only
      // applies the lower bound).
      if (result.eventIds.length > 0) {
        const { data: dateRows } = await supabase
          .from('events')
          .select('id, date_start')
          .in('id', result.eventIds)
          .gt('date_start', dateRange.end)
        const tooLate = new Set((dateRows ?? []).map((r) => r.id))
        impactRows = result.rows.filter(
          (r) => !tooLate.has(r.event_id as string),
        )
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

  // Process each selected metric
  for (const metricLabel of selectedMetrics) {
    const def = METRIC_MAP[metricLabel]
    if (!def) continue

    if (def.key === '__attendance') {
      // Count attended registrations in date range. For collective scope we
      // first resolve the events (including co-hosted) via a two-step:
      // event_hosts → event ids → events table for date filtering.
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
      // Standard impact column - aggregate from fetched rows. For collective
      // scope, weight by host share so co-hosted events split fairly across
      // collectives. National scope sums every row once (unweighted).
      const raw = scope === 'collective' && selectedCollective
        ? sumMetricWeighted(impactRows, def.key, shareByEventId)
        : sumMetric(impactRows, def.key)
      const formatted = def.transform ? def.transform(raw) : String(Math.round(raw))
      results.push({ metric: def.label, value: formatted })
    }
  }

  return results
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ReportsPage() {
  const isAdminLayout = useIsAdminLayout()
  const isLeaderLayout = useIsLeaderLayout()
  useAdminHeader('Reports')
  useLeaderHeader('Reports')
  const shouldReduceMotion = useReducedMotion()
  const { isAdmin, isManager, collectiveRoles } = useAuth()
  // National tier (admin/manager) gets national + cross-collective scope; a
  // plain leader (assist_leader/co_leader/leader) is scoped to their own
  // collective(s) only - the Reports page used to default National and list
  // every collective to any leader (finding 340).
  const isNationalTier = isAdmin || isManager

  const [datePreset, setDatePreset] = useState('this-month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [scope, setScope] = useState(isNationalTier ? 'national' : 'collective')
  const [selectedCollective, setSelectedCollective] = useState('')
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(
    new Set(impactMetrics),
  )
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const { data: allCollectives } = useCollectivesList()

  // Own leader-tier collective ids (empty for admin/manager, who see all).
  const ownCollectiveIds = useMemo(
    () =>
      collectiveRoles
        .filter((m) => LEADER_COLLECTIVE_ROLES.includes(m.role))
        .map((m) => m.collective_id),
    [collectiveRoles],
  )

  // Collectives offered in the picker: all for national tier, own-only leader.
  const collectives = useMemo(() => {
    if (isNationalTier) return allCollectives ?? []
    const own = new Set(ownCollectiveIds)
    return (allCollectives ?? []).filter((c) => own.has(c.id))
  }, [allCollectives, isNationalTier, ownCollectiveIds])

  // Scope choices: national tier gets national/state/collective; a plain leader
  // can only report on their own collective.
  const scopeChoices = isNationalTier
    ? scopeOptions
    : scopeOptions.filter((o) => o.value === 'collective')

  // Effective scope/collective (derived, not effect-synced): a plain leader is
  // always collective-scoped and auto-targets their first collective; national
  // tier uses whatever scope they picked.
  const effectiveScope = isNationalTier ? scope : 'collective'
  const effectiveCollective =
    !selectedCollective && collectives.length > 0 ? collectives[0].id : selectedCollective

  const toggleMetric = (metric: string) => {
    setSelectedMetrics((prev) => {
      const next = new Set(prev)
      if (next.has(metric)) next.delete(metric)
      else next.add(metric)
      return next
    })
  }

  const generateReport = async (format: 'pdf' | 'csv') => {
    if (selectedMetrics.size === 0) return
    // For PDF, open the tab synchronously inside the click so the browser does
    // not block the popup; we write the document once the data resolves.
    let printWindow: Window | null = null
    if (format === 'pdf') {
      printWindow = openReportWindow()
      if (!printWindow) {
        setGenerateError('Allow pop-ups for this site to export the PDF.')
        return
      }
    }
    setGenerating(true)
    setGenerateError(null)

    try {
      const dateRange = getDateRange(datePreset, customStart, customEnd)
      const rows = await fetchReportData(selectedMetrics, dateRange, effectiveScope, effectiveCollective)

      if (format === 'csv') {
        const csvLines = ['Metric,Value']
        for (const r of rows) {
          // Escape any commas in metric names
          const safe = r.metric.includes(',') ? `"${r.metric}"` : r.metric
          csvLines.push(`${safe},${r.value}`)
        }
        const csv = csvLines.join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `co-exist-impact-report-${effectiveScope}-${datePreset}.csv`
        a.click()
        URL.revokeObjectURL(url)
      } else {
        const scopeLabel =
          effectiveScope === 'collective'
            ? collectives.find((c) => c.id === effectiveCollective)?.name ?? 'Collective'
            : effectiveScope === 'state'
              ? 'By state / region'
              : 'National'
        const presetLabel = datePresets.find((p) => p.value === datePreset)?.label ?? datePreset
        const html = buildReportHtml({
          title: 'Co-Exist Impact Report',
          meta: [
            `Scope: ${scopeLabel}`,
            `Period: ${presetLabel}`,
            `Generated: ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`,
          ],
          sections: [{ rows: rows.map((r) => ({ label: r.metric, value: r.value })) }],
        })
        writeReportWindow(printWindow, html)
      }
    } catch (err) {
      printWindow?.close()
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  const content = (
      <motion.div
        className="py-4 space-y-4 pb-8"
        variants={shouldReduceMotion ? undefined : stagger}
        initial="hidden"
        animate="visible"
      >
        <div className="space-y-6">
          {/* Date range */}
          <motion.section variants={fadeUp}>
            <h2 className="font-heading text-sm font-semibold text-neutral-900 mb-2">
              Date Range
            </h2>
            <Dropdown
              options={datePresets}
              value={datePreset}
              onChange={setDatePreset}
            />
            {datePreset === 'custom' && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Input
                  label="Start Date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  placeholder="YYYY-MM-DD"
                />
                <Input
                  label="End Date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  placeholder="YYYY-MM-DD"
                />
              </div>
            )}
          </motion.section>

          {/* Scope */}
          <motion.section variants={fadeUp}>
            <h2 className="font-heading text-sm font-semibold text-neutral-900 mb-2">
              Scope
            </h2>
            {isNationalTier && (
              <Dropdown
                options={scopeChoices}
                value={scope}
                onChange={setScope}
              />
            )}
            {effectiveScope === 'collective' && collectives.length > 0 && (
              <Dropdown
                options={collectives.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
                value={effectiveCollective}
                onChange={setSelectedCollective}
                placeholder="Select collective..."
                className={isNationalTier ? 'mt-3' : ''}
              />
            )}
            {!isNationalTier && (
              <p className="text-xs text-neutral-500 mt-2">
                Scoped to your collective{collectives.length > 1 ? 's' : ''}.
              </p>
            )}
          </motion.section>

          {/* Metric selector */}
          <motion.section variants={fadeUp}>
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
          </motion.section>

          {/* Generating state */}
          {generating && (
            <motion.div
              variants={fadeUp}
              className="flex items-center gap-3 p-4 rounded-sm bg-neutral-50 border border-neutral-200"
            >
              <Loader2 size={18} className="text-primary-600 animate-spin" />
              <div>
                <p className="text-sm font-medium text-primary-900">Generating report…</p>
                <p className="text-xs text-primary-600 mt-0.5">Querying impact data across selected metrics</p>
              </div>
            </motion.div>
          )}

          {/* Error state */}
          {generateError && !generating && (
            <motion.div
              variants={fadeUp}
              className="p-4 rounded-sm bg-error-50 border border-error-200"
            >
              <p className="text-sm font-medium text-error-900">Report generation failed</p>
              <p className="text-xs text-error-600 mt-0.5">{generateError}</p>
            </motion.div>
          )}

          {/* Export buttons */}
          <motion.div variants={fadeUp} className="flex gap-3">
            <Button
              variant="primary"
              icon={<Download size={16} />}
              onClick={() => generateReport('pdf')}
              loading={generating}
              disabled={selectedMetrics.size === 0}
            >
              Export PDF
            </Button>
            <Button
              variant="secondary"
              icon={<Download size={16} />}
              onClick={() => generateReport('csv')}
              loading={generating}
              disabled={selectedMetrics.size === 0}
            >
              Export CSV
            </Button>
          </motion.div>
        </div>
      </motion.div>
  )

  if (isAdminLayout || isLeaderLayout) return content

  return (
    <Page swipeBack header={<Header title="Impact Reports" back />}>
      {content}
    </Page>
  )
}
