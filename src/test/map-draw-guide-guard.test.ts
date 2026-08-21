import { describe, it, expect, vi } from 'vitest'
import L from 'leaflet'
// Importing the overlay module installs its strict-safe leaflet-draw patches
// (readableArea + the COEXIST-Y _updateGuide guard) as a top-level side effect.
import '@/components/map/map-draw'

/* Regression cover for Sentry COEXIST-Y (7661723303):
   "TypeError: undefined is not an object (evaluating 'e.lat')" thrown from
   leaflet's project() via L.Draw.Polyline._updateGuide -> latLngToLayerPoint on
   an iOS webview. Root cause: _updateGuide projected this._currentLatLng, which
   is only set on mousemove, so on touch it was undefined when _onZoomEnd fired
   mid-draw. The override in map-draw.tsx must bail instead of projecting the
   undefined endpoint. */

interface GuideCtx {
  _markers: Array<{ getLatLng?: () => L.LatLng | undefined }> | null
  _currentLatLng?: L.LatLng
  _map: { latLngToLayerPoint: (ll: L.LatLng | undefined) => L.Point }
  _clearGuides: () => void
  _drawGuide: (a: L.Point, b: L.Point) => void
}

type UpdateGuide = (this: GuideCtx, newPos?: L.Point) => void

const updateGuide = (
  L as unknown as { Draw: { Polyline: { prototype: { _updateGuide: UpdateGuide } } } }
).Draw.Polyline.prototype._updateGuide

function makeCtx(overrides: Partial<GuideCtx> = {}): GuideCtx {
  return {
    _markers: [{ getLatLng: () => L.latLng(-28.6, 153.0) }],
    _map: {
      // Faithful to leaflet: project() dereferences ll.lat, so an undefined
      // latlng throws exactly the COEXIST-Y TypeError. If the guard works this
      // is never reached with undefined.
      latLngToLayerPoint: vi.fn((ll: L.LatLng | undefined) => {
        if (!ll) throw new TypeError("undefined is not an object (evaluating 'e.lat')")
        return L.point(1, 1)
      }),
    },
    _clearGuides: vi.fn(),
    _drawGuide: vi.fn(),
    _currentLatLng: undefined,
    ...overrides,
  }
}

describe('COEXIST-Y leaflet-draw _updateGuide guard', () => {
  it('is installed as a function by importing the overlay module', () => {
    expect(typeof updateGuide).toBe('function')
  })

  it('no-ops (no throw, no guide) when _currentLatLng is undefined and no newPos - the touch zoomend crash path', () => {
    const ctx = makeCtx({ _currentLatLng: undefined })
    expect(() => updateGuide.call(ctx)).not.toThrow()
    expect(ctx._drawGuide).not.toHaveBeenCalled()
    expect(ctx._map.latLngToLayerPoint).not.toHaveBeenCalledWith(undefined)
  })

  it('no-ops when the anchor vertex has no latlng', () => {
    const ctx = makeCtx({
      _markers: [{ getLatLng: () => undefined }],
      _currentLatLng: L.latLng(-28.6, 153.0),
    })
    expect(() => updateGuide.call(ctx)).not.toThrow()
    expect(ctx._drawGuide).not.toHaveBeenCalled()
  })

  it('no-ops when there are no markers yet', () => {
    const ctx = makeCtx({ _markers: [], _currentLatLng: L.latLng(-28.6, 153.0) })
    expect(() => updateGuide.call(ctx)).not.toThrow()
    expect(ctx._drawGuide).not.toHaveBeenCalled()
  })

  it('draws the guide when pointer state is valid (positive control)', () => {
    const ctx = makeCtx({ _currentLatLng: L.latLng(-28.7, 153.1) })
    updateGuide.call(ctx)
    expect(ctx._drawGuide).toHaveBeenCalledTimes(1)
  })

  it('draws when given an explicit newPos even if _currentLatLng is undefined (mousemove path)', () => {
    const ctx = makeCtx({ _currentLatLng: undefined })
    updateGuide.call(ctx, L.point(5, 5))
    expect(ctx._drawGuide).toHaveBeenCalledTimes(1)
  })
})
