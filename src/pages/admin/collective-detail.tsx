import { useState, useMemo } from 'react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useParams, useNavigate } from 'react-router-dom'
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
import { useAuth } from '@/hooks/use-auth'
import { useCountUp } from '@/components/stat-card'
import { WaveTransition } from '@/components/wave-transition'
import { SegmentedControl } from '@/components/segmented-control'
import { useImageUpload } from '@/hooks/use-image-upload'
import { CoverImageFocalPointPicker } from '@/components/cover-image-focal-point-picker'
import { coverImagePositionStyle } from '@/lib/cover-image'
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
  leader: { bg: 'bg-gradient-to-br from-warning-50 to-warning-100/60', border: 'border-warning-200/60', icon: 'bg-warning-100 text-warning-600' },
  co_leader: { bg: 'bg-white', border: 'border-neutral-100', icon: 'bg-primary-100 text-primary-600' },
  assist_leader: { bg: 'bg-gradient-to-br from-info-50 to-info-100/60', border: 'border-info-200/60', icon: 'bg-info-100 text-info-600' },
  participant: { bg: 'bg-gradient-to-br from-neutral-50 to-neutral-100/60', border: 'border-neutral-200/60', icon: 'bg-neutral-100 text-neutral-500' },
  member: { bg: 'bg-gradient-to-br from-neutral-50 to-neutral-100/60', border: 'border-neutral-200/60', icon: 'bg-neutral-100 text-neutral-500' },
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
    <motion.div
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, delay: reducedMotion ? 0 : delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex items-center gap-3 rounded-xl bg-white shadow-sm px-4 py-3.5 active:scale-[0.98] transition-transform duration-150"
      aria-label={`${label}: ${value}`}
    >
      <span className={cn('flex items-center justify-center w-10 h-10 rounded-xl shrink-0', color)} aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <p
          style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
          className="text-xl sm:text-2xl font-bold text-neutral-900 tabular-nums"
        >
          {display.toLocaleString()}
        </p>
        <p className="text-xs text-neutral-400 font-medium truncate">{label}</p>
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
    primary: 'bg-gradient-to-br from-primary-700 via-primary-800 to-primary-950 text-white',
    dark: 'bg-gradient-to-br from-primary-900 via-primary-950 to-neutral-900 text-white',
    accent: 'bg-gradient-to-br from-accent-500 via-accent-600 to-primary-700 text-white',
    default: 'bg-white text-neutral-900 shadow-sm',
  }
  const iconBg = { primary: 'bg-white/15', dark: 'bg-white/10', accent: 'bg-white/15', default: 'bg-primary-50' }
  const iconColor = { primary: 'text-white/80', dark: 'text-white/70', accent: 'text-white/80', default: 'text-neutral-500' }
  const labelColor = { primary: 'text-white/65', dark: 'text-white/55', accent: 'text-white/65', default: 'text-neutral-400' }
  const valColor = { primary: 'text-white', dark: 'text-white', accent: 'text-white', default: 'text-neutral-900' }

  return (
    <motion.div
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, delay: reducedMotion ? 0 : delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      style={{ willChange: 'transform' }}
      className={cn('relative overflow-hidden rounded-2xl p-4 sm:p-5', variantStyles[variant])}
    >
      {variant !== 'default' && (
        <>
          <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/[0.05]" />
          <div className="absolute -left-3 -bottom-6 w-16 h-16 rounded-full bg-white/[0.03]" />
        </>
      )}
      {variant === 'default' && (
        <>{/* decorative circle removed – design system */}</>
      )}
      <div className="relative z-10">
        <span className={cn('flex items-center justify-center w-9 h-9 rounded-xl mb-3', iconBg[variant], iconColor[variant])} aria-hidden="true">
          {icon}
        </span>
        <p style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }} className={cn('text-2xl sm:text-3xl font-bold tracking-tight tabular-nums', valColor[variant])}>
          {display.toLocaleString()}
        </p>
        <p className={cn('mt-0.5 text-sm font-medium', labelColor[variant])}>{label}</p>
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

  const recentEvents = events.slice(0, 5)

  // Build impact items (only show non-zero)
  const impactItems: { value: number; label: string; icon: React.ReactNode; color: string }[] = stats
    ? [
        { value: stats.trees_planted, label: 'Trees Planted', icon: <TreePine size={20} className="text-success-700" />, color: 'bg-success-50' },
        { value: Math.round(stats.rubbish_kg), label: 'Litter Removed (kg)', icon: <span className="text-lg text-primary-700" aria-hidden="true">&#9851;</span>, color: 'bg-primary-50' },
      ].filter((i) => i.value > 0)
    : []

  return (
    <div className="space-y-8">
      {/* ── Primary stats - 4 hero cards ── */}
      {showStatsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : statsLoading ? null : stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <HeroStat value={stats.member_count} label="Members" icon={<Users size={20} />} variant="primary" reducedMotion={rm} delay={0.05} />
          <HeroStat value={stats.event_count} label="Events" icon={<CalendarDays size={20} />} variant="accent" reducedMotion={rm} delay={0.1} />
          <HeroStat value={Math.round(stats.hours_total)} label="Est. Vol. Hours" icon={<Clock size={20} />} variant="dark" reducedMotion={rm} delay={0.15} />
          <HeroStat value={stats.trees_planted} label="Trees Planted" icon={<TreePine size={20} />} variant="default" reducedMotion={rm} delay={0.2} />
        </div>
      ) : null}

      {/* ── Environmental impact pills ── */}
      {impactItems.length > 0 && (
        <motion.div
          initial={rm ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.25 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-primary-500" />
            <h3 className="font-heading text-sm font-semibold text-neutral-900">Environmental Impact</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {impactItems.map((item, i) => (
              <RichStatCard
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
        <motion.div
          initial={rm ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-primary-500" />
            <h3 className="font-heading text-sm font-semibold text-neutral-900">Custom Metrics</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {customMetrics.map((cm, i) => (
              <RichStatCard
                key={cm.key}
                value={cm.total}
                label={metricLabels[cm.key] ?? cm.key.replace(/_/g, ' ')}
                icon={<TrendingUp size={20} className="text-primary-600" />}
                color="bg-primary-50"
                reducedMotion={rm}
                delay={0.35 + i * 0.04}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Leadership team ── */}
      <motion.div
        initial={rm ? { opacity: 1 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.35 }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Crown size={16} className="text-warning-500" />
          <h3 className="font-heading text-sm font-semibold text-neutral-900">
            Leadership Team
          </h3>
          <span className="text-xs text-neutral-400 font-medium">({leaders.length})</span>
        </div>
        {leaders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-100 p-6 text-center">
            <p className="text-sm text-neutral-400">No leaders assigned yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {leaders.map((m, i) => {
              const Icon = ROLE_ICONS[m.role ?? 'participant']
              const accent = ROLE_CARD_ACCENTS[m.role ?? 'participant']
              return (
                <motion.div
                  key={m.id}
                  initial={rm ? { opacity: 1 } : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: rm ? 0 : 0.4 + i * 0.05 }}
                  className={cn(
                    'relative overflow-hidden rounded-2xl p-4 border',
                    accent.bg,
                    accent.border,
                  )}
                >
                  <div className="absolute -right-4 -top-4 w-16 h-16 rounded-full bg-white/30" />
                  <div className="relative z-10 flex items-center gap-3">
                    <Avatar
                      src={m.profiles?.avatar_url}
                      name={m.profiles?.display_name}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-neutral-900 truncate">
                        {m.profiles?.display_name ?? 'Unknown'}
                      </p>
                      {m.profiles?.instagram_handle && (
                        <p className="text-xs text-neutral-400 truncate">
                          @{m.profiles.instagram_handle}
                        </p>
                      )}
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold mt-1.5',
                          ROLE_COLORS[m.role ?? 'participant'],
                        )}
                      >
                        <Icon size={10} />
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

      {/* ── Recent events ── */}
      <motion.div
        initial={rm ? { opacity: 1 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.45 }}
      >
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-accent-500" />
            <h3 className="font-heading text-sm font-semibold text-neutral-900">Recent Events</h3>
            <span className="text-xs text-neutral-400 font-medium">({events.length} total)</span>
          </div>
        </div>
        {recentEvents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-100 p-6 text-center">
            <p className="text-sm text-neutral-400">No events yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentEvents.map((ev, i) => (
              <EventRow key={ev.id} event={ev} reducedMotion={rm} delay={0.5 + i * 0.04} />
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

  return (
    <motion.div
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: reducedMotion ? 0 : Math.min(delay, 0.3) }}
      className="flex items-center gap-3.5 rounded-2xl bg-white shadow-sm px-4 py-3 hover:shadow transition-shadow duration-200"
    >
      {/* Date block */}
      <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-neutral-50 border border-neutral-100 shrink-0">
        <span className="text-[11px] font-bold text-neutral-500 uppercase leading-none">
          {date.toLocaleDateString('en-AU', { month: 'short' })}
        </span>
        <span className="text-base font-bold text-neutral-900 leading-tight">
          {date.getDate()}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-neutral-900 truncate">{event.title}</p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-400">
          <span className="capitalize">{event.activity_type.replace(/_/g, ' ')}</span>
          <span className="w-1 h-1 rounded-full bg-neutral-300" />
          <span>{event.registrationCount} registered</span>
          {event.capacity && (
            <>
              <span>/</span>
              <span>{event.capacity} cap</span>
            </>
          )}
        </div>
      </div>

      {/* Status badge */}
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full capitalize shrink-0',
          status.bg,
          status.text,
        )}
      >
        <span className={cn('w-1.5 h-1.5 rounded-full', status.dot)} />
        {event.status}
      </span>
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

  if (showLoading) return <Skeleton variant="list-item" count={8} />

  return (
    <div className="space-y-5">
      {/* ── Search & controls ── */}
      <div className="rounded-2xl bg-neutral-50 border border-neutral-100 p-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by name or handle..." compact className="flex-1" />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowInactive((p) => !p)}
              className={cn(
                'h-10 px-3.5 rounded-full text-xs font-semibold',
                'active:scale-[0.95] transition-[color,background-color,transform] duration-200 cursor-pointer select-none',
                showInactive
                  ? 'bg-primary-700 text-white shadow-sm'
                  : 'bg-white text-neutral-500 hover:bg-neutral-50 shadow-sm',
              )}
            >
              {showInactive ? 'All statuses' : 'Active only'}
            </button>
            <Button
              variant="ghost"
              size="sm"
              icon={<UserPlus size={16} />}
              onClick={() => setShowAddMember(true)}
            >
              Add
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Download size={16} />}
              onClick={handleExport}
            >
              CSV
            </Button>
          </div>
        </div>
        <p className="text-xs text-neutral-400 mt-3 pl-1">
          {filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''}
          {search && ` matching "${search}"`}
        </p>
      </div>

      {/* ── Member list ── */}
      {filteredMembers.length === 0 ? (
        <EmptyState
          illustration="empty"
          title="No members found"
          description={search ? 'Try a different search' : 'This collective has no members yet'}
        />
      ) : (
        <div className="space-y-1.5">
          {filteredMembers.map((member) => {
            const Icon = ROLE_ICONS[member.role ?? 'participant']
            const isInactive = member.status !== 'active'

            return (
              <div
                key={member.id}
                className={cn(
                  'flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors duration-200',
                  isInactive
                    ? 'opacity-50 bg-neutral-50/80'
                    : 'bg-white shadow-sm hover:shadow',
                )}
              >
                <Avatar
                  src={member.profiles?.avatar_url}
                  name={member.profiles?.display_name}
                  size="sm"
                />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-neutral-900 truncate">
                    {member.profiles?.display_name ?? 'Unknown'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        ROLE_COLORS[member.role ?? 'participant'],
                      )}
                    >
                      <Icon size={10} />
                      {ROLE_LABELS[member.role ?? 'participant']}
                    </span>
                    {member.profiles?.instagram_handle && (
                      <span className="text-[11px] text-neutral-400 truncate">
                        @{member.profiles.instagram_handle}
                      </span>
                    )}
                    {isInactive && (
                      <span className="text-[11px] font-semibold text-error-500 capitalize">
                        {member.status}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {isInactive ? (
                    <button
                      type="button"
                      onClick={() => handleRestore(member)}
                      className="p-2.5 rounded-xl text-neutral-400 hover:bg-neutral-50 cursor-pointer active:scale-[0.93] transition-[colors,transform]"
                      aria-label="Restore member"
                    >
                      <RotateCcw size={14} />
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setRoleAssignMember(member)}
                        className="p-2.5 rounded-xl text-neutral-400 hover:bg-neutral-50 cursor-pointer active:scale-[0.93] transition-[colors,transform]"
                        aria-label="Change role"
                      >
                        <Shield size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemovingMember(member)}
                        className="p-2.5 rounded-xl text-neutral-400 hover:bg-error-50 hover:text-error-500 cursor-pointer active:scale-[0.93] transition-[colors,transform]"
                        aria-label="Remove member"
                      >
                        <UserMinus size={14} />
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
        <BottomSheet open={!!roleAssignMember} onClose={() => setRoleAssignMember(null)}>
          <div className="space-y-4 pb-2">
            <div>
              <h3 className="font-heading text-lg font-semibold text-neutral-900">
                Change Role
              </h3>
              <p className="text-sm text-neutral-500 mt-1">
                {roleAssignMember.profiles?.display_name ?? 'Member'} is currently{' '}
                <strong className="text-neutral-700">{ROLE_LABELS[roleAssignMember.role ?? 'participant']}</strong>
              </p>
            </div>

            <div className="space-y-1.5">
              {ALL_ROLES.map((role) => {
                const RoleIcon = ROLE_ICONS[role]
                const isActive = roleAssignMember.role === role
                const accent = ROLE_CARD_ACCENTS[role]

                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => handleRoleChange(roleAssignMember.user_id, role)}
                    disabled={isActive}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-4 py-3.5 min-h-11 text-sm',
                      'active:scale-[0.97] transition-[color,background-color,transform] duration-150 cursor-pointer select-none border',
                      isActive
                        ? cn(accent.bg, accent.border, 'text-neutral-700')
                        : 'bg-white border-transparent text-neutral-900 hover:bg-neutral-50',
                    )}
                  >
                    <span className={cn('flex items-center justify-center w-8 h-8 rounded-lg', isActive ? accent.icon : 'bg-neutral-50 text-neutral-400')}>
                      <RoleIcon size={16} />
                    </span>
                    <span className="font-medium">{ROLE_LABELS[role]}</span>
                    {isActive && (
                      <span className="ml-auto text-xs text-neutral-500 font-semibold bg-white/80 px-2 py-0.5 rounded-full">
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
      <ConfirmationSheet
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
        <AddMemberModal
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
    <BottomSheet open={open} onClose={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading text-lg font-semibold text-neutral-900">Add Member</h2>
        <button
          onClick={onClose}
          className="flex items-center justify-center rounded-full min-w-11 min-h-11 text-neutral-400 hover:bg-neutral-50 active:scale-[0.93] transition-[colors,transform] duration-150 cursor-pointer"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>
      <div className="space-y-4">
        <Input
          label="Search users"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name..."
        />

        <Dropdown
          label="Role"
          options={ALL_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
          value={selectedRole}
          onChange={(v) => setSelectedRole(v as CollectiveRole)}
        />

        {/* Results */}
        {query.length >= 2 && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {showLoading ? (
              <Skeleton variant="list-item" count={3} />
            ) : results.length === 0 ? (
              <p className="text-sm text-neutral-400 py-4 text-center">
                No users found for &quot;{query}&quot;
              </p>
            ) : (
              results.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleAdd(user.id)}
                  disabled={addMember.isPending}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left',
                    'hover:bg-neutral-50 active:scale-[0.98] transition-[color,background-color,transform] duration-150',
                    'cursor-pointer select-none',
                  )}
                >
                  <Avatar
                    src={user.avatar_url}
                    name={user.display_name}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">
                      {user.display_name ?? 'Unknown'}
                    </p>
                    {user.instagram_handle && (
                      <p className="text-xs text-neutral-400 truncate">@{user.instagram_handle}</p>
                    )}
                  </div>
                  <UserPlus size={16} className="text-neutral-400 shrink-0" />
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

  if (showLoading) return <Skeleton variant="list-item" count={5} />

  return (
    <div className="space-y-5">
      {/* ── Status filter pills ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {statuses.map((s) => {
          const isActive = statusFilter === s
          const colors = statusColors[s] ?? statusColors.all
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                'h-9 px-4 rounded-full text-xs font-semibold capitalize',
                'active:scale-[0.95] transition-[color,background-color,transform] duration-200 cursor-pointer select-none shadow-sm',
                isActive ? colors.active : colors.inactive,
                isActive && 'shadow-sm',
              )}
            >
              {s}
              {s !== 'all' && (
                <span className={cn('ml-1.5', isActive ? 'opacity-70' : 'opacity-50')}>
                  {events.filter((e) => e.status === s).length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Event list ── */}
      {filtered.length === 0 ? (
        <EmptyState
          illustration="empty"
          title="No events"
          description={statusFilter !== 'all' ? 'No events with this status' : 'This collective has no events yet'}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((ev, i) => (
            <EventRow key={ev.id} event={ev} reducedMotion={rm} delay={i * 0.03} />
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
  const [initializedFor, setInitializedFor] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [positionX, setPositionX] = useState<number>(50)
  const [positionY, setPositionY] = useState<number>(50)

  // Initialize form when detail loads (or re-initialize when collectiveId changes)
  if (detail && initializedFor !== collectiveId) {
    setName(detail.name)
    setDescription(detail.description ?? '')
    setRegion(detail.region ?? '')
    setState(detail.state ?? '')
    setSlug(detail.slug)
    setCoverPreview(detail.cover_image_url)
    setPositionX(detail.cover_image_position_x ?? 50)
    setPositionY(detail.cover_image_position_y ?? 50)
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
      // Reset focal point to centre when a fresh image is uploaded
      setPositionX(50)
      setPositionY(50)
      await updateCollective.mutateAsync({
        collectiveId,
        updates: {
          cover_image_url: result.url,
          cover_image_position_x: 50,
          cover_image_position_y: 50,
        },
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
        updates: { cover_image_url: null, cover_image_position_x: 50, cover_image_position_y: 50 },
      })
      setCoverPreview(null)
      setPositionX(50)
      setPositionY(50)
      toast.success('Cover image removed')
    } catch {
      toast.error('Failed to remove image')
    }
  }

  const handleFocalPointChange = (x: number, y: number) => {
    setPositionX(x)
    setPositionY(y)
    updateCollective.mutate({
      collectiveId,
      updates: { cover_image_position_x: x, cover_image_position_y: y },
    })
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

  if (!detail) return <Skeleton variant="card" count={2} />

  return (
    <div className="space-y-6 max-w-xl">
      {/* ── Cover image ── */}
      <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
        <div className="bg-neutral-50 px-5 py-3 border-b border-neutral-100">
          <h3 className="font-heading text-sm font-semibold text-neutral-700">
            Cover Image
          </h3>
        </div>
        <div className="p-5">
          <div className="relative rounded-xl overflow-hidden bg-neutral-50" style={{ aspectRatio: '16/9' }}>
            {coverPreview ? (
              <img
                src={coverPreview}
                alt="Cover"
                loading="lazy"
                className="w-full h-full object-cover"
                style={coverImagePositionStyle(positionX, positionY)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-neutral-300 gap-2">
                <ImagePlus size={32} />
                <span className="text-xs font-medium">No cover image</span>
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="bg-white rounded-xl px-4 py-2 shadow-sm">
                  <p className="text-xs font-semibold text-neutral-700 tabular-nums">{progress ?? 0}%</p>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <label
              className={cn(
                'relative inline-flex items-center justify-center font-heading font-semibold',
                'rounded-xl cursor-pointer select-none',
                'transition-colors duration-150',
                'min-h-11 px-4 text-sm gap-1.5',
                'bg-neutral-100 text-neutral-900 shadow-sm hover:bg-neutral-200 hover:shadow',
                uploading && 'opacity-50 cursor-not-allowed pointer-events-none',
              )}
            >
              <span className="flex items-center justify-center shrink-0">
                <Camera size={14} />
              </span>
              <span>{coverPreview ? 'Replace' : 'Upload'}</span>
              <input
                key={fileInputKey}
                type="file"
                accept="image/*"
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                onChange={handleCoverUpload}
                disabled={uploading}
              />
            </label>
            {coverPreview && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={14} />}
                onClick={handleCoverRemove}
                disabled={uploading}
              >
                Remove
              </Button>
            )}
          </div>
          {coverPreview && (
            <div className="mt-4">
              <CoverImageFocalPointPicker
                imageUrl={coverPreview}
                x={positionX}
                y={positionY}
                onChange={handleFocalPointChange}
                disabled={uploading}
              />
            </div>
          )}
          <p className="text-[11px] text-neutral-400 mt-2">
            Recommended: 1200x675px (16:9). Shown on the collective page and discovery cards.
          </p>
        </div>
      </div>

      {/* ── Edit form ── */}
      <div className="rounded-2xl bg-white shadow-sm overflow-hidden">
        <div className="bg-neutral-50 px-5 py-3 border-b border-neutral-100">
          <h3 className="font-heading text-sm font-semibold text-neutral-700">
            Collective Details
          </h3>
        </div>
        <div className="p-5 space-y-4">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <Input
            label="Slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="url-safe-name"
          />

          <Input
            type="textarea"
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tell people what this collective is about..."
            rows={4}
          />

          <PlaceAutocomplete
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

          <Dropdown
            label="State"
            placeholder="Select state..."
            options={AUSTRALIAN_STATES.map((s) => ({ value: s, label: s }))}
            value={state}
            onChange={setState}
          />

          <div className="pt-1">
            <Button
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
      <div className="rounded-2xl overflow-hidden border border-error-200/40">
        <div className="bg-gradient-to-r from-error-50 via-error-50/60 to-white px-5 py-3 border-b border-error-100/60">
          <h3 className="font-heading text-sm font-semibold text-error-600 flex items-center gap-2">
            <AlertTriangle size={14} />
            Danger Zone
          </h3>
        </div>
        <div className="p-5 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-neutral-900">
                {detail.is_active ? 'Archive Collective' : 'Restore Collective'}
              </p>
              <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">
                {detail.is_active
                  ? 'Hide this collective from members. Data is preserved.'
                  : 'Make this collective active and visible again.'}
              </p>
            </div>
            <Button
              variant={detail.is_active ? 'danger' : 'primary'}
              size="sm"
              icon={detail.is_active ? <Archive size={16} /> : <RotateCcw size={16} />}
              onClick={handleArchiveToggle}
              loading={archiveCollective.isPending}
            >
              {detail.is_active ? 'Archive' : 'Restore'}
            </Button>
          </div>

          {isSuperAdmin && (
            <div className="flex items-center justify-between gap-4 pt-3 border-t border-error-100/60">
              <div>
                <p className="text-sm font-semibold text-error-700">
                  Permanently Delete
                </p>
                <p className="text-xs text-error-500/80 mt-0.5 leading-relaxed">
                  This will permanently delete the collective, all members, events, and impact data. This cannot be undone.
                </p>
              </div>
              <Button
                variant="danger"
                size="sm"
                icon={<AlertTriangle size={16} />}
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      <ConfirmationSheet
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
      <Button
        variant="ghost"
        size="sm"
        icon={<ExternalLink size={14} />}
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
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-32 rounded-lg" />
        <Skeleton className="h-48 rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }
  if (!detail) {
    return (
      <EmptyState
        illustration="error"
        title="Collective not found"
        description="This collective may have been deleted"
        action={{ label: 'Back to Collectives', onClick: () => navigate('/admin/collectives') }}
      />
    )
  }

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <TrendingUp size={15} /> },
    { key: 'members', label: 'Members', icon: <Users size={15} /> },
    { key: 'events', label: 'Events', icon: <CalendarDays size={15} /> },
    { key: 'settings', label: 'Settings', icon: <Settings size={15} /> },
  ]

  return (
    <motion.div
      initial={rm ? { opacity: 1 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="relative"
    >
      {/* ── Sticky back button ── */}
      <div className="sticky top-0 z-30 h-0 pointer-events-none">
        <div className="px-4 pt-4 w-fit">
          <motion.button
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
            <ArrowLeft size={22} />
          </motion.button>
        </div>
      </div>

      {/* ── Full-bleed cover image hero ── */}
      {detail.cover_image_url ? (
        <motion.div
          initial={rm ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35 }}
          className="relative"
        >
          <img
            src={detail.cover_image_url}
            alt={detail.name}
            className="w-full block"
            style={coverImagePositionStyle(detail.cover_image_position_x, detail.cover_image_position_y)}
          />
          {/* Rocky wave overlay */}
          <WaveTransition className="-bottom-px z-10" />
        </motion.div>
      ) : null}

      {/* ── Padded content below hero ── */}
      <div className="space-y-6 p-6">

      {/* ── Tab bar ── */}
      <motion.div
        initial={rm ? {} : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.05 }}
      >
        <SegmentedControl
          segments={tabs.map((tab) => ({ id: tab.key, label: tab.label, icon: tab.icon }))}
          value={activeTab}
          onChange={setActiveTab}
          variant="pill"
          compact
          aria-label="Collective detail tabs"
        />
      </motion.div>

      {/* ── Tab content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={rm ? { opacity: 1 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={rm ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'overview' && <OverviewTab collectiveId={collectiveId!} reducedMotion={rm} />}
          {activeTab === 'members' && <MembersTab collectiveId={collectiveId!} />}
          {activeTab === 'events' && <EventsTab collectiveId={collectiveId!} reducedMotion={rm} />}
          {activeTab === 'settings' && <SettingsTab key={collectiveId} collectiveId={collectiveId!} />}
        </motion.div>
      </AnimatePresence>
      </div>
    </motion.div>
  )
}
