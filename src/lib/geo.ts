import type { MapCenter } from '@/components/map/use-map'

/**
 * Parse a PostGIS location_point (unknown) into { lat, lng }.
 * Handles GeoJSON Point objects, WKT strings, and plain {lat,lng} objects.
 * Returns null if unparseable.
 */
export function parseLocationPoint(point: unknown): MapCenter | null {
  if (!point) return null

  // GeoJSON Point: { type: "Point", coordinates: [lng, lat] }
  if (
    typeof point === 'object' &&
    point !== null &&
    'type' in point &&
    (point as { type: string }).type === 'Point' &&
    'coordinates' in point
  ) {
    const coords = (point as { coordinates: number[] }).coordinates
    if (Array.isArray(coords) && coords.length >= 2) {
      return { lat: coords[1], lng: coords[0] }
    }
  }

  // Plain object with lat/lng
  if (
    typeof point === 'object' &&
    point !== null &&
    'lat' in point &&
    'lng' in point
  ) {
    const p = point as { lat: number; lng: number }
    if (typeof p.lat === 'number' && typeof p.lng === 'number') {
      return p
    }
  }

  // WKT: "POINT(lng lat)" or "SRID=4326;POINT(lng lat)"
  if (typeof point === 'string') {
    const match = point.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/)
    if (match) {
      return { lat: parseFloat(match[2]), lng: parseFloat(match[1]) }
    }
  }

  return null
}

/**
 * City-centre fallback coords keyed by collective slug. Used everywhere a
 * collective needs a map pin but doesn't have a populated location_point
 * yet — the explore map and the collective detail page both pull from
 * this so a missing PostGIS value never silently zooms out to "no pin
 * over the whole country".
 */
export const COLLECTIVE_SLUG_COORDS: Record<string, MapCenter> = {
  perth: { lat: -31.9505, lng: 115.8605 },
  adelaide: { lat: -34.9285, lng: 138.6007 },
  geelong: { lat: -38.1499, lng: 144.3617 },
  'mornington-peninsula': { lat: -38.2833, lng: 145.1667 },
  'melbourne-city': { lat: -37.8136, lng: 144.9631 },
  melbourne: { lat: -37.8136, lng: 144.9631 },
  hobart: { lat: -42.8821, lng: 147.3272 },
  sydney: { lat: -33.8688, lng: 151.2093 },
  'northern-rivers': { lat: -28.8131, lng: 153.276 },
  'gold-coast': { lat: -28.0167, lng: 153.4 },
  brisbane: { lat: -27.4698, lng: 153.0251 },
  'sunshine-coast': { lat: -26.65, lng: 153.0667 },
  townsville: { lat: -19.259, lng: 146.8169 },
  cairns: { lat: -16.9186, lng: 145.7781 },
  tamworth: { lat: -31.0927, lng: 150.932 },
}

/**
 * Resolve coords for a collective: prefer the PostGIS location_point,
 * fall back to the slug-keyed city centre.
 */
export function resolveCollectiveCoords(
  point: unknown,
  slug: string | null | undefined,
): MapCenter | null {
  return parseLocationPoint(point) ?? (slug ? COLLECTIVE_SLUG_COORDS[slug] ?? null : null)
}
