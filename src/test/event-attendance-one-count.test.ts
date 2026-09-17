import { describe, it, expect } from 'vitest'
import {
  composeEventDayCounts,
  walkInSearchOffersCheckIn,
  type ServerAttendanceCounts,
} from '@/lib/event-capacity'

/**
 * Regression cover for the 2026-09-14 "37 vs 39" fix.
 *
 * Tate, mid-event at the Captain Burke Park Clean Up:
 *   "the here so far card on the event day page and the checked in cards are
 *    showing different numbers right now at the coexist event 37 vs 39 because
 *    maybe different semantics or walk ins you know?"
 *   "When someone is already checked in as a walk-in for a coexist event, then
 *    going back into add a walk in and searching their name up again should
 *    show checked in, not show the check in button then an error."
 *
 * Live fixture, probed from the Co-Exist production DB (tjutlbzekfouwsiaplbr)
 * on 2026-09-14, the day he reported it:
 *
 *   Captain Burke Park Clean Up, event 4bdd4baf
 *     43 registrations status='attended'
 *     32 registrations status='registered'
 *      2 event_walk_ins status='attended'
 *     -> leader "Checked in" card rendered 45 (roster 43 + walkIns 2)
 *     -> participant "Here so far" card rendered 43 (registrations only)
 *
 * The gap between the two cards was ALWAYS exactly the walk-in count, because
 * one card read event_walk_ins and the other did not. At the moment Tate looked
 * the tallies were 37 and 39, the same 2-wide gap earlier in the day.
 */

const captainBurke: ServerAttendanceCounts = {
  checkedIn: 45,
  hereTotal: 77,
  walkinExtra: 2,
  walkinDuplicatesSuppressed: 0,
}

describe('one count: both cards read the same server number', () => {
  it('the leader card reports the server number, not its own sum', () => {
    const { checkedIn } = composeEventDayCounts({
      rosterGoing: 43,
      rosterCheckedIn: 43,
      walkInRowCount: 2,
      server: captainBurke,
    })
    // The number the participant card shows (server checkedIn) and the number
    // this card shows are now the same value by construction.
    expect(checkedIn).toBe(captainBurke.checkedIn)
    expect(checkedIn).toBe(45)
  })

  it('DISCRIMINATES: a duplicated walk-in no longer inflates the leader card', () => {
    // Same event, but the 2 walk-ins were recorded 4 times between them -
    // event_walk_ins carries no unique constraint, and the live DB held 4 such
    // duplicate pairs on 2026-09-14. The server folds them to 2 distinct
    // people; the old arithmetic would have read 47.
    const server: ServerAttendanceCounts = { ...captainBurke, walkinDuplicatesSuppressed: 2 }
    const { checkedIn } = composeEventDayCounts({
      rosterGoing: 43,
      rosterCheckedIn: 43,
      walkInRowCount: 4,
      server,
    })
    expect(checkedIn).toBe(45)
    expect(checkedIn).not.toBe(43 + 4)
  })

  it('a walk-in who is ALSO a registration is counted once, not twice', () => {
    // 6 rows on the live DB were a walk-in whose email matched a registered
    // attendee at the same event. walkinExtra excludes them, so "going" does
    // not gain a person the roster already holds.
    const server: ServerAttendanceCounts = {
      checkedIn: 43,
      hereTotal: 75,
      walkinExtra: 0, // the single walk-in duplicates somebody already on the roster
      walkinDuplicatesSuppressed: 0,
    }
    const { going, checkedIn } = composeEventDayCounts({
      rosterGoing: 43,
      rosterCheckedIn: 43,
      walkInRowCount: 1,
      server,
    })
    expect(going).toBe(43)
    expect(checkedIn).toBe(43)
  })

  it('going stays ticket-aware: the roster supplies it, walk-ins only add people', () => {
    // A ticketed event where 3 registrations hold no ticket. classifyAttendance
    // keeps them out of rosterGoing, and that must survive the walk-in fold.
    const server: ServerAttendanceCounts = {
      checkedIn: 26,
      hereTotal: 29,
      walkinExtra: 1,
      walkinDuplicatesSuppressed: 0,
    }
    const { going } = composeEventDayCounts({
      rosterGoing: 26, // ticket-backed only
      rosterCheckedIn: 26,
      walkInRowCount: 1,
      server,
    })
    expect(going).toBe(27)
  })

  it('falls back to the old sum ONLY while the server has not answered', () => {
    const { going, checkedIn } = composeEventDayCounts({
      rosterGoing: 43,
      rosterCheckedIn: 43,
      walkInRowCount: 2,
      server: null,
    })
    expect(checkedIn).toBe(45)
    expect(going).toBe(45)
  })

  it('an event with no walk-ins is untouched by any of this', () => {
    const server: ServerAttendanceCounts = {
      checkedIn: 9,
      hereTotal: 20,
      walkinExtra: 0,
      walkinDuplicatesSuppressed: 0,
    }
    const { going, checkedIn } = composeEventDayCounts({
      rosterGoing: 20,
      rosterCheckedIn: 9,
      walkInRowCount: 0,
      server,
    })
    expect(checkedIn).toBe(9)
    expect(going).toBe(20)
  })
})

describe('walk-in search: an already-present person gets no button', () => {
  it('someone already checked in is NOT offered a check-in button', () => {
    expect(walkInSearchOffersCheckIn('checked_in')).toBe(false)
  })

  it('someone registered but not yet arrived IS offered the button', () => {
    // This is the path that used to 23505 on UNIQUE (event_id, user_id). The
    // button now updates their existing row rather than inserting a second one.
    expect(walkInSearchOffersCheckIn('registered')).toBe(true)
  })

  it('someone with no record for this event IS offered the button', () => {
    expect(walkInSearchOffersCheckIn('none')).toBe(true)
  })

  it('an unknown state keeps the button, so an older bundle still works', () => {
    // Forward and backward compatibility: the RPC column is additive, and a
    // client that has not learned about it must not refuse every check-in.
    expect(walkInSearchOffersCheckIn(undefined)).toBe(true)
    expect(walkInSearchOffersCheckIn(null)).toBe(true)
  })
})
