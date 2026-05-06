import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
    TreePine,
    Trash2,
    Sprout,
    CalendarDays,
    Users,
    MapPin,
    Download,
    Share2,
    Trophy,
    GraduationCap,
    Globe,
    Sparkles,
    Waves,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { useAdminHeader, useIsAdminLayout } from '@/components/admin-layout'
import { CountUp } from '@/components/count-up'
import { Button } from '@/components/button'
import { EmptyState } from '@/components/empty-state'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useNationalImpact, useNationalCustomMetrics } from '@/hooks/use-impact'
import { useImpactMetricDefs } from '@/hooks/use-impact-metric-defs'
import { supabase } from '@/lib/supabase'
import { parseLocationPoint } from '@/lib/geo'
import { MapView } from '@/components'
import type { MapMarker } from '@/components'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

/* ------------------------------------------------------------------ */
/*  Extra data hooks (not canonical metrics)                           */
/* ------------------------------------------------------------------ */

function useTopCollectives() {
  return useQuery({
    queryKey: ['top-collectives'],
    queryFn: async () => {
      const { data: events } = await supabase
        .from('events')
        .select('collective_id')

      if (!events?.length) return []

      const countMap = new Map<string, number>()
      for (const e of events) {
        countMap.set(e.collective_id, (countMap.get(e.collective_id) ?? 0) + 1)
      }

      const topIds = [...countMap.entries()]
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([id]) => id)

      const { data: collectives } = await supabase
        .from('collectives')
        .select('id, name')
        .in('id', topIds)

      return (collectives ?? [])
        .map((c) => ({ ...c, eventCount: countMap.get(c.id) ?? 0 }))
        .sort((a, b) => b.eventCount - a.eventCount)
    },
    staleTime: 5 * 60 * 1000,
  })
}

function useEventMapPoints() {
  return useQuery({
    queryKey: ['national-event-points'],
    queryFn: async () => {
      const { data } = await supabase
        .from('events')
        .select('id, title, location_point, activity_type')
        .not('location_point', 'is', null)
        .limit(200)
      return (data ?? [])
        .map((e): MapMarker | null => {
          const pos = parseLocationPoint(e.location_point)
          if (!pos) return null
          return { id: e.id, position: pos, variant: 'event', label: e.title }
        })
        .filter((m): m is MapMarker => m !== null)
    },
    staleTime: 10 * 60 * 1000,
  })
}

function useTrends() {
  return useQuery({
    queryKey: ['national-impact-trends'],
    queryFn: async () => {
      const now = new Date()
      const rangeStart = new Date(now.getFullYear(), now.getMonth() - 5, 1)

      const { data } = await supabase
        .from('event_impact')
        .select('hours_total, logged_at')
        .gte('logged_at', rangeStart.toISOString())
        .lt('logged_at', now.toISOString())

      const buckets = new Map<string, number>()
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        buckets.set(`${d.getFullYear()}-${d.getMonth()}`, 0)
      }

      for (const row of data ?? []) {
        if (!row.logged_at) continue
        const d = new Date(row.logged_at)
        const key = `${d.getFullYear()}-${d.getMonth()}`
        if (buckets.has(key)) {
          buckets.set(key, buckets.get(key)! + (row.hours_total ?? 0))
        }
      }

      return [...buckets.entries()].map(([key, hours]) => {
        const [year, month] = key.split('-').map(Number)
        return {
          month: new Date(year, month, 1).toLocaleDateString('en-AU', { month: 'short' }),
          impact: Math.round(hours),
        }
      })
    },
    staleTime: 10 * 60 * 1000,
  })
}

function useByActivity() {
  return useQuery({
    queryKey: ['national-by-activity'],
    queryFn: async () => {
      const { data } = await supabase
        .from('events')
        .select('activity_type, collectives(state)')
        .lt('date_start', new Date().toISOString())
        .limit(2000)

      const events = (data ?? []) as { activity_type?: string; collectives?: { state?: string } | null }[]

      const byActivity: Record<string, number> = {}
      const byState: Record<string, number> = {}

      for (const ev of events) {
        const type = ev.activity_type ?? 'Other'
        byActivity[type] = (byActivity[type] ?? 0) + 1
        const state = ev.collectives?.state ?? 'Unknown'
        byState[state] = (byState[state] ?? 0) + 1
      }

      return {
        byActivity: Object.entries(byActivity).sort(([, a], [, b]) => b - a).slice(0, 8),
        byState: Object.entries(byState).sort(([, a], [, b]) => b - a),
      }
    },
    staleTime: 5 * 60 * 1000,
  })
}


