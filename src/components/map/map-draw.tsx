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
    .coexist-trace-btn {
      display: flex; align-items: center; justify-content: center;
      width: 30px; height: 30px; background: #fff; color: #4a7c59;
      cursor: pointer;
    }
    .coexist-trace-btn.trace-active { background: #4a7c59; color: #fff; }
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
  const freehandCleanupRef = useRef<(() => void) | null>(null)

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

      /* ---- Freehand "Trace" tool (Brendon, Co-Exist meeting 2026-07-27) ----
         leaflet-draw only lets you place vertices / drag a circle-rectangle;
         tracing an irregular worked / cleaned / planted boundary by finger is
         far easier than tapping each vertex. This adds a Trace toggle beside the
         draw toolbar that lets the user drag a freehand outline, then emits the
         SAME AreaGeoJSON Polygon through emitArea - so storage, the live m2/ha
         readout, and the strict-mode readableArea patch above all apply
         unchanged. While tracing, map panning is disabled so a one-finger drag
         draws instead of moving the map. */
      const container = m.getContainer()
      let tracing = false
      let tracePoints: L.LatLng[] = []
      let tracePolyline: L.Polyline | null = null
      let traceBtn: HTMLAnchorElement | null = null

      const clientXY = (ev: Event): { clientX: number; clientY: number } | null => {
        const te = ev as TouchEvent
        if (te.touches && te.touches.length) return { clientX: te.touches[0].clientX, clientY: te.touches[0].clientY }
        const ce = ev as TouchEvent
        if (ce.changedTouches && ce.changedTouches.length) return { clientX: ce.changedTouches[0].clientX, clientY: ce.changedTouches[0].clientY }
        const me = ev as MouseEvent
        if (typeof me.clientX === 'number') return { clientX: me.clientX, clientY: me.clientY }
        return null
      }

      const latLngFromEvent = (ev: Event): L.LatLng | null => {
        const pt = clientXY(ev)
        if (!pt) return null
        const rect = container.getBoundingClientRect()
        return m.containerPointToLatLng(L.point(pt.clientX - rect.left, pt.clientY - rect.top))
      }

      const setTracing = (on: boolean) => {
        tracing = on
        if (on) {
          m.dragging.disable()
          m.doubleClickZoom.disable()
          container.style.cursor = 'crosshair'
          traceBtn?.classList.add('trace-active')
        } else {
          m.dragging.enable()
          m.doubleClickZoom.enable()
          container.style.cursor = ''
          traceBtn?.classList.remove('trace-active')
        }
      }

      const traceStart = (ev: Event) => {
        if (!tracing) return
        ev.preventDefault()
        const ll = latLngFromEvent(ev)
        if (!ll) return
        tracePoints = [ll]
        tracePolyline = L.polyline(tracePoints, { color: '#4a7c59', weight: 3 }).addTo(m)
      }

      const traceMove = (ev: Event) => {
        if (!tracing || !tracePolyline) return
        ev.preventDefault()
        const ll = latLngFromEvent(ev)
        if (!ll) return
        const last = tracePoints[tracePoints.length - 1]
        // Simplify: skip points within ~8px of the previous one so the ring
        // stays light and the stored geometry is not thousands of vertices.
        if (last && m.latLngToContainerPoint(last).distanceTo(m.latLngToContainerPoint(ll)) < 8) return
        tracePoints.push(ll)
        tracePolyline.setLatLngs(tracePoints)
      }

      const traceEnd = (ev: Event) => {
        if (!tracing) return
        ev.preventDefault()
        if (tracePolyline) { m.removeLayer(tracePolyline); tracePolyline = null }
        if (tracePoints.length >= 3) {
          const poly = L.polygon(tracePoints, { color: '#4a7c59', fillColor: '#4a7c59', fillOpacity: 0.15, weight: 2 })
          drawnItems.clearLayers()
          drawnItems.addLayer(poly)
          emitArea()
        }
        tracePoints = []
        setTracing(false)
      }

      container.addEventListener('mousedown', traceStart)
      container.addEventListener('mousemove', traceMove)
      container.addEventListener('mouseup', traceEnd)
      container.addEventListener('touchstart', traceStart, { passive: false })
      container.addEventListener('touchmove', traceMove, { passive: false })
      container.addEventListener('touchend', traceEnd)

      const TraceControl = L.Control.extend({
        options: { position: 'topright' },
        onAdd() {
          const wrap = L.DomUtil.create('div', 'leaflet-bar leaflet-control')
          const btn = L.DomUtil.create('a', 'coexist-trace-btn', wrap) as HTMLAnchorElement
          btn.href = '#'
          btn.title = 'Trace area by finger'
          btn.setAttribute('role', 'button')
          btn.setAttribute('aria-label', 'Trace area by finger')
          btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>'
          traceBtn = btn
          L.DomEvent.on(btn, 'click', (e: Event) => {
            L.DomEvent.stop(e)
            setTracing(!tracing)
          })
          return wrap
        },
      })
      const traceControl = new TraceControl()
      m.addControl(traceControl)

      freehandCleanupRef.current = () => {
        setTracing(false)
        container.removeEventListener('mousedown', traceStart)
        container.removeEventListener('mousemove', traceMove)
        container.removeEventListener('mouseup', traceEnd)
        container.removeEventListener('touchstart', traceStart)
        container.removeEventListener('touchmove', traceMove)
        container.removeEventListener('touchend', traceEnd)
        if (tracePolyline) { m.removeLayer(tracePolyline); tracePolyline = null }
        m.removeControl(traceControl)
      }
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
      if (freehandCleanupRef.current) {
        freehandCleanupRef.current()
        freehandCleanupRef.current = null
      }
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
