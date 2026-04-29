import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
    MessageCircle,
    Users,
    CalendarDays,
    TreePine,
    Clock,
    Trash2,
    Ruler,
    Leaf,
    Eye,
    UserCheck,
    MapPin as MapPinIcon,
    ChevronRight,
    Settings,
    ArrowRight,
} from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Button } from '@/components/button'
import { Avatar } from '@/components/avatar'
import { BentoStatCard, BentoStatGrid } from '@/components/bento-stats'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { MapView } from '@/components/map/map-view'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { WhatsNext } from '@/components/whats-next'
import { OptimizedImage } from '@/components/optimized-image'
import { useToast } from '@/components/toast'
import { resolveCollectiveCoords } from '@/lib/geo'
import { coverImagePositionStyle } from '@/lib/cover-image'

import {
    useCollective,
    useCollectiveLeaders,
    useCollectiveMembers,
    useCollectiveEvents,
    useCollectiveStats,
    useCollectiveMembership,
    useJoinCollective,
    useLeaveCollective,
} from '@/hooks/use-collective'
import { useCollectiveRole } from '@/hooks/use-collective-role'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

function CollectiveDetailSkeleton() {
  return (
    <div className="space-y-4 py-4">
      <Skeleton variant="image" className="!aspect-[3/4] !rounded-none -mx-4 lg:-mx-6 w-[calc(100%+2rem)] lg:w-[calc(100%+3rem)]" />
      <div className="space-y-3 px-1">
        <Skeleton variant="title" />
        <Skeleton variant="text" count={2} />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Skeleton variant="stat-card" className="!h-28" />
        <Skeleton variant="stat-card" className="!h-28" />
        <Skeleton variant="stat-card" className="col-span-2 !h-20" />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function CollectiveDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()

  const shouldReduceMotion = useReducedMotion()

  // Fetch collective by slug (or UUID for backwards compat)
  const { data: collective, isLoading, isError } = useCollective(slug)
  const showLoading = useDelayedLoading(isLoading)
  // Use the resolved ID for sub-queries that require a UUID
  const collectiveId = collective?.id
  const { data: leaders = [] } = useCollectiveLeaders(collectiveId)
  const { data: members = [] } = useCollectiveMembers(collectiveId)
  const { data: upcomingEvents = [] } = useCollectiveEvents(collectiveId, 'upcoming')
  const { data: pastEvents = [] } = useCollectiveEvents(collectiveId, 'past')
  const { data: stats } = useCollectiveStats(collectiveId)
  const { data: membership } = useCollectiveMembership(collectiveId)
  const { isLeader, isCoLeader } = useCollectiveRole(collectiveId)
  const canManage = isLeader || isCoLeader

  const joinCollective = useJoinCollective()
  const leaveCollective = useLeaveCollective()

  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [justJoined, setJustJoined] = useState(false)

  const stagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.06 } },
  }

  const fadeUp = {
    hidden: { opacity: 0, y: 18 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const } },
  }

  const isMember = !!membership

  const handleJoin = async () => {
    if (!collectiveId) return
    try {
      await joinCollective.mutateAsync(collectiveId)
      setJustJoined(true)
      toast.success("Welcome to the collective!")
    } catch {
      toast.error('Failed to join collective')
    }
  }

  const handleLeave = async () => {
    if (!collectiveId) return
    try {
      await leaveCollective.mutateAsync(collectiveId)
      toast.info("You've left the collective")
    } catch {
      toast.error('Failed to leave collective')
    }
  }

  // Show the skeleton both during the long-load delay window AND while
  // there's still a request in flight without data — without this, the
  // first ~150ms (before useDelayedLoading flips and before the network
  // returns) renders the "Collective not found" empty state, causing a
  // flash of the wrong screen on every navigation in.
  if (showLoading || (isLoading && !collective)) {
    return (
      <Page swipeBack header={<Header title="Collective" back />}>
        <CollectiveDetailSkeleton />
      </Page>
    )
  }
  if (isError) {
    return (
      <Page swipeBack header={<Header title="Collective" back />}>
        <EmptyState
          illustration="error"
          title="Something went wrong"
          description="We couldn't load this collective. Check your connection and try again."
          action={{ label: 'Retry', onClick: () => window.location.reload() }}
        />
      </Page>
    )
  }
  if (!collective) {
    return (
      <Page swipeBack header={<Header title="Collective" back />}>
        <EmptyState
          illustration="error"
          title="Collective not found"
          description="This collective may have been removed or the link is incorrect"
          action={{ label: 'Explore Collectives', to: '/collectives' }}
        />
      </Page>
    )
  }

  // Resolve map coords with the same fallback the explore map uses, so a
  // collective missing location_point still gets a pin (city-centre default
  // by slug) instead of zooming out to no marker.
  const pos = resolveCollectiveCoords(collective.location_point, collective.slug)

  return (
    <Page
      swipeBack
      noBackground
      stickyOverlay={
        <Header
          title=""
          back
          transparent
          className="-mb-14"
          rightActions={
            canManage ? (
              <button
                type="button"
                onClick={() => navigate(`/collectives/${slug}/manage`)}
                aria-label="Manage collective"
                className="flex items-center justify-center min-h-11 min-w-11 rounded-full bg-black/30 backdrop-blur-sm text-white hover:bg-black/40 active:scale-[0.97] transition-all duration-150 cursor-pointer select-none"
              >
                <Settings size={20} />
              </button>
            ) : undefined
          }
        />
      }
      footer={
        <div className="flex gap-3">
          {isMember ? (
            <>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                icon={<MessageCircle size={20} />}
                onClick={() => navigate(`/chat/${collectiveId}`)}
              >
                Chat
              </Button>
              <Button
                variant="ghost"
                size="lg"
                onClick={() => setShowLeaveConfirm(true)}
                aria-label="Leave collective"
              >
                Leave
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="lg"
              fullWidth
              icon={<Users size={20} />}
              loading={joinCollective.isPending}
              onClick={handleJoin}
            >
              Join this Collective
            </Button>
          )}
        </div>
      }
    >
      {/* ── Hero: tall, cinematic, full-bleed ── */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="relative aspect-[3/4] sm:aspect-[2/1] w-[calc(100%+2rem)] -mx-4 lg:w-[calc(100%+3rem)] lg:-mx-6 overflow-hidden bg-primary-950"
      >
        {collective.cover_image_url ? (
          <OptimizedImage
            src={collective.cover_image_url}
            alt={collective.name}
            priority
            sizes="100vw"
            wrapperClassName="h-full w-full"
            imgStyle={coverImagePositionStyle(collective.cover_image_position_x, collective.cover_image_position_y)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-800 to-primary-950">
            <TreePine size={80} className="text-primary-600/30" />
          </div>
        )}
        {/* Cinematic gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/10" />

        {/* Editorial hero text - bottom-aligned, large wordmark */}
        <div className="absolute bottom-0 left-0 right-0 p-5 pb-6">
          {collective.region && (
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="flex items-center gap-1.5 mb-2"
            >
              <MapPinIcon size={13} className="text-white/60" />
              <span className="text-[13px] font-semibold tracking-wide text-white/70 uppercase">
                {collective.region}{collective.state ? ` / ${collective.state}` : ''}
              </span>
            </motion.div>
          )}
          <motion.h1
            initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.45 }}
            className="font-heading text-[2rem] sm:text-4xl font-extrabold text-white leading-[1.1] tracking-tight drop-shadow-lg"
          >
            {collective.name}
          </motion.h1>
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.4 }}
            className="flex items-center gap-3 mt-3"
          >
            <span className="text-sm font-medium text-white/80">{collective.member_count} members</span>
            {stats && stats.totalEvents > 0 && (
              <>
                <span className="w-1 h-1 rounded-full bg-white/40" />
                <span className="text-sm font-medium text-white/80">{stats.totalEvents} events</span>
              </>
            )}
          </motion.div>
        </div>
      </motion.div>

      {/* ── Content: editorial bento layout ── */}
      <motion.div variants={shouldReduceMotion ? undefined : stagger} initial="hidden" animate="visible" className="pt-5 pb-4 space-y-5">

        {/* Just-joined WhatsNext prompt */}
        {justJoined && (
          <motion.div variants={fadeUp}>
          <WhatsNext
            title="Welcome! Here's what to do next"
            suggestions={[
              {
                label: 'Say hello in chat',
                description: 'Introduce yourself to the group',
                icon: <MessageCircle size={18} />,
                to: `/chat/${collectiveId}`,
              },
              ...(upcomingEvents.length > 0
                ? [
                    {
                      label: 'Join an event',
                      description: `${upcomingEvents[0].title} is coming up`,
                      icon: <CalendarDays size={18} />,
                      to: `/events/${upcomingEvents[0].id}`,
                    },
                  ]
                : []),
              {
                label: 'Explore your collective',
                description: `${collective.member_count} members and counting`,
                icon: <Users size={18} />,
                onClick: () => setJustJoined(false),
              },
            ]}
          />
          </motion.div>
        )}

        {/* ── About + Leaders: asymmetric bento row ── */}
        <motion.div variants={fadeUp} className="grid grid-cols-1 gap-2.5">
          {/* Description card - editorial quote style */}
          {collective.description && (
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-[15px] leading-[1.65] text-primary-700 font-medium italic">
                "{collective.description}"
              </p>
            </div>
          )}

          {/* Leaders - inline pill row */}
          {leaders.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {leaders.map((leader) => (
                <Link
                  key={leader.id}
                  to={`/profile/${leader.user_id}`}
                  className="flex items-center gap-2.5 rounded-full bg-white pl-1.5 pr-4 py-1.5 shadow-sm transition-all duration-150 active:scale-[0.97]"
                >
                  <Avatar
                    src={leader.profiles?.avatar_url}
                    name={leader.profiles?.display_name}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 truncate">
                      {leader.profiles?.display_name ?? 'Unknown'}
                    </p>
                    <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
                      {leader.role!.replace('_', ' ')}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </motion.div>

        {/* ── Impact - wordmark header + bento stats ── */}
        {stats && (
          <motion.section variants={fadeUp} aria-label="Collective stats">
            <h2 className="font-heading text-2xl font-extrabold text-primary-900 tracking-tight mb-3">
              Impact
            </h2>
            <BentoStatGrid>
              <BentoStatCard label="Events" value={stats.totalEvents} icon={<CalendarDays size={18} />} theme="warning" />
              <BentoStatCard label="Vol. Hours" value={stats.totalHours} icon={<Clock size={16} />} unit="hrs" theme="primary" />
              {stats.totalTreesPlanted > 0 && (
                <BentoStatCard label="Trees" value={stats.totalTreesPlanted} icon={<TreePine size={16} />} theme="sprout" />
              )}
              {stats.totalRubbishKg > 0 && (
                <BentoStatCard label="Litter Removed" value={stats.totalRubbishKg} icon={<Trash2 size={16} />} unit="kg" theme="sky" />
              )}
              {stats.attendanceRate > 0 && (
                <BentoStatCard label="Attendance" value={`${Math.round(stats.attendanceRate * 100)}%`} icon={<UserCheck size={16} />} theme="coral" />
              )}
            </BentoStatGrid>
          </motion.section>
        )}

        {/* ── Members - full-bleed avatar strip ── */}
        <motion.section variants={fadeUp} aria-label="Members">
          <div className="flex items-end justify-between mb-3">
            <h2 className="font-heading text-2xl font-extrabold text-primary-900 tracking-tight">
              Members
            </h2>
            <span className="text-sm font-bold text-neutral-500 tabular-nums">{collective.member_count}</span>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex flex-wrap gap-1.5">
              {members.slice(0, 30).map((member) => (
                <Link
                  key={member.id}
                  to={`/profile/${member.user_id}`}
                  aria-label={member.profiles?.display_name ?? 'Member'}
                  className="transition-transform duration-100 hover:scale-110 active:scale-95"
                >
                  <Avatar
                    src={member.profiles?.avatar_url}
                    name={member.profiles?.display_name}
                    size="sm"
                  />
                </Link>
              ))}
              {members.length > 30 && (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-50 text-[11px] font-bold text-primary-500">
                  +{members.length - 30}
                </div>
              )}
            </div>
          </div>
        </motion.section>

        {/* ── Upcoming Events - editorial cards ── */}
        <motion.section variants={fadeUp} aria-label="Upcoming events">
          <div className="flex items-end justify-between mb-3">
            <h2 className="font-heading text-2xl font-extrabold text-primary-900 tracking-tight">
              Up Next
            </h2>
            {upcomingEvents.length > 3 && (
              <Link
                to={`/events?collective=${collectiveId}`}
                className="flex items-center gap-1 text-sm font-bold text-primary-500 hover:text-primary-600 transition-colors"
              >
                All events <ArrowRight size={14} />
              </Link>
            )}
          </div>
          {upcomingEvents.length === 0 ? (
            <EmptyState
              illustration="empty"
              title="No upcoming events"
              description={canManage
                ? 'Create an event to get your collective moving'
                : 'Check back soon or ask your leader to create one'}
              action={canManage
                ? { label: 'Create Event', to: '/events/create' }
                : undefined}
              className="min-h-[140px] py-4"
            />
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {upcomingEvents.slice(0, 3).map((event, i) => (
                <Link
                  key={event.id}
                  to={`/events/${event.id}`}
                  className={`group relative overflow-hidden rounded-2xl bg-white shadow-sm transition-all duration-150 active:scale-[0.98] ${
                    i === 0 ? 'p-0' : 'p-3.5'
                  }`}
                >
                  {i === 0 ? (
                    /* Featured first event - large card with date overlay */
                    <div className="relative">
                      <div className="aspect-[2.5/1] bg-gradient-to-br from-primary-100 to-primary-50 flex items-center justify-center">
                        <CalendarDays size={32} className="text-primary-300" />
                      </div>
                      <div className="absolute top-3 left-3">
                        <div className="rounded-xl bg-white/90 backdrop-blur-sm px-3 py-1.5 shadow-sm">
                          <span className="text-[10px] font-bold uppercase text-primary-500 block leading-tight">
                            {new Date(event.date_start).toLocaleDateString('en-AU', { month: 'short' })}
                          </span>
                          <span className="font-heading text-xl font-extrabold text-primary-900 leading-none">
                            {new Date(event.date_start).getDate()}
                          </span>
                        </div>
                      </div>
                      <div className="p-4">
                        <p className="font-heading text-base font-bold text-primary-900">
                          {event.title}
                        </p>
                        {event.address && (
                          <p className="text-xs text-neutral-500 mt-0.5 truncate">{event.address}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Compact event rows */
                    <div className="flex items-center gap-3.5">
                      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                        <span className="text-[10px] font-bold uppercase leading-tight">
                          {new Date(event.date_start).toLocaleDateString('en-AU', { month: 'short' })}
                        </span>
                        <span className="font-heading text-lg font-extrabold leading-none">
                          {new Date(event.date_start).getDate()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-neutral-900 truncate">
                          {event.title}
                        </p>
                        {event.address && (
                          <p className="text-xs text-neutral-500 truncate">{event.address}</p>
                        )}
                      </div>
                      <ChevronRight size={16} className="text-neutral-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </motion.section>

        {/* ── Past Events - compact, muted ── */}
        {pastEvents.length > 0 && (
          <motion.section variants={fadeUp} aria-label="Past events">
            <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2.5">
              Past Events
            </h3>
            <div className="space-y-1.5">
              {pastEvents.slice(0, 5).map((event) => (
                <Link
                  key={event.id}
                  to={`/events/${event.id}`}
                  className="group flex items-center gap-3 rounded-xl bg-white/60 p-3 transition-all duration-150 hover:bg-white active:scale-[0.99]"
                >
                  <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-surface-2 text-primary-300">
                    <span className="text-[9px] font-bold uppercase leading-tight">
                      {new Date(event.date_start).toLocaleDateString('en-AU', { month: 'short' })}
                    </span>
                    <span className="font-heading text-base font-bold leading-none">
                      {new Date(event.date_start).getDate()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-500 truncate">
                      {event.title}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-neutral-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              ))}
            </div>
          </motion.section>
        )}

        {/* ── Location - full-bleed map card ── */}
        <motion.section variants={fadeUp} aria-label="Location" className="w-[calc(100%+2rem)] -mx-4 lg:w-[calc(100%+3rem)] lg:-mx-6">
          <div className="relative overflow-hidden">
            <MapView
              center={pos ?? undefined}
              zoom={pos ? 11 : 5}
              markers={pos ? [{ id: collective.id, position: pos, variant: 'collective', label: collective.name }] : undefined}
              interactive={false}
              aria-label={`${collective.name} location`}
              className="aspect-[2/1] sm:aspect-[3/1]"
            />
            {/* Map overlay label */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-4 pt-10">
              <p className="font-heading text-lg font-bold text-white drop-shadow">
                {collective.region || 'Location'}
              </p>
              {collective.state && (
                <p className="text-sm text-white/70 font-medium">{collective.state}, Australia</p>
              )}
            </div>
          </div>
        </motion.section>

        {/* Bottom spacer for footer clearance */}
        <div className="h-2" />
      </motion.div>

      {/* Leave confirmation */}
      <ConfirmationSheet
        open={showLeaveConfirm}
        onClose={() => setShowLeaveConfirm(false)}
        onConfirm={handleLeave}
        title="Leave this collective?"
        description="You'll lose access to the group chat and won't see collective-specific events in your feed."
        confirmLabel="Leave Collective"
        variant="warning"
      />
    </Page>
  )
}
