import { useQuery, useInfiniteQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { useOffline } from '@/hooks/use-offline'
import { useToast } from '@/components/toast'
import { queueOfflineAction } from '@/lib/offline-sync'
import { fetchEventIdsForCollective } from '@/lib/collective-event-ids'
import { formatEventLong, wallClockNow } from '@/lib/date-format'
import type {
  Database,
  Tables,
  TablesInsert,
} from '@/types/database.types'

type Event = Tables<'events'>
type EventRegistration = Tables<'event_registrations'>
type EventImpact = Tables<'event_impact'>
type Collective = Tables<'collectives'>
type Profile = Tables<'profiles'>
import type { MyUpcomingEvent } from '@/hooks/use-home-feed'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ActivityType = Database['public']['Enums']['activity_type']
type RegistrationStatus = Database['public']['Enums']['registration_status']

export interface EventWithCollective extends Event {
  collectives: Pick<Collective, 'id' | 'name' | 'cover_image_url' | 'timezone'> | null
}

export interface EventDetailData extends Event {
  collectives: Pick<Collective, 'id' | 'name' | 'cover_image_url' | 'slug' | 'region' | 'state' | 'timezone'> | null
  registration_count: number
  user_registration: EventRegistration | null
  attendees: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>[]
  impact: EventImpact | null
  collaborators: Pick<Collective, 'id' | 'name' | 'slug' | 'cover_image_url'>[]
  has_been_invited: boolean
}

export interface MyEventItem extends Event {
  collectives: Pick<Collective, 'id' | 'name'> | null
  registration_status: RegistrationStatus
}

export interface AttendeeWithStatus {
  user_id: string
  status: RegistrationStatus
  checked_in_at: string | null
  registered_at: string
  profiles: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'phone' | 'age' | 'gender' | 'accessibility_requirements' | 'emergency_contact_name' | 'emergency_contact_phone' | 'emergency_contact_relationship'> | null
}

export interface WaitlistEntry {
  id: string
  user_id: string
  registered_at: string
  profiles: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null
}

/* ------------------------------------------------------------------ */
/*  Activity type helpers                                              */
/* ------------------------------------------------------------------ */

export const ACTIVITY_TYPE_OPTIONS: { value: ActivityType; label: string }[] = [
  { value: 'clean_up', label: 'Clean Up' },
  { value: 'tree_planting', label: 'Tree Planting' },
  { value: 'ecosystem_restoration', label: 'Ecosystem Restoration' },
  { value: 'nature_hike', label: 'Nature Hike' },
  { value: 'camp_out', label: 'Camp Out' },
  { value: 'spotlighting', label: 'Spotlighting' },
  { value: 'other', label: 'Other' },
]

export const ACTIVITY_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ACTIVITY_TYPE_OPTIONS.map((o) => [o.value, o.label]),
)

/**
 * Re-export canonical metric definitions from the single source of truth.
 * All consumers should prefer importing from '@/lib/impact-metrics' directly.
 */
export {
  IMPACT_METRIC_DEFS as IMPACT_METRICS,
  VALID_IMPACT_METRICS,
  SURVEY_LINKABLE_METRICS,
} from '@/lib/impact-metrics'

/* ------------------------------------------------------------------ */
/*  Date helpers                                                       */
/* ------------------------------------------------------------------ */
//
// Floating local time (Tate 2026-05-25): the stored wall-clock IS the
// wall-clock for every viewer. The legacy `timeZone` parameter is kept
// for source-level back-compat with existing call sites but is ignored
// - every formatter pins `timeZone: 'UTC'` so the host's typed time
// reads back unchanged on every device.

const FLOATING_TZ = 'UTC'

export function formatEventDate(dateStr: string, _legacyTz?: string): string {
  const date = new Date(dateStr)
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: FLOATING_TZ,
  }).format(date)
}

export function formatEventDateShort(dateStr: string, _legacyTz?: string): string {
  const date = new Date(dateStr)
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: FLOATING_TZ,
  }).format(date)
}

export function formatEventTime(dateStr: string, _legacyTz?: string): string {
  const date = new Date(dateStr)
  return new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: FLOATING_TZ,
  }).format(date)
}

export function getCountdown(dateStr: string): string {
  const now = new Date()
  const target = new Date(dateStr)
  const diff = target.getTime() - now.getTime()

  if (diff <= 0) return 'Started'

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (days > 0) return `Starts in ${days} day${days === 1 ? '' : 's'}`
  if (hours > 0) return `Starts in ${hours} hour${hours === 1 ? '' : 's'}`
  return `Starts in ${minutes} min${minutes === 1 ? '' : 's'}`
}