/* ------------------------------------------------------------------ */
/*  Section heading                                                    */
/* ------------------------------------------------------------------ */

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-400 font-extrabold mb-5 flex items-center gap-2">
      <span className="h-0.5 w-4 rounded-full bg-neutral-300/50" />
      {children}
    </p>
  )
}

/* ------------------------------------------------------------------ */
/*  Stat card configs                                                  */
/* ------------------------------------------------------------------ */

const STAT_STYLES: Record<string, { iconBg: string; iconColor: string }> = {
  hours:       { iconBg: 'bg-primary-50', iconColor: 'text-primary-600' },
  rubbish:     { iconBg: 'bg-moss-50', iconColor: 'text-moss-600' },
  cleanups:    { iconBg: 'bg-sky-50', iconColor: 'text-sky-600' },
  weeds:       { iconBg: 'bg-plum-50', iconColor: 'text-plum-600' },
  events:      { iconBg: 'bg-plum-50', iconColor: 'text-plum-600' },
  members:     { iconBg: 'bg-primary-50', iconColor: 'text-primary-600' },
  collectives: { iconBg: 'bg-bark-50', iconColor: 'text-bark-600' },
  leaders:     { iconBg: 'bg-bark-50', iconColor: 'text-bark-600' },
  coastline:   { iconBg: 'bg-sky-50', iconColor: 'text-sky-600' },
}

/* ------------------------------------------------------------------ */
/*  Big counter                                                        */
/* ------------------------------------------------------------------ */

function NationalStat({
  icon,
  value,
  suffix,
  label,
  style,
  delay,
}: {
  icon: React.ReactNode
  value: number
  suffix?: string
  label: string
  style: string
  delay: number
}) {
  const shouldReduceMotion = useReducedMotion()
  const cfg = STAT_STYLES[style] ?? STAT_STYLES.hours

  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: 'easeOut' }}
      className="flex flex-col items-center justify-center text-center rounded-3xl p-6 pb-8 min-h-[150px] bg-white border border-neutral-100 shadow-sm"
    >
      <div className={cn('mb-4 flex items-center justify-center w-11 h-11 rounded-2xl', cfg.iconBg, cfg.iconColor)} aria-hidden="true">
        {icon}
      </div>
      <div className="font-heading text-4xl font-extrabold text-neutral-900 tabular-nums leading-none">
        <CountUp end={value} duration={2000} suffix={suffix} />
      </div>
      <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-500 font-bold mt-2.5">{label}</p>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Activity type colors                                               */
/* ------------------------------------------------------------------ */

const ACTIVITY_BAR_COLORS: Record<string, string> = {
  clean_up: 'bg-sky-500',
  tree_planting: 'bg-primary-600',
  ecosystem_restoration: 'bg-sprout-500',
  nature_hike: 'bg-primary-500',
  camp_out: 'bg-moss-600',
  spotlighting: 'bg-indigo-500',
  other: 'bg-neutral-500',
}

/* ------------------------------------------------------------------ */
/*  Podium medal colors                                                */
/* ------------------------------------------------------------------ */

