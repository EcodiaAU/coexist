import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  hasEmergencyContact as appHasEmergencyContact,
  LIVE_REGISTRATION_STATUSES as APP_LIVE_REGISTRATION_STATUSES,
  LIVE_TICKET_STATUSES as APP_LIVE_TICKET_STATUSES,
} from '@/lib/dietary'
import { LIVE_TICKET_STATUSES as EDGE_LIVE_TICKET_STATUSES } from '../../supabase/functions/_shared/ticket-status'
import {
  hasEmergencyContact as edgeHasEmergencyContact,
  hasReachableEmergencyContact,
  isEventInNudgeWindow,
  isPlaceholderAnswer,
  LIVE_REGISTRATION_STATUSES as EDGE_LIVE_REGISTRATION_STATUSES,
  MAX_SAFETY_NUDGES,
  NUDGE_MIN_GAP_HOURS,
  NUDGE_WINDOW_MAX_HOURS,
  NUDGE_WINDOW_MIN_HOURS,
  PLACEHOLDER_ANSWERS,
  seatsWithoutProfile,
  selectSafetyGapCohort,
  type ContactProfileRow,
  type NudgeLedgerRow,
  type SeatRow,
} from '../../supabase/functions/_shared/safety-contact'

/* ------------------------------------------------------------------ */
/*  Outbound safety-gap nudge                                          */
/*                                                                     */
/*  The third reach for an emergency contact. Two already exist and    */
/*  both WORK: the ticket-purchase gate (65646d56) and the app-open    */
/*  backstop dietary-gate.tsx (8c848446). Both fire only when the      */
/*  person opens the app, so a member who bought a seat and never came */
/*  back was asked by nothing.                                         */
/*                                                                     */
/*  Proven 2026-09-01 against tjutlbzekfouwsiaplbr, event 02947960     */
/*  (Wild Mountains, 2026-09-04): of 22 live seats the 13 profiles     */
/*  touched since 2026-08-28 had ZERO gaps and the 9 untouched since   */
/*  purchase held all 4, every one of them a pre-gate buyer. Perfect   */
/*  separation. The rule was never the problem; the reach was.         */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Twin parity                                                        */
/*                                                                     */
/*  The edge module is a deliberate TWIN of src/lib/dietary.ts, for    */
/*  the reason stated in _shared/ticket-status.ts: an edge function    */
/*  bundles from supabase/functions/ and a relative import reaching up */
/*  out of that root is not a shape this repo has ever deployed. A     */
/*  twin is only safe while something fails when the two drift.        */
/* ------------------------------------------------------------------ */

describe('the edge twin cannot drift from the app rule', () => {
  // Every shape the app-side predicate is itself pinned on, plus the awkward
  // ones. A single fixture pair would let a rewritten twin pass by accident.
  const FIXTURES: { emergency_contact_name?: string | null; emergency_contact_phone?: string | null }[] = [
    { emergency_contact_name: 'Sarah', emergency_contact_phone: '0403507939' },
    { emergency_contact_name: 'Sarah', emergency_contact_phone: null },
    { emergency_contact_name: null, emergency_contact_phone: '0403507939' },
    { emergency_contact_name: '  ', emergency_contact_phone: '0403507939' },
    { emergency_contact_name: 'Sarah', emergency_contact_phone: '   ' },
    { emergency_contact_name: '', emergency_contact_phone: '' },
    { emergency_contact_name: 'Mel de Klerk', emergency_contact_phone: '+61 449 791 006' },
    {},
  ]

  it.each(FIXTURES)('agrees with @/lib/dietary on %j', (profile) => {
    expect(edgeHasEmergencyContact(profile)).toBe(appHasEmergencyContact(profile))
  })

  it('agrees on a missing profile rather than throwing', () => {
    expect(edgeHasEmergencyContact(null)).toBe(appHasEmergencyContact(null))
    expect(edgeHasEmergencyContact(undefined)).toBe(appHasEmergencyContact(undefined))
  })

  it('reuses the app registration status set verbatim', () => {
    expect([...EDGE_LIVE_REGISTRATION_STATUSES].sort()).toEqual([...APP_LIVE_REGISTRATION_STATUSES].sort())
  })

  // The ticket half is NOT twinned again: _shared/ticket-status.ts already
  // derives it. This pins that the existing edge set and the app set agree,
  // so the sweep and the gate cannot disagree about who holds a seat.
  it('sweeps the same ticket statuses the gate arms on', () => {
    expect([...EDGE_LIVE_TICKET_STATUSES].sort()).toEqual([...APP_LIVE_TICKET_STATUSES].sort())
  })

  it('counts an organiser hold as a live seat', () => {
    // The 2026-08-28 defect: a `reserved` hold is a named person on a real
    // roster who is the ONLY source of their own emergency contact, and it was
    // excluded, so those two Murbpook holders were never once asked.
    expect(EDGE_LIVE_TICKET_STATUSES).toContain('reserved')
  })
})

/* ------------------------------------------------------------------ */
/*  Placeholders are not answers                                       */
/* ------------------------------------------------------------------ */

