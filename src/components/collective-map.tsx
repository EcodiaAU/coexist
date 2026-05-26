import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Users, TreePine, ArrowRight, Navigation, X, Calendar, MapPin } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { cn } from '@/lib/cn'
import { useCollectiveMapData, type MapCollective } from '@/hooks/use-collective-map'

/* ------------------------------------------------------------------ */
/*  Hardcoded fallback (used when DB returns no data)                  */
/* ------------------------------------------------------------------ */

const FALLBACK_COLLECTIVES: MapCollective[] = [
  { id: 'perth', slug: 'perth', name: 'Perth Collective', cover_image_url: null, region: 'Perth', state: 'WA', member_count: 124, description: 'Protecting the stunning coastline and bushlands of Western Australia.', lat: -31.9505, lng: 115.8605, nextEvent: null },
  { id: 'adelaide', slug: 'adelaide', name: 'Adelaide Collective', cover_image_url: null, region: 'Adelaide', state: 'SA', member_count: 89, description: "Restoring native habitats along the Torrens and across Adelaide's parks.", lat: -34.9285, lng: 138.6007, nextEvent: null },
  { id: 'geelong', slug: 'geelong', name: 'Geelong Collective', cover_image_url: null, region: 'Geelong', state: 'VIC', member_count: 67, description: 'Caring for the Bellarine coast and Barwon River corridors.', lat: -38.1499, lng: 144.3617, nextEvent: null },
  { id: 'mornington', slug: 'mornington-peninsula', name: 'Mornington Peninsula Collective', cover_image_url: null, region: 'Mornington Peninsula', state: 'VIC', member_count: 53, description: "Protecting the unique ecosystems of the Peninsula's coastline.", lat: -38.2833, lng: 145.1667, nextEvent: null },
  { id: 'melbourne', slug: 'melbourne-city', name: 'Melbourne City Collective', cover_image_url: null, region: 'Melbourne', state: 'VIC', member_count: 312, description: "Greening Melbourne's inner city through planting, litter removal and advocacy.", lat: -37.8136, lng: 144.9631, nextEvent: null },
  { id: 'hobart', slug: 'hobart', name: 'Hobart Collective', cover_image_url: null, region: 'Hobart', state: 'TAS', member_count: 48, description: "Conserving Tasmania's unique wilderness and waterways.", lat: -42.8821, lng: 147.3272, nextEvent: null },
  { id: 'sydney', slug: 'sydney', name: 'Sydney Collective', cover_image_url: null, region: 'Sydney', state: 'NSW', member_count: 287, description: "From the harbour to the Blue Mountains - protecting Sydney's natural heritage.", lat: -33.8688, lng: 151.2093, nextEvent: null },
  { id: 'northern-rivers', slug: 'northern-rivers', name: 'Northern Rivers Collective', cover_image_url: null, region: 'Northern Rivers', state: 'NSW', member_count: 95, description: 'Restoring the lush subtropical rainforests and river systems of the Northern Rivers.', lat: -28.8131, lng: 153.2760, nextEvent: null },
  { id: 'gold-coast', slug: 'gold-coast', name: 'Gold Coast Collective', cover_image_url: null, region: 'Gold Coast', state: 'QLD', member_count: 143, description: "Protecting the Gold Coast's beaches, hinterland and waterways.", lat: -28.0167, lng: 153.4000, nextEvent: null },
  { id: 'brisbane', slug: 'brisbane', name: 'Brisbane Collective', cover_image_url: null, region: 'Brisbane', state: 'QLD', member_count: 198, description: "Revitalising Brisbane's creeks, parks and urban bushland.", lat: -27.4698, lng: 153.0251, nextEvent: null },
  { id: 'sunshine-coast', slug: 'sunshine-coast', name: 'Sunshine Coast Collective', cover_image_url: null, region: 'Sunshine Coast', state: 'QLD', member_count: 76, description: "Guardians of the Sunshine Coast's beaches, reefs and hinterland.", lat: -26.6500, lng: 153.0667, nextEvent: null },
  { id: 'townsville', slug: 'townsville', name: 'Townsville Collective', cover_image_url: null, region: 'Townsville', state: 'QLD', member_count: 42, description: 'Protecting tropical ecosystems from reef to rainforest in North Queensland.', lat: -19.2590, lng: 146.8169, nextEvent: null },
  { id: 'cairns', slug: 'cairns', name: 'Cairns Collective', cover_image_url: null, region: 'Cairns', state: 'QLD', member_count: 61, description: 'Where the rainforest meets the reef - conservation in tropical Far North Queensland.', lat: -16.9186, lng: 145.7781, nextEvent: null },
]

