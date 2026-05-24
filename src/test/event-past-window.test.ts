/**
 * Tests for isPastEvent + stillActiveStartCutoffIso - the predicates that
 * gate the Register CTA visibility on event-detail and the "still active"
 * filter on nearby / discover / collective queries.
 *
 * Spec (Tate directive 2026-05-23, Co-Exist event-day incident; reaffirmed
 * 2026-05-24): registration + sign-in must be available any time a person
 * could realistically attend.
 *
 *   - Pre-event: Register CTA visible from event creation onward.
 *   - Mid-event: Register CTA stays visible. Walk-ups arriving after start
 *     can still tap Register, then check in via the 3-digit code path (the
 *     useCodeCheckIn upsert + day-of trigger handles the BE side).
 *   - Post-event with explicit date_end: hidden once date_end passes.
 *   - Post-event with no date_end: stays visible for DEFAULT_EVENT_DURATION_MS
 *     (3h) of implicit grace, then hidden. Organisers running events longer
 *     than 3h should set date_end explicitly (the event-create form prompts
 *     for it).
 *
 * The same predicate also drives the nearby/discover/collective `OR`
 * filter (rows whose date_end is null but whose date_start falls within
 * the 3h grace window stay in the listing).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isPastEvent,
  stillActiveStartCutoffIso,
  DEFAULT_EVENT_DURATION_MS,
} from '@/hooks/use-events'
import type { Tables } from '@/types/database.types'

type Event = Tables<'events'>

/* ------------------------------------------------------------------- */
/*  Helpers                                                             */
/* ------------------------------------------------------------------- */

function aestIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+10:00`
}

/**
 * Build the minimum-shape Event the predicate cares about. Casting through
 * a partial type because `Event` carries dozens of fields irrelevant to
 * the start/end-time gating logic under test.
 */
function eventAt(date_start: string, date_end: string | null = null): Event {
  return { date_start, date_end } as Event
}

/* ------------------------------------------------------------------- */
/*  Fixtures - event on 2026-05-15 starting at 10:00 AEST              */
/* ------------------------------------------------------------------- */

const EVENT_START = aestIso(2026, 5, 15, 10, 0)
const EVENT_END_EXPLICIT_3H = aestIso(2026, 5, 15, 13, 0) // 3h fixed end
const EVENT_END_EXPLICIT_6H = aestIso(2026, 5, 15, 16, 0) // 6h long event

const T_DAY_BEFORE_MORNING = new Date(aestIso(2026, 5, 14, 9, 0))
const T_DAY_BEFORE_NIGHT = new Date(aestIso(2026, 5, 14, 23, 59))
const T_30MIN_BEFORE = new Date(aestIso(2026, 5, 15, 9, 30))
const T_AT_START = new Date(aestIso(2026, 5, 15, 10, 0))
const T_30MIN_AFTER_START = new Date(aestIso(2026, 5, 15, 10, 30))
const T_1H_AFTER_START = new Date(aestIso(2026, 5, 15, 11, 0))
const T_2H_AFTER_START = new Date(aestIso(2026, 5, 15, 12, 0))
const T_2H59MIN_AFTER_START = new Date(aestIso(2026, 5, 15, 12, 59))
const T_EXACTLY_3H_AFTER_START = new Date(aestIso(2026, 5, 15, 13, 0))
const T_3H1MIN_AFTER_START = new Date(aestIso(2026, 5, 15, 13, 1))
const T_4H_AFTER_START = new Date(aestIso(2026, 5, 15, 14, 0))
const T_5H_AFTER_START = new Date(aestIso(2026, 5, 15, 15, 0))
const T_7H_AFTER_START = new Date(aestIso(2026, 5, 15, 17, 0))
const T_NEXT_DAY = new Date(aestIso(2026, 5, 16, 9, 0))

describe('isPastEvent', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('with no explicit date_end (3h grace window applies)', () => {
    const evt = eventAt(EVENT_START, null)

    it('returns false the day before', () => {
      vi.setSystemTime(T_DAY_BEFORE_MORNING)
      expect(isPastEvent(evt)).toBe(false)
    })

    it('returns false at midnight-before-event-day (the day before)', () => {
      vi.setSystemTime(T_DAY_BEFORE_NIGHT)
      expect(isPastEvent(evt)).toBe(false)
    })

    it('returns false 30 minutes before event start', () => {
      vi.setSystemTime(T_30MIN_BEFORE)
      expect(isPastEvent(evt)).toBe(false)
    })

    it('returns false exactly at event start (walk-up window opens)', () => {
      vi.setSystemTime(T_AT_START)
      expect(isPastEvent(evt)).toBe(false)
    })

    it('returns false 30 minutes into the event (walk-up window open)', () => {
      vi.setSystemTime(T_30MIN_AFTER_START)
      expect(isPastEvent(evt)).toBe(false)
    })

    it('returns false 1 hour into the event (mid-event walk-up)', () => {
      vi.setSystemTime(T_1H_AFTER_START)
      expect(isPastEvent(evt)).toBe(false)
    })

    it('returns false 2 hours into the event (late mid-event walk-up)', () => {
      vi.setSystemTime(T_2H_AFTER_START)
      expect(isPastEvent(evt)).toBe(false)
    })

    it('returns false 2h59min into the event (just inside grace)', () => {
      vi.setSystemTime(T_2H59MIN_AFTER_START)
      expect(isPastEvent(evt)).toBe(false)
    })

    it('returns false exactly at the 3h grace boundary (strict less-than)', () => {
      vi.setSystemTime(T_EXACTLY_3H_AFTER_START)
      expect(isPastEvent(evt)).toBe(false)
    })

    it('returns true 1 minute past the 3h grace window', () => {
      vi.setSystemTime(T_3H1MIN_AFTER_START)
      expect(isPastEvent(evt)).toBe(true)
    })

    it('returns true 4 hours after start', () => {
      vi.setSystemTime(T_4H_AFTER_START)
      expect(isPastEvent(evt)).toBe(true)
    })

    it('returns true the next day', () => {
      vi.setSystemTime(T_NEXT_DAY)
      expect(isPastEvent(evt)).toBe(true)
    })
  })

  describe('with explicit date_end (3h event)', () => {
    const evt = eventAt(EVENT_START, EVENT_END_EXPLICIT_3H)

    it('returns false 30 minutes before event start', () => {
      vi.setSystemTime(T_30MIN_BEFORE)
      expect(isPastEvent(evt)).toBe(false)
    })

    it('returns false mid-event (1h in)', () => {
      vi.setSystemTime(T_1H_AFTER_START)
      expect(isPastEvent(evt)).toBe(false)
    })

    it('returns false exactly at date_end (strict less-than)', () => {
      vi.setSystemTime(T_EXACTLY_3H_AFTER_START)
      expect(isPastEvent(evt)).toBe(false)
    })

    it('returns true 1 minute past date_end', () => {
      vi.setSystemTime(T_3H1MIN_AFTER_START)
      expect(isPastEvent(evt)).toBe(true)
    })
  })

  describe('with explicit date_end (long 6h event)', () => {
    const evt = eventAt(EVENT_START, EVENT_END_EXPLICIT_6H)

    it('returns false 5h into a 6h event (explicit end honoured beyond 3h default)', () => {
      vi.setSystemTime(T_5H_AFTER_START)
      expect(isPastEvent(evt)).toBe(false)
    })

    it('returns true 7h after start (past explicit 6h end)', () => {
      vi.setSystemTime(T_7H_AFTER_START)
      expect(isPastEvent(evt)).toBe(true)
    })
  })

  it('DEFAULT_EVENT_DURATION_MS is 3 hours (mirrors event-detail isEventActive)', () => {
    expect(DEFAULT_EVENT_DURATION_MS).toBe(3 * 60 * 60 * 1000)
  })
})

describe('stillActiveStartCutoffIso', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns an ISO string DEFAULT_EVENT_DURATION_MS in the past', () => {
    const now = new Date(aestIso(2026, 5, 15, 12, 0))
    vi.setSystemTime(now)
    const cutoff = stillActiveStartCutoffIso()
    const expected = new Date(now.getTime() - DEFAULT_EVENT_DURATION_MS).toISOString()
    expect(cutoff).toBe(expected)
  })

  it('cutoff is older than now (so PostgREST date_start.gte.<cutoff> matches rows that started within the grace window)', () => {
    vi.setSystemTime(new Date(aestIso(2026, 5, 15, 12, 0)))
    const cutoff = new Date(stillActiveStartCutoffIso()).getTime()
    expect(cutoff).toBeLessThan(Date.now())
    expect(Date.now() - cutoff).toBe(DEFAULT_EVENT_DURATION_MS)
  })
})

/* ------------------------------------------------------------------- */
/*  Scenario-level walkthrough comments                                 */
/* ------------------------------------------------------------------- */

/**
 * The two predicates above gate the Register CTA + the listing filters,
 * but the full register-and-sign-in policy spans a few more layers. This
 * is the integration story they fit into - documented here so the next
 * person reading these tests knows what they DON'T cover:
 *
 *   1. useRegisterForEvent (src/hooks/use-events.ts:585) has no time
 *      gate of its own. It upserts unconditionally, so a walk-up who
 *      somehow reaches the Register CTA (or hits the deep link) registers
 *      successfully at any time. Capacity is checked; if full, the user
 *      is auto-waitlisted.
 *
 *   2. useCodeCheckIn (src/hooks/use-event-tickets.ts:321) and the self
 *      branch of useCheckIn (src/hooks/use-events.ts:821) BOTH upsert
 *      directly to status='attended'. A walk-up who never tapped Register
 *      gets registered + checked in atomically.
 *
 *   3. The BE day-of trigger (supabase/migrations/20260509000000_event_
 *      day_check_in_window.sql) fires BEFORE UPDATE only. INSERT-as-
 *      attended (the day-of walk-up path) bypasses by design. UPDATEs of
 *      existing rows still get the day-of guard, so wrong-day check-ins
 *      and leader-issued check-ins outside the event day are blocked.
 *
 *   4. Leader check-in (UPDATE-only path in useCheckIn, line 846) still
 *      requires the target user to be in status 'registered' or 'invited'
 *      - leaders add unregistered attendees via the WalkInSheet instead
 *      (event_walk_ins table; RLS extended to assist_leaders in
 *      20260523000000_fix_walk_in_rls_assist_leader.sql).
 *
 *   5. The home-card "Tap to Sign In" CTA uses isSignInButtonVisible
 *      (covered in sign-in-button-visibility.test.ts) which gates on
 *      event-day in event tz - generous enough to cover full-day events.
 *
 * Together: at any time a person could realistically attend the event,
 * one path is open (Register CTA, then Check-In; or direct code entry
 * via the standalone /check-in route). Outside the day-of window the BE
 * trigger blocks attempts to retro-mark attendance.
 */
