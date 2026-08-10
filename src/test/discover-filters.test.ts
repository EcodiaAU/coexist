/**
 * discover-filters.test.ts
 *
 * Unit tests for the pure discovery filter helpers added for backlog F2:
 *   - discoverWhenBounds: date-range bounds for the "when" quick-filter chips.
 *   - sanitizeDiscoverSearch: strips PostgREST-significant chars from search.
 *
 * Both are pure + `now`-injectable, so no fake timers or DB are needed. We
 * mock '@/lib/supabase' so importing use-events.ts does not spin up a real
 * client (matches the existing carpool test).
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { discoverWhenBounds, sanitizeDiscoverSearch } from '@/hooks/use-events'

describe('discoverWhenBounds', () => {
  it('returns no bounds for "any"', () => {
    expect(discoverWhenBounds('any')).toEqual({ fromIso: null, toIso: null })
  })

  it('today = [start-of-day, end-of-day] in the wall-clock frame', () => {
    const now = new Date(Date.UTC(2026, 7, 12, 10, 30, 0)) // 12 Aug 2026 10:30
    const { fromIso, toIso } = discoverWhenBounds('today', now)
    expect(fromIso).toBe('2026-08-12T00:00:00.000Z')
    expect(toIso).toBe('2026-08-12T23:59:59.999Z')
  })

  it('month = [today-start, last-day-of-month end]', () => {
    const now = new Date(Date.UTC(2026, 7, 12, 10, 30, 0)) // August has 31 days
    const { fromIso, toIso } = discoverWhenBounds('month', now)
    expect(fromIso).toBe('2026-08-12T00:00:00.000Z')
    expect(toIso).toBe('2026-08-31T23:59:59.999Z')
  })

  it('month handles a February end correctly (28 days, 2027 not a leap year)', () => {
    const now = new Date(Date.UTC(2027, 1, 5, 9, 0, 0)) // 5 Feb 2027
    const { toIso } = discoverWhenBounds('month', now)
    expect(toIso).toBe('2027-02-28T23:59:59.999Z')
  })

  it('weekend always spans Saturday 00:00 -> Sunday 23:59, for every weekday', () => {
    // Aug 10..16 2026 covers Mon..Sun. The window must always be Sat->Sun, and
    // when today IS the weekend it must contain today.
    for (let i = 0; i < 7; i++) {
      const now = new Date(Date.UTC(2026, 7, 10 + i, 12, 0, 0))
      const { fromIso, toIso } = discoverWhenBounds('weekend', now)
      const from = new Date(fromIso as string)
      const to = new Date(toIso as string)
      expect(from.getUTCDay()).toBe(6) // Saturday
      expect(to.getUTCDay()).toBe(0) // Sunday
      expect(to.getTime()).toBeGreaterThan(from.getTime())
      const dow = now.getUTCDay()
      if (dow === 6 || dow === 0) {
        expect(now.getTime()).toBeGreaterThanOrEqual(from.getTime())
        expect(now.getTime()).toBeLessThanOrEqual(to.getTime())
      }
    }
  })
})

describe('sanitizeDiscoverSearch', () => {
  it('keeps ordinary words and dots (e.g. "St. Kilda")', () => {
    expect(sanitizeDiscoverSearch('St. Kilda')).toBe('St. Kilda')
  })

  it('strips PostgREST-significant chars so the .or() grammar cannot break', () => {
    // commas split terms, ()=and-grouping, * and % are wildcards, \ escapes.
    expect(sanitizeDiscoverSearch('a,b(c)%*\\d')).toBe('a b c d')
  })

  it('collapses to empty when nothing usable remains', () => {
    expect(sanitizeDiscoverSearch('   ')).toBe('')
    expect(sanitizeDiscoverSearch('%%%')).toBe('')
    expect(sanitizeDiscoverSearch('')).toBe('')
  })
})
