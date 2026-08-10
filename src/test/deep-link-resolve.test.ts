/**
 * Tests for resolveAppUrl - the native appUrlOpen URL -> in-app route mapping
 * behind the public event page "Open in App" button and every other deep link.
 *
 * Regression (Tate 2026-08-10): "Open in App" fired coexist://events/{id} and
 * landed on the 404. Root cause: new URL('coexist://events/abc') does NOT throw;
 * it parses `events` as the host, leaving pathname `/abc`, so the old handler
 * navigated to the bare, unmatched route `/abc`. Custom schemes must be
 * scheme-stripped; only http(s) universal links use url.pathname.
 */
import { describe, it, expect } from 'vitest'
import { resolveAppUrl, resolveDeepLinkPath } from '@/hooks/use-deep-link'

describe('resolveAppUrl - custom scheme (the Open-in-App path)', () => {
  it('resolves coexist://events/{id} to the in-app event screen, not a 404', () => {
    expect(resolveAppUrl('coexist://events/abc123')).toBe('/events/abc123')
  })

  it('preserves a UUID event id verbatim', () => {
    const id = '9f8b2c1e-4d3a-4b7c-9e21-0a1b2c3d4e5f'
    expect(resolveAppUrl(`coexist://events/${id}`)).toBe(`/events/${id}`)
  })

  it('resolves an event sub-route (day/impact/survey/check-in/edit)', () => {
    expect(resolveAppUrl('coexist://events/abc123/day')).toBe('/events/abc123/day')
    expect(resolveAppUrl('coexist://events/abc123/check-in')).toBe('/events/abc123/check-in')
  })

  it('resolves collectives, member, and share deep links', () => {
    expect(resolveAppUrl('coexist://collectives/xyz')).toBe('/collectives/xyz')
    expect(resolveAppUrl('coexist://collectives/xyz/manage')).toBe('/collectives/xyz/manage')
    expect(resolveAppUrl('coexist://member/u1')).toBe('/profile/u1')
    expect(resolveAppUrl('coexist://share/event/e9')).toBe('/events/e9')
    expect(resolveAppUrl('coexist://share/impact')).toBe('/profile')
  })

  it('regression guard: never returns the bare-id route the old handler produced', () => {
    // The bug: url.pathname of coexist://events/abc123 is '/abc123'.
    expect(resolveAppUrl('coexist://events/abc123')).not.toBe('/abc123')
  })
})

describe('resolveAppUrl - https universal links', () => {
  it('resolves https://app.coexistaus.org/events/{id} to /events/{id}', () => {
    expect(resolveAppUrl('https://app.coexistaus.org/events/abc123')).toBe('/events/abc123')
  })

  it('uses pathname, not host, for universal links', () => {
    // Must not leak the host into the route.
    expect(resolveAppUrl('https://app.coexistaus.org/collectives/xyz')).toBe('/collectives/xyz')
  })
})

describe('resolveAppUrl - ignore cases', () => {
  it('returns null for empty / nullish input', () => {
    expect(resolveAppUrl('')).toBeNull()
    expect(resolveAppUrl(undefined)).toBeNull()
    expect(resolveAppUrl(null)).toBeNull()
  })

  it('returns null for a share link that resolves to home', () => {
    expect(resolveAppUrl('coexist://share/unknown')).toBeNull()
  })
})

describe('resolveDeepLinkPath - unit', () => {
  it('maps scheme-stripped host+path correctly', () => {
    expect(resolveDeepLinkPath('events/abc123')).toBe('/events/abc123')
    expect(resolveDeepLinkPath('/events/abc123')).toBe('/events/abc123')
  })
})
