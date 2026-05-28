/**
 * Tests for the leader-events "registered" count semantics.
 *
 * Bug (2026-05-28): the /leader/events list showed "13 registered" for the
 * Sydney "Lane Cove National Park Hike" while the event detail page showed
 * "6 going". Root cause: the leader list embedded an unfiltered
 * `event_registrations(count)` aggregate, so it counted `invited` rows (and
 * would count `cancelled`/`waitlisted`) as registered. The detail page filters
 * to STATUS_FILTERS.events.REGISTRATION (`['registered','attended']`).
 *
 * The fix makes the leader list count the same statuses. These tests lock the
 * invariant: only `registered` + `attended` count toward the leader-list number,
 * and the two surfaces can never drift via the shared constant.
 */

import { describe, it, expect } from 'vitest'
import { STATUS_FILTERS, countByField } from '@/lib/query-builders'

type RegRow = { event_id: string; status: string }

/**
 * Mirror the hook pipeline: the server-side `.in('status', REGISTRATION)`
 * filter followed by the client-side `countByField` bucketing.
 */
function registeredCounts(rows: RegRow[]): Map<unknown, number> {
  const filtered = rows.filter((r) =>
    (STATUS_FILTERS.events.REGISTRATION as readonly string[]).includes(r.status),
  )
  return countByField(filtered, 'event_id')
}

const LANE_COVE = 'c4100314-ad14-4bfa-983b-e7323d16f281'

describe('leader-events registered count', () => {
  it('counts only registered + attended (the Lane Cove 13-vs-6 case)', () => {
    // 6 registered + 7 invited = 13 rows total, mirroring the live data.
    const rows: RegRow[] = [
      ...Array.from({ length: 6 }, () => ({ event_id: LANE_COVE, status: 'registered' })),
      ...Array.from({ length: 7 }, () => ({ event_id: LANE_COVE, status: 'invited' })),
    ]
    expect(rows.length).toBe(13)
    expect(registeredCounts(rows).get(LANE_COVE)).toBe(6)
  })

  it('excludes invited, cancelled and waitlisted; includes attended', () => {
    const rows: RegRow[] = [
      { event_id: 'e1', status: 'registered' },
      { event_id: 'e1', status: 'attended' },
      { event_id: 'e1', status: 'invited' },
      { event_id: 'e1', status: 'cancelled' },
      { event_id: 'e1', status: 'waitlisted' },
    ]
    // Only registered + attended count.
    expect(registeredCounts(rows).get('e1')).toBe(2)
  })

  it('buckets independently per event', () => {
    const rows: RegRow[] = [
      { event_id: 'e1', status: 'registered' },
      { event_id: 'e2', status: 'registered' },
      { event_id: 'e2', status: 'attended' },
      { event_id: 'e2', status: 'invited' },
    ]
    const counts = registeredCounts(rows)
    expect(counts.get('e1')).toBe(1)
    expect(counts.get('e2')).toBe(2)
  })

  it('REGISTRATION constant never silently includes invited (drift guard)', () => {
    const reg = STATUS_FILTERS.events.REGISTRATION as readonly string[]
    expect(reg).toContain('registered')
    expect(reg).toContain('attended')
    expect(reg).not.toContain('invited')
    expect(reg).not.toContain('cancelled')
    expect(reg).not.toContain('waitlisted')
  })
})
