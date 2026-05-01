import { useQuery } from '@tanstack/react-query'
import type { MapCenter } from '@/components/map/use-map'

/**
 * Geocode a free-text address to a MapCenter via Nominatim (OpenStreetMap).
 *
 * Used as a fallback for the event-detail map: events created before the
 * RPC-based location_point fix have address text but no PostGIS point. This
 * hook resolves a coordinate at view time so participants can still see a
 * map pin even on legacy / unsynced rows. Result is cached per-address by
 * react-query so we don't hammer Nominatim on re-renders.
 */
export function useGeocodeAddress(address: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['geocode', address],
    enabled: enabled && !!address && address.trim().length > 0,
    staleTime: 24 * 60 * 60 * 1000, // 1 day — addresses don't move
    queryFn: async (): Promise<MapCenter | null> => {
      if (!address) return null
      const params = new URLSearchParams({
        q: address,
        format: 'json',
        limit: '1',
        countrycodes: 'au',
      })
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?${params}`,
        {
          headers: {
            'Accept-Language': 'en',
            'User-Agent': 'CoExistApp/1.0 (hello@coexistaus.org)',
          },
        },
      )
      if (!res.ok) return null
      const data = (await res.json()) as Array<{ lat: string; lon: string }>
      if (!data.length) return null
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    },
  })
}