export function getEventDuration(start: string, end: string | null): string {
  if (!end) return ''
  const diff = new Date(end).getTime() - new Date(start).getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h`
  return `${minutes}m`
}

/**
 * Default end-of-event grace when an event row has no explicit date_end.
 * Mirrors the client-side check-in active window default in
 * event-detail.tsx so a row with date_end IS NULL stays "active" through
 * a sensible runtime instead of flipping to "past" the second
 * date_start is reached. Per Tate 2026-05-23 Co-Exist incident: people
 * walking up after the event started lost the Register CTA on event
 * detail and the row dropped out of nearby/discover/collective queries.
 */
export const DEFAULT_EVENT_DURATION_MS = 3 * 60 * 60 * 1000

/**
 * Floating-local (Tate 2026-05-25 + 2026-05-26): event.date_start and
 * date_end encode the host's wall-clock as UTC. Compare against
 * wallClockNow() - a Date whose UTC equals the viewer's local clock -
 * so "is past" lines up with what the viewer's phone says, not with
 * absolute UTC. `now` is injectable so tests can pass a fixed Date
 * without faking system time or guessing the runner's host tz.
 */
export function isPastEvent(event: Event, now: Date = wallClockNow()): boolean {
  const start = new Date(event.date_start).getTime()
  const end = event.date_end
    ? new Date(event.date_end).getTime()
    : start + DEFAULT_EVENT_DURATION_MS
  return end < now.getTime()
}

/**
 * Cutoff timestamp for "event hasn't ended yet" filters on Supabase
 * queries (nearby / discover / collective events). Returns the ISO
 * timestamp DEFAULT_EVENT_DURATION_MS before wall-clock-now, so a row
 * with date_end IS NULL whose date_start is still inside that grace
 * window passes the filter. Pair with PostgREST: .or(
 *   `date_end.gte.${nowIso},and(date_end.is.null,date_start.gte.${cutoffIso})`
 * ).
 */
export function stillActiveStartCutoffIso(now: Date = wallClockNow()): string {
  return new Date(now.getTime() - DEFAULT_EVENT_DURATION_MS).toISOString()
}

/* ------------------------------------------------------------------ */
/*  Queries - My Events                                                */
/* ------------------------------------------------------------------ */

export function useMyEvents(tab: 'upcoming' | 'invited' | 'past') {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['my-events', tab, user?.id],
    queryFn: async () => {
      if (!user) return []

      // Floating-local: compare event.date_start/date_end (wall-clock-
      // as-UTC) against the viewer's wall-clock-now so today's morning
      // event doesn't linger in "upcoming" until UTC midnight.
      const now = wallClockNow().getTime()
      let query = supabase
        .from('event_registrations')
        .select('*, events(*, collectives(id, name, timezone))')
        .eq('user_id', user.id)

      if (tab === 'upcoming') {
        query = query.in('status', ['registered', 'waitlisted'])
      } else if (tab === 'invited') {
        query = query.eq('status', 'invited')
      } else {
        query = query.in('status', ['registered', 'attended'])
      }

      const { data, error } = await query.order('registered_at', { ascending: tab === 'upcoming' })
      if (error) throw error

      return (data ?? [])
        .filter((r) => {
          if (!r.events) return false
          const evt = r.events as EventWithCollective
          const startMs = new Date(evt.date_start).getTime()
          // Same grace as isPastEvent / stillActiveStartCutoffIso: events
          // without an explicit date_end stay "active" for the default
          // duration so day-of walk-ups aren't sent to a "past" tab while
          // the event is still running.
          const endMs = evt.date_end
            ? new Date(evt.date_end).getTime()
            : startMs + DEFAULT_EVENT_DURATION_MS
          if (tab === 'upcoming') {
            // Show if event hasn't started yet OR is still happening
            return startMs >= now || endMs >= now
          } else if (tab === 'past') {
            return endMs < now
          }
          return true // invited tab - show all
        })
        .map((r) => ({
          ...(r.events as EventWithCollective),
          registration_status: r.status,
        })) as MyEventItem[]
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Queries - Event Detail                                             */
/* ------------------------------------------------------------------ */

export function useEventDetail(eventId: string | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['event', eventId, user?.id],
    queryFn: async () => {
      if (!eventId) return null

      // Fetch event first (needed for collective_id in invite check).
      // No embedded profile join on events_created_by_fkey: it was unused by
      // any UI surface and pulled an RLS-gated row that's invisible to
      // members who don't share an active collective with the event creator
      // (e.g. a Sydney leader viewing an event Jess created as a global
      // manager - Jess isn't in Sydney's collective_members, so the embed
      // row was RLS-denied and could fail the whole `.single()` call,
      // blocking the entire event detail page). Managers can create events
      // for any collective without needing membership.
      const { data: event, error } = await supabase
        .from('events')
        .select('*, collectives(id, name, slug, cover_image_url, region, state, timezone)')
        .eq('id', eventId)
        .single()
      if (error) throw error

      // Parallelize all independent queries
      const [regCountRes, userRegRes, attendeeRes, impactRes, collabRes, inviteRes] = await Promise.all([
        // Registration count
        supabase
          .from('event_registrations')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', eventId)
          .in('status', ['registered', 'attended']),
        // User's registration
        user
          ? supabase
              .from('event_registrations')
              .select('id, event_id, user_id, status, checked_in_at, registered_at, invited_at')
              .eq('event_id', eventId)
              .eq('user_id', user.id)
              .neq('status', 'cancelled')
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        // Attendee avatars (first 8)
        supabase
          .from('event_registrations')
          .select('profiles!event_registrations_user_id_fkey(id, display_name, avatar_url)')
          .eq('event_id', eventId)
          .in('status', ['registered', 'attended'])
          .limit(8),
        // Impact data
        supabase.from('event_impact').select('*').eq('event_id', eventId).maybeSingle(),
        // Collaborating collectives
        supabase
          .from('collective_event_collaborators')
          .select('collective_id, collectives:collective_id(id, name, slug, cover_image_url)')
          .eq('event_id', eventId)
          .eq('status', 'accepted'),
        // Invite count
        supabase
          .from('event_invites')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', eventId)
          .eq('collective_id', event.collective_id),
      ])

      const attendees = (attendeeRes.data ?? [])
        .map((a) => a.profiles)
        .filter(Boolean) as Pick<Profile, 'id' | 'display_name' | 'avatar_url'>[]

      const collaborators = (collabRes.data ?? [])
        .map((c) => c.collectives)
        .filter(Boolean) as unknown as Pick<Collective, 'id' | 'name' | 'slug' | 'cover_image_url'>[]

      return {
        ...event,
        registration_count: regCountRes.count ?? 0,
        user_registration: userRegRes.data as EventRegistration | null,
        attendees,
        impact: impactRes.data,
        collaborators,
        has_been_invited: (inviteRes.count ?? 0) > 0,
      } as EventDetailData
    },
    enabled: !!eventId,
    staleTime: 2 * 60 * 1000,
  })
}

/**
 * Prefetch event detail data into the query cache so navigating to
 * /events/:id is instant. Safe to call multiple times - TanStack Query
 * deduplicates and respects staleTime.
 */
export function prefetchEventDetail(
  queryClient: QueryClient,
  eventId: string,
  userId: string,
) {
  return queryClient.prefetchQuery({
    queryKey: ['event', eventId, userId],
    queryFn: async () => {
      const { data: event, error } = await supabase
        .from('events')
        .select('*, collectives(id, name, slug, cover_image_url, region, state, timezone)')
        .eq('id', eventId)
        .single()
      if (error) throw error

      const { count: regCount } = await supabase
        .from('event_registrations')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .in('status', ['registered', 'attended'])

      const { data: userRegData } = await supabase
        .from('event_registrations')
        .select('id, event_id, user_id, status, checked_in_at, registered_at, invited_at')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .neq('status', 'cancelled')
        .maybeSingle()

      const { data: attendeeData } = await supabase
        .from('event_registrations')
        .select('profiles!event_registrations_user_id_fkey(id, display_name, avatar_url)')
        .eq('event_id', eventId)
        .in('status', ['registered', 'attended'])
        .limit(8)

      const attendees = (attendeeData ?? [])
        .map((a) => a.profiles)
        .filter(Boolean) as Pick<Profile, 'id' | 'display_name' | 'avatar_url'>[]

      const { data: impact } = await supabase
        .from('event_impact')
        .select('*')
        .eq('event_id', eventId)
        .maybeSingle()

      const { data: collabData } = await supabase
        .from('collective_event_collaborators')
        .select('collective_id, collectives:collective_id(id, name, slug, cover_image_url)')
        .eq('event_id', eventId)
        .eq('status', 'accepted')

      const collaborators = (collabData ?? [])
        .map((c) => c.collectives)
        .filter(Boolean) as unknown as Pick<Collective, 'id' | 'name' | 'slug' | 'cover_image_url'>[]

      const { count: inviteCount } = await supabase
        .from('event_invites')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('collective_id', event.collective_id)

      return {
        ...event,
        registration_count: regCount ?? 0,
        user_registration: userRegData,
        attendees,
        impact,
        collaborators,
        has_been_invited: (inviteCount ?? 0) > 0,
      } as EventDetailData
    },
    staleTime: 2 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Queries - Event Attendees (leader view)                            */
/* ------------------------------------------------------------------ */

export function useEventAttendees(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-attendees', eventId],
    queryFn: async () => {
      if (!eventId) return []

      const { data, error } = await supabase
        .from('event_registrations')
        .select('user_id, status, checked_in_at, registered_at, profiles!event_registrations_user_id_fkey(id, display_name, avatar_url, phone, age, gender, accessibility_requirements, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship)')
        .eq('event_id', eventId)
        .in('status', ['registered', 'attended', 'waitlisted'])
        .order('registered_at', { ascending: true })

      if (error) throw error
      return (data ?? []) as AttendeeWithStatus[]
    },
    enabled: !!eventId,
    staleTime: 30 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Queries - Event Waitlist                                           */
/* ------------------------------------------------------------------ */

export function useEventWaitlist(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-waitlist', eventId],
    queryFn: async () => {
      if (!eventId) return []

      const { data, error } = await supabase
        .from('event_registrations')
        .select('id, user_id, registered_at, profiles!event_registrations_user_id_fkey(id, display_name, avatar_url)')
        .eq('event_id', eventId)
        .eq('status', 'waitlisted')
        .order('registered_at', { ascending: true })

      if (error) throw error
      return (data ?? []) as WaitlistEntry[]
    },
    enabled: !!eventId,
    staleTime: 30 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Queries - Nearby & Collective Events                               */
/* ------------------------------------------------------------------ */

export function useNearbyEvents(limit = 20) {
  return useQuery({
    queryKey: ['nearby-events', limit],
    queryFn: async () => {
      // Floating-local: compare against wall-clock-now so a past-by-
      // viewer-clock event drops off immediately, not at UTC midnight.
      const wcNow = wallClockNow()
      const now = wcNow.toISOString()
      const cutoff = stillActiveStartCutoffIso(wcNow)
      // "Still active" = explicit date_end in the future OR (date_end NULL
      // AND date_start within the default grace window). Without the
      // grace branch, events without a date_end vanished the second
      // date_start passed, hiding them from walk-ups on event day.
      const { data, error } = await supabase
        .from('events')
        .select('*, collectives(id, name, timezone)')
        .eq('status', 'published')
        .or(`date_end.gte.${now},and(date_end.is.null,date_start.gte.${cutoff})`)
        .order('date_start', { ascending: true })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as EventWithCollective[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

const DISCOVER_PAGE_SIZE = 20

export function useDiscoverEvents(filters?: {
  activityType?: ActivityType | ''
  collectiveId?: string
}) {
  return useInfiniteQuery({
    queryKey: ['discover-events', filters?.activityType, filters?.collectiveId],
    queryFn: async ({ pageParam }: { pageParam: string | null }) => {
      const wcNow = wallClockNow()
      const now = wcNow.toISOString()
      const cutoff = stillActiveStartCutoffIso(wcNow)
      // See useNearbyEvents for the rationale on the date_end-null grace.
      let query = supabase
        .from('events')
        .select('*, collectives(id, name, timezone)')
        .eq('status', 'published')
        .or(`date_end.gte.${now},and(date_end.is.null,date_start.gte.${cutoff})`)
        .order('date_start', { ascending: true })
        .limit(DISCOVER_PAGE_SIZE)

      if (pageParam) {
        query = query.gt('date_start', pageParam)
      }

      if (filters?.activityType) {
        query = query.eq('activity_type', filters.activityType)
      }
      if (filters?.collectiveId) {
        // event_hosts so co-hosted events surface here too, not just events
        // where this collective is the primary host.
        const ids = await fetchEventIdsForCollective(filters.collectiveId)
        if (!ids || ids.length === 0) return [] as EventWithCollective[]
        query = query.in('id', ids)
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as EventWithCollective[]
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < DISCOVER_PAGE_SIZE) return undefined
      return lastPage[lastPage.length - 1]?.date_start ?? undefined
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCollectiveEvents(collectiveId: string | undefined) {
  return useQuery({
    queryKey: ['collective-events', collectiveId],
    queryFn: async () => {
      if (!collectiveId) return []
      // event_hosts so an event with this collective as accepted co-host
      // shows up alongside primary-host events. Origin: Jess 2026-05-25 P1.
      const ids = await fetchEventIdsForCollective(collectiveId)
      if (!ids || ids.length === 0) return [] as EventWithCollective[]
      const wcNow = wallClockNow()
      const now = wcNow.toISOString()
      const cutoff = stillActiveStartCutoffIso(wcNow)
      // See useNearbyEvents for the rationale on the date_end-null grace.
      const { data, error } = await supabase
        .from('events')
        .select('*, collectives(id, name, timezone)')
        .in('id', ids)
        .eq('status', 'published')
        .or(`date_end.gte.${now},and(date_end.is.null,date_start.gte.${cutoff})`)
        .order('date_start', { ascending: true })
        .limit(20)
      if (error) throw error
      return (data ?? []) as EventWithCollective[]
    },
    enabled: !!collectiveId,
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Queries - Event Impact                                             */
/* ------------------------------------------------------------------ */

export function useEventImpact(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-impact', eventId],
    queryFn: async () => {
      if (!eventId) return null
      const { data, error } = await supabase
        .from('event_impact')
        .select('*')
        .eq('event_id', eventId)
        .maybeSingle()
      if (error) throw error
      return data as EventImpact | null
    },
    enabled: !!eventId,
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Mutations - Registration                                          */
/* ------------------------------------------------------------------ */

export function useRegisterForEvent() {
  const { user, profile } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ eventId, asWaitlist = false }: { eventId: string; asWaitlist?: boolean }) => {
      if (!user) throw new Error('Must be signed in')

      // Check capacity before registering (prevents race condition when
      // multiple users register simultaneously for the last spot)
      if (!asWaitlist) {
        const [{ data: eventData }, { count: regCount }] = await Promise.all([
          supabase.from('events').select('capacity').eq('id', eventId).single(),
          supabase.from('event_registrations')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', eventId)
            .in('status', ['registered', 'attended']),
        ])
        if (eventData?.capacity && (regCount ?? 0) >= eventData.capacity) {
          // Capacity is full - auto-switch to waitlist
          asWaitlist = true
        }
      }

      // Use upsert to handle re-registration after cancellation
      // (the cancelled row still exists with the unique event_id+user_id constraint)
      const { error } = await supabase
        .from('event_registrations')
        .upsert(
          {
            event_id: eventId,
            user_id: user.id,
            status: asWaitlist ? 'waitlisted' : 'registered',
            registered_at: new Date().toISOString(),
          },
          { onConflict: 'event_id,user_id' },
        )
      if (error) throw error

      // Send confirmation email (only for registered, not waitlisted)
      if (!asWaitlist) {
        const { data: event } = await supabase
          .from('events')
          .select('title, date_start, address')
          .eq('id', eventId)
          .single()

        if (event) {
          supabase.functions.invoke('send-email', {
            body: {
              type: 'event_confirmation',
              userId: user.id,
              data: {
                name: profile?.display_name ?? 'there',
                event_title: event.title,
                // Floating local time: the stored wall-clock IS the time,
                // no tz conversion. Tate 2026-05-25.
                event_date: formatEventLong(event.date_start),
                event_location: event.address ?? '',
                event_url: `https://app.coexistaus.org/events/${eventId}`,
              },
            },
          }).catch(console.error)
        }
      }
    },
    onMutate: async ({ eventId, asWaitlist }) => {
      await queryClient.cancelQueries({ queryKey: ['event', eventId] })
      await queryClient.cancelQueries({ queryKey: ['home', 'my-upcoming-events'] })

      const previousEvent = queryClient.getQueryData(['event', eventId, user?.id])
      const previousUpcoming = queryClient.getQueryData<MyUpcomingEvent[]>(['home', 'my-upcoming-events', user?.id])

      queryClient.setQueryData(['event', eventId, user?.id], (old: EventDetailData | undefined) => {
        if (!old) return old
        return {
          ...old,
          registration_count: old.registration_count + (asWaitlist ? 0 : 1),
          user_registration: { event_id: eventId, user_id: user!.id, status: asWaitlist ? 'waitlisted' : 'registered', checked_in_at: null, registered_at: new Date().toISOString() } as EventRegistration,
        }
      })

      // Optimistically add event to upcoming events on homepage
      const eventDetail = queryClient.getQueryData<EventDetailData>(['event', eventId, user?.id])
      if (eventDetail) {
        const newEntry: MyUpcomingEvent = {
          ...eventDetail,
          collectives: eventDetail.collectives ? { id: eventDetail.collectives.id, name: eventDetail.collectives.name } : null,
          registration_status: asWaitlist ? 'waitlisted' : 'registered',
        }
        queryClient.setQueryData<MyUpcomingEvent[]>(['home', 'my-upcoming-events', user?.id], (old) => {
          const list = old ?? []
          if (list.some((e) => e.id === eventId)) return list
          return [...list, newEntry].sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime())
        })
      }

      return { previousEvent, previousUpcoming }
    },
    onError: (_err, { eventId }, context) => {
      if (context?.previousEvent) queryClient.setQueryData(['event', eventId, user?.id], context.previousEvent)
      if (context?.previousUpcoming !== undefined) queryClient.setQueryData(['home', 'my-upcoming-events', user?.id], context.previousUpcoming)
    },
    onSettled: (_, __, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['event', eventId] })
      queryClient.invalidateQueries({ queryKey: ['my-events'] })
      queryClient.invalidateQueries({ queryKey: ['event-attendees', eventId] })
      queryClient.invalidateQueries({ queryKey: ['event-waitlist', eventId] })
      queryClient.invalidateQueries({ queryKey: ['home', 'my-upcoming-events'] })
      queryClient.invalidateQueries({ queryKey: ['discover-events'] })
      queryClient.invalidateQueries({ queryKey: ['nearby-events'] })
    },
  })
}