describe('isPlaceholderAnswer', () => {
  // The measured failure: a Co-Exist safety count read three people as having
  // declared a medical condition when all three had typed None / NA into the
  // free-text field. The real number was one.
  it.each(['none', 'None', 'NONE', 'na', 'NA', 'n/a', 'N/A', 'nil', 'Nil', '-', '.'])(
    'rejects %s',
    (value) => {
      expect(isPlaceholderAnswer(value)).toBe(true)
    },
  )

  it('rejects a placeholder wearing whitespace', () => {
    // The live one, 2026-09-01: profile 8735e1d0 carries the name "Na " with a
    // trailing space. A comparison that skipped the trim would miss it.
    expect(isPlaceholderAnswer('Na ')).toBe(true)
    expect(isPlaceholderAnswer('  n/a  ')).toBe(true)
  })

  it('does not reject a real answer that merely contains a placeholder word', () => {
    // "Nan" is a grandmother, not a dodge, and this is the whole reason the
    // rule is exact-match on the trimmed string rather than a substring or a
    // startsWith. Same for a surname and a street.
    expect(isPlaceholderAnswer('Nan')).toBe(false)
    expect(isPlaceholderAnswer('Nanette')).toBe(false)
    expect(isPlaceholderAnswer('Nilsson')).toBe(false)
    expect(isPlaceholderAnswer('None of your business St')).toBe(false)
  })

  it('does not call blank a placeholder', () => {
    // Blank is UNANSWERED, which the base predicate already catches. Merging
    // the two states would blur a person who dodged with a person who was
    // never asked, and those want different copy if we ever split the email.
    expect(isPlaceholderAnswer('')).toBe(false)
    expect(isPlaceholderAnswer('   ')).toBe(false)
    expect(isPlaceholderAnswer(null)).toBe(false)
    expect(isPlaceholderAnswer(undefined)).toBe(false)
  })

  it('covers every string the brief named', () => {
    // Pins the list itself, so a later "tidy" that drops one is a failure and
    // not a silent narrowing of the sweep.
    expect([...PLACEHOLDER_ANSWERS].sort()).toEqual(['-', '.', 'n/a', 'na', 'nil', 'none'])
  })
})

