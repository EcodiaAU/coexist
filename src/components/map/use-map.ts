import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'

/* ------------------------------------------------------------------ */
/*  Shared types                                                       */
/* ------------------------------------------------------------------ */

export interface MapCenter {
  lat: number
  lng: number
}

export type MarkerVariant = 'default' | 'event' | 'collective'

export interface MapMarker {
  id: string
  position: MapCenter
  variant?: MarkerVariant
  label?: string
}

/* ------------------------------------------------------------------ */
/*  Tile layer config                                                  */
/* ------------------------------------------------------------------ */

export const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

/** Centre of Australia - sensible fallback instead of defaulting to Sydney */
export const DEFAULT_CENTER: MapCenter = { lat: -25.0, lng: 134.0 }
export const DEFAULT_ZOOM_FALLBACK = 4 // zoom out to show all of Australia

/* ------------------------------------------------------------------ */
/*  Global CSS overrides for Co-Exist styling                          */
/* ------------------------------------------------------------------ */

const STYLE_ID = 'coexist-leaflet-overrides'

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .coexist-map-pin { background: none !important; border: none !important; }
    .coexist-cluster-icon { background: none !important; border: none !important; }
    .leaflet-popup-content-wrapper {
      border-radius: 12px !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.12) !important;
      font-family: var(--font-body), sans-serif !important;
    }
    .leaflet-popup-tip { box-shadow: 0 4px 12px rgba(0,0,0,0.12) !important; }
    .leaflet-control-zoom a {
      border-radius: 8px !important;
      width: 36px !important;
      height: 36px !important;
      line-height: 36px !important;
      font-size: 16px !important;
    }
    .leaflet-control-zoom {
      border: none !important;
      border-radius: 10px !important;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.12) !important;
    }
    .leaflet-touch .leaflet-bar a { width: 36px; height: 36px; line-height: 36px; }
  `
  document.head.appendChild(style)
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export interface UseMapOptions {
  center?: MapCenter
  zoom?: number
  interactive?: boolean
  /** Additional Leaflet map options */
  mapOptions?: Partial<L.MapOptions>
}

export interface UseMapReturn {
  containerRef: React.RefObject<HTMLDivElement | null>
  mapRef: React.MutableRefObject<L.Map | null>
  mapReady: boolean
}

export function useMap({
  center,
  zoom = 13,
  interactive = true,
  mapOptions,
}: UseMapOptions = {}): UseMapReturn {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const [mapReady, setMapReady] = useState(false)

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    injectStyles()

    const c = center ?? DEFAULT_CENTER
    const z = center ? zoom : DEFAULT_ZOOM_FALLBACK
    const map = L.map(containerRef.current, {
      center: [c.lat, c.lng],
      zoom: z,
      zoomControl: interactive,
      dragging: interactive,
      touchZoom: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
      attributionControl: true,
      // @ts-expect-error tap is valid Leaflet option
      tap: interactive,
      ...mapOptions,
    })

    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(map)
    mapRef.current = map

    requestAnimationFrame(() => {
      map.invalidateSize()
      setMapReady(true)
    })

    return () => {
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update center/zoom
  const updateView = useCallback((c: MapCenter, z: number) => {
    mapRef.current?.setView([c.lat, c.lng], z, { animate: true })
  }, [])

  useEffect(() => {
    if (!mapRef.current || !mapReady) return
    const c = center ?? DEFAULT_CENTER
    const z = center ? zoom : DEFAULT_ZOOM_FALLBACK
    updateView(c, z)
  }, [center, zoom, mapReady, updateView])

  return { containerRef, mapRef, mapReady }
}