export function useCancelRegistration() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (eventId: string) => {
      if (!user) throw new Error('Must be signed in')

      const { error } = await supabase
        .from('event_registrations')
        .update({ status: 'cancelled' })
        .eq('event_id', eventId)
        .eq('user_id', user.id)
      if (error) throw error
    },
    onMutate: async (eventId: string) => {
      // Cancel outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['my-events'] })
      await queryClient.cancelQueries({ queryKey: ['home', 'my-upcoming-events'] })
      await queryClient.cancelQueries({ queryKey: ['event', eventId] })

      // Snapshot previous values for rollback
      const previousUpcoming = queryClient.getQueryData<MyEventItem[]>(['my-events', 'upcoming', user?.id])
      const previousHomeUpcoming = queryClient.getQueryData<MyUpcomingEvent[]>(['home', 'my-upcoming-events', user?.id])
      const previousEvent = queryClient.getQueryData<EventDetailData>(['event', eventId, user?.id])

      // Optimistically remove the event from the upcoming list
      if (previousUpcoming) {
        queryClient.setQueryData<MyEventItem[]>(
          ['my-events', 'upcoming', user?.id],
          previousUpcoming.filter((e) => e.id !== eventId),
        )
      }

      // Optimistically remove from homepage upcoming events
      if (previousHomeUpcoming) {
        queryClient.setQueryData<MyUpcomingEvent[]>(
          ['home', 'my-upcoming-events', user?.id],
          previousHomeUpcoming.filter((e) => e.id !== eventId),
        )
      }

      // Optimistically update event detail: decrement count, clear user registration
      if (previousEvent) {
        const wasRegistered = previousEvent.user_registration?.status === 'registered' || previousEvent.user_registration?.status === 'attended'
        queryClient.setQueryData<EventDetailData>(['event', eventId, user?.id], {
          ...previousEvent,
          registration_count: wasRegistered
            ? Math.max(0, previousEvent.registration_count - 1)
            : previousEvent.registration_count,
          user_registration: null,
        })
      }

      return { previousUpcoming, previousHomeUpcoming, previousEvent }
    },
    onError: (_err, eventId, context) => {
      // Rollback on failure
      if (context?.previousUpcoming) {
        queryClient.setQueryData(['my-events', 'upcoming', user?.id], context.previousUpcoming)
      }
      if (context?.previousHomeUpcoming) {
        queryClient.setQueryData(['home', 'my-upcoming-events', user?.id], context.previousHomeUpcoming)
      }
      if (context?.previousEvent) {
        queryClient.setQueryData(['event', eventId, user?.id], context.previousEvent)
      }
    },
    onSettled: (_, __, eventId) => {
      // Always refetch after error or success to ensure server state
      queryClient.invalidateQueries({ queryKey: ['event', eventId] })
      queryClient.invalidateQueries({ queryKey: ['my-events'] })
      queryClient.invalidateQueries({ queryKey: ['event-attendees', eventId] })
      queryClient.invalidateQueries({ queryKey: ['event-waitlist', eventId] })
      queryClient.invalidateQueries({ queryKey: ['home', 'my-upcoming-events'] })
      queryClient.invalidateQueries({ queryKey: ['discover-events'] })
      queryClient.invalidateQueries({ queryKey: ['nearby-events'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Mutations - Check-in                                               */
/* ------------------------------------------------------------------ */

export function useCheckIn() {
  const queryClient = useQueryClient()
  const { isOffline } = useOffline()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ eventId, userId }: { eventId: string; userId: string }) => {
      // Offline path: queue the check-in and return optimistically. The
      // optimistic onMutate below already flips the row to 'attended' in the
      // local query cache, so the leader sees the green tick immediately. The
      // queued action drains via the offline-sync periodic / online listener.
      // Origin: Tate verbatim 17:11 AEST 9 May 2026 - mid-event Sunshine Coast
      // patchy-network resilience for 1.8.5.
      if (isOffline) {
        queueOfflineAction('check-in', {
          eventId,
          userId,
          // Stamps the self/leader path so the replay handler
          // (processCheckIn) knows whether it can upsert (self) or must
          // strictly UPDATE an existing row (leader). Mirrors the online
          // branching below.
          isSelf: user?.id === userId,
          timestamp: new Date().toISOString(),
        })
        return
      }

      // SELF check-in path: upsert so a walk-up who never tapped Register
      // before the event still ends up as 'attended' on the day. INSERTs
      // bypass the enforce_event_day_check_in_window trigger (it's BEFORE
      // UPDATE only), so the BE day-of guard still applies whenever an
      // existing row is being flipped. UPSERT also recovers cancelled /
      // waitlisted self check-ins on the day. Per Tate 2026-05-23
      // Co-Exist incident: "should be able to register and signin on
      // the day".
      if (user?.id === userId) {
        const nowIso = new Date().toISOString()
        const { error } = await supabase
          .from('event_registrations')
          .upsert(
            {
              event_id: eventId,
              user_id: userId,
              status: 'attended',
              checked_in_at: nowIso,
              registered_at: nowIso,
            },
            { onConflict: 'event_id,user_id' },
          )
        if (error) throw error
        return
      }

      // LEADER check-in path (userId != auth.uid()): keep the existing
      // "must already be registered or invited" gate. Unregistered walk-ups
      // are added by leaders via the WalkInSheet, not via this mutation.
      // Must chain .select() to get the updated rows back - otherwise
      // supabase-js returns count=null and the "not checkable" guard below
      // never fires, silently succeeding even when the user is already
      // cancelled/attended.
      const { data, error } = await supabase
        .from('event_registrations')
        .update({
          status: 'attended',
          checked_in_at: new Date().toISOString(),
        })
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .in('status', ['registered', 'invited'])
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('User is not in a checkable status (registered or invited)')
    },
    onMutate: async ({ eventId, userId }) => {
      await queryClient.cancelQueries({ queryKey: ['event-attendees', eventId] })
      const previous = queryClient.getQueryData<AttendeeWithStatus[]>(['event-attendees', eventId])
      queryClient.setQueryData<AttendeeWithStatus[]>(['event-attendees', eventId], (old) => {
        if (!old) return old
        return old.map(a => a.user_id === userId ? { ...a, status: 'attended' as const, checked_in_at: new Date().toISOString() } : a)
      })
      return { previous }
    },
    onError: (_err, { eventId }, context) => {
      if (context?.previous) queryClient.setQueryData(['event-attendees', eventId], context.previous)
    },
    onSettled: (_, __, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['event-attendees', eventId] })
      queryClient.invalidateQueries({ queryKey: ['event', eventId] })
      queryClient.invalidateQueries({ queryKey: ['my-events'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'my-upcoming-events'] })
      queryClient.invalidateQueries({ queryKey: ['impact-stats'] })
      queryClient.invalidateQueries({ queryKey: ['profile-stats'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'impact-stats'] })
      queryClient.invalidateQueries({ queryKey: ['pending-surveys'] })
    },
  })
}

