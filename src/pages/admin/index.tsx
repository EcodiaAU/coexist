import { useState, useMemo, useEffect } from 'react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { motion, useReducedMotion } from 'framer-motion'
import {
    Users,
    MapPin,
    CalendarDays,
    Clock,
    ClipboardList,
    ArrowUpRight,
} from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { Dropdown } from '@/components/dropdown'
import { BentoStatCard, BentoStatGrid } from '@/components/bento-stats'
import { WaveTransition } from '@/components/wave-transition'
import { EmptyState } from '@/components/empty-state'
import { EventsMissingImpactCard } from '@/components/events-missing-impact-card'
import { cn } from '@/lib/cn'
import { Link } from 'react-router-dom'
import { useParallaxLayers } from '@/hooks/use-parallax-scroll'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'
import {
    useAdminOverview,
    type DateRange,
    dateRangeOptions,
} from '@/hooks/use-admin-dashboard'
import { useCollectives } from '@/hooks/use-collective'


const scaleIn = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const } },
}

/* ------------------------------------------------------------------ */
/*  Parallax Hero - carousel mirroring HomeHero, admin-hero pair first  */
/* ------------------------------------------------------------------ */

// Mirrors HERO_PAIRS in pages/home.tsx but leads with the admin-hero pair
// so the admin landing has its own identity on first paint, then cycles
// through the same conservation imagery the public home shows. fgLayout
// matches each pair's natural composition: 'bottom' for home (silhouettes
// pinned to the bottom edge with the original w-[120%] sm:w-[70%] inner
// container), 'full' for everything else (full-bleed FG over BG).
type HeroFgLayout = 'bottom' | 'full'
const ADMIN_HERO_PAIRS: Array<{ bg: string; fg: string; alt: string; fgLayout: HeroFgLayout }> = [
  { bg: '/img/admin-hero-bg.webp',      fg: '/img/admin-hero-fg.webp',      alt: 'Australian conservation landscape', fgLayout: 'full' },
  { bg: '/img/home-hero-bg.webp',       fg: '/img/home-hero-fg.webp',       alt: 'Australian conservation landscape', fgLayout: 'bottom' },
  { bg: '/img/explore-hero-bg.webp',    fg: '/img/explore-hero-fg.webp',    alt: 'Co-Exist collectives across Australia', fgLayout: 'full' },
  { bg: '/img/contact-hero-bg.webp',    fg: '/img/contact-hero-fg.webp',    alt: 'Connect with Co-Exist',             fgLayout: 'full' },
  { bg: '/img/donate-hero-bg.webp',     fg: '/img/donate-hero-fg.webp',     alt: 'Support Co-Exist',                  fgLayout: 'full' },
  { bg: '/img/leadership-hero-bg.webp', fg: '/img/leadership-hero-fg.webp', alt: 'Co-Exist leaders',                  fgLayout: 'full' },
]

const ADMIN_HERO_ROTATE_MS = 6000

