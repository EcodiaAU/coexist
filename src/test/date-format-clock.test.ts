import { describe, it, expect } from 'vitest'
import { formatClockTime, formatTime } from '@/lib/date-format'

/**
 * Regression for the "chat messages timestamped in the 4ams" bug
 * (Co-Exist leader report, weekend of 2026-06-06).
 *
 * A chat message sent at 2:00 pm AEST is a REAL instant, stored as
 * 04:00Z. formatTime() pins UTC (correct for floating-local EVENT
 * wall-clocks) and would render it "4:00 am" - the bug. formatClockTime()
 * converts a real instant to the viewer's local clock.
 *
 * Run with TZ=Australia/Sydney so the "viewer" is on the east coast.
 */
describe('formatClockTime (real instants -> viewer local clock)', () => {
  const instant = new Date('2026-06-06T04:00:00Z') // 2:00 pm AEST

  it('renders a real instant in the local timezone, not UTC', () => {
    // Only meaningful when the test runner is pinned to an AU east tz.
    if (process.env.TZ === 'Australia/Sydney') {
      expect(formatClockTime(instant)).toBe('2:00 pm')
    }
  })

  it('is distinct from the UTC-pinned event formatter', () => {
    // formatTime pins UTC -> the old (wrong) chat rendering.
    expect(formatTime(instant)).toBe('4:00 am')
    if (process.env.TZ === 'Australia/Sydney') {
      expect(formatClockTime(instant)).not.toBe(formatTime(instant))
    }
  })
})