/**
 * Reverse of useCheckIn: leader corrects a mistaken check-in by
 * transitioning event_registrations.status from 'attended' back to
 * 'registered'. Same BE day-of guard applies (trigger
 * `enforce_event_day_check_in_window` rejects out-of-window
 * un-check-ins on auth.role()='authenticated').
 *
 * Origin: BNE wrong-day check-in incident, 2026-05-09. See
 * supabase/migrations/20260509000000_event_day_check_in_window.sql.
 */
export function useUncheckIn() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ eventId, userId }: { eventId: string; userId: string }) => {
      const { data, error } = await supabase
        .from('event_registrations')
        .update({
          status: 'registered',
          checked_in_at: null,
        })
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .eq('status', 'attended')
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('Attendee was not checked in.')
    },
    onMutate: async ({ eventId, userId }) => {
      await queryClient.cancelQueries({ queryKey: ['event-attendees', eventId] })
      const previous = queryClient.getQueryData<AttendeeWithStatus[]>(['event-attendees', eventId])
      queryClient.setQueryData<AttendeeWithStatus[]>(['event-attendees', eventId], (old) => {
        if (!old) return old
        return old.map(a => a.user_id === userId ? { ...a, status: 'registered' as const, checked_in_at: null } : a)
      })
      return { previous }
    },
    onError: (_err, { eventId }, context) => {
      if (context?.previous) queryClient.setQueryData(['event-attendees', eventId], context.previous)
    },
    onSettled: (_, __, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['event-attendees', eventId] })
      queryClient.invalidateQueries({ queryKey: ['event', eventId] })
      queryClient.invalidateQueries({ queryKey: ['my-events'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'my-upcoming-events'] })
      queryClient.invalidateQueries({ queryKey: ['impact-stats'] })
      queryClient.invalidateQueries({ queryKey: ['profile-stats'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'impact-stats'] })
      queryClient.invalidateQueries({ queryKey: ['pending-surveys'] })
    },
  })
}

