// Unit tests for the safety-gap sweep predicate + cohort, Deno side (2026-09-01).
// Run: deno test supabase/functions/_tests/safety-contact.test.ts
//
// The vitest suite src/test/safety-gap-nudge.test.ts is the fuller one and is
// what CI runs; it also pins this module against its app-side twin in
// @/lib/dietary, which Deno cannot reach. This file exists because the module
// SHIPS as Deno, and a module that only ever runs under Vite's transform has
// not been proven to run where it actually executes. It caught nothing on the
// first pass; that is the point of running it anyway.
//
// Grounded in the live probe of project tjutlbzekfouwsiaplbr, 2026-09-01:
//   event 02947960 (Wild Mountains, 09-04): 22 live seats, 4 gaps, ALL 4 in
//   the 9 profiles untouched since purchase and none in the 13 touched since
//   the app gate shipped.
//   scope: is_ticketed=true -> 4 events / 60 seats / 6 gaps.
//          every published upcoming event -> 30 events / 279 gaps.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  hasEmergencyContact,
  hasReachableEmergencyContact,
  isEventInNudgeWindow,
  isPlaceholderAnswer,
  MAX_SAFETY_NUDGES,
  NUDGE_MIN_GAP_HOURS,
  NUDGE_WINDOW_MAX_HOURS,
  NUDGE_WINDOW_MIN_HOURS,
  seatsWithoutProfile,
  selectSafetyGapCohort,
  type ContactProfileRow,
  type NudgeLedgerRow,
} from '../_shared/safety-contact.ts'

const NOW = new Date('2026-09-01T10:00:00.000Z')
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3600 * 1000).toISOString()
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600 * 1000).toISOString()

const withContact = (id: string): ContactProfileRow => ({
  id,
  emergency_contact_name: 'Sarah Nguyen',
  emergency_contact_phone: '0403507939',
})
const withoutContact = (id: string): ContactProfileRow => ({
  id,
  emergency_contact_name: null,
  emergency_contact_phone: null,
})

Deno.test('hasEmergencyContact needs both halves', () => {
  assertEquals(hasEmergencyContact(withContact('u')), true)
  assertEquals(hasEmergencyContact({ emergency_contact_name: 'Sarah', emergency_contact_phone: null }), false)
  assertEquals(hasEmergencyContact({ emergency_contact_name: null, emergency_contact_phone: '0403507939' }), false)
  assertEquals(hasEmergencyContact({ emergency_contact_name: '  ', emergency_contact_phone: '040' }), false)
  assertEquals(hasEmergencyContact(null), false)
  assertEquals(hasEmergencyContact(undefined), false)
})

Deno.test('isPlaceholderAnswer catches the dodge strings and nothing else', () => {
  for (const v of ['none', 'None', 'NA', 'na', 'n/a', 'N/A', 'nil', 'Nil', '-', '.', 'Na ', '  n/a  ']) {
    assertEquals(isPlaceholderAnswer(v), true, `expected ${JSON.stringify(v)} to be a placeholder`)
  }
  // "Nan" is a grandmother. Exact match on the trimmed string, never a prefix.
  for (const v of ['Nan', 'Nanette', 'Nilsson', 'None of your business St', '', '   ']) {
    assertEquals(isPlaceholderAnswer(v), false, `expected ${JSON.stringify(v)} to be a real answer`)
  }
  assertEquals(isPlaceholderAnswer(null), false)
  assertEquals(isPlaceholderAnswer(undefined), false)
})

Deno.test('hasReachableEmergencyContact rejects a placeholder in either half', () => {
  assertEquals(hasReachableEmergencyContact(withContact('u')), true)
  assertEquals(hasReachableEmergencyContact({ emergency_contact_name: 'None', emergency_contact_phone: '0403507939' }), false)
  assertEquals(hasReachableEmergencyContact({ emergency_contact_name: 'Sarah', emergency_contact_phone: 'nil' }), false)
  // The live one, 2026-09-01: profile 8735e1d0.
  assertEquals(hasReachableEmergencyContact({ emergency_contact_name: 'Na ', emergency_contact_phone: '422458481' }), false)
})

Deno.test('the cohort is the seat holders with no reachable contact', () => {
  assertEquals(
    selectSafetyGapCohort({
      seats: [{ user_id: 'gap' }, { user_id: 'ok' }, { user_id: null }],
      profiles: [withoutContact('gap'), withContact('ok')],
      alreadySent: [],
      now: NOW,
    }),
    [{ userId: 'gap', followUpNumber: 0 }],
  )
})

