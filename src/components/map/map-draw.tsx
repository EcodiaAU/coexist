import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet-draw'

// leaflet-draw 1.0.4 ships L.GeometryUtil.readableArea with a missing `var`
// on the `type` local (`type = typeof isMetric`). Under ES-module strict mode
// (which Vite enforces in production bundles + Android WebView strict eval)
// the implicit global throws `ReferenceError: type is not defined` mid-drag,
// killing every touchmove on the polygon/circle/rectangle tools so the user
// can never finish drawing a shape. Override with a strict-safe copy of the
// same function. Upstream: https://github.com/Leaflet/Leaflet.draw/issues/1129
;(L as unknown as {
  GeometryUtil: { readableArea: (area: number, isMetric: unknown, precision?: Record<string, number>) => string }
}).GeometryUtil.readableArea = function readableArea(area, isMetric, precision) {
  const defaultPrecision = { km: 2, ha: 2, m: 0, mi: 2, ac: 2, yd: 0, ft: 0, nm: 2 }
  const p = { ...defaultPrecision, ...(precision || {}) }
  const Lg = (L as unknown as { GeometryUtil: { formattedNumber: (n: number, digits: number) => string } }).GeometryUtil
  let areaStr: string
  if (isMetric) {
    let units: string[] = ['ha', 'm']
    const t = typeof isMetric
    if (t === 'string') units = [isMetric as string]
    else if (t !== 'boolean' && Array.isArray(isMetric)) units = isMetric as string[]
    if (area >= 1_000_000 && units.indexOf('km') !== -1) areaStr = Lg.formattedNumber(area * 0.000001, p.km) + ' km²'
    else if (area >= 10_000 && units.indexOf('ha') !== -1) areaStr = Lg.formattedNumber(area * 0.0001, p.ha) + ' ha'
    else areaStr = Lg.formattedNumber(area, p.m) + ' m²'
  } else {
    const a = area / 0.836127
    if (a >= 3_097_600) areaStr = Lg.formattedNumber(a / 3_097_600, p.mi) + ' mi²'
    else if (a >= 4_840) areaStr = Lg.formattedNumber(a / 4_840, p.ac) + ' acres'
    else areaStr = Lg.formattedNumber(a, p.yd) + ' yd²'
  }
  return areaStr
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AreaGeoJSON {
  type: 'Feature'
  geometry: {
    type: 'Polygon' | 'Circle'
    coordinates: number[][] | number[][][]
  }
  properties: { radius?: number }
}

/* ------------------------------------------------------------------ */
/*  Injected styles                                                    */
/* ------------------------------------------------------------------ */

const STYLE_ID = 'coexist-draw-overrides'

function injectDrawStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .leaflet-draw-toolbar a { border-radius: 6px !important; }
    .leaflet-draw-actions a { border-radius: 4px !important; }
  `
  document.head.appendChild(style)
}

/* ------------------------------------------------------------------ */
/*  Draw overlay hook                                                  */
/* ------------------------------------------------------------------ */

interface UseMapDrawOptions {
  map: L.Map | null
  onAreaChange?: (area: AreaGeoJSON | null) => void
}

export function useMapDraw({ map, onAreaChange }: UseMapDrawOptions) {
  const onAreaChangeRef = useRef(onAreaChange)
  onAreaChangeRef.current = onAreaChange
  const controlRef = useRef<L.Control.Draw | null>(null)
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null)

  useEffect(() => {
    if (!map) return
    const m = map

    let destroyed = false

    function setup() {
      if (destroyed) return
      injectDrawStyles()

      const drawnItems = new L.FeatureGroup()
      m.addLayer(drawnItems)
      drawnItemsRef.current = drawnItems

      const drawControl = new L.Control.Draw({
        position: 'topright',
        draw: {
          polygon: {
            allowIntersection: false,
            showArea: true,
            shapeOptions: { color: '#4a7c59', fillColor: '#4a7c59', fillOpacity: 0.15, weight: 2 },
          },
          circle: {
            shapeOptions: { color: '#4a7c59', fillColor: '#4a7c59', fillOpacity: 0.15, weight: 2 },
          },
          rectangle: {
            shapeOptions: { color: '#4a7c59', fillColor: '#4a7c59', fillOpacity: 0.15, weight: 2 },
          },
          polyline: false,
          marker: false,
          circlemarker: false,
        },
        edit: {
          featureGroup: drawnItems,
          remove: true,
        },
      })

      m.addControl(drawControl)
      controlRef.current = drawControl

      function emitArea() {
        const layers = drawnItems.getLayers()
        if (layers.length === 0) {
          onAreaChangeRef.current?.(null)
          return
        }

        const last = layers[layers.length - 1]
        const geoJSON = (last as L.Polygon | L.Circle).toGeoJSON() as AreaGeoJSON

        if (last instanceof L.Circle) {
          geoJSON.properties = { radius: last.getRadius() }
        }

        onAreaChangeRef.current?.(geoJSON)
      }

      m.on(L.Draw.Event.CREATED, ((e: L.DrawEvents.Created) => {
        drawnItems.clearLayers()
        drawnItems.addLayer(e.layer)
        emitArea()
      }) as unknown as L.LeafletEventHandlerFn)

      m.on(L.Draw.Event.EDITED, () => emitArea())
      m.on(L.Draw.Event.DELETED, () => emitArea())
    }

    // _controlCorners is set by Leaflet during initControls, which runs as part of
    // map initialisation. If it's missing the map isn't ready yet - wait for 'load'.
    if ((m as unknown as { _controlCorners?: unknown })._controlCorners) {
      setup()
    } else {
      m.once('load', setup)
    }

    return () => {
      destroyed = true
      m.off('load', setup)
      m.off(L.Draw.Event.CREATED)
      m.off(L.Draw.Event.EDITED)
      m.off(L.Draw.Event.DELETED)
      if (controlRef.current) {
        m.removeControl(controlRef.current)
        controlRef.current = null
      }
      if (drawnItemsRef.current) {
        m.removeLayer(drawnItemsRef.current)
        drawnItemsRef.current = null
      }
    }
  }, [map])
}
