/**
 * Tests for isSignInButtonVisible — the "Tap to Sign In" button visibility
 * predicate on the Next-Event card.
 *
 * Spec (Tate directive 11 May 2026):
 *   - HIDDEN when event is not today AEST (far future or past)
 *   - VISIBLE once the sign-in window opens (AEST calendar-day start on event day)
 *   - VISIBLE while event is in progress (within 2h of start)
 *   - VISIBLE up to 2 hours after event start
 *   - HIDDEN more than 2 hours after event start
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isSignInButtonVisible } from '@/lib/date-format'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build an ISO timestamptz string for a given date/time in Australia/Sydney.
 * We use a fixed UTC offset (+10 for AEST, +11 for AEDT) to avoid system-tz
 * dependencies in tests. All test scenarios are authored in AEST (+10).
 */
function aestIso(
  year: number,
  month: number, // 1-based
  day: number,
  hour: number,
  minute = 0,
): string {
  // Build an ISO string in the AEST UTC+10 offset so the AEST calendar date
  // is deterministic regardless of the test runner's local timezone.
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+10:00`
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Event on 2026-05-15 starting at 10:00 AEST
const EVENT_START = aestIso(2026, 5, 15, 10, 0) // 2026-05-15T10:00:00+10:00

// Various "now" moments expressed as Date objects
const T_DAY_BEFORE = new Date(aestIso(2026, 5, 14, 23, 59)) // 23:59 AEST day before
const T_MIDNIGHT_EVENT_DAY = new Date(aestIso(2026, 5, 15, 0, 0)) // 00:00 AEST event day (window opens)
const T_30MIN_BEFORE = new Date(aestIso(2026, 5, 15, 9, 30)) // 09:30 AEST — pre-start, window open
const T_AT_START = new Date(aestIso(2026, 5, 15, 10, 0)) // exactly at start
const T_1H_AFTER_START = new Date(aestIso(2026, 5, 15, 11, 0)) // 1h after start
const T_2H_EXACTLY = new Date(aestIso(2026, 5, 15, 12, 0)) // exactly 2h after start (boundary, still visible)
const T_2H_PLUS_1S = new Date(aestIso(2026, 5, 15, 12, 0).replace(':00+10', ':01+10')) // 2h 1min after — actually let's do it differently
const T_3H_AFTER_START = new Date(aestIso(2026, 5, 15, 13, 0)) // 3h after start — HIDDEN
const T_NEXT_DAY = new Date(aestIso(2026, 5, 16, 9, 0)) // next day

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

  it('returns false for null/undefined input', () => {
    vi.setSystemTime(T_AT_START)
    expect(isSignInButtonVisible(null)).toBe(false)
    expect(isSignInButtonVisible(undefined)).toBe(false)
    expect(isSignInButtonVisible('')).toBe(false)
  })

  it('returns false when event is the day before (not today AEST)', () => {
    vi.setSystemTime(T_DAY_BEFORE)
    expect(isSignInButtonVisible(EVENT_START)).toBe(false)
  })

  it('returns true at AEST midnight on event day (sign-in window opens)', () => {
    vi.setSystemTime(T_MIDNIGHT_EVENT_DAY)
    expect(isSignInButtonVisible(EVENT_START)).toBe(true)
  })

  it('returns true 30 minutes before event start (window open, pre-start)', () => {
    vi.setSystemTime(T_30MIN_BEFORE)
    expect(isSignInButtonVisible(EVENT_START)).toBe(true)
  })

  it('returns true exactly at event start', () => {
    vi.setSystemTime(T_AT_START)
    expect(isSignInButtonVisible(EVENT_START)).toBe(true)
  })

  it('returns true 1 hour after event start (in progress, within 2h)', () => {
    vi.setSystemTime(T_1H_AFTER_START)
    expect(isSignInButtonVisible(EVENT_START)).toBe(true)
  })

  it('returns true at exactly 2 hours after event start (boundary inclusive)', () => {
    vi.setSystemTime(T_2H_EXACTLY)
    expect(isSignInButtonVisible(EVENT_START)).toBe(true)
  })

  it('returns false 3 hours after event start (beyond the 2h window)', () => {
    vi.setSystemTime(T_3H_AFTER_START)
    expect(isSignInButtonVisible(EVENT_START)).toBe(false)
  })

  it('returns false the next AEST calendar day', () => {
    vi.setSystemTime(T_NEXT_DAY)
    expect(isSignInButtonVisible(EVENT_START)).toBe(false)
  })

  it('returns false for a far-future event', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const futureEvent = aestIso(2026, 12, 25, 10, 0)
    expect(isSignInButtonVisible(futureEvent)).toBe(false)
  })
})
