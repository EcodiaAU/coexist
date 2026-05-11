import { useCallback, useMemo, memo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'framer-motion'
import {
    TreePine,
    Trash2,
    Sprout,
    GraduationCap,
    Users,
    Share2,
    Flame,
    ArrowRight,
    Globe,
    Waves,
} from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { CountUp } from '@/components/count-up'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/button'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { MiniBar } from '@/components/micro-viz'
import { useMonthlyActivity, useImpactByCategory, useStreak } from '@/hooks/use-impact'
import { useProfileStats } from '@/hooks/use-profile'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'

/* ─── category meta ─── */
const CATEGORY_COLORS: Record<string, string> = {
  clean_up: 'var(--color-moss-500)',
  tree_planting: 'var(--color-primary-600)',
  ecosystem_restoration: 'var(--color-moss-600)',
  nature_hike: 'var(--color-primary-500)',
  camp_out: 'var(--color-secondary-500)',
  spotlighting: 'var(--color-plum-500)',
  other: 'var(--color-bark-500)',
}

const CATEGORY_LABELS: Record<string, string> = {
  clean_up: 'Clean Up',
  tree_planting: 'Tree Planting',
  ecosystem_restoration: 'Ecosystem Restoration',
  nature_hike: 'Nature Hike',
  camp_out: 'Camp Out',
  spotlighting: 'Spotlighting',
  other: 'Other',
}

/* ─── animation ─── */
const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 200, damping: 24 } },
}

/* ─── skeleton ─── */
function ImpactSkeleton() {
  return (
    <div className="space-y-10 pt-8 pb-10 px-5">
      <div className="h-52 rounded-3xl bg-neutral-100 animate-pulse" />
      <div className="grid grid-cols-2 gap-5">
        <div className="col-span-2 h-28 rounded-3xl bg-neutral-100 animate-pulse" />
        <div className="h-32 rounded-3xl bg-neutral-50 animate-pulse" />
        <div className="h-32 rounded-3xl bg-neutral-50 animate-pulse" />
        <div className="h-32 rounded-3xl bg-neutral-50 animate-pulse" />
        <div className="h-32 rounded-3xl bg-neutral-50 animate-pulse" />
      </div>
      <div className="h-48 rounded-3xl bg-neutral-50" />
    </div>
  )
}

/* ─── stat card configs ─── */
const STAT_CONFIGS: Record<string, { iconBg: string; iconColor: string; barColor?: string; barMax?: number }> = {
  events:      { iconBg: 'bg-primary-50',  iconColor: 'text-primary-600', barColor: 'bg-primary-500', barMax: 50 },
  hours:       { iconBg: 'bg-bark-50',     iconColor: 'text-bark-600',    barColor: 'bg-bark-500',    barMax: 200 },
  rubbish:     { iconBg: 'bg-moss-50',     iconColor: 'text-moss-600',    barColor: 'bg-moss-500',    barMax: 10 },
  cleanups:    { iconBg: 'bg-sky-50',      iconColor: 'text-sky-600',     barColor: 'bg-sky-500',     barMax: 30 },
  weeds:       { iconBg: 'bg-plum-50',     iconColor: 'text-plum-600',    barColor: 'bg-plum-500',    barMax: 500 },
  collectives: { iconBg: 'bg-sprout-50',   iconColor: 'text-sprout-600' },
  leaders:     { iconBg: 'bg-bark-50',     iconColor: 'text-bark-600' },
  coastline:   { iconBg: 'bg-sky-50',      iconColor: 'text-sky-600',     barColor: 'bg-sky-500',     barMax: 5000 },
}