Deno.test('one person holding both a ticket and a registration is nudged once', () => {
  assertEquals(
    selectSafetyGapCohort({
      seats: [{ user_id: 'both' }, { user_id: 'both' }],
      profiles: [withoutContact('both')],
      alreadySent: [],
      now: NOW,
    }),
    [{ userId: 'both', followUpNumber: 0 }],
  )
})

Deno.test('a seat with no profile row is skipped and counted', () => {
  const seats = [{ user_id: 'ghost' }, { user_id: 'gap' }]
  const profiles = [withoutContact('gap')]
  assertEquals(
    selectSafetyGapCohort({ seats, profiles, alreadySent: [], now: NOW }).map((t) => t.userId),
    ['gap'],
  )
  assertEquals(seatsWithoutProfile(seats, profiles), 1)
})

Deno.test('the cadence gap is measured from the latest step', () => {
  const recentFirst: NudgeLedgerRow[] = [
    { user_id: 'gap', follow_up_number: 1, sent_at: hoursAgo(1) },
    { user_id: 'gap', follow_up_number: 0, sent_at: hoursAgo(200) },
  ]
  assertEquals(
    selectSafetyGapCohort({ seats: [{ user_id: 'gap' }], profiles: [withoutContact('gap')], alreadySent: recentFirst, now: NOW }),
    [],
  )
  const stale: NudgeLedgerRow[] = [{ user_id: 'gap', follow_up_number: 0, sent_at: hoursAgo(NUDGE_MIN_GAP_HOURS + 1) }]
  assertEquals(
    selectSafetyGapCohort({ seats: [{ user_id: 'gap' }], profiles: [withoutContact('gap')], alreadySent: stale, now: NOW }),
    [{ userId: 'gap', followUpNumber: 1 }],
  )
})

Deno.test('the cap holds and an answered contact stops the cadence early', () => {
  const capped: NudgeLedgerRow[] = Array.from({ length: MAX_SAFETY_NUDGES }, (_, i) => ({
    user_id: 'gap', follow_up_number: i, sent_at: hoursAgo(500 - i),
  }))
  assertEquals(
    selectSafetyGapCohort({ seats: [{ user_id: 'gap' }], profiles: [withoutContact('gap')], alreadySent: capped, now: NOW }),
    [],
  )
  const oneSent: NudgeLedgerRow[] = [{ user_id: 'gap', follow_up_number: 0, sent_at: hoursAgo(500) }]
  assertEquals(
    selectSafetyGapCohort({ seats: [{ user_id: 'gap' }], profiles: [withContact('gap')], alreadySent: oneSent, now: NOW }),
    [],
  )
})

Deno.test('the nudge window opens 12h out and closes at 14 days', () => {
  assertEquals(isEventInNudgeWindow(hoursFromNow(72), NOW), true)
  assertEquals(isEventInNudgeWindow(hoursFromNow(-1), NOW), false)
  assertEquals(isEventInNudgeWindow(hoursFromNow(NUDGE_WINDOW_MIN_HOURS - 1), NOW), false)
  assertEquals(isEventInNudgeWindow(hoursFromNow(NUDGE_WINDOW_MAX_HOURS + 1), NOW), false)
})

Deno.test('two fires over the same data never mail the same step twice', () => {
  // Models UNIQUE(event_id, user_id, follow_up_number) + the ignoreDuplicates
  // upsert returning only rows it actually inserted. That returned list is
  // what the function's send loop iterates, so a step claimed by an earlier
  // fire can never be mailed by a later one.
  const rows: NudgeLedgerRow[] = []
  const claim = (targets: { userId: string; followUpNumber: number }[], at: Date) => {
    const claimed: typeof targets = []
    for (const t of targets) {
      if (rows.some((r) => r.user_id === t.userId && r.follow_up_number === t.followUpNumber)) continue
      rows.push({ user_id: t.userId, follow_up_number: t.followUpNumber, sent_at: at.toISOString() })
      claimed.push(t)
    }
    return claimed
  }
  const seats = [{ user_id: 'gap' }]
  const profiles = [withoutContact('gap')]

  let mailed = 0
  for (let h = 0; h < 24 * 14; h++) {
    const at = new Date(NOW.getTime() + h * 3600 * 1000)
    mailed += claim(selectSafetyGapCohort({ seats, profiles, alreadySent: rows, now: at }), at).length
  }
  assertEquals(mailed, MAX_SAFETY_NUDGES)
  assertEquals(rows.length, MAX_SAFETY_NUDGES)
})
