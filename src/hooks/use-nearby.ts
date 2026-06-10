import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { wallClockNow } from '@/lib/date-format'
import type { Tables, Database } from '@/types/database.types'

type ActivityType = Database['public']['Enums']['activity_type']

type Event = Tables<'events'>
type Collective = Tables<'collectives'>

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Location {
  lat: number
  lng: number
}

interface EventWithCollective extends Event {
  collectives: Pick<Collective, 'id' | 'name'> | null
}

/* ------------------------------------------------------------------ */
/*  Nearby events                                                      */
/* ------------------------------------------------------------------ */

export function useNearbyEvents(
  location: Location | null,
  radiusKm: number = 50,
  activityTypes?: ActivityType[],
) {
  return useQuery({
    queryKey: ['nearby', 'events', location, radiusKm, activityTypes],
    queryFn: async () => {
      // Use PostGIS distance filter when user location is available
      if (location?.lat && location?.lng) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_events_within_radius', {
          p_lat: location.lat,
          p_lng: location.lng,
          p_radius_km: radiusKm,
          p_limit: 20,
        })
        if (rpcError) throw rpcError
        if (!rpcData?.length) return [] as EventWithCollective[]

        // Re-fetch with collective join (RPC returns raw events)
        const eventIds = (rpcData as Event[]).map((e) => e.id)
        let query = supabase
          .from('events')
          .select('*, collectives(id, name)')
          .in('id', eventIds)
          .order('date_start', { ascending: true })
        if (activityTypes?.length) {
          query = query.in('activity_type', activityTypes)
        }
        const { data, error } = await query
        if (error) throw error
        return (data ?? []) as EventWithCollective[]
      }

      // Fallback: no location - return all upcoming published events.
      // Floating-local: compare against viewer wall-clock-now.
      const now = wallClockNow().toISOString()
      let query = supabase
        .from('events')
        .select('*, collectives(id, name)')
        .eq('status', 'published')
        .or(`date_start.gte.${now},date_end.gte.${now}`)
        .order('date_start', { ascending: true })

      if (activityTypes?.length) {
        query = query.in('activity_type', activityTypes)
      }

      const { data, error } = await query.limit(20)
      if (error) throw error
      return (data ?? []) as EventWithCollective[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Nearby collectives                                                 */
/* ------------------------------------------------------------------ */

export function useNearbyCollectives(
  location: Location | null,
  radiusKm: number = 100,
) {
  return useQuery({
    queryKey: ['nearby', 'collectives', location, radiusKm],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collectives')
        .select('*')
        .eq('is_active', true)
        .or('is_national.is.null,is_national.eq.false')
        .order('member_count', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []) as Collective[]
    },
    staleTime: 10 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  User location (browser geolocation)                                */
/* ------------------------------------------------------------------ */

export function useUserLocation() {
  return useQuery({
    queryKey: ['user-location'],
    queryFn: () =>
      new Promise<Location | null>((resolve) => {
        if (!navigator.geolocation) {
          resolve(null)
          return
        }
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve(null),
          { timeout: 10000, maximumAge: 5 * 60 * 1000 },
        )
      }),
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
}

/* ------------------------------------------------------------------ */
/*  Australian states for filter                                       */
/* ------------------------------------------------------------------ */

export const AU_STATES = [
  { value: 'NSW', label: 'New South Wales' },
  { value: 'VIC', label: 'Victoria' },
  { value: 'QLD', label: 'Queensland' },
  { value: 'WA', label: 'Western Australia' },
  { value: 'SA', label: 'South Australia' },
  { value: 'TAS', label: 'Tasmania' },
  { value: 'ACT', label: 'Australian Capital Territory' },
  { value: 'NT', label: 'Northern Territory' },
] as const