/* ─── big stat block ─── */
function BigStat({
  value,
  label,
  icon,
  config,
  suffix,
  hero,
}: {
  value: number
  label: string
  icon: React.ReactNode
  config: string
  suffix?: string
  hero?: boolean
}) {
  const style = STAT_CONFIGS[config] ?? STAT_CONFIGS.events

  if (hero) {
    return (
      <motion.div
        variants={fadeUp}
        className="col-span-2 flex items-center gap-5 rounded-3xl bg-white border border-neutral-100 p-6 shadow-sm"
      >
        <div className={cn(
          'flex items-center justify-center w-12 h-12 rounded-2xl shrink-0',
          style.iconBg,
        )} aria-hidden="true">
          <span className={style.iconColor}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-400 font-bold mb-1">
            {label}
          </p>
          <p className="font-heading text-4xl font-extrabold text-neutral-900 tabular-nums leading-none">
            <CountUp end={value} />{suffix && <span className="text-lg">{suffix}</span>}
          </p>
          {style.barColor && style.barMax && value > 0 && (
            <MiniBar value={value} max={style.barMax} color={style.barColor} className="mt-3" />
          )}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      variants={fadeUp}
      className="flex flex-col items-center justify-center text-center rounded-3xl bg-white border border-neutral-100 p-5 min-h-[150px] shadow-sm"
    >
      <div className={cn(
        'mb-3 flex items-center justify-center w-10 h-10 rounded-xl',
        style.iconBg,
      )} aria-hidden="true">
        <span className={style.iconColor}>{icon}</span>
      </div>
      <p className="font-heading text-3xl font-extrabold text-neutral-900 tabular-nums leading-none">
        <CountUp end={value} />{suffix && <span className="text-base ml-0.5">{suffix}</span>}
      </p>
      <p className="text-[10px] uppercase tracking-[0.15em] text-neutral-400 font-bold mt-2">
        {label}
      </p>
      {style.barColor && style.barMax && value > 0 && (
        <MiniBar value={value} max={style.barMax} color={style.barColor} className="mt-3 w-full max-w-[80px]" />
      )}
    </motion.div>
  )
}

/* ─── activity sparkline ─── */
const ActivitySparkline = memo(function ActivitySparkline({ data }: { data: { month: string; count: number }[] }) {
  const shouldReduceMotion = useReducedMotion()
  if (data.length === 0) return null

  const recent = data.slice(-12)
  const maxCount = Math.max(...recent.map((d) => d.count), 1)

  return (
    <div className="flex items-end gap-[6px] h-32">
      {recent.map((item, i) => {
        const height = Math.max((item.count / maxCount) * 100, 6)
        const label = new Date(item.month + '-01').toLocaleDateString('en-AU', { month: 'short' })
        return (
          <div key={item.month} className="flex-1 flex flex-col items-center gap-2">
            <motion.div
              initial={shouldReduceMotion ? { height: `${height}%` } : { height: 0, opacity: 0 }}
              animate={{ height: `${height}%`, opacity: 1 }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 100, damping: 16, delay: i * 0.04 }
              }
              className="w-full rounded-xl bg-gradient-to-t from-primary-700 via-primary-500 to-primary-300 min-h-[6px] shadow-sm"
            />
            <span className="text-[11px] text-primary-500 font-bold">{label}</span>
          </div>
        )
      })}
    </div>
  )
})