/* ------------------------------------------------------------------ */
/*  Short name helper                                                  */
/* ------------------------------------------------------------------ */

function shortName(c: MapCollective): string {
  return c.region ?? c.name.replace(/ Collective$/i, '')
}

/* ------------------------------------------------------------------ */
/*  Custom pin - slate coloured                                        */
/* ------------------------------------------------------------------ */

const PIN_COLOR = '#475569'
const PIN_ACTIVE_COLOR = '#1e293b'

function createCollectiveIcon(active = false): L.DivIcon {
  const size = active ? 30 : 20
  const height = active ? 38 : 26
  const color = active ? PIN_ACTIVE_COLOR : PIN_COLOR

  const svg = `<svg width="${size}" height="${height}" viewBox="0 0 36 46" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 0C8.06 0 0 8.06 0 18c0 12.6 16.2 26.4 17.1 27.15a1.5 1.5 0 0 0 1.8 0C19.8 44.4 36 30.6 36 18 36 8.06 27.94 0 18 0Z" fill="${color}"/>
    <circle cx="18" cy="17" r="9" fill="white" fill-opacity="0.95"/>
    <circle cx="18" cy="17" r="4" fill="${color}"/>
  </svg>`

  return L.divIcon({
    html: active
      ? `<div style="position:relative;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;width:36px;height:36px;border-radius:50%;background:${color};opacity:0.12;animation:coexist-map-ping 1.5s ease-out 3;top:-3px;left:-3px;"></div>
          ${svg}
        </div>`
      : svg,
    className: 'coexist-cmap-pin',
    iconSize: [size, height],
    iconAnchor: [size / 2, height],
  })
}

/* ------------------------------------------------------------------ */
/*  VIC cluster icon                                                   */
/* ------------------------------------------------------------------ */

