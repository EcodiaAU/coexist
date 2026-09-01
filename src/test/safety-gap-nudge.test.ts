import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
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

  /**
   * ONE parse of index.ts, blanking the CONTENT of every comment to spaces
   * (and, when `literals` is set, of every string, template and regex literal
   * too). Byte offsets and newlines are preserved, so every indexOf and slice
   * below means exactly what it would on the raw source.
   *
   * Every source-text guard in this file was once satisfiable by a COMMENT,
   * and the comment is the one a developer writes while making the very change
   * the guard exists to catch. Six negative controls, 2026-09-01, each left all
   * 79 tests green with the mechanism broken:
   *   - delete the claim's .select() and leave "the .select( ask was moved out
   *     of this chain" as a comment. That is the silent total kill: no
   *     return=representation, `claimed` empty, the sweep mails NOBODY for
   *     ever and still answers success:true.
   *   - the same kill with the token hidden inside a console.log string.
   *   - pass the wall clock at the nudgeEvent call site and leave the old call
   *     behind as a "was:" comment.
   *   - set TZ_PADDING_HOURS to 0 and mention the old declaration in the doc
   *     comment ABOVE it, which .match reaches first.
   *   - hardcode audienceTzFor and leave the old body commented out inside it.
   *   - add `{ head: true }` to the claim, which keeps the `.select(` the
   *     guard greps for and suppresses the response body anyway.
   *
   * WHY THE PARSER AND NOT A HAND-ROLLED READER. Five independent passes each
   * found a hole in a reader that decided for itself where a comment starts,
   * and every fix was correct and opened the next question:
   *   - two chained regexes have to pick an order, and BOTH orders are wrong.
   *     Block-comments-first: a slash-star written inside a line comment opens
   *     a block the author never opened, and the blank runs to the next
   *     terminator anywhere below, taking real code with it.
   *     Line-comments-first: the mirror image. A slash-slash inside a block
   *     comment whose terminator sits on the SAME line eats that terminator,
   *     so the block never closes and the blank cascades exactly as before.
   *   - a single left-to-right pass where the first delimiter wins has no
   *     order to get wrong, and still knew only two of the three literals
   *     JavaScript has. A regex is the commonest literal that CARRIES both
   *     comment delimiters: a host test ends in a bare slash-slash, and a
   *     character class holding a slash and a star opens a block.
   *   - reading the regex needs a rule for where a slash may open one, and
   *     that rule is the part a reader cannot get right on its own. Anchoring
   *     it on the last significant code character is exact after an operator
   *     or a keyword and a GUESS after `)`, because only a parser knows
   *     whether that paren closed an `if` head (statement position, so a
   *     regex) or a call (expression position, so division). Measured
   *     2026-09-01, deno-clean and eslint-clean, all 81 tests GREEN with the
   *     guess live: an `if (preview) /^https?:\/\//.test(...)` placed AHEAD of
   *     the claim, wrapping a real send-email invoke in its argument, mails
   *     before the permit exists on every fire, and the guard that bans a
   *     send ahead of the claim went green because the reader took the
   *     regex's own slash-slash for a line comment and wiped the invoke off
   *     the line. The matched control without the regex reds two tests.
   *
   * So the reader stops guessing. TypeScript parses the file, and the parse
   * answers the only question a reader ever needed: which byte ranges are
   * TOKENS. Everything between two consecutive tokens is trivia, and trivia
   * holds nothing but whitespace and comments, so a slash there is
   * unambiguously a comment opener and there is no ambiguity left to resolve.
   * A regex literal is a token the parser hands back already delimited, which
   * is the third-literal problem gone rather than approximated. Proof this is
   * the same instrument and not merely a new one: on the real index.ts it is
   * BYTE-IDENTICAL to the reader it replaces in both modes, and it differs
   * only on the adversarial shapes pinned below, where the old reader was
   * wrong.
   */
  const scanSource = (t: string, literals: boolean) => {
    const out = t.split('')
    const wipe = (from: number, to: number) => {
      for (let k = Math.max(0, from); k < Math.min(to, out.length); k++) {
        if (out[k] !== '\n') out[k] = ' '
      }
    }

    // Deno strips a byte order mark BEFORE it strips the shebang, and the
    // TypeScript parser accepts `#!` only at offset zero, so one BOM makes the
    // parser read the whole shebang line as CODE and every token on it
    // survives into the answer. That is the line-no-token-covers hole one
    // variant along, and it is live: measured 2026-09-01 on this subject, a
    // file opening `\uFEFF#!/usr/bin/env -S deno run .eq('is_ticketed', true)`
    // with the real filter deleted is `deno check` RC 0 and 81 of 81 GREEN,
    // and `deno check` is the ONLY compile gate here because the root
    // tsconfig resolves zero supabase/functions files. So the line is blanked
    // up front on Deno's own rule instead of inside the gap walk, where the
    // parser has already claimed those bytes as tokens and there is no gap
    // left to scan. At most one BOM, because two is TS18026 and a space or a
    // newline before the `#!` is a SyntaxError, so none of those can ship.
    const bomWidth = t.charCodeAt(0) === 0xfeff ? 1 : 0
    let shebangEnd = 0
    if (t[bomWidth] === '#' && t[bomWidth + 1] === '!') {
      shebangEnd = bomWidth + 2
      while (shebangEnd < t.length && t[shebangEnd] !== '\n') shebangEnd++
      wipe(0, shebangEnd)
    }

    const sf = ts.createSourceFile('read.ts', t, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

    // Leaf tokens, in source order. JSDoc is skipped rather than walked, so a
    // doc comment attached to a declaration stays trivia and is blanked with
    // every other comment instead of being read as a run of tokens.
    const isJsDoc = (n: ts.Node) =>
      n.kind >= ts.SyntaxKind.FirstJSDocNode && n.kind <= ts.SyntaxKind.LastJSDocNode
    const tokens: ts.Node[] = []
    const collect = (n: ts.Node) => {
      if (isJsDoc(n)) return
      // The end-of-file token is a leaf, and it is the one leaf the generic
      // has-children test loses. `getChildren` on it answers with its ATTACHED
      // JSDoc when a file ends in a doc comment, so it reads as a branch, the
      // walk recurses, the only child is JSDoc and is skipped, and the token
      // is never pushed. Nothing then follows the last real token, so the gap
      // that holds every trailing comment is never scanned and the whole tail
      // of the file stays readable. Measured 2026-09-01 on this very subject:
      // deleting `.eq('is_ticketed', true)` and appending a trailing
      // `/** .eq('is_ticketed', true) */` was deno-clean and 81 of 81 GREEN,
      // while the same mutation with a plain `/*` terminator RED, and both
      // RED under the hand-rolled reader this one replaced. One asterisk was
      // the whole difference, and the defect it hid widens the sweep from 4
      // ticketed events to every published one.
      if (n.kind === ts.SyntaxKind.EndOfFileToken) {
        tokens.push(n)
        return
      }
      const kids = n.getChildren(sf)
      if (!kids.length) tokens.push(n)
      else for (const k of kids) collect(k)
    }
    collect(sf)

    let cursor = 0
    for (const tok of tokens) {
      const start = tok.getStart(sf)
      // The gap before this token. Whitespace and comments only.
      let i = cursor
      while (i < start) {
        // The shebang line is already blanked above, on the rule the runtime
        // uses rather than the one the parser uses. Step over it so the
        // comment rules below never read inside it: a shebang may legally
        // carry `//` or `/*` in an argument, and letting the block-comment
        // branch open there would blank forward into real code.
        if (i < shebangEnd) {
          i = shebangEnd
          continue
        }
        if (t[i] === '/' && t[i + 1] === '/') {
          let j = i + 2
          while (j < start && t[j] !== '\n') j++
          wipe(i, j)
          i = j
          continue
        }
        if (t[i] === '/' && t[i + 1] === '*') {
          let j = i + 2
          while (j < t.length && !(t[j] === '*' && t[j + 1] === '/')) j++
          const end = Math.min(j + 2, t.length)
          wipe(i, end)
          i = end
          continue
        }
        i++
      }
      cursor = Math.max(cursor, tok.getEnd())

      if (!literals) continue
      const a = start
      const b = tok.getEnd()
      switch (tok.kind) {
        // A string and a regex go entirely, delimiters included.
        case ts.SyntaxKind.StringLiteral:
        case ts.SyntaxKind.RegularExpressionLiteral:
          wipe(a, b)
          break
        // A template keeps its delimiters, because its `${}` bodies are CODE
        // and the offsets around them have to stay readable. Only the text
        // between them goes. That is what makes a nested backtick pair with
        // the right partner: a reader that swallowed the whole literal left
        // the inner text outside every match and it survived into `codeOnly`
        // as if it were code.
        case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        case ts.SyntaxKind.TemplateTail:
          wipe(a + 1, b - 1)
          break
        case ts.SyntaxKind.TemplateHead:
        case ts.SyntaxKind.TemplateMiddle:
          wipe(a + 1, b - 2)
          break
      }
    }

    return out.join('')
  }

  const blankComments = (t: string) => scanSource(t, false)

  const readSource = () => blankComments(fs.readFileSync(FN, 'utf8'))

  /**
   * Blanks string and template literals too, for the two assertions that pin a
   * SHAPE rather than a value. Those are the ones a borrowed token can satisfy:
   * a negative control that deleted the claim's `.select()` and left the text
   * `.select(` inside a console.log string passed the chain assertion below
   * with the permit dead. Everything else in this file reads the raw string
   * literals on purpose, because there the literal IS the thing being pinned
   * (the column list, the conflict target, the is_ticketed filter).
   */
  const codeOnly = (t: string) => scanSource(t, true)

  /**
   * The claim's own EXPRESSION, taken from the parse.
   *
   * Every bound this guard has picked for itself became the next hole. It was
   * first the whole claim-to-send slice, which a neighbouring
   * `.from('profiles').select('id, email')` satisfied. Then it was the next
   * BLANK LINE, and deleting one empty line put that neighbour back inside it.
   * Then it was the enclosing STATEMENT, reached by walking up until the
   * PARENT was a Block, and that is the bound this replaces: a statement in an
   * unbraced `case` clause has a CaseClause for a parent, not a Block, so the
   * walk ran on to the whole `switch` and borrowed a `.select(` from a sibling
   * statement. Measured 2026-09-01 on this subject, with the claim moved into
   * a `default:` clause, its own `.select()` DELETED and an ordinary
   * `supabase.from('profiles').select('id')` beside it: `deno check` RC 0 and
   * 81 of 81 GREEN, the same silent total kill as every bound before it.
   *
   * So the walk stops the moment the PARENT stops being part of an expression.
   * Scored over 18 shapes, the Block bound borrowed a neighbour in 7 of them
   * and this one in 0. `isSourceFile` and `isModuleBlock` are terminators
   * rather than boundaries: a top-level statement IS a statement, so the walk
   * stops one level below them and neither is reachable here. They red 0 of 9
   * fixtures, so nothing pins them and nothing can.
   */
  const claimRegion = (src: string, at: number) => {
    const sf = ts.createSourceFile('claim.ts', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const deepestAt = (n: ts.Node): ts.Node => {
      for (const k of n.getChildren(sf)) {
        if (k.getStart(sf) <= at && at < k.getEnd()) return deepestAt(k)
      }
      return n
    }
    let node: ts.Node = deepestAt(sf)
    while (
      node.parent &&
      !ts.isStatement(node.parent) &&
      !ts.isCaseOrDefaultClause(node.parent) &&
      !ts.isSourceFile(node.parent) &&
      !ts.isModuleBlock(node.parent)
    ) {
      node = node.parent
    }
    return src.slice(node.getStart(sf), node.getEnd())
  }

  /**
   * THE PARSE IS THE ANCHOR NOW, because a text anchor is a hole by
   * construction.
   *
   * `statementHolding` scoped each string-value pin to its own statement, and
   * found that statement by SEARCHING the source for an anchor regex. The
   * search surface is `blankComments`, where string and template literals
   * SURVIVE on purpose, so a literal placed EARLIER in the file simply becomes
   * the first match and the whole region moves to it. The battery that was
   * supposed to catch this only ever appended its decoy at the END of the
   * file, where `String.prototype.search` never reaches. Measured 2026-09-02
   * against 7f8fb1fd, one top-level template literal carrying the query text,
   * inserted after the imports, was `deno check` RC 0 and 81 of 81 GREEN with
   * ALL FOUR events-query filters deleted: the sweep widens from 4 ticketed
   * events and 6 gaps to 30 published events and 279, test-collective events
   * mail real members, and the tz columns the audience-frame test reads are
   * gone. The same steal killed the `isTestEvent` call, the send-email type,
   * the wall-clock window call, the cadence read's table, the real clock into
   * `nudgeEvent`, the tz padding and the body of `audienceTzFor`: fourteen
   * deno-clean cells, each with a matched-pair control that reds.
   *
   * So nothing below searches text for a place to look. Every anchor is a node
   * in the parse, and a string literal can never BE a CallExpression, an
   * ImportDeclaration or a FunctionDeclaration. The pins read argument nodes
   * rather than region text for the same reason: a decoy string sitting INSIDE
   * the right region would otherwise satisfy a substring match.
   */
  const parseOf = (src: string) =>
    ts.createSourceFile('probe.ts', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

  const nodesIn = (root: ts.Node, pick: (n: ts.Node) => boolean): ts.Node[] => {
    const out: ts.Node[] = []
    const walk = (n: ts.Node) => {
      if (pick(n)) out.push(n)
      n.forEachChild(walk)
    }
    walk(root)
    return out
  }

  /** `<x>.<method>(...)` calls, optionally narrowed to a first string argument. */
  const methodCalls = (root: ts.Node, method: string, arg?: string) =>
    nodesIn(
      root,
      (n) =>
        ts.isCallExpression(n) &&
        // `x['from'](...)` is the same call as `x.from(...)` at runtime and was
        // invisible here, which let a decoy chain hold the only counted call.
        ((ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === method) ||
          (ts.isElementAccessExpression(n.expression) &&
            ts.isStringLiteralLike(n.expression.argumentExpression) &&
            n.expression.argumentExpression.text === method)) &&
        (arg === undefined ||
          (n.arguments.length > 0 &&
            ts.isStringLiteral(n.arguments[0]) &&
            n.arguments[0].text === arg)),
    ) as ts.CallExpression[]

  /** `<name>(...)` calls on a bare identifier. */
  const plainCalls = (root: ts.Node, name: string) =>
    nodesIn(
      root,
      (n) => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name,
    ) as ts.CallExpression[]

  /**
   * The DIRECT links of a call chain, outermost call inward.
   *
   * `hasCallWithArgs` and `methodCalls` walk the WHOLE subtree of whatever
   * they are given, so an argument is a place a decoy can hide. Measured
   * 2026-09-02 against 1a627cd2: a dead ternary arm inside the events query's
   * own `.lte()` argument, carrying
   * `.eq('status','published').eq('is_ticketed', true).neq('collectives.slug','test')`
   * on an unrelated table, satisfied all three filter pins with all three real
   * filters DELETED, at `deno check` RC 0, eslint clean and 84 of 84 GREEN.
   * The sweep then reads 30 published events instead of 4 ticketed ones.
   *
   * Reading only the spine makes that impossible by construction: a filter has
   * to be a link of the chain that runs, not merely a call somewhere beneath
   * it. Casts, parens, non-null assertions and `await` are stepped through, so
   * the ordinary ways of writing the same chain still resolve.
   */
  const spineCalls = (top: ts.Node): ts.CallExpression[] => {
    const out: ts.CallExpression[] = []
    let n: ts.Node = top
    for (;;) {
      if (
        ts.isAwaitExpression(n) ||
        ts.isParenthesizedExpression(n) ||
        ts.isAsExpression(n) ||
        ts.isNonNullExpression(n)
      ) {
        n = n.expression
        continue
      }
      if (ts.isCallExpression(n)) {
        out.push(n)
        n = n.expression
        continue
      }
      if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
        n = n.expression
        continue
      }
      break
    }
    return out
  }

  /** The method a spine link calls, written `.m()` or `['m']()`. */
  const linkName = (c: ts.CallExpression): string | undefined =>
    ts.isPropertyAccessExpression(c.expression)
      ? c.expression.name.text
      : ts.isElementAccessExpression(c.expression) &&
          ts.isStringLiteralLike(c.expression.argumentExpression)
        ? c.expression.argumentExpression.text
        : undefined

  /** Spine links calling `method`, optionally narrowed to a first string argument. */
  const spineLinks = (spine: ts.CallExpression[], method: string, arg?: string) =>
    spine.filter(
      (c) =>
        linkName(c) === method &&
        (arg === undefined ||
          (c.arguments.length > 0 &&
            ts.isStringLiteral(c.arguments[0]) &&
            c.arguments[0].text === arg)),
    )

  /** A DIRECT link whose method and ARGUMENT SOURCE TEXTS match exactly. */
  const hasSpineCall = (
    sf: ts.SourceFile,
    spine: ts.CallExpression[],
    method: string,
    args: string[],
  ) =>
    spineLinks(spine, method).some(
      (c) =>
        c.arguments.length === args.length &&
        c.arguments.every((a, i) => a.getText(sf) === args[i]),
    )

  /**
   * An argument with casts, parens and non-null assertions stripped, as text.
   *
   * `.getText()` plus `toContain` reads a NAME as a VALUE. Measured 2026-09-02
   * against 1a627cd2: `.in('status', LIVE_TICKET_STATUSES.slice(0, 1) as
   * unknown as string[])` names the constant, passes a containment pin and
   * narrows the seat sweep to one status anyway, deno RC 0, eslint clean, 84
   * of 84 GREEN. That is the 2026-08-28 reserved-hold defect back.
   */
  const bareArg = (sf: ts.SourceFile, a: ts.Node) => {
    let n = a
    while (
      ts.isAsExpression(n) ||
      ts.isParenthesizedExpression(n) ||
      ts.isNonNullExpression(n)
    ) {
      n = n.expression
    }
    return ts.isIdentifier(n) ? n.text : n.getText(sf)
  }

  /**
   * A PostgREST column list as its members.
   *
   * `emergency_contact_phone` is a SUBSTRING of
   * `emergency_contact_phone_verified`, so a containment pin read a select
   * that had dropped the real column as green: deno RC 0, eslint clean, 84 of
   * 84 GREEN on 2026-09-02, with every profile then reading as unreachable and
   * every seat holder nudged.
   */
  const columnList = (lit: ts.StringLiteral) => lit.text.split(',').map((c) => c.trim())

  /**
   * The spine of the chain a single-expression callback actually RETURNS.
   *
   * Positional containment only proved a chain sat somewhere inside the call.
   * Measured 2026-09-02 against 1a627cd2: putting the pinned profiles chain on
   * the dead arm of a ternary and running `.from('profiles_v2').select('id')`
   * was deno RC 0, eslint clean and 84 of 84 GREEN.
   */
  const callbackSpine = (call: ts.CallExpression) => {
    const cb = call.arguments.find(
      (a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a),
    ) as ts.ArrowFunction | ts.FunctionExpression | undefined
    expect(cb, 'the helper is not given a function to run').toBeDefined()
    const returned: ts.Node | undefined =
      ts.isArrowFunction(cb!) && !ts.isBlock(cb!.body)
        ? cb!.body
        : (
            nodesIn(
              cb!,
              (n) => ts.isReturnStatement(n) && !!(n as ts.ReturnStatement).expression,
            )[0] as ts.ReturnStatement | undefined
          )?.expression
    expect(returned, 'the callback returns no query').toBeDefined()
    return spineCalls(returned!)
  }

  /** The whole `a.b(...).c(...).d(...)` chain a call sits in. */
  const chainOf = (n: ts.Node) => {
    let top: ts.Node = n
    while (
      top.parent &&
      (ts.isPropertyAccessExpression(top.parent) ||
        (ts.isCallExpression(top.parent) && top.parent.expression === top))
    ) {
      top = top.parent
    }
    return top
  }

  /**
   * A call inside `root` whose method name and ARGUMENT SOURCE TEXTS match
   * exactly. Comparing argument nodes rather than region text is what shuts the
   * decoy one level in: a `.eq('title', "'is_ticketed', true")` sitting inside
   * the right chain satisfies a substring match on the region and cannot
   * satisfy this.
   */
  const hasCallWithArgs = (sf: ts.SourceFile, root: ts.Node, method: string, args: string[]) =>
    methodCalls(root, method).some(
      (c) =>
        c.arguments.length === args.length &&
        c.arguments.every((a, i) => a.getText(sf) === args[i]),
    )

  /** A `<name>: <literal>` property inside `root`, read off the parse. */
  const hasProperty = (sf: ts.SourceFile, root: ts.Node, name: string, value: string) =>
    nodesIn(
      root,
      (n) =>
        ts.isPropertyAssignment(n) &&
        (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)) &&
        n.name.text === name &&
        n.initializer.getText(sf) === value,
    ).length > 0

  /**
   * The chain that ACTUALLY produces the rows the sweep iterates.
   *
   * `soleFrom` scoped every events pin to "the one `.from('events')` call in
   * the file", and a COUNT is not an identity. Two deno-clean, eslint-clean,
   * 81-of-81-GREEN kills used that, measured 2026-09-02 against fb2b1206:
   * write the real query as `supabase['from']('events')` (element access, which
   * `methodCalls` did not match) or reach it through a one-line helper
   * `(db, t) => db.from(t)` (the table name is then an identifier, not a
   * literal), and leave a dead `supabase.from('events')` chain beside it
   * carrying every filter. The count comes back to exactly one, every pin reads
   * the decoy, and the query that runs has lost `is_ticketed`, `status` and the
   * test-collective filter: 4 ticketed events becomes 30 published ones, drafts
   * included.
   *
   * So the anchor is the DATA PATH, not a population count. The sweep loop is
   * the only thing that can mail a member; whatever it iterates is bound by a
   * `const { data: <rows> } = await <query>`, and that query has to bottom out
   * in a literal `.from('events')`. A decoy elsewhere in the file is then
   * simply not the query, however many of them there are. This is the same
   * shape the claim side already had (it pins that the send loop iterates the
   * claim's OWN returned data), and its absence here is why the claim survived
   * this attack and the events query did not.
   */
  const eventsQuery = (src: string) => {
    const sf = parseOf(src)
    const loops = nodesIn(
      sf,
      (n) => ts.isForOfStatement(n) && plainCalls(n, 'nudgeEvent').length > 0,
    ) as ts.ForOfStatement[]
    expect(loops.length, 'expected exactly one sweep loop running nudgeEvent').toBe(1)
    // VALUE positions only. `((events ?? []) as unknown) as EventRow[]` carries
    // the TYPE name `EventRow` as an identifier too, so a decoy bound to
    // `const { data: EventRow }` was the only `data:` binding this reader could
    // see once the real rows arrived through `const events = eventsRes.data`.
    // Measured 2026-09-02 against 1a627cd2: deno check RC 0, eslint clean, 84
    // of 84 GREEN, with `is_ticketed`, `status` and the test-collective filter
    // all gone from the query that actually runs.
    const iterated: string[] = []
    const walkValue = (n: ts.Node) => {
      if (ts.isTypeNode(n)) return
      if (ts.isIdentifier(n)) iterated.push(n.text)
      n.forEachChild(walkValue)
    }
    walkValue(loops[0].expression)
    const decls = nodesIn(
      sf,
      (n) =>
        ts.isVariableDeclaration(n) &&
        ts.isObjectBindingPattern(n.name) &&
        n.name.elements.some(
          (e) =>
            ts.isIdentifier(e.name) &&
            // `{ data: rows }`, and the equally ordinary `{ data }` shorthand,
            // which used to red loudly on a refactor that changes nothing.
            (e.propertyName
              ? ts.isIdentifier(e.propertyName) && e.propertyName.text === 'data'
              : e.name.text === 'data') &&
            iterated.includes(e.name.text),
        ),
    ) as ts.VariableDeclaration[]
    expect(
      decls.length,
      'expected exactly one `const { data: <rows> } = await <query>` feeding the sweep loop',
    ).toBe(1)
    // The SPINE of that query, not its whole subtree: every pin below has to
    // read a link of the chain that runs rather than any call beneath it.
    const spine = spineCalls(decls[0].initializer!)
    const froms = spineLinks(spine, 'from', 'events')
    expect(
      froms.length,
      "the sweep's own query is not rooted in a literal .from('events')",
    ).toBe(1)
    return { sf, call: froms[0], spine, loop: loops[0] }
  }

  /**
   * Does the HANDLER ITSELF refuse with `status` when `test` matches, before
   * the service client is built?
   *
   * Two deno-clean, eslint-clean, 84-of-84-GREEN kills on 2026-09-02 against
   * 1a627cd2 are the reason each clause is here, and this is the worst pin in
   * the file to get wrong: past it sits a body that reads every attendee's
   * emergency contact and can trigger live mail to members.
   *
   *   OWNERSHIP. `nodesIn` walks NESTED functions, so lifting these very
   *   checks into a `const authFailure = (): Response | null => { ... }`
   *   declared INSIDE the handler and calling it for its side effect left both
   *   `if`s "inside the handler", both returning the right status, both ending
   *   before `serviceClient()`. The previous fix moved an extract-a-function
   *   slip one level in rather than closing it. So the `if` has to BELONG to
   *   the handler: its nearest function-like ancestor is the handler itself.
   *   `try { }` is not function-like, so the real guards still qualify.
   *
   *   THE STATUS AS A NUMBER. `return refuse401()` contains the digits `401`
   *   and can answer 200. So the refusal has to carry the status as a numeric
   *   literal in the returned expression, not merely spell it.
   */
  const handlerRefuses = (src: string, test: RegExp, status: string) => {
    const sf = parseOf(src)
    const svc = plainCalls(sf, 'serviceClient')
    expect(svc.length, 'expected exactly one serviceClient() call').toBe(1)
    const wrapped = plainCalls(sf, 'withSentry')
    expect(wrapped.length, 'expected exactly one withSentry() handler').toBe(1)
    const handler = wrapped[0].arguments.find(
      (a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a),
    )
    expect(handler, 'withSentry does not take a function handler').toBeDefined()
    const ownedByHandler = (n: ts.Node) => {
      let p: ts.Node | undefined = n.parent
      while (p && !ts.isFunctionLike(p)) p = p.parent
      return p === handler
    }
    return (nodesIn(handler!, (n) => ts.isIfStatement(n)) as ts.IfStatement[]).some(
      (g) =>
        test.test(g.expression.getText(sf)) &&
        ownedByHandler(g) &&
        nodesIn(g.thenStatement, (n) => ts.isReturnStatement(n)).some(
          (r) => nodesIn(r, (n) => ts.isNumericLiteral(n) && n.text === status).length > 0,
        ) &&
        g.getEnd() < svc[0].getStart(sf),
    )
  }

  /**
   * The property names of an `interface <name>`, as the code declares them.
   *
   * Pinning only the tz columns left the rest of the select unpinned, and
   * `date_start` is the one that decides everything: measured 2026-09-02
   * against 1a627cd2, selecting `'id, timezone, collectives!inner(timezone,
   * slug)'` was deno check RC 0, eslint clean and 87 of 87 GREEN, and
   * `new Date(undefined)` makes `hoursUntil` NaN, so both window comparisons
   * are false and the sweep nudges NOBODY, for ever, answering success:true.
   * Dropping `title` or `address` instead puts `undefined` into mail that goes
   * to members. Reading the interface means a column added to `EventRow` has
   * to be selected too, rather than a hand-kept list drifting away from it.
   */
  const interfaceProps = (sf: ts.SourceFile, name: string) => {
    const decls = nodesIn(
      sf,
      (n) => ts.isInterfaceDeclaration(n) && n.name.text === name,
    ) as ts.InterfaceDeclaration[]
    expect(decls.length, `expected exactly one interface ${name}`).toBe(1)
    return decls[0].members
      .filter((m): m is ts.PropertySignature => ts.isPropertySignature(m) && !!m.name)
      .map((m) => (ts.isIdentifier(m.name!) ? m.name!.text : (m.name as ts.StringLiteral).text))
  }

  /** A top-level `function <name>` declaration, as a node. */
  const fnDecl = (sf: ts.SourceFile, name: string) => {
    const hits = nodesIn(
      sf,
      (n) => ts.isFunctionDeclaration(n) && !!n.name && n.name.text === name,
    ) as ts.FunctionDeclaration[]
    expect(hits.length, `expected exactly one function ${name}, found ${hits.length}`).toBe(1)
    return hits[0]
  }

  /**
   * The ledger's three parts, all off the parse: the chain that CLAIMS (the
   * upsert), the chains that only READ it, and the sole send-email invoke.
   * `event_safety_nudges_sent` is queried twice, so the two are told apart by
   * what they DO rather than by which one a text search happens to reach first.
   */
  const ledgerParts = (src: string) => {
    const sf = parseOf(src)
    const chains = methodCalls(sf, 'from', 'event_safety_nudges_sent').map((c) => chainOf(c))
    const claims = chains.filter((c) => methodCalls(c, 'upsert').length > 0)
    expect(claims.length, 'expected exactly one event_safety_nudges_sent upsert chain').toBe(1)
    const sends = methodCalls(sf, 'invoke', 'send-email')
    expect(sends.length, "expected exactly one functions.invoke('send-email')").toBe(1)
    return {
      sf,
      claimChain: claims[0],
      readChains: chains.filter((c) => methodCalls(c, 'upsert').length === 0),
      sendCall: sends[0],
    }
  }

  it('filters on is_ticketed, as the gate does', () => {
    // Measured 2026-09-01: ticketed-only is 4 events / 60 seats / 6 gaps.
    // Every upcoming published event is 30 events / 279 gaps, of which Merri
    // Mornings alone is 108 of 148 - people at a two-hour beach clean-up who
    // were never asked for a contact and do not need to be.
    const fn = readSource()
    const gate = fs.readFileSync(GATE, 'utf8')
    expect(gate).toContain('is_ticketed')
    // Read off the PARSE as the sole `.from('events')` chain's own `.eq` call
    // with those exact argument NODES. Scoped to that chain by TEXT search
    // this passed with the filter DELETED and the query text re-supplied as a
    // top-level template literal placed ABOVE it, measured 2026-09-02, deno
    // check RC 0 and 81 of 81: the literal became the first match and the
    // whole region moved onto the decoy.
    const events = eventsQuery(fn)
    expect(
      hasSpineCall(events.sf, events.spine, 'eq', ["'is_ticketed'", 'true']),
      "the events query has no .eq('is_ticketed', true)",
    ).toBe(true)
  })

  it('only looks at published events', () => {
    // The same parse read as the filter above, for the same measured reason:
    // a decoy literal placed above the query stole the text anchor and this
    // passed with the filter gone, which sweeps drafts and unpublished events.
    const events = eventsQuery(readSource())
    expect(
      hasSpineCall(events.sf, events.spine, 'eq', ["'status'", "'published'"]),
      "the events query has no .eq('status', 'published')",
    ).toBe(true)
  })

  it('keeps the test collective out', () => {
    // The null-safe second line of defence, mirroring event-reminders. A test
    // event firing live mail at real members is the failure this stops.
    const fn = readSource()
    // Read off the parse, so neither a decoy above the query (which stole the
    // text anchor, measured 2026-09-02, deno RC 0 and 81 of 81 with the filter
    // deleted) nor one sitting inside the chain can stand in for the call.
    const events = eventsQuery(fn)
    expect(
      hasSpineCall(events.sf, events.spine, 'neq', ["'collectives.slug'", "'test'"]),
      "the events query has no .neq('collectives.slug', 'test')",
    ).toBe(true)

    // Naming the function is not the same as it deciding anything. Stubbed to
    // `return false` the whole second line of defence goes away silently, and
    // every assertion above stayed green under exactly that mutation.
    // The declaration comes from the parse too: anchored on
    // `fn.indexOf('function isTestEvent')` a decoy literal above it stole the
    // slice and the stub behind it read green.
    expect(fnDecl(events.sf, 'isTestEvent').getText(events.sf)).toMatch(
      /collectives\?\.slug === 'test'/,
    )

    // And HAVING the function is not the same as CALLING it, which is the same
    // lesson one step out. Deleting the whole `if (isTestEvent(event)) continue`
    // line is `deno check` RC 0 and left all 81 GREEN, because a name read over
    // the whole file is satisfied by the surviving DECLARATION. Bounding that
    // read at `fn.indexOf('for (const event of')` was the next hole and fell
    // the same way: measured 2026-09-02, a template literal carrying that text
    // above the loop stole the index and the deleted call read green. So the
    // loop is a node in the parse, identified by the work it does, and the
    // call is a CallExpression inside it.
    const sweepLoops = nodesIn(
      events.sf,
      (n) => ts.isForOfStatement(n) && plainCalls(n, 'nudgeEvent').length > 0,
    )
    expect(sweepLoops.length, 'expected exactly one sweep loop running nudgeEvent').toBe(1)
    expect(
      plainCalls(sweepLoops[0], 'isTestEvent').length,
      'the sweep loop never calls isTestEvent',
    ).toBeGreaterThan(0)
  })

  it('reads every column the contact rule needs, and reads it in chunks', () => {
    // Dropping a column from this select is the quietest mass-mis-mail in the
    // file: with `emergency_contact_phone` gone every profile reads as having
    // no reachable contact, so every seat holder is nudged including the ones
    // who answered months ago. Measured 2026-09-02 against fb2b1206, deno
    // check RC 0, eslint clean, 81 of 81 GREEN, and nothing in this file
    // looked at the column list at all.
    const fn = readSource()
    const sf = parseOf(fn)

    // Chunked on purpose. PostgREST echoes the whole `.in()` filter back in a
    // content-location header and a one-shot list blows Deno's 16KiB cap
    // (Sentry COEXIST-1D). Collapsing the helper back to a single query was
    // also deno-clean and GREEN, and it fails as a silent bail on the largest
    // cohorts rather than on the ones anybody tests with.
    const chunked = plainCalls(sf, 'selectInChunks')
    expect(chunked.length, 'the profiles read is not chunked through selectInChunks').toBe(1)

    // The query the helper RUNS, read off the spine of the callback it is
    // given. Positional containment only proved a chain sat somewhere inside
    // the call: measured 2026-09-02 against 1a627cd2, putting this chain on the
    // dead arm of a ternary and running `.from('profiles_v2').select('id')` was
    // deno check RC 0, eslint clean and 84 of 84 GREEN, and every profile then
    // reads as having no contact at all.
    const spine = callbackSpine(chunked[0])
    const profileFroms = spineLinks(spine, 'from', 'profiles')
    expect(
      profileFroms.length,
      "the query selectInChunks runs is not rooted in .from('profiles')",
    ).toBe(1)

    const cols = spineLinks(spine, 'select')
    expect(cols.length, 'the profiles query has no .select()').toBe(1)
    const list = cols[0].arguments[0]
    expect(
      !!list && ts.isStringLiteral(list),
      'the profiles select does not take a literal column list',
    ).toBe(true)
    // Members of the list, not substrings of it. `emergency_contact_phone` is a
    // substring of `emergency_contact_phone_verified`, and selecting the latter
    // instead was deno RC 0, eslint clean and 84 of 84 GREEN on 2026-09-02.
    const named = columnList(list as ts.StringLiteral)
    for (const col of ['id', 'emergency_contact_name', 'emergency_contact_phone']) {
      expect(named, `the profiles select drops ${col}`).toContain(col)
    }
  })

  it('sweeps both seat artefacts on the shared status sets', () => {
    // A seat is a live ticket OR a live registration, and WHICH statuses count
    // is decided once, in the shared modules, because it has been got wrong
    // before: the 2026-08-28 defect excluded a `reserved` organiser hold, a
    // named person on a real roster who is the only source of their own
    // emergency contact, and those holders were never once asked. The twin
    // tests at the top of this file pin the CONSTANTS. Nothing pinned that the
    // QUERY reads them, so hardcoding `.in('status', ['completed'])` was deno
    // check RC 0, eslint clean and 81 of 81 GREEN on 2026-09-02 while silently
    // narrowing who gets swept.
    const fn = readSource()
    const sf = parseOf(fn)
    for (const [table, statuses] of [
      ['event_tickets', 'LIVE_TICKET_STATUSES'],
      ['event_registrations', 'LIVE_REGISTRATION_STATUSES'],
    ] as const) {
      const froms = methodCalls(sf, 'from', table)
      expect(froms.length, `expected exactly one .from('${table}') call`).toBe(1)
      const spine = spineCalls(chainOf(froms[0]))
      const statusFilters = spineLinks(spine, 'in').filter(
        (c) => c.arguments.length === 2 && c.arguments[0].getText(sf) === "'status'",
      )
      expect(statusFilters.length, `the ${table} read does not filter on status`).toBe(1)
      // The BARE constant, cast stripped. A containment pin was satisfied by
      // `LIVE_TICKET_STATUSES.slice(0, 1) as unknown as string[]`, which names
      // the constant and narrows the sweep to one status anyway: deno RC 0,
      // eslint clean, 84 of 84 GREEN on 2026-09-02, which is the 2026-08-28
      // reserved-hold defect back with the constant still in the source.
      expect(
        bareArg(sf, statusFilters[0].arguments[1]),
        `the ${table} read does not take its statuses from ${statuses}`,
      ).toBe(statuses)
      expect(
        hasSpineCall(sf, spine, 'eq', ["'event_id'", 'event.id']),
        `the ${table} read is not scoped to this event`,
      ).toBe(true)
    }
  })

  it('reads the shared predicate rather than hand-rolling the rule', () => {
    // Three surfaces have drifted before by re-deciding what "has a contact"
    // means at the call site. This one imports it.
    const fn = readSource()
    // The import is an ImportDeclaration in the parse, not a run of text: read
    // over the whole file a top-level string carrying the same specifier
    // satisfies it, which is the shape every other pin in this file fell to.
    const importSf = parseOf(fn)
    expect(
      nodesIn(
        importSf,
        (n) =>
          ts.isImportDeclaration(n) &&
          ts.isStringLiteral(n.moduleSpecifier) &&
          n.moduleSpecifier.text === '../_shared/safety-contact.ts',
      ).length,
      'the sweep does not import the shared safety-contact module',
    ).toBeGreaterThan(0)
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
    const fn = readSource()
    // Both offsets come from the parse. As text searches each was stealable by
    // a literal placed earlier in the file, which is how the send-email type
    // pin below was defeated on 2026-09-02 at deno RC 0 and 81 of 81.
    const { sf, claimChain, sendCall, readChains } = ledgerParts(fn)
    const claimAt = claimChain.getStart(sf)
    const sendAt = sendCall.getStart(sf)
    // Read as CODE. `ignoreDuplicates` is an object property rather than a
    // pinned string value, so blanking string literals costs this assertion
    // nothing and shuts the one channel it was open to: a decoy literal
    // carrying the same text elsewhere in the file. Measured 2026-09-01,
    // deleting the real option and re-supplying it as a top-level
    // `const _hist = "ignoreDuplicates: true"` is `deno check` RC 0 and was
    // 81 of 81 GREEN against the raw read. Without the option the upsert
    // UPDATES on conflict, `.select()` hands every row back on every fire, and
    // the ledger stops being a permit and becomes a duplicate storm. Its two
    // sibling residues cannot move the same way, because there the pinned text
    // IS a string in the source and `codeOnly` would blank the thing it pins.
    expect(
      hasProperty(sf, claimChain, 'ignoreDuplicates', 'true'),
      'the claim upsert does not set ignoreDuplicates: true',
    ).toBe(true)
    expect(claimAt).toBeLessThan(sendAt)
    // And nothing mails ahead of the claim by another route.
    expect(fn.slice(0, claimAt)).not.toContain("functions.invoke('send-email'")

    // The cadence READ has to come off the same ledger the claim WRITES.
    // Pointed at any other table the read returns nothing, every fire thinks
    // it is step 1, the unique index swallows the repeat claim, and the person
    // gets one nudge instead of three. Silent: no error, success:true, and
    // every other assertion here stayed green under that mutation.
    const cadence = readChains.filter(
      (c) => methodCalls(c, 'select', 'user_id, follow_up_number, sent_at').length > 0,
    )
    expect(
      cadence.length,
      'no event_safety_nudges_sent READ selects user_id, follow_up_number, sent_at',
    ).toBe(1)

    // And that read is scoped to THIS event. Unscoped it returns every event's
    // ledger rows, so a person nudged for one event reads as already at step 1
    // (or already capped) for a different one and is never asked about the
    // event they are actually attending. Measured 2026-09-02: deleting the
    // `.eq('event_id', event.id)` is deno check RC 0, eslint clean and was
    // 81 of 81 GREEN. The pure-function twin of this ("does not let one
    // person's ledger silence another") passes either way, because it feeds
    // the predicate rows the query would never have returned.
    expect(
      hasCallWithArgs(sf, cadence[0], 'eq', ["'event_id'", 'event.id']),
      'the cadence read is not scoped to this event',
    ).toBe(true)
  })

  it('refuses a caller that does not hold the service-role key', () => {
    // This function reads every attendee's contact details and can trigger
    // live mail to members, so the key comparison is the only thing between an
    // anonymous caller and both. A negative control replaced the comparison
    // with `if (false)` and all 79 tests stayed green, which left an
    // unauthenticated sweep one edit away.
    const fn = readSource()
    // The region ends at the `serviceClient()` CALL in the parse, and is read
    // as CODE. Sliced to `fn.indexOf('const supabase = serviceClient()')` and
    // matched over the raw text this was the worst hole in the file: measured
    // 2026-09-02, one template literal above the handler carrying these two
    // shapes left the comparison replaced by `if (false)` at deno check RC 0
    // and 81 of 81 GREEN, which is an anonymous caller reading every
    // attendee's emergency contact and triggering live mail. The regexes
    // carry no string literal for the same reason `codeOnly` can be used at
    // all: blanking literals must not blank the thing being pinned.
    //
    // READING A REGION WAS STILL NOT ENOUGH, and this is the worst hole this
    // file has had. `codeOnly` blanks STRING decoys and does not blank a CODE
    // one, and the region ran from byte zero, so anything written above the
    // handler counted. Measured 2026-09-02 against fb2b1206, deno check RC 0,
    // eslint clean, 81 of 81 GREEN: lift these very checks into a helper
    // `function authFailure(req): Response | null`, then call it at the top of
    // the handler and DROP THE RETURN. That is an ordinary extract-a-function
    // slip, it reads as tidier than the code it replaces, and it leaves an
    // anonymous caller reading every attendee's emergency contact and able to
    // trigger live mail to members.
    //
    // So the guard is pinned as STRUCTURE: an `if` INSIDE the handler whose
    // test is the check and whose then-branch RETURNS the refusal. A helper
    // above the handler is then not inside it, and a helper whose result is
    // discarded returns nothing here.
    //
    // AND THE `if` HAS TO BELONG TO THE HANDLER. Reading every `if` beneath it
    // walked into nested functions, so the same slip declared one level in was
    // deno check RC 0, eslint clean and 84 of 84 GREEN on 2026-09-02 with an
    // anonymous caller reaching the body. `handlerRefuses` carries the rule and
    // is pinned by its own fixtures below.
    expect(
      handlerRefuses(fn, /authHeader\?\.startsWith\(/, '401'),
      'the handler has no Bearer-prefix check that returns 401 before the service client',
    ).toBe(true)
    expect(
      handlerRefuses(fn, /authHeader\.replace\([^)]*\) !== serviceRoleKey/, '403'),
      'the handler has no service-role key comparison that returns 403 before the service client',
    ).toBe(true)
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
    const fn = readSource()
    // Parse-derived for the same reason as the sibling test: a literal above
    // either one stole the offset and moved every slice below it.
    const { sf: mailSf, claimChain: mailClaim, sendCall: mailSend } = ledgerParts(fn)
    const claimAt = mailClaim.getStart(mailSf)
    const sendAt = mailSend.getStart(mailSf)

    const claimToSend = fn.slice(claimAt, sendAt)

    // 1. The claim asks for its inserted rows back, and the ask is part of the
    //    CLAIM'S OWN chain. Scoping this to the whole claim-to-send region was
    //    itself a hole, found by negative control on 2026-09-01: delete the
    //    `.select()` from the upsert AND add an unrelated
    //    `.from('profiles').select('id, email')` lookup between the claim and
    //    the send, and all 76 tests stayed green with the permit gone. That is
    //    the same silent total kill this test was written to catch, reachable
    //    by an ordinary future edit.
    //
    //    The first repair bounded the region at the next BLANK LINE, and that
    //    bound was itself the hole one edit along. A blank line is a layout
    //    choice, not a syntax boundary: delete the empty line under the claim
    //    and put an ordinary `supabase.from('profiles').select('id')` lookup
    //    directly beneath it, and the region grows over that neighbour and
    //    borrows its `.select(`. Measured 2026-09-01 on this subject: with the
    //    claim's own `.select()` DELETED that mutation is `deno check` RC 0
    //    and 81 of 81 GREEN, while the identical mutation with the blank line
    //    LEFT IN reds this test. One empty line was the whole difference, and
    //    the defect it hides is the total kill above: no `return=representation`,
    //    `claimedRows` null, `claimed` empty, and the sweep mails NOBODY for
    //    ever while still answering success:true.
    //
    //    Bounding it at the enclosing STATEMENT was the bound after that, and
    //    it fell the same way. Reached by walking up until the PARENT was a
    //    Block, that walk goes straight past an unbraced `case` clause to the
    //    whole `switch`. Measured 2026-09-01 with the claim in a `default:`
    //    clause and its own `.select()` deleted: `deno check` RC 0 and 81 of
    //    81 GREEN, permit gone, sweep silent. So the region is the claim's own
    //    EXPRESSION, and `claimRegion` stops the walk the moment the parent
    //    stops being part of one.
    const claimStmt = claimRegion(fn, claimAt)
    // Over-widening tripwire, on the SUBJECT rather than on a fixture. The
    // claim's own expression ends long before the send, and every widening
    // this guard has suffered swallowed the send loop, so this one line reds
    // each of them on the real file.
    expect(claimStmt).not.toContain("functions.invoke('send-email'")
    // Over-narrowing tripwire: the claim chain has to still be inside it.
    expect(claimStmt).toContain('.upsert(')
    expect(codeOnly(claimStmt)).toMatch(/\.upsert\([\s\S]*\.select\(/)

    // And the ask has to actually RETURN the rows. `{ head: true }` is real
    // supabase-js: it keeps the `.select(` the assertion above looks for and
    // suppresses the response body anyway, so `claimedRows` comes back null,
    // `claimed` is empty, and the sweep mails nobody for ever while still
    // answering success:true. Same silent total kill, different route, and it
    // passed every assertion in this file until a negative control on
    // 2026-09-01 went looking for it.
    expect(claimStmt).not.toMatch(/head:\s*true/)

    // The conflict target has to be the WHOLE unique key. Narrowed to
    // (event_id, user_id) it matches no unique index, PostgREST rejects every
    // claim, and the function sends nothing at all for ever.
    expect(
      hasProperty(mailSf, mailClaim, 'onConflict', "'event_id,user_id,follow_up_number'"),
      'the claim upsert does not conflict on the whole unique key',
    ).toBe(true)

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
    const fn = readSource()

    // The tz columns have to be SELECTED or the helper has nothing to read.
    // The column list is the events select's own literal ARGUMENT, read off
    // the parse. Scoped to the statement by text search a decoy literal above
    // the query satisfied this with the columns dropped, deno RC 0, 81 of 81.
    const events = eventsQuery(fn)
    const selects = spineLinks(events.spine, 'select')
    expect(selects.length, 'the events query has no .select()').toBe(1)
    const cols = selects[0].arguments[0]
    expect(
      !!cols && ts.isStringLiteral(cols),
      'the events select does not take a literal column list',
    ).toBe(true)
    expect((cols as ts.StringLiteral).text).toContain(
      'timezone, collectives!inner(timezone, slug)',
    )
    // AND EVERY OTHER COLUMN THE ROWS ARE READ FOR. `EventRow` is what the
    // result is cast to, so each of its plain properties has to be selected or
    // the field arrives undefined. Measured 2026-09-02: dropping `date_start`
    // was deno RC 0, eslint clean, 87 of 87 GREEN, and it stops the sweep
    // nudging anybody at all (NaN fails both window comparisons); dropping
    // `title` or `address` instead ships `undefined` to a member's inbox.
    const selected = columnList(cols as ts.StringLiteral)
    for (const prop of interfaceProps(events.sf, 'EventRow')) {
      if (prop === 'collectives') continue
      expect(selected, `the events select drops ${prop}`).toContain(prop)
    }
    fnDecl(events.sf, 'audienceTzFor')
    fnDecl(events.sf, 'wallClockNowInTz')

    // The window test takes the converted clock, pinned as the CALL rather
    // than as a run of text: a template literal carrying this exact call, with
    // the real argument replaced by real `now`, was deno RC 0 and 81 of 81.
    // Scoped to the sweep LOOP, and counted. `.some` over the whole file asked
    // only whether the shape existed SOMEWHERE, which a decoy written in CODE
    // supplies: measured 2026-09-02, an `export function _windowShape` carrying
    // this exact call, with the real in-loop call given real `now`, was deno
    // check RC 0, eslint clean and 81 of 81 GREEN. That is the +10 audience
    // defect back, every 48h gap judged in the wrong frame. Blanking literals
    // never blanks a decoy written as code, so the fix is to read the call that
    // actually runs rather than to ask whether one like it exists.
    const inLoop = plainCalls(events.loop, 'isEventInNudgeWindow')
    expect(
      inLoop.length,
      'expected exactly one isEventInNudgeWindow call in the sweep loop',
    ).toBe(1)
    expect(
      inLoop[0].arguments.map((a) => a.getText(events.sf)),
      'isEventInNudgeWindow is not called with the audience wall clock',
    ).toEqual(['event.date_start', 'wallClockNowInTz(audienceTzFor(event))'])

    // And the SQL pre-filter is WIDER than the window, or an event is dropped
    // before the accurate test can judge it.
    // Read as CODE, so a literal carrying the arithmetic cannot supply it.
    // Read off the two DECLARATIONS, not off the file. As a codeOnly match over
    // the whole source this was satisfied by a decoy written in code: measured
    // 2026-09-02, an `export function _paddedWindow` carrying both expressions,
    // with the real windowStart and windowEnd narrowed to the exact window, was
    // deno check RC 0, eslint clean and 81 of 81 GREEN. The SQL then stops
    // being a superset and for a +10 audience the top ten hours of the window
    // go dark before the accurate test ever sees the event.
    const winDecl = (name: string) => {
      const hits = nodesIn(
        events.sf,
        (n) => ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name,
      ) as ts.VariableDeclaration[]
      expect(hits.length, `expected exactly one ${name} declaration`).toBe(1)
      return codeOnly(hits[0].getText(events.sf))
    }
    expect(winDecl('windowStart'), 'windowStart drops the tz padding').toMatch(
      /NUDGE_WINDOW_MIN_HOURS - TZ_PADDING_HOURS/,
    )
    expect(winDecl('windowEnd'), 'windowEnd drops the tz padding').toMatch(
      /NUDGE_WINDOW_MAX_HOURS \+ TZ_PADDING_HOURS/,
    )

    // And a date_start bound on the query, IF the query carries one, is that
    // padded value. Carrying no SQL bound at all is deliberately left GREEN:
    // the pre-filter is only a cheap narrowing and dropping it widens the
    // candidate set, which the accurate per-event test then judges. Narrowing
    // is the only direction that loses an event, so narrowing is the only
    // direction pinned. Probed 2026-09-02: with both bounds removed the sweep
    // mails exactly the same people, one query slower.
    for (const [method, bound] of [
      ['gte', 'windowStart'],
      ['lte', 'windowEnd'],
    ] as const) {
      for (const c of spineLinks(events.spine, method)) {
        if (c.arguments.length !== 2) continue
        if (c.arguments[0].getText(events.sf) !== "'date_start'") continue
        expect(
          c.arguments[1].getText(events.sf),
          `the events query bounds date_start on something other than ${bound}`,
        ).toContain(bound)
      }
    }

    // The padding VALUE has to cover the widest audience offset or the SQL
    // stops being a superset of the accurate window and events fall out before
    // the accurate test can judge them. Hobart in DST is +11. Pinning only the
    // EXPRESSIONS was a hole: a negative control set the constant to 0 and
    // every assertion above stayed green, while for a +10 audience the top ten
    // hours of the fourteen-day window went dark.
    // The VALUE comes off the declaration node. Matched out of the text, a
    // decoy literal carrying `const TZ_PADDING_HOURS = 12` above the real one
    // read 12 while the real constant was 0, deno RC 0 and 81 of 81.
    const padDecls = nodesIn(
      events.sf,
      (n) =>
        ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === 'TZ_PADDING_HOURS',
    ) as ts.VariableDeclaration[]
    expect(padDecls.length, 'expected exactly one TZ_PADDING_HOURS declaration').toBe(1)
    const padding = Number(padDecls[0].initializer?.getText(events.sf))
    expect(padding).toBeGreaterThanOrEqual(11)

    // And the audience tz is actually READ off the event and its collective.
    // Another negative control replaced the body of audienceTzFor with a bare
    // 'Australia/Brisbane' and stayed green, which would judge Perth (+8) two
    // hours out and Hobart in DST (+11) one hour out. Measured 2026-09-01: all
    // 18 collectives carry a real IANA zone spanning +8 to +11, all 468 events
    // carry timezone NULL, and Murbpook (Adelaide, +9:30, 2026-09-19) is a
    // live ticketed event. Not theoretical.
    // The BODY comes off the declaration node: sliced out of the text, a decoy
    // literal above it stole the slice and the stubbed real function read
    // green, deno RC 0 and 81 of 81, which judges Perth two hours out.
    const tzFn = fnDecl(events.sf, 'audienceTzFor').getText(events.sf)
    expect(tzFn).toMatch(/event\.timezone/)
    expect(tzFn).toMatch(/collectives\?\.timezone/)
  })

  it('keeps the cadence on the real clock, not the audience clock', () => {
    // Two clocks, two jobs. `event_safety_nudges_sent.sent_at` defaults to the
    // database's real now(), so measuring the 48h gap against a wall-clock
    // shifted by the audience offset would move every gap by that offset. The
    // cohort call must receive the REAL now.
    const fn = readSource()
    // The call is a node, not a 220-character slice off a text index: a decoy
    // literal above it stole the index and the audience clock went through,
    // deno RC 0 and 81 of 81, moving every 48h gap to 38h for a +10 audience.
    const sf = parseOf(fn)
    const cohorts = plainCalls(sf, 'selectSafetyGapCohort')
    expect(cohorts.length, 'expected exactly one selectSafetyGapCohort call').toBe(1)
    const cohortCall = cohorts[0].getText(sf)
    expect(
      nodesIn(cohorts[0], (n) => ts.isShorthandPropertyAssignment(n) && n.name.text === 'now')
        .length > 0 || hasProperty(sf, cohorts[0], 'now', 'now'),
      'the cohort call does not take the real now',
    ).toBe(true)
    expect(cohortCall).not.toContain('wallClockNowInTz')

    // And the real now is what reaches nudgeEvent in the first place. Pinning
    // only the cohort call was a hole: a negative control passed
    // wallClockNowInTz at THIS call site and every assertion above stayed
    // green, while each 48h gap moved by the audience offset (down to 38h for
    // a +10 audience), so the cadence would nudge earlier than it promises.
    // Anchored on the AWAITED call, not merely on the shape appearing
    // somewhere: a decoy `nudgeEvent(supabase, event, now)` written into a log
    // line would otherwise satisfy a bare shape match while the call that
    // actually runs took the wall clock.
    // Read off the parse as the awaited CALL and its argument nodes. Over the
    // whole file, even read as code, a top-level function carrying the same
    // awaited call satisfied this with the real call given the audience clock,
    // deno RC 0 and 81 of 81: blanking literals does not blank a decoy written
    // in code.
    const awaited = plainCalls(sf, 'nudgeEvent').filter((c) => ts.isAwaitExpression(c.parent))
    expect(awaited.length, 'expected exactly one awaited nudgeEvent call').toBe(1)
    expect(
      awaited[0].arguments.map((a) => a.getText(sf)),
      'the awaited nudgeEvent call does not take the real now',
    ).toEqual(['supabase', 'event', 'now'])
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
    // Lifted by NODE BOUNDS, not by a text index. Taken with
    // `fn.indexOf('function wallClockNowInTz')` over the RAW source, a comment
    // or a template literal carrying a correct copy above the real one was
    // lifted INSTEAD of it: measured 2026-09-02 with the real helper stubbed
    // to ignore the timezone, deno RC 0, and this test passed on the decoy.
    // The subject of a test that executes source has to come from the parse.
    // The lifted source is TypeScript, and new Function parses JavaScript, so
    // the annotations come off. Deliberately a strip and not a transpile: if
    // the helper ever grows a construct that needs real compilation, this
    // throws and the test reds, which is the safe direction.
    const src = fnDecl(parseOf(fn), 'wallClockNowInTz')
      .getText(parseOf(fn))
      .replace(/:\s*(?:string|Date)\b/g, '')
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
    // Lifted by node bounds, for the reason the sibling test above records.
    const src = fnDecl(parseOf(fn), 'wallClockNowInTz')
      .getText(parseOf(fn))
      .replace(/:\s*(?:string|Date)\b/g, '')

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

  it('the source readers blank what they promise and move nothing else', () => {
    // These two helpers are now load-bearing for eight assertions, so pin them
    // directly. A reader that silently stopped blanking would hand every guard
    // above back the comment hole it was built to close, and every one of them
    // would still be green.
    const raw = fs.readFileSync(FN, 'utf8')
    const stripped = readSource()

    // Offsets are preserved exactly, which is what lets the indexOf and slice
    // arithmetic above run on the stripped text and mean the same thing.
    expect(stripped.length).toBe(raw.length)
    expect(stripped.indexOf('function wallClockNowInTz')).toBe(
      raw.indexOf('function wallClockNowInTz'),
    )

    // Comment prose is gone. The samples are DERIVED from the file rather than
    // hardcoded, because a hardcoded quote couples this test to prose it does
    // not own: reword the comment it samples, or rename the table, and the
    // reader test reds while the reader is fine. A first cut of this test
    // sampled the `onConflict` string and did exactly that. A guard that fires
    // on something other than its own subject is the same defect one level up
    // from the one this whole file exists to close.
    const firstPhraseIn = (text: string, open: string, close: string) => {
      let at = text.indexOf(open)
      while (at > -1) {
        // Skip a `://` when LOCATING a sample. This is the opposite of the
        // blanking rule: skipping here can only make the test pick a different
        // sample, whereas skipping while blanking left borrowed tokens
        // readable, which is the hole the scanner above closes. A sample drawn
        // from a string by accident reds this test loudly rather than passing
        // it, so the failure direction is safe either way.
        if (open === '//' && at > 0 && text[at - 1] === ':') {
          at = text.indexOf(open, at + open.length)
          continue
        }
        const end = text.indexOf(close, at + open.length)
        const body = text.slice(at + open.length, end === -1 ? text.length : end)
        const words = body.replace(/[*/]/g, ' ').split(/\s+/).filter((w) => /^[A-Za-z]{3,}$/.test(w))
        for (let k = 0; k + 4 <= words.length; k++) {
          const phrase = words.slice(k, k + 4).join(' ')
          if (text.split(phrase).length === 2) return phrase
        }
        at = text.indexOf(open, at + open.length)
      }
      return ''
    }
    const blockProse = firstPhraseIn(raw, '/*', '*/')
    const lineProse = firstPhraseIn(raw, '//', '\n')
    expect(blockProse, 'no unique block-comment phrase to sample').not.toBe('')
    expect(lineProse, 'no unique line-comment phrase to sample').not.toBe('')
    expect(raw).toContain(blockProse)
    expect(stripped).not.toContain(blockProse)
    expect(raw).toContain(lineProse)
    expect(stripped).not.toContain(lineProse)

    // Code is untouched, including every `https://` a naive line-comment rule
    // would eat. Derived the same way: whatever URLs the file actually holds.
    const urls = raw.match(/https:\/\/[^'`\s]+/g) ?? []
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) expect(stripped).toContain(url)
    expect(stripped).toContain('Deno.serve(')

    // A `/*` inside a line comment must not open a block. Left to the block
    // rule first, the blank would run to the next `*/` below and take real code
    // with it, and every `not.toContain` assertion in this file would then be
    // green against code that is no longer there to be found.
    const blanked = blankComments(
      [
        '  const keep = 1',
        '  // note /* opens nothing',
        '  const alsoKeep = 2',
        '  /* a real block */',
        '  const third = 3',
        "  const url = 'https://example.test/x'",
      ].join('\n'),
    )
    expect(blanked).toContain('const alsoKeep = 2')
    expect(blanked).toContain('const third = 3')
    expect(blanked).not.toContain('opens nothing')
    expect(blanked).not.toContain('a real block')
    expect(blanked).toContain("'https://example.test/x'")
    expect(blanked.length).toBe(
      [
        '  const keep = 1',
        '  // note /* opens nothing',
        '  const alsoKeep = 2',
        '  /* a real block */',
        '  const third = 3',
        "  const url = 'https://example.test/x'",
      ].join('\n').length,
    )

    // The MIRROR hazard, and the one that cost this file a third commit. A
    // `//` inside a block comment whose terminator sits on the SAME line ate
    // that terminator under line-comments-first, so the block never closed and
    // the blank cascaded down the file exactly as it did under
    // block-comments-first. Measured 2026-09-01: `{ head: true }` on the claim,
    // wrapped this way, left all 81 tests green with the silent total kill live.
    const sandwich = blankComments(
      ['  const before = 1', '  const x = f(a, /* note ' + '// */ { head: true })', '  /* close */', '  const after = 2'].join('\n'),
    )
    expect(sandwich).toContain('const before = 1')
    expect(sandwich).toContain('const after = 2')
    expect(sandwich).toContain('head: true')
    expect(sandwich).not.toContain('note')

    // A line comment is a line comment wherever it starts. The old reader
    // carried a `(?<!:)` lookbehind to spare `https://` inside a string, and it
    // spared a genuine `ignoreDuplicates:// ...` comment along with it, leaving
    // every token borrowed inside that comment readable to the guards above.
    const afterColon = blankComments(
      ['  ignoreDuplicates:' + '// the .select( ask moved to the caller', '    true,'].join('\n'),
    )
    expect(afterColon).not.toContain('.select(')
    expect(afterColon).toContain('true,')

    // And the reader is string-aware, which is what makes the lookbehind
    // unnecessary rather than merely replaced: a comment delimiter inside a
    // string literal was never a comment.
    const inStrings = blankComments(
      ["  const a = 'https://esm.sh/x'", "  const b = '/* not a comment'", "  const c = 'a */ b'", '  const kept = 3'].join('\n'),
    )
    expect(inStrings).toContain("'https://esm.sh/x'")
    expect(inStrings).toContain('const kept = 3')

    // And codeOnly additionally empties the literals, without moving anything.
    const code = codeOnly(stripped)
    expect(code.length).toBe(raw.length)
    expect(code).toContain('.upsert(')
    expect(code).toContain('.select(')
    // Derived rather than hardcoded, for the same reason: a table rename must
    // not red the reader test.
    const literal = raw.match(/\.from\('([a-z_]{8,})'\)/)?.[1] ?? ''
    expect(literal, 'no table literal to sample').not.toBe('')
    expect(stripped).toContain(literal)
    expect(code).not.toContain(literal)

    // A nested backtick inside a `${}` paired wrongly under the old regex: the
    // opening backtick matched the one after `${`, so the INNER literal's text
    // fell outside both matches and survived into `codeOnly` as if it were
    // code. Measured 2026-09-01 as a live kill of the cadence pin above.
    expect(codeOnly('console.log(`${`await nudgeEvent(supabase, event, now)`}`)')).not.toContain(
      'nudgeEvent(',
    )
    // The real call still reads as code, or the pin above would be vacuous.
    expect(codeOnly('const outcome = await nudgeEvent(supabase, event, now)')).toContain(
      'await nudgeEvent(supabase, event, now)',
    )
    // Interpolated CODE is code, and a string inside it is still a string.
    expect(codeOnly('const u = `a${event.id}b`')).toContain('event.id')
    expect(codeOnly("const u = `a${get('year')}b`")).not.toContain('year')

    // A regex literal is the third literal JavaScript has and the one a
    // comment-and-string scanner silently gets wrong, because it is the
    // commonest literal that CARRIES both comment delimiters. Read as code,
    // `/^https?:\/\//` ends in a bare slash-slash that eats the rest of its
    // line, and `/[/*]+$/` opens a block inside a character class that
    // cascades to the next terminator or the end of the file. Measured
    // 2026-09-01, deno-clean and eslint-clean, all 81 tests GREEN with the
    // defect live: spreading `{ now: wallClockNowInTz(audienceTzFor(event)) }`
    // over the cohort call behind the first shape, which moves every 48h
    // cadence gap by the audience offset, down to 38h at +10.
    const withRegex = blankComments(
      [
        '  const host = raw.replace(/^https?:\\/\\//, ""), keepA = 1',
        '  const marks = /[/*]+$/',
        '  const keepB = 2',
      ].join('\n'),
    )
    expect(withRegex).toContain('keepA = 1')
    expect(withRegex).toContain('const keepB = 2')

    // codeOnly empties the regex body, because it is a literal like the rest.
    expect(codeOnly('const re = /event_tickets/')).not.toContain('event_tickets')

    // And a `${}` body is code, so it inherits the same rule for free.
    expect(blankComments('const u = `a${x.replace(/\\/\\//, "")}b`, keepE = 5')).toContain('keepE = 5')

    // The other direction, and the reason a reader cannot simply blank from
    // one slash to the next: a division must stay a division, or it loses
    // real code the opposite way.
    const withDivision = blankComments('  const rate = sent / seats, keepC = 3')
    expect(withDivision).toContain('sent / seats')
    expect(withDivision).toContain('keepC = 3')

    // `{}` is a position where a regex may legally follow and here it does
    // not, which is the case a reader anchored on the previous character has
    // to guess at and the parser simply knows.
    const bailed = blankComments(['  const r = ({} / 2)', '  const keepD = 4'].join('\n'))
    expect(bailed).toContain('/ 2)')
    expect(bailed).toContain('const keepD = 4')

    // THE POSITION THAT DECIDED THE INSTRUMENT. A `)` closes a call in
    // expression position, where a slash after it is division, and it closes
    // an `if` head in statement position, where the same slash opens a regex.
    // Nothing short of a parse tells those apart, and guessing division was a
    // reachable production kill rather than the bounded residual it was filed
    // as. Measured 2026-09-01, deno-clean and eslint-clean, all 81 tests
    // GREEN: an `if (preview) /^https?:\/\//.test(String(await
    // supabase.functions.invoke('send-email', ...)))` placed AHEAD of the
    // claim mails on every fire before the permit exists, and the guard that
    // bans a send ahead of the claim went green because the reader took the
    // regex's own slash-slash for a line comment and wiped the invoke off the
    // line. The matched control without the regex reds two tests.
    const ifHead = blankComments(
      '  if (preview) /^https?:\\/\\//.test(String(send("send-email"))); const keepF = 6',
    )
    expect(ifHead).toContain('send("send-email")')
    expect(ifHead).toContain('keepF = 6')

    // And the class-opening shape in the same position, which under a guess
    // of division cascaded a block comment to the next terminator or, in this
    // file, to the end of it.
    const ifHeadClass = blankComments(
      ['  if (dbg) /[/*]+$/.test(mark)', '  const keepG = 7', '  const keepH = 8'].join('\n'),
    )
    expect(ifHeadClass).toContain('const keepG = 7')
    expect(ifHeadClass).toContain('const keepH = 8')

    // The control that makes the pair above mean something: the SAME `)`
    // closing a CALL still reads as division. A reader that answered the
    // if-head case by calling every `)` a regex position would pass both
    // pins above and blank from here to the next slash instead.
    const callDivision = blankComments('  const per = total(seats) / seats.length, keepI = 9')
    expect(callDivision).toContain('total(seats) / seats.length')
    expect(callDivision).toContain('keepI = 9')

    // And the same control in the mode that can actually SEE the mistake.
    // Measured 2026-09-01: a reader that answers the if-head case by calling
    // every `)` a regex position reds NOTHING in the two checks above, and
    // nothing anywhere else in this test either, because a wrong regex
    // decision blanks no bytes while `literals` is false. It only shows once
    // the literal bodies go, and that is the mode guarding the claim chain, so
    // a division misread there eats a `.select(` and the permit with it.
    const codeDivision = codeOnly('const per = total(seats) / seats.length / 2')
    expect(codeDivision).toContain('total(seats) / seats.length / 2')

    // THE TAIL OF THE FILE. A parser answers which bytes are tokens, and every
    // byte between two of them is trivia, but the LAST gap has no token after
    // it to trigger the scan. `getChildren` on the end-of-file token answers
    // with its attached JSDoc when a file ends in a doc comment, so the token
    // reads as a branch, the walk recurses, its only child is JSDoc and is
    // skipped, and the token is never pushed. Everything past the last real
    // token then stays readable. Measured 2026-09-01 against the real subject:
    // deleting `.eq('is_ticketed', true)` and appending a trailing doc comment
    // carrying that same text was deno-clean and 81 of 81 GREEN, while the
    // identical mutation behind a plain `/*` opener RED, and both RED under
    // the hand-rolled reader this one replaced. One asterisk was the whole
    // difference, and the defect it hid widens the sweep from 4 ticketed
    // events to every published one, 108 of 148 gaps on a two-hour beach
    // clean-up alone.
    const tailDoc = blankComments(
      ["const a = 1", "/** trailing doc .eq('is_ticketed', true) */"].join('\n'),
    )
    expect(tailDoc).not.toContain('is_ticketed')

    // Once that gap goes unscanned it takes every later comment with it, so a
    // line comment after the doc block is readable too.
    const tailDocThenLine = blankComments(
      ["const a = 1", '/** doc */', "// then a line .eq('is_ticketed', true)"].join('\n'),
    )
    expect(tailDocThenLine).not.toContain('is_ticketed')

    // CONTROL. A plain trailing block comment was blanked before this fix and
    // is blanked after it, which reds a tail handler that recognises only a
    // `/**` opener and leaves the ordinary one readable.
    const tailPlain = blankComments(
      ["const a = 1", "/* trailing plain .eq('is_ticketed', true) */"].join('\n'),
    )
    expect(tailPlain).not.toContain('is_ticketed')

    // CONTROL. Real code before the tail survives, which reds the off-by-one
    // that blanks to end of file from the last token's START rather than its
    // end and takes the last statement with it.
    const tailKeepsCode = blankComments(
      ["const keepJ = 10", '/** trailing doc */'].join('\n'),
    )
    expect(tailKeepsCode).toContain('const keepJ = 10')

    // CONTROL. The end-of-file token is a special case in the walk, and JSDoc
    // generally is not: a doc comment mid-file is still trivia, and the
    // declaration it documents is still whole. The first of these reds a walk
    // that stops skipping JSDoc and reads a doc comment as a run of tokens;
    // the second reds a fix that blanks the doc through the declaration under
    // it.
    const midDoc = blankComments(
      ['/** doc for f */', 'function f() {}', 'const keepK = 11'].join('\n'),
    )
    expect(midDoc).not.toContain('doc for f')
    expect(midDoc).toContain('function f() {}')

    // THE LINE NO TOKEN COVERS. A shebang is stripped before parsing, so it is
    // neither a token nor a comment, and a reader that blanks only comments
    // hands its whole line to any assertion reading the file. This one is
    // older than the parse: the hand-rolled reader had it too.
    const shebang = blankComments(
      ["#!/usr/bin/env -S deno run .eq('is_ticketed', true)", 'const a = 1'].join('\n'),
    )
    expect(shebang).not.toContain('is_ticketed')

    // CONTROL. The first line survives when it is code, so the rule above
    // reds a reader that blanks line one on principle.
    expect(blankComments('const keepL = 12\nconst b = 2')).toContain('const keepL = 12')

    // THE SAME LINE, ONE BYTE ALONG. The rule above was written as
    // `i === 0 && t[0] === '#'` on the reasoning that `#!` cannot legally
    // appear anywhere but offset zero. That reasoning is false, because the
    // runtime and the parser disagree about where offset zero is: Deno strips
    // a byte order mark first and accepts the shebang behind it, while the
    // TypeScript parser requires position zero exactly and so reads the line
    // as ordinary code. Measured 2026-09-01, the mutation below is `deno
    // check` RC 0 and was 81 of 81 GREEN, with `deno check` the only compile
    // gate on this file. Deno's bound is exactly one BOM: two is TS18026, and
    // a space or a newline ahead of the `#!` is a SyntaxError.
    const bomShebang = blankComments(
      ['\ufeff' + "#!/usr/bin/env -S deno run .eq('is_ticketed', true)", 'const a = 1'].join('\n'),
    )
    expect(bomShebang).not.toContain('is_ticketed')

    // CONTROL. A byte order mark on its own does not make line one a shebang,
    // which reds a reader that blanks the first line whenever the file opens
    // with a BOM instead of testing for the `#!` behind it.
    expect(blankComments('\ufeff' + 'const keepM = 13\nconst c = 3')).toContain('const keepM = 13')

    // CONTROL. The blanking stops at the end of the shebang line and not at
    // the end of the file, which reds a reader that answers this case by
    // wiping from zero to EOF and takes the whole module with it, and equally
    // one that runs a byte past the line end. Written with CRLF, because a
    // shebang line scanned to `\n` leaves the `\r` behind and the byte after
    // that is the first byte of real code. A matching `not.toContain` on this
    // same fixture was written and then CUT: scored against a family of
    // deliberately wrong readers it red exactly the set the LF detector above
    // already reds, which makes it a second copy of that detector rather than
    // a control.
    const bomShebangCrlf = blankComments(
      '\ufeff' + "#!/usr/bin/env -S deno run .eq('is_ticketed', true)\r\nconst keepN = 14\r\n",
    )
    expect(bomShebangCrlf).toContain('const keepN = 14')

    // CONTROL, BOTH HALVES. Blanking the shebang line up front is only half
    // the rule; the gap walk then has to STEP OVER that region rather than
    // read inside it. A shebang may legally carry `//` or `/*` in an argument
    // and stays `deno check` RC 0 with it, so a walk that reads there opens a
    // comment the author never opened and blanks forward into real code. That
    // direction fails SILENTLY, because a `not.toContain` passes happily on
    // code that is gone. Scored against readers that differ in exactly one
    // decision, these two are the only assertions in this file that red a
    // reader with no step-over at all, and each is the sole one to red a
    // step-over gated to the wrong half: the LF case alone reds one that only
    // steps over when a BOM is present, the BOM case alone reds one that only
    // steps over when it is absent.
    expect(blankComments('#!/usr/bin/env -S deno run /*\nconst keepO = 15\n')).toContain(
      'const keepO = 15',
    )
    expect(
      blankComments('\ufeff' + '#!/usr/bin/env -S deno run /*\nconst keepP = 16\n'),
    ).toContain('const keepP = 16')

    // THE REGION WALK HAS A BOUND TOO, and this file's whole history is bounds
    // that read as boundaries and were not. These fixtures pin the two stop
    // decisions that do any work, scored against walks differing in exactly
    // ONE decision. The `case` EXPRESSION fixture is the SOLE catcher of a
    // walk that drops `isCaseOrDefaultClause`. The `if` CONDITION fixture is
    // the ordinary shape that reds a walk stopping at a Block instead of at a
    // statement, and it also reds one that tests the NODE rather than its
    // PARENT. The `case` STATEMENT fixture is the shape measured live on
    // 2026-09-01 (deno check RC 0, 81 of 81 GREEN with the permit gone); it is
    // a duplicate of the other two against that family and is kept as the
    // regression pin for the bound that actually shipped.
    const claimChain =
      "await supabase\n      .from('event_safety_nudges_sent')\n      .upsert(payload, { onConflict: 'a,b,c' })"
    const neighbour = "const { data: _probe } = await supabase.from('profiles').select('id')"
    const regionOf = (src: string) =>
      claimRegion(src, src.search(/\.from\('event_safety_nudges_sent'\)\s*\n\s*\.upsert\(/))
    const caseStmt = `async function f(){\n  switch(k){\n    case 1:\n      const { data: claimedRows } = ${claimChain}\n      ${neighbour}\n  }\n}\n`
    const caseExpr = `async function f(){\n  switch(k){\n    case (${claimChain}):\n      ${neighbour}\n  }\n}\n`
    const ifCond = `async function f(){\n  if((${claimChain})) { ${neighbour} }\n}\n`
    expect(regionOf(caseStmt), 'a case clause widened the region').not.toContain("from('profiles')")
    expect(regionOf(caseExpr), 'a case expression widened the region').not.toContain("from('profiles')")
    expect(regionOf(ifCond), 'an if condition widened the region').not.toContain("from('profiles')")

    // AND THE PARSE READERS THEMSELVES, because every bound this file has
    // chosen became the next hole and these are the newest. Each fixture is a
    // decoy of exactly the shape that defeated the TEXT reader they replace,
    // measured 2026-09-02 at deno check RC 0 and 81 of 81 GREEN: a literal
    // carrying the call, a literal carrying the whole query, a literal
    // carrying the property. If any of these three reds, a parse read has
    // quietly become a text read again.
    const decoyed = `
const _hist = \`
      .from('events')
      .select('id, timezone, collectives!inner(timezone, slug)')
      .eq('is_ticketed', true)
\`
const real = supabase.from('events').select('id').eq('status', 'published')
const body = { type: 'safety_contact_missing' }
const alsoDecoy = "type: 'safety_contact_missing'"
`
    const dSf = parseOf(decoyed)
    expect(
      methodCalls(dSf, 'from', 'events').length,
      'a literal was counted as a from() call',
    ).toBe(1)
    expect(
      hasCallWithArgs(dSf, dSf, 'eq', ["'is_ticketed'", 'true']),
      'a literal satisfied an argument-node call pin',
    ).toBe(false)
    expect(
      hasCallWithArgs(dSf, dSf, 'eq', ["'status'", "'published'"]),
      'a real call was missed by the argument-node pin',
    ).toBe(true)
    expect(
      hasProperty(dSf, dSf, 'type', "'safety_contact_missing'"),
      'the real property was missed',
    ).toBe(true)
    // And an argument whose TEXT carries the pin is not the pin. This is the
    // decoy one level in: inside the right chain, and still not the call.
    const inChain = parseOf(`const q = supabase.from('events').eq('title', "'is_ticketed', true")`)
    expect(
      hasCallWithArgs(inChain, inChain, 'eq', ["'is_ticketed'", 'true']),
      'a string argument carrying the pin satisfied the call pin',
    ).toBe(false)
    // The table name is the first ARGUMENT NODE, not text anywhere in the
    // call. Loosened to a text read, `from(pick('events'))` counts as a second
    // events query and `soleFrom` stops being sole.
    const indirect = parseOf(`const a = s.from('events').select('id')\nconst b = s.from(pick('events')).select('id')`)
    expect(
      methodCalls(indirect, 'from', 'events').length,
      'an indirect from() was counted by its text',
    ).toBe(1)
    // And a property is a PropertyAssignment, not a run of text that looks
    // like one. This is the shape that satisfied the send-email type pin.
    const propDecoy = parseOf(`const s = "type: 'safety_contact_missing'"`)
    expect(
      hasProperty(propDecoy, propDecoy, 'type', "'safety_contact_missing'"),
      'a string satisfied a property pin',
    ).toBe(false)
    // An element-access call is the SAME call at runtime. Matched only as a
    // property access, `supabase['from']('events')` vanishes from every count,
    // which is half of how a dead decoy chain took over the events pins on
    // 2026-09-02 at deno RC 0 and 81 of 81.
    const elemAccess = parseOf(`const a = s['from']('events').select('id')`)
    expect(
      methodCalls(elemAccess, 'from', 'events').length,
      "an element-access .from('events') was not counted",
    ).toBe(1)
  })

  it('reads the events query the sweep runs, not one that merely looks right', () => {
    // The measured kill, as a fixture. A COUNT is not an identity: hide the
    // real query behind element access (or behind a `(db, t) => db.from(t)`
    // helper, where the table name stops being a literal) and leave a dead
    // fully-filtered chain beside it, and a reader that scopes its pins to
    // "the one `.from('events')` call in the file" reads the decoy while the
    // query that runs has lost every filter. Measured 2026-09-02 against
    // fb2b1206: deno check RC 0, eslint clean, 81 of 81 GREEN, with
    // `is_ticketed`, `status` and the test-collective filter all gone.
    const hijacked = [
      "const _decoy = supabase.from('events').select('id').eq('is_ticketed', true)",
      "const { data: events } = await supabase['from']('events').select('id')",
      'for (const event of events) { await nudgeEvent(supabase, event, now) }',
    ].join('\n')
    const hijackedQ = eventsQuery(hijacked)
    expect(
      hasSpineCall(hijackedQ.sf, hijackedQ.spine, 'eq', ["'is_ticketed'", 'true']),
      'a decoy chain beside the real query satisfied an events pin',
    ).toBe(false)

    // MATCHED CONTROL. The same two chains with the roles swapped: the query
    // the loop consumes carries the filter and the decoy does not. This reds a
    // fix that simply refuses every file with two events chains, which would
    // pass the assertion above for the wrong reason.
    const honest = [
      "const _decoy = supabase.from('events').select('id')",
      "const { data: events } = await supabase.from('events').select('id').eq('is_ticketed', true)",
      'for (const event of events) { await nudgeEvent(supabase, event, now) }',
    ].join('\n')
    const honestQ = eventsQuery(honest)
    expect(
      hasSpineCall(honestQ.sf, honestQ.spine, 'eq', ["'is_ticketed'", 'true']),
      'eventsQuery did not resolve to the query the sweep loop consumes',
    ).toBe(true)

    // A DECOY BOUND TO A TYPE NAME. `iterated` used to collect every identifier
    // in the loop header, type positions included, so binding the dead chain to
    // `const { data: EventRow }` made it the only `data:` binding the reader
    // could see while the real rows came through `eventsRes.data`. Measured
    // 2026-09-02 against 1a627cd2: deno RC 0, eslint clean, 84 of 84 GREEN.
    const typeNameDecoy = [
      "const eventsRes = await supabase.from('events').select('id')",
      'const events = eventsRes.data',
      "const { data: EventRow } = await supabase.from('events').select('id').eq('is_ticketed', true)",
      'console.log(EventRow?.length ?? 0)',
      'for (const event of ((events ?? []) as unknown) as EventRow[]) { await nudgeEvent(supabase, event, now) }',
    ].join('\n')
    expect(
      () => eventsQuery(typeNameDecoy),
      'a decoy bound to a name used only as a TYPE became the sweep query',
    ).toThrow(/expected exactly one `const \{ data/)

    // MATCHED CONTROL. The ordinary `const { data } = ...` shorthand is not a
    // decoy and has to resolve, or this reader reds a refactor that changes
    // nothing about which rows the sweep mails.
    const shorthand = [
      "const { data } = await supabase.from('events').select('id').eq('is_ticketed', true)",
      'for (const event of (data ?? [])) { await nudgeEvent(supabase, event, now) }',
    ].join('\n')
    const shorthandQ = eventsQuery(shorthand)
    expect(
      hasSpineCall(shorthandQ.sf, shorthandQ.spine, 'eq', ["'is_ticketed'", 'true']),
      'the ordinary `const { data }` shorthand did not resolve to the sweep query',
    ).toBe(true)

    // A DECOY NESTED INSIDE AN ARGUMENT. `hasCallWithArgs` walked the whole
    // subtree, so a dead ternary arm inside the query's own `.lte()` argument
    // supplied every filter pin with the real filters deleted: deno RC 0,
    // eslint clean, 84 of 84 GREEN on 2026-09-02.
    const nestedArg = [
      "const { data: events } = await supabase.from('events').select('id')",
      "  .lte('date_start', LEGACY ? String(audit.eq('is_ticketed', true)) : windowEnd.toISOString())",
      'for (const event of events) { await nudgeEvent(supabase, event, now) }',
    ].join('\n')
    const nestedQ = eventsQuery(nestedArg)
    expect(
      hasSpineCall(nestedQ.sf, nestedQ.spine, 'eq', ["'is_ticketed'", 'true']),
      'a decoy nested inside an argument satisfied a spine pin',
    ).toBe(false)
    // MATCHED CONTROL: written as a direct link of the same chain it is found.
    const directLink = [
      "const { data: events } = await supabase.from('events').select('id').eq('is_ticketed', true)",
      'for (const event of events) { await nudgeEvent(supabase, event, now) }',
    ].join('\n')
    const directQ = eventsQuery(directLink)
    expect(
      hasSpineCall(directQ.sf, directQ.spine, 'eq', ["'is_ticketed'", 'true']),
      'a direct link of the chain was not found on the spine',
    ).toBe(true)
  })

  it('reads an auth guard the handler itself runs, refusing with a real status', () => {
    // The two measured kills of 2026-09-02, as fixtures. Both were deno check
    // RC 0, eslint clean and 84 of 84 GREEN against 1a627cd2, and both leave an
    // anonymous caller reading every attendee's emergency contact.
    const shell = (guard: string, extra = '') =>
      [
        extra,
        "Deno.serve(withSentry('f', async (req: Request) => {",
        "  const authHeader = req.headers.get('Authorization')",
        guard,
        '  const supabase = serviceClient()',
        "  return new Response(JSON.stringify({ ok: true, supabase }))",
        '}))',
      ].join('\n')

    const honest = shell(
      "  if (!authHeader?.startsWith('Bearer ')) { return new Response('no', { status: 401 }) }",
    )
    expect(
      handlerRefuses(honest, /authHeader\?\.startsWith\(/, '401'),
      'the handler that does refuse was not read as refusing',
    ).toBe(true)

    // A HELPER DECLARED INSIDE THE HANDLER, called for its side effect. Every
    // `if` is still "inside the handler" to a subtree walk, still returns 401,
    // still ends before serviceClient(). Nothing refuses anybody.
    const nested = shell(
      [
        '  const authFailure = (): Response | null => {',
        "    if (!authHeader?.startsWith('Bearer ')) { return new Response('no', { status: 401 }) }",
        '    return null',
        '  }',
        '  authFailure()',
      ].join('\n'),
    )
    expect(
      handlerRefuses(nested, /authHeader\?\.startsWith\(/, '401'),
      'a guard declared inside a nested function satisfied the handler auth pin',
    ).toBe(false)

    // A REFUSAL THAT ONLY SPELLS THE STATUS. `return refuse401()` carries the
    // digits and the helper answers 200.
    const named = shell(
      "  if (!authHeader?.startsWith('Bearer ')) { return refuse401() }",
      "function refuse401(): Response { return new Response('ok', { status: 200 }) }",
    )
    expect(
      handlerRefuses(named, /authHeader\?\.startsWith\(/, '401'),
      'a helper NAME carrying the digits satisfied the status pin',
    ).toBe(false)

    // MATCHED CONTROL for that one: the same helper shape, given the status as
    // a real argument, still refuses and has to stay green.
    const passed = shell(
      "  if (!authHeader?.startsWith('Bearer ')) { return refuse('no', 401) }",
      "function refuse(b: string, status: number): Response { return new Response(b, { status }) }",
    )
    expect(
      handlerRefuses(passed, /authHeader\?\.startsWith\(/, '401'),
      'a refusal that passes the status as a number was not read as refusing',
    ).toBe(true)
  })

  it('reads a column list and a status constant as values, not as substrings', () => {
    // `emergency_contact_phone` is a substring of
    // `emergency_contact_phone_verified`, and `LIVE_TICKET_STATUSES` is a
    // substring of `LIVE_TICKET_STATUSES.slice(0, 1)`. Both were deno-clean,
    // eslint-clean, 84-of-84-GREEN kills against 1a627cd2 on 2026-09-02: the
    // first makes every profile read as unreachable, the second is the
    // 2026-08-28 reserved-hold defect back.
    const listOf = (src: string) =>
      columnList(methodCalls(parseOf(src), 'select')[0].arguments[0] as ts.StringLiteral)
    expect(
      listOf("q.select('id, emergency_contact_name, emergency_contact_phone_verified')"),
      'a longer column name satisfied a column pin',
    ).not.toContain('emergency_contact_phone')
    expect(
      listOf("q.select('id, emergency_contact_name, emergency_contact_phone')"),
      'the real column list did not read as containing its own column',
    ).toContain('emergency_contact_phone')

    const statusArg = (src: string) => {
      const sf = parseOf(src)
      return bareArg(sf, methodCalls(sf, 'in')[0].arguments[1])
    }
    expect(
      statusArg("q.in('status', LIVE_TICKET_STATUSES.slice(0, 1) as unknown as string[])"),
      'a narrowed status list satisfied a constant pin',
    ).not.toBe('LIVE_TICKET_STATUSES')
    expect(
      statusArg("q.in('status', LIVE_TICKET_STATUSES as unknown as string[])"),
      'the real cast the repo writes stopped reading as the bare constant',
    ).toBe('LIVE_TICKET_STATUSES')
  })

  it('reads the query a chunking helper actually runs', () => {
    // Positional containment said only that a chain sat somewhere inside the
    // call. Measured 2026-09-02 against 1a627cd2: the pinned chain on the dead
    // arm of a ternary, with `.from('profiles_v2').select('id')` running, was
    // deno RC 0, eslint clean and 84 of 84 GREEN.
    const call = (src: string) => plainCalls(parseOf(src), 'selectInChunks')[0]
    const deadArm = call(
      "const r = await selectInChunks(ids, (chunk) => flag " +
        "? supabase.from('profiles').select('id, emergency_contact_phone').in('id', chunk) " +
        ": supabase.from('profiles_v2').select('id').in('id', chunk))",
    )
    expect(
      spineLinks(callbackSpine(deadArm), 'from', 'profiles').length,
      'a chain on the arm that never runs satisfied the chunked-query pin',
    ).toBe(0)

    // MATCHED CONTROL: the shape the file actually writes still resolves.
    const honest = call(
      "const r = await selectInChunks(ids, (chunk) => " +
        "supabase.from('profiles').select('id, emergency_contact_phone').in('id', chunk))",
    )
    expect(
      spineLinks(callbackSpine(honest), 'from', 'profiles').length,
      'the query the helper runs was not found on the callback spine',
    ).toBe(1)
  })

  it('sends a type send-email actually knows', () => {
    // send-email 400s on an unknown type, so a template that is registered in
    // one file and named in another is a silent no-send.
    const sender = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-email/index.ts'), 'utf8')
    const fn = readSource()
    // The property comes off the parse. Scoped to the invoke's statement by
    // text search, a decoy literal placed between the claim and the real
    // invoke stole the anchor and this passed with the `type` DELETED from the
    // body, deno RC 0 and 81 of 81, and send-email 400s on a body with no
    // type: a silent no-send.
    const typeSf = parseOf(fn)
    const typeSends = methodCalls(typeSf, 'invoke', 'send-email')
    expect(typeSends.length, "expected exactly one functions.invoke('send-email')").toBe(1)
    expect(
      hasProperty(typeSf, typeSends[0], 'type', "'safety_contact_missing'"),
      "the send-email invoke does not set type: 'safety_contact_missing'",
    ).toBe(true)
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
