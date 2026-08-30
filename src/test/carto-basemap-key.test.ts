import { describe, it, expect } from 'vitest'
import { TILE_URL, TILE_ATTR, CARTO_BASEMAP_KEY } from '@/components/map/use-map'

/* CARTO began requiring an API key on its raster basemaps in Aug 2026. An
   unkeyed request still returns HTTP 200 and a valid PNG, so nothing in the app
   errors: the tile simply arrives with an "API KEY REQUIRED" watermark burned
   across it. There is no runtime signal to catch, which is exactly why the
   invariant is pinned here instead. */
describe('CARTO basemap key', () => {
  it('carries the key on every tile request', () => {
    expect(TILE_URL).toContain(`key=${CARTO_BASEMAP_KEY}`)
  })

  it('has a key that looks like a CARTO basemaps key', () => {
    expect(CARTO_BASEMAP_KEY).toMatch(/^cb1_[A-Za-z0-9_]+$/)
  })

  it('keeps the leaflet template placeholders intact alongside the query string', () => {
    for (const token of ['{s}', '{z}', '{x}', '{y}', '{r}']) {
      expect(TILE_URL).toContain(token)
    }
    // The key must sit in the query string, after the .png, or CARTO 404s the path.
    expect(TILE_URL.indexOf('?key=')).toBeGreaterThan(TILE_URL.indexOf('.png'))
  })

  /* The free tier is granted in exchange for visible attribution. Dropping
     either credit breaches the basemap terms, so the map loses its tiles, not
     just its footer. */
  it('keeps the CARTO and OpenStreetMap attribution the free tier is conditional on', () => {
    expect(TILE_ATTR).toContain('carto.com/attributions')
    expect(TILE_ATTR).toContain('openstreetmap.org/copyright')
  })
})