export function useBulkCheckIn() {
  const queryClient = useQueryClient()
  const { isOffline } = useOffline()

  return useMutation({
    mutationFn: async (eventId: string) => {
      // Offline path: queue the bulk-check-in. Optimistic UI in onMutate flips
      // every 'registered' row to 'attended' locally, mirroring server replay.
      if (isOffline) {
        queueOfflineAction('bulk-check-in', {
          eventId,
          timestamp: new Date().toISOString(),
        })
        return
      }
      const { error } = await supabase
        .from('event_registrations')
        .update({
          status: 'attended',
          checked_in_at: new Date().toISOString(),
        })
        .eq('event_id', eventId)
        .eq('status', 'registered')
      if (error) throw error
    },
    onMutate: async (eventId) => {
      await queryClient.cancelQueries({ queryKey: ['event-attendees', eventId] })
      const previous = queryClient.getQueryData<AttendeeWithStatus[]>(['event-attendees', eventId])
      queryClient.setQueryData<AttendeeWithStatus[]>(['event-attendees', eventId], (old) => {
        if (!old) return old
        return old.map(a => a.status === 'registered' ? { ...a, status: 'attended' as const, checked_in_at: new Date().toISOString() } : a)
      })
      return { previous }
    },
    onError: (_err, eventId, context) => {
      if (context?.previous) queryClient.setQueryData(['event-attendees', eventId], context.previous)
    },
    onSettled: (_, __, eventId) => {
      queryClient.invalidateQueries({ queryKey: ['event-attendees', eventId] })
      queryClient.invalidateQueries({ queryKey: ['event', eventId] })
      queryClient.invalidateQueries({ queryKey: ['my-events'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'my-upcoming-events'] })
      queryClient.invalidateQueries({ queryKey: ['impact-stats'] })
      queryClient.invalidateQueries({ queryKey: ['profile-stats'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'impact-stats'] })
      queryClient.invalidateQueries({ queryKey: ['pending-surveys'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Mutations - Event CRUD                                             */
/* ------------------------------------------------------------------ */

export function useCreateEvent() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (eventData: Omit<TablesInsert<'events'>, 'created_by'>) => {
      if (!user) throw new Error('Must be signed in')

      // Same PostgREST + geography(Point,4326) limitation as updates: a WKT
      // string sent inline can't be cast on insert, so the column comes back
      // NULL. Strip it from the insert payload and write it via RPC after the
      // row exists.
      const rawPoint = (eventData as { location_point?: unknown }).location_point
      const insertData = { ...eventData, created_by: user.id }
      delete (insertData as { location_point?: unknown }).location_point

      const { data, error } = await supabase
        .from('events')
        .insert(insertData)
        .select()
        .single()
      if (error) throw error

      let lat: number | null = null
      let lng: number | null = null
      if (typeof rawPoint === 'string') {
        const m = rawPoint.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/)
        if (m) {
          lng = parseFloat(m[1])
          lat = parseFloat(m[2])
        }
      }

      if (lat !== null && lng !== null) {
        const { error: locErr } = await supabase.rpc('update_event_location', {
          p_event_id: data.id,
          p_lat: lat,
          p_lng: lng,
        })
        if (locErr) throw locErr
      }

      return data as Event
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['collective-events'] })
      await queryClient.cancelQueries({ queryKey: ['nearby-events'] })
    },
    onSettled: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: ['collective-events', data.collective_id] })
      }
      queryClient.invalidateQueries({ queryKey: ['nearby-events'] })
      queryClient.invalidateQueries({ queryKey: ['my-events'] })
      queryClient.invalidateQueries({ queryKey: ['discover-events'] })
      queryClient.invalidateQueries({ queryKey: ['leader-events'] })
      queryClient.invalidateQueries({ queryKey: ['leader-event-stats'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'featured-events'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'upcoming-nearby'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'collective-upcoming-events'] })
      // Refresh the Leaflet collective map: nextEvent projection may have changed
      queryClient.invalidateQueries({ queryKey: ['collective-map-data'] })
    },
  })
}

export function useUpdateEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ eventId, ...updates }: { eventId: string } & Partial<Event>) => {
      // PostgREST cannot cast text → geography(Point,4326) on UPDATE, so the
      // location_point column silently stays unchanged when sent inline.
      // Pull lat/lng out of the location_point WKT/EWKT (or pass null to
      // clear), call the update_event_location RPC for that field, and let
      // the rest of the update go through normally.
      const rawPoint = (updates as { location_point?: unknown }).location_point
      const pointSent = 'location_point' in updates
      delete (updates as { location_point?: unknown }).location_point

      let lat: number | null = null
      let lng: number | null = null
      if (typeof rawPoint === 'string') {
        const m = rawPoint.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/)
        if (m) {
          lng = parseFloat(m[1])
          lat = parseFloat(m[2])
        }
      }

      if (pointSent) {
        const { error: locErr } = await supabase.rpc('update_event_location', {
          p_event_id: eventId,
          p_lat: lat as number,
          p_lng: lng as number,
        })
        if (locErr) throw locErr
      }

      // If location_point was the only field, just fetch and return the row.
      if (Object.keys(updates).length === 0) {
        const { data, error } = await supabase
          .from('events')
          .select()
          .eq('id', eventId)
          .single()
        if (error) throw error
        return data as Event
      }

      const { data, error } = await supabase
        .from('events')
        .update(updates)
        .eq('id', eventId)
        .select()
        .single()
      if (error) throw error
      return data as Event
    },
    onMutate: async ({ eventId, ...updates }) => {
      await queryClient.cancelQueries({ queryKey: ['event', eventId] })
      await queryClient.cancelQueries({ queryKey: ['collective-events'] })
      await queryClient.cancelQueries({ queryKey: ['nearby-events'] })
      await queryClient.cancelQueries({ queryKey: ['leader-events'] })

      // Snapshot for rollback
      const previousLeaderEvents = queryClient.getQueriesData<Record<string, unknown>[]>({ queryKey: ['leader-events'] })

      // Optimistically update all leader-events cache entries
      queryClient.setQueriesData<Record<string, unknown>[]>(
        { queryKey: ['leader-events'] },
        (old) => old?.map((ev) =>
          (ev as { id?: string }).id === eventId ? { ...ev, ...updates } : ev,
        ),
      )

      // Optimistically update event detail cache
      queryClient.setQueriesData<Record<string, unknown>>(
        { queryKey: ['event', eventId] },
        (old) => old ? { ...old, ...updates } : old,
      )

      return { previousLeaderEvents }
    },
    onError: (_err, _vars, context) => {
      // Rollback leader-events on failure
      if (context?.previousLeaderEvents) {
        for (const [key, data] of context.previousLeaderEvents) {
          queryClient.setQueryData(key, data)
        }
      }
    },
    onSettled: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: ['event', data.id] })
        queryClient.invalidateQueries({ queryKey: ['collective-events', data.collective_id] })
        queryClient.invalidateQueries({ queryKey: ['leader-events'] })
        queryClient.invalidateQueries({ queryKey: ['leader-event-stats'] })
      }
      queryClient.invalidateQueries({ queryKey: ['nearby-events'] })
      queryClient.invalidateQueries({ queryKey: ['discover-events'] })
      queryClient.invalidateQueries({ queryKey: ['my-events'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'my-upcoming-events'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'featured-events'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'upcoming-nearby'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'collective-upcoming-events'] })
      // Refresh the Leaflet collective map: title/date/collective_id changes
      // can move the nextEvent projection for the collective the event belongs to.
      queryClient.invalidateQueries({ queryKey: ['collective-map-data'] })
    },
  })
}

