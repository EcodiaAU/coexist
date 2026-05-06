import { useState, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
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
} from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { AdminHeroStat, AdminHeroStatRow } from '@/components/admin-hero-stat'
import { Button } from '@/components/button'
import { Dropdown } from '@/components/dropdown'
import { Input } from '@/components/input'
import { StaggeredList, StaggeredItem } from '@/components/scroll-reveal'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { useCollectives } from '@/hooks/use-collective'

/* ------------------------------------------------------------------ */
/*  Export types                                                       */
/* ------------------------------------------------------------------ */

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
    title: 'Impact Report (Branded)',
    description: 'Branded template with charts and summary stats',
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


/* ------------------------------------------------------------------ */
/*  CSV helpers                                                        */
/* ------------------------------------------------------------------ */

function escapeCsv(val: unknown): string {
  const s = String(val ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n')
}

/** Safety limit for browser-side CSV exports to prevent OOM */
const EXPORT_ROW_LIMIT = 10_000

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminExportsPage() {
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [scope, setScope] = useState('national')
  const [generating, setGenerating] = useState<string | null>(null)
  const [truncationWarning, setTruncationWarning] = useState<string | null>(null)
  const { toast } = useToast()

  const { data: collectives } = useCollectives()
  const scopeOptions = useMemo(() => [
    { value: 'national', label: 'National' },
    ...((collectives ?? []).map((c) => ({ value: c.id, label: c.name }))),
  ], [collectives])

  // Date range validation
  const dateRangeError = dateStart && dateEnd && dateEnd < dateStart
    ? 'End date must be on or after start date'
    : null

  const heroStats = useMemo(() => (
    <AdminHeroStatRow>
      <AdminHeroStat value={exportTypes.length} label="Available Exports" icon={<Download size={18} />} color="info" delay={0} reducedMotion={false} />
    </AdminHeroStatRow>
  ), [])

  useAdminHeader('Export Centre', { heroContent: heroStats })

  /** The selected collective ID - 'national' means no scope filter */
  const collectiveFilter = scope !== 'national' ? scope : null

  const handleExport = async (exportId: string, format: 'csv' | 'pdf') => {
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
          // Revoke after the window has had time to load
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
          // Scope to collective via collective_members join
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

        // Build question ID → text map from survey definitions.
        // Wrapped in try/catch per row: one malformed questions blob shouldn't
        // abort the whole export - just skip that row's question labels.
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

        // Collect all unique answer keys across all responses (preserves order from questionMap first)
        const allKeys: string[] = []
        const seenKeys = new Set<string>()
        // Add keys in question-definition order first
        for (const key of questionMap.keys()) {
          seenKeys.add(key)
          allKeys.push(key)
        }
        // Then any extra keys found in answers but not in question definitions
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
        // Group by donor
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

      // Check for truncation
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

  const shouldReduceMotion = useReducedMotion()
  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  return (
    <div>
      <motion.div className="space-y-6" variants={stagger} initial="hidden" animate="visible">
        {/* Filters */}
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

        {/* Truncation warning */}
        {truncationWarning && (
          <motion.div
            variants={fadeUp}
            className="flex items-start gap-3 p-4 bg-warning-50 border border-warning-200 rounded-xl text-sm text-warning-800"
          >
            <AlertTriangle size={18} className="shrink-0 mt-0.5 text-warning-500" />
            <span>{truncationWarning}</span>
          </motion.div>
        )}

        {/* Export cards */}
        <motion.div variants={fadeUp}>
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
                    onClick={() => handleExport(exp.id, format)}
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
      </motion.div>
    </div>
  )
}
