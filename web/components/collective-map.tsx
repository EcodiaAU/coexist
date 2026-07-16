'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import australiaGeoJson from '@/lib/australia.geo.json'
import type { CollectiveVM } from '@/lib/queries'

/** City-centre coords by collective slug (ported from the app's collective map). */
const SLUG_COORDS: Record<string, [number, number]> = {
  perth: [-31.9505, 115.8605],
  adelaide: [-34.9285, 138.6007],
  geelong: [-38.1499, 144.3617],
  'mornington-peninsula': [-38.2833, 145.1667],
  'melbourne-city': [-37.8136, 144.9631],
  melbourne: [-37.8136, 144.9631],
  'north-east-victoria': [-36.36, 146.32],
  hobart: [-42.8821, 147.3272],
  sydney: [-33.8688, 151.2093],
  'northern-rivers': [-28.8131, 153.276],
  tamworth: [-31.0833, 150.9167],
  'gold-coast': [-28.0167, 153.4],
  brisbane: [-27.4698, 153.0251],
  'sunshine-coast': [-26.65, 153.0667],
  townsville: [-19.259, 146.8169],
  cairns: [-16.9186, 145.7781],
}

// Tighter center + zoom: removes dead ocean to the west/east
const AUS_CENTER: L.LatLngExpression = [-27.5, 134.0]
const AUS_ZOOM = 4.0
const PIN = '#2d3220'
const PIN_ACTIVE = '#475c34'

function icon(active = false): L.DivIcon {
  const s = active ? 30 : 22
  const h = active ? 38 : 28
  const color = active ? PIN_ACTIVE : PIN
  const svg = `<svg width="${s}" height="${h}" viewBox="0 0 36 46" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 0C8.06 0 0 8.06 0 18c0 12.6 16.2 26.4 17.1 27.15a1.5 1.5 0 0 0 1.8 0C19.8 44.4 36 30.6 36 18 36 8.06 27.94 0 18 0Z" fill="${color}"/><circle cx="18" cy="17" r="9" fill="#f4f3ec"/><circle cx="18" cy="17" r="4" fill="${color}"/></svg>`
  return L.divIcon({ html: svg, className: 'cx-pin', iconSize: [s, h], iconAnchor: [s / 2, h] })
}

const STYLE_ID = 'cx-collective-map-styles'
function injectStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const s = document.createElement('style')
  s.id = STYLE_ID
  // Map water/bg matches canvas cream #f4f3ec so it dissolves into the page.
  // Zoom controls and count pill use flat squared brand idiom: no shadows, olive hairline, cream fill.
  s.textContent = `
    .cx-pin{background:none!important;border:none!important}
    .cx-cmap,.cx-cmap.leaflet-container{background:#f4f3ec!important;cursor:grab}
    .cx-cmap .leaflet-control-attribution{display:none!important}
    .cx-cmap .leaflet-control-zoom{border:1px solid #474f2f!important;border-radius:0!important;overflow:hidden;box-shadow:none!important}
    .cx-cmap .leaflet-control-zoom a{width:32px!important;height:32px!important;line-height:32px!important;color:#2d3220!important;background:#f4f3ec!important;border-bottom:1px solid #474f2f!important;border-radius:0!important;box-shadow:none!important;font-size:16px!important}
    .cx-cmap .leaflet-control-zoom a:last-child{border-bottom:none!important}
    .cx-cmap .leaflet-control-zoom a:hover{background:#e5eec1!important}
    .cx-cmap-label{background:none!important;border:none!important;box-shadow:none!important;font-family:var(--font-body),sans-serif!important;font-size:11px!important;font-weight:600!important;color:#2d3220!important;white-space:nowrap!important}
    .cx-cmap-label::before{display:none!important}
  `
  document.head.appendChild(s)
}

