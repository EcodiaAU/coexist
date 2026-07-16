import { useState, useMemo } from 'react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion'
import {
    Users,
    CalendarDays,
    MapPin,
    TreePine, Clock,
    Crown,
    Shield,
    ShieldCheck,
    ShieldAlert,
    UserMinus,
    UserPlus,
    RotateCcw,
    Download,
    Archive,
    AlertTriangle,
    ExternalLink,
    Eye,
    Leaf,
    Sprout,
    Waves,
    TrendingUp,
    Sparkles,
    Camera,
    ImagePlus,
    Trash2,
    X,
    Settings,
    ArrowLeft,
} from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { SearchBar } from '@/components/search-bar'
import { Dropdown } from '@/components/dropdown'
import { Avatar } from '@/components/avatar'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { BottomSheet } from '@/components/bottom-sheet'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { PlaceAutocomplete } from '@/components/place-autocomplete'
import { OptimizedImage } from '@/components/optimized-image'
import { useAuth } from '@/hooks/use-auth'
import { useCountUp } from '@/components/stat-card'
import { WaveTransition } from '@/components/wave-transition'
import { SegmentedControl } from '@/components/segmented-control'
import { useImageUpload } from '@/hooks/use-image-upload'
import {
    useAdminCollectiveDetail,
    useAdminCollectiveMembers,
    useAdminCollectiveEvents,
    useAdminCollectiveStats,
    useAdminUpdateCollective,
    useAdminUpdateMemberRole,
    useAdminRemoveMember,
    useAdminRestoreMember,
    useAdminAddMember,
    useArchiveCollective,
    useDeleteCollective,
    useSearchUsers,
    exportAdminMembersCSV,
    type AdminCollectiveMember,
    type AdminCollectiveEvent,
} from '@/hooks/use-admin-collectives'
import { useCollectiveCustomMetrics } from '@/hooks/use-impact'
import { useImpactMetricDefs } from '@/hooks/use-impact-metric-defs'
import type { Database } from '@/types/database.types'

type CollectiveRole = Database['public']['Enums']['collective_role']

/* ------------------------------------------------------------------ */
/*  Role helpers                                                       */
/* ------------------------------------------------------------------ */

const ROLE_LABELS: Record<string, string> = {
  leader: 'Leader',
  co_leader: 'Co-Leader',
  assist_leader: 'Assistant Leader',
  participant: 'Participant',
  member: 'Participant',
}

const ROLE_ICONS: Record<string, typeof Crown> = {
  leader: Crown,
  co_leader: ShieldCheck,
  assist_leader: ShieldAlert,
  participant: Users,
  member: Users,
}

const ROLE_COLORS: Record<string, string> = {
  leader: 'bg-warning-100 text-warning-700',
  co_leader: 'bg-primary-100 text-primary-700',
  assist_leader: 'bg-info-100 text-info-700',
  participant: 'bg-neutral-100 text-neutral-600',
  member: 'bg-neutral-100 text-neutral-600',
}

const ROLE_CARD_ACCENTS: Record<string, { bg: string; border: string; icon: string }> = {
  leader: { bg: 'bg-warning-50', border: 'border-warning-200/60', icon: 'bg-warning-100 text-warning-600' },
  co_leader: { bg: 'bg-white', border: 'border-neutral-100', icon: 'bg-primary-100 text-primary-600' },
  assist_leader: { bg: 'bg-info-50', border: 'border-info-200/60', icon: 'bg-info-100 text-info-600' },
  participant: { bg: 'bg-neutral-50', border: 'border-neutral-200/60', icon: 'bg-neutral-100 text-neutral-500' },
  member: { bg: 'bg-neutral-50', border: 'border-neutral-200/60', icon: 'bg-neutral-100 text-neutral-500' },
}

const ALL_ROLES: CollectiveRole[] = ['leader', 'co_leader', 'assist_leader', 'participant']

const AUSTRALIAN_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const

type TabKey = 'overview' | 'members' | 'events' | 'settings'

/* ------------------------------------------------------------------ */
/*  Rich stat card - gradient surface with icon & countUp             */
/* ------------------------------------------------------------------ */

