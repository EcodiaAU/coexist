import { useQuery, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

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
  /** Cover focal point (0-100). NULL = centre. Honoured by full-bleed tiles. */
  cover_image_position_x: number | null
  cover_image_position_y: number | null
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
        'id, title, date_start, date_end, address, cover_image_url, cover_image_position_x, cover_image_position_y, collective_id, capacity, activity_type, status, timezone, collectives(name, region, state, timezone)',
      )
      .gte('date_start', now)
      .order('date_start', { ascending: true })
      .limit(200),
    supabase
      .from('events')
      .select(
        'id, title, date_start, date_end, address, cover_image_url, cover_image_position_x, cover_image_position_y, collective_id, capacity, activity_type, status, timezone, collectives(name, region, state, timezone)',
      )
      .lt('date_start', now)
      .order('date_start', { ascending: false })
      .limit(200),
  ])

  const error = upcomingRes.error || pastRes.error
  const events = [...(upcomingRes.data ?? []), ...(pastRes.data ?? [])]

  if (error) throw error

  const eventList = (events ?? []) as (Omit<AdminEvent, 'registrationCount'>)[]

  // Aggregate registration + check-in + walk-in counts SERVER-SIDE via
  // get_event_engagement_counts. The old approach fetched every matching
  // event_registrations row and tallied them client-side with countByField,
  // but PostgREST caps a response at 1000 rows: with 2000+ registered rows
  // across all events, the batched fetch silently truncated and any event
  // whose rows fell past the boundary read 0 (Myall Park campout showed 0/30
  // against 26 real registrations). The RPC does the GROUP BY in Postgres so
  // no row cap can truncate it. Registration counts power the upcoming-events
  // stats; check-in + walk-in attended counts power the "average attendance"
  // card, which reflects real turnout (status = 'attended'), not signups.
  const eventIds = eventList.map((e) => e.id)
  const regCounts = new Map<unknown, number>()
  const checkInCounts = new Map<unknown, number>()
  const walkInCounts = new Map<unknown, number>()
  if (eventIds.length > 0) {
    const { data: countRows, error: countErr } = await supabase.rpc('get_event_engagement_counts', {
      event_ids: eventIds,
    })
    if (countErr) throw countErr
    for (const row of (countRows ?? []) as {
      event_id: string
      registered_count: number
      attended_count: number
      walkin_attended_count: number
    }[]) {
      regCounts.set(row.event_id, row.registered_count)
      checkInCounts.set(row.event_id, row.attended_count)
      walkInCounts.set(row.event_id, row.walkin_attended_count)
    }
  }

  const enriched: AdminEvent[] = eventList.map((event) => ({
    ...event,
    registrationCount: regCounts.get(event.id) ?? 0,
  } as AdminEvent))

  const upcoming = enriched.filter((e) => e.date_start >= now && e.status !== 'cancelled')
  const past = enriched.filter((e) => e.date_start < now)
  // Headline stats exclude cancelled events so "Events" + "Registrations" tie
  // out with the adjacent Upcoming/Avg-attendance cards (which already skip
  // cancelled). Drafts stay counted: they are in-progress events the admin is
  // authoring and carry ~0 registrations, so they belong in the total without
  // distorting the registrations figure. `all` keeps every row for the list.
  const nonCancelled = enriched.filter((e) => e.status !== 'cancelled')

  const totalRegistrations = nonCancelled.reduce((sum, e) => sum + e.registrationCount, 0)
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
      total: nonCancelled.length,
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