export function useCancelEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ eventId, reason }: { eventId: string; reason?: string }) => {
      // Fetch event details and registered attendees before cancelling
      const [{ data: event }, { data: registrations }] = await Promise.all([
        supabase.from('events').select('title, date_start').eq('id', eventId).single(),
        supabase.from('event_registrations')
          .select('user_id, profiles!inner(display_name)')
          .eq('event_id', eventId)
          .in('status', ['registered', 'waitlisted', 'invited']),
      ])

      const { error } = await supabase
        .from('events')
        .update({ status: 'cancelled' })
        .eq('id', eventId)
      if (error) throw error

      // Notify all registered/waitlisted/invited attendees
      if (event && registrations?.length) {
        // Floating local time: stored wall-clock is the wall-clock.
        const eventDate = formatEventLong(event.date_start)

        for (const reg of registrations) {
          const displayName = (reg as unknown as { profiles?: { display_name: string | null } }).profiles?.display_name ?? 'there'
          supabase.functions.invoke('send-email', {
            body: {
              type: 'event_cancelled',
              userId: reg.user_id,
              data: {
                name: displayName,
                event_title: event.title,
                event_date: eventDate,
                reason: reason ?? '',
              },
            },
          }).catch(console.error)
        }
      }
    },
    onMutate: async ({ eventId }) => {
      await queryClient.cancelQueries({ queryKey: ['event', eventId] })
      await queryClient.cancelQueries({ queryKey: ['leader-events'] })
      // Optimistically set status to cancelled
      const previous = queryClient.getQueryData(['event', eventId])
      const previousLeaderEvents = queryClient.getQueriesData<Record<string, unknown>[]>({ queryKey: ['leader-events'] })
      queryClient.setQueriesData<EventDetailData>(
        { queryKey: ['event', eventId] },
        (old) => old ? { ...old, status: 'cancelled' } : old,
      )
      queryClient.setQueriesData<Record<string, unknown>[]>(
        { queryKey: ['leader-events'] },
        (old) => old?.map((ev) =>
          (ev as { id?: string }).id === eventId ? { ...ev, status: 'cancelled' } : ev,
        ),
      )
      return { previous, previousLeaderEvents, eventId }
    },
    onError: (_err, { eventId }, context) => {
      if (context?.previous) {
        queryClient.setQueriesData({ queryKey: ['event', eventId] }, () => context.previous)
      }
      if (context?.previousLeaderEvents) {
        for (const [key, data] of context.previousLeaderEvents) {
          queryClient.setQueryData(key, data)
        }
      }
    },
    onSettled: (_, __, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['event', eventId] })
      queryClient.invalidateQueries({ queryKey: ['my-events'] })
      queryClient.invalidateQueries({ queryKey: ['nearby-events'] })
      queryClient.invalidateQueries({ queryKey: ['discover-events'] })
      queryClient.invalidateQueries({ queryKey: ['collective-events'] })
      queryClient.invalidateQueries({ queryKey: ['leader-events'] })
      queryClient.invalidateQueries({ queryKey: ['leader-event-stats'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'my-upcoming-events'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'featured-events'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'upcoming-nearby'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'collective-upcoming-events'] })
      // Cancelling an event can demote it out of the nextEvent projection
      // shown on the Leaflet collective map.
      queryClient.invalidateQueries({ queryKey: ['collective-map-data'] })
    },
  })
}

