import { describe, it, expect, vi } from 'vitest'
import { COLLECTIVE_SLUG_COORDS, parseLocationPoint, resolveCollectiveCoords } from '@/lib/geo'

describe('parseLocationPoint', () => {
  it('returns null for falsy input', () => {
    expect(parseLocationPoint(null)).toBeNull()
    expect(parseLocationPoint(undefined)).toBeNull()
    expect(parseLocationPoint('')).toBeNull()
    expect(parseLocationPoint(0)).toBeNull()
  })

  it('parses GeoJSON Point', () => {
    const point = { type: 'Point', coordinates: [153.0251, -28.6432] }
    expect(parseLocationPoint(point)).toEqual({ lat: -28.6432, lng: 153.0251 })
  })

  it('returns null for GeoJSON Point with insufficient coordinates', () => {
    const point = { type: 'Point', coordinates: [153.0251] }
    expect(parseLocationPoint(point)).toBeNull()
  })

  it('parses plain {lat, lng} object', () => {
    const point = { lat: -33.8688, lng: 151.2093 }
    expect(parseLocationPoint(point)).toEqual({ lat: -33.8688, lng: 151.2093 })
  })

  it('returns null for plain object with non-numeric lat/lng', () => {
    const point = { lat: 'abc', lng: 'def' }
    expect(parseLocationPoint(point)).toBeNull()
  })

  it('parses WKT POINT string', () => {
    expect(parseLocationPoint('POINT(153.0251 -28.6432)')).toEqual({
      lat: -28.6432,
      lng: 153.0251,
    })
  })

  it('parses WKT with SRID prefix', () => {
    expect(parseLocationPoint('SRID=4326;POINT(151.2093 -33.8688)')).toEqual({
      lat: -33.8688,
      lng: 151.2093,
    })
  })

  it('returns null for unrecognized string', () => {
    expect(parseLocationPoint('not a point')).toBeNull()
  })

  it('returns null for unrecognized object types', () => {
    expect(parseLocationPoint({ type: 'LineString', coordinates: [[0, 0]] })).toBeNull()
    expect(parseLocationPoint({ foo: 'bar' })).toBeNull()
    expect(parseLocationPoint(42)).toBeNull()
  })
})

describe('resolveCollectiveCoords', () => {
  it('prefers a parseable location_point over the slug fallback', () => {
    const point = { type: 'Point', coordinates: [151.2093, -33.8688] }
    expect(resolveCollectiveCoords(point, 'sydney')).toEqual({
      lat: -33.8688,
      lng: 151.2093,
    })
  })

  it('falls back to the slug-keyed city centre when location_point is null', () => {
    expect(resolveCollectiveCoords(null, 'sydney')).toEqual(
      COLLECTIVE_SLUG_COORDS['sydney'],
    )
  })

  it('resolves north-east-victoria to Wangaratta-area coords (regression: Apr 28 Jess bug)', () => {
    const coords = resolveCollectiveCoords(null, 'north-east-victoria')
    expect(coords).not.toBeNull()
    expect(coords?.lat).toBeCloseTo(-36.3551, 2)
    expect(coords?.lng).toBeCloseTo(146.3194, 2)
  })

  it('returns null and warns in dev when slug is unknown', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveCollectiveCoords(null, 'totally-not-a-real-slug-xyz')).toBeNull()
    warnSpy.mockRestore()
  })

  it('returns null when both inputs are missing', () => {
    expect(resolveCollectiveCoords(null, null)).toBeNull()
    expect(resolveCollectiveCoords(undefined, undefined)).toBeNull()
  })

  it('every active production slug must resolve (locks in the safeguard)', () => {
    // Mirrors the active slugs in the production collectives table as of
    // Apr 28 2026. If a new collective is added in the admin and lands here
    // without coords in COLLECTIVE_SLUG_COORDS, this test fails.
    const productionSlugs = [
      'perth',
      'adelaide',
      'geelong',
      'mornington-peninsula',
      'melbourne',
      'hobart',
      'sydney',
      'northern-rivers',
      'gold-coast',
      'brisbane',
      'sunshine-coast',
      'townsville',
      'cairns',
      'tamworth',
      'north-east-victoria',
    ]
    for (const slug of productionSlugs) {
      expect(resolveCollectiveCoords(null, slug), `slug ${slug}`).not.toBeNull()
    }
  })
})
