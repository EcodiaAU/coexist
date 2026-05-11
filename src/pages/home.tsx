import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, useReducedMotion, useInView } from 'framer-motion'
import { useParallaxLayers } from '@/hooks/use-parallax-scroll'
import {
    ChevronRight,
    ChevronDown,
    Calendar,
    Users,
    TreePine,
    Megaphone,
    Clock,
    Trash2,
    Globe,
    MapPin,
    Heart,
    ShoppingBag,
    Hash,
    Search,
    Camera,
    CheckCircle2,
    GraduationCap,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/use-auth'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import {
    getGreeting,
    useMyCollective,
    useMyCollectives,
    useImpactStats,
    useMyUpcomingEvents,
    useCollectiveUpcomingEvents,
    useNationalEvents,
    useRecentUpdates,
} from '@/hooks/use-home-feed'
import type { MyCollectiveSummary } from '@/hooks/use-home-feed'
import { useNationalImpact, useCollectiveImpact } from '@/hooks/use-impact'
import type { CanonicalImpact } from '@/hooks/use-impact'
import { usePendingSurveys } from '@/hooks/use-auto-survey'
import {
    Page, Button,
    CheckInSheet,
    EmptyState,
    WaveTransition
} from '@/components'
import { Card } from '@/components/card'
import { BentoStatCard, BentoStatGrid } from '@/components/bento-stats'
import { prefetchEventDetail } from '@/hooks/use-events'
import { cn } from '@/lib/cn'
import { isSignInButtonVisible } from '@/lib/date-format'
import { ProximityCheckInBanner } from '@/components/proximity-check-in-banner'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'


/* ------------------------------------------------------------------ */
/*  Section wrapper                                                    */
/* ------------------------------------------------------------------ */