export function useDuplicateEvent() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (sourceEventId: string) => {
      if (!user) throw new Error('Must be signed in')

      const { data: source, error: fetchErr } = await supabase
        .from('events')
        .select('*')
        .eq('id', sourceEventId)
        .single()
      if (fetchErr) throw fetchErr

       
      const { id: _id, created_at: _ca, updated_at: _ua, status: _s, ...rest } = source
      const { data, error } = await supabase
        .from('events')
        .insert({
          ...rest,
          title: `${rest.title} (Copy)`,
          status: 'draft',
          created_by: user.id,
        })
        .select()
        .single()
      if (error) throw error
      return data as Event
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['collective-events'] })
    },
    onSettled: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: ['collective-events', data.collective_id] })
      }
      queryClient.invalidateQueries({ queryKey: ['leader-events'] })
      queryClient.invalidateQueries({ queryKey: ['leader-event-stats'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Auto-survey trigger (best-effort, fire-and-forget)                 */
/* ------------------------------------------------------------------ */

async function triggerSurveyNotifications(eventId: string, eventTitle: string) {
  // Check if auto-surveys are enabled
  const { data: config } = await supabase.from('app_settings')
    .select('value')
    .eq('key', 'auto_survey_config')
    .maybeSingle()

  const autoConfig = (config as { value?: { enabled?: boolean } } | null)?.value
  if (autoConfig && autoConfig.enabled === false) return

  // Get all checked-in attendees
  const { data: attendees } = await supabase
    .from('event_registrations')
    .select('user_id')
    .eq('event_id', eventId)
    .not('checked_in_at', 'is', null)

  if (!attendees?.length) return

  // Check who already has a survey response or existing survey notification
  const userIds = attendees.map((a) => a.user_id)
  const [{ data: existingResponses }, { data: existingNotifications }] = await Promise.all([
    supabase
      .from('survey_responses')
      .select('user_id')
      .eq('event_id', eventId)
      .in('user_id', userIds),
    supabase.from('notifications')
      .select('user_id')
      .eq('type', 'survey_request')
      .filter('data->>event_id', 'eq', eventId)
      .in('user_id', userIds),
  ])

  const excludedIds = new Set([
    ...(existingResponses ?? []).map((r) => r.user_id),
    ...(existingNotifications ?? []).map((n) => n.user_id),
  ])
  const pendingUsers = userIds.filter((id) => !excludedIds.has(id))
  if (!pendingUsers.length) return

  const title = 'How was your event?'
  const body = `Tell us about "${eventTitle}" - your feedback helps improve future events.`

  // Insert notifications for each attendee
  await supabase.from('notifications').insert(
    pendingUsers.map((userId) => ({
      user_id: userId,
      type: 'survey_request',
      title,
      body,
      data: { event_id: eventId },
    })),
  )

  // Send push notifications
  supabase.functions.invoke('send-push', {
    body: {
      userIds: pendingUsers,
      title,
      body,
      data: { type: 'survey_request', event_id: eventId },
    },
  }).catch(console.error)
}

/* ------------------------------------------------------------------ */
/*  Mutations - Impact Logging                                         */
/* ------------------------------------------------------------------ */

export function useLogImpact() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { isOffline } = useOffline()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (impactData: Omit<TablesInsert<'event_impact'>, 'logged_by'>) => {
      if (!user) throw new Error('Must be signed in')

      if (isOffline) {
        queueOfflineAction('log-impact', {
          impactData: { ...impactData },
          userId: user.id,
        })
        // Return optimistic data
        return {
          ...impactData,
          id: `offline-${Date.now()}`,
          logged_by: user.id,
          logged_at: new Date().toISOString(),
        } as EventImpact
      }

      const { data, error } = await supabase
        .from('event_impact')
        .upsert(
          { ...impactData, logged_by: user.id },
          { onConflict: 'event_id' },
        )
        .select()
        .single()
      if (error) throw error

      // Mark event as completed once impact is logged
      const { error: statusError } = await supabase
        .from('events')
        .update({ status: 'completed' })
        .eq('id', impactData.event_id)
        .in('status', ['published']) // Only transition from published, not draft/cancelled
      if (statusError) throw statusError

      return data as EventImpact
    },
    onMutate: async (impactData) => {
      const eventId = impactData.event_id
      await queryClient.cancelQueries({ queryKey: ['event-impact', eventId] })
      const previous = queryClient.getQueryData<EventImpact | null>(['event-impact', eventId])
      // Optimistically set the impact data
      queryClient.setQueryData<EventImpact | null>(['event-impact', eventId], (old) => ({
        ...(old ?? { id: 'optimistic', logged_by: user?.id ?? '', logged_at: new Date().toISOString() }),
        ...impactData,
      } as EventImpact))
      return { previous, eventId }
    },
    onError: (_err, _vars, context) => {
      if (!isOffline && context) {
        queryClient.setQueryData(['event-impact', context.eventId], context.previous)
      }
    },
    onSuccess: async (data) => {
      if (isOffline) {
        toast.info('Impact data saved offline - will sync when back online')
        return
      }
      // Trigger auto-survey notifications for attendees
      try {
        const eventId = data.event_id
        const { data: eventData } = await supabase
          .from('events')
          .select('title')
          .eq('id', eventId)
          .single()
        if (eventData) {
          triggerSurveyNotifications(eventId, eventData.title)
        }
      } catch {
        // Survey notification is best-effort, don't block impact logging
      }
    },
    onSettled: (data, _err, vars) => {
      if (isOffline) return
      const eventId = data?.event_id ?? vars.event_id
      queryClient.invalidateQueries({ queryKey: ['event-impact', eventId] })
      queryClient.invalidateQueries({ queryKey: ['event', eventId] })
      queryClient.invalidateQueries({ queryKey: ['impact-stats'] })
      queryClient.invalidateQueries({ queryKey: ['profile-stats'] })
      queryClient.invalidateQueries({ queryKey: ['collective-impact'] })
      queryClient.invalidateQueries({ queryKey: ['national-impact'] })
      queryClient.invalidateQueries({ queryKey: ['my-events'] })
      queryClient.invalidateQueries({ queryKey: ['leader-events'] })
      queryClient.invalidateQueries({ queryKey: ['leader-event-stats'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'impact-stats'] })
      queryClient.invalidateQueries({ queryKey: ['pending-surveys'] })
      queryClient.invalidateQueries({ queryKey: ['collective-stats'] })
      queryClient.invalidateQueries({ queryKey: ['leader-impact-full'] })
      queryClient.invalidateQueries({ queryKey: ['leader-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['collective-custom-metrics'] })
      queryClient.invalidateQueries({ queryKey: ['national-custom-metrics'] })
      // Invalidate impact form tasks so the leader task list reflects completion
      queryClient.invalidateQueries({ queryKey: ['pending-impact-form-tasks'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Mutations - Invite Collective                                      */
/* ------------------------------------------------------------------ */

export function useInviteCollective() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ eventId, collectiveId, customMessage }: { eventId: string; collectiveId: string; customMessage?: string }) => {
      if (!user) throw new Error('Must be signed in')

      // Check if this collective has already been invited to this event
      const { count: existingCount } = await supabase
        .from('event_invites')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('collective_id', collectiveId)

      const isReminder = (existingCount ?? 0) > 0

      // Fetch event details
      const { data: event } = await supabase
        .from('events')
        .select('title, date_start, date_end, address, cover_image_url, activity_type')
        .eq('id', eventId)
        .single()
      if (!event) throw new Error('Event not found')

      const { data: inviterProfile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single()

      const inviterName = inviterProfile?.display_name ?? 'A leader'
      // Floating local time: stored wall-clock is the wall-clock.
      const eventDate = formatEventLong(event.date_start)

      if (isReminder) {
        // ── Remind flow: 24h cooldown, post rich announcement to chat ──

        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const { data: recentReminders } = await supabase
          .from('chat_messages')
          .select('created_at')
          .eq('collective_id', collectiveId)
          .eq('message_type', 'announcement')
          .gte('created_at', twentyFourHoursAgo)
          .limit(5)
        if (recentReminders && recentReminders.length >= 3) {
          throw new Error('Too many announcements in the last 24h - try again later')
        }

        // Create a rich announcement in the chat
        const { data: announcement, error: annErr } = await supabase
          .from('chat_announcements')
          .insert({
            collective_id: collectiveId,
            created_by: user.id,
            type: 'event_invite',
            title: `Reminder: ${event.title}`,
            body: customMessage || `Don't miss out! Register now for ${event.title}.`,
            metadata: { event_id: eventId },
          })
          .select()
          .single()
        if (annErr) throw annErr

        // Post announcement message to chat
        await supabase.from('chat_messages').insert({
          collective_id: collectiveId,
          user_id: user.id,
          content: announcement.title,
          message_type: 'announcement',
          announcement_id: announcement.id,
        })

        return { reminded: true }
      }

      // ── First invite flow: create registrations + rich announcement ──

      // Create invite record
      const { error: inviteErr } = await supabase
        .from('event_invites')
        .insert({
          event_id: eventId,
          collective_id: collectiveId,
          invited_by: user.id,
        })
      if (inviteErr) throw inviteErr

      // Create a rich announcement in the chat
      const { data: announcement, error: annErr } = await supabase
        .from('chat_announcements')
        .insert({
          collective_id: collectiveId,
          created_by: user.id,
          type: 'event_invite',
          title: event.title,
          body: customMessage || `You're all invited! Tap to view and register.`,
          metadata: { event_id: eventId },
        })
        .select()
        .single()
      if (annErr) console.error('[invite-all] announcement insert error:', annErr)

      if (announcement) {
        await supabase.from('chat_messages').insert({
          collective_id: collectiveId,
          user_id: user.id,
          content: announcement.title,
          message_type: 'announcement',
          announcement_id: announcement.id,
        }).then(undefined, console.error)
      }

      // Get all collective members
      const { data: members } = await supabase
        .from('collective_members')
        .select('user_id')
        .eq('collective_id', collectiveId)
        .eq('status', 'active')

      if (!members?.length) return { reminded: false }

      // Create registration entries for each member (status: invited)
      const registrations = members
        .filter((m) => m.user_id !== user.id)
        .map((m) => ({
          event_id: eventId,
          user_id: m.user_id,
          status: 'invited' as const,
          invited_at: new Date().toISOString(),
        }))

      if (registrations.length > 0) {
        const { error } = await supabase
          .from('event_registrations')
          .upsert(registrations, { onConflict: 'event_id,user_id', ignoreDuplicates: true })
        if (error) console.error('[invite-all] registration upsert error:', error)

        // Batch-fetch display names for invite emails
        const invitedUserIds = registrations.map((r) => r.user_id)
        const { data: invitedProfiles } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', invitedUserIds)
        const nameMap = new Map((invitedProfiles ?? []).map((p) => [p.id, p.display_name]))

        // Send invite emails
        for (const reg of registrations) {
          supabase.functions.invoke('send-email', {
            body: {
              type: 'event_invite',
              userId: reg.user_id,
              data: {
                name: nameMap.get(reg.user_id) ?? 'there',
                inviter_name: inviterName,
                event_title: event.title,
                event_date: eventDate,
                event_url: `https://app.coexistaus.org/events/${eventId}`,
              },
            },
          }).catch(console.error)
        }

        // Send push notifications
        supabase.functions.invoke('send-push', {
          body: {
            userIds: invitedUserIds,
            title: `You're invited!`,
            body: `${inviterName} invited you to ${event.title} on ${eventDate}`,
            data: { type: 'event_invite', event_id: eventId },
          },
        }).catch(console.error)

        // In-app notifications
        const notifications = invitedUserIds.map((uid) => ({
          user_id: uid,
          type: 'event_invite',
          title: `You're invited to ${event.title}`,
          body: `${inviterName} invited your collective to ${event.title} on ${eventDate}`,
          data: { event_id: eventId },
          read: false,
        }))
        supabase.from('notifications').insert(notifications).then(({ error: notifErr }) => {
          if (notifErr) console.error('[invite-all] notification insert error:', notifErr)
        })
      }

      return { reminded: false }
    },
    onMutate: async ({ eventId }) => {
      await queryClient.cancelQueries({ queryKey: ['event', eventId] })
      await queryClient.cancelQueries({ queryKey: ['event-attendees', eventId] })
    },
    onSettled: (_, __, { eventId, collectiveId }) => {
      queryClient.invalidateQueries({ queryKey: ['event', eventId] })
      queryClient.invalidateQueries({ queryKey: ['event-attendees', eventId] })
      queryClient.invalidateQueries({ queryKey: ['chat-messages', collectiveId] })
      // Invited users' my-events (invited tab) should update
      queryClient.invalidateQueries({ queryKey: ['my-events'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Mutations - Waitlist Management                                    */
/* ------------------------------------------------------------------ */

export function usePromoteFromWaitlist() {
  const queryClient = useQueryClient()
  const { isOffline } = useOffline()

  return useMutation({
    mutationFn: async ({ eventId, userId }: { eventId: string; userId: string }) => {
      // Offline path: queue. Server replay re-runs the same waitlisted->
      // registered transition + waitlist-promotion email, idempotently.
      if (isOffline) {
        queueOfflineAction('promote-waitlist', { eventId, userId })
        return
      }
      const { error } = await supabase
        .from('event_registrations')
        .update({ status: 'registered' })
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .eq('status', 'waitlisted')
      if (error) throw error

      // Send waitlist promotion email
      const [{ data: event }, { data: promotedProfile }] = await Promise.all([
        supabase.from('events').select('title, date_start').eq('id', eventId).single(),
        supabase.from('profiles').select('display_name').eq('id', userId).single(),
      ])

      if (event) {
        supabase.functions.invoke('send-email', {
          body: {
            type: 'waitlist_promoted',
            userId,
            data: {
              name: promotedProfile?.display_name ?? 'there',
              event_title: event.title,
              // Floating local time: stored wall-clock is the wall-clock.
              event_date: formatEventLong(event.date_start),
              event_url: `https://app.coexistaus.org/events/${eventId}`,
            },
          },
        }).catch(console.error)
      }
    },
    onMutate: async ({ eventId, userId }) => {
      await queryClient.cancelQueries({ queryKey: ['event-waitlist', eventId] })
      await queryClient.cancelQueries({ queryKey: ['event-attendees', eventId] })
      const previousWaitlist = queryClient.getQueryData<WaitlistEntry[]>(['event-waitlist', eventId])
      const previousAttendees = queryClient.getQueryData<AttendeeWithStatus[]>(['event-attendees', eventId])
      queryClient.setQueryData<WaitlistEntry[]>(['event-waitlist', eventId], (old) => old?.filter(e => e.user_id !== userId))
      queryClient.setQueryData<AttendeeWithStatus[]>(['event-attendees', eventId], (old) => {
        if (!old) return old
        return old.map(a => a.user_id === userId ? { ...a, status: 'registered' as const } : a)
      })
      return { previousWaitlist, previousAttendees }
    },
    onError: (_err, { eventId }, context) => {
      if (context?.previousWaitlist) queryClient.setQueryData(['event-waitlist', eventId], context.previousWaitlist)
      if (context?.previousAttendees) queryClient.setQueryData(['event-attendees', eventId], context.previousAttendees)
    },
    onSettled: (_, __, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['event-waitlist', eventId] })
      queryClient.invalidateQueries({ queryKey: ['event-attendees', eventId] })
      queryClient.invalidateQueries({ queryKey: ['event', eventId] })
      // The promoted user's my-events and home feed should update
      queryClient.invalidateQueries({ queryKey: ['my-events'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'my-upcoming-events'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Calendar helpers                                                   */
/* ------------------------------------------------------------------ */

export function generateIcsFile(event: Event): string {
  const start = new Date(event.date_start)
  const end = event.date_end ? new Date(event.date_end) : new Date(start.getTime() + 2 * 60 * 60 * 1000)

  const formatIcsDate = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

  // ICS requires escaping backslashes, semicolons, commas, and newlines
  const escapeIcs = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Co-Exist//Event//EN',
    'BEGIN:VEVENT',
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `DESCRIPTION:${escapeIcs(event.description ?? '')}`,
    `LOCATION:${escapeIcs(event.address ?? '')}`,
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    'DESCRIPTION:Event reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

export function downloadIcsFile(event: Event) {
  const ics = generateIcsFile(event)
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${event.title.replace(/[^a-zA-Z0-9]/g, '-')}.ics`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/* ------------------------------------------------------------------ */
/*  Collaboration - invite collectives to co-host events                */
/* ------------------------------------------------------------------ */

export interface CollaborationWithDetails {
  id: string
  event_id: string
  collective_id: string
  invited_by_collective_id: string
  invited_by_user: string
  status: 'pending' | 'accepted' | 'declined'
  message: string | null
  created_at: string
  responded_at: string | null
  events: Pick<Event, 'id' | 'title' | 'date_start' | 'date_end' | 'activity_type' | 'address'> | null
  collectives: Pick<Collective, 'id' | 'name' | 'cover_image_url'> | null
  invited_by_collective: Pick<Collective, 'id' | 'name'> | null
}

/** Collaborations where this collective was invited */
export function useIncomingCollaborations(collectiveId: string | undefined) {
  return useQuery({
    queryKey: ['collaborations-incoming', collectiveId],
    queryFn: async () => {
      if (!collectiveId) return []
      const { data, error } = await supabase
        .from('collective_event_collaborators')
        .select('*, events(id, title, date_start, date_end, activity_type, address), collectives:collective_id(id, name, cover_image_url), invited_by_collective:invited_by_collective_id(id, name)')
        .eq('collective_id', collectiveId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as CollaborationWithDetails[]
    },
    enabled: !!collectiveId,
    staleTime: 2 * 60 * 1000,
  })
}

/** Collaborations this collective sent out */
export function useOutgoingCollaborations(collectiveId: string | undefined) {
  return useQuery({
    queryKey: ['collaborations-outgoing', collectiveId],
    queryFn: async () => {
      if (!collectiveId) return []
      const { data, error } = await supabase
        .from('collective_event_collaborators')
        .select('*, events(id, title, date_start, date_end, activity_type, address), collectives:collective_id(id, name, cover_image_url)')
        .eq('invited_by_collective_id', collectiveId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as CollaborationWithDetails[]
    },
    enabled: !!collectiveId,
    staleTime: 2 * 60 * 1000,
  })
}

export function useInviteCollaborator() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      eventId,
      collectiveId,
      hostCollectiveId,
      message,
    }: {
      eventId: string
      collectiveId: string
      hostCollectiveId: string
      message?: string
    }) => {
      const { data, error } = await supabase.rpc('invite_collective_to_collaborate', {
        p_event_id: eventId,
        p_collective_id: collectiveId,
        p_host_collective_id: hostCollectiveId,
        p_message: message ?? undefined,
      })
      if (error) throw error
      return data
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['collaborations-outgoing', vars.hostCollectiveId] })
      queryClient.invalidateQueries({ queryKey: ['collaborations-incoming', vars.collectiveId] })
      queryClient.invalidateQueries({ queryKey: ['event', vars.eventId] })
    },
  })
}

export function useRespondToCollaboration() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      collaborationId,
      accept,
    }: {
      collaborationId: string
      accept: boolean
      collectiveId?: string
      hostCollectiveId?: string
    }) => {
      const { error } = await supabase.rpc('respond_to_collaboration', {
        p_collaboration_id: collaborationId,
        p_accept: accept,
      })
      if (error) throw error
    },
    onMutate: async ({ collaborationId, accept, collectiveId }) => {
      if (!collectiveId) return
      await queryClient.cancelQueries({ queryKey: ['collaborations-incoming', collectiveId] })
      const previous = queryClient.getQueryData<CollaborationWithDetails[]>(['collaborations-incoming', collectiveId])
      queryClient.setQueryData<CollaborationWithDetails[]>(['collaborations-incoming', collectiveId], (old) =>
        old?.map((c) =>
          c.id === collaborationId
            ? { ...c, status: accept ? 'accepted' as const : 'declined' as const, responded_at: new Date().toISOString() }
            : c,
        ),
      )
      return { previous, collectiveId }
    },
    onError: (_err, _, context) => {
      if (context?.previous && context.collectiveId) {
        queryClient.setQueryData(['collaborations-incoming', context.collectiveId], context.previous)
      }
    },
    onSettled: (_, __, vars) => {
      if (vars.collectiveId) {
        queryClient.invalidateQueries({ queryKey: ['collaborations-incoming', vars.collectiveId] })
      }
      if (vars.hostCollectiveId) {
        queryClient.invalidateQueries({ queryKey: ['collaborations-outgoing', vars.hostCollectiveId] })
      }
    },
  })
}

export function getGoogleCalendarUrl(event: Event): string {
  const start = new Date(event.date_start)
  const end = event.date_end ? new Date(event.date_end) : new Date(start.getTime() + 2 * 60 * 60 * 1000)

  const formatGcalDate = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatGcalDate(start)}/${formatGcalDate(end)}`,
    details: event.description ?? '',
    location: event.address ?? '',
  })

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