export function CollectiveMap({ collectives, className = '' }: { collectives: CollectiveVM[]; className?: string }) {
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const [selected, setSelected] = useState<CollectiveVM | null>(null)

  const pinned = useMemo(
    () => collectives.map((c) => ({ c, pos: SLUG_COORDS[c.slug] })).filter((x) => x.pos),
    [collectives],
  )

  useEffect(() => {
    if (!ref.current || mapRef.current) return
    injectStyles()
    const map = L.map(ref.current, {
      center: AUS_CENTER,
      zoom: AUS_ZOOM,
      zoomControl: true,
      attributionControl: false,
      zoomSnap: 0.25,
      minZoom: 3.5,
      maxZoom: 12,
      scrollWheelZoom: false,
      // Tighter maxBounds: clips dead ocean, keeps all Australian land masses
      maxBounds: L.latLngBounds([-45, 110], [-9, 155]),
      maxBoundsViscosity: 0.85,
    })
    map.zoomControl.setPosition('bottomright')
    L.geoJSON(australiaGeoJson as GeoJSON.FeatureCollection, {
      style: { fillColor: '#aeb98a', fillOpacity: 1, color: '#869e62', weight: 1.5, opacity: 0.7 },
      interactive: false,
    }).addTo(map)

    for (const { c, pos } of pinned) {
      const m = L.marker(pos as L.LatLngExpression, { icon: icon(false) })
      // Hover/active tooltips only (permanent: false)
      m.bindTooltip(c.name, { permanent: false, direction: 'right', offset: [10, -12], className: 'cx-cmap-label' })
      m.on('click', () => { setSelected(c); map.flyTo(pos as L.LatLngExpression, 8, { duration: 0.9 }) })
      m.addTo(map)
    }
    mapRef.current = map
    requestAnimationFrame(() => map.invalidateSize())
    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div data-eos-id="web/components/collective-map.tsx#0" data-eos-v="2" className={`relative isolate overflow-hidden ${className}`}>
      <div data-eos-id="web/components/collective-map.tsx#1" ref={ref} className="cx-cmap h-full w-full" style={{ zIndex: 0 }} />

      {/* Grain overlay over the map container */}
      <div data-eos-id="web/components/collective-map.tsx#2" className="grain-layer pointer-events-none absolute inset-0" style={{ zIndex: 1 }} />

      {/* Count pill: flat squared, olive hairline, cream fill, no shadow */}
      <div data-eos-id="web/components/collective-map.tsx#3" className="absolute left-4 top-4 z-[500] border border-olive-700 bg-cream px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-olive-800">
        {collectives.length} collectives across Australia
      </div>

      {/* Selected card: flat, squared, olive hairline, cream fill, no shadow, no rounded */}
      {selected && (
        <div data-eos-id="web/components/collective-map.tsx#4" className="absolute inset-x-4 bottom-4 z-[500] overflow-hidden border border-olive-700 bg-cream">
          <div data-eos-id="web/components/collective-map.tsx#5" className="flex items-stretch">
            {selected.cover_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img data-eos-src="dynamic" data-eos-src-label="Cover image url" data-eos-id="web/components/collective-map.tsx#6" src={selected.cover_image_url} alt={selected.name} className="hidden h-auto w-40 shrink-0 object-cover sm:block" />
            )}
            <div data-eos-id="web/components/collective-map.tsx#7" className="flex-1 p-5">
              <div data-eos-id="web/components/collective-map.tsx#8" className="flex items-start justify-between">
                <div data-eos-id="web/components/collective-map.tsx#9">
                  <h3 data-eos-id="web/components/collective-map.tsx#10" data-eos-var="selected.name" data-eos-var-label="Name" data-eos-var-scope="prop" className="text-xl tracking-[-0.02em] text-neutral-900">{selected.name}</h3>
                  {selected.state && <p data-eos-id="web/components/collective-map.tsx#11" data-eos-var="selected.state" data-eos-var-label="State" data-eos-var-scope="prop" className="mt-0.5 text-xs uppercase tracking-[0.1em] text-neutral-500">{selected.state}</p>}
                </div>
                <button data-eos-id="web/components/collective-map.tsx#12" onClick={() => setSelected(null)} aria-label="Close" className="text-neutral-400 hover:text-neutral-700">✕</button>
              </div>
              {selected.description && <p data-eos-id="web/components/collective-map.tsx#13" data-eos-var="selected.description" data-eos-var-label="Description" data-eos-var-scope="prop" className="mt-2 line-clamp-2 text-sm text-neutral-500">{selected.description}</p>}
              <button data-eos-id="web/components/collective-map.tsx#14"
                onClick={() => router.push(`/collectives/${selected.slug}`)}
                className="mt-4 border border-olive-700 bg-olive-700 px-6 py-2.5 text-[12px] font-semibold uppercase tracking-wider text-oncream hover:bg-olive-800"
              >
                View collective
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