/* ─── ring chart ─── */
const ImpactRing = memo(function ImpactRing({ data }: { data: { category: string; count: number }[] }) {
  const shouldReduceMotion = useReducedMotion()

  // Precompute cumulative offsets (must be before early return)
  const cumulativeOffsets = useMemo(() =>
    data.reduce<number[]>((acc, item, i) => {
      acc.push(i === 0 ? 0 : acc[i - 1] + data[i - 1].count)
      return acc
    }, [])
  , [data])

  if (data.length === 0) return null

  const total = data.reduce((sum, d) => sum + d.count, 0)
  const radius = 44
  const circumference = 2 * Math.PI * radius

  return (
    <div className="flex items-center gap-8">
      <div className="relative w-40 h-40 shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="11" className="stroke-neutral-100" />
          {data.map((item, idx) => {
            const pct = item.count / total
            const dashLen = pct * circumference
            const offset = -(cumulativeOffsets[idx] / total) * circumference
            return (
              <motion.circle
                key={item.category}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                strokeWidth="11"
                strokeLinecap="round"
                stroke={CATEGORY_COLORS[item.category] ?? '#869e62'}
                strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                strokeDashoffset={offset}
                initial={shouldReduceMotion ? {} : { opacity: 0, pathLength: 0 }}
                animate={{ opacity: 1, pathLength: 1 }}
                transition={{ duration: 0.6, delay: 0.15 }}
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="font-heading text-3xl font-extrabold text-neutral-900 leading-none">
              <CountUp end={total} />
            </p>
            <p className="text-[11px] text-neutral-400 uppercase tracking-widest mt-1 font-bold">events</p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-3.5">
        {data.slice(0, 5).map((item) => {
          const pct = Math.round((item.count / total) * 100)
          return (
            <div key={item.category} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-neutral-700 font-bold">
                  {CATEGORY_LABELS[item.category] ?? item.category}
                </span>
                <span className="text-xs text-neutral-500 font-bold tabular-nums">{pct}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-neutral-100 overflow-hidden">
                <motion.div
                  className="h-full rounded-full shadow-sm"
                  style={{ backgroundColor: CATEGORY_COLORS[item.category] ?? '#869e62' }}
                  initial={shouldReduceMotion ? { width: `${pct}%` } : { width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})

/* ─── section heading ─── */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-400 font-extrabold mb-5 flex items-center gap-2">
      <span className="h-0.5 w-4 rounded-full bg-neutral-300" />
      {children}
    </p>
  )
}

/* ─── main page ─── */
export default function ImpactDashboardPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const { toast } = useToast()
  const { data: profileStats, isLoading: statsLoading, isError: statsError } = useProfileStats()
  // Adapter: map useProfileStats fields to the shape expected by this page.
  // cleanupSites / collectivesCount / leadersEmpowered are not personal impact
  // metrics in useProfileStats (correct hook post-unification); they fall to 0
  // and are hidden by the > 0 guards in the share text and BigStat components.
  const stats = profileStats ? {
    eventsAttended:     profileStats.eventsAttended,
    volunteerHours:     profileStats.hoursVolunteered,
    treesPlanted:       profileStats.treesPlanted,
    rubbishCollectedKg: profileStats.rubbishCollectedKg,
    cleanupSites:       0,
    collectivesCount:   0,
    leadersEmpowered:   0,
  } : null
  const showLoading = useDelayedLoading(statsLoading)
  const { data: monthly } = useMonthlyActivity()
  const { data: byCategory } = useImpactByCategory()
  const { data: streak } = useStreak()

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['impact-stats'] }),
      queryClient.invalidateQueries({ queryKey: ['monthly-activity'] }),
      queryClient.invalidateQueries({ queryKey: ['impact-by-category'] }),
      queryClient.invalidateQueries({ queryKey: ['streak'] }),
    ])
  }, [queryClient])

  if (showLoading || statsLoading) {
    return (
      <Page swipeBack noBackground className="!px-0 bg-white" header={<Header title="Impact" back />}>
        <div className="relative min-h-full bg-white">
          <div className="relative z-10 px-4 lg:px-6">
            <ImpactSkeleton />
          </div>
        </div>
      </Page>
    )
  }

  if (statsError) {
    return (
      <Page swipeBack noBackground className="!px-0 bg-white" header={<Header title="Impact" back />}>
        <div className="px-4 py-12">
          <EmptyState
            illustration="error"
            title="Something went wrong"
            description="We couldn't load your impact data."
            action={{ label: 'Try again', onClick: handleRefresh }}
          />
        </div>
      </Page>
    )
  }

  if (!stats) {
    return (
      <Page swipeBack noBackground className="!px-0 bg-white" header={<Header title="Impact" back />}>
        <div className="relative min-h-full bg-white">
          <div className="relative z-10 px-4 lg:px-6">
            <EmptyState
              illustration="empty"
              title="No impact data yet"
              description="Attend your first event to start tracking your conservation impact"
              action={{ label: 'Find Events', to: '/events' }}
            />
          </div>
        </div>
      </Page>
    )
  }

  const handleShare = async () => {
    const parts: string[] = []
    if (stats.eventsAttended > 0) parts.push(`${stats.eventsAttended} events attended`)
    if (stats.volunteerHours > 0) parts.push(`${stats.volunteerHours} est. volunteer hours`)
    if (stats.treesPlanted > 0) parts.push(`${stats.treesPlanted} trees planted`)
    if (stats.rubbishCollectedKg > 0) parts.push(`${stats.rubbishCollectedKg}kg litter removed`)
    if (stats.cleanupSites > 0) parts.push(`${stats.cleanupSites} cleanup sites`)
    if (stats.leadersEmpowered > 0) parts.push(`${stats.leadersEmpowered} leaders empowered`)
    const text = `My Co-Exist Impact: ${parts.join(', ')}! Join at coexistaus.org`
    if (navigator.share) {
      try {
        await navigator.share({ title: 'My Co-Exist Impact', text })
      } catch (err) {
        // AbortError = user cancelled, stay silent. Anything else falls back.
        if (err instanceof Error && err.name === 'AbortError') return
        try {
          await navigator.clipboard.writeText(text)
          toast.success('Copied to clipboard')
        } catch {
          toast.error('Could not share')
        }
      }
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard')
    } catch {
      toast.error('Could not copy')
    }
  }

  return (
    <Page swipeBack noBackground className="!px-0 bg-white" header={<Header title="Impact" back />}>
        <div className="relative min-h-full bg-white">
          {/* ─── Content ─── */}
          <div className="relative z-10 px-4 lg:px-6 pb-4 space-y-5">

            {/* ─── Hero: Community Events ─── */}
            <motion.div
              variants={shouldReduceMotion ? undefined : stagger}
              initial="hidden"
              animate="show"
            >
              <motion.div
                variants={fadeUp}
                className="relative rounded-3xl bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800 p-7 shadow-2xl overflow-hidden"
              >
                <div className="relative">
                  <div className="flex items-center gap-2 mb-5">
                    <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white/20">
                      <TreePine size={20} strokeWidth={2.5} className="text-white" />
                    </div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-white/60 font-bold">
                      Your Conservation Footprint
                    </p>
                  </div>

                  <div className="flex items-baseline gap-6">
                    <div>
                      <span className="font-heading text-6xl font-extrabold text-white tabular-nums leading-none tracking-tight">
                        <CountUp end={stats.eventsAttended} />
                      </span>
                      <p className="text-base text-white/70 font-semibold mt-2">event attendances</p>
                    </div>
                    <div className="border-l border-white/15 pl-6">
                      <span className="font-heading text-4xl font-extrabold text-white tabular-nums leading-none tracking-tight">
                        <CountUp end={stats.volunteerHours} />
                      </span>
                      <p className="text-sm text-white/60 font-semibold mt-1">est. volunteer hours</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>

            {/* ─── Core Stats Bento Grid ─── */}
            <motion.div
              variants={shouldReduceMotion ? undefined : stagger}
              initial="hidden"
              animate="show"
              className="grid grid-cols-2 gap-4"
            >
              {/* Hero stat: Trees Planted spans full width */}
              <BigStat
                value={stats.treesPlanted}
                label="Trees Planted"
                icon={<TreePine size={20} strokeWidth={2.5} />}
                config="events"
                hero
              />
              <BigStat
                value={stats.rubbishCollectedKg}
                label="Litter Removed (kg)"
                icon={<Trash2 size={20} strokeWidth={2.5} />}
                config="rubbish"
                suffix="kg"
              />
              <BigStat
                value={stats.cleanupSites}
                label="Cleanup Sites"
                icon={<Trash2 size={20} strokeWidth={2.5} />}
                config="cleanups"
              />

              {/* Organisational */}
              <BigStat
                value={stats.collectivesCount}
                label="Collectives"
                icon={<Users size={20} strokeWidth={2.5} />}
                config="collectives"
              />
              <BigStat
                value={stats.leadersEmpowered}
                label="Leaders Empowered"
                icon={<GraduationCap size={20} strokeWidth={2.5} />}
                config="leaders"
              />
            </motion.div>

            {/* ─── Streak ─── */}
            <AnimatePresence>
              {streak && (streak.currentWeeks > 0 || streak.currentMonths > 0) && (
                <motion.div
                  key="streak"
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0, overflow: 'hidden' }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 22 }}
                  className="flex items-center gap-5 rounded-3xl bg-white shadow-sm border border-neutral-100 p-6"
                >
                  <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-warning-500 shadow-sm">
                    <Flame size={26} strokeWidth={2.5} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-400 font-extrabold mb-2.5">
                      Active Streak
                    </p>
                    <div className="flex items-baseline gap-4">
                      <p className="font-heading text-3xl font-extrabold text-neutral-900 tabular-nums">
                        <CountUp end={streak.currentWeeks} />
                        <span className="text-sm font-bold text-neutral-400 ml-1">wks</span>
                      </p>
                      <span className="w-0.5 h-7 bg-neutral-200 rounded-full" />
                      <p className="font-heading text-3xl font-extrabold text-neutral-900 tabular-nums">
                        <CountUp end={streak.currentMonths} />
                        <span className="text-sm font-bold text-neutral-400 ml-1">mos</span>
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ─── Monthly Activity ─── */}
            <AnimatePresence>
              {monthly && monthly.length > 0 && (
                <motion.section
                  key="monthly"
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                  transition={{ delay: 0.25, type: 'spring', stiffness: 200, damping: 22 }}
                >
                  <SectionHeading>Monthly Activity</SectionHeading>
                  <div className="rounded-3xl bg-white shadow-sm border border-neutral-100 p-6">
                    <ActivitySparkline data={monthly} />
                  </div>
                </motion.section>
              )}
            </AnimatePresence>

            {/* ─── Category Breakdown ─── */}
            <AnimatePresence>
              {byCategory && byCategory.length > 0 && (
                <motion.section
                  key="breakdown"
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                  transition={{ delay: 0.3, type: 'spring', stiffness: 200, damping: 22 }}
                >
                  <SectionHeading>Impact Breakdown</SectionHeading>
                  <div className="rounded-3xl bg-white shadow-sm border border-neutral-100 p-6">
                    <ImpactRing data={byCategory} />
                  </div>
                </motion.section>
              )}
            </AnimatePresence>

            {/* ─── National Impact CTA ─── */}
            <motion.button
              initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, type: 'spring', stiffness: 200, damping: 22 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate('/impact/national')}
              className="w-full flex items-center gap-5 rounded-3xl bg-gradient-to-r from-primary-600 to-primary-700 shadow-sm p-6 min-h-11 text-left active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none overflow-hidden relative"
            >
              <div className="relative flex items-center justify-center w-13 h-13 rounded-2xl bg-white/20">
                <Globe size={24} strokeWidth={2.5} className="text-white" />
              </div>
              <div className="relative flex-1 min-w-0">
                <p className="font-heading text-base font-bold text-white">National Impact</p>
                <p className="text-sm text-white/60 font-medium mt-1">
                  See how the whole community is making a difference
                </p>
              </div>
              <ArrowRight size={20} strokeWidth={2.5} className="text-white/50 shrink-0 relative" />
            </motion.button>

            {/* ─── Comparison ─── */}
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, type: 'spring', stiffness: 200, damping: 22 }}
              className="rounded-3xl bg-white shadow-sm border border-neutral-100 p-6"
            >
              <p className="text-sm text-neutral-700 font-semibold leading-relaxed">
                {stats.treesPlanted > 10
                  ? `You've planted ${Math.round(stats.treesPlanted / 3)}x more trees than the average Co-Exist member. Keep it up!`
                  : 'Keep attending events to grow your impact and see how you compare!'}
              </p>
            </motion.div>

            {/* ─── Share Button ─── */}
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, type: 'spring', stiffness: 200, damping: 22 }}
              className="pb-8"
            >
              <Button
                variant="primary"
                size="lg"
                fullWidth
                icon={<Share2 size={18} />}
                onClick={handleShare}
              >
                Share My Impact
              </Button>
            </motion.div>

          </div>
        </div>
    </Page>
  )
}