const MEDAL_STYLES = [
  'bg-warning-50 text-warning-700 shadow-sm',
  'bg-neutral-100 text-neutral-600 shadow-sm',
  'bg-bark-50 text-bark-700 shadow-sm',
]

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function NationalImpactPage() {
  const isAdmin = useIsAdminLayout()
  useAdminHeader('Impact')
  const shouldReduceMotion = useReducedMotion()
  const { toast } = useToast()

  const [timeRange, setTimeRange] = useState<'all-time' | 'current-year'>('all-time')
  const { data, isLoading, isError } = useNationalImpact(timeRange)
  const showLoading = useDelayedLoading(isLoading)
  const { data: topCollectives } = useTopCollectives()
  const { data: trends } = useTrends()
  const { data: eventMapPoints } = useEventMapPoints()
  const { data: breakdown } = useByActivity()
  const { data: customMetrics } = useNationalCustomMetrics(5)
  const { metricLabels, metricByKey } = useImpactMetricDefs()

  if (showLoading) {
    const skeleton = (
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="h-36 rounded-3xl bg-neutral-100 animate-pulse" />
            <div className="h-36 rounded-3xl bg-neutral-100 animate-pulse" />
            <div className="h-36 rounded-3xl bg-neutral-100 animate-pulse" />
            <div className="h-36 rounded-3xl bg-neutral-100 animate-pulse" />
          </div>
          <div className="h-64 rounded-3xl bg-neutral-100 animate-pulse" />
        </div>
    )
    if (isAdmin) return skeleton
    return (
      <Page swipeBack header={<Header title="National Impact" back />}>
        {skeleton}
      </Page>
    )
  }

  if (isError) {
    const errorContent = (
      <EmptyState
        illustration="error"
        title="Failed to load impact data"
        description="Something went wrong loading the national impact data. This page is used for stakeholder reporting - please try again or contact support."
        action={{ label: 'Retry', onClick: () => window.location.reload() }}
      />
    )
    if (isAdmin) return errorContent
    return (
      <Page swipeBack header={<Header title="National Impact" back />}>
        {errorContent}
      </Page>
    )
  }

  const exportPDF = () => {
    alert('PDF export will be generated via Edge Function with branded Co-Exist template')
  }

  const shareLink = async () => {
    const parts: string[] = []
    if (data?.eventsAttended) parts.push(`${data.eventsAttended.toLocaleString()} event attendances`)
    if (data?.volunteerHours) parts.push(`${data.volunteerHours.toLocaleString()} est. volunteer hours`)
    if (data?.treesPlanted) parts.push(`${data.treesPlanted.toLocaleString()} trees planted`)
    if (data?.invasiveWeedsPulled) parts.push(`${data.invasiveWeedsPulled.toLocaleString()} invasive weeds pulled`)
    if (data?.rubbishCollectedKg) parts.push(`${data.rubbishCollectedKg}kg litter removed`)
    if (data?.cleanupSites) parts.push(`${data.cleanupSites} cleanup sites`)
    if (data?.coastlineCleanedM) parts.push(`${data.coastlineCleanedM}m coastline cleaned`)
    if (data?.leadersEmpowered) parts.push(`${data.leadersEmpowered} leaders empowered`)
    const text = parts.join(', ') + '!'
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Co-Exist National Impact', text, url })
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        try {
          await navigator.clipboard.writeText(`${text} ${url}`)
          toast.success('Copied to clipboard')
        } catch {
          toast.error('Could not share')
        }
      }
      return
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Could not copy')
    }
  }

  const content = (
      <motion.div
        className="pb-12"
        variants={shouldReduceMotion ? undefined : stagger}
        initial="hidden"
        animate="visible"
      >

        {/* ─── Time range toggle ─── */}
        <motion.div variants={fadeUp} className="px-5 pt-4 pb-2 flex justify-end">
          <div className="flex rounded-lg bg-neutral-100 p-0.5">
            <button
              type="button"
              onClick={() => setTimeRange('all-time')}
              className={cn(
                'px-3.5 min-h-11 rounded-md text-sm font-semibold transition-transform active:scale-[0.95] cursor-pointer select-none',
                timeRange === 'all-time'
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-600',
              )}
            >
              All Time
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('current-year')}
              className={cn(
                'px-3.5 min-h-11 rounded-md text-sm font-semibold transition-transform active:scale-[0.95] cursor-pointer select-none',
                timeRange === 'current-year'
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-600',
              )}
            >
              {new Date().getFullYear()}
            </button>
          </div>
        </motion.div>

        {/* ─── Hero: Community Events ─── */}
        <motion.div
          variants={fadeUp}
          className="px-5 pb-2"
        >
          <div className="rounded-3xl bg-white border border-neutral-100 shadow-sm p-7 overflow-hidden">
            <div className="flex items-center gap-2 mb-5">
              <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-primary-50 text-primary-600">
                <Globe size={20} strokeWidth={2.5} />
              </div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-400 font-bold">
                Australia-Wide
              </p>
            </div>

            <div className="flex items-baseline gap-6">
              <div>
                <p className="font-heading text-6xl font-extrabold text-neutral-900 tabular-nums leading-none tracking-tight">
                  <CountUp end={data?.eventsAttended ?? 0} duration={2000} />
                </p>
                <p className="text-base text-neutral-500 font-semibold mt-2">event attendances</p>
              </div>
              <div className="border-l border-neutral-100 pl-6">
                <p className="font-heading text-4xl font-extrabold text-neutral-900 tabular-nums leading-none tracking-tight">
                  <CountUp end={data?.volunteerHours ?? 0} duration={2000} />
                </p>
                <p className="text-sm text-neutral-500 font-semibold mt-1">est. volunteer hours</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ─── Stats Grid: Canonical Metrics ─── */}
        <motion.div variants={fadeUp} className="px-5 mt-6 grid grid-cols-2 gap-4">
          {/* Land Restoration */}
          <NationalStat
            icon={<TreePine size={20} strokeWidth={2.5} />}
            value={data?.treesPlanted ?? 0}
            label="Trees Planted"
            style="events"
            delay={0.05}
          />
          {/* Cleanup Stats */}
          <NationalStat
            icon={<Trash2 size={20} strokeWidth={2.5} />}
            value={data?.rubbishCollectedKg ?? 0}
            suffix="kg"
            label="Litter Removed (kg)"
            style="rubbish"
            delay={0.1}
          />
          <NationalStat
            icon={<CalendarDays size={20} strokeWidth={2.5} />}
            value={data?.cleanupSites ?? 0}
            label="Cleanup Sites"
            style="cleanups"
            delay={0.15}
          />

          {/* Organisational */}
          <NationalStat
            icon={<MapPin size={20} strokeWidth={2.5} />}
            value={data?.collectivesCount ?? 0}
            label="Collectives"
            style="collectives"
            delay={0.25}
          />
          <NationalStat
            icon={<GraduationCap size={20} strokeWidth={2.5} />}
            value={data?.leadersEmpowered ?? 0}
            label="Leaders Empowered"
            style="leaders"
            delay={0.28}
          />
          <NationalStat
            icon={<Users size={20} strokeWidth={2.5} />}
            value={data?.totalMembers ?? 0}
            label="Active Members"
            style="members"
            delay={0.3}
          />
        </motion.div>

        {/* ─── Notable Custom Metrics ─── */}
        {customMetrics && customMetrics.length > 0 && (
          <motion.section variants={fadeUp} className="mx-5 mt-6">
            <SectionHeading>
              <Sparkles size={14} strokeWidth={2.5} className="text-primary-500" />
              Notable Custom Metrics
            </SectionHeading>
            <div className="grid grid-cols-2 gap-4">
              {customMetrics.map((cm, i) => (
                <NationalStat
                  key={cm.key}
                  icon={<Sparkles size={20} strokeWidth={2.5} />}
                  value={cm.total}
                  label={metricLabels[cm.key] ?? cm.key.replace(/_/g, ' ')}
                  suffix={metricByKey[cm.key]?.unit}
                  style="events"
                  delay={0.05 + i * 0.05}
                />
              ))}
            </div>
          </motion.section>
        )}

        {/* ─── Geographic Activity Map ─── */}
        <motion.section
          variants={fadeUp}
          className="mx-5 mt-10"
        >
          <SectionHeading>Geographic Activity</SectionHeading>
          <div className="rounded-3xl bg-white border border-neutral-100 shadow-sm p-5 overflow-hidden">
            <MapView
              center={{ lat: -28.0, lng: 134.0 }}
              zoom={4}
              markers={eventMapPoints ?? []}
              aria-label="National activity map showing event locations"
              className="h-72 rounded-2xl"
            />
          </div>
        </motion.section>

        {/* ─── Monthly Est. Volunteer Hours Trend ─── */}
        {trends && trends.length > 0 && (
          <motion.section
            variants={fadeUp}
            className="mx-5 mt-10"
          >
            <SectionHeading>Monthly Est. Volunteer Hours</SectionHeading>
            <div className="rounded-3xl bg-white border border-neutral-100 shadow-sm p-6">
              <div className="flex items-end gap-4 h-36">
                {trends.map((t, i) => {
                  const max = Math.max(...trends.map((tr) => tr.impact), 1)
                  const height = (t.impact / max) * 100
                  return (
                    <div key={t.month} className="flex-1 flex flex-col items-center gap-2">
                      <span className="text-[11px] text-neutral-900 tabular-nums font-bold">{t.impact === 0 ? '-' : t.impact}</span>
                      <motion.div
                        className="w-full rounded-xl bg-primary-500 min-h-[6px]"
                        initial={shouldReduceMotion ? { height: `${height}%` } : { height: 0 }}
                        animate={{ height: `${height}%` }}
                        transition={{ duration: 0.5, delay: i * 0.08, ease: 'easeOut' }}
                      />
                      <span className="text-[11px] text-neutral-500 font-bold">{t.month}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </motion.section>
        )}

        {/* ─── Breakdown by Activity ─── */}
        {breakdown?.byActivity && breakdown.byActivity.length > 0 && (
          <motion.section
            variants={fadeUp}
            className="mx-5 mt-10"
          >
            <SectionHeading>By Activity Type</SectionHeading>
            <div className="rounded-3xl bg-white border border-neutral-100 shadow-sm p-6 space-y-5">
              {breakdown.byActivity.map(([type, count]) => {
                const total = breakdown.byActivity.reduce((s, [, c]) => s + c, 0)
                const percent = total > 0 ? Math.round((count / total) * 100) : 0
                const barColor = ACTIVITY_BAR_COLORS[type] ?? 'bg-primary-500'
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-neutral-900 font-bold capitalize">{type.replace(/_/g, ' ')}</span>
                      <span className="text-neutral-500 tabular-nums text-xs font-bold">{count} ({percent}%)</span>
                    </div>
                    <div className="h-3 bg-neutral-100 rounded-full overflow-hidden">
                      <motion.div
                        className={cn('h-full rounded-full shadow-sm', barColor)}
                        initial={shouldReduceMotion ? { width: `${percent}%` } : { width: 0 }}
                        animate={{ width: `${percent}%` }}
                        transition={{ duration: 0.6, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.section>
        )}

        {/* ─── Breakdown by State ─── */}
        {breakdown?.byState && breakdown.byState.length > 0 && (
          <motion.section
            variants={fadeUp}
            className="mx-5 mt-10"
          >
            <SectionHeading>By State / Region</SectionHeading>
            <div className="rounded-3xl bg-white border border-neutral-100 shadow-sm p-6 space-y-1">
              {breakdown.byState.map(([state, count], i) => {
                const maxCount = breakdown.byState[0]?.[1] ?? 1
                const barWidth = Math.max((count / maxCount) * 100, 8)
                return (
                  <div
                    key={state}
                    className="flex items-center gap-4 py-3.5"
                  >
                    <span className="text-sm text-neutral-900 font-bold w-16 shrink-0">{state}</span>
                    <div className="flex-1 h-3 bg-neutral-100 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-400 shadow-sm"
                        initial={shouldReduceMotion ? { width: `${barWidth}%` } : { width: 0 }}
                        animate={{ width: `${barWidth}%` }}
                        transition={{ duration: 0.5, delay: 0.3 + i * 0.05, ease: 'easeOut' }}
                      />
                    </div>
                    <span className="text-sm font-extrabold text-neutral-900 tabular-nums w-10 text-right shrink-0">
                      {count}
                    </span>
                  </div>
                )
              })}
            </div>
          </motion.section>
        )}

        {/* ─── Top Collectives ─── */}
        {topCollectives && topCollectives.length > 0 && (
          <motion.section
            variants={fadeUp}
            className="mx-5 mt-10"
          >
            <SectionHeading>
              <Trophy size={14} strokeWidth={2.5} className="text-warning-500" />
              Top Collectives
            </SectionHeading>
            <div className="rounded-3xl bg-white border border-neutral-100 shadow-sm p-6 space-y-2">
              {topCollectives.map((c, i) => (
                <div
                  key={c.id}
                  className={cn(
                    'flex items-center gap-4 py-3.5 rounded-2xl px-3 transition-colors',
                    i === 0 && 'bg-warning-50/60',
                  )}
                >
                  <span
                    className={cn(
                      'flex items-center justify-center w-9 h-9 rounded-xl text-sm font-extrabold shrink-0',
                      i < 3
                        ? MEDAL_STYLES[i]
                        : 'bg-neutral-100 text-neutral-500 shadow-sm',
                    )}
                  >
                    {i + 1}
                  </span>
                  <p className="flex-1 min-w-0 text-sm font-bold text-neutral-900 truncate">
                    {c.name}
                  </p>
                  <span className="text-xs text-neutral-500 tabular-nums shrink-0 font-bold">
                    {c.eventCount} events
                  </span>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* ─── Export / Share ─── */}
        <motion.div variants={fadeUp} className="mx-5 mt-10 flex gap-3">
          <Button
            variant="primary"
            icon={<Download size={16} />}
            onClick={exportPDF}
          >
            Export PDF
          </Button>
          <Button
            variant="secondary"
            icon={<Share2 size={16} />}
            onClick={shareLink}
          >
            Share
          </Button>
        </motion.div>
      </motion.div>
  )

  if (isAdmin) return content

  return (
    <Page
      swipeBack
      header={
        <Header
          title="National Impact"
          back
        />
      }
    >
      {content}
    </Page>
  )
}