describe('hasReachableEmergencyContact', () => {
  it('accepts a real name and a real number', () => {
    expect(hasReachableEmergencyContact(withContact('u1'))).toBe(true)
  })

  it('rejects a half contact', () => {
    // A name with no number is not reachable, which is the whole point.
    expect(hasReachableEmergencyContact({ emergency_contact_name: 'Sarah', emergency_contact_phone: null })).toBe(false)
    expect(hasReachableEmergencyContact({ emergency_contact_name: null, emergency_contact_phone: '0403507939' })).toBe(false)
  })

  it.each(['none', 'NA', 'n/a', 'nil', '-', '.'])('rejects %s as a contact name', (value) => {
    expect(hasReachableEmergencyContact({ emergency_contact_name: value, emergency_contact_phone: '0403507939' })).toBe(false)
  })

  it.each(['none', 'NA', 'n/a', 'nil', '-', '.'])('rejects %s as a contact phone', (value) => {
    expect(hasReachableEmergencyContact({ emergency_contact_name: 'Sarah', emergency_contact_phone: value })).toBe(false)
  })

  it('is strictly stronger than the base rule, never weaker', () => {
    // The two predicates are allowed to disagree in exactly one direction. If
    // the strict one ever accepted somebody the base rule rejected, the sweep
    // would go quiet for a person the app gate is still blocking.
    const shapes = [
      withContact('a'),
      withoutContact('b'),
      { id: 'c', emergency_contact_name: 'None', emergency_contact_phone: '000' },
      { id: 'd', emergency_contact_name: 'Na ', emergency_contact_phone: '422458481' },
      { id: 'e', emergency_contact_name: 'Sarah', emergency_contact_phone: '  ' },
    ]
    for (const s of shapes) {
      if (hasReachableEmergencyContact(s)) expect(edgeHasEmergencyContact(s)).toBe(true)
    }
  })

  it('disagrees with the app gate only on a placeholder', () => {
    // Deliberate and measured. The app gate keeps the looser rule because its
    // form validation accepts any non-blank string: tightening the gate
    // predicate without tightening validation on all three intake surfaces
    // would trap somebody in an undismissable modal that re-opens on every
    // save. Widening the OUTBOUND cohort has no such trap, and cost exactly
    // one person on 2026-09-01 (profile 8735e1d0, holding no upcoming seat).
    const dodge = { emergency_contact_name: 'Na ', emergency_contact_phone: '422458481' }
    expect(appHasEmergencyContact(dodge)).toBe(true)
    expect(hasReachableEmergencyContact(dodge)).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  Who gets nudged                                                    */
/* ------------------------------------------------------------------ */

describe('selectSafetyGapCohort', () => {
  it('picks up a seat holder with no contact and leaves alone one who has it', () => {
    // The core cohort claim. Both people hold a live seat on the same event;
    // the only difference is the contact.
    const targets = selectSafetyGapCohort({
      seats: [{ user_id: 'gap' }, { user_id: 'ok' }],
      profiles: [withoutContact('gap'), withContact('ok')],
      alreadySent: [],
      now: NOW,
    })
    expect(targets).toEqual([{ userId: 'gap', followUpNumber: 0 }])
  })

  it('picks up a half contact', () => {
    const targets = selectSafetyGapCohort({
      seats: [{ user_id: 'half' }],
      profiles: [{ id: 'half', emergency_contact_name: 'Sarah', emergency_contact_phone: null }],
      alreadySent: [],
      now: NOW,
    })
    expect(targets.map((t) => t.userId)).toEqual(['half'])
  })

  it('picks up a placeholder contact', () => {
    const targets = selectSafetyGapCohort({
      seats: [{ user_id: 'dodge' }],
      profiles: [{ id: 'dodge', emergency_contact_name: 'N/A', emergency_contact_phone: 'nil' }],
      alreadySent: [],
      now: NOW,
    })
    expect(targets.map((t) => t.userId)).toEqual(['dodge'])
  })

  it('nudges a person once even when they hold both a ticket and a registration', () => {
    // A ticketed event can carry either artefact and sometimes carries both.
    // Without the dedupe this person gets two emails per step.
    const targets = selectSafetyGapCohort({
      seats: [{ user_id: 'both' }, { user_id: 'both' }],
      profiles: [withoutContact('both')],
      alreadySent: [],
      now: NOW,
    })
    expect(targets).toEqual([{ userId: 'both', followUpNumber: 0 }])
  })

  it('never targets a guest seat, which has no user and no profile', () => {
    // Measured 2026-09-01: zero guest tickets on any upcoming ticketed event,
    // so this is a residual rather than a live hole. It must not crash.
    const seats: SeatRow[] = [{ user_id: null }, { user_id: 'gap' }]
    const targets = selectSafetyGapCohort({
      seats,
      profiles: [withoutContact('gap')],
      alreadySent: [],
      now: NOW,
    })
    expect(targets.map((t) => t.userId)).toEqual(['gap'])
  })

  it('skips a seat whose profile row is missing rather than guessing', () => {
    const seats: SeatRow[] = [{ user_id: 'ghost' }, { user_id: 'gap' }]
    const profiles = [withoutContact('gap')]
    expect(selectSafetyGapCohort({ seats, profiles, alreadySent: [], now: NOW }).map((t) => t.userId))
      .toEqual(['gap'])
    // And it is counted, not silently dropped.
    expect(seatsWithoutProfile(seats, profiles)).toBe(1)
  })

  it('holds off until the cadence gap has passed', () => {
    const sent: NudgeLedgerRow[] = [{ user_id: 'gap', follow_up_number: 0, sent_at: hoursAgo(NUDGE_MIN_GAP_HOURS - 1) }]
    expect(selectSafetyGapCohort({
      seats: [{ user_id: 'gap' }], profiles: [withoutContact('gap')], alreadySent: sent, now: NOW,
    })).toEqual([])
  })

  it('sends the next step once the gap has passed', () => {
    const sent: NudgeLedgerRow[] = [{ user_id: 'gap', follow_up_number: 0, sent_at: hoursAgo(NUDGE_MIN_GAP_HOURS + 1) }]
    expect(selectSafetyGapCohort({
      seats: [{ user_id: 'gap' }], profiles: [withoutContact('gap')], alreadySent: sent, now: NOW,
    })).toEqual([{ userId: 'gap', followUpNumber: 1 }])
  })

  it('measures the gap from the LATEST step, not the first', () => {
    // Rows come back in whatever order PostgREST feels like. Taking the first
    // row's timestamp would let a fresh step through a day early.
    const sent: NudgeLedgerRow[] = [
      { user_id: 'gap', follow_up_number: 1, sent_at: hoursAgo(1) },
      { user_id: 'gap', follow_up_number: 0, sent_at: hoursAgo(200) },
    ]
    expect(selectSafetyGapCohort({
      seats: [{ user_id: 'gap' }], profiles: [withoutContact('gap')], alreadySent: sent, now: NOW,
    })).toEqual([])
  })

  it('stops after the cap', () => {
    const sent: NudgeLedgerRow[] = Array.from({ length: MAX_SAFETY_NUDGES }, (_, i) => ({
      user_id: 'gap', follow_up_number: i, sent_at: hoursAgo(500 - i),
    }))
    expect(selectSafetyGapCohort({
      seats: [{ user_id: 'gap' }], profiles: [withoutContact('gap')], alreadySent: sent, now: NOW,
    })).toEqual([])
  })

  it('stops asking the moment the contact lands, mid-cadence', () => {
    // The point of the whole mechanism. One step sent, then they answered.
    const sent: NudgeLedgerRow[] = [{ user_id: 'gap', follow_up_number: 0, sent_at: hoursAgo(500) }]
    expect(selectSafetyGapCohort({
      seats: [{ user_id: 'gap' }], profiles: [withContact('gap')], alreadySent: sent, now: NOW,
    })).toEqual([])
  })

  it('does not let one person\'s ledger silence another', () => {
    const sent: NudgeLedgerRow[] = [{ user_id: 'other', follow_up_number: 0, sent_at: hoursAgo(1) }]
    expect(selectSafetyGapCohort({
      seats: [{ user_id: 'gap' }, { user_id: 'other' }],
      profiles: [withoutContact('gap'), withoutContact('other')],
      alreadySent: sent,
      now: NOW,
    })).toEqual([{ userId: 'gap', followUpNumber: 0 }])
  })
})

/* ------------------------------------------------------------------ */
/*  Idempotency                                                        */
/*                                                                     */
/*  A safety nudge that re-sends on every fire is worse than no nudge:  */
/*  it teaches the member that the ask is noise. The mechanism is       */
/*  claim-then-send against UNIQUE(event_id, user_id, follow_up_number) */
/*  so the ledger is not a record of what was sent, it is the PERMIT.   */
/*  This models the table's semantics, including the ignoreDuplicates   */
/*  insert returning only the rows it actually claimed.                 */
/* ------------------------------------------------------------------ */

class FakeLedger {
  private rows: NudgeLedgerRow[] = []

  read(): NudgeLedgerRow[] {
    return this.rows.map((r) => ({ ...r }))
  }

  /** upsert(..., { ignoreDuplicates: true }).select() - returns ONLY the rows
   *  this call inserted, which is what the send loop iterates. */
  claim(targets: { userId: string; followUpNumber: number }[], at: Date): { userId: string; followUpNumber: number }[] {
    const claimed: { userId: string; followUpNumber: number }[] = []
    for (const t of targets) {
      const exists = this.rows.some((r) => r.user_id === t.userId && r.follow_up_number === t.followUpNumber)
      if (exists) continue
      this.rows.push({ user_id: t.userId, follow_up_number: t.followUpNumber, sent_at: at.toISOString() })
      claimed.push(t)
    }
    return claimed
  }
}

/** One fire of the sweep for one event: select, claim, and report what would
 *  actually be mailed. */
function sweepOnce(ledger: FakeLedger, seats: SeatRow[], profiles: ContactProfileRow[], now: Date) {
  const targets = selectSafetyGapCohort({ seats, profiles, alreadySent: ledger.read(), now })
  return ledger.claim(targets, now)
}

describe('running the sweep twice does not send twice', () => {
  const seats: SeatRow[] = [{ user_id: 'gap' }]
  const profiles = [withoutContact('gap')]

  it('sends on the first fire and nothing on the second', () => {
    const ledger = new FakeLedger()
    expect(sweepOnce(ledger, seats, profiles, NOW)).toEqual([{ userId: 'gap', followUpNumber: 0 }])
    // The cron fires every hour. The second fire is the one that would have
    // produced the duplicate-storm shape.
    const oneHourLater = new Date(NOW.getTime() + 3600 * 1000)
    expect(sweepOnce(ledger, seats, profiles, oneHourLater)).toEqual([])
    expect(ledger.read()).toHaveLength(1)
  })

  it('stays silent across a whole day of hourly fires', () => {
    const ledger = new FakeLedger()
    let mailed = 0
    for (let h = 0; h < 24; h++) {
      mailed += sweepOnce(ledger, seats, profiles, new Date(NOW.getTime() + h * 3600 * 1000)).length
    }
    // One email in 24 fires, because 24h is inside NUDGE_MIN_GAP_HOURS.
    expect(mailed).toBe(1)
    expect(ledger.read()).toHaveLength(1)
  })

  it('spends the whole cadence and then stops for good', () => {
    const ledger = new FakeLedger()
    let mailed = 0
    // A fortnight of hourly fires: long enough for every step of the cadence
    // and then some. The cap is what stops it at three.
    for (let h = 0; h < 24 * 14; h++) {
      mailed += sweepOnce(ledger, seats, profiles, new Date(NOW.getTime() + h * 3600 * 1000)).length
    }
    expect(mailed).toBe(MAX_SAFETY_NUDGES)
    expect(ledger.read().map((r) => r.follow_up_number).sort()).toEqual([0, 1, 2])
  })

  it('survives two fires landing at the same instant', () => {
    // Two cron fires overlapping (a slow run, a manual invoke) both select the
    // same target because neither has written yet. The claim is what makes the
    // second one a no-op, which is why the insert precedes the send.
    const ledger = new FakeLedger()
    const targetsA = selectSafetyGapCohort({ seats, profiles, alreadySent: ledger.read(), now: NOW })
    const targetsB = selectSafetyGapCohort({ seats, profiles, alreadySent: ledger.read(), now: NOW })
    expect(targetsA).toEqual(targetsB)
    expect(ledger.claim(targetsA, NOW)).toHaveLength(1)
    expect(ledger.claim(targetsB, NOW)).toHaveLength(0)
  })
})

/* ------------------------------------------------------------------ */
/*  Timing                                                             */
/* ------------------------------------------------------------------ */

describe('isEventInNudgeWindow', () => {
  it('nudges an event that is days away', () => {
    expect(isEventInNudgeWindow(hoursFromNow(72), NOW)).toBe(true)
  })

  it('does not nudge an event that has already started', () => {
    expect(isEventInNudgeWindow(hoursFromNow(-1), NOW)).toBe(false)
  })

  it('goes quiet inside the last half day', () => {
    // At that point the member is travelling and the person who needs the
    // answer is the organiser holding the roster, not an inbox.
    expect(isEventInNudgeWindow(hoursFromNow(NUDGE_WINDOW_MIN_HOURS - 1), NOW)).toBe(false)
    expect(isEventInNudgeWindow(hoursFromNow(NUDGE_WINDOW_MIN_HOURS + 1), NOW)).toBe(true)
  })

  it('does not chase an event that is still a month out', () => {
    expect(isEventInNudgeWindow(hoursFromNow(NUDGE_WINDOW_MAX_HOURS + 1), NOW)).toBe(false)
    expect(isEventInNudgeWindow(hoursFromNow(NUDGE_WINDOW_MAX_HOURS - 1), NOW)).toBe(true)
  })

  it('leaves room for the whole cadence', () => {
    // The window has to be wide enough to spend MAX_SAFETY_NUDGES steps at
    // NUDGE_MIN_GAP_HOURS apart, or the cap is decorative and the last step
    // never fires.
    const spanNeeded = (MAX_SAFETY_NUDGES - 1) * NUDGE_MIN_GAP_HOURS
    expect(NUDGE_WINDOW_MAX_HOURS - NUDGE_WINDOW_MIN_HOURS).toBeGreaterThan(spanNeeded)
  })
})

/* ------------------------------------------------------------------ */
/*  Scope                                                              */
/*                                                                     */
/*  The is_ticketed filter is the difference between 6 emails and 279. */
/*  A type cannot hold that, so the guard is a source scan, the same    */
/*  shape as the guest-checkout payload guard in                        */
/*  safety-gate-coverage.test.ts.                                       */
/* ------------------------------------------------------------------ */

describe('the sweep asks exactly who the app-open gate would ask', () => {
  const ROOT = path.resolve(__dirname, '../..')
  const FN = path.join(ROOT, 'supabase/functions/event-safety-gap-nudge/index.ts')
  const GATE = path.join(ROOT, 'src/components/dietary-gate.tsx')

  it('filters on is_ticketed, as the gate does', () => {
    // Measured 2026-09-01: ticketed-only is 4 events / 60 seats / 6 gaps.
    // Every upcoming published event is 30 events / 279 gaps, of which Merri
    // Mornings alone is 108 of 148 - people at a two-hour beach clean-up who
    // were never asked for a contact and do not need to be.
    const fn = fs.readFileSync(FN, 'utf8')
    const gate = fs.readFileSync(GATE, 'utf8')
    expect(gate).toContain('is_ticketed')
    expect(fn).toContain("'is_ticketed', true")
  })

  it('only looks at published events', () => {
    expect(fs.readFileSync(FN, 'utf8')).toContain("'status', 'published'")
  })

  it('keeps the test collective out', () => {
    // The null-safe second line of defence, mirroring event-reminders. A test
    // event firing live mail at real members is the failure this stops.
    const fn = fs.readFileSync(FN, 'utf8')
    expect(fn).toContain("collectives.slug")
    expect(fn).toContain('isTestEvent')
  })

  it('reads the shared predicate rather than hand-rolling the rule', () => {
    // Three surfaces have drifted before by re-deciding what "has a contact"
    // means at the call site. This one imports it.
    const fn = fs.readFileSync(FN, 'utf8')
    expect(fn).toContain("from '../_shared/safety-contact.ts'")
    expect(fn).not.toMatch(/emergency_contact_name\s*\?\?\s*''/)
  })

  it('claims before it sends', () => {
    // The idempotency mechanism, pinned in source because the order is the
    // whole thing: an upsert AFTER the invoke would re-send on every fire that
    // raced or errored. The .select() is what makes the claim observable.
    //
    // Anchored on the CALL, not on the table name. The first draft of this
    // assertion took `indexOf('event_safety_nudges_sent')`, which matched the
    // name inside this function's own header comment, several hundred lines
    // above any code. A negative control that inserted a send-email invoke
    // ABOVE the real claim passed it. A source guard anchored on prose is not
    // a guard, it is a comment that throws.
    const fn = fs.readFileSync(FN, 'utf8')
    const claimAt = fn.search(/\.from\('event_safety_nudges_sent'\)\s*\n\s*\.upsert\(/)
    const sendAt = fn.indexOf("functions.invoke('send-email'")
    expect(claimAt).toBeGreaterThan(-1)
    expect(sendAt).toBeGreaterThan(-1)
    expect(fn).toContain('ignoreDuplicates: true')
    expect(claimAt).toBeLessThan(sendAt)
    // And nothing mails ahead of the claim by another route.
    expect(fn.slice(0, claimAt)).not.toContain("functions.invoke('send-email'")
  })

  it('mails only the rows its own claim returned', () => {
    // Found by negative control, 2026-09-01, on this very file: DELETING the
    // `.select(...)` from the claim left all 64 files / 759 tests green. That
    // one line is the whole permit. Without it supabase-js sends no
    // `return=representation`, `data` comes back null, the claim result is
    // empty, and the sweep mails NOBODY for ever while still answering
    // success:true with emails_sent 0. A silent total kill, uncaught.
    //
    // The sibling assertion above pins the ORDER of claim and send. Nothing
    // pinned that the claim's RESULT is what gates the loop, and the order is
    // only half the mechanism: a claim nobody reads is a log line, not a
    // permit. Iterating the COHORT instead would re-mail every eligible person
    // on every hourly fire, which is the duplicate storm the ledger exists to
    // stop.
    //
    // Anchored structurally rather than on identifier names, for the same
    // reason the assertion above is anchored on the call and not the table
    // name: a guard that a rename can silently satisfy is not a guard.
    const fn = fs.readFileSync(FN, 'utf8')
    const claimAt = fn.search(/\.from\('event_safety_nudges_sent'\)\s*\n\s*\.upsert\(/)
    const sendAt = fn.indexOf("functions.invoke('send-email'")
    expect(claimAt).toBeGreaterThan(-1)
    expect(sendAt).toBeGreaterThan(-1)

    const claimToSend = fn.slice(claimAt, sendAt)

    // 1. The claim asks for its inserted rows back, and the ask is part of the
    //    CLAIM'S OWN chain. Scoping this to the whole claim-to-send region was
    //    itself a hole, found by negative control on 2026-09-01: delete the
    //    `.select()` from the upsert AND add an unrelated
    //    `.from('profiles').select('id, email')` lookup between the claim and
    //    the send, and all 76 tests stayed green with the permit gone. That is
    //    the same silent total kill this test was written to catch, reachable
    //    by an ordinary future edit. The claim statement ends at the first
    //    blank line, so a `.select` borrowed from a later query cannot satisfy
    //    it, and requiring `.upsert(` before it pins the order within the chain.
    const claimStmtEnd = fn.indexOf('\n\n', claimAt)
    expect(claimStmtEnd).toBeGreaterThan(claimAt)
    expect(fn.slice(claimAt, claimStmtEnd)).toMatch(/\.upsert\([\s\S]*\.select\(/)

    // 2. The claim's returned data is bound to a name.
    const dataBinding = fn.slice(0, claimAt).match(/const \{\s*data:\s*(\w+)[^}]*\}\s*=\s*await\s*$|const \{\s*data:\s*(\w+)[^}]*\}\s*=\s*await[\s\S]{0,80}$/)
    expect(dataBinding, 'the claim does not bind its returned data').not.toBeNull()
    const claimData = (dataBinding![1] ?? dataBinding![2]) as string

    // 3. The send loop iterates a value derived from that data, not the cohort.
    const loop = claimToSend.match(/for \(const (\w+) of (\w+)\)/)
    expect(loop, 'no send loop between the claim and the send').not.toBeNull()
    const rowVar = loop![1]
    const sourceVar = loop![2]
    const derives = new RegExp(`(const|let)\\s+${sourceVar}\\s*=[^\\n]*\\b${claimData}\\b`)
    expect(claimToSend).toMatch(derives)

    // 4. And the address it mails comes off that claimed row.
    expect(fn.slice(sendAt, sendAt + 800)).toContain(`${rowVar}.user_id`)
  })

  it('judges the window in the audience wall-clock frame, not real UTC', () => {
    // `events.date_start` is stored wall-clock-as-UTC (floating-local, since
    // 2026-05-26). Comparing it against real UTC `now` measures a gap wrong by
    // the audience offset, which event-reminders documents ("would fire the
    // audience-offset hours late, 10h for AEST") and solves with
    // wallClockNowInTz. The first cut of this sweep did not, and the arithmetic
    // below is what that cost.
    const fn = fs.readFileSync(FN, 'utf8')

    // The tz columns have to be SELECTED or the helper has nothing to read.
    expect(fn).toContain('timezone, collectives!inner(timezone, slug)')
    expect(fn).toContain('function audienceTzFor')
    expect(fn).toContain('function wallClockNowInTz')

    // The window test takes the converted clock.
    expect(fn).toMatch(/isEventInNudgeWindow\(\s*event\.date_start,\s*wallClockNowInTz\(audienceTzFor\(event\)\)\s*\)/)

    // And the SQL pre-filter is WIDER than the window, or an event is dropped
    // before the accurate test can judge it.
    expect(fn).toContain('TZ_PADDING_HOURS')
    expect(fn).toMatch(/NUDGE_WINDOW_MIN_HOURS - TZ_PADDING_HOURS/)
    expect(fn).toMatch(/NUDGE_WINDOW_MAX_HOURS \+ TZ_PADDING_HOURS/)

    // The padding VALUE has to cover the widest audience offset or the SQL
    // stops being a superset of the accurate window and events fall out before
    // the accurate test can judge them. Hobart in DST is +11. Pinning only the
    // EXPRESSIONS was a hole: a negative control set the constant to 0 and
    // every assertion above stayed green, while for a +10 audience the top ten
    // hours of the fourteen-day window went dark.
    const padding = Number(fn.match(/const TZ_PADDING_HOURS = (\d+)/)?.[1])
    expect(padding).toBeGreaterThanOrEqual(11)

    // And the audience tz is actually READ off the event and its collective.
    // Another negative control replaced the body of audienceTzFor with a bare
    // 'Australia/Brisbane' and stayed green, which would judge Perth (+8) two
    // hours out and Hobart in DST (+11) one hour out. Measured 2026-09-01: all
    // 18 collectives carry a real IANA zone spanning +8 to +11, all 468 events
    // carry timezone NULL, and Murbpook (Adelaide, +9:30, 2026-09-19) is a
    // live ticketed event. Not theoretical.
    const tzFnAt = fn.indexOf('function audienceTzFor')
    expect(tzFnAt).toBeGreaterThan(-1)
    const tzFn = fn.slice(tzFnAt, fn.indexOf('\n}', tzFnAt))
    expect(tzFn).toMatch(/event\.timezone/)
    expect(tzFn).toMatch(/collectives\?\.timezone/)
  })

  it('keeps the cadence on the real clock, not the audience clock', () => {
    // Two clocks, two jobs. `event_safety_nudges_sent.sent_at` defaults to the
    // database's real now(), so measuring the 48h gap against a wall-clock
    // shifted by the audience offset would move every gap by that offset. The
    // cohort call must receive the REAL now.
    const fn = fs.readFileSync(FN, 'utf8')
    const cohortCall = fn.slice(
      fn.indexOf('selectSafetyGapCohort({'),
      fn.indexOf('selectSafetyGapCohort({') + 220,
    )
    expect(cohortCall).toContain('now,')
    expect(cohortCall).not.toContain('wallClockNowInTz')

    // And the real now is what reaches nudgeEvent in the first place. Pinning
    // only the cohort call was a hole: a negative control passed
    // wallClockNowInTz at THIS call site and every assertion above stayed
    // green, while each 48h gap moved by the audience offset (down to 38h for
    // a +10 audience), so the cadence would nudge earlier than it promises.
    expect(fn).toMatch(/nudgeEvent\(\s*supabase,\s*event,\s*now\s*\)/)
  })

  it('the 12h floor is 12h before the REAL start for a +10 audience', () => {
    // The measured defect, 2026-09-01, on Wild Mountains (2026-09-04 14:00
    // local, +10): judged against real UTC now the sweep stopped 2.0h before
    // the event actually began, landing on top of the 2h reminder the floor
    // exists to stay clear of. This pins the arithmetic rather than the source.
    const OFFSET_H = 10
    const storedStart = new Date('2026-09-04T14:00:00.000Z') // wall-clock-as-UTC
    const realStart = new Date(storedStart.getTime() - OFFSET_H * 3600 * 1000)

    // Wall-clock now in the audience tz, at the instant the floor should bite.
    const realNowAtFloor = new Date(realStart.getTime() - NUDGE_WINDOW_MIN_HOURS * 3600 * 1000)
    const wallClockAtFloor = new Date(realNowAtFloor.getTime() + OFFSET_H * 3600 * 1000)

    // Correct frame: exactly on the floor, so still in the window.
    expect(isEventInNudgeWindow(storedStart, wallClockAtFloor)).toBe(true)
    // One minute later it has closed.
    expect(isEventInNudgeWindow(storedStart, new Date(wallClockAtFloor.getTime() + 60_000))).toBe(false)

    // The naive frame keeps nudging until only 2h remain before the real start.
    const twoHoursOut = new Date(realStart.getTime() - 2 * 3600 * 1000)
    expect(isEventInNudgeWindow(storedStart, twoHoursOut)).toBe(true)
  })

  it('wallClockNowInTz converts the real clock, and survives a DST boundary', () => {
    // Until now wallClockNowInTz and audienceTzFor had ZERO executable
    // coverage: every assertion about them was a text match on this file,
    // which proves the source contains a string and nothing whatever about
    // what it computes. That is the weakest possible guard on the one helper
    // that decides whether a safety email goes out.
    //
    // This executes THE REAL SOURCE, lifted out of index.ts, so it cannot pass
    // against a drifted copy. The function is pure and closes over nothing but
    // Intl and Date, which is what makes lifting it honest rather than a
    // re-implementation.
    const fn = fs.readFileSync(FN, 'utf8')
    const at = fn.indexOf('function wallClockNowInTz')
    expect(at).toBeGreaterThan(-1)
    // The lifted source is TypeScript, and new Function parses JavaScript, so
    // the annotations come off. Deliberately a strip and not a transpile: if
    // the helper ever grows a construct that needs real compilation, this
    // throws and the test reds, which is the safe direction.
    const src = fn.slice(at, fn.indexOf('\n}', at) + 2).replace(/:\s*(?:string|Date)\b/g, '')
    const wallClockNowInTz = new Function(`${src}; return wallClockNowInTz`)() as (tz: string) => Date

    vi.useFakeTimers()
    try {
      // Australian DST starts at 2am on the first Sunday in October, which in
      // 2026 is the 4th. Hobart is +10 the day before and +11 the day after,
      // and the 12h padding has to cover that wider one.
      vi.setSystemTime(new Date('2026-10-03T00:00:00.000Z'))
      expect(wallClockNowInTz('Australia/Hobart').toISOString()).toBe('2026-10-03T10:00:00.000Z')
      vi.setSystemTime(new Date('2026-10-05T00:00:00.000Z'))
      expect(wallClockNowInTz('Australia/Hobart').toISOString()).toBe('2026-10-05T11:00:00.000Z')

      // Brisbane never shifts, and Perth is the other end of the AU spread.
      expect(wallClockNowInTz('Australia/Brisbane').toISOString()).toBe('2026-10-05T10:00:00.000Z')
      expect(wallClockNowInTz('Australia/Perth').toISOString()).toBe('2026-10-05T08:00:00.000Z')
      // Adelaide is the half-hour zone, which a naive integer-offset
      // implementation would round away.
      expect(wallClockNowInTz('Australia/Adelaide').toISOString()).toBe('2026-10-05T10:30:00.000Z')

      // Midnight is the hour-24 footgun the helper explicitly guards. The date
      // must not slide a day either way.
      vi.setSystemTime(new Date('2026-09-03T14:00:00.000Z'))
      expect(wallClockNowInTz('Australia/Brisbane').toISOString()).toBe('2026-09-04T00:00:00.000Z')
    } finally {
      vi.useRealTimers()
    }
  })

  it('the hour-24 midnight guard keeps the date on the same day', () => {
    // The last branch of wallClockNowInTz that nothing else can reach. Node's
    // ICU answers '00' for midnight, so on this runtime the guard is dead code
    // and the DST test above cannot exercise it. Deno's ICU is a different
    // build, and older ICU famously answered '24' with the date of the day the
    // midnight BEGINS. If the guard mapped that to the wrong day the window
    // would swing a full 24 hours on a safety send, so pin the direction by
    // feeding the helper the '24' its guard exists for.
    const fn = fs.readFileSync(FN, 'utf8')
    const at = fn.indexOf('function wallClockNowInTz')
    const src = fn.slice(at, fn.indexOf('\n}', at) + 2).replace(/:\s*(?:string|Date)\b/g, '')

    const parts = [
      { type: 'year', value: '2026' }, { type: 'month', value: '09' },
      { type: 'day', value: '04' }, { type: 'hour', value: '24' },
      { type: 'minute', value: '00' }, { type: 'second', value: '00' },
    ]
    const FakeIntl = { DateTimeFormat: class { formatToParts() { return parts } } }
    const lifted = new Function('Intl', `${src}; return wallClockNowInTz`)(FakeIntl) as (
      tz: string,
    ) => Date

    // Hour 24 on the 4th is midnight that STARTS the 4th, so the date must not
    // move to the 3rd or the 5th.
    expect(lifted('Australia/Brisbane').toISOString()).toBe('2026-09-04T00:00:00.000Z')
  })

  it('an event already in progress is never nudged, though the padded SQL admits it', () => {
    // The SQL lower bound is NUDGE_WINDOW_MIN_HOURS - TZ_PADDING_HOURS, which
    // is 0, so the pre-filter is `date_start >= now`. Because date_start is
    // stored wall-clock-as-UTC, that admits an event which really began up to
    // the audience offset ago: ten hours, for Brisbane. The per-event
    // predicate is then the ONLY thing standing between an in-progress event
    // and a safety email, so pin it directly rather than trusting the SQL.
    const OFFSET_H = 10
    const storedStart = new Date('2026-09-04T14:00:00.000Z')
    const realStart = new Date(storedStart.getTime() - OFFSET_H * 3600 * 1000)
    const wallAt = (real: Date) => new Date(real.getTime() + OFFSET_H * 3600 * 1000)

    // A minute after the event really began.
    expect(
      isEventInNudgeWindow(storedStart, wallAt(new Date(realStart.getTime() + 60_000))),
    ).toBe(false)
    // And the worst case the padded SQL still lets through: date_start exactly
    // equal to real now, which is ten hours into the event.
    expect(isEventInNudgeWindow(storedStart, wallAt(storedStart))).toBe(false)
    // The hour before it starts is rejected too; the floor is 12h, not 0.
    expect(
      isEventInNudgeWindow(storedStart, wallAt(new Date(realStart.getTime() - 3600 * 1000))),
    ).toBe(false)
  })

  it('sends a type send-email actually knows', () => {
    // send-email 400s on an unknown type, so a template that is registered in
    // one file and named in another is a silent no-send.
    const sender = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-email/index.ts'), 'utf8')
    const fn = fs.readFileSync(FN, 'utf8')
    expect(fn).toContain("type: 'safety_contact_missing'")
    expect(sender).toContain('safety_contact_missing: {')
    expect(sender).toContain('safety_contact_missing: (d) => emailShell({')
  })

  it('is not gated by a notification preference', () => {
    // Duty of care for a named person on a real roster is not a newsletter.
    // Same call as ticket_refunded, and the failure this stops is a member who
    // muted event reminders never being asked for an emergency contact.
    const sender = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-email/index.ts'), 'utf8')
    const prefMap = sender.slice(
      sender.indexOf('const TYPE_TO_PREF_KEY'),
      sender.indexOf('}', sender.indexOf('const TYPE_TO_PREF_KEY')),
    )
    expect(prefMap).not.toContain('safety_contact_missing')
  })

  it('is declared in config.toml, or deploy-fn.sh refuses the whole batch', () => {
    const toml = fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8')
    expect(toml).toContain('[functions.event-safety-gap-nudge]')
  })
})
