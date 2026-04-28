import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { subscribeWithReconnect } from '@/lib/realtime'
import { resolveCollectiveCoords } from '@/lib/geo'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MapCollective {
  id: string
  slug: string
  name: string
  cover_image_url: string | null
  region: string | null
  state: string | null
  member_count: number | null
  description: string | null
  lat: number
  lng: number
  nextEvent: { title: string; date_start: string } | null
}

const MAP_QUERY_KEY = ['collective-map-data'] as const

/* ------------------------------------------------------------------ */
/*  Hook: fetch all active collectives with next upcoming event        */
/* ------------------------------------------------------------------ */

export function useCollectiveMapData() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: MAP_QUERY_KEY,
    queryFn: async () => {
      // Fetch active collectives
      const { data: collectives, error } = await supabase
        .from('collectives')
        .select('id, slug, name, cover_image_url, region, state, member_count, description, location_point')
        .eq('is_active', true)
        .or('is_national.is.null,is_national.eq.false')
        .order('member_count', { ascending: false })

      if (error) throw error
      if (!collectives?.length) return []

      // Fetch the next upcoming event per collective in one query
      const now = new Date().toISOString()
      const collectiveIds = collectives.map((c) => c.id)

      const { data: events } = await supabase
        .from('events')
        .select('id, title, date_start, collective_id')
        .in('collective_id', collectiveIds)
        .eq('status', 'published')
        .gte('date_start', now)
        .order('date_start', { ascending: true })

      // Build map: collective_id -> first upcoming event
      const nextEventMap = new Map<string, { title: string; date_start: string }>()
      if (events) {
        for (const e of events) {
          if (e.collective_id && !nextEventMap.has(e.collective_id)) {
            nextEventMap.set(e.collective_id, { title: e.title, date_start: e.date_start })
          }
        }
      }

      // Merge - use location_point if available, else fall back to slug-based coords
      const result: MapCollective[] = []
      for (const c of collectives) {
        const loc = resolveCollectiveCoords(c.location_point, c.slug)
        if (!loc) continue
        result.push({
          id: c.id,
          slug: c.slug,
          name: c.name,
          cover_image_url: c.cover_image_url,
          region: c.region,
          state: c.state,
          member_count: c.member_count,
          description: c.description,
          lat: loc.lat,
          lng: loc.lng,
          nextEvent: nextEventMap.get(c.id) ?? null,
        })
      }

      return result
    },
    // Realtime keeps this fresh; the long staleTime is now a fallback
    // for cases where the realtime channel is degraded.
    staleTime: 10 * 60 * 1000,
  })

  /* ---------------------------------------------------------------- */
  /*  Realtime: invalidate the map query when any event or collective  */
  /*  row changes. Covers cross-user updates (a second viewer sees a   */
  /*  new event appear without a refresh) and the same-user case where */
  /*  a mutation succeeds in another tab.                              */
  /*                                                                   */
  /*  In-tab mutations also call invalidateQueries directly from       */
  /*  useCreateEvent / useUpdateEvent / useCancelEvent for an instant   */
  /*  same-tab refresh that does not depend on the realtime round trip.*/
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    const channel = supabase
      .channel('collective-map-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => {
          queryClient.invalidateQueries({ queryKey: MAP_QUERY_KEY })
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'collectives' },
        () => {
          queryClient.invalidateQueries({ queryKey: MAP_QUERY_KEY })
        },
      )

    const cleanup = subscribeWithReconnect(channel)

    return () => {
      cleanup()
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  return query
}
