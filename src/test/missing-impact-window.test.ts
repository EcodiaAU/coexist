/**
 * Tate (2026-09-18): the admin homepage's "awaiting impact" queue hid every
 * event more than a month overdue. The unscoped queue floored date_start at
 * 30 days, so /admin listed 8 outstanding events while /admin/insights listed
 * 14, and Perth's 15 Aug Bold Park hike showed on one page and not the other.
 * An overdue event is the one staff most need to see.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { missingImpactWindow } from '@/hooks/use-admin-impact-observations'

// Wall-clock-as-UTC "now": 18 Sep 2026, 5pm on the viewer's clock.
const NOW = new Date('2026-09-18T17:00:00.000Z')

describe('missingImpactWindow', () => {
  it('the dashboard queue (no scope) has no floor, so a 75-day-old event stays listed', () => {
    const w = missingImpactWindow({}, NOW)
    expect(w.floorIso).toBeNull()
    expect(w.ceilingIso).toBe(NOW.toISOString())
    // Merri Mornings, held 5 Jul 2026: inside the window.
    const merri = '2026-07-05T09:00:00.000Z'
    expect(w.floorIso === null || merri >= w.floorIso).toBe(true)
  })

  it('an explicit all-time window (sinceIso null) also has no floor', () => {
    expect(missingImpactWindow({ sinceIso: null, untilIso: null }, NOW).floorIso).toBeNull()
  })

  it('a report window keeps its own floor and caps at its end', () => {
    const w = missingImpactWindow(
      { sinceIso: '2026-04-01T00:00:00.000Z', untilIso: '2026-06-30T23:59:59.999Z' },
      NOW,
    )
    expect(w).toEqual({ floorIso: '2026-04-01T00:00:00.000Z', ceilingIso: '2026-06-30T23:59:59.999Z' })
  })

  it('an end in the future is capped at now: an event not yet held is never "missing"', () => {
    const w = missingImpactWindow({ sinceIso: '2026-07-01T00:00:00.000Z', untilIso: '2026-09-30T23:59:59.999Z' }, NOW)
    expect(w.ceilingIso).toBe(NOW.toISOString())
  })
})
