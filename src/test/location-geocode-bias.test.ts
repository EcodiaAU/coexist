import { describe, it, expect, vi, afterEach } from 'vitest'
import { forwardGeocodeTopResult } from '@/hooks/use-location-sync'
import { COLLECTIVE_SLUG_COORDS } from '@/lib/geo'

/**
 * Regression: Tamika (Tamworth leader) typed "Currawong Park" into the event
 * location field and the free-text forward geocode resolved to the Currawong
 * Park in Gregory Hills (SW Sydney, ~450km away) because Nominatim's national
 * importance ranking put it above the East Tamworth park. With a collective
 * bias the nearest candidate must win. 2026-07-17.
 */

const GREGORY_HILLS = {
  lat: '-34.0225067484746',
  lon: '150.77664077282',
  display_name: 'Currawong Park, Kookaburra Drive, Gregory Hills, New South Wales, Australia',
  address: {
    road: 'Kookaburra Drive',
    suburb: 'Gregory Hills',
    state: 'New South Wales',
  },
}

const EAST_TAMWORTH = {
  lat: '-31.0851058',
  lon: '150.9405592',
  display_name: 'Currawong Park, Raglan Street, East Tamworth, New South Wales, Australia',
  address: {
    road: 'Raglan Street',
    suburb: 'East Tamworth',
    state: 'New South Wales',
  },
}

function mockNominatim(results: unknown[]) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => results,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('forwardGeocodeTopResult proximity bias', () => {
  it('picks the candidate nearest the collective bias, not the national top hit', async () => {
    // Nominatim ranks Gregory Hills first nationally.
    mockNominatim([GREGORY_HILLS, EAST_TAMWORTH])
    const result = await forwardGeocodeTopResult(
      'Currawong Park',
      'au',
      new AbortController().signal,
      COLLECTIVE_SLUG_COORDS.tamworth,
    )
    expect(result).not.toBeNull()
    expect(result!.lat).toBeCloseTo(-31.0851058, 4)
    expect(result!.lng).toBeCloseTo(150.9405592, 4)
    expect(result!.address).toContain('East Tamworth')
  })

  it('requests multiple candidates and a viewbox when biased', async () => {
    const fetchMock = mockNominatim([EAST_TAMWORTH])
    await forwardGeocodeTopResult(
      'Currawong Park',
      'au',
      new AbortController().signal,
      COLLECTIVE_SLUG_COORDS.tamworth,
    )
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.searchParams.get('limit')).toBe('10')
    expect(url.searchParams.get('viewbox')).toBeTruthy()
    expect(url.searchParams.get('bounded')).toBe('0')
  })

  it('keeps the top-hit behaviour when no bias is supplied', async () => {
    const fetchMock = mockNominatim([GREGORY_HILLS, EAST_TAMWORTH])
    const result = await forwardGeocodeTopResult(
      'Currawong Park',
      'au',
      new AbortController().signal,
    )
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.searchParams.get('limit')).toBe('1')
    expect(url.searchParams.get('viewbox')).toBeNull()
    expect(result!.lat).toBeCloseTo(-34.0225067484746, 4)
  })
})
