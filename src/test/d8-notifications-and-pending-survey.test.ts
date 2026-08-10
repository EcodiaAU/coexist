import { describe, it, expect } from 'vitest'
import { localDayKey, groupByDay } from '@/hooks/use-notifications'
import { isSurveyPendingForEvent } from '@/hooks/use-auto-survey'
import type { Tables } from '@/types/database.types'

type Notification = Tables<'notifications'>

function notif(id: string, created_at: string): Notification {
  return { id, created_at } as unknown as Notification
}

/**
 * D8 finding 391: Today/Yesterday grouping keyed on the UTC calendar day, so for
 * an AEST user the local morning (roughly midnight-10am) fell in the previous
 * UTC day and this-morning notifications rendered under "Yesterday". The key +
 * the today/yesterday references now compute in LOCAL time.
 */
describe('D8/391 - local-day grouping', () => {
  it('localDayKey uses local date parts, not UTC toISOString', () => {
    // A wall-clock morning instant. Built via local parts so the test is stable
    // regardless of the runner timezone: the key must equal those local parts.
    const d = new Date(2026, 7, 10, 7, 30, 0) // 10 Aug 2026, 07:30 local
    expect(localDayKey(d)).toBe('2026-08-10')
  })

  it('a 07:30-local notification groups under Today, not Yesterday', () => {
    const now = new Date(2026, 7, 10, 9, 0, 0) // 10 Aug 2026, 09:00 local
    const thisMorning = new Date(2026, 7, 10, 7, 30, 0)
    const groups = groupByDay([notif('n1', thisMorning.toISOString())], now)
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('Today')
    expect(groups[0].date).toBe('2026-08-10')
  })

  it('labels the prior local day Yesterday and older days by weekday', () => {
    const now = new Date(2026, 7, 10, 9, 0, 0)
    const yesterday = new Date(2026, 7, 9, 20, 0, 0)
    const older = new Date(2026, 7, 6, 12, 0, 0)
    const groups = groupByDay(
      [notif('a', yesterday.toISOString()), notif('b', older.toISOString())],
      now,
    )
    const byDate = Object.fromEntries(groups.map((g) => [g.date, g.label]))
    expect(byDate['2026-08-09']).toBe('Yesterday')
    // 6 Aug 2026 is a Thursday - a weekday label, never "Yesterday"/"Today"
    expect(byDate['2026-08-06']).toContain('Thursday')
  })

  it('sorts groups newest-first', () => {
    const now = new Date(2026, 7, 10, 9, 0, 0)
    const groups = groupByDay(
      [
        notif('old', new Date(2026, 7, 6, 12, 0, 0).toISOString()),
        notif('new', new Date(2026, 7, 10, 8, 0, 0).toISOString()),
      ],
      now,
    )
    expect(groups.map((g) => g.date)).toEqual(['2026-08-10', '2026-08-06'])
  })
})

/**
 * D8 finding 516: usePendingSurveys filtered auto-send surveys with
 * `.in('activity_type', activityTypes)`, which can never match a NULL
 * activity_type. The only auto-send survey configured live IS NULL-activity, so
 * NO attendee was ever prompted. isSurveyPendingForEvent now treats a generic
 * (NULL-activity) auto-send survey as covering every event type.
 */
describe('D8/516 - pending-survey coverage includes generic NULL-activity survey', () => {
  const ev = { id: 'e1', activity_type: 'beach_cleanup' }
  const responded = new Set<string>()

  it('a generic auto-send survey covers an event with no type-specific survey', () => {
    expect(
      isSurveyPendingForEvent(ev, responded, new Set(), /* hasGenericAutoSend */ true),
    ).toBe(true)
  })

  it('without any covering survey the event is NOT pending', () => {
    expect(isSurveyPendingForEvent(ev, responded, new Set(), false)).toBe(false)
  })

  it('a type-specific survey still covers its own type', () => {
    expect(isSurveyPendingForEvent(ev, responded, new Set(['beach_cleanup']), false)).toBe(true)
    expect(isSurveyPendingForEvent(ev, responded, new Set(['tree_planting']), false)).toBe(false)
  })

  it('an already-responded event is never pending, even with a generic survey', () => {
    expect(
      isSurveyPendingForEvent(ev, new Set(['e1']), new Set(['beach_cleanup']), true),
    ).toBe(false)
  })
})
