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
    <div data-eos-id="src/pages/collectives/collective-detail.tsx#0" data-eos-v="2" className="space-y-4 py-4">
      <Skeleton data-eos-id="src/pages/collectives/collective-detail.tsx#1" variant="image" className="!aspect-[3/4] !rounded-none -mx-4 lg:-mx-6 w-[calc(100%+2rem)] lg:w-[calc(100%+3rem)]" />
      <div data-eos-id="src/pages/collectives/collective-detail.tsx#2" className="space-y-3 px-1">
        <Skeleton data-eos-id="src/pages/collectives/collective-detail.tsx#3" variant="title" />
        <Skeleton data-eos-id="src/pages/collectives/collective-detail.tsx#4" variant="text" count={2} />
      </div>
      <div data-eos-id="src/pages/collectives/collective-detail.tsx#5" className="grid grid-cols-2 gap-2.5">
        <Skeleton data-eos-id="src/pages/collectives/collective-detail.tsx#6" variant="stat-card" className="!h-28" />
        <Skeleton data-eos-id="src/pages/collectives/collective-detail.tsx#7" variant="stat-card" className="!h-28" />
        <Skeleton data-eos-id="src/pages/collectives/collective-detail.tsx#8" variant="stat-card" className="col-span-2 !h-20" />
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
  // there's still a request in flight without data - without this, the
  // first ~150ms (before useDelayedLoading flips and before the network
  // returns) renders the "Collective not found" empty state, causing a
  // flash of the wrong screen on every navigation in.
  if (showLoading || (isLoading && !collective)) {
    return (
      <Page data-eos-id="src/pages/collectives/collective-detail.tsx#9" swipeBack header={<Header data-eos-id="src/pages/collectives/collective-detail.tsx#10" title="Collective" back />}>
        <CollectiveDetailSkeleton data-eos-id="src/pages/collectives/collective-detail.tsx#11" />
      </Page>
    )
  }
  if (isError) {
    return (
      <Page data-eos-id="src/pages/collectives/collective-detail.tsx#12" swipeBack header={<Header data-eos-id="src/pages/collectives/collective-detail.tsx#13" title="Collective" back />}>
        <EmptyState data-eos-id="src/pages/collectives/collective-detail.tsx#14"
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
      <Page data-eos-id="src/pages/collectives/collective-detail.tsx#15" swipeBack header={<Header data-eos-id="src/pages/collectives/collective-detail.tsx#16" title="Collective" back />}>
        <EmptyState data-eos-id="src/pages/collectives/collective-detail.tsx#17"
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
    <Page data-eos-id="src/pages/collectives/collective-detail.tsx#18"
      swipeBack
      noBackground
      stickyOverlay={
        <Header data-eos-id="src/pages/collectives/collective-detail.tsx#19"
          title=""
          back
          transparent
          className="-mb-14"
          rightActions={
            canManage ? (
              <button data-eos-id="src/pages/collectives/collective-detail.tsx#20"
                type="button"
                onClick={() => navigate(`/collectives/${slug}/manage`)}
                aria-label="Manage collective"
                className="flex items-center justify-center min-h-11 min-w-11 rounded-full bg-black/30 backdrop-blur-sm text-white hover:bg-black/40 active:scale-[0.97] transition-all duration-150 cursor-pointer select-none"
              >
                <Settings data-eos-id="src/pages/collectives/collective-detail.tsx#21" size={20} />
              </button>
            ) : undefined
          }
        />
      }
      footer={
        <div data-eos-id="src/pages/collectives/collective-detail.tsx#22" className="flex gap-3">
          {isMember ? (
            <>
              <Button data-eos-id="src/pages/collectives/collective-detail.tsx#23"
                variant="primary"
                size="lg"
                fullWidth
                icon={<MessageCircle data-eos-id="src/pages/collectives/collective-detail.tsx#24" size={20} />}
                onClick={() => navigate(`/chat/${collectiveId}`)}
              >
                Chat
              </Button>
              <Button data-eos-id="src/pages/collectives/collective-detail.tsx#25"
                variant="ghost"
                size="lg"
                onClick={() => setShowLeaveConfirm(true)}
                aria-label="Leave collective"
              >
                Leave
              </Button>
            </>
          ) : (
            <Button data-eos-id="src/pages/collectives/collective-detail.tsx#26"
              variant="primary"
              size="lg"
              fullWidth
              icon={<Users data-eos-id="src/pages/collectives/collective-detail.tsx#27" size={20} />}
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
      <motion.div data-eos-id="src/pages/collectives/collective-detail.tsx#28"
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="relative aspect-[3/4] sm:aspect-[2/1] w-[calc(100%+2rem)] -mx-4 lg:w-[calc(100%+3rem)] lg:-mx-6 overflow-hidden bg-primary-950"
      >
        {collective.cover_image_url ? (
          <OptimizedImage data-eos-id="src/pages/collectives/collective-detail.tsx#29"
            src={collective.cover_image_url}
            alt={collective.name}
            priority
            sizes="100vw"
            wrapperClassName="h-full w-full"
          />
        ) : (
          <div data-eos-id="src/pages/collectives/collective-detail.tsx#30" className="flex h-full w-full items-center justify-center bg-primary-950">
            <TreePine data-eos-id="src/pages/collectives/collective-detail.tsx#31" size={80} className="text-primary-600/30" />
          </div>
        )}
        {/* Cinematic gradient overlay */}
        <div data-eos-id="src/pages/collectives/collective-detail.tsx#32" className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/10" />

        {/* Editorial hero text - bottom-aligned, large wordmark */}
        <div data-eos-id="src/pages/collectives/collective-detail.tsx#33" className="absolute bottom-0 left-0 right-0 p-5 pb-6">
          {collective.region && (
            <motion.div data-eos-id="src/pages/collectives/collective-detail.tsx#34"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="flex items-center gap-1.5 mb-2"
            >
              <MapPinIcon data-eos-id="src/pages/collectives/collective-detail.tsx#35" size={13} className="text-white/60" />
              <span data-eos-id="src/pages/collectives/collective-detail.tsx#36" data-eos-var="collective.region,collective.state" data-eos-var-label="Region, State" data-eos-var-scope="prop" className="text-[13px] font-semibold tracking-wide text-white/70 uppercase">
                {collective.region}{collective.state ? ` / ${collective.state}` : ''}
              </span>
            </motion.div>
          )}
          <motion.h1 data-eos-id="src/pages/collectives/collective-detail.tsx#37" data-eos-var="collective.name" data-eos-var-label="Name" data-eos-var-scope="prop"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.45 }}
            className="font-heading text-[2rem] sm:text-4xl font-extrabold text-white leading-[1.1] tracking-tight drop-shadow-sm"
          >
            {collective.name}
          </motion.h1>
          <motion.div data-eos-id="src/pages/collectives/collective-detail.tsx#38"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.4 }}
            className="flex items-center gap-3 mt-3"
          >
            <span data-eos-id="src/pages/collectives/collective-detail.tsx#39" data-eos-var="collective.member_count" data-eos-var-label="Member count" data-eos-var-scope="prop" className="text-sm font-medium text-white/80">{collective.member_count} members</span>
            {stats && stats.totalEvents > 0 && (
              <>
                <span data-eos-id="src/pages/collectives/collective-detail.tsx#40" className="w-1 h-1 rounded-full bg-white/40" />
                <span data-eos-id="src/pages/collectives/collective-detail.tsx#41" data-eos-var="stats.totalEvents" data-eos-var-label="Total events" data-eos-var-scope="prop" className="text-sm font-medium text-white/80">{stats.totalEvents} events</span>
              </>
            )}
          </motion.div>
        </div>
      </motion.div>

      {/* ── Content: editorial bento layout ── */}
      <motion.div data-eos-id="src/pages/collectives/collective-detail.tsx#42" variants={shouldReduceMotion ? undefined : stagger} initial="hidden" animate="visible" className="pt-5 pb-4 space-y-5">

        {/* Just-joined WhatsNext prompt */}
        {justJoined && (
          <motion.div data-eos-id="src/pages/collectives/collective-detail.tsx#43" variants={fadeUp}>
          <WhatsNext data-eos-id="src/pages/collectives/collective-detail.tsx#44"
            title="Welcome! Here's what to do next"
            suggestions={[
              {
                label: 'Say hello in chat',
                description: 'Introduce yourself to the group',
                icon: <MessageCircle data-eos-id="src/pages/collectives/collective-detail.tsx#45" size={18} />,
                to: `/chat/${collectiveId}`,
              },
              ...(upcomingEvents.length > 0
                ? [
                    {
                      label: 'Join an event',
                      description: `${upcomingEvents[0].title} is coming up`,
                      icon: <CalendarDays data-eos-id="src/pages/collectives/collective-detail.tsx#46" size={18} />,
                      to: `/events/${upcomingEvents[0].id}`,
                    },
                  ]
                : []),
              {
                label: 'Explore your collective',
                description: `${collective.member_count} members and counting`,
                icon: <Users data-eos-id="src/pages/collectives/collective-detail.tsx#47" size={18} />,
                onClick: () => setJustJoined(false),
              },
            ]}
          />
          </motion.div>
        )}

        {/* ── About + Leaders: asymmetric bento row ── */}
        <motion.div data-eos-id="src/pages/collectives/collective-detail.tsx#48" variants={fadeUp} className="grid grid-cols-1 gap-2.5">
          {/* Description card - editorial quote style */}
          {collective.description && (
            <div data-eos-id="src/pages/collectives/collective-detail.tsx#49" className="rounded-md bg-white p-5 shadow-sm">
              <p data-eos-id="src/pages/collectives/collective-detail.tsx#50" data-eos-var="collective.description" data-eos-var-label="Description" data-eos-var-scope="prop" className="text-[15px] leading-[1.65] text-primary-700 font-medium italic">
                "{collective.description}"
              </p>
            </div>
          )}

          {/* Leaders - inline pill row */}
          {leaders.length > 0 && (
            <div data-eos-id="src/pages/collectives/collective-detail.tsx#51" className="flex flex-wrap gap-2">
              {leaders.map((leader) => (
                <Link data-eos-id="src/pages/collectives/collective-detail.tsx#52"
                  key={leader.id}
                  to={`/profile/${leader.user_id}`}
                  className="flex items-center gap-2.5 rounded-full bg-white pl-1.5 pr-4 py-1.5 shadow-sm transition-all duration-150 active:scale-[0.97]"
                >
                  <Avatar data-eos-id="src/pages/collectives/collective-detail.tsx#53"
                    src={leader.profiles?.avatar_url}
                    name={leader.profiles?.display_name}
                    size="sm"
                  />
                  <div data-eos-id="src/pages/collectives/collective-detail.tsx#54" className="min-w-0">
                    <p data-eos-id="src/pages/collectives/collective-detail.tsx#55" data-eos-var="leader.profiles.display_name" data-eos-var-label="Display name" data-eos-var-scope="item" className="text-sm font-semibold text-neutral-900 truncate">
                      {leader.profiles?.display_name ?? 'Unknown'}
                    </p>
                    <p data-eos-id="src/pages/collectives/collective-detail.tsx#56" data-eos-var="leader.role" data-eos-var-label="Role" data-eos-var-scope="item" className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
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
          <motion.section data-eos-id="src/pages/collectives/collective-detail.tsx#57" variants={fadeUp} aria-label="Collective stats">
            <h2 data-eos-id="src/pages/collectives/collective-detail.tsx#58" className="font-heading text-2xl font-extrabold text-primary-900 tracking-tight mb-3">
              Impact
            </h2>
            <BentoStatGrid data-eos-id="src/pages/collectives/collective-detail.tsx#59">
              <BentoStatCard data-eos-id="src/pages/collectives/collective-detail.tsx#60" label="Events" value={stats.totalEvents} icon={<CalendarDays data-eos-id="src/pages/collectives/collective-detail.tsx#61" size={18} />} theme="warning" />
              <BentoStatCard data-eos-id="src/pages/collectives/collective-detail.tsx#62" label="Vol. Hours" value={stats.totalHours} icon={<Clock data-eos-id="src/pages/collectives/collective-detail.tsx#63" size={16} />} unit="hrs" theme="primary" />
              {stats.totalTreesPlanted > 0 && (
                <BentoStatCard data-eos-id="src/pages/collectives/collective-detail.tsx#64" label="Trees" value={stats.totalTreesPlanted} icon={<TreePine data-eos-id="src/pages/collectives/collective-detail.tsx#65" size={16} />} theme="sprout" />
              )}
              {stats.totalRubbishKg > 0 && (
                <BentoStatCard data-eos-id="src/pages/collectives/collective-detail.tsx#66" label="Litter Removed" value={stats.totalRubbishKg} icon={<Trash2 data-eos-id="src/pages/collectives/collective-detail.tsx#67" size={16} />} unit="kg" theme="sky" />
              )}
            </BentoStatGrid>
          </motion.section>
        )}

        {/* ── Members - full-bleed avatar strip ── */}
        <motion.section data-eos-id="src/pages/collectives/collective-detail.tsx#68" variants={fadeUp} aria-label="Members">
          <div data-eos-id="src/pages/collectives/collective-detail.tsx#69" className="flex items-end justify-between mb-3">
            <h2 data-eos-id="src/pages/collectives/collective-detail.tsx#70" className="font-heading text-2xl font-extrabold text-primary-900 tracking-tight">
              Members
            </h2>
            <span data-eos-id="src/pages/collectives/collective-detail.tsx#71" data-eos-var="collective.member_count" data-eos-var-label="Member count" data-eos-var-scope="prop" className="text-sm font-bold text-neutral-500 tabular-nums">{collective.member_count}</span>
          </div>
          <div data-eos-id="src/pages/collectives/collective-detail.tsx#72" className="rounded-md bg-white p-4 shadow-sm">
            <div data-eos-id="src/pages/collectives/collective-detail.tsx#73" className="flex flex-wrap gap-1.5">
              {members.slice(0, 30).map((member) => (
                <Link data-eos-id="src/pages/collectives/collective-detail.tsx#74"
                  key={member.id}
                  to={`/profile/${member.user_id}`}
                  aria-label={member.profiles?.display_name ?? 'Member'}
                  className="transition-transform duration-100 hover:scale-110 active:scale-95"
                >
                  <Avatar data-eos-id="src/pages/collectives/collective-detail.tsx#75"
                    src={member.profiles?.avatar_url}
                    name={member.profiles?.display_name}
                    size="sm"
                  />
                </Link>
              ))}
              {members.length > 30 && (
                <div data-eos-id="src/pages/collectives/collective-detail.tsx#76" className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-50 text-[11px] font-bold text-primary-500">
                  +{members.length - 30}
                </div>
              )}
            </div>
          </div>
        </motion.section>

        {/* ── Upcoming Events - editorial cards ── */}
        <motion.section data-eos-id="src/pages/collectives/collective-detail.tsx#77" variants={fadeUp} aria-label="Upcoming events">
          <div data-eos-id="src/pages/collectives/collective-detail.tsx#78" className="flex items-end justify-between mb-3">
            <h2 data-eos-id="src/pages/collectives/collective-detail.tsx#79" className="font-heading text-2xl font-extrabold text-primary-900 tracking-tight">
              Up Next
            </h2>
            {upcomingEvents.length > 3 && (
              <Link data-eos-id="src/pages/collectives/collective-detail.tsx#80"
                to={`/events?collective=${collectiveId}`}
                className="flex items-center gap-1 text-sm font-bold text-primary-500 hover:text-primary-600 transition-colors"
              >
                All events <ArrowRight data-eos-id="src/pages/collectives/collective-detail.tsx#81" size={14} />
              </Link>
            )}
          </div>
          {upcomingEvents.length === 0 ? (
            <EmptyState data-eos-id="src/pages/collectives/collective-detail.tsx#82"
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
            <div data-eos-id="src/pages/collectives/collective-detail.tsx#83" className="grid grid-cols-1 gap-2.5">
              {upcomingEvents.slice(0, 3).map((event, i) => {
                // Up Next hero source: prefer the event's own cover, fall back
                // to the collective's hero so cards never render the blank
                // gradient placeholder when the collective has its own art.
                // Mirrors event-detail / event-hero precedence.
                const heroSrc = event.cover_image_url || collective.cover_image_url || null
                return (
                <Link data-eos-id="src/pages/collectives/collective-detail.tsx#84"
                  key={event.id}
                  to={`/events/${event.id}`}
                  className={`group relative overflow-hidden rounded-md bg-white shadow-sm transition-all duration-150 active:scale-[0.98] ${
                    i === 0 ? 'p-0' : 'p-2'
                  }`}
                >
                  {i === 0 ? (
                    /* Featured first event - large card with hero image + date overlay */
                    <div data-eos-id="src/pages/collectives/collective-detail.tsx#85" className="relative">
                      <div data-eos-id="src/pages/collectives/collective-detail.tsx#86" className="relative aspect-[2.5/1] overflow-hidden bg-primary-50">
                        {heroSrc ? (
                          <OptimizedImage data-eos-id="src/pages/collectives/collective-detail.tsx#87"
                            src={heroSrc}
                            alt=""
                            sizes="(min-width: 1024px) 800px, 100vw"
                            wrapperClassName="absolute inset-0"
                          />
                        ) : (
                          <div data-eos-id="src/pages/collectives/collective-detail.tsx#88" className="absolute inset-0 flex items-center justify-center">
                            <CalendarDays data-eos-id="src/pages/collectives/collective-detail.tsx#89" size={32} className="text-primary-300" />
                          </div>
                        )}
                      </div>
                      <div data-eos-id="src/pages/collectives/collective-detail.tsx#90" className="absolute top-3 left-3">
                        <div data-eos-id="src/pages/collectives/collective-detail.tsx#91" className="rounded-sm bg-white/95 backdrop-blur-sm px-3 py-1.5 shadow-sm">
                          <span data-eos-id="src/pages/collectives/collective-detail.tsx#92" data-eos-var="event.date_start" data-eos-var-label="Date start" data-eos-var-scope="item" className="text-[10px] font-bold uppercase text-primary-500 block leading-tight">
                            {new Date(event.date_start).toLocaleDateString('en-AU', { month: 'short', timeZone: 'UTC' })}
                          </span>
                          <span data-eos-id="src/pages/collectives/collective-detail.tsx#93" data-eos-var="event.date_start" data-eos-var-label="Date start" data-eos-var-scope="item" className="font-heading text-xl font-extrabold text-primary-900 leading-none">
                            {new Date(event.date_start).getUTCDate()}
                          </span>
                        </div>
                      </div>
                      <div data-eos-id="src/pages/collectives/collective-detail.tsx#94" className="p-4">
                        <p data-eos-id="src/pages/collectives/collective-detail.tsx#95" data-eos-var="event.title" data-eos-var-label="Title" data-eos-var-scope="item" className="font-heading text-base font-bold text-primary-900">
                          {event.title}
                        </p>
                        {event.address && (
                          <p data-eos-id="src/pages/collectives/collective-detail.tsx#96" data-eos-var="event.address" data-eos-var-label="Address" data-eos-var-scope="item" className="text-xs text-neutral-500 mt-0.5 truncate">{event.address}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Compact event rows - small hero thumbnail on the left for visual continuity */
                    <div data-eos-id="src/pages/collectives/collective-detail.tsx#97" className="flex items-center gap-3">
                      <div data-eos-id="src/pages/collectives/collective-detail.tsx#98" className="relative h-14 w-14 shrink-0 overflow-hidden rounded-sm bg-primary-50">
                        {heroSrc ? (
                          <OptimizedImage data-eos-id="src/pages/collectives/collective-detail.tsx#99"
                            src={heroSrc}
                            alt=""
                            sizes="56px"
                            wrapperClassName="absolute inset-0"
                          />
                        ) : (
                          <div data-eos-id="src/pages/collectives/collective-detail.tsx#100" className="absolute inset-0 flex flex-col items-center justify-center text-primary-600">
                            <span data-eos-id="src/pages/collectives/collective-detail.tsx#101" data-eos-var="event.date_start" data-eos-var-label="Date start" data-eos-var-scope="item" className="text-[9px] font-bold uppercase leading-tight">
                              {new Date(event.date_start).toLocaleDateString('en-AU', { month: 'short', timeZone: 'UTC' })}
                            </span>
                            <span data-eos-id="src/pages/collectives/collective-detail.tsx#102" data-eos-var="event.date_start" data-eos-var-label="Date start" data-eos-var-scope="item" className="font-heading text-base font-extrabold leading-none">
                              {new Date(event.date_start).getUTCDate()}
                            </span>
                          </div>
                        )}
                        {heroSrc && (
                          <div data-eos-id="src/pages/collectives/collective-detail.tsx#103" className="absolute top-1 left-1 rounded-md bg-white/95 backdrop-blur-sm px-1 py-0.5 shadow-sm">
                            <span data-eos-id="src/pages/collectives/collective-detail.tsx#104" data-eos-var="event.date_start" data-eos-var-label="Date start" data-eos-var-scope="item" className="font-heading text-[11px] font-extrabold leading-none text-primary-900">
                              {new Date(event.date_start).getUTCDate()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div data-eos-id="src/pages/collectives/collective-detail.tsx#105" className="flex-1 min-w-0 py-1">
                        <p data-eos-id="src/pages/collectives/collective-detail.tsx#106" data-eos-var="event.title" data-eos-var-label="Title" data-eos-var-scope="item" className="text-sm font-semibold text-neutral-900 truncate">
                          {event.title}
                        </p>
                        {event.address && (
                          <p data-eos-id="src/pages/collectives/collective-detail.tsx#107" data-eos-var="event.address" data-eos-var-label="Address" data-eos-var-scope="item" className="text-xs text-neutral-500 truncate">{event.address}</p>
                        )}
                      </div>
                      <ChevronRight data-eos-id="src/pages/collectives/collective-detail.tsx#108" size={16} className="text-neutral-400 shrink-0 group-hover:translate-x-0.5 transition-transform mr-1" />
                    </div>
                  )}
                </Link>
                )
              })}
            </div>
          )}
        </motion.section>

        {/* ── Past Events - compact, muted ── */}
        {/* Filter to events with a valid title - draft/incomplete events were
            rendering as blank rows that took space with no content
            (2026-05-16 Tate feedback). */}
        {(() => {
          const renderablePastEvents = pastEvents.filter(
            (e) => typeof e.title === 'string' && e.title.trim().length > 0,
          )
          if (renderablePastEvents.length === 0) return null
          return (
            <motion.section data-eos-id="src/pages/collectives/collective-detail.tsx#109" variants={fadeUp} aria-label="Past events">
              <h3 data-eos-id="src/pages/collectives/collective-detail.tsx#110" className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2.5">
                Past Events
              </h3>
              <div data-eos-id="src/pages/collectives/collective-detail.tsx#111" className="space-y-1.5">
                {renderablePastEvents.slice(0, 5).map((event) => (
                  <Link data-eos-id="src/pages/collectives/collective-detail.tsx#112"
                    key={event.id}
                    to={`/events/${event.id}`}
                    className="group flex items-center gap-3 rounded-sm bg-white/60 p-3 transition-all duration-150 hover:bg-white active:scale-[0.99]"
                  >
                    <div data-eos-id="src/pages/collectives/collective-detail.tsx#113" className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-sm bg-surface-2 text-primary-300">
                      <span data-eos-id="src/pages/collectives/collective-detail.tsx#114" data-eos-var="event.date_start" data-eos-var-label="Date start" data-eos-var-scope="item" className="text-[9px] font-bold uppercase leading-tight">
                        {new Date(event.date_start).toLocaleDateString('en-AU', { month: 'short', timeZone: 'UTC' })}
                      </span>
                      <span data-eos-id="src/pages/collectives/collective-detail.tsx#115" data-eos-var="event.date_start" data-eos-var-label="Date start" data-eos-var-scope="item" className="font-heading text-base font-bold leading-none">
                        {new Date(event.date_start).getUTCDate()}
                      </span>
                    </div>
                    <div data-eos-id="src/pages/collectives/collective-detail.tsx#116" className="flex-1 min-w-0">
                      <p data-eos-id="src/pages/collectives/collective-detail.tsx#117" data-eos-var="event.title" data-eos-var-label="Title" data-eos-var-scope="item" className="text-sm font-medium text-neutral-500 truncate">
                        {event.title}
                      </p>
                    </div>
                    <ChevronRight data-eos-id="src/pages/collectives/collective-detail.tsx#118" size={14} className="text-neutral-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                ))}
              </div>
            </motion.section>
          )
        })()}

        {/* ── Location - full-bleed map card ── */}
        <motion.section data-eos-id="src/pages/collectives/collective-detail.tsx#119" variants={fadeUp} aria-label="Location" className="w-[calc(100%+2rem)] -mx-4 lg:w-[calc(100%+3rem)] lg:-mx-6">
          <div data-eos-id="src/pages/collectives/collective-detail.tsx#120" className="relative overflow-hidden">
            <MapView data-eos-id="src/pages/collectives/collective-detail.tsx#121"
              center={pos ?? undefined}
              zoom={pos ? 11 : 5}
              markers={pos ? [{ id: collective.id, position: pos, variant: 'collective', label: collective.name }] : undefined}
              interactive={false}
              aria-label={`${collective.name} location`}
              className="aspect-[2/1] sm:aspect-[3/1]"
            />
            {/* Map overlay label */}
            <div data-eos-id="src/pages/collectives/collective-detail.tsx#122" className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-4 pt-10">
              <p data-eos-id="src/pages/collectives/collective-detail.tsx#123" data-eos-var="collective.region" data-eos-var-label="Region" data-eos-var-scope="prop" className="font-heading text-lg font-bold text-white drop-shadow">
                {collective.region || 'Location'}
              </p>
              {collective.state && (
                <p data-eos-id="src/pages/collectives/collective-detail.tsx#124" data-eos-var="collective.state" data-eos-var-label="State" data-eos-var-scope="prop" className="text-sm text-white/70 font-medium">{collective.state}, Australia</p>
              )}
            </div>
          </div>
        </motion.section>

        {/* Bottom spacer for footer clearance */}
        <div data-eos-id="src/pages/collectives/collective-detail.tsx#125" className="h-2" />
      </motion.div>

      {/* Leave confirmation */}
      <ConfirmationSheet data-eos-id="src/pages/collectives/collective-detail.tsx#126"
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
