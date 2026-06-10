import { useQuery, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { countByField, STATUS_FILTERS } from '@/lib/query-builders'

/* ------------------------------------------------------------------ */
/*  Admin events dashboard hook                                        */
/*                                                                     */
/*  Extracted from pages/admin/events.tsx for reuse + prefetch.        */
/* ------------------------------------------------------------------ */

export interface AdminEvent {
  id: string
  title: string
  date_start: string
  date_end: string | null
  address: string | null
  cover_image_url: string | null
  collective_id: string
  capacity: number | null
  activity_type: string | null
  status: 'draft' | 'published' | 'cancelled' | 'completed'
  /** Per-event timezone override; NULL = inherit from collective. */
  timezone: string | null
  collectives: { name: string; region: string | null; state: string | null; timezone: string | null } | null
  registrationCount: number
}

export interface AdminEventsStats {
  total: number
  upcoming: number
  totalRegistrations: number
  upcomingRegistrations: number
  avgAttendance: number
  hottestEvent: AdminEvent | null
}

export interface AdminEventsData {
  all: AdminEvent[]
  upcoming: AdminEvent[]
  past: AdminEvent[]
  stats: AdminEventsStats
}

async function fetchAdminEventsData(): Promise<AdminEventsData> {
  const now = new Date().toISOString()

  // Fetch upcoming and past separately to ensure upcoming events are never
  // cut off by the row limit when there are many past events.
  const [upcomingRes, pastRes] = await Promise.all([
    supabase
      .from('events')
      .select(
        'id, title, date_start, date_end, address, cover_image_url, collective_id, capacity, activity_type, status, timezone, collectives(name, region, state, timezone)',
      )
      .gte('date_start', now)
      .order('date_start', { ascending: true })
      .limit(200),
    supabase
      .from('events')
      .select(
        'id, title, date_start, date_end, address, cover_image_url, collective_id, capacity, activity_type, status, timezone, collectives(name, region, state, timezone)',
      )
      .lt('date_start', now)
      .order('date_start', { ascending: false })
      .limit(200),
  ])

  const error = upcomingRes.error || pastRes.error
  const events = [...(upcomingRes.data ?? []), ...(pastRes.data ?? [])]

  if (error) throw error

  const eventList = (events ?? []) as (Omit<AdminEvent, 'registrationCount'>)[]

  // Batch-fetch registration + check-in counts separately. Registration
  // counts power the upcoming-events stats; check-in counts power the
  // "average attendance" card, which has to reflect real turnout (status
  // = 'attended'), not signups.
  const eventIds = eventList.map((e) => e.id)
  let regCounts = new Map<unknown, number>()
  let checkInCounts = new Map<unknown, number>()
  let walkInCounts = new Map<unknown, number>()
  if (eventIds.length > 0) {
    const [regRes, checkInRes, walkInRes] = await Promise.all([
      supabase
        .from('event_registrations')
        .select('event_id')
        .in('event_id', eventIds)
        .in('status', STATUS_FILTERS.events.REGISTRATION),
      supabase
        .from('event_registrations')
        .select('event_id')
        .in('event_id', eventIds)
        .eq('status', 'attended'),
      supabase
        .from('event_walk_ins')
        .select('event_id')
        .in('event_id', eventIds)
        .eq('status', 'attended'),
    ])

    regCounts = countByField((regRes.data ?? []) as { event_id: string }[], 'event_id')
    checkInCounts = countByField((checkInRes.data ?? []) as { event_id: string }[], 'event_id')
    walkInCounts = countByField((walkInRes.data ?? []) as { event_id: string }[], 'event_id')
  }

  const enriched: AdminEvent[] = eventList.map((event) => ({
    ...event,
    registrationCount: regCounts.get(event.id) ?? 0,
  } as AdminEvent))

  const upcoming = enriched.filter((e) => e.date_start >= now && e.status !== 'cancelled')
  const past = enriched.filter((e) => e.date_start < now)

  const totalRegistrations = enriched.reduce((sum, e) => sum + e.registrationCount, 0)
  const upcomingRegistrations = upcoming.reduce((sum, e) => sum + e.registrationCount, 0)
  // Average actual attendance per past event = (checked-in registrations
  // + checked-in walk-ins) / past-event count, excluding cancelled events
  // and events with no attendance recorded at all (likely cancelled in
  // practice or pre-impact-log placeholders).
  const pastEligible = past.filter((e) => e.status !== 'cancelled')
  const attendedPerEvent = pastEligible.map((e) =>
    (checkInCounts.get(e.id) ?? 0) + (walkInCounts.get(e.id) ?? 0),
  )
  const eventsWithAttendance = attendedPerEvent.filter((n) => n > 0)
  const avgAttendance =
    eventsWithAttendance.length > 0
      ? Math.round(eventsWithAttendance.reduce((sum, n) => sum + n, 0) / eventsWithAttendance.length)
      : 0

  const hottestEvent = upcoming.length > 0
    ? upcoming.reduce((a, b) => (a.registrationCount > b.registrationCount ? a : b))
    : null

  return {
    all: enriched,
    upcoming,
    past,
    stats: {
      total: enriched.length,
      upcoming: upcoming.length,
      totalRegistrations,
      upcomingRegistrations,
      avgAttendance,
      hottestEvent,
    },
  }
}

export function useAdminEventsData() {
  return useQuery({
    queryKey: ['admin-events-dashboard'],
    queryFn: fetchAdminEventsData,
    staleTime: 60 * 1000,
  })
}

export function prefetchAdminEventsData(queryClient: QueryClient) {
  return queryClient.prefetchQuery({
    queryKey: ['admin-events-dashboard'],
    queryFn: fetchAdminEventsData,
    staleTime: 60 * 1000,
  })
}
