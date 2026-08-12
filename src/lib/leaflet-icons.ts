import L from 'leaflet'

/**
 * Creates a Leaflet DivIcon using the Co-Exist branded map pin.
 * A soft-gradient teardrop with a white ring, brand dot and drop shadow -
 * greener + brighter than the old flat pin (Kurt 2026-08-12). Variant only
 * shifts the hue; event + default are the Co-Exist moss green, collective an
 * earthy amber so the two pin families stay distinguishable on one map.
 */
type PinVariant = 'default' | 'event' | 'collective'

/** base = deep fill (bottom of gradient + centre dot), light = top of gradient. */
const VARIANT_COLORS: Record<PinVariant, { base: string; light: string }> = {
  default:    { base: '#2f7646', light: '#52a86e' }, // moss green
  event:      { base: '#2f7646', light: '#52a86e' }, // moss green (Co-Exist brand)
  collective: { base: '#8b6f47', light: '#b0895a' }, // earthy amber
}

/** Deterministic id fragment so multiple pins on a page get unique gradient/filter refs. */
function uid(color: string): string {
  return color.replace(/[^a-z0-9]/gi, '')
}

function pinSvg(base: string, light: string): string {
  const id = uid(base)
  return `<svg width="38" height="50" viewBox="0 0 38 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="pg${id}" x1="19" y1="1" x2="19" y2="37" gradientUnits="userSpaceOnUse">
        <stop stop-color="${light}"/>
        <stop offset="1" stop-color="${base}"/>
      </linearGradient>
      <filter id="ps${id}" x="-40%" y="-15%" width="180%" height="150%">
        <feDropShadow dx="0" dy="2" stdDeviation="2.4" flood-color="#0b3a1e" flood-opacity="0.4"/>
      </filter>
    </defs>
    <path filter="url(#ps${id})" d="M19 1C9.06 1 1 9.06 1 19c0 12.4 15.9 28.6 16.6 29.3a2 2 0 0 0 2.8 0C21.1 47.6 37 31.4 37 19 37 9.06 28.94 1 19 1Z" fill="url(#pg${id})"/>
    <circle cx="19" cy="18" r="7" fill="white"/>
    <circle cx="19" cy="18" r="3.1" fill="${base}"/>
  </svg>`
}

export function createPinIcon(variant: PinVariant = 'default'): L.DivIcon {
  const { base, light } = VARIANT_COLORS[variant]
  return L.divIcon({
    html: pinSvg(base, light),
    className: 'coexist-map-pin',
    iconSize: [38, 50],
    iconAnchor: [19, 50],
    popupAnchor: [0, -50],
  })
}

/** Cluster icon: a bright moss-green bubble with a soft ring + halo, matching
 *  the pin gradient so a cluster reads as "several of these pins". */
export function createClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount()
  const size = count < 10 ? 42 : count < 50 ? 50 : 58
  return L.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;
      display:flex;align-items:center;justify-content:center;
      background:radial-gradient(circle at 35% 30%, #52a86e, #2f7646 78%);
      color:white;border-radius:50%;
      border:3px solid rgba(255,255,255,0.95);
      font-size:${count < 10 ? 15 : 13}px;font-weight:700;letter-spacing:-0.02em;
      box-shadow:0 3px 10px rgba(11,58,30,0.35), 0 0 0 6px rgba(82,168,110,0.18);
    ">${count}</div>`,
    className: 'coexist-cluster-icon',
    iconSize: [size, size],
  })
}
