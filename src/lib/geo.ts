import type { MapCenter } from '@/components/map/use-map'

/**
 * Decode a little-endian IEEE-754 double from a WKB hex string at byte offset.
 * offset is in bytes (each byte = 2 hex chars).
 */
function wkbDouble(hex: string, byteOffset: number): number {
  const buf = new ArrayBuffer(8)
  const view = new DataView(buf)
  for (let i = 0; i < 8; i++) {
    view.setUint8(i, parseInt(hex.slice((byteOffset + i) * 2, (byteOffset + i) * 2 + 2), 16))
  }
  return view.getFloat64(0, true) // little-endian
}

/**
 * Parse a PostGIS location_point (unknown) into { lat, lng }.
 * Handles:
 *   - WKB hex strings (what PostgREST returns for geography columns)
 *   - GeoJSON Point objects
 *   - WKT/EWKT strings
 *   - Plain {lat,lng} objects
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

  if (typeof point === 'string') {
    // WKT: "POINT(lng lat)" or "SRID=4326;POINT(lng lat)"
    const wktMatch = point.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/)
    if (wktMatch) {
      return { lat: parseFloat(wktMatch[2]), lng: parseFloat(wktMatch[1]) }
    }

    // WKB hex (PostgREST returns geography columns as EWKB hex).
    // Layout (little-endian):
    //   1 byte  byteOrder (01 = LE)
    //   4 bytes wkbType  (with SRID flag 0x20000000 set for EWKB)
    //   4 bytes SRID     (only present when SRID flag set)
    //   8 bytes X (lng)
    //   8 bytes Y (lat)
    const hex = point.trim().toUpperCase()
    if (/^[0-9A-F]+$/.test(hex) && hex.length >= 42) {
      try {
        const byteOrder = parseInt(hex.slice(0, 2), 16)
        if (byteOrder === 1) { // little-endian only
          const wkbTypeBuf = new ArrayBuffer(4)
          const wkbTypeView = new DataView(wkbTypeBuf)
          for (let i = 0; i < 4; i++) {
            wkbTypeView.setUint8(i, parseInt(hex.slice(2 + i * 2, 4 + i * 2), 16))
          }
          const wkbType = wkbTypeView.getUint32(0, true)
          const hasSrid = (wkbType & 0x20000000) !== 0
          const coordOffset = hasSrid ? 9 : 5 // bytes: 1 + 4 + (4 if SRID)
          const lng = wkbDouble(hex, coordOffset)
          const lat = wkbDouble(hex, coordOffset + 8)
          if (isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            return { lat, lng }
          }
        }
      } catch {
        // fall through
      }
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
  // Wangaratta city centre - covers Wodonga, Wangaratta, Benalla, Beechworth and surrounds
  'north-east-victoria': { lat: -36.3551, lng: 146.3194 },
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
 *
 * Safeguard: when both fail and a slug is provided, log a dev-mode warning so
 * a newly created collective with no PostGIS coords AND no slug entry surfaces
 * loudly in the console instead of silently disappearing from the map. The
 * admin "create collective" form does not currently capture coords, so any
 * new slug must be added to COLLECTIVE_SLUG_COORDS or the row will not pin.
 */
export function resolveCollectiveCoords(
  point: unknown,
  slug: string | null | undefined,
): MapCenter | null {
  const fromPoint = parseLocationPoint(point)
  if (fromPoint) return fromPoint
  if (slug) {
    const fallback = COLLECTIVE_SLUG_COORDS[slug]
    if (fallback) return fallback
    if (import.meta.env.DEV) {
      console.warn(
        `[collective-map] no coords for slug "${slug}". Add to COLLECTIVE_SLUG_COORDS in src/lib/geo.ts or populate location_point on the row, otherwise this collective will not appear on the map.`,
      )
    }
  }
  return null
}