function createVicClusterIcon(count: number): L.DivIcon {
  return L.divIcon({
    html: `<div style="
      width:28px;height:28px;
      display:flex;align-items:center;justify-content:center;
      background:${PIN_COLOR};color:white;
      border-radius:50%;border:2px solid white;
      font-size:11px;font-weight:700;
      box-shadow:0 2px 6px rgba(0,0,0,0.15);
      cursor:pointer;
    ">${count}</div>`,
    className: 'coexist-cmap-pin',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

/* ------------------------------------------------------------------ */
/*  Injected styles                                                    */
/* ------------------------------------------------------------------ */

const STYLE_ID = 'coexist-collective-map-styles'

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .coexist-cmap-pin { background: none !important; border: none !important; }

    @keyframes coexist-map-ping {
      0% { transform: scale(0.8); opacity: 0.2; }
      100% { transform: scale(1.8); opacity: 0; }
    }

    .coexist-cmap .leaflet-control-zoom {
      border: none !important;
      border-radius: 12px !important;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08) !important;
    }
    .coexist-cmap .leaflet-control-zoom a {
      border-radius: 0 !important;
      width: 34px !important;
      height: 34px !important;
      line-height: 34px !important;
      font-size: 15px !important;
      color: #475569 !important;
      border-bottom: 1px solid #e2e8f0 !important;
      background: white !important;
    }
    .coexist-cmap .leaflet-control-zoom a:last-child { border-bottom: none !important; }
    .coexist-cmap .leaflet-control-zoom a:hover { background: #f8fafc !important; }
    .coexist-cmap .leaflet-control-attribution { display: none !important; }

    /* No tile layer - GeoJSON polygon only. White bg = ocean */
    .coexist-cmap,
    .coexist-cmap.leaflet-container {
      background: white !important;
    }
    /* GPU-accelerate the GeoJSON layer for smooth zoom */
    .coexist-cmap .leaflet-overlay-pane svg {
      will-change: transform;
    }

    /* Tooltip labels */
    .coexist-cmap-label {
      background: none !important;
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
      font-family: 'Montserrat', sans-serif !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      color: #334155 !important;
      white-space: nowrap !important;
      opacity: 0 !important;
      visibility: hidden !important;
      transition: opacity 0.25s ease, visibility 0.25s ease;
      pointer-events: none !important;
    }
    .coexist-cmap-label::before {
      display: none !important;
    }
    .coexist-cmap-labels-visible .coexist-cmap-label {
      opacity: 1 !important;
      visibility: visible !important;
    }

    /* Smooth grab cursor */
    .coexist-cmap.leaflet-container {
      cursor: grab !important;
    }
    .coexist-cmap.leaflet-container.leaflet-drag-target {
      cursor: grabbing !important;
    }
  `
  document.head.appendChild(style)
}

/* ------------------------------------------------------------------ */
/*  Australia GeoJSON boundary                                         */
/* ------------------------------------------------------------------ */

import australiaGeoJson from '@/assets/australia.geo.json'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const AUS_CENTER: L.LatLngExpression = [-28.5, 134.5]
const AUS_ZOOM = 3.25
const VIC_CENTER: L.LatLngExpression = [-38.05, 144.8]

const springSheet = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 36,
  mass: 0.8,
}

/* ------------------------------------------------------------------ */
/*  Date formatting helper                                             */
/* ------------------------------------------------------------------ */

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface CollectiveMapProps {
  className?: string
}

export function CollectiveMap({ className }: CollectiveMapProps) {
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const vicClusterRef = useRef<L.Marker | null>(null)
  const vicExpandedRef = useRef(false)

  const [selected, setSelected] = useState<MapCollective | null>(null)
  const [mapReady, setMapReady] = useState(false)

  // Fetch real data from DB
  const { data: dbCollectives } = useCollectiveMapData()
  const collectives = useMemo(
    () => (dbCollectives && dbCollectives.length > 0 ? dbCollectives : FALLBACK_COLLECTIVES),
    [dbCollectives],
  )

  // Detect VIC collectives dynamically
  const vicIds = useMemo(() => {
    const ids = new Set<string>()
    for (const c of collectives) {
      if (c.state === 'VIC') ids.add(c.id)
    }
    return ids
  }, [collectives])

  /* ---------- Init map ---------- */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    injectStyles()

    const ausBounds = L.latLngBounds(
      [-48, 100],
      [-5, 165],
    )

    const map = L.map(containerRef.current, {
      center: AUS_CENTER,
      zoom: AUS_ZOOM,
      zoomControl: true,
      attributionControl: false,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      // @ts-expect-error tap is valid Leaflet option
      tap: false,
      minZoom: 3,
      maxZoom: 14,
      maxBounds: ausBounds,
      maxBoundsViscosity: 0.7,
      // All interactions enabled from the start
      dragging: true,
      touchZoom: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      boxZoom: true,
      // Smooth zoom for 60fps feel
      wheelPxPerZoomLevel: 120,
      zoomAnimation: true,
      fadeAnimation: true,
      markerZoomAnimation: true,
      inertia: true,
      inertiaDeceleration: 2500,
      inertiaMaxSpeed: 1800,
    })

    map.zoomControl.setPosition('bottomright')

    // No tile layer - the GeoJSON polygon IS the map.
    // White/light background = ocean, olive polygon = land.

    // Draw Australia as an olive polygon
    L.geoJSON(australiaGeoJson as GeoJSON.FeatureCollection, {
      style: {
        fillColor: '#869e62',
        fillOpacity: 1,
        color: '#748b50',
        weight: 1.5,
        opacity: 0.6,
      },
      interactive: false,
    }).addTo(map)

    mapRef.current = map

    requestAnimationFrame(() => {
      map.invalidateSize()
      setMapReady(true)
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  /* ---------- Helpers for VIC cluster ---------- */
  const showVicCluster = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    vicIds.forEach((id) => {
      const m = markersRef.current.get(id)
      if (m) map.removeLayer(m)
    })

    if (!vicClusterRef.current) {
      const icon = createVicClusterIcon(vicIds.size)
      const marker = L.marker(VIC_CENTER, { icon })
      marker.on('click', () => {
        map.flyTo(VIC_CENTER, 8, {
          duration: shouldReduceMotion ? 0.3 : 0.8,
        })
      })
      vicClusterRef.current = marker
    }
    vicClusterRef.current.addTo(map)
    vicExpandedRef.current = false
  }, [shouldReduceMotion, vicIds])

  const showVicIndividual = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    if (vicClusterRef.current) {
      map.removeLayer(vicClusterRef.current)
    }

    vicIds.forEach((id) => {
      const m = markersRef.current.get(id)
      if (m && !map.hasLayer(m)) m.addTo(map)
    })
    vicExpandedRef.current = true
  }, [vicIds])

  /* ---------- Add markers ---------- */
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    // Clear old
    markersRef.current.forEach((m) => map.removeLayer(m))
    markersRef.current.clear()
    if (vicClusterRef.current) {
      map.removeLayer(vicClusterRef.current)
      vicClusterRef.current = null
    }

    for (const c of collectives) {
      const icon = createCollectiveIcon(false)
      const marker = L.marker([c.lat, c.lng], { icon })

      marker.bindTooltip(shortName(c), {
        permanent: true,
        direction: 'right',
        offset: [12, -14],
        className: 'coexist-cmap-label',
      })

      marker.on('click', () => {
        setSelected(c)
        map.flyTo([c.lat, c.lng], 10, {
          duration: shouldReduceMotion ? 0.3 : 1.0,
          easeLinearity: 0.4,
        })
        markersRef.current.forEach((m, id) => {
          m.setIcon(createCollectiveIcon(id === c.id))
        })
      })

      markersRef.current.set(c.id, marker)

      if (!vicIds.has(c.id)) {
        marker.addTo(map)
      }
    }

    // Start with VIC clustered (only if there are VIC collectives)
    if (vicIds.size > 1) {
      showVicCluster()
    } else {
      // Show all individually if 0 or 1 VIC collective
      vicIds.forEach((id) => {
        const m = markersRef.current.get(id)
        if (m) m.addTo(map)
      })
    }

    // Toggle labels + VIC cluster based on zoom
    const LABEL_ZOOM = 5
    const updateLabelsAndCluster = () => {
      const z = map.getZoom()

      if (vicIds.size > 1) {
        if (z >= 7 && !vicExpandedRef.current) {
          showVicIndividual()
        } else if (z < 7 && vicExpandedRef.current) {
          showVicCluster()
        }
      }

      const container = map.getContainer()
      if (z >= LABEL_ZOOM) {
        container.classList.add('coexist-cmap-labels-visible')
      } else {
        container.classList.remove('coexist-cmap-labels-visible')
      }
    }
    map.on('zoomend', updateLabelsAndCluster)
    updateLabelsAndCluster()

    return () => {
      map.off('zoomend', updateLabelsAndCluster)
    }
  }, [mapReady, collectives, shouldReduceMotion, showVicCluster, showVicIndividual, vicIds])

  /* ---------- Close card ---------- */
  const handleClose = useCallback(() => {
    setSelected(null)
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach((m) => {
      m.setIcon(createCollectiveIcon(false))
    })

    map.flyTo(AUS_CENTER, AUS_ZOOM, {
      duration: shouldReduceMotion ? 0.3 : 0.8,
    })
  }, [shouldReduceMotion])

  /* ---------- Tap map to deselect ---------- */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const handler = () => { if (selected) handleClose() }
    map.on('click', handler)
    return () => { map.off('click', handler) }
  }, [selected, handleClose])

  /* ---------- Select from chip ---------- */
  const selectCollective = useCallback((c: MapCollective) => {
    setSelected(c)
    const map = mapRef.current
    if (!map) return

    if (vicIds.has(c.id) && !vicExpandedRef.current) {
      showVicIndividual()
    }

    map.flyTo([c.lat, c.lng], 10, {
      duration: shouldReduceMotion ? 0.3 : 1.0,
      easeLinearity: 0.4,
    })
    markersRef.current.forEach((m, id) => {
      m.setIcon(createCollectiveIcon(id === c.id))
    })
  }, [shouldReduceMotion, showVicIndividual, vicIds])

  return (
    <div className={cn('relative overflow-hidden rounded-2xl', className)}>
      {/* Map container */}
      <div
        ref={containerRef}
        className="coexist-cmap w-full h-full"
        style={{ zIndex: 0 }}
      />

      {/* Loading */}
      <AnimatePresence>
        {!mapReady && (
          <motion.div
            className="absolute inset-0 z-[400] flex items-center justify-center bg-white"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="h-8 w-8 rounded-full border-2 border-primary-200 border-t-primary-500 animate-spin" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top-left badge */}
      <div className="absolute top-3 left-3 z-[500]">
        <div className="flex items-center gap-2 rounded-xl bg-white/90 backdrop-blur-sm px-3 py-2 shadow-sm">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-400">
            <TreePine size={12} className="text-white" />
          </div>
          <span className="text-xs font-semibold text-secondary-700">
            {collectives.length} Collectives
          </span>
        </div>
      </div>

      {/* Selected collective card - with hero image */}
      <AnimatePresence mode="wait">
        {selected && (
          <motion.div
            key={selected.id}
            className="absolute bottom-3 left-3 right-3 top-3 z-[500] flex flex-col justify-end pointer-events-none"
            initial={{ y: '110%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '110%', opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0.12 } : springSheet}
          >
            <div className="overflow-hidden rounded-2xl bg-white shadow-lg shadow-black/8 pointer-events-auto max-h-full flex flex-col">
              {/* Hero image - full bleed, shrinks to fit container */}
              {selected.cover_image_url ? (
                <div className="relative w-full overflow-hidden shrink min-h-0" style={{ aspectRatio: '16 / 8' }}>
                  <img
                    src={selected.cover_image_url}
                    alt={selected.name}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="eager"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
                  {/* Name overlay on image */}
                  <div className="absolute bottom-0 left-0 right-0 p-3 pb-2.5">
                    <h4 className="text-[15px] font-bold text-white leading-snug drop-shadow-sm">
                      {selected.name}
                    </h4>
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/80">
                      <MapPin size={10} />
                      <span>{[selected.region, selected.state].filter(Boolean).join(', ')}</span>
                    </div>
                  </div>
                  {/* Close button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleClose() }}
                    className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm text-white active:scale-[0.90] transition-transform duration-150 cursor-pointer"
                    aria-label="Close"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  {/* Green accent when no image */}
                  <div className="h-1 bg-gradient-to-r from-primary-300 via-primary-400 to-primary-300" />
                </>
              )}

              <div className={cn('p-3 shrink-0', !selected.cover_image_url && 'pt-3')}>
                {/* Name + close (only when no hero image) */}
                {!selected.cover_image_url && (
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-[15px] font-bold text-secondary-800 leading-snug">
                        {selected.name}
                      </h4>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-secondary-400">
                        <Navigation size={11} />
                        <span>{[selected.region, selected.state].filter(Boolean).join(', ')}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleClose() }}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-200/60 text-secondary-400 active:scale-[0.90] transition-transform duration-150 cursor-pointer"
                      aria-label="Close"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                <p className="text-xs leading-relaxed text-secondary-500 line-clamp-2">
                  {selected.description}
                </p>

                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-xs shrink-0">
                      <Users size={13} className="text-primary-500" />
                      <span className="font-semibold text-secondary-700">{selected.member_count ?? 0}</span>
                    </div>
                    {selected.nextEvent && (
                      <div className="flex items-center gap-1 text-xs text-secondary-400 min-w-0">
                        <Calendar size={12} className="text-primary-500 shrink-0" />
                        <span className="truncate">
                          {formatShortDate(selected.nextEvent.date_start)} &middot; {selected.nextEvent.title}
                        </span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => navigate(`/collectives/${selected.slug}`)}
                    className={cn(
                      'flex items-center gap-1.5 shrink-0',
                      'rounded-xl bg-primary-400 px-3.5 py-2',
                      'text-xs font-semibold text-white',
                      'active:scale-[0.97] transition-transform duration-150',
                    )}
                  >
                    View
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scrollable mini-cards with hero thumbnails */}
      <AnimatePresence>
        {!selected && mapReady && (
          <motion.div
            className="absolute bottom-3 left-0 right-0 z-[500] px-3"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
              {collectives.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectCollective(c)}
                  className={cn(
                    'shrink-0 w-[120px] overflow-hidden p-0',
                    'rounded-xl bg-white/90 backdrop-blur-sm shadow-sm',
                    'text-left leading-none',
                    'active:scale-[0.97] transition-transform duration-150',
                  )}
                >
                  {c.cover_image_url ? (
                    <img
                      src={c.cover_image_url}
                      alt=""
                      className="block h-16 w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-16 w-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center">
                      <TreePine size={18} className="text-neutral-400" />
                    </div>
                  )}
                  <div className="px-2 py-1.5">
                    <span className="text-[11px] font-semibold text-secondary-700 leading-tight line-clamp-1 block">
                      {shortName(c)}
                    </span>
                    {c.member_count != null && (
                      <span className="text-[10px] text-secondary-400 flex items-center gap-0.5 mt-0.5">
                        <Users size={9} />
                        {c.member_count}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
