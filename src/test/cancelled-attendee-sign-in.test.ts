import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { LEADER_CHECK_IN_FROM_STATUSES } from '@/hooks/use-events'

/**
 * North Stradbroke Island trip, 2026-10-17 (reported by Jess Ditchfield,
 * 2026-10-19). Brisbane assist leaders unregistered so waitlisters could take
 * their seats, then could not be signed in on the day, and could not be added
 * back through Add Walk-In ("has cancelled their spot. Record them as a new
 * walk-in."). The database always allowed cancelled -> attended; the app
 * refused it in two places and hid the person from the roster in a third.
 *
 * These pins fail if any of the three comes back.
 */
describe('a person who cancelled can be signed in by a leader', () => {
  const eventDay = readFileSync(resolve(__dirname, '../pages/events/event-day.tsx'), 'utf8')

  it('the leader check-in accepts a cancelled registration', () => {
    expect(LEADER_CHECK_IN_FROM_STATUSES).toContain('cancelled')
  })

  it('Add Walk-In (existing member) flips a cancelled row instead of refusing it', () => {
    expect(eventDay).not.toMatch(/Record them as a new walk-in/)
    expect(eventDay).toMatch(/\.in\('status', LEADER_CHECK_IN_FROM_STATUSES\)/)
  })

  it('a search opens the Not attending section, so a cancelled person can be found', () => {
    expect(eventDay).toMatch(/showNotAttending \|\| searchQuery\.trim\(\)\.length > 0/)
  })
})
