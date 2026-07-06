import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useLocationSync } from '@/hooks/use-location-sync'

/**
 * Regression cover for the "pin must stay exactly where the leader puts it"
 * fix. The bug: a forward-geocode of the address text could overwrite a
 * deliberately-placed pin (drag or autocomplete pick), snapping the exact
 * meeting point back to a suburb centroid. See use-location-sync.ts pinPlacedRef.
 */

const SUBURB = { lat: -26.8, lng: 153.13 } // coarse locality centroid
const EXACT = { lat: -26.803912, lng: 153.121847 } // precise dropped pin

function mockForwardGeocode() {
  // Any Nominatim /search call resolves to the coarse suburb centroid.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            lat: String(SUBURB.lat),
            lon: String(SUBURB.lng),
            display_name: 'Kings Beach, Caloundra, Queensland',
            address: { suburb: 'Kings Beach', state: 'Queensland' },
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ),
  )
}

describe('useLocationSync - pin stays exactly where placed', () => {
  beforeEach(() => mockForwardGeocode())
  afterEach(() => vi.unstubAllGlobals())

  it('forward-geocodes free-typed text into the pin when no pin is placed yet', async () => {
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      useLocationSync({ address: '', lat: null, lng: null, onChange, debounceMs: 0 }),
    )

    act(() => result.current.onAddressTyped('Kings Beach Caloundra'))
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ lat: SUBURB.lat, lng: SUBURB.lng }),
      ),
    )
  })

  it('does NOT move a dragged pin when the address text is later edited', async () => {
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      useLocationSync({
        address: 'Kings Beach, Queensland',
        lat: null,
        lng: null,
        onChange,
        debounceMs: 0,
      }),
    )

    // Leader drops the pin on the exact meeting point.
    act(() => result.current.onPinDragged(EXACT))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ lat: EXACT.lat, lng: EXACT.lng }),
    )

    onChange.mockClear()

    // Leader now edits the address label (adds a landmark note). This must
    // NOT trigger a forward-geocode that relocates the exact pin.
    act(() => result.current.onAddressTyped('Kings Beach - meet at the north car park'))
    // Give any (unwanted) debounced geocode a chance to fire.
    await new Promise((r) => setTimeout(r, 30))

    const movedPin = onChange.mock.calls.some(
      ([u]) => u && typeof u === 'object' && ('lat' in u || 'lng' in u),
    )
    expect(movedPin).toBe(false)
  })

  it('does NOT move a pin placed via autocomplete when the text is edited', async () => {
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      useLocationSync({ address: '', lat: null, lng: null, onChange, debounceMs: 0 }),
    )

    act(() => result.current.onAddressSelected('Kings Beach, QLD', EXACT))
    onChange.mockClear()

    act(() => result.current.onAddressTyped('Kings Beach, QLD (near the kiosk)'))
    await new Promise((r) => setTimeout(r, 30))

    const movedPin = onChange.mock.calls.some(
      ([u]) => u && typeof u === 'object' && ('lat' in u || 'lng' in u),
    )
    expect(movedPin).toBe(false)
  })

  it('releases the lock when the address field is cleared (fresh search)', async () => {
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      useLocationSync({ address: '', lat: null, lng: null, onChange, debounceMs: 0 }),
    )

    act(() => result.current.onPinDragged(EXACT)) // locks
    onChange.mockClear()

    act(() => result.current.onAddressTyped('')) // clears -> releases lock
    act(() => result.current.onAddressTyped('New Place Somewhere'))

    await waitFor(() =>
      expect(
        onChange.mock.calls.some(
          ([u]) => u && typeof u === 'object' && 'lat' in u,
        ),
      ).toBe(true),
    )
  })
})
