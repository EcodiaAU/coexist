/**
 * Tests for isSignInButtonVisible - the "Tap to Sign In" button visibility
 * predicate on the Next-Event card.
 *
 * Spec (Tate directive 2026-05-23, Co-Exist event-day incident):
 *   - HIDDEN when event is not today in event tz (far future or past)
 *   - VISIBLE all day on the event day in event tz (from local-midnight
 *     until the next local-midnight)
 *
 * Previously closed 2h after start. Co-Exist events often run 3-4 hours
 * so the 2h hard close cut off late arrivals mid-event. Day-of is now
 * the only gate, matching the BE enforce_event_day_check_in_window
 * trigger and the new "register + sign in on the day" model.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isSignInButtonVisible } from '@/lib/date-format'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build an ISO timestamptz string for a given date/time in Australia/Sydney.
 * We use a fixed UTC offset (+10 for AEST) to avoid system-tz dependencies
 * in tests. All test scenarios are authored in AEST (+10).
 */
function aestIso(
  year: number,
  month: number, // 1-based
  day: number,
  hour: number,
  minute = 0,
): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+10:00`
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Event on 2026-05-15 starting at 10:00 AEST
const EVENT_START = aestIso(2026, 5, 15, 10, 0)

const T_DAY_BEFORE = new Date(aestIso(2026, 5, 14, 23, 59))
const T_MIDNIGHT_EVENT_DAY = new Date(aestIso(2026, 5, 15, 0, 0))
const T_30MIN_BEFORE = new Date(aestIso(2026, 5, 15, 9, 30))
const T_AT_START = new Date(aestIso(2026, 5, 15, 10, 0))
const T_1H_AFTER_START = new Date(aestIso(2026, 5, 15, 11, 0))
const T_2H_AFTER_START = new Date(aestIso(2026, 5, 15, 12, 0))
const T_3H_AFTER_START = new Date(aestIso(2026, 5, 15, 13, 0))
const T_LATE_EVENING_EVENT_DAY = new Date(aestIso(2026, 5, 15, 23, 30))
const T_NEXT_DAY_MIDNIGHT = new Date(aestIso(2026, 5, 16, 0, 0))
const T_NEXT_DAY = new Date(aestIso(2026, 5, 16, 9, 0))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('isSignInButtonVisible', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns false for null/undefined/empty input', () => {
    vi.setSystemTime(T_AT_START)
    expect(isSignInButtonVisible(null, 'Australia/Sydney')).toBe(false)
    expect(isSignInButtonVisible(undefined, 'Australia/Sydney')).toBe(false)
    expect(isSignInButtonVisible('', 'Australia/Sydney')).toBe(false)
  })

  it('returns false when event is the day before (not today AEST)', () => {
    vi.setSystemTime(T_DAY_BEFORE)
    expect(isSignInButtonVisible(EVENT_START, 'Australia/Sydney')).toBe(false)
  })

  it('returns true at AEST midnight on event day (sign-in window opens)', () => {
    vi.setSystemTime(T_MIDNIGHT_EVENT_DAY)
    expect(isSignInButtonVisible(EVENT_START, 'Australia/Sydney')).toBe(true)
  })

  it('returns true 30 minutes before event start (window open, pre-start)', () => {
    vi.setSystemTime(T_30MIN_BEFORE)
    expect(isSignInButtonVisible(EVENT_START, 'Australia/Sydney')).toBe(true)
  })

  it('returns true exactly at event start', () => {
    vi.setSystemTime(T_AT_START)
    expect(isSignInButtonVisible(EVENT_START, 'Australia/Sydney')).toBe(true)
  })

  it('returns true 1 hour after event start (in progress)', () => {
    vi.setSystemTime(T_1H_AFTER_START)
    expect(isSignInButtonVisible(EVENT_START, 'Australia/Sydney')).toBe(true)
  })

  it('returns true 2 hours after event start (still event day)', () => {
    vi.setSystemTime(T_2H_AFTER_START)
    expect(isSignInButtonVisible(EVENT_START, 'Australia/Sydney')).toBe(true)
  })

  it('returns true 3 hours after event start (still event day, late arrival window)', () => {
    vi.setSystemTime(T_3H_AFTER_START)
    expect(isSignInButtonVisible(EVENT_START, 'Australia/Sydney')).toBe(true)
  })

  it('returns true late evening on event day (still same AEST calendar day)', () => {
    vi.setSystemTime(T_LATE_EVENING_EVENT_DAY)
    expect(isSignInButtonVisible(EVENT_START, 'Australia/Sydney')).toBe(true)
  })

  it('returns false at midnight of the next AEST calendar day (window closes)', () => {
    vi.setSystemTime(T_NEXT_DAY_MIDNIGHT)
    expect(isSignInButtonVisible(EVENT_START, 'Australia/Sydney')).toBe(false)
  })

  it('returns false the next AEST calendar day morning', () => {
    vi.setSystemTime(T_NEXT_DAY)
    expect(isSignInButtonVisible(EVENT_START, 'Australia/Sydney')).toBe(false)
  })

  it('returns false for a far-future event', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const futureEvent = aestIso(2026, 12, 25, 10, 0)
    expect(isSignInButtonVisible(futureEvent, 'Australia/Sydney')).toBe(false)
  })
})
