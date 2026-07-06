/**
 * Tests for isCheckInOpenForLeader - the leader/admin check-in window predicate.
 *
 * Spec (post-event backfill, 2026-05-20):
 *   - HIDDEN/closed before the event day (future) - preserves the 9-May
 *     wrong-day fix: never check someone in for an event that has not happened.
 *   - OPEN on the event day (AEST), regardless of whether impact is logged
 *     (a leader may log impact early then keep checking in stragglers).
 *   - OPEN after the event day ONLY while impact has not been logged - the
 *     backfill window (lost wifi, partner-org sign-in sheet transcribed later).
 *   - CLOSED after the event day once impact is logged - attendance is final.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isCheckInOpenForLeader } from '@/lib/date-format'

/**
 * Build an ISO timestamptz string for a given date/time in Australia/Sydney
 * using a fixed +10:00 (AEST) offset so the AEST calendar date is deterministic
 * regardless of the test runner's local timezone.
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

const TZ = 'Australia/Sydney'

// Event on 2026-05-15 starting at 10:00 AEST
const EVENT_START = aestIso(2026, 5, 15, 10, 0)

const T_DAY_BEFORE = new Date(aestIso(2026, 5, 14, 23, 59))
const T_EVENT_DAY_MORNING = new Date(aestIso(2026, 5, 15, 8, 0))
const T_EVENT_DAY_EVENING = new Date(aestIso(2026, 5, 15, 22, 0))
const T_NEXT_DAY = new Date(aestIso(2026, 5, 16, 9, 0))
const T_FIVE_DAYS_LATER = new Date(aestIso(2026, 5, 20, 9, 0))

describe('isCheckInOpenForLeader', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns false for null/undefined/empty input', () => {
    vi.setSystemTime(T_EVENT_DAY_MORNING)
    expect(isCheckInOpenForLeader(null, TZ, false)).toBe(false)
    expect(isCheckInOpenForLeader(undefined, TZ, false)).toBe(false)
    expect(isCheckInOpenForLeader('', TZ, false)).toBe(false)
  })

  it('returns false the day before the event (future, blocked)', () => {
    vi.setSystemTime(T_DAY_BEFORE)
    expect(isCheckInOpenForLeader(EVENT_START, TZ, false)).toBe(false)
  })

  it('returns false for a far-future event even if impact somehow flagged', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const future = aestIso(2026, 12, 25, 10, 0)
    expect(isCheckInOpenForLeader(future, TZ, false)).toBe(false)
    expect(isCheckInOpenForLeader(future, TZ, true)).toBe(false)
  })

  it('returns true on the event day, impact not logged', () => {
    vi.setSystemTime(T_EVENT_DAY_MORNING)
    expect(isCheckInOpenForLeader(EVENT_START, TZ, false)).toBe(true)
  })

  it('returns true on the event day even if impact already logged (same-day stragglers)', () => {
    vi.setSystemTime(T_EVENT_DAY_EVENING)
    expect(isCheckInOpenForLeader(EVENT_START, TZ, true)).toBe(true)
  })

  it('returns true the day after the event while impact is NOT logged (backfill open)', () => {
    vi.setSystemTime(T_NEXT_DAY)
    expect(isCheckInOpenForLeader(EVENT_START, TZ, false)).toBe(true)
  })

  it('stays open the day after the event even once impact is logged (2026-06-01: impact no longer closes leader check-in)', () => {
    vi.setSystemTime(T_NEXT_DAY)
    expect(isCheckInOpenForLeader(EVENT_START, TZ, true)).toBe(true)
  })

  it('returns true days later while impact is still not logged', () => {
    vi.setSystemTime(T_FIVE_DAYS_LATER)
    expect(isCheckInOpenForLeader(EVENT_START, TZ, false)).toBe(true)
  })

  it('stays open days later even once impact is logged (2026-06-01: impact no longer closes leader check-in)', () => {
    vi.setSystemTime(T_FIVE_DAYS_LATER)
    expect(isCheckInOpenForLeader(EVENT_START, TZ, true)).toBe(true)
  })
})
