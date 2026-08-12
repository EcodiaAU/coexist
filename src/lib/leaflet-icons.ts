import L from 'leaflet'

/**
 * Creates a Leaflet DivIcon using the Co-Exist branded map pin.
 * A FLAT teardrop in the Co-Exist olive/sage brand green with a white ring +
 * darker brand dot (Tate 2026-08-12: the gradient moss-green pin was off-brand;
 * pins must be the actual olive/sage and flat coloured). Variant only shifts
 * the fill: event + default are olive/sage, collective an earthy olive-tan so
 * the two pin families stay distinguishable on one map.
 */
type PinVariant = 'default' | 'event' | 'collective'

/** fill = flat teardrop colour; dot = darker centre so the white ring reads. */
const VARIANT_COLORS: Record<PinVariant, { fill: string; dot: string }> = {
  default:    { fill: '#869e62', dot: '#4a5c34' }, // olive/sage (Co-Exist brand --color-brand)
  event:      { fill: '#869e62', dot: '#4a5c34' }, // olive/sage (Co-Exist brand)
  collective: { fill: '#a68a5b', dot: '#5c4a2e' }, // earthy olive-tan
}

/** Deterministic id fragment so multiple pins on a page get unique filter refs. */
function uid(color: string): string {
  return color.replace(/[^a-z0-9]/gi, '')
}

function pinSvg(fill: string, dot: string): string {
  const id = uid(fill)
  return `<svg width="38" height="50" viewBox="0 0 38 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="ps${id}" x="-40%" y="-15%" width="180%" height="150%">
        <feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#2d3220" flood-opacity="0.35"/>
      </filter>
    </defs>
    <path filter="url(#ps${id})" d="M19 1C9.06 1 1 9.06 1 19c0 12.4 15.9 28.6 16.6 29.3a2 2 0 0 0 2.8 0C21.1 47.6 37 31.4 37 19 37 9.06 28.94 1 19 1Z" fill="${fill}"/>
    <circle cx="19" cy="18" r="7" fill="white"/>
    <circle cx="19" cy="18" r="3.1" fill="${dot}"/>
  </svg>`
}

export function createPinIcon(variant: PinVariant = 'default'): L.DivIcon {
  const { fill, dot } = VARIANT_COLORS[variant]
  return L.divIcon({
    html: pinSvg(fill, dot),
    className: 'coexist-map-pin',
    iconSize: [38, 50],
    iconAnchor: [19, 50],
    popupAnchor: [0, -50],
  })
}

/** Cluster icon: a flat olive/sage bubble with a soft white ring + halo,
 *  matching the flat brand pins so a cluster reads as "several of these pins". */
export function createClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount()
  const size = count < 10 ? 42 : count < 50 ? 50 : 58
  return L.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;
      display:flex;align-items:center;justify-content:center;
      background:#869e62;
      color:white;border-radius:50%;
      border:3px solid rgba(255,255,255,0.95);
      font-size:${count < 10 ? 15 : 13}px;font-weight:700;letter-spacing:-0.02em;
      box-shadow:0 3px 10px rgba(45,50,32,0.32), 0 0 0 6px rgba(134,158,98,0.20);
    ">${count}</div>`,
    className: 'coexist-cluster-icon',
    iconSize: [size, size],
  })
}