function Section({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: { label: string; to: string }
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn(className)} aria-label={title}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-heading text-sm font-bold text-neutral-500 uppercase tracking-widest min-w-0 truncate">
          {title}
        </h2>
        {action && (
          <Link
            to={action.to}
            className="flex items-center gap-0.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900 active:scale-[0.97] transition-[colors,transform] duration-150 whitespace-nowrap shrink-0"
          >
            {action.label}
            <ChevronRight size={14} className="shrink-0" />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/*  Horizontal scroll (no gradient fade edges)                         */
/* ------------------------------------------------------------------ */

function HScroll({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className="relative -mx-6">
      <div
        className={cn(
          'flex gap-3 overflow-x-auto pl-8 pr-6 pb-4',
          'pretty-scrollbar snap-x snap-proximity',
          'scroll-smooth',
          className,
        )}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {children}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Format helpers                                                     */
/* ------------------------------------------------------------------ */

function formatEventDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
}

function daysUntil(iso: string): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(iso)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - now.getTime()) / 86400000)
}

function isEventHappeningNow(start: string, end: string | null): boolean {
  const now = Date.now()
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : s + 4 * 60 * 60 * 1000 // default 4h window
  return now >= s && now <= e
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

/* ------------------------------------------------------------------ */
/*  Parallax Hero (two-layer photo parallax, nature/conservation)      */
/* ------------------------------------------------------------------ */

function useIsCoarsePointer() {
  const [coarse, setCoarse] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const handler = (e: MediaQueryListEvent) => setCoarse(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return coarse
}

function HomeHero({ rm }: { rm: boolean }) {
  const isTouchDevice = useIsCoarsePointer()
  const disableParallax = rm || isTouchDevice
  const { bgRef, fgRef, textRef } = useParallaxLayers({ withScale: !disableParallax })

  // Only apply will-change during active scroll to reduce GPU memory on low-end devices
  const [isScrolling, setIsScrolling] = useState(false)
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (disableParallax) return
    const onScroll = () => {
      setIsScrolling(true)
      if (scrollTimer.current) clearTimeout(scrollTimer.current)
      scrollTimer.current = setTimeout(() => setIsScrolling(false), 150)
    }
    const container = document.getElementById('main-content')
    window.addEventListener('scroll', onScroll, { passive: true })
    container?.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      container?.removeEventListener('scroll', onScroll)
      if (scrollTimer.current) clearTimeout(scrollTimer.current)
    }
  }, [disableParallax])

  const wcTransform = !disableParallax && isScrolling ? 'will-change-transform' : ''

  return (
    <div className="relative">
      <div className="relative w-full h-[110vw] min-h-[480px] sm:h-auto overflow-hidden">
        {/* Layer 0: Background landscape - slowest parallax */}
        <div
          ref={disableParallax ? undefined : bgRef}
          className={cn('h-full', wcTransform)}
        >
          <img
            src="/img/home-hero-bg.webp"
            alt="Australian conservation landscape"
            className="w-full h-full object-cover object-center sm:h-auto sm:object-fill block"
          />
        </div>

        {/* Layer 1: Foreground elements - medium parallax */}
        <div
          ref={disableParallax ? undefined : fgRef}
          className={cn('absolute bottom-0 inset-x-0 z-[3] flex justify-center', wcTransform)}
        >
          <div className="w-[120%] -ml-[10%] sm:w-[70%] sm:ml-0">
            <img
              src="/img/home-hero-fg.webp"
              alt="Co-Exist volunteers"
              className="w-full h-auto block"
            />
          </div>
        </div>

        {/* Hero text - fastest parallax, recedes behind fg */}
        <div
          ref={disableParallax ? undefined : textRef}
          className={cn('absolute inset-x-0 top-[18%] sm:top-[7%] z-[2] flex flex-col items-center px-6', wcTransform)}
        >
          <img
            src="/logos/white-wordmark.webp"
            alt="Co-Exist"
            className="h-24 sm:h-32 w-auto object-contain"
          />
        </div>

      </div>

      {/* Wave transition - pinned to bottom of image */}
      <WaveTransition />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Your Next Event - full-bleed overlay when cover image exists        */
/* ------------------------------------------------------------------ */

function NextEventCard({
  events,
  isLoading,
  showLoading,
  rm,
}: {
  events: ReturnType<typeof useMyUpcomingEvents>['data']
  isLoading: boolean
  showLoading: boolean
  rm: boolean
}) {
  const navigate = useNavigate()
  const [checkIn, setCheckIn] = useState<{
    eventId: string
    eventTitle: string
    collectiveName: string
  } | null>(null)

  if (isLoading && showLoading) {
    return (
      <div className="rounded-2xl bg-surface-1 shadow-sm p-6 animate-pulse space-y-3">
        <div className="h-3 w-28 rounded-full bg-primary-100" />
        <div className="h-6 w-3/4 rounded-xl bg-primary-50" />
        <div className="h-4 w-1/2 rounded-full bg-primary-50" />
      </div>
    )
  }

  const nextEvent = events?.[0]

  if (!nextEvent) {
    return (
      <motion.div variants={rm ? undefined : fadeUp}>
        <Section title="Your Next Event">
          <div
            className="rounded-2xl bg-gradient-to-br from-primary-600 to-moss-600 shadow-sm p-6 text-center cursor-pointer active:scale-[0.98] transition-transform duration-150"
            onClick={() => navigate('/events')}
            role="button"
            tabIndex={0}
            aria-label="No upcoming events - discover what's happening near you"
          >
            <Search size={24} className="mx-auto text-white/60 mb-3" />
            <p className="text-sm text-white font-medium">No upcoming events</p>
            <p className="text-xs text-white/60 mt-1 mb-4">Discover what's happening near you</p>
            <Button
              variant="primary"
              size="sm"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation()
                navigate('/events')
              }}
            >
              Find Events
            </Button>
          </div>
        </Section>
      </motion.div>
    )
  }

  const happeningNow = isEventHappeningNow(nextEvent.date_start, nextEvent.date_end)
  // Sign-in button uses a wider visibility window: AEST calendar-day start →
  // date_start + 2h. Separate from happeningNow (start→end) so the pulsing
  // ring / live-indicator logic is unaffected.
  const showSignInCTA = isSignInButtonVisible(nextEvent.date_start)
  const days = daysUntil(nextEvent.date_start)
  const isToday = days === 0
  const isTomorrow = days === 1

  /* Shared inner content for the next-event card */
  const cardContent = (
    <>
      {/* Status badge */}
      {happeningNow && (
        <div className="flex items-center gap-2 mb-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
          </span>
          <span className="text-xs font-bold text-white uppercase tracking-wider">
            {nextEvent.registration_status === 'attended' ? 'You\'re at this event' : 'Happening Now'}
          </span>
        </div>
      )}

      <h3 className="font-heading text-xl sm:text-2xl font-bold text-white">
        {nextEvent.title}
      </h3>

      <div className="flex items-center gap-4 mt-3 text-sm text-white">
        <span className="flex items-center gap-1.5">
          <Calendar size={14} aria-hidden="true" />
          {isToday ? 'Today' : isTomorrow ? 'Tomorrow' : formatEventDate(nextEvent.date_start)}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock size={14} aria-hidden="true" />
          {formatEventTime(nextEvent.date_start)}
        </span>
      </div>

      {nextEvent.collectives && (
        <p className="mt-2 text-xs text-white flex items-center gap-1.5">
          <MapPin size={12} aria-hidden="true" />
          {nextEvent.collectives.name}
        </p>
      )}

      {/* CTA */}
      {nextEvent.registration_status === 'attended' && happeningNow ? (
        /* Checked in - prompt to share photos */
        <div className="mt-5 space-y-2.5">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/15 text-white/90 text-xs font-bold">
            <CheckCircle2 size={14} className="text-sprout-300 shrink-0" />
            You're checked in!
          </div>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            icon={<Camera size={20} />}
            className="relative bg-white text-primary-700 hover:bg-white/90 font-bold text-base shadow-sm"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation()
              navigate(`/chat/${nextEvent.collective_id}`)
            }}
          >
            Share Photos with Collective
          </Button>
        </div>
      ) : showSignInCTA ? (
        /* Sign-in window open (today AEST, up to 2h after start) */
        <div className="mt-5 relative">
          {/* Pulsing ring behind the button — only animate once event is live */}
          {happeningNow && (
            <div className="absolute inset-0 rounded-xl bg-white/20 animate-pulse" />
          )}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            icon={<Hash size={20} />}
            className="relative bg-white text-primary-700 hover:bg-white/90 font-bold text-base shadow-sm"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation()
              setCheckIn({
                eventId: nextEvent.id,
                eventTitle: nextEvent.title,
                collectiveName: nextEvent.collectives?.name ?? '',
              })
            }}
          >
            Tap to Sign In
          </Button>
        </div>
      ) : (
        <div className="mt-4 flex items-center text-sm font-semibold text-white">
          View details
          <ChevronRight size={16} className="ml-0.5" />
        </div>
      )}
    </>
  )

  return (
    <motion.div variants={rm ? undefined : fadeUp}>
      <Section title="Your Next Event">
        <div className="sm:max-w-lg">
        {nextEvent.cover_image_url ? (
          /* Full-bleed overlay card when cover image exists */
          <Card
            variant="event"
            watermark={nextEvent.activity_type}
            className={cn(
              happeningNow
                ? 'ring-2 ring-primary-400/60 shadow-sm'
                : 'shadow-sm',
            )}
            onClick={() => navigate(`/events/${nextEvent.id}`)}
            aria-label={nextEvent.title}
          >
            <Card.Overlay
              src={nextEvent.cover_image_url}
              alt=""
              aspectRatio="4/3"
              positionX={nextEvent.cover_image_position_x}
              positionY={nextEvent.cover_image_position_y}
            >
              {cardContent}
            </Card.Overlay>
          </Card>
        ) : (
          /* Gradient card when no cover image */
          <div
            className={cn(
              'relative rounded-2xl overflow-hidden',
              'active:scale-[0.98] transition-transform duration-150 cursor-pointer',
              happeningNow
                ? 'bg-gradient-to-br from-primary-500 to-primary-700 ring-2 ring-primary-400/60 shadow-sm'
                : 'bg-gradient-to-br from-primary-600 to-primary-800 shadow-sm',
            )}
            onClick={() => navigate(`/events/${nextEvent.id}`)}
            role="button"
            tabIndex={0}
            aria-label={nextEvent.title}
          >
            <div className="p-6 min-h-[192px] flex flex-col justify-end">
              {cardContent}
            </div>
          </div>
        )}
        </div>
      </Section>

      <CheckInSheet
        open={!!checkIn}
        onClose={() => setCheckIn(null)}
        eventId={checkIn?.eventId ?? ''}
        eventTitle={checkIn?.eventTitle ?? ''}
        collectiveName={checkIn?.collectiveName ?? ''}
      />
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Upcoming Events carousel - full-bleed overlay cards                */
/* ------------------------------------------------------------------ */

function UpcomingEventsCarousel({ rm }: { rm: boolean }) {
  const navigate = useNavigate()
  const collectiveEvents = useCollectiveUpcomingEvents()

  if (collectiveEvents.isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-3 w-36 rounded-full bg-primary-100 animate-pulse" />
        <div className="relative -mx-6">
          <div className="flex gap-3 px-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="shrink-0 w-56 h-32 rounded-2xl bg-surface-1 shadow-sm animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!collectiveEvents.data?.length) return null

  return (
    <motion.div variants={rm ? undefined : fadeUp}>
      <Section
        title="Upcoming Events"
        action={{ label: 'See All', to: '/events' }}
      >
        <HScroll>
          {collectiveEvents.data.map((event) => {
            const days = daysUntil(event.date_start)
            const isToday = days === 0
            const isTomorrow = days === 1
            const isSoon = days <= 3

            return (
              <Card
                key={event.id}
                variant="event"
                watermark={event.activity_type}
                className="shrink-0 w-56 snap-start shadow-sm"
                onClick={() => navigate(`/events/${event.id}`)}
                aria-label={event.title}
              >
                {event.cover_image_url ? (
                  <Card.Overlay
                    src={event.cover_image_url}
                    alt=""
                    aspectRatio="4/3"
                    positionX={event.cover_image_position_x}
                    positionY={event.cover_image_position_y}
                  >
                    {/* Date badge */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn(
                        'px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider',
                        isToday ? 'bg-white/30 text-white'
                          : isTomorrow ? 'bg-white/30 text-white'
                          : isSoon ? 'bg-white/25 text-white/90'
                          : 'bg-white/20 text-white/80',
                      )}>
                        {isToday ? 'Today' : isTomorrow ? 'Tomorrow' : formatEventDate(event.date_start)}
                      </span>
                    </div>

                    <p className="font-heading text-sm font-semibold text-white truncate">
                      {event.title}
                    </p>

                    <div className="flex items-center gap-2 mt-1.5 text-xs text-white/70">
                      <span className="flex items-center gap-1">
                        <Clock size={11} aria-hidden="true" />
                        {formatEventTime(event.date_start)}
                      </span>
                    </div>

                    {event.collectives && (
                      <p className="mt-1 text-[11px] text-white/50 truncate">
                        {event.collectives.name}
                      </p>
                    )}
                  </Card.Overlay>
                ) : (
                  /* Fallback gradient when no cover image */
                  <div className="bg-gradient-to-br from-primary-400 to-sprout-500 p-4" style={{ aspectRatio: '4/3' }}>
                    <div className="flex flex-col justify-end h-full">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={cn(
                          'px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider',
                          isToday ? 'bg-white/20 text-white'
                            : isTomorrow ? 'bg-white/20 text-white'
                            : isSoon ? 'bg-white/15 text-white/90'
                            : 'bg-white/10 text-white/70',
                        )}>
                          {isToday ? 'Today' : isTomorrow ? 'Tomorrow' : formatEventDate(event.date_start)}
                        </span>
                      </div>

                      <p className="font-heading text-sm font-semibold text-white truncate">
                        {event.title}
                      </p>

                      <div className="flex items-center gap-2 mt-1.5 text-xs text-white/60">
                        <span className="flex items-center gap-1">
                          <Clock size={11} aria-hidden="true" />
                          {formatEventTime(event.date_start)}
                        </span>
                      </div>

                      {event.collectives && (
                        <p className="mt-1 text-[11px] text-white/40 truncate">
                          {event.collectives.name}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </HScroll>
      </Section>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  National Events - retreats, campouts, cross-collective            */
/* ------------------------------------------------------------------ */

function NationalEventsSection({ rm }: { rm: boolean }) {
  const navigate = useNavigate()
  const { data: events } = useNationalEvents()

  if (!events?.length) return null

  return (
    <motion.div variants={rm ? undefined : fadeUp}>
      <Section
        title="Retreats & National Events"
        action={{ label: 'Explore', to: '/explore' }}
      >
        <HScroll>
          {events.map((event) => {
            const days = daysUntil(event.date_start)
            const isToday = days === 0
            const isTomorrow = days === 1

            return (
              <Card
                key={event.id}
                variant="event"
                watermark={event.activity_type}
                className="shrink-0 w-64 snap-start shadow-sm"
                onClick={() => navigate(`/events/${event.id}`)}
                aria-label={event.title}
              >
                {event.cover_image_url ? (
                  <Card.Overlay
                    src={event.cover_image_url}
                    alt=""
                    aspectRatio="16/9"
                    positionX={event.cover_image_position_x}
                    positionY={event.cover_image_position_y}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white/90">
                        {isToday ? 'Today' : isTomorrow ? 'Tomorrow' : formatEventDate(event.date_start)}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-moss-500/80 text-white">
                        National
                      </span>
                    </div>
                    <p className="font-heading text-sm font-semibold text-white truncate">{event.title}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-white/70">
                      <span className="flex items-center gap-1"><Clock size={11} />{formatEventTime(event.date_start)}</span>
                      {event.address && <span className="flex items-center gap-1 truncate"><MapPin size={11} />{event.address}</span>}
                    </div>
                  </Card.Overlay>
                ) : (
                  <div className="bg-gradient-to-br from-moss-500 to-sprout-600 p-4" style={{ aspectRatio: '16/9' }}>
                    <div className="flex flex-col justify-end h-full">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/15 text-white/80">
                          {isToday ? 'Today' : isTomorrow ? 'Tomorrow' : formatEventDate(event.date_start)}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/20 text-white">
                          National
                        </span>
                      </div>
                      <p className="font-heading text-sm font-semibold text-white truncate">{event.title}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-white/50">
                        <span className="flex items-center gap-1"><Clock size={11} />{formatEventTime(event.date_start)}</span>
                        {event.address && <span className="flex items-center gap-1 truncate"><MapPin size={11} />{event.address}</span>}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </HScroll>
      </Section>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Updates section - full-bleed overlay cards                         */
/* ------------------------------------------------------------------ */

function UpdatesSection({ rm }: { rm: boolean }) {
  const navigate = useNavigate()
  const updates = useRecentUpdates()

  if (updates.isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-3 w-28 rounded-full bg-primary-100 animate-pulse" />
        <div className="relative -mx-6">
          <div className="flex gap-3 px-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="shrink-0 w-64 h-28 rounded-2xl bg-surface-1 shadow-sm animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!updates.data?.length) return null

  return (
    <motion.div variants={rm ? undefined : fadeUp}>
      <Section
        title="Updates"
        action={{ label: 'View all', to: '/updates' }}
      >
        <HScroll>
          {updates.data.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate('/updates')}
              aria-label={item.title}
              className="shrink-0 w-56 snap-start text-left rounded-2xl overflow-hidden bg-amber-50 shadow-sm active:scale-[0.98] transition-transform duration-150 flex flex-col"
            >
              {/* Image - fixed 4/3 ratio, only rendered when present */}
              {item.image_url && (
                <div className="w-full shrink-0 overflow-hidden bg-neutral-200" style={{ aspectRatio: '4/3' }}>
                  <img
                    src={item.image_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {/* Text panel - grows naturally */}
              <div className="flex flex-col p-4 gap-1.5">
                <p className="font-heading text-sm font-bold text-neutral-900 leading-snug line-clamp-2">
                  {item.title}
                </p>

                {item.content && (
                  <p className="text-[11px] text-neutral-700 leading-relaxed line-clamp-3">
                    {item.content}
                  </p>
                )}

                <div className="flex items-center gap-1.5 mt-1.5">
                  {item.author?.avatar_url ? (
                    <img src={item.author.avatar_url} alt="" loading="lazy" className="w-4 h-4 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-neutral-200 flex items-center justify-center shrink-0">
                      <Megaphone size={9} className="text-neutral-500" />
                    </div>
                  )}
                  <span className="text-[10px] text-neutral-500 truncate flex-1">
                    {item.author?.display_name ?? 'Co-Exist'}
                  </span>
                  <span className="text-[10px] text-neutral-400 shrink-0">
                    {relativeTime(item.created_at ?? '')}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </HScroll>
      </Section>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Impact section with scope + time toggles                           */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Impact row components                                              */
/* ------------------------------------------------------------------ */

/* (Impact stats now use BentoStatCard / BentoStatGrid from bento-stats.tsx) */

function HomeImpactSection({
  collectives,
  rm,
  showCollectiveToggle,
}: {
  collectives: MyCollectiveSummary[]
  rm: boolean
  showCollectiveToggle?: boolean
}) {
  const hasCollectives = collectives.length > 0 || !!showCollectiveToggle
  const hasMultiple = collectives.length > 1
  const [scope, setScope] = useState<'national' | 'collective'>('national')
  const [selectedCollectiveId, setSelectedCollectiveId] = useState<string | undefined>(collectives[0]?.id)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [timeRange, setTimeRange] = useState<'all-time' | 'current-year'>('all-time')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Set default collective once data loads (for staff whose initial list is empty)
  useEffect(() => {
    if (!selectedCollectiveId && collectives.length > 0) {
      setSelectedCollectiveId(collectives[0].id)
    }
  }, [collectives, selectedCollectiveId])

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  const activeCollectiveId = scope === 'collective' ? selectedCollectiveId : undefined
  const selectedCollective = collectives.find((c) => c.id === selectedCollectiveId)

  const national = useNationalImpact(timeRange)
  const collective = useCollectiveImpact(activeCollectiveId, timeRange)

  const data: CanonicalImpact | null | undefined =
    scope === 'national' ? national.data : collective.data
  // Only show skeleton on very first load - subsequent toggles keep previous data visible
  const isInitialLoading = scope === 'national'
    ? national.isLoading && !national.isPlaceholderData
    : collective.isLoading && !collective.isPlaceholderData

  const totalEvents = data?.eventsHeld ?? 0

  const sectionRef = useRef<HTMLDivElement>(null)
  const inView = useInView(sectionRef, { once: true, margin: '-60px' })

  return (
    <motion.div variants={rm ? undefined : fadeUp} className="-mx-2 sm:-mx-3">
      <div ref={sectionRef} className="relative overflow-hidden bg-[#879e62] rounded-2xl">

        <div className="relative px-5 sm:px-7 pt-14 pb-16 sm:pt-16 sm:pb-20">
          {/* Header - editorial style */}
          <motion.div
            className="mb-8"
            initial={rm ? undefined : { opacity: 0 }}
            animate={inView ? { opacity: 1 } : undefined}
            transition={{ duration: 0.4 }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <p className="font-heading text-[10px] font-bold text-[#f4f2ec] uppercase tracking-[0.2em]">
                What We've Done
              </p>
              <Link
                to="/profile"
                className="flex items-center gap-0.5 text-[11px] font-semibold text-[#f4f2ec] hover:text-white active:scale-[0.97] transition-[colors,transform] duration-150"
              >
                My impact
                <ChevronRight size={13} />
              </Link>
            </div>
            <h2 className="font-heading text-[28px] sm:text-[34px] font-bold text-[#f4f2ec] leading-tight tracking-tight">
              Our Impact
            </h2>
          </motion.div>

          {/* Toggles */}
          <div className="flex items-center gap-2 mb-6 flex-nowrap min-w-0">
            {/* Scope toggle: National / Collective (with dropdown if multiple) */}
            <div className="flex rounded-full bg-[#f4f2ec]/15 p-0.5">
              <button
                type="button"
                onClick={() => setScope('national')}
                className={cn(
                  'px-3.5 min-h-9 rounded-full text-[11px] font-semibold transition-transform duration-200 active:scale-[0.95] cursor-pointer select-none whitespace-nowrap',
                  scope === 'national'
                    ? 'bg-white/90 text-primary-900 shadow-sm'
                    : 'text-[#f4f2ec]/70 hover:text-[#f4f2ec]',
                )}
              >
                <Globe size={11} className="inline mr-1 -mt-0.5" />
                National
              </button>
              {hasCollectives && (
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => {
                      if (scope !== 'collective') {
                        setScope('collective')
                        if (hasMultiple) setDropdownOpen(true)
                      } else if (hasMultiple) {
                        setDropdownOpen((o) => !o)
                      }
                    }}
                    className={cn(
                      'px-3.5 min-h-9 rounded-full text-[11px] font-semibold transition-transform duration-200 active:scale-[0.95] cursor-pointer select-none flex items-center gap-1 max-w-[160px]',
                      scope === 'collective'
                        ? 'bg-white/90 text-primary-900 shadow-sm'
                        : 'text-[#f4f2ec]/70 hover:text-[#f4f2ec]',
                    )}
                  >
                    <MapPin size={11} className="-mt-0.5 shrink-0" />
                    <span className="truncate">
                      {hasMultiple && scope === 'collective' && selectedCollective
                        ? selectedCollective.name
                        : 'Collective'}
                    </span>
                    {hasMultiple && <ChevronDown size={11} className={cn('shrink-0 transition-transform duration-200', dropdownOpen && 'rotate-180')} />}
                  </button>

                  {/* Dropdown for multiple collectives */}
                  {hasMultiple && dropdownOpen && (
                    <div className="absolute top-full left-0 mt-1.5 min-w-[180px] max-h-[240px] overflow-y-auto rounded-xl bg-white shadow-lg border border-neutral-100 z-50">
                      {collectives.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedCollectiveId(c.id)
                            setScope('collective')
                            setDropdownOpen(false)
                          }}
                          className={cn(
                            'w-full px-4 py-2.5 text-left text-xs font-medium transition-colors duration-100 cursor-pointer',
                            c.id === selectedCollectiveId
                              ? 'bg-primary-50 text-primary-800 font-semibold'
                              : 'text-neutral-700 hover:bg-neutral-50',
                          )}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Time range toggle */}
            <div className="flex rounded-full bg-[#f4f2ec]/15 p-0.5">
              <button
                type="button"
                onClick={() => setTimeRange('all-time')}
                className={cn(
                  'px-3 min-h-9 rounded-full text-[11px] font-semibold transition-transform duration-200 active:scale-[0.95] cursor-pointer select-none whitespace-nowrap',
                  timeRange === 'all-time'
                    ? 'bg-white/90 text-primary-900 shadow-sm'
                    : 'text-[#f4f2ec]/70 hover:text-[#f4f2ec]',
                )}
              >
                All Time
              </button>
              <button
                type="button"
                onClick={() => setTimeRange('current-year')}
                className={cn(
                  'px-3 min-h-9 rounded-full text-[11px] font-semibold transition-transform duration-200 active:scale-[0.95] cursor-pointer select-none whitespace-nowrap',
                  timeRange === 'current-year'
                    ? 'bg-white/90 text-primary-900 shadow-sm'
                    : 'text-[#f4f2ec]/70 hover:text-[#f4f2ec]',
                )}
              >
                {new Date().getFullYear()}
              </button>
            </div>
          </div>

          {/* Content - bento card grid */}
          {isInitialLoading ? (
            <div className="space-y-3">
              <div className="h-36 rounded-3xl bg-white/20 animate-pulse" />
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-24 rounded-3xl bg-white/15 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
                ))}
              </div>
            </div>
          ) : (
            <BentoStatGrid>
              <BentoStatCard
                value={data?.treesPlanted ?? 0}
                label="Trees Planted"
                icon={<TreePine size={20} />}
                description="Every tree planted by Co-Exist volunteers across the country."
              />
              <BentoStatCard value={data?.eventsAttended ?? 0} label="Attendees" icon={<Users size={18} />} />
              <BentoStatCard value={totalEvents} label="Events" icon={<Calendar size={18} />} />
              <BentoStatCard value={data?.volunteerHours ?? 0} label="Vol. Hours" icon={<Clock size={18} />} unit="hrs" />
              <BentoStatCard value={data?.rubbishCollectedKg ?? 0} label="Litter Removed" icon={<Trash2 size={18} />} unit="kg" />
              <BentoStatCard value={data?.leadersEmpowered ?? 0} label="Leaders Empowered" icon={<GraduationCap size={18} />} />
              <BentoStatCard value={data?.collectivesCount ?? 0} label="Collectives" icon={<MapPin size={18} />} />
            </BentoStatGrid>
          )}
        </div>

      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Donate + Shop CTA - full-bleed dark closer                         */
/* ------------------------------------------------------------------ */

function CtaCards({ rm }: { rm: boolean }) {
  const navigate = useNavigate()

  return (
    <motion.div variants={rm ? undefined : fadeUp} className="flex flex-col gap-3">
      {/* Donate */}
      <button
        onClick={() => navigate('/donate')}
        className="w-full flex items-center gap-4 px-5 h-16 rounded-2xl bg-gradient-to-r from-primary-500 to-primary-700 shadow-sm active:scale-[0.98] transition-transform duration-150"
      >
        <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/20 text-white shrink-0">
          <Heart size={18} />
        </span>
        <div className="flex-1 text-left">
          <p className="text-[15px] font-bold text-white leading-tight">Donate</p>
          <p className="text-[11px] text-white/65 mt-0.5">Support Co-Exist Australia</p>
        </div>
        <ChevronRight size={18} className="text-white/50 shrink-0" />
      </button>

      {/* Shop */}
      <button
        onClick={() => navigate('/shop')}
        className="w-full flex items-center gap-4 px-5 h-16 rounded-2xl bg-gradient-to-r from-bark-500 to-bark-700 shadow-sm active:scale-[0.98] transition-transform duration-150"
      >
        <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/20 text-white shrink-0">
          <ShoppingBag size={18} />
        </span>
        <div className="flex-1 text-left">
          <p className="text-[15px] font-bold text-white leading-tight">Shop merch</p>
          <p className="text-[11px] text-white/65 mt-0.5">Wear the movement</p>
        </div>
        <ChevronRight size={18} className="text-white/50 shrink-0" />
      </button>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Home page                                                          */
/* ------------------------------------------------------------------ */

export default function HomePage() {
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const queryClient = useQueryClient()
  const { profile, user, isStaff } = useAuth()

  const myCollective = useMyCollective()
  const myCollectives = useMyCollectives()
  const myEvents = useMyUpcomingEvents()
  const impact = useImpactStats()
  const pendingSurveys = usePendingSurveys()
  const initialLoading = myCollective.isLoading || myEvents.isLoading || impact.isLoading
  const initialError = myCollective.isError && myEvents.isError && impact.isError
  const showLoading = useDelayedLoading(initialLoading)

  // Prefetch the "Your Next Event" detail page so tapping it is instant
  const nextEventId = myEvents.data?.[0]?.id
  useEffect(() => {
    if (nextEventId && user?.id) {
      prefetchEventDetail(queryClient, nextEventId, user.id)
    }
  }, [nextEventId, user?.id, queryClient])

  const firstName = profile?.display_name?.split(' ')[0]

  return (
    <Page noBackground className="!px-0 bg-white">
      <div className={cn('relative', 'min-h-full')}>
        <div className="pointer-events-none sticky top-0 h-[100dvh] -mb-[100dvh] overflow-hidden">
          <div className="absolute inset-0 bg-white" />
        </div>
        <div className="relative">
        {/* -- Content -- */}
        <div className="relative z-10">
{/* 1. Parallax layered hero */}
          <HomeHero rm={rm} />

          {/* Greeting */}
          <div className="px-4 pt-6 mb-2">
            <motion.p
              initial={rm ? {} : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="font-heading text-xl sm:text-2xl font-bold text-neutral-900"
            >
              {getGreeting(firstName)}
            </motion.p>
            <motion.p
              initial={rm ? {} : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="text-sm text-neutral-500 mt-1"
            >
              Explore. Connect. Protect.
            </motion.p>
          </div>

          {/* Error fallback */}
          {initialError && (
            <div className="px-4 py-8">
              <EmptyState
                illustration="error"
                title="Something went wrong"
                description="We couldn't load your feed. Pull down to try again."
              />
            </div>
          )}

          {/* Body sections */}
          <motion.div
            className="px-4 sm:px-6 lg:px-8 space-y-10 pb-24 mt-4"
            initial="hidden"
            animate="visible"
            variants={rm ? undefined : stagger}
          >
            {/* Proximity check-in banner */}
            <ProximityCheckInBanner />

            {/* Pending survey banners */}
            {pendingSurveys.data && pendingSurveys.data.length > 0 && (
              <motion.div variants={rm ? undefined : fadeUp} className="space-y-2">
                {pendingSurveys.data.map((survey) => (
                  <div
                    key={survey.event_id}
                    className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-bark-600 to-bark-700 shadow-sm p-4 active:scale-[0.98] transition-transform duration-150 cursor-pointer"
                    onClick={() => navigate(`/events/${survey.event_id}/survey`)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Complete survey for ${survey.event_title}`}
                  >
                    <span className="flex items-center justify-center w-9 h-9 rounded-full bg-white/15 text-white shrink-0">
                      <Calendar size={16} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        How was {survey.event_title}?
                      </p>
                      <p className="text-xs text-white/60 truncate">
                        Share your feedback{survey.collective_name ? ` · ${survey.collective_name}` : ''}
                      </p>
                    </div>
                    <ChevronRight size={18} className="text-white/50 shrink-0" />
                  </div>
                ))}
              </motion.div>
            )}

            {/* 2. Your Next Event */}
            <NextEventCard
              events={myEvents.data}
              isLoading={myEvents.isLoading}
              showLoading={showLoading}
              rm={rm}
            />

            {/* 3. Upcoming Events carousel */}
            <UpcomingEventsCarousel rm={rm} />

            {/* 3b. National Events (retreats, campouts) */}
            <NationalEventsSection rm={rm} />

            {/* 4. Updates section */}
            <UpdatesSection rm={rm} />

            {/* 5. Impact section */}
            <HomeImpactSection
              collectives={myCollectives.data ?? []}
              rm={rm}
              showCollectiveToggle={isStaff || (myCollectives.data ?? []).length > 1}
            />

            {/* 6. Donate + Shop CTA cards */}
            <CtaCards rm={rm} />
          </motion.div>
        </div>
        </div>
      </div>
    </Page>
  )
}
