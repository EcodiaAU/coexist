import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { Calendar, MapPin, Check, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { wallClockNow } from '@/lib/date-format'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { Button } from '@/components/button'
import { Card } from '@/components/card'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import type { Database } from '@/types/database.types'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

type Event = Database['public']['Tables']['events']['Row']

interface StepFirstEventProps {
  collectiveId: string | null
  onNext: () => void
  onSkip: () => void
}

export function StepFirstEvent({ collectiveId, onNext, onSkip }: StepFirstEventProps) {
  const { user } = useAuth()
  const shouldReduceMotion = useReducedMotion()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: events, isLoading, error } = useQuery({
    queryKey: ['onboarding-events', collectiveId],
    queryFn: async () => {
      let query = supabase
        .from('events')
        .select('*')
        .eq('status', 'published')
        // Ticketed events need a real checkout, not a one-tap RSVP. Including
        // them here let new users "register" a paid campout without buying a
        // ticket, leaving them in the "registered, no ticket" grey zone that
        // muddled the roster (Charli/Max, Angelica 2026-07-09). Onboarding
        // one-tap RSVP is for free events only; ticketed events are found and
        // bought on the event page.
        .eq('is_ticketed', false)
        .gte('date_start', wallClockNow().toISOString())
        .order('date_start', { ascending: true })
        .limit(5)

      if (collectiveId) {
        query = query.eq('collective_id', collectiveId)
      }

      const { data } = await query
      return data as Event[]
    },
  })
  const showLoading = useDelayedLoading(isLoading)

  const [rsvpedEvents, setRsvpedEvents] = useState<Set<string>>(new Set())
  const [rsvpingEvent, setRsvpingEvent] = useState<string | null>(null)

  // Seed "Going" from the DB so it survives this step being unmounted and
  // remounted by the onboarding orchestrator (AnimatePresence mode='wait' keyed
  // on step). Without this, Back-then-Forward wiped the local Set and an
  // already-RSVPed event showed "RSVP" again, whose tap then 409'd on the
  // UNIQUE(event_id,user_id) constraint and was silently swallowed (O1).
  const { data: existingRegistrations } = useQuery({
    queryKey: ['onboarding-registrations', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('event_registrations')
        .select('event_id')
        .eq('user_id', user!.id)
      return (data ?? []).map((r) => (r as { event_id: string }).event_id)
    },
  })

  // Union of server-known registrations and this-session RSVPs.
  const goingIds = new Set<string>([...(existingRegistrations ?? []), ...rsvpedEvents])

  const rsvpMutation = useMutation({
    mutationFn: async (eventId: string) => {
      if (!user) throw new Error('Not authenticated')
      setRsvpingEvent(eventId)
      // A ticketed event cannot be joined by a bare RSVP: the ticket is the
      // only way in, and the registration is derived from it. This raw insert
      // bypassed the guarded useRegisterForEvent hook entirely, so onboarding
      // was a second door into the "registered, never paid" state the leader
      // roster then counted as going. The database now refuses it
      // (trg_enforce_ticket_backed_registration); we surface it as a nudge to
      // open the event rather than a failed tap.
      const { data: evt } = await supabase
        .from('events')
        .select('is_ticketed')
        .eq('id', eventId)
        .maybeSingle()
      if (evt?.is_ticketed) {
        throw new Error('TICKETED')
      }
      const { error } = await supabase
        .from('event_registrations')
        .insert({ event_id: eventId, user_id: user.id, status: 'registered' })
      // A unique-violation (23505) means the user is ALREADY registered for this
      // event - a duplicate one-tap RSVP, not a failure. Treat it as idempotent
      // success so the button flips to "Going" instead of silently doing nothing.
      if (error && (error as { code?: string }).code !== '23505') throw error
      return eventId
    },
    onSuccess: (eventId) => {
      setRsvpedEvents((prev) => new Set(prev).add(eventId))
      setRsvpingEvent(null)
      queryClient.invalidateQueries({ queryKey: ['onboarding-events'] })
      queryClient.invalidateQueries({ queryKey: ['onboarding-registrations', user?.id] })
    },
    onError: (err) => {
      setRsvpingEvent(null)
      if ((err as Error)?.message === 'TICKETED') {
        toast.error('This one needs a ticket. Open it after onboarding to grab a spot.')
        return
      }
      toast.error("Couldn't RSVP right now. Please try again.")
    },
  })

  function formatDate(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  /** Overlaid content shared by the image and the gradient-fallback card. */
  function EventOverlayBody({ event }: { event: Event }) {
    const going = goingIds.has(event.id)
    const saving = rsvpingEvent === event.id
    return (
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/25 backdrop-blur-sm text-[10px] font-bold uppercase tracking-wider text-white">
            <Calendar size={10} aria-hidden="true" />
            {formatDate(event.date_start)}
          </span>
          <p className="mt-2 font-heading text-base font-semibold text-white leading-snug line-clamp-2">
            {event.title}
          </p>
          {event.address && (
            <p className="flex items-center gap-1 mt-1 text-xs text-white/75">
              <MapPin size={11} aria-hidden="true" />
              <span className="truncate">{event.address}</span>
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => rsvpMutation.mutate(event.id)}
          disabled={saving || going}
          aria-label={going ? 'Going' : `RSVP to ${event.title}`}
          className={cn(
            'shrink-0 inline-flex items-center gap-1.5 px-4 h-10 rounded-full text-sm font-semibold',
            'transition-colors duration-150 cursor-pointer select-none active:scale-[0.98] disabled:cursor-default',
            going
              ? 'bg-white/20 text-white border border-white/40 backdrop-blur-sm'
              : 'bg-white text-neutral-900 shadow-sm hover:bg-white/90',
          )}
        >
          {going ? (
            <><Check size={15} aria-hidden="true" /> Going</>
          ) : saving ? (
            <><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Saving</>
          ) : (
            'RSVP'
          )}
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col px-4 pt-8 min-h-0">
      <motion.div
        className="flex-1 overflow-y-auto"
        variants={shouldReduceMotion ? undefined : stagger}
        initial="hidden"
        animate="visible"
      >
        <motion.h2 variants={fadeUp} className="font-heading text-2xl font-bold text-neutral-900">
          Find your first event
        </motion.h2>
        <motion.p variants={fadeUp} className="mt-2 text-neutral-500 leading-relaxed">
          Jump in! One tap to RSVP.
        </motion.p>

        <div className="mt-6 space-y-4">
          {showLoading ? (
            <>
              <Card.Skeleton hasImage lines={2} />
              <Card.Skeleton hasImage lines={2} />
              <Card.Skeleton hasImage lines={2} />
            </>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-sm text-error-500">Couldn't load events right now.</p>
              <p className="text-xs text-neutral-500 mt-1">You can skip and browse events later.</p>
            </div>
          ) : events && events.length > 0 ? (
            events.map((event) => (
              <motion.div key={event.id} variants={fadeUp}>
                <Card variant="event" watermark={event.activity_type ?? undefined} className="shadow-sm">
                  {event.cover_image_url ? (
                    <Card.Overlay
                      src={event.cover_image_url}
                      alt=""
                      aspectRatio="16/9"
                      positionX={event.cover_image_position_x}
                      positionY={event.cover_image_position_y}
                    >
                      <EventOverlayBody event={event} />
                    </Card.Overlay>
                  ) : (
                    <div
                      className="relative w-full overflow-hidden bg-sprout-500"
                      style={{ aspectRatio: '16/9' }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" aria-hidden="true" />
                      <div className="absolute inset-0 flex flex-col justify-end p-4">
                        <EventOverlayBody event={event} />
                      </div>
                    </div>
                  )}
                </Card>
              </motion.div>
            ))
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-neutral-500">No upcoming events right now.</p>
              <p className="text-xs text-neutral-400 mt-1">Don't worry - we'll notify you when one pops up!</p>
            </div>
          )}
        </div>
      </motion.div>

      <div
        className="py-6 space-y-3"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <Button variant="primary" size="lg" fullWidth onClick={onNext}>
          Continue
        </Button>
        <Button variant="ghost" size="lg" fullWidth onClick={onSkip}>
          Skip for now
        </Button>
      </div>
    </div>
  )
}