function AdminHero({
  rm,
}: {
  rm: boolean
}) {
  const { bgRef, fgRef, textRef } = useParallaxLayers({ withScale: false })

  // Auto-advance through ADMIN_HERO_PAIRS, crossfading. Wordmark stays
  // fixed on top. Reduced-motion preference holds on pair 0.
  const [activeIndex, setActiveIndex] = useState(0)
  useEffect(() => {
    if (rm || ADMIN_HERO_PAIRS.length <= 1) return
    const id = setInterval(() => {
      setActiveIndex((i) => (i + 1) % ADMIN_HERO_PAIRS.length)
    }, ADMIN_HERO_ROTATE_MS)
    return () => clearInterval(id)
  }, [rm])

  return (
    <div data-eos-id="src/pages/admin/index.tsx#0" data-eos-v="2" className="relative">
      <div data-eos-id="src/pages/admin/index.tsx#1" className="relative w-full h-[110vw] min-h-[480px] sm:h-auto overflow-hidden">
        {/* Layer 0: Background landscape - slowest parallax. Stacked imgs,
            opacity crossfades the active pair in. */}
        <div data-eos-id="src/pages/admin/index.tsx#2"
          ref={rm ? undefined : bgRef}
          className="h-full relative will-change-transform"
        >
          {ADMIN_HERO_PAIRS.map((pair, i) => (
            <img data-eos-src="literal" data-eos-src-label="Bg" data-eos-src-binding="bg" data-eos-id="src/pages/admin/index.tsx#3"
              key={`bg-${i}`}
              src={pair.bg}
              alt={i === activeIndex ? pair.alt : ''}
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
              className={cn(
                'w-full h-full object-cover object-center sm:h-auto sm:object-fill block',
                i === 0 ? 'relative' : 'absolute inset-0',
                'transition-opacity duration-[1200ms] ease-in-out',
                i === activeIndex ? 'opacity-100' : 'opacity-0',
              )}
            />
          ))}
        </div>

        {/* Layer 1: Foreground elements - medium parallax. 'bottom' silhouette
            pairs use the home-style inner container; 'full' pairs cover the
            whole hero. Both fade between active states. */}
        <div data-eos-id="src/pages/admin/index.tsx#4"
          ref={rm ? undefined : fgRef}
          className="absolute inset-0 z-[3] will-change-transform"
        >
          {ADMIN_HERO_PAIRS.map((pair, i) => {
            const isActive = i === activeIndex
            const fadeCls = cn(
              'transition-opacity duration-[1200ms] ease-in-out',
              isActive ? 'opacity-100' : 'opacity-0',
            )
            if (pair.fgLayout === 'bottom') {
              return (
                <div data-eos-id="src/pages/admin/index.tsx#5"
                  key={`fg-${i}`}
                  className={cn('absolute bottom-0 inset-x-0 flex justify-center pointer-events-none', fadeCls)}
                >
                  <div data-eos-id="src/pages/admin/index.tsx#6" className="w-[120%] -ml-[10%] sm:w-[70%] sm:ml-0">
                    <img data-eos-src="literal" data-eos-src-label="Fg" data-eos-src-binding="fg" data-eos-id="src/pages/admin/index.tsx#7"
                      src={pair.fg}
                      alt=""
                      loading={i === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                      className="w-full h-auto block"
                    />
                  </div>
                </div>
              )
            }
            return (
              <img data-eos-src="literal" data-eos-src-label="Fg" data-eos-src-binding="fg" data-eos-id="src/pages/admin/index.tsx#8"
                key={`fg-${i}`}
                src={pair.fg}
                alt=""
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
                className={cn(
                  'absolute inset-0 w-full h-full object-cover object-center sm:h-auto sm:object-fill block pointer-events-none',
                  fadeCls,
                )}
              />
            )
          })}
        </div>

        {/* Layer 2: Text overlay - above fg. Wordmark is the persistent
            identity layer; never animates with the carousel. */}
        <div data-eos-id="src/pages/admin/index.tsx#9"
          ref={rm ? undefined : textRef}
          className="absolute inset-x-0 top-[15%] sm:top-[8%] z-[4] flex flex-col items-center px-6 will-change-transform"
        >
          <motion.div data-eos-id="src/pages/admin/index.tsx#10"
            initial={rm ? undefined : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex flex-col items-center text-center"
          >
            <img data-eos-src="static" data-eos-id="src/pages/admin/index.tsx#11"
              src="/logos/white-wordmark.webp"
              alt="Co-Exist"
              className="h-24 sm:h-36"
              style={{
                // Layered drop shadow so the white wordmark stays legible
                // across every carousel pair (some have lighter skies / sand).
                filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.35)) drop-shadow(0 8px 24px rgba(0,0,0,0.25))',
              }}
            />
          </motion.div>
        </div>
      </div>

      {/* Wave divider */}
      <WaveTransition data-eos-id="src/pages/admin/index.tsx#12" />
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
    <div data-eos-id="src/pages/admin/index.tsx#13" className="flex items-end justify-between mb-4">
      <div data-eos-id="src/pages/admin/index.tsx#14">
        <div data-eos-id="src/pages/admin/index.tsx#15" className="flex items-center gap-2 mb-0.5">
          {icon && <span data-eos-id="src/pages/admin/index.tsx#16" className="text-primary-500">{icon}</span>}
          <h2 data-eos-id="src/pages/admin/index.tsx#17" className="font-heading text-lg sm:text-xl font-bold text-neutral-900 tracking-tight">
            {children}
          </h2>
        </div>
        {sub && <p data-eos-id="src/pages/admin/index.tsx#18" className="text-xs text-neutral-400 font-medium">{sub}</p>}
      </div>
      {action && (
        <Link data-eos-id="src/pages/admin/index.tsx#19" data-eos-var="action.label" data-eos-var-label="Label" data-eos-var-scope="prop"
          to={action.to}
          className="flex items-center gap-1 text-xs text-primary-600 font-semibold hover:text-primary-700 transition-colors duration-150 active:scale-[0.97] pb-0.5"
        >
          {action.label}
          <ArrowUpRight data-eos-id="src/pages/admin/index.tsx#20" size={13} />
        </Link>
      )}
    </div>
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

  const collectiveOptions = useMemo(() => ([
    { value: '', label: 'All Collectives' },
    ...(collectivesData ?? []).map((c) => ({ value: c.id, label: c.name })),
  ]), [collectivesData])

  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion

  useAdminHeader('Dashboard', { fullBleed: true })

  if (showLoading) {
    return (
      <div data-eos-id="src/pages/admin/index.tsx#21" className="relative min-h-dvh overflow-x-hidden">
        {/* Hero skeleton */}
        <div data-eos-id="src/pages/admin/index.tsx#22" className="relative w-full aspect-[16/9] bg-neutral-200 animate-pulse overflow-hidden">
          <div data-eos-id="src/pages/admin/index.tsx#23" className="absolute inset-x-0 top-[15%] flex flex-col items-center gap-3 px-6">
            <div data-eos-id="src/pages/admin/index.tsx#24" className="h-3 w-28 rounded-full bg-white/20" />
            <div data-eos-id="src/pages/admin/index.tsx#25" className="h-9 w-64 rounded-sm bg-white/15" />
            <div data-eos-id="src/pages/admin/index.tsx#26" className="h-4 w-48 rounded-sm bg-white/10" />
          </div>
        </div>
        <div data-eos-id="src/pages/admin/index.tsx#27" className="bg-white px-4 sm:px-6 lg:px-8 pt-8 space-y-6 pb-20">
          {/* Stat cards skeleton */}
          <div data-eos-id="src/pages/admin/index.tsx#28" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div data-eos-id="src/pages/admin/index.tsx#29" className="col-span-2 h-36 rounded-md bg-neutral-50 animate-pulse" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div data-eos-id="src/pages/admin/index.tsx#30" key={i} className="h-28 rounded-md bg-neutral-50 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>

          {/* Outstanding surveys card skeleton */}
          <div data-eos-id="src/pages/admin/index.tsx#31" className="space-y-3">
            <div data-eos-id="src/pages/admin/index.tsx#32" className="h-5 w-44 rounded-sm bg-neutral-100 animate-pulse" />
            <div data-eos-id="src/pages/admin/index.tsx#33" className="h-40 rounded-md bg-neutral-50 animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <EmptyState data-eos-id="src/pages/admin/index.tsx#34"
        illustration="error"
        title="Failed to load dashboard"
        description="Something went wrong loading admin data. Check your connection and try refreshing."
        action={{ label: 'Retry', onClick: () => window.location.reload() }}
      />
    )
  }

  return (
    <div data-eos-id="src/pages/admin/index.tsx#35" className="relative min-h-dvh">
      {/* ── Parallax Hero ── */}
      <AdminHero data-eos-id="src/pages/admin/index.tsx#36" rm={rm} />

      {/* ── Content ── */}
      <div data-eos-id="src/pages/admin/index.tsx#37" className="relative z-10 bg-white">
        <motion.div data-eos-id="src/pages/admin/index.tsx#38"
          className="px-4 sm:px-6 lg:px-8 pt-6 space-y-10 pb-24"
          variants={rm ? undefined : stagger}
          initial="hidden"
          animate="visible"
        >
          {/* ── Filters ── */}
          <motion.div data-eos-id="src/pages/admin/index.tsx#39" variants={rm ? undefined : fadeUp} className="flex items-center gap-2 sm:gap-3">
            <span data-eos-id="src/pages/admin/index.tsx#40" className="hidden sm:inline text-xs font-semibold text-neutral-400 uppercase tracking-wider shrink-0">Showing</span>
            {/* Single-line layout: both dropdowns share available width with
                min-w-0 so long collective names truncate WITHIN the dropdown
                rather than overflowing to a second row. */}
            <Dropdown data-eos-id="src/pages/admin/index.tsx#41"
              options={dateRangeOptions}
              value={dateRange}
              onChange={(v) => setDateRange(v as DateRange)}
              className="flex-1 min-w-0 sm:w-44 sm:flex-none"
            />
            <Dropdown data-eos-id="src/pages/admin/index.tsx#42"
              options={collectiveOptions}
              value={collectiveId}
              onChange={setCollectiveId}
              className="flex-1 min-w-0 sm:w-52 sm:flex-none"
            />
          </motion.div>

          {/* ── Primary stats ── */}
          <motion.div data-eos-id="src/pages/admin/index.tsx#43" variants={rm ? undefined : scaleIn}>
            <BentoStatGrid data-eos-id="src/pages/admin/index.tsx#44" compact>
              <BentoStatCard data-eos-id="src/pages/admin/index.tsx#45" value={dateRange === 'all' ? (data?.totalMembers ?? 0) : (data?.periodMembers ?? 0)}  label={dateRange === 'all' ? 'Members' : 'New Members'}  icon={<Users data-eos-id="src/pages/admin/index.tsx#46" size={16} />}       theme="primary" />
              <BentoStatCard data-eos-id="src/pages/admin/index.tsx#47" value={data?.totalCollectives ?? 0} label="Collectives"   icon={<MapPin data-eos-id="src/pages/admin/index.tsx#48" size={14} />}      theme="moss" />
              <BentoStatCard data-eos-id="src/pages/admin/index.tsx#49" value={dateRange === 'all' ? (data?.totalEvents ?? 0) : (data?.periodEvents ?? 0)}    label="Events Run"    icon={<CalendarDays data-eos-id="src/pages/admin/index.tsx#50" size={14} />} theme="warning" />
              <BentoStatCard data-eos-id="src/pages/admin/index.tsx#51" value={data?.totalAttendees ?? 0}   label="Attendees"     icon={<Users data-eos-id="src/pages/admin/index.tsx#52" size={14} />}       theme="sky" />
              <BentoStatCard data-eos-id="src/pages/admin/index.tsx#53" value={data?.totalHours ?? 0}       label="Vol. Hours"    icon={<Clock data-eos-id="src/pages/admin/index.tsx#54" size={14} />}       theme="bark" unit="hrs" />
            </BentoStatGrid>
          </motion.div>

          {/* ── Outstanding impact surveys ── */}
          <motion.div data-eos-id="src/pages/admin/index.tsx#55" variants={rm ? undefined : fadeUp}>
            <SectionHeader data-eos-id="src/pages/admin/index.tsx#56"
              icon={<ClipboardList data-eos-id="src/pages/admin/index.tsx#57" size={16} />}
              sub="Finished events still waiting on a logged impact survey"
              action={{ label: 'Impact dashboard', to: '/admin/impact' }}
            >
              Impact Surveys
            </SectionHeader>
            <EventsMissingImpactCard data-eos-id="src/pages/admin/index.tsx#58" showWhenEmpty />
          </motion.div>

        </motion.div>
      </div>
    </div>
  )
}
