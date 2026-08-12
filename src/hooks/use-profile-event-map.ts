/**
 * Profile event map data (Jess 2026-08-12).
 *
 * The member profile shows a zoomed-in map of every place the member has
 * actually turned up to an event, grouped by location so multiple events at
 * the same spot (e.g. several clean-ups at Mooloolaba) collapse to one pin
 * with a popup listing them - each linking to that event's shared photo album,
 * and each shareable as an impact graphic once impact is logged.
 *
 * Attendance truth: event_registrations.status = 'attended' (same source the
 * profile stats count from). Geo: events.location_point (PostGIS), decoded via
 * parseLocationPoint. Events with no stored point are dropped from the map (we
 * do not invent a location) but still counted in the profile stats elsewhere.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { parseLocationPoint } from '@/lib/geo'

export interface ProfileMapEvent {
  id: string
  title: string
  dateStart: string
  activityType: string
  coverImageUrl: string | null
  address: string | null
  photoCount: number
  /** Route to the event's shared photo album. */
  albumHref: string
}

export interface ProfileMapLocation {
  /** Stable key from the rounded coordinate. */
  key: string
  lat: number
  lng: number
  /** Human label - the first event address at the spot, else a coord string. */
  label: string
  events: ProfileMapEvent[]
}

export interface ProfileEventMapData {
  locations: ProfileMapLocation[]
  /** Count of attended events that had no stored location (shown as a note). */
  unmappedCount: number
}

// Group events whose coordinates round to the same ~110m cell. 3 decimal
// places of latitude is ~111m; good enough to collapse "the same beach" while
// keeping genuinely distinct sites apart.
function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`
}

type RegistrationRow = {
  event_id: string
  events: {
    id: string
    title: string
    date_start: string
    address: string | null
    location_point: unknown
    activity_type: string
    cover_image_url: string | null
  } | null
}

// Dev-only forced-state harness. The Ecodia test account has zero attended
// events, so the populated map cannot be verified from real data. Gated on
// import.meta.env.DEV AND ?eventmapdemo in the URL, so it can never render in
// a production build. Two events at Mooloolaba (one group) + one at Noosa.
function devSample(): ProfileEventMapData {
  return {
    unmappedCount: 1,
    locations: [
      {
        key: '-26.681,153.121', lat: -26.6813, lng: 153.1210, label: 'Mooloolaba Beach, QLD',
        events: [
          { id: '00000000-0000-0000-0000-000000000001', title: 'Mooloolaba Beach Clean-up', dateStart: '2026-07-19', activityType: 'shore_cleanup', coverImageUrl: null, address: 'Mooloolaba Beach, QLD', photoCount: 12, albumHref: '/events/00000000-0000-0000-0000-000000000001?tab=photos' },
          { id: '00000000-0000-0000-0000-000000000002', title: 'Spit Dune Planting', dateStart: '2026-05-11', activityType: 'tree_planting', coverImageUrl: null, address: 'Mooloolaba Beach, QLD', photoCount: 0, albumHref: '/events/00000000-0000-0000-0000-000000000002?tab=photos' },
        ],
      },
      {
        key: '-26.398,153.093', lat: -26.3980, lng: 153.0930, label: 'Noosa National Park, QLD',
        events: [
          { id: '00000000-0000-0000-0000-000000000003', title: 'Noosa Headland Nature Walk', dateStart: '2026-06-02', activityType: 'nature_walk', coverImageUrl: null, address: 'Noosa National Park, QLD', photoCount: 5, albumHref: '/events/00000000-0000-0000-0000-000000000003?tab=photos' },
        ],
      },
    ],
  }
}

async function fetchProfileEventMap(userId: string): Promise<ProfileEventMapData> {
  if (import.meta.env.DEV && typeof window !== 'undefined' && window.location.search.includes('eventmapdemo')) {
    return devSample()
  }

  const { data: regs, error } = await supabase
    .from('event_registrations')
    .select('event_id, events(id, title, date_start, address, location_point, activity_type, cover_image_url)')
    .eq('user_id', userId)
    .eq('status', 'attended')

  if (error) throw error

  const rows = (regs ?? []) as unknown as RegistrationRow[]
  const events = rows.map((r) => r.events).filter((e): e is NonNullable<RegistrationRow['events']> => !!e)

  // Photo counts per event (non-archived), one batched query.
  const eventIds = events.map((e) => e.id)
  const photoCounts = new Map<string, number>()
  if (eventIds.length > 0) {
    const { data: photos } = await supabase
      .from('event_photos')
      .select('event_id')
      .in('event_id', eventIds)
      .is('archived_at', null)
    for (const p of (photos ?? []) as { event_id: string }[]) {
      photoCounts.set(p.event_id, (photoCounts.get(p.event_id) ?? 0) + 1)
    }
  }

  let unmappedCount = 0
  const groups = new Map<string, ProfileMapLocation>()
  for (const e of events) {
    const pos = parseLocationPoint(e.location_point)
    if (!pos) {
      unmappedCount += 1
      continue
    }
    const key = coordKey(pos.lat, pos.lng)
    const mapEvent: ProfileMapEvent = {
      id: e.id,
      title: e.title,
      dateStart: e.date_start,
      activityType: e.activity_type,
      coverImageUrl: e.cover_image_url,
      address: e.address,
      photoCount: photoCounts.get(e.id) ?? 0,
      albumHref: `/events/${e.id}?tab=photos`,
    }
    const existing = groups.get(key)
    if (existing) {
      existing.events.push(mapEvent)
      if (!existing.label && e.address) existing.label = e.address
    } else {
      groups.set(key, {
        key,
        lat: pos.lat,
        lng: pos.lng,
        label: e.address ?? `${pos.lat.toFixed(3)}, ${pos.lng.toFixed(3)}`,
        events: [mapEvent],
      })
    }
  }

  // Newest event first within each location; most-visited locations first.
  const locations = [...groups.values()]
    .map((g) => ({
      ...g,
      events: g.events.sort((a, b) => b.dateStart.localeCompare(a.dateStart)),
    }))
    .sort((a, b) => b.events.length - a.events.length)

  return { locations, unmappedCount }
}

export function useProfileEventMap(userId?: string) {
  return useQuery({
    queryKey: ['profile-event-map', userId],
    queryFn: () => fetchProfileEventMap(userId as string),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  })
}