function RichStatCard({
  label,
  value,
  icon,
  color,
  reducedMotion,
  delay = 0,
}: {
  label: string
  value: number
  icon: React.ReactNode
  color: string
  reducedMotion: boolean
  delay?: number
}) {
  const display = useCountUp(value, 1200, !reducedMotion)

  return (
    <motion.div data-eos-id="src/pages/admin/collective-detail.tsx#0" data-eos-v="2"
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, delay: reducedMotion ? 0 : delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex items-center gap-3 rounded-sm bg-white shadow-sm px-4 py-3.5 active:scale-[0.98] transition-transform duration-150"
      aria-label={`${label}: ${value}`}
    >
      <span data-eos-id="src/pages/admin/collective-detail.tsx#1" className={cn('flex items-center justify-center w-10 h-10 rounded-sm shrink-0', color)} aria-hidden="true">
        {icon}
      </span>
      <div data-eos-id="src/pages/admin/collective-detail.tsx#2" className="min-w-0">
        <p data-eos-id="src/pages/admin/collective-detail.tsx#3" data-eos-var="display.toLocaleString" data-eos-var-label="To locale string" data-eos-var-scope="prop"
          style={{ fontFamily: 'var(--font-heading)' }}
          className="text-xl sm:text-2xl font-bold text-neutral-900 tabular-nums"
        >
          {display.toLocaleString()}
        </p>
        <p data-eos-id="src/pages/admin/collective-detail.tsx#4" className="text-xs text-neutral-400 font-medium truncate">{label}</p>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Hero stat - large gradient card (used for top 4 stats)            */
/* ------------------------------------------------------------------ */

function HeroStat({
  value,
  label,
  icon,
  variant = 'default',
  reducedMotion,
  delay = 0,
}: {
  value: number
  label: string
  icon: React.ReactNode
  variant?: 'primary' | 'dark' | 'accent' | 'default'
  reducedMotion: boolean
  delay?: number
}) {
  const display = useCountUp(value, 1200, !reducedMotion)

  const variantStyles = {
    primary: 'bg-primary-900 text-white',
    dark: 'bg-primary-950 text-white',
    accent: 'bg-primary-800 text-white',
    default: 'bg-white text-neutral-900 shadow-sm',
  }
  const iconBg = { primary: 'bg-white/15', dark: 'bg-white/10', accent: 'bg-white/15', default: 'bg-primary-50' }
  const iconColor = { primary: 'text-white/80', dark: 'text-white/70', accent: 'text-white/80', default: 'text-neutral-500' }
  const labelColor = { primary: 'text-white/65', dark: 'text-white/55', accent: 'text-white/65', default: 'text-neutral-400' }
  const valColor = { primary: 'text-white', dark: 'text-white', accent: 'text-white', default: 'text-neutral-900' }

  return (
    <motion.div data-eos-id="src/pages/admin/collective-detail.tsx#5"
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, delay: reducedMotion ? 0 : delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      style={{ willChange: 'transform' }}
      className={cn('relative overflow-hidden rounded-md p-4 sm:p-5', variantStyles[variant])}
    >
      {/* Decorative circles removed per design system - heroes are
          plain gradients only (2026-05-16 Tate). */}
      <div data-eos-id="src/pages/admin/collective-detail.tsx#6" className="relative z-10">
        <span data-eos-id="src/pages/admin/collective-detail.tsx#7" className={cn('flex items-center justify-center w-9 h-9 rounded-sm mb-3', iconBg[variant], iconColor[variant])} aria-hidden="true">
          {icon}
        </span>
        <p data-eos-id="src/pages/admin/collective-detail.tsx#8" data-eos-var="display.toLocaleString" data-eos-var-label="To locale string" data-eos-var-scope="prop" style={{ fontFamily: 'var(--font-heading)' }} className={cn('text-2xl sm:text-3xl font-bold tracking-tight tabular-nums', valColor[variant])}>
          {display.toLocaleString()}
        </p>
        <p data-eos-id="src/pages/admin/collective-detail.tsx#9" className={cn('mt-0.5 text-sm font-medium', labelColor[variant])}>{label}</p>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Overview tab                                                       */
/* ------------------------------------------------------------------ */

function OverviewTab({ collectiveId, reducedMotion }: { collectiveId: string; reducedMotion: boolean }) {
  const rm = reducedMotion
  const { data: detail } = useAdminCollectiveDetail(collectiveId)
  const { data: stats, isLoading: statsLoading } = useAdminCollectiveStats(collectiveId)
  const showStatsLoading = useDelayedLoading(statsLoading)
  const { data: members = [] } = useAdminCollectiveMembers(collectiveId)
  const { data: events = [] } = useAdminCollectiveEvents(collectiveId)
  const { data: customMetrics } = useCollectiveCustomMetrics(collectiveId)
  const { metricLabels } = useImpactMetricDefs()

  const leaders = members.filter((m) =>
    ['leader', 'co_leader', 'assist_leader'].includes(m.role!),
  )

  // Overview surfaces UPCOMING events (the actionable view for staff), not
  // the most-recent-by-date-desc list - past events are visible in full on
  // the Events tab (2026-05-16 Tate feedback).
  const upcomingEvents = useMemo(() => {
    const now = Date.now()
    return events
      .filter((e) => {
        const end = e.date_end ? new Date(e.date_end).getTime() : new Date(e.date_start).getTime()
        return end >= now && e.status !== 'cancelled'
      })
      .slice()
      .sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime())
      .slice(0, 5)
  }, [events])

  // Build impact items (only show non-zero)
  const impactItems: { value: number; label: string; icon: React.ReactNode; color: string }[] = stats
    ? [
        { value: stats.trees_planted, label: 'Trees Planted', icon: <TreePine data-eos-id="src/pages/admin/collective-detail.tsx#10" size={20} className="text-success-700" />, color: 'bg-success-50' },
        { value: Math.round(stats.rubbish_kg), label: 'Litter Removed (kg)', icon: <span data-eos-id="src/pages/admin/collective-detail.tsx#11" className="text-lg text-primary-700" aria-hidden="true">&#9851;</span>, color: 'bg-primary-50' },
      ].filter((i) => i.value > 0)
    : []

  return (
    <div data-eos-id="src/pages/admin/collective-detail.tsx#12" className="space-y-8">
      {/* ── Primary stats - 4 hero cards ── */}
      {showStatsLoading ? (
        <div data-eos-id="src/pages/admin/collective-detail.tsx#13" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton data-eos-id="src/pages/admin/collective-detail.tsx#14" key={i} className="h-32 rounded-md" />
          ))}
        </div>
      ) : statsLoading ? null : stats ? (
        <div data-eos-id="src/pages/admin/collective-detail.tsx#15" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <HeroStat data-eos-id="src/pages/admin/collective-detail.tsx#16" value={stats.member_count} label="Members" icon={<Users data-eos-id="src/pages/admin/collective-detail.tsx#17" size={20} />} variant="primary" reducedMotion={rm} delay={0.05} />
          <HeroStat data-eos-id="src/pages/admin/collective-detail.tsx#18" value={stats.event_count} label="Events" icon={<CalendarDays data-eos-id="src/pages/admin/collective-detail.tsx#19" size={20} />} variant="accent" reducedMotion={rm} delay={0.1} />
          <HeroStat data-eos-id="src/pages/admin/collective-detail.tsx#20" value={Math.round(stats.hours_total)} label="Est. Vol. Hours" icon={<Clock data-eos-id="src/pages/admin/collective-detail.tsx#21" size={20} />} variant="dark" reducedMotion={rm} delay={0.15} />
          <HeroStat data-eos-id="src/pages/admin/collective-detail.tsx#22" value={stats.trees_planted} label="Trees Planted" icon={<TreePine data-eos-id="src/pages/admin/collective-detail.tsx#23" size={20} />} variant="default" reducedMotion={rm} delay={0.2} />
        </div>
      ) : null}

      {/* ── Environmental impact pills ── */}
      {impactItems.length > 0 && (
        <motion.div data-eos-id="src/pages/admin/collective-detail.tsx#24"
          initial={rm ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.25 }}
        >
          <div data-eos-id="src/pages/admin/collective-detail.tsx#25" className="flex items-center gap-2 mb-3">
            <Sparkles data-eos-id="src/pages/admin/collective-detail.tsx#26" size={16} className="text-primary-500" />
            <h3 data-eos-id="src/pages/admin/collective-detail.tsx#27" className="font-heading text-sm font-semibold text-neutral-900">Environmental Impact</h3>
          </div>
          <div data-eos-id="src/pages/admin/collective-detail.tsx#28" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {impactItems.map((item, i) => (
              <RichStatCard data-eos-id="src/pages/admin/collective-detail.tsx#29"
                key={item.label}
                value={item.value}
                label={item.label}
                icon={item.icon}
                color={item.color}
                reducedMotion={rm}
                delay={0.3 + i * 0.04}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Custom metrics ── */}
      {customMetrics && customMetrics.length > 0 && (
        <motion.div data-eos-id="src/pages/admin/collective-detail.tsx#30"
          initial={rm ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <div data-eos-id="src/pages/admin/collective-detail.tsx#31" className="flex items-center gap-2 mb-3">
            <Sparkles data-eos-id="src/pages/admin/collective-detail.tsx#32" size={16} className="text-primary-500" />
            <h3 data-eos-id="src/pages/admin/collective-detail.tsx#33" className="font-heading text-sm font-semibold text-neutral-900">Custom Metrics</h3>
          </div>
          <div data-eos-id="src/pages/admin/collective-detail.tsx#34" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {customMetrics.map((cm, i) => (
              <RichStatCard data-eos-id="src/pages/admin/collective-detail.tsx#35"
                key={cm.key}
                value={cm.total}
                label={metricLabels[cm.key] ?? cm.key.replace(/_/g, ' ')}
                icon={<TrendingUp data-eos-id="src/pages/admin/collective-detail.tsx#36" size={20} className="text-primary-600" />}
                color="bg-primary-50"
                reducedMotion={rm}
                delay={0.35 + i * 0.04}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Leadership team ── */}
      <motion.div data-eos-id="src/pages/admin/collective-detail.tsx#37"
        initial={rm ? { opacity: 1 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.35 }}
      >
        <div data-eos-id="src/pages/admin/collective-detail.tsx#38" className="flex items-center gap-2 mb-3">
          <Crown data-eos-id="src/pages/admin/collective-detail.tsx#39" size={16} className="text-warning-500" />
          <h3 data-eos-id="src/pages/admin/collective-detail.tsx#40" className="font-heading text-sm font-semibold text-neutral-900">
            Leadership Team
          </h3>
          <span data-eos-id="src/pages/admin/collective-detail.tsx#41" className="text-xs text-neutral-400 font-medium">({leaders.length})</span>
        </div>
        {leaders.length === 0 ? (
          <div data-eos-id="src/pages/admin/collective-detail.tsx#42" className="rounded-md border border-dashed border-neutral-100 p-6 text-center">
            <p data-eos-id="src/pages/admin/collective-detail.tsx#43" className="text-sm text-neutral-400">No leaders assigned yet</p>
          </div>
        ) : (
          <div data-eos-id="src/pages/admin/collective-detail.tsx#44" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {leaders.map((m, i) => {
              const Icon = ROLE_ICONS[m.role ?? 'participant']
              const accent = ROLE_CARD_ACCENTS[m.role ?? 'participant']
              return (
                <motion.div data-eos-id="src/pages/admin/collective-detail.tsx#45"
                  key={m.id}
                  initial={rm ? { opacity: 1 } : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: rm ? 0 : 0.4 + i * 0.05 }}
                  className={cn(
                    'relative overflow-hidden rounded-md p-4 border',
                    accent.bg,
                    accent.border,
                  )}
                >
                  <div data-eos-id="src/pages/admin/collective-detail.tsx#46" className="relative z-10 flex items-center gap-3">
                    <Avatar data-eos-id="src/pages/admin/collective-detail.tsx#47"
                      src={m.profiles?.avatar_url}
                      name={m.profiles?.display_name}
                      size="md"
                    />
                    <div data-eos-id="src/pages/admin/collective-detail.tsx#48" className="flex-1 min-w-0">
                      <p data-eos-id="src/pages/admin/collective-detail.tsx#49" data-eos-var="m.profiles.display_name" data-eos-var-label="Display name" data-eos-var-scope="item" className="text-[13px] sm:text-sm font-semibold text-neutral-900 line-clamp-2 leading-snug">
                        {m.profiles?.display_name ?? 'Unknown'}
                      </p>
                      {m.profiles?.instagram_handle && (
                        <p data-eos-id="src/pages/admin/collective-detail.tsx#50" data-eos-var="m.profiles.instagram_handle" data-eos-var-label="Instagram handle" data-eos-var-scope="item" className="text-xs text-neutral-400 truncate">
                          @{m.profiles.instagram_handle}
                        </p>
                      )}
                      <span data-eos-id="src/pages/admin/collective-detail.tsx#51" data-eos-var="ROLE_LABELS.[..]" data-eos-var-label="]" data-eos-var-scope="prop"
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold mt-1.5',
                          ROLE_COLORS[m.role ?? 'participant'],
                        )}
                      >
                        <Icon data-eos-id="src/pages/admin/collective-detail.tsx#52" size={10} />
                        {ROLE_LABELS[m.role ?? 'participant']}
                      </span>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </motion.div>

      {/* ── Upcoming events ── */}
      <motion.div data-eos-id="src/pages/admin/collective-detail.tsx#53"
        initial={rm ? { opacity: 1 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.45 }}
      >
        <div data-eos-id="src/pages/admin/collective-detail.tsx#54" className="flex items-center justify-between gap-2 mb-3">
          <div data-eos-id="src/pages/admin/collective-detail.tsx#55" className="flex items-center gap-2">
            <CalendarDays data-eos-id="src/pages/admin/collective-detail.tsx#56" size={16} className="text-accent-500" />
            <h3 data-eos-id="src/pages/admin/collective-detail.tsx#57" className="font-heading text-sm font-semibold text-neutral-900">Upcoming Events</h3>
            <span data-eos-id="src/pages/admin/collective-detail.tsx#58" className="text-xs text-neutral-400 font-medium">({upcomingEvents.length})</span>
          </div>
        </div>
        {upcomingEvents.length === 0 ? (
          <div data-eos-id="src/pages/admin/collective-detail.tsx#59" className="rounded-md border border-dashed border-neutral-100 p-6 text-center">
            <p data-eos-id="src/pages/admin/collective-detail.tsx#60" className="text-sm text-neutral-400">No upcoming events</p>
          </div>
        ) : (
          <div data-eos-id="src/pages/admin/collective-detail.tsx#61" className="space-y-2">
            {upcomingEvents.map((ev, i) => (
              <EventRow data-eos-id="src/pages/admin/collective-detail.tsx#62" key={ev.id} event={ev} reducedMotion={rm} delay={0.5 + i * 0.04} />
            ))}
          </div>
        )}
      </motion.div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Event row - rich card style                                        */
/* ------------------------------------------------------------------ */

const EVENT_STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  draft: { bg: 'bg-neutral-100', text: 'text-neutral-600', dot: 'bg-neutral-400' },
  published: { bg: 'bg-primary-100', text: 'text-primary-700', dot: 'bg-primary-500' },
  completed: { bg: 'bg-success-100', text: 'text-success-700', dot: 'bg-success-500' },
  cancelled: { bg: 'bg-error-100', text: 'text-error-600', dot: 'bg-error-500' },
}

function EventRow({ event, reducedMotion, delay = 0 }: { event: AdminCollectiveEvent; reducedMotion: boolean; delay?: number }) {
  const date = new Date(event.date_start)
  const status = EVENT_STATUS_STYLES[event.status] ?? EVENT_STATUS_STYLES.draft
  // Floating-local: date_start is wall-clock-as-UTC. Pin UTC so the host's
  // wall-clock day/time shows verbatim, not shifted by the viewer's offset.
  const dateLabel = date.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
  const timeLabel = date.toLocaleTimeString('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  })

  return (
    <motion.div data-eos-id="src/pages/admin/collective-detail.tsx#63"
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: reducedMotion ? 0 : Math.min(delay, 0.3) }}
    >
      <Link data-eos-id="src/pages/admin/collective-detail.tsx#64"
        to={`/events/${event.id}`}
        className="group flex items-stretch gap-3 rounded-md bg-white shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
      >
        {/* Cover image (or date block if no image) */}
        {event.cover_image_url ? (
          <div data-eos-id="src/pages/admin/collective-detail.tsx#65" className="relative w-20 sm:w-28 shrink-0 bg-neutral-100">
            <OptimizedImage data-eos-id="src/pages/admin/collective-detail.tsx#66"
              src={event.cover_image_url}
              alt={event.title}
              sizes="112px"
              wrapperClassName="absolute inset-0"
            />
            <div data-eos-id="src/pages/admin/collective-detail.tsx#67" className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-3 pb-1 text-center">
              <span data-eos-id="src/pages/admin/collective-detail.tsx#68" data-eos-var="date.toLocaleDateString" data-eos-var-label="To locale date string" data-eos-var-scope="prop" className="block text-[9px] font-bold text-white/85 uppercase leading-none">
                {date.toLocaleDateString('en-AU', { month: 'short' })}
              </span>
              <span data-eos-id="src/pages/admin/collective-detail.tsx#69" data-eos-var="date.getDate" data-eos-var-label="Get date" data-eos-var-scope="prop" className="block text-sm font-bold text-white leading-tight">
                {date.getDate()}
              </span>
            </div>
          </div>
        ) : (
          <div data-eos-id="src/pages/admin/collective-detail.tsx#70" className="flex flex-col items-center justify-center w-20 sm:w-28 shrink-0 bg-neutral-50 border-r border-neutral-100">
            <span data-eos-id="src/pages/admin/collective-detail.tsx#71" data-eos-var="date.toLocaleDateString" data-eos-var-label="To locale date string" data-eos-var-scope="prop" className="text-[11px] font-bold text-neutral-500 uppercase leading-none">
              {date.toLocaleDateString('en-AU', { month: 'short' })}
            </span>
            <span data-eos-id="src/pages/admin/collective-detail.tsx#72" data-eos-var="date.getDate" data-eos-var-label="Get date" data-eos-var-scope="prop" className="text-xl font-bold text-neutral-900 leading-tight">
              {date.getDate()}
            </span>
          </div>
        )}

        {/* Content */}
        <div data-eos-id="src/pages/admin/collective-detail.tsx#73" className="flex-1 min-w-0 py-3 pr-3">
          <div data-eos-id="src/pages/admin/collective-detail.tsx#74" className="flex items-start justify-between gap-2">
            <p data-eos-id="src/pages/admin/collective-detail.tsx#75" data-eos-var="event.title" data-eos-var-label="Title" data-eos-var-scope="prop" className="text-[13px] sm:text-sm font-semibold text-neutral-900 line-clamp-2 leading-snug group-hover:text-primary-700 transition-colors">
              {event.title || 'Untitled event'}
            </p>
            <span data-eos-id="src/pages/admin/collective-detail.tsx#76" data-eos-var="event.status" data-eos-var-label="Status" data-eos-var-scope="prop"
              className={cn(
                'inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize shrink-0',
                status.bg,
                status.text,
              )}
            >
              <span data-eos-id="src/pages/admin/collective-detail.tsx#77" className={cn('w-1.5 h-1.5 rounded-full', status.dot)} />
              {event.status}
            </span>
          </div>
          <p data-eos-id="src/pages/admin/collective-detail.tsx#78" className="text-xs text-neutral-500 mt-0.5 truncate">
            {dateLabel} · {timeLabel}
          </p>
          {event.address && (
            <p data-eos-id="src/pages/admin/collective-detail.tsx#79" data-eos-var="event.address" data-eos-var-label="Address" data-eos-var-scope="prop" className="text-xs text-neutral-400 mt-0.5 truncate flex items-center gap-1">
              <MapPin data-eos-id="src/pages/admin/collective-detail.tsx#80" size={11} className="shrink-0" />
              {event.address}
            </p>
          )}
          <div data-eos-id="src/pages/admin/collective-detail.tsx#81" className="flex items-center gap-2 mt-1 text-[11px] text-neutral-500">
            <span data-eos-id="src/pages/admin/collective-detail.tsx#82" data-eos-var="event.activity_type" data-eos-var-label="Activity type" data-eos-var-scope="prop" className="capitalize">{event.activity_type.replace(/_/g, ' ')}</span>
            <span data-eos-id="src/pages/admin/collective-detail.tsx#83" className="w-1 h-1 rounded-full bg-neutral-300" />
            <span data-eos-id="src/pages/admin/collective-detail.tsx#84" data-eos-var="event.registrationCount,event.capacity" data-eos-var-label="Registration count, Capacity" data-eos-var-scope="prop">
              {event.registrationCount} registered
              {event.capacity ? ` / ${event.capacity} cap` : ''}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Members tab                                                        */
/* ------------------------------------------------------------------ */

function MembersTab({ collectiveId }: { collectiveId: string }) {
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [roleAssignMember, setRoleAssignMember] = useState<AdminCollectiveMember | null>(null)
  const [removingMember, setRemovingMember] = useState<AdminCollectiveMember | null>(null)
  const [showAddMember, setShowAddMember] = useState(false)

  const { data: detail } = useAdminCollectiveDetail(collectiveId)
  const { data: members = [], isLoading } = useAdminCollectiveMembers(
    collectiveId,
    showInactive ? 'all' : 'active',
  )
  const showLoading = useDelayedLoading(isLoading)
  const updateRole = useAdminUpdateMemberRole()
  const removeMember = useAdminRemoveMember()
  const restoreMember = useAdminRestoreMember()

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return members
    const q = search.toLowerCase()
    return members.filter(
      (m) =>
        m.profiles?.display_name?.toLowerCase().includes(q) ||
        m.profiles?.instagram_handle?.toLowerCase().includes(q),
    )
  }, [members, search])

  const handleRoleChange = async (userId: string, role: CollectiveRole) => {
    try {
      await updateRole.mutateAsync({ collectiveId, userId, role })
      setRoleAssignMember(null)
      toast.success(`Role updated to ${ROLE_LABELS[role]}`)
    } catch {
      toast.error('Failed to update role')
    }
  }

  const handleRemove = async () => {
    if (!removingMember) return
    try {
      await removeMember.mutateAsync({
        collectiveId,
        userId: removingMember.user_id,
      })
      toast.success('Member removed')
    } catch {
      toast.error('Failed to remove member')
    }
    setRemovingMember(null)
  }

  const handleRestore = async (member: AdminCollectiveMember) => {
    try {
      await restoreMember.mutateAsync({
        collectiveId,
        userId: member.user_id,
      })
      toast.success('Member restored')
    } catch {
      toast.error('Failed to restore member')
    }
  }

  const handleExport = () => {
    exportAdminMembersCSV(members, detail?.name ?? 'collective')
    toast.success('CSV downloaded')
  }

  if (showLoading) return <Skeleton data-eos-id="src/pages/admin/collective-detail.tsx#85" variant="list-item" count={8} />

  return (
    <div data-eos-id="src/pages/admin/collective-detail.tsx#86" className="space-y-5">
      {/* ── Search & controls ── */}
      <div data-eos-id="src/pages/admin/collective-detail.tsx#87" className="rounded-md bg-neutral-50 border border-neutral-100 p-4">
        <div data-eos-id="src/pages/admin/collective-detail.tsx#88" className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <SearchBar data-eos-id="src/pages/admin/collective-detail.tsx#89" value={search} onChange={setSearch} placeholder="Search by name or handle..." compact className="flex-1" />
          <div data-eos-id="src/pages/admin/collective-detail.tsx#90" className="flex items-center gap-2">
            <button data-eos-id="src/pages/admin/collective-detail.tsx#91"
              type="button"
              onClick={() => setShowInactive((p) => !p)}
              className={cn(
                'h-10 px-3.5 rounded-full text-xs font-semibold',
                'active:scale-[0.98] transition-[color,background-color,transform] duration-200 cursor-pointer select-none',
                showInactive
                  ? 'bg-primary-700 text-white shadow-sm'
                  : 'bg-white text-neutral-500 hover:bg-neutral-50 shadow-sm',
              )}
            >
              {showInactive ? 'All statuses' : 'Active only'}
            </button>
            <Button data-eos-id="src/pages/admin/collective-detail.tsx#92"
              variant="ghost"
              size="sm"
              icon={<UserPlus data-eos-id="src/pages/admin/collective-detail.tsx#93" size={16} />}
              onClick={() => setShowAddMember(true)}
            >
              Add
            </Button>
            <Button data-eos-id="src/pages/admin/collective-detail.tsx#94"
              variant="ghost"
              size="sm"
              icon={<Download data-eos-id="src/pages/admin/collective-detail.tsx#95" size={16} />}
              onClick={handleExport}
            >
              CSV
            </Button>
          </div>
        </div>
        <p data-eos-id="src/pages/admin/collective-detail.tsx#96" className="text-xs text-neutral-400 mt-3 pl-1">
          {filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''}
          {search && ` matching "${search}"`}
        </p>
      </div>

      {/* ── Member list ── */}
      {filteredMembers.length === 0 ? (
        <EmptyState data-eos-id="src/pages/admin/collective-detail.tsx#97"
          illustration="empty"
          title="No members found"
          description={search ? 'Try a different search' : 'This collective has no members yet'}
        />
      ) : (
        <div data-eos-id="src/pages/admin/collective-detail.tsx#98" className="space-y-1.5">
          {filteredMembers.map((member) => {
            const Icon = ROLE_ICONS[member.role ?? 'participant']
            const isInactive = member.status !== 'active'

            return (
              <div data-eos-id="src/pages/admin/collective-detail.tsx#99"
                key={member.id}
                className={cn(
                  'flex items-center gap-3 rounded-md px-4 py-3 transition-colors duration-200',
                  isInactive
                    ? 'opacity-50 bg-neutral-50/80'
                    : 'bg-white shadow-sm hover:shadow',
                )}
              >
                <Avatar data-eos-id="src/pages/admin/collective-detail.tsx#100"
                  src={member.profiles?.avatar_url}
                  name={member.profiles?.display_name}
                  size="sm"
                />

                <div data-eos-id="src/pages/admin/collective-detail.tsx#101" className="flex-1 min-w-0">
                  <p data-eos-id="src/pages/admin/collective-detail.tsx#102" data-eos-var="member.profiles.display_name" data-eos-var-label="Display name" data-eos-var-scope="item" className="text-[13px] sm:text-sm font-semibold text-neutral-900 line-clamp-2 leading-snug">
                    {member.profiles?.display_name ?? 'Unknown'}
                  </p>
                  <div data-eos-id="src/pages/admin/collective-detail.tsx#103" className="flex items-center gap-2 mt-0.5">
                    <span data-eos-id="src/pages/admin/collective-detail.tsx#104" data-eos-var="ROLE_LABELS.[..]" data-eos-var-label="]" data-eos-var-scope="prop"
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        ROLE_COLORS[member.role ?? 'participant'],
                      )}
                    >
                      <Icon data-eos-id="src/pages/admin/collective-detail.tsx#105" size={10} />
                      {ROLE_LABELS[member.role ?? 'participant']}
                    </span>
                    {member.profiles?.instagram_handle && (
                      <span data-eos-id="src/pages/admin/collective-detail.tsx#106" data-eos-var="member.profiles.instagram_handle" data-eos-var-label="Instagram handle" data-eos-var-scope="item" className="text-[11px] text-neutral-400 truncate">
                        @{member.profiles.instagram_handle}
                      </span>
                    )}
                    {isInactive && (
                      <span data-eos-id="src/pages/admin/collective-detail.tsx#107" data-eos-var="member.status" data-eos-var-label="Status" data-eos-var-scope="item" className="text-[11px] font-semibold text-error-500 capitalize">
                        {member.status}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div data-eos-id="src/pages/admin/collective-detail.tsx#108" className="flex items-center gap-1 shrink-0">
                  {isInactive ? (
                    <button data-eos-id="src/pages/admin/collective-detail.tsx#109"
                      type="button"
                      onClick={() => handleRestore(member)}
                      className="p-2.5 rounded-sm text-neutral-400 hover:bg-neutral-50 cursor-pointer active:scale-[0.98] transition-[colors,transform]"
                      aria-label="Restore member"
                    >
                      <RotateCcw data-eos-id="src/pages/admin/collective-detail.tsx#110" size={14} />
                    </button>
                  ) : (
                    <>
                      <button data-eos-id="src/pages/admin/collective-detail.tsx#111"
                        type="button"
                        onClick={() => setRoleAssignMember(member)}
                        className="p-2.5 rounded-sm text-neutral-400 hover:bg-neutral-50 cursor-pointer active:scale-[0.98] transition-[colors,transform]"
                        aria-label="Change role"
                      >
                        <Shield data-eos-id="src/pages/admin/collective-detail.tsx#112" size={14} />
                      </button>
                      <button data-eos-id="src/pages/admin/collective-detail.tsx#113"
                        type="button"
                        onClick={() => setRemovingMember(member)}
                        className="p-2.5 rounded-sm text-neutral-400 hover:bg-error-50 hover:text-error-500 cursor-pointer active:scale-[0.98] transition-[colors,transform]"
                        aria-label="Remove member"
                      >
                        <UserMinus data-eos-id="src/pages/admin/collective-detail.tsx#114" size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Role assignment sheet */}
      {roleAssignMember && (
        <BottomSheet data-eos-id="src/pages/admin/collective-detail.tsx#115" open={!!roleAssignMember} onClose={() => setRoleAssignMember(null)}>
          <div data-eos-id="src/pages/admin/collective-detail.tsx#116" className="space-y-4 pb-2">
            <div data-eos-id="src/pages/admin/collective-detail.tsx#117">
              <h3 data-eos-id="src/pages/admin/collective-detail.tsx#118" className="font-heading text-lg font-semibold text-neutral-900">
                Change Role
              </h3>
              <p data-eos-id="src/pages/admin/collective-detail.tsx#119" data-eos-var="roleAssignMember.profiles.display_name" data-eos-var-label="Display name" data-eos-var-scope="prop" className="text-sm text-neutral-500 mt-1">
                {roleAssignMember.profiles?.display_name ?? 'Member'} is currently{' '}
                <strong data-eos-id="src/pages/admin/collective-detail.tsx#120" data-eos-var="ROLE_LABELS.[..]" data-eos-var-label="]" data-eos-var-scope="prop" className="text-neutral-700">{ROLE_LABELS[roleAssignMember.role ?? 'participant']}</strong>
              </p>
            </div>

            <div data-eos-id="src/pages/admin/collective-detail.tsx#121" className="space-y-1.5">
              {ALL_ROLES.map((role) => {
                const RoleIcon = ROLE_ICONS[role]
                const isActive = roleAssignMember.role === role
                const accent = ROLE_CARD_ACCENTS[role]

                return (
                  <button data-eos-id="src/pages/admin/collective-detail.tsx#122"
                    key={role}
                    type="button"
                    onClick={() => handleRoleChange(roleAssignMember.user_id, role)}
                    disabled={isActive}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-sm px-4 py-3.5 min-h-11 text-sm',
                      'active:scale-[0.97] transition-[color,background-color,transform] duration-150 cursor-pointer select-none border',
                      isActive
                        ? cn(accent.bg, accent.border, 'text-neutral-700')
                        : 'bg-white border-transparent text-neutral-900 hover:bg-neutral-50',
                    )}
                  >
                    <span data-eos-id="src/pages/admin/collective-detail.tsx#123" className={cn('flex items-center justify-center w-8 h-8 rounded-sm', isActive ? accent.icon : 'bg-neutral-50 text-neutral-400')}>
                      <RoleIcon data-eos-id="src/pages/admin/collective-detail.tsx#124" size={16} />
                    </span>
                    <span data-eos-id="src/pages/admin/collective-detail.tsx#125" data-eos-var="ROLE_LABELS.[..]" data-eos-var-label="]" data-eos-var-scope="prop" className="font-medium">{ROLE_LABELS[role]}</span>
                    {isActive && (
                      <span data-eos-id="src/pages/admin/collective-detail.tsx#126" className="ml-auto text-xs text-neutral-500 font-semibold bg-white/80 px-2 py-0.5 rounded-full">
                        Current
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </BottomSheet>
      )}

      {/* Remove confirmation */}
      <ConfirmationSheet data-eos-id="src/pages/admin/collective-detail.tsx#127"
        open={!!removingMember}
        onClose={() => setRemovingMember(null)}
        onConfirm={handleRemove}
        title="Remove member?"
        description={`${removingMember?.profiles?.display_name ?? 'This member'} will be removed from the collective and lose access to chat and events.`}
        confirmLabel="Remove Member"
        variant="danger"
      />

      {/* Add member modal */}
      {showAddMember && (
        <AddMemberModal data-eos-id="src/pages/admin/collective-detail.tsx#128"
          collectiveId={collectiveId}
          open={showAddMember}
          onClose={() => setShowAddMember(false)}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Add member modal                                                   */
/* ------------------------------------------------------------------ */

function AddMemberModal({
  collectiveId,
  open,
  onClose,
}: {
  collectiveId: string
  open: boolean
  onClose: () => void
}) {
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const [selectedRole, setSelectedRole] = useState<CollectiveRole>('participant')
  const { data: results = [], isLoading } = useSearchUsers(query)
  const showLoading = useDelayedLoading(isLoading)
  const addMember = useAdminAddMember()

  const handleAdd = async (userId: string) => {
    try {
      await addMember.mutateAsync({
        collectiveId,
        userId,
        role: selectedRole,
      })
      toast.success('Member added')
      onClose()
    } catch {
      toast.error('Failed to add member')
    }
  }

  return (
    <BottomSheet data-eos-id="src/pages/admin/collective-detail.tsx#129" open={open} onClose={onClose}>
      {/* Header */}
      <div data-eos-id="src/pages/admin/collective-detail.tsx#130" className="flex items-center justify-between mb-4">
        <h2 data-eos-id="src/pages/admin/collective-detail.tsx#131" className="font-heading text-lg font-semibold text-neutral-900">Add Member</h2>
        <button data-eos-id="src/pages/admin/collective-detail.tsx#132"
          onClick={onClose}
          className="flex items-center justify-center rounded-full min-w-11 min-h-11 text-neutral-400 hover:bg-neutral-50 active:scale-[0.98] transition-[colors,transform] duration-150 cursor-pointer"
          aria-label="Close"
        >
          <X data-eos-id="src/pages/admin/collective-detail.tsx#133" size={20} />
        </button>
      </div>
      <div data-eos-id="src/pages/admin/collective-detail.tsx#134" className="space-y-4">
        <Input data-eos-id="src/pages/admin/collective-detail.tsx#135"
          label="Search users"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name..."
        />

        <Dropdown data-eos-id="src/pages/admin/collective-detail.tsx#136"
          label="Role"
          options={ALL_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
          value={selectedRole}
          onChange={(v) => setSelectedRole(v as CollectiveRole)}
        />

        {/* Results */}
        {query.length >= 2 && (
          <div data-eos-id="src/pages/admin/collective-detail.tsx#137" className="space-y-1.5 max-h-64 overflow-y-auto">
            {showLoading ? (
              <Skeleton data-eos-id="src/pages/admin/collective-detail.tsx#138" variant="list-item" count={3} />
            ) : results.length === 0 ? (
              <p data-eos-id="src/pages/admin/collective-detail.tsx#139" className="text-sm text-neutral-400 py-4 text-center">
                No users found for &quot;{query}&quot;
              </p>
            ) : (
              results.map((user) => (
                <button data-eos-id="src/pages/admin/collective-detail.tsx#140"
                  key={user.id}
                  type="button"
                  onClick={() => handleAdd(user.id)}
                  disabled={addMember.isPending}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left',
                    'hover:bg-neutral-50 active:scale-[0.98] transition-[color,background-color,transform] duration-150',
                    'cursor-pointer select-none',
                  )}
                >
                  <Avatar data-eos-id="src/pages/admin/collective-detail.tsx#141"
                    src={user.avatar_url}
                    name={user.display_name}
                    size="sm"
                  />
                  <div data-eos-id="src/pages/admin/collective-detail.tsx#142" className="flex-1 min-w-0">
                    <p data-eos-id="src/pages/admin/collective-detail.tsx#143" data-eos-var="user.display_name" data-eos-var-label="Display name" data-eos-var-scope="item" className="text-[13px] sm:text-sm font-medium text-neutral-900 line-clamp-2 leading-snug">
                      {user.display_name ?? 'Unknown'}
                    </p>
                    {user.instagram_handle && (
                      <p data-eos-id="src/pages/admin/collective-detail.tsx#144" data-eos-var="user.instagram_handle" data-eos-var-label="Instagram handle" data-eos-var-scope="item" className="text-xs text-neutral-400 truncate">@{user.instagram_handle}</p>
                    )}
                  </div>
                  <UserPlus data-eos-id="src/pages/admin/collective-detail.tsx#145" size={16} className="text-neutral-400 shrink-0" />
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Events tab                                                         */
/* ------------------------------------------------------------------ */

function EventsTab({ collectiveId, reducedMotion }: { collectiveId: string; reducedMotion: boolean }) {
  const rm = reducedMotion
  const { data: events = [], isLoading } = useAdminCollectiveEvents(collectiveId)
  const showLoading = useDelayedLoading(isLoading)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return events
    return events.filter((e) => e.status === statusFilter)
  }, [events, statusFilter])

  const statuses = ['all', 'published', 'completed', 'draft', 'cancelled']

  const statusColors: Record<string, { active: string; inactive: string }> = {
    all: { active: 'bg-primary-700 text-white', inactive: 'bg-white text-neutral-500' },
    published: { active: 'bg-primary-600 text-white', inactive: 'bg-white text-neutral-500' },
    completed: { active: 'bg-success-600 text-white', inactive: 'bg-white text-success-600' },
    draft: { active: 'bg-neutral-600 text-white', inactive: 'bg-white text-neutral-500' },
    cancelled: { active: 'bg-error-600 text-white', inactive: 'bg-white text-error-500' },
  }

  if (showLoading) return <Skeleton data-eos-id="src/pages/admin/collective-detail.tsx#146" variant="list-item" count={5} />

  return (
    <div data-eos-id="src/pages/admin/collective-detail.tsx#147" className="space-y-5">
      {/* ── Status filter pills ── */}
      <div data-eos-id="src/pages/admin/collective-detail.tsx#148" className="flex items-center gap-2 flex-wrap">
        {statuses.map((s) => {
          const isActive = statusFilter === s
          const colors = statusColors[s] ?? statusColors.all
          return (
            <button data-eos-id="src/pages/admin/collective-detail.tsx#149"
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                'h-9 px-4 rounded-full text-xs font-semibold capitalize',
                'active:scale-[0.98] transition-[color,background-color,transform] duration-200 cursor-pointer select-none shadow-sm',
                isActive ? colors.active : colors.inactive,
                isActive && 'shadow-sm',
              )}
            >
              {s}
              {s !== 'all' && (
                <span data-eos-id="src/pages/admin/collective-detail.tsx#150" data-eos-var="e.status" data-eos-var-label="Status" data-eos-var-scope="prop" className={cn('ml-1.5', isActive ? 'opacity-70' : 'opacity-50')}>
                  {events.filter((e) => e.status === s).length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Event list ── */}
      {filtered.length === 0 ? (
        <EmptyState data-eos-id="src/pages/admin/collective-detail.tsx#151"
          illustration="empty"
          title="No events"
          description={statusFilter !== 'all' ? 'No events with this status' : 'This collective has no events yet'}
        />
      ) : (
        <div data-eos-id="src/pages/admin/collective-detail.tsx#152" className="space-y-2">
          {filtered.map((ev, i) => (
            <EventRow data-eos-id="src/pages/admin/collective-detail.tsx#153" key={ev.id} event={ev} reducedMotion={rm} delay={i * 0.03} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Settings tab                                                       */
/* ------------------------------------------------------------------ */

function SettingsTab({ collectiveId }: { collectiveId: string }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { isSuperAdmin } = useAuth()

  const { data: detail } = useAdminCollectiveDetail(collectiveId)
  const updateCollective = useAdminUpdateCollective()
  const archiveCollective = useArchiveCollective()
  const deleteCollective = useDeleteCollective()
  const { upload, uploading, progress } = useImageUpload({ bucket: 'collective-images', pathPrefix: 'covers' })

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [region, setRegion] = useState('')
  const [state, setState] = useState('')
  const [slug, setSlug] = useState('')
  const [timezone, setTimezone] = useState('Australia/Sydney')
  const [initializedFor, setInitializedFor] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)

  // Initialize form when detail loads (or re-initialize when collectiveId changes)
  if (detail && initializedFor !== collectiveId) {
    setName(detail.name)
    setDescription(detail.description ?? '')
    setRegion(detail.region ?? '')
    setState(detail.state ?? '')
    setSlug(detail.slug)
    setTimezone((detail as { timezone?: string | null }).timezone ?? 'Australia/Sydney')
    setCoverPreview(detail.cover_image_url)
    setInitializedFor(collectiveId)
  }

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Force a fresh file input after each upload to avoid stale DOM state
    setFileInputKey((k) => k + 1)
    try {
      const result = await upload(file)
      setCoverPreview(result.url)
      await updateCollective.mutateAsync({
        collectiveId,
        updates: { cover_image_url: result.url },
      })
      toast.success('Cover image updated')
    } catch {
      toast.error('Failed to upload image')
    }
  }

  const handleCoverRemove = async () => {
    try {
      await updateCollective.mutateAsync({
        collectiveId,
        updates: { cover_image_url: null },
      })
      setCoverPreview(null)
      toast.success('Cover image removed')
    } catch {
      toast.error('Failed to remove image')
    }
  }

  const handleSave = async () => {
    try {
      await updateCollective.mutateAsync({
        collectiveId,
        updates: {
          name,
          description: description || null,
          region: region || null,
          state: state || null,
          slug: slug || undefined,
          timezone,
        },
      })
      toast.success('Collective updated')
    } catch {
      toast.error('Failed to update collective')
    }
  }

  const handleArchiveToggle = async () => {
    if (!detail) return
    try {
      await archiveCollective.mutateAsync({
        collectiveId,
        archive: detail.is_active ?? false,
      })
      toast.success(detail.is_active ? 'Collective archived' : 'Collective restored')
    } catch {
      toast.error('Failed to update status')
    }
  }

  const handleDelete = async () => {
    try {
      await deleteCollective.mutateAsync(collectiveId)
      toast.success('Collective permanently deleted')
      navigate('/admin/collectives')
    } catch {
      toast.error('Failed to delete collective')
    }
    setShowDeleteConfirm(false)
  }

  if (!detail) return <Skeleton data-eos-id="src/pages/admin/collective-detail.tsx#154" variant="card" count={2} />

  return (
    <div data-eos-id="src/pages/admin/collective-detail.tsx#155" className="space-y-6 max-w-xl">
      {/* ── Cover image ── */}
      <div data-eos-id="src/pages/admin/collective-detail.tsx#156" className="rounded-md bg-white shadow-sm overflow-hidden">
        <div data-eos-id="src/pages/admin/collective-detail.tsx#157" className="bg-neutral-50 px-5 py-3 border-b border-neutral-100">
          <h3 data-eos-id="src/pages/admin/collective-detail.tsx#158" className="font-heading text-sm font-semibold text-neutral-700">
            Cover Image
          </h3>
        </div>
        <div data-eos-id="src/pages/admin/collective-detail.tsx#159" className="p-5">
          <div data-eos-id="src/pages/admin/collective-detail.tsx#160" className="relative rounded-sm overflow-hidden bg-neutral-50" style={{ aspectRatio: '16/9' }}>
            {coverPreview ? (
              <img data-eos-src="dynamic" data-eos-src-label="Cover preview" data-eos-id="src/pages/admin/collective-detail.tsx#161" src={coverPreview} alt="Cover" loading="lazy" className="w-full h-full object-cover" />
            ) : (
              <div data-eos-id="src/pages/admin/collective-detail.tsx#162" className="flex flex-col items-center justify-center h-full text-neutral-300 gap-2">
                <ImagePlus data-eos-id="src/pages/admin/collective-detail.tsx#163" size={32} />
                <span data-eos-id="src/pages/admin/collective-detail.tsx#164" className="text-xs font-medium">No cover image</span>
              </div>
            )}
            {uploading && (
              <div data-eos-id="src/pages/admin/collective-detail.tsx#165" className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div data-eos-id="src/pages/admin/collective-detail.tsx#166" className="bg-white rounded-sm px-4 py-2 shadow-sm">
                  <p data-eos-id="src/pages/admin/collective-detail.tsx#167" className="text-xs font-semibold text-neutral-700 tabular-nums">{progress ?? 0}%</p>
                </div>
              </div>
            )}
          </div>
          <div data-eos-id="src/pages/admin/collective-detail.tsx#168" className="flex items-center gap-2 mt-3">
            <label data-eos-id="src/pages/admin/collective-detail.tsx#169"
              className={cn(
                'relative inline-flex items-center justify-center font-heading font-semibold',
                'rounded-sm cursor-pointer select-none',
                'transition-colors duration-150',
                'min-h-11 px-4 text-sm gap-1.5',
                'bg-neutral-100 text-neutral-900 shadow-sm hover:bg-neutral-200 hover:shadow',
                uploading && 'opacity-50 cursor-not-allowed pointer-events-none',
              )}
            >
              <span data-eos-id="src/pages/admin/collective-detail.tsx#170" className="flex items-center justify-center shrink-0">
                <Camera data-eos-id="src/pages/admin/collective-detail.tsx#171" size={14} />
              </span>
              <span data-eos-id="src/pages/admin/collective-detail.tsx#172">{coverPreview ? 'Replace' : 'Upload'}</span>
              <input data-eos-id="src/pages/admin/collective-detail.tsx#173"
                key={fileInputKey}
                type="file"
                accept="image/*"
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                onChange={handleCoverUpload}
                disabled={uploading}
              />
            </label>
            {coverPreview && (
              <Button data-eos-id="src/pages/admin/collective-detail.tsx#174"
                variant="ghost"
                size="sm"
                icon={<Trash2 data-eos-id="src/pages/admin/collective-detail.tsx#175" size={14} />}
                onClick={handleCoverRemove}
                disabled={uploading}
              >
                Remove
              </Button>
            )}
          </div>
          <p data-eos-id="src/pages/admin/collective-detail.tsx#176" className="text-[11px] text-neutral-400 mt-2">
            Recommended: 1200x675px (16:9). Shown on the collective page and discovery cards.
          </p>
        </div>
      </div>

      {/* ── Edit form ── */}
      <div data-eos-id="src/pages/admin/collective-detail.tsx#177" className="rounded-md bg-white shadow-sm overflow-hidden">
        <div data-eos-id="src/pages/admin/collective-detail.tsx#178" className="bg-neutral-50 px-5 py-3 border-b border-neutral-100">
          <h3 data-eos-id="src/pages/admin/collective-detail.tsx#179" className="font-heading text-sm font-semibold text-neutral-700">
            Collective Details
          </h3>
        </div>
        <div data-eos-id="src/pages/admin/collective-detail.tsx#180" className="p-5 space-y-4">
          <Input data-eos-id="src/pages/admin/collective-detail.tsx#181"
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <Input data-eos-id="src/pages/admin/collective-detail.tsx#182"
            label="Slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="url-safe-name"
          />

          <Input data-eos-id="src/pages/admin/collective-detail.tsx#183"
            type="textarea"
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tell people what this collective is about..."
            rows={4}
          />

          <PlaceAutocomplete data-eos-id="src/pages/admin/collective-detail.tsx#184"
            label="Region"
            value={region}
            onChange={(val, place) => {
              setRegion(val)
              if (place) {
                const stateMatch = place.short_name.split(',').pop()?.trim()
                const matched = AUSTRALIAN_STATES.find((s) => stateMatch?.includes(s))
                if (matched) setState(matched)
              }
            }}
            placeholder="e.g. Byron Bay"
          />

          <Dropdown data-eos-id="src/pages/admin/collective-detail.tsx#185"
            label="State"
            placeholder="Select state..."
            options={AUSTRALIAN_STATES.map((s) => ({ value: s, label: s }))}
            value={state}
            onChange={setState}
          />

          <Dropdown data-eos-id="src/pages/admin/collective-detail.tsx#186"
            label="Timezone"
            placeholder="Select timezone..."
            options={[
              { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
              { value: 'Australia/Melbourne', label: 'Melbourne (AEST/AEDT)' },
              { value: 'Australia/Hobart', label: 'Hobart (AEST/AEDT)' },
              { value: 'Australia/Brisbane', label: 'Brisbane (AEST, no DST)' },
              { value: 'Australia/Adelaide', label: 'Adelaide (ACST/ACDT)' },
              { value: 'Australia/Darwin', label: 'Darwin (ACST, no DST)' },
              { value: 'Australia/Perth', label: 'Perth (AWST)' },
            ]}
            value={timezone}
            onChange={setTimezone}
          />
          <p data-eos-id="src/pages/admin/collective-detail.tsx#187" className="-mt-3 text-xs text-neutral-500">
            Event start/end times for this collective are entered and shown in
            this timezone. Change with care - existing event times will be
            re-rendered against the new zone.
          </p>

          <div data-eos-id="src/pages/admin/collective-detail.tsx#188" className="pt-1">
            <Button data-eos-id="src/pages/admin/collective-detail.tsx#189"
              variant="primary"
              onClick={handleSave}
              loading={updateCollective.isPending}
              disabled={!name.trim()}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </div>

      {/* ── Danger zone ── */}
      <div data-eos-id="src/pages/admin/collective-detail.tsx#190" className="rounded-md overflow-hidden border border-error-200/40">
        <div data-eos-id="src/pages/admin/collective-detail.tsx#191" className="bg-error-50 px-5 py-3 border-b border-error-100/60">
          <h3 data-eos-id="src/pages/admin/collective-detail.tsx#192" className="font-heading text-sm font-semibold text-error-600 flex items-center gap-2">
            <AlertTriangle data-eos-id="src/pages/admin/collective-detail.tsx#193" size={14} />
            Danger Zone
          </h3>
        </div>
        <div data-eos-id="src/pages/admin/collective-detail.tsx#194" className="p-5 space-y-5">
          <div data-eos-id="src/pages/admin/collective-detail.tsx#195" className="flex items-center justify-between gap-4">
            <div data-eos-id="src/pages/admin/collective-detail.tsx#196">
              <p data-eos-id="src/pages/admin/collective-detail.tsx#197" data-eos-var="detail.is_active" data-eos-var-label="Is active" data-eos-var-scope="prop" className="text-sm font-semibold text-neutral-900">
                {detail.is_active ? 'Archive Collective' : 'Restore Collective'}
              </p>
              <p data-eos-id="src/pages/admin/collective-detail.tsx#198" data-eos-var="detail.is_active" data-eos-var-label="Is active" data-eos-var-scope="prop" className="text-xs text-neutral-400 mt-0.5 leading-relaxed">
                {detail.is_active
                  ? 'Hide this collective from members. Data is preserved.'
                  : 'Make this collective active and visible again.'}
              </p>
            </div>
            <Button data-eos-id="src/pages/admin/collective-detail.tsx#199" data-eos-var="detail.is_active" data-eos-var-label="Is active" data-eos-var-scope="prop"
              variant={detail.is_active ? 'danger' : 'primary'}
              size="sm"
              icon={detail.is_active ? <Archive data-eos-id="src/pages/admin/collective-detail.tsx#200" size={16} /> : <RotateCcw data-eos-id="src/pages/admin/collective-detail.tsx#201" size={16} />}
              onClick={handleArchiveToggle}
              loading={archiveCollective.isPending}
            >
              {detail.is_active ? 'Archive' : 'Restore'}
            </Button>
          </div>

          {isSuperAdmin && (
            <div data-eos-id="src/pages/admin/collective-detail.tsx#202" className="flex items-center justify-between gap-4 pt-3 border-t border-error-100/60">
              <div data-eos-id="src/pages/admin/collective-detail.tsx#203">
                <p data-eos-id="src/pages/admin/collective-detail.tsx#204" className="text-sm font-semibold text-error-700">
                  Permanently Delete
                </p>
                <p data-eos-id="src/pages/admin/collective-detail.tsx#205" className="text-xs text-error-500/80 mt-0.5 leading-relaxed">
                  This will permanently delete the collective, all members, events, and impact data. This cannot be undone.
                </p>
              </div>
              <Button data-eos-id="src/pages/admin/collective-detail.tsx#206"
                variant="danger"
                size="sm"
                icon={<AlertTriangle data-eos-id="src/pages/admin/collective-detail.tsx#207" size={16} />}
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      <ConfirmationSheet data-eos-id="src/pages/admin/collective-detail.tsx#208"
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Permanently delete collective?"
        description={`This will permanently delete "${detail.name}" and ALL associated data including members, events, and impact records. This action CANNOT be undone.`}
        confirmLabel="Delete Forever"
        variant="danger"
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function AdminCollectiveDetailPage() {
  const { collectiveId } = useParams<{ collectiveId: string }>()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  const { data: detail, isLoading } = useAdminCollectiveDetail(collectiveId)
  const showLoading = useDelayedLoading(isLoading)

  const heroActions = useMemo(
    () => (
      <Button data-eos-id="src/pages/admin/collective-detail.tsx#209"
        variant="ghost"
        size="sm"
        icon={<ExternalLink data-eos-id="src/pages/admin/collective-detail.tsx#210" size={14} />}
        onClick={() => navigate(`/collectives/${detail?.slug ?? collectiveId}`)}
        className="!text-white/70 hover:!text-white hover:!bg-white/10"
      >
        View Public
      </Button>
    ),
    [detail?.slug, collectiveId, navigate],
  )

  useAdminHeader(detail?.name ?? 'Collective', { actions: heroActions, fullBleed: true })

  if (showLoading) {
    return (
      <div data-eos-id="src/pages/admin/collective-detail.tsx#211" className="space-y-4 p-6">
        <Skeleton data-eos-id="src/pages/admin/collective-detail.tsx#212" className="h-8 w-32 rounded-sm" />
        <Skeleton data-eos-id="src/pages/admin/collective-detail.tsx#213" className="h-48 rounded-md" />
        <div data-eos-id="src/pages/admin/collective-detail.tsx#214" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton data-eos-id="src/pages/admin/collective-detail.tsx#215" key={i} className="h-32 rounded-md" />
          ))}
        </div>
      </div>
    )
  }
  if (!detail) {
    return (
      <EmptyState data-eos-id="src/pages/admin/collective-detail.tsx#216"
        illustration="error"
        title="Collective not found"
        description="This collective may have been deleted"
        action={{ label: 'Back to Collectives', onClick: () => navigate('/admin/collectives') }}
      />
    )
  }

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <TrendingUp data-eos-id="src/pages/admin/collective-detail.tsx#217" size={15} /> },
    { key: 'members', label: 'Members', icon: <Users data-eos-id="src/pages/admin/collective-detail.tsx#218" size={15} /> },
    { key: 'events', label: 'Events', icon: <CalendarDays data-eos-id="src/pages/admin/collective-detail.tsx#219" size={15} /> },
    { key: 'settings', label: 'Settings', icon: <Settings data-eos-id="src/pages/admin/collective-detail.tsx#220" size={15} /> },
  ]

  return (
    <motion.div data-eos-id="src/pages/admin/collective-detail.tsx#221"
      initial={rm ? { opacity: 1 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="relative"
    >
      {/* ── Sticky back button ── */}
      <div data-eos-id="src/pages/admin/collective-detail.tsx#222" className="sticky top-0 z-30 h-0 pointer-events-none">
        <div data-eos-id="src/pages/admin/collective-detail.tsx#223" className="px-4 pt-4 w-fit">
          <motion.button data-eos-id="src/pages/admin/collective-detail.tsx#224"
            type="button"
            onClick={() => navigate(-1)}
            whileTap={rm ? undefined : { scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className={cn(
              'pointer-events-auto flex items-center justify-center',
              'w-11 h-11 rounded-full',
              'bg-black/40 text-white hover:bg-black/50',
              'cursor-pointer select-none',
              'transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
            )}
            aria-label="Go back"
          >
            <ArrowLeft data-eos-id="src/pages/admin/collective-detail.tsx#225" size={22} />
          </motion.button>
        </div>
      </div>

      {/* ── Full-bleed cover image hero ── */}
      {detail.cover_image_url ? (
        <motion.div data-eos-id="src/pages/admin/collective-detail.tsx#226"
          initial={rm ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35 }}
          className="relative"
        >
          <img data-eos-src="dynamic" data-eos-src-label="Cover image url" data-eos-id="src/pages/admin/collective-detail.tsx#227"
            src={detail.cover_image_url}
            alt={detail.name}
            className="w-full block"
          />
          {/* Rocky wave overlay */}
          <WaveTransition data-eos-id="src/pages/admin/collective-detail.tsx#228" className="-bottom-px z-10" />
        </motion.div>
      ) : null}

      {/* ── Padded content below hero ── */}
      <div data-eos-id="src/pages/admin/collective-detail.tsx#229" className="space-y-6 p-6">

      {/* ── Tab bar ── */}
      <motion.div data-eos-id="src/pages/admin/collective-detail.tsx#230"
        initial={rm ? {} : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.05 }}
      >
        <SegmentedControl data-eos-id="src/pages/admin/collective-detail.tsx#231"
          segments={tabs.map((tab) => ({ id: tab.key, label: tab.label, icon: tab.icon }))}
          value={activeTab}
          onChange={setActiveTab}
          variant="pill"
          compact
          aria-label="Collective detail tabs"
        />
      </motion.div>

      {/* ── Tab content ── */}
      <AnimatePresence data-eos-id="src/pages/admin/collective-detail.tsx#232" mode="wait">
        <motion.div data-eos-id="src/pages/admin/collective-detail.tsx#233"
          key={activeTab}
          initial={rm ? { opacity: 1 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={rm ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'overview' && <OverviewTab data-eos-id="src/pages/admin/collective-detail.tsx#234" collectiveId={collectiveId!} reducedMotion={rm} />}
          {activeTab === 'members' && <MembersTab data-eos-id="src/pages/admin/collective-detail.tsx#235" collectiveId={collectiveId!} />}
          {activeTab === 'events' && <EventsTab data-eos-id="src/pages/admin/collective-detail.tsx#236" collectiveId={collectiveId!} reducedMotion={rm} />}
          {activeTab === 'settings' && <SettingsTab data-eos-id="src/pages/admin/collective-detail.tsx#237" key={collectiveId} collectiveId={collectiveId!} />}
        </motion.div>
      </AnimatePresence>
      </div>
    </motion.div>
  )
}
