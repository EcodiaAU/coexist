import { useState, useRef, useMemo } from 'react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { motion, useReducedMotion } from 'framer-motion'
import {
    Users,
    MapPin,
    CalendarDays,
    TreePine, Clock,
    Leaf,
    Eye,
    Globe,
    TrendingUp,
    ChevronRight,
    Trash2,
    BarChart3,
    Sparkles,
    ArrowUpRight,
    GraduationCap,
} from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { Dropdown } from '@/components/dropdown'
import { BentoStatCard, BentoStatGrid } from '@/components/bento-stats'
import type { BentoTheme } from '@/components/bento-stats-themes'
import { WaveTransition } from '@/components/wave-transition'
import { EmptyState } from '@/components/empty-state'
import { cn } from '@/lib/cn'
import { Link } from 'react-router-dom'
import { useParallaxLayers } from '@/hooks/use-parallax-scroll'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'
import {
    useAdminOverview,
    useTrendData,
    type TrendMonth,
    type DateRange,
    dateRangeOptions,
} from '@/hooks/use-admin-dashboard'
import { useCollectives } from '@/hooks/use-collective'


const scaleIn = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const } },
}

/* ------------------------------------------------------------------ */
/*  Parallax Hero                                                      */
/* ------------------------------------------------------------------ */

