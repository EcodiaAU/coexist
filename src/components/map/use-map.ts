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

// CartoDB Voyager: a clean but NATURALLY coloured light basemap - warm cream
// land, pale-blue water, soft-green parks (Kurt 2026-08-12). Replaces Positron
// light_all, whose near-white land + grey water needed a green hue-rotate that
// left land whiteish and swung the ocean garish green. Voyager needs no colour
// trickery: land reads as land, water as water. {r} + detectRetina = @2x tiles.
// CARTO started requiring an API key on the raster basemaps in Aug 2026. Without
// one every tile comes back stamped with a diagonal "API KEY REQUIRED" watermark
// (the tiles still render, so nothing 404s and nothing throws; the map just looks
// broken). The key below is the free non-profit tier issued to code@ecodia.au on
// 2026-08-30 for app.coexistaus.org: 5 million tile requests a calendar month,
// conditional on the CARTO + OpenStreetMap attribution staying visible, which is
// what TILE_ATTR and attributionControl:true below are for. Do not remove them.
//
// It is a literal rather than a VITE_ env var on purpose. This value is public by
// design (it rides in the query string of every tile request in every user's
// browser), so an env var buys no secrecy, and it would add a silent failure mode
// across three separate build paths (Vercel prod, Vercel preview, and the local
// Capacitor build that feeds Capgo OTA plus the native binaries). A missing env
// var there brings the watermark back with no error anywhere.
//
// Raster is on CARTO's retirement path and vector is the successor; the same key
// already covers vector for when that move happens.
export const CARTO_BASEMAP_KEY = 'cb1_2jzf_1_d42f31f30177aa13aa9d5ca7'
export const TILE_URL = `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${CARTO_BASEMAP_KEY}`
export const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

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
    /* Bright basemap (Kurt 2026-08-12): Voyager already ships natural cream
       land + pale-blue water + green parks, so NO hue-rotate (that was what
       whitened the land and greened the ocean on the old Positron base). A
       gentle saturate + brightness only lifts the existing colours so greens
       pop against the olive pins. Scoped to .leaflet-tile-pane so pins,
       clusters, tooltips and controls keep their true colours. */
    .leaflet-tile-pane { filter: saturate(1.12) brightness(1.03); }
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

    // Defensive: if the container DOM node was reused (KeepAlive route cache,
    // StrictMode double-invoke, fast back-nav) and still carries Leaflet's
    // internal _leaflet_id from a prior map that wasn't fully torn down,
    // L.map() throws "Map container is already initialized." Clear it so a
    // re-init on the same node always succeeds.
    const containerEl = containerRef.current as HTMLDivElement & { _leaflet_id?: number }
    if (containerEl._leaflet_id != null) {
      delete containerEl._leaflet_id
    }

    // Guards the rAF below from running after this effect's cleanup (rapid
    // mount/unmount): calling invalidateSize()/setState on a removed map or
    // unmounted component throws / warns.
    let cancelled = false

    const c = center ?? DEFAULT_CENTER
    const z = center ? zoom : DEFAULT_ZOOM_FALLBACK
    // maxZoom MUST be set on the map options directly. The marker-cluster
    // plugin calls map.getMaxZoom() inside its onAdd; if the map has no
    // maxZoom set on its own options AND the tile layer's maxZoom hasn't
    // propagated yet (which happens on a remount with a different timing),
    // getMaxZoom() returns Infinity and the cluster plugin throws "Map has
    // no maxZoom specified" - the route ErrorBoundary catches it as a
    // render-phase throw via addLayer's synchronous commit, producing the
    // "This page ran into an issue" screen on the second event-detail visit.
    const map = L.map(containerRef.current, {
      center: [c.lat, c.lng],
      zoom: z,
      maxZoom: 19,
      minZoom: 2,
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

    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, subdomains: 'abcd', maxZoom: 20, detectRetina: true }).addTo(map)
    mapRef.current = map

    requestAnimationFrame(() => {
      if (cancelled || mapRef.current !== map) return
      map.invalidateSize()
      setMapReady(true)
    })

    return () => {
      cancelled = true
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
