import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { Calendar, MapPin, Users, TreePine, ExternalLink, Download, Ticket } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { Button } from '@/components/button'
import { Skeleton } from '@/components/skeleton'
import { OGMeta, SITE_URL } from '@/components/og-meta'
import { APP_NAME } from '@/lib/constants'
import { isEventSoldOut } from '@/lib/event-sold-out'
import { formatTime } from '@/lib/date-format'
import { WebFooter } from '@/components/web-footer'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'
import { TicketQuestionsModal } from '@/components/ticket-questions-modal'
import { useEventTicketQuestions, type TicketAnswers } from '@/hooks/use-event-ticket-questions'
import { CampoutGuestRequirementsModal } from '@/components/campout-guest-requirements-modal'
import { isCampoutActivity } from '@/lib/dietary'

function formatDate(date: string, _legacyTz?: string) {
  // Floating local time (Tate 2026-05-25): stored wall-clock is the
  // wall-clock for every viewer.
  return new Date(date).toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

const ACTIVITY_LABELS: Record<string, string> = {
  clean_up: 'Clean Up',
  tree_planting: 'Tree Planting',
  ecosystem_restoration: 'Ecosystem Restoration',
  nature_hike: 'Nature Hike',
  camp_out: 'Camp Out',
  spotlighting: 'Spotlighting',
  other: 'Other',
}

export default function PublicEventPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  // Capture "now" once at mount (pure in render) to decide if the event has
  // ended, instead of calling Date.now() during render.
  const [nowMs] = useState(() => Date.now())

  const { data: event, isLoading, error } = useQuery({
    queryKey: ['public-event', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*, collectives(name, slug, timezone, region)')
        .eq('id', id!)
        .eq('is_public', true)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })

  // Guest ticket purchase (no account needed) for public ticketed events.
  const isTicketed = !!(event as { is_ticketed?: boolean } | undefined)?.is_ticketed

  // The SAME number the app, the leader roster and the buy gate read.
  //
  // Until 2026-08-25 this page read no availability at all: `soldOut` was ONLY
  // the manual event_extras.sold_out flag for events that sold out on
  // Eventbrite. So the public page happily advertised "25 spots" and an active
  // Get Ticket button for Wild Mountains while 26 tickets were already sold
  // against a capacity of 25, and the purchase then blew up server-side in
  // reserve_event_ticket with "Sold out". Both RPCs are SECURITY DEFINER and
  // granted to anon precisely so this page can tell the truth to a logged-out
  // visitor, which is the authed/non-authed parity Tate asked for.
  const { data: spotsTaken } = useQuery({
    queryKey: ['public-event-spots', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('event_spots_taken', { p_event_id: id! })
      if (error) throw error
      return (data as number | null) ?? 0
    },
    enabled: !!id,
    staleTime: 30 * 1000,
  })
  const { data: availability } = useQuery({
    queryKey: ['public-event-availability', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_event_ticket_availability', { p_event_id: id! })
      if (error) throw error
      return (data ?? []) as { ticket_type_id: string; capacity: number | null; sold: number; remaining: number | null }[]
    },
    enabled: !!id && isTicketed,
    staleTime: 30 * 1000,
  })

  const capacity = (event as { capacity?: number | null } | undefined)?.capacity ?? null
  const spotsLeft = capacity != null && spotsTaken != null ? Math.max(0, capacity - spotsTaken) : null
  const everyTypeFull = !!availability?.length
    && availability.every((a) => a.remaining !== null && a.remaining <= 0)
  // Sold out = the manual external flag, OR the event is genuinely at capacity,
  // OR every active ticket type has no inventory left.
  const soldOut = isEventSoldOut(event)
    || (capacity != null && spotsTaken != null && spotsTaken >= capacity)
    || everyTypeFull
  const { data: ticketTypes } = useQuery({
    queryKey: ['public-event-tickets', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_ticket_types')
        .select('id, name, description, price_cents, is_active, sort_order')
        .eq('event_id', id!)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!id && isTicketed,
  })
  const [buyName, setBuyName] = useState('')
  const [buyEmail, setBuyEmail] = useState('')
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [buying, setBuying] = useState(false)
  const [buyError, setBuyError] = useState<string | null>(null)
  const [showGuestQuestions, setShowGuestQuestions] = useState(false)
  const [showCampoutReqs, setShowCampoutReqs] = useState(false)
  const [campoutReqs, setCampoutReqs] = useState<{ dietary: string; medical: string; emergencyName: string; emergencyPhone: string; emergencyRelationship: string } | null>(null)
  const { data: ticketQuestions = [] } = useEventTicketQuestions(id)

  const activeTypeId = selectedType ?? ticketTypes?.[0]?.id ?? null
  const activeType = ticketTypes?.find((t) => t.id === activeTypeId) ?? null
  const isCampout = isCampoutActivity((event as { activity_type?: string } | undefined)?.activity_type)

  async function doGuestCheckout(answers?: TicketAnswers, reqs?: { dietary: string; medical: string; emergencyName: string; emergencyPhone: string; emergencyRelationship: string } | null) {
    if (!activeTypeId) return
    const safety = reqs ?? campoutReqs
    setBuying(true)
    setBuyError(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/guest-ticket-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          event_id: id,
          ticket_type_id: activeTypeId,
          email: buyEmail.trim(),
          name: buyName.trim(),
          quantity: 1,
          answers: answers ?? null,
          ...(safety
            ? {
                dietary: safety.dietary,
                medical: safety.medical,
                emergency_name: safety.emergencyName,
                emergency_phone: safety.emergencyPhone,
                emergency_relationship: safety.emergencyRelationship,
              }
            : {}),
        }),
      })
      const out = await res.json()
      if (!res.ok || !out.url) throw new Error(out.error || 'Could not start checkout')
      window.location.href = out.url
    } catch (e) {
      setBuyError(e instanceof Error ? e.message : 'Could not start checkout')
      setBuying(false)
    }
  }

  // After the camp-out dietary/medical step, continue to custom questions (if
  // any) or straight to checkout, carrying the just-collected answers.
  function continueAfterCampoutReqs(reqs: { dietary: string; medical: string; emergencyName: string; emergencyPhone: string; emergencyRelationship: string }) {
    setCampoutReqs(reqs)
    setShowCampoutReqs(false)
    if (ticketQuestions.length > 0) {
      setShowGuestQuestions(true)
      return
    }
    void doGuestCheckout(undefined, reqs)
  }

  function handleBuy() {
    if (!activeTypeId) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyEmail.trim())) {
      setBuyError('Please enter a valid email address')
      return
    }
    // Dietary + medical/allergy info AND an emergency contact are mandatory for
    // every ticketed event (this buy path is only reachable for ticketed
    // events). Collect them first (guest-ticket-checkout also enforces
    // server-side, so no buy surface can skip it). Then custom questions, then
    // pay. Emergency contact added 2026-08-26 on Kurt's ask: leaders were
    // chasing it by hand after the fact for every retreat.
    if (!campoutReqs) {
      setShowCampoutReqs(true)
      return
    }
    // Collect custom question answers first if the event has any.
    if (ticketQuestions.length > 0) {
      setShowGuestQuestions(true)
      return
    }
    void doGuestCheckout()
  }

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-white">
        <div className="h-64 animate-pulse bg-white" />
        <div className="mx-auto max-w-2xl p-6 space-y-4">
          <Skeleton variant="title" />
          <Skeleton variant="text" count={4} />
        </div>
      </div>
    )
  }
  if (error || !event) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-white p-6">
        <OGMeta title="Event Not Found" description="This event doesn't exist or is no longer available." />
        <h1 className="font-heading text-2xl font-bold text-neutral-900">Event not found</h1>
        <p className="mt-2 text-neutral-500">This event doesn't exist or is no longer public.</p>
        <Button variant="primary" className="mt-6" onClick={() => navigate('/download')}>
          Get the {APP_NAME} App
        </Button>
      </div>
    )
  }

  const collective = (event as Record<string, unknown>).collectives as
    | { name?: string; region?: string }
    | null
    | undefined
  // "Hosted by Co-Exist <region>" (Tate 2026-06-09), e.g. "Co-Exist Sunshine
  // Coast". Region is the human-facing place name; fall back to the collective
  // name if a region is somehow missing.
  const collectiveLabel = collective
    ? `Co-Exist ${collective.region || collective.name}`
    : undefined

  const canonicalPath = `/event/${event.id}`
  const activityLabel = ACTIVITY_LABELS[event.activity_type] || 'conservation'
  const metaDescription = event.description
    ? event.description.slice(0, 155) + (event.description.length > 155 ? '...' : '')
    : `Join this ${activityLabel} event with Co-Exist${collectiveLabel ? `, hosted by ${collectiveLabel}` : ''} in Australia.`

  // Public events are served regardless of status, so cancelled/completed
  // events must NOT render as live: no buy card, an explicit state banner, and
  // an accurate JSON-LD eventStatus (backlog public-event status finding).
  const lifecycleStatus = (event as { status?: string }).status
  const isCancelled = lifecycleStatus === 'cancelled'
  const endMs = event.date_end
    ? new Date(event.date_end).getTime()
    : event.date_start
      ? new Date(event.date_start).getTime()
      : null
  const isEnded = !isCancelled && (lifecycleStatus === 'completed' || (endMs != null && endMs < nowMs))
  const isBuyable = !isCancelled && !isEnded

  const eventJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description: event.description || metaDescription,
    startDate: event.date_start,
    ...(event.date_end && { endDate: event.date_end }),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: isCancelled
      ? 'https://schema.org/EventCancelled'
      : 'https://schema.org/EventScheduled',
    ...(event.address && {
      location: {
        '@type': 'Place',
        name: event.address,
        address: { '@type': 'PostalAddress', addressCountry: 'AU', streetAddress: event.address },
      },
    }),
    ...(event.cover_image_url && { image: event.cover_image_url }),
    organizer: {
      '@type': 'Organization',
      name: collectiveLabel || 'Co-Exist Australia',
      url: 'https://www.coexistaus.org',
    },
    ...(event.capacity && {
      maximumAttendeeCapacity: event.capacity,
    }),
    isAccessibleForFree: true,
    url: `${SITE_URL}${canonicalPath}`,
  }

  return (
    <div className="min-h-dvh bg-white">
      <OGMeta
        title={event.title}
        description={metaDescription}
        canonicalPath={canonicalPath}
        image={event.cover_image_url || undefined}
        jsonLd={eventJsonLd}
      />

      {/* Hero image */}
      <div className="relative h-64 sm:h-80 bg-primary-800 overflow-hidden">
        {event.cover_image_url ? (
          <img
            src={event.cover_image_url}
            alt={event.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <TreePine size={64} className="text-primary-300" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {/* Activity badge */}
        <motion.div
          initial={shouldReduceMotion ? false : { y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="absolute bottom-4 left-4"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-sm font-semibold text-neutral-500 shadow-sm">
            <TreePine size={14} />
            {ACTIVITY_LABELS[event.activity_type] || event.activity_type}
          </span>
        </motion.div>
      </div>

      {/* Content */}
      <motion.div
        className="mx-auto max-w-2xl px-4 py-6 sm:px-6"
        variants={shouldReduceMotion ? undefined : stagger}
        initial="hidden"
        animate="visible"
      >
        {/* Title */}
        <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
          <h1 className="font-heading text-2xl font-bold text-neutral-900 sm:text-3xl">
            {event.title}
          </h1>

          {collectiveLabel && (
            <p className="mt-1 text-sm font-medium text-neutral-500">
              Hosted by {collectiveLabel}
            </p>
          )}
        </motion.div>

        {/* Details grid */}
        <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="mt-6 space-y-3">
          <div className="flex items-start gap-3">
            <Calendar size={20} className="mt-0.5 shrink-0 text-primary-500" />
            <div>
              {(() => {
                const tz =
                  (event as { timezone?: string | null }).timezone ??
                  (event as { collectives?: { timezone?: string | null } | null }).collectives?.timezone ??
                  undefined
                return (
                  <>
                    <p className="font-medium text-neutral-900">{formatDate(event.date_start, tz)}</p>
                    <p className="text-sm text-neutral-500">
                      {formatTime(event.date_start, tz)}
                      {event.date_end && ` - ${formatTime(event.date_end, tz)}`}
                    </p>
                  </>
                )
              })()}
            </div>
          </div>

          {event.address && (
            <div className="flex items-start gap-3">
              <MapPin size={20} className="mt-0.5 shrink-0 text-primary-500" />
              <p className="text-neutral-900">{event.address}</p>
            </div>
          )}

          {event.capacity && (
            <div className="flex items-start gap-3">
              <Users size={20} className="mt-0.5 shrink-0 text-primary-500" />
              <p className="text-neutral-900">
                {spotsLeft === null
                  ? `${event.capacity} spots`
                  : spotsLeft === 0
                    ? `${event.capacity} spots - full`
                    : `${spotsLeft} of ${event.capacity} spots left`}
              </p>
            </div>
          )}
        </motion.div>

        {/* Description */}
        {event.description && (
          <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="mt-6">
            <h2 className="font-heading text-lg font-semibold text-neutral-900">About this event</h2>
            <p className="mt-2 whitespace-pre-line text-neutral-500 leading-relaxed">
              {event.description}
            </p>
          </motion.div>
        )}

        {/* Cancelled / ended states - render instead of a working buy card. */}
        {isCancelled && (
          <motion.div
            variants={shouldReduceMotion ? undefined : fadeUp}
            className="mt-8 rounded-md border border-error-200 bg-error-50 p-5"
          >
            <h2 className="font-heading text-lg font-semibold text-error-700">This event has been cancelled</h2>
            <p className="mt-2 text-sm text-error-600 leading-relaxed">
              The organisers have cancelled this event. If you bought a ticket, they will be in touch about a refund.
            </p>
          </motion.div>
        )}
        {isEnded && (
          <motion.div
            variants={shouldReduceMotion ? undefined : fadeUp}
            className="mt-8 rounded-md border border-neutral-200 bg-neutral-50 p-5"
          >
            <h2 className="font-heading text-lg font-semibold text-neutral-900">This event has ended</h2>
            <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
              Registrations are closed. Explore what else is happening near you in the Co-Exist app.
            </p>
          </motion.div>
        )}

        {/* Sold out: native guest sales closed.
            This panel is ALSO what a held-spot invitee sees, and that is the
            trap it has to defuse. Their own reserved seat counts toward
            capacity, so an event that is "full" is often full BECAUSE of them.
            This page is anonymous (no auth context here at all), so it cannot
            identify them and silently let them through the way the in-app
            event page does. What it can do is stop being a dead end and name
            the route. Origin 2026-08-26: five Murbpook invitees were told a
            spot was held for them, landed here logged out, read "Sold out",
            and one emailed the office saying the page "will not allow me to
            select a ticket". */}
        {isBuyable && isTicketed && soldOut && (
          <motion.div
            variants={shouldReduceMotion ? undefined : fadeUp}
            className="mt-8 rounded-md border border-neutral-200 bg-neutral-50 p-5"
          >
            <div className="flex items-center gap-2">
              <Ticket size={18} className="text-neutral-400" />
              <h2 className="font-heading text-lg font-semibold text-neutral-900">Sold out</h2>
            </div>
            <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
              Every spot for this campout has been taken. If the organisers sent you a claim
              link, open it to grab your free app ticket and join the group chat.
            </p>
            <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
              Been told a spot is held for you? It still is, and this page will say sold out
              either way, because your spot is one of the ones counted here. Open the
              pay-to-confirm link from your email, or sign in to the app and open this
              campout, and you can pay for it there.
            </p>
          </motion.div>
        )}

        {/* Guest ticket purchase (no account required) */}
        {isBuyable && isTicketed && !soldOut && activeType && (
          <motion.div
            variants={shouldReduceMotion ? undefined : fadeUp}
            className="mt-8 rounded-md border border-neutral-100 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <Ticket size={18} className="text-primary-500" />
              <h2 className="font-heading text-lg font-semibold text-neutral-900">Get your ticket</h2>
            </div>

            {ticketTypes && ticketTypes.length > 1 ? (
              <div className="mt-3 space-y-2">
                {ticketTypes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedType(t.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-sm border px-4 py-3 text-left transition-colors',
                      activeTypeId === t.id ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 hover:bg-neutral-50',
                    )}
                  >
                    <span>
                      <span className="font-medium text-neutral-900">{t.name}</span>
                      {t.description && <span className="block text-xs text-neutral-500">{t.description}</span>}
                    </span>
                    <span className="font-semibold text-neutral-900">${(t.price_cents / 100).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-neutral-500">
                {activeType.name} ·{' '}
                <span className="font-semibold text-neutral-900">${(activeType.price_cents / 100).toFixed(2)}</span>
              </p>
            )}

            <div className="mt-4 space-y-3">
              <input
                value={buyName}
                onChange={(e) => setBuyName(e.target.value)}
                placeholder="Your name (optional)"
                className="w-full rounded-sm border border-neutral-200 px-4 py-3 text-neutral-900 outline-none focus:border-primary-500"
              />
              <input
                value={buyEmail}
                onChange={(e) => { setBuyEmail(e.target.value); setBuyError(null) }}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="Email for your ticket"
                className="w-full rounded-sm border border-neutral-200 px-4 py-3 text-neutral-900 outline-none focus:border-primary-500"
              />
            </div>

            {buyError && <p className="mt-2 text-sm text-error-500">{buyError}</p>}

            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={buying}
              disabled={buying}
              onClick={handleBuy}
              className="mt-4"
            >
              {`Get ticket - $${(activeType.price_cents / 100).toFixed(2)}`}
            </Button>
            <p className="mt-2 text-center text-xs text-neutral-400">
              No account needed. We'll email your ticket and a link to the group chat.
            </p>
          </motion.div>
        )}

        {/* CTAs (secondary when buying a ticket: the buy card above leads) */}
        <motion.div
          variants={shouldReduceMotion ? undefined : fadeUp}
          className={cn(
            'mt-4 flex flex-col gap-3',
            !isTicketed && 'mt-8 sticky bottom-4 rounded-md bg-white/95 p-4 shadow-sm',
            'sm:relative sm:bottom-auto sm:bg-transparent sm:p-0 sm:shadow-none',
          )}
        >
          <Button
            variant={isTicketed ? 'secondary' : 'primary'}
            size="lg"
            fullWidth
            icon={<ExternalLink size={18} />}
            onClick={() => {
              // Try to open in-app, fallback to app store
              window.location.href = `coexist://events/${event.id}`
              setTimeout(() => {
                navigate('/download')
              }, 1500)
            }}
          >
            Open in App
          </Button>
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            icon={<Download size={18} />}
            onClick={() => navigate('/download')}
          >
            Download {APP_NAME}
          </Button>
        </motion.div>

      </motion.div>

      <WebFooter />

      <CampoutGuestRequirementsModal
        open={showCampoutReqs}
        submitting={buying}
        isCampout={isCampout}
        onClose={() => { if (!buying) setShowCampoutReqs(false) }}
        onSubmit={continueAfterCampoutReqs}
      />

      <TicketQuestionsModal
        open={showGuestQuestions}
        questions={ticketQuestions}
        submitting={buying}
        onClose={() => setShowGuestQuestions(false)}
        onSubmit={(answers) => {
          setShowGuestQuestions(false)
          void doGuestCheckout(answers)
        }}
      />
    </div>
  )
}