function AdminHero({
  rm,
}: {
  rm: boolean
}) {
  const { bgRef, fgRef, textRef } = useParallaxLayers({ withScale: false })

  return (
    <div className="relative">
      <div className="relative w-full h-[110vw] min-h-[480px] sm:h-auto overflow-hidden">
        {/* Layer 0: Background landscape - slowest parallax */}
        <div
          ref={rm ? undefined : bgRef}
          className="h-full will-change-transform"
        >
          <img
            src="/img/admin-hero-bg.webp"
            alt="Australian conservation landscape"
            className="w-full h-full object-cover object-center sm:h-auto sm:object-fill block"
          />
        </div>

        {/* Layer 1: Foreground elements - medium parallax */}
        <div
          ref={rm ? undefined : fgRef}
          className="absolute inset-0 z-[3] will-change-transform"
        >
          <img
            src="/img/admin-hero-fg.webp"
            alt="Conservation volunteers"
            className="w-full h-full object-cover object-center sm:h-auto sm:object-fill block"
          />
        </div>

        {/* Layer 2: Text overlay - above fg so dropdown is clickable */}
        <div
          ref={rm ? undefined : textRef}
          className="absolute inset-x-0 top-[15%] sm:top-[8%] z-[4] flex flex-col items-center px-6 will-change-transform"
        >
          <motion.div
            initial={rm ? undefined : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex flex-col items-center text-center"
          >
            <img
              src="/logos/white-wordmark.webp"
              alt="Co-Exist"
              className="h-24 sm:h-36"
              style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))' }}
            />
          </motion.div>
        </div>
      </div>

      {/* Wave divider */}
      <WaveTransition />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Section heading - editorial style                                  */
/* ------------------------------------------------------------------ */

function SectionHeader({
  children,
  action,
  icon,
  sub,
}: {
  children: React.ReactNode
  action?: { label: string; to: string }
  icon?: React.ReactNode
  sub?: string
}) {
  return (
    <div className="flex items-end justify-between mb-4">
      <div>
        <div className="flex items-center gap-2 mb-0.5">
          {icon && <span className="text-primary-500">{icon}</span>}
          <h2 className="font-heading text-lg sm:text-xl font-bold text-neutral-900 tracking-tight">
            {children}
          </h2>
        </div>
        {sub && <p className="text-xs text-neutral-400 font-medium">{sub}</p>}
      </div>
      {action && (
        <Link
          to={action.to}
          className="flex items-center gap-1 text-xs text-primary-600 font-semibold hover:text-primary-700 transition-colors duration-150 active:scale-[0.97] pb-0.5"
        >
          {action.label}
          <ArrowUpRight size={13} />
        </Link>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Bar chart - elevated style                                         */
/* ------------------------------------------------------------------ */

function TrendChart({
  data,
  dataKey,
  label,
  icon,
  accentFrom,
  accentTo,
}: {
  data: TrendMonth[]
  dataKey: string
  label: string
  icon: React.ReactNode
  accentFrom: string
  accentTo: string
}) {
  const shouldReduceMotion = useReducedMotion()
  const values = data.map((d) => (d[dataKey as keyof TrendMonth] as number) ?? 0)
  const max = Math.max(...values, 1)
  const total = values.reduce((a, b) => a + b, 0)
  const allZero = max <= 0 || total <= 0

  // Placeholder staircase when there's no data
  const placeholders = [35, 55, 42, 70, 48, 62]

  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="group relative overflow-hidden rounded-2xl bg-white border border-neutral-100 shadow-sm transition-colors duration-200 p-5 sm:p-6"
    >
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-neutral-50 group-hover:bg-neutral-100 transition-colors duration-200">
              {icon}
            </span>
            <div>
              <h3 className="font-heading text-sm font-bold text-neutral-900 tracking-tight">{label}</h3>
              <p className="text-xs text-neutral-400 font-medium mt-0.5">
                {allZero ? 'No data yet' : `${total.toLocaleString()} total`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 sm:gap-3 h-36 sm:h-44">
          {data.map((d, i) => {
            const val = (d[dataKey as keyof TrendMonth] as number) ?? 0
            const pct = allZero
              ? placeholders[i % placeholders.length]!
              : Math.round(Math.max((val / max) * 100, val > 0 ? 12 : 4))
            const isMax = !allZero && val === max && val > 0
            return (
              <div key={d.month} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                {/* Value label */}
                <span className={cn(
                  'text-[11px] sm:text-xs font-semibold tabular-nums',
                  allZero ? 'text-transparent' : isMax ? 'text-neutral-800' : 'text-neutral-400',
                )}>
                  {val > 0 ? val : '\u00A0'}
                </span>

                {/* Bar track - relative with defined flex-1 height so % children work */}
                <div className="relative w-full flex-1">
                  <motion.div
                    className="absolute bottom-0 left-[15%] right-[15%] rounded-lg"
                    style={{
                      background: allZero
                        ? 'var(--color-neutral-200)'
                        : `linear-gradient(to top, ${accentFrom}, ${accentTo})`,
                    }}
                    initial={shouldReduceMotion ? { height: `${pct}%` } : { height: '0%' }}
                    animate={{ height: `${pct}%` }}
                    transition={{ duration: 0.6, delay: i * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
                  />
                </div>

                {/* Month label */}
                <span className={cn(
                  'text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide',
                  isMax ? 'text-neutral-600' : 'text-neutral-300',
                )}>{d.month}</span>
              </div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Quick-link card                                                    */
/* ------------------------------------------------------------------ */

function QuickLink({
  to,
  label,
  sub,
  icon,
  accent,
}: {
  to: string
  label: string
  sub: string
  icon: React.ReactNode
  accent: string
}) {
  return (
    <Link
      to={to}
      className="group relative flex items-center gap-3.5 rounded-2xl bg-white border border-neutral-100 shadow-sm p-4 transition-all duration-200 active:scale-[0.98]"
    >
      <span className={cn(
        'flex items-center justify-center w-10 h-10 rounded-xl text-white shrink-0',
        accent,
      )}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-heading text-sm font-bold text-neutral-900 tracking-tight">{label}</p>
        <p className="text-xs text-neutral-400 font-medium truncate">{sub}</p>
      </div>
      <ChevronRight size={16} className="text-neutral-300 group-hover:text-neutral-500 transition-colors shrink-0" />
    </Link>
  )
}

/* ------------------------------------------------------------------ */
/*  Admin Dashboard Page                                               */
/* ------------------------------------------------------------------ */

export default function AdminDashboardPage() {
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const [collectiveId, setCollectiveId] = useState<string>('')
  const { data: collectivesData } = useCollectives({ includeNational: false })
  const { data, isLoading, isError } = useAdminOverview(dateRange, collectiveId || undefined)
  const showLoading = useDelayedLoading(isLoading)
  const { data: trends } = useTrendData()

  const collectiveOptions = useMemo(() => ([
    { value: '', label: 'All Collectives' },
    ...(collectivesData ?? []).map((c) => ({ value: c.id, label: c.name })),
  ]), [collectivesData])

  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion

  const impactRef = useRef<HTMLDivElement>(null)

  useAdminHeader('Dashboard', { fullBleed: true })

  if (showLoading) {
    return (
      <div className="relative min-h-dvh overflow-x-hidden">
        {/* Hero skeleton */}
        <div className="relative w-full aspect-[16/9] bg-neutral-200 animate-pulse overflow-hidden">
          <div className="absolute inset-x-0 top-[15%] flex flex-col items-center gap-3 px-6">
            <div className="h-3 w-28 rounded-full bg-white/20" />
            <div className="h-9 w-64 rounded-lg bg-white/15" />
            <div className="h-4 w-48 rounded-lg bg-white/10" />
          </div>
        </div>
        <div className="bg-white px-4 sm:px-6 lg:px-8 pt-8 space-y-6 pb-20">
          {/* Stat cards skeleton */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="col-span-2 h-36 rounded-2xl bg-neutral-50 animate-pulse" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 rounded-2xl bg-neutral-50 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>

          {/* Impact section skeleton */}
          <div className="space-y-3">
            <div className="h-5 w-40 rounded-lg bg-neutral-100 animate-pulse" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-neutral-50 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
              ))}
            </div>
          </div>

          {/* Trend charts skeleton */}
          <div className="space-y-3">
            <div className="h-5 w-32 rounded-lg bg-neutral-100 animate-pulse" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-56 rounded-2xl bg-neutral-50 animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <EmptyState
        illustration="error"
        title="Failed to load dashboard"
        description="Something went wrong loading admin data. Check your connection and try refreshing."
        action={{ label: 'Retry', onClick: () => window.location.reload() }}
      />
    )
  }

  // Build impact items (only show non-zero)
  const impactItems: {
    value: number
    label: string
    icon: React.ReactNode
    theme: BentoTheme
    unit?: string
  }[] = [
    { value: data?.totalTrees ?? 0,         label: 'Trees Planted',     icon: <TreePine size={16} />, theme: 'sprout' },
    { value: data?.totalRubbish ?? 0,       label: 'Litter Removed',    icon: <Trash2 size={16} />,   theme: 'sky',     unit: 'kg' },
    { value: data?.totalLeadersEmpowered ?? 0, label: 'Leaders Empowered', icon: <GraduationCap size={16} />, theme: 'bark' },
  ]

  return (
    <div className="relative min-h-dvh">
      {/* ── Parallax Hero ── */}
      <AdminHero rm={rm} />

      {/* ── Content ── */}
      <div className="relative z-10 bg-white">
        <motion.div
          className="px-4 sm:px-6 lg:px-8 pt-6 space-y-10 pb-24"
          variants={rm ? undefined : stagger}
          initial="hidden"
          animate="visible"
        >
          {/* ── Filters ── */}
          <motion.div variants={rm ? undefined : fadeUp} className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Showing</span>
            <Dropdown
              options={dateRangeOptions}
              value={dateRange}
              onChange={(v) => setDateRange(v as DateRange)}
              className="w-36 sm:w-44"
            />
            <Dropdown
              options={collectiveOptions}
              value={collectiveId}
              onChange={setCollectiveId}
              className="w-40 sm:w-52"
            />
          </motion.div>

          {/* ── Primary stats ── */}
          <motion.div variants={rm ? undefined : scaleIn}>
            <BentoStatGrid compact>
              <BentoStatCard value={dateRange === 'all' ? (data?.totalMembers ?? 0) : (data?.periodMembers ?? 0)}  label={dateRange === 'all' ? 'Members' : 'New Members'}  icon={<Users size={16} />}       theme="primary" />
              <BentoStatCard value={data?.totalCollectives ?? 0} label="Collectives"   icon={<MapPin size={14} />}      theme="moss" />
              <BentoStatCard value={dateRange === 'all' ? (data?.totalEvents ?? 0) : (data?.periodEvents ?? 0)}    label="Events Run"    icon={<CalendarDays size={14} />} theme="warning" />
              <BentoStatCard value={data?.totalAttendees ?? 0}   label="Attendees"     icon={<Users size={14} />}       theme="sky" />
              <BentoStatCard value={data?.totalHours ?? 0}       label="Vol. Hours"    icon={<Clock size={14} />}       theme="bark" unit="hrs" />
            </BentoStatGrid>
          </motion.div>

          {/* ── Environmental Impact ── */}
          {impactItems.length > 0 && (
            <motion.div variants={rm ? undefined : fadeUp} ref={impactRef}>
              <SectionHeader
                icon={<Leaf size={16} />}
                sub={dateRangeOptions.find((o) => o.value === dateRange)?.label}
              >
                Environmental Impact
              </SectionHeader>
              <BentoStatGrid compact>
                {impactItems.map((item) => (
                  <BentoStatCard
                    key={item.label}
                    value={item.value}
                    label={item.label}
                    icon={item.icon}
                    theme={item.theme}
                    unit={item.unit}
                  />
                ))}
              </BentoStatGrid>
            </motion.div>
          )}

          {/* ── Trend charts ── */}
          {trends && trends.length > 0 && (
            <motion.div variants={rm ? undefined : fadeUp}>
              <SectionHeader icon={<BarChart3 size={16} />} sub="Last 6 months">
                Growth Trends
              </SectionHeader>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <TrendChart
                  data={trends}
                  dataKey="members"
                  label="Member Growth"
                  icon={<TrendingUp size={17} className="text-primary-600" />}
                  accentFrom="var(--color-primary-600)"
                  accentTo="var(--color-primary-400)"
                />
                <TrendChart
                  data={trends}
                  dataKey="events"
                  label="Event Frequency"
                  icon={<CalendarDays size={17} className="text-moss-600" />}
                  accentFrom="var(--color-moss-600)"
                  accentTo="var(--color-moss-400)"
                />
              </div>
            </motion.div>
          )}

          {/* ── Quick links ── */}
          <motion.div variants={rm ? undefined : fadeUp}>
            <SectionHeader icon={<Sparkles size={16} />}>
              Quick Actions
            </SectionHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              <QuickLink
                to="/admin/collectives"
                label="Collectives"
                sub="Manage local chapters"
                icon={<MapPin size={18} />}
                accent="bg-gradient-to-br from-moss-500 to-moss-600"
              />
              <QuickLink
                to="/admin/events"
                label="Events"
                sub="Track conservation activities"
                icon={<CalendarDays size={18} />}
                accent="bg-gradient-to-br from-warning-500 to-warning-600"
              />
              <QuickLink
                to="/admin/users"
                label="Users"
                sub="Members, roles, permissions"
                icon={<Users size={18} />}
                accent="bg-gradient-to-br from-primary-500 to-primary-600"
              />
              <QuickLink
                to="/admin/email"
                label="Email"
                sub="Campaigns and subscribers"
                icon={<BarChart3 size={18} />}
                accent="bg-gradient-to-br from-sky-500 to-sky-600"
              />
              <QuickLink
                to="/admin/impact"
                label="Impact Dashboard"
                sub="Observations and metrics"
                icon={<Leaf size={18} />}
                accent="bg-gradient-to-br from-sprout-500 to-sprout-600"
              />
              <QuickLink
                to="/admin/reports"
                label="Reports"
                sub="Generate reports and exports"
                icon={<TrendingUp size={18} />}
                accent="bg-gradient-to-br from-bark-500 to-bark-600"
              />
            </div>
          </motion.div>

        </motion.div>
      </div>
    </div>
  )
}
