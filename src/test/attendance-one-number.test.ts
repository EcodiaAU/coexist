import { describe, it, expect } from 'vitest'
import { classifyAttendance, type AttendanceScenario } from '@/lib/event-capacity'

/**
 * Regression cover for the 2026-08-25 "one number" fix.
 *
 * Live fixtures, probed from the Co-Exist production DB (tjutlbzekfouwsiaplbr)
 * on 2026-08-25, the day Kurt asked in the team chat "Is 28 not too many
 * people? I thought we were limiting to 25":
 *
 *   Wild Mountains Conservation Campout, 2026-09-04, events.capacity = 25
 *     26 confirmed tickets (16 paid, 10 comped)
 *     25 registrations status='registered'
 *      2 of those registrations held NO ticket at all
 *     -> leader roster rendered 28 (the union), public page rendered 26
 *
 *   Murbpook Outback Campout Retreat, 2026-09-19, events.capacity = 15
 *      9 confirmed tickets
 *     14 registrations status='registered'
 *      5 of those held NO ticket   <- "similar glitch with Adelaide camp out"
 *
 * The rule under test: on a ticketed event GOING MEANS HOLDING A TICKET, so the
 * roster, the event page and the public page cannot disagree again.
 */

function countGoing(
  people: { registrationStatus: string | null; validTicketCount: number; ticketCheckedIn?: boolean }[],
  isTicketed: boolean,
): { going: number; noTicket: number; scenarios: AttendanceScenario[] } {
  const scenarios = people.map((p) =>
    classifyAttendance({
      isTicketed,
      registrationStatus: p.registrationStatus,
      validTicketCount: p.validTicketCount,
      ticketCheckedIn: p.ticketCheckedIn ?? false,
    }),
  )
  return {
    going: scenarios.filter((s) => s === 'checkedIn' || s === 'expected').length,
    noTicket: scenarios.filter((s) => s === 'noTicket').length,
    scenarios,
  }
}

/** Wild Mountains as it actually stood: 26 ticket holders + 2 ghost RSVPs. */
const wildMountains = [
  ...Array.from({ length: 26 }, () => ({ registrationStatus: 'registered', validTicketCount: 1 })),
  { registrationStatus: 'registered', validTicketCount: 0 },
  { registrationStatus: 'registered', validTicketCount: 0 },
]

/** Murbpook: 9 ticket holders + 5 ghost RSVPs. */
const murbpook = [
  ...Array.from({ length: 9 }, () => ({ registrationStatus: 'registered', validTicketCount: 1 })),
  ...Array.from({ length: 5 }, () => ({ registrationStatus: 'registered', validTicketCount: 0 })),
]

describe('one number: going means holding a ticket', () => {
  it('Wild Mountains reports 26 going, not the 28 Kurt saw', () => {
    const { going, noTicket } = countGoing(wildMountains, true)
    expect(going).toBe(26)
    // The 2 ghosts are named, not silently counted and not silently dropped.
    expect(noTicket).toBe(2)
    expect(going + noTicket).toBe(28) // the old roster number, now split apart
  })

  it('Murbpook reports 9 going, not the 14 on the old roster', () => {
    const { going, noTicket } = countGoing(murbpook, true)
    expect(going).toBe(9)
    expect(noTicket).toBe(5)
  })

  it('DISCRIMINATES: reintroducing the old grandfathering would fail this', () => {
    // The removed branch returned 'expected' for a ticketless registration on a
    // ticketed event. If that comes back, this expectation flips to 28 and the
    // suite goes red. This is the guard on the actual regression.
    const { scenarios } = countGoing(wildMountains, true)
    expect(scenarios.filter((s) => s === 'expected')).toHaveLength(26)
    expect(scenarios).not.toContain('waitlist')
  })

  it('a paid ticket outranks a stale waitlisted registration (the Kieren case)', () => {
    expect(
      classifyAttendance({
        isTicketed: true,
        registrationStatus: 'waitlisted',
        validTicketCount: 1,
        ticketCheckedIn: false,
      }),
    ).toBe('expected')
  })

  it('physically checked in outranks every ticket question (door walk-in)', () => {
    expect(
      classifyAttendance({
        isTicketed: true,
        registrationStatus: 'attended',
        validTicketCount: 0,
        ticketCheckedIn: false,
      }),
    ).toBe('checkedIn')
  })

  it('a ticketed event has no RSVP waitlist: ticketless waitlisted rows are hidden', () => {
    expect(
      classifyAttendance({
        isTicketed: true,
        registrationStatus: 'waitlisted',
        validTicketCount: 0,
        ticketCheckedIn: false,
      }),
    ).toBe('hidden')
  })

  it('cancelled registrations are hidden on both event kinds', () => {
    for (const isTicketed of [true, false]) {
      expect(
        classifyAttendance({
          isTicketed,
          registrationStatus: 'cancelled',
          validTicketCount: 0,
          ticketCheckedIn: false,
        }),
      ).toBe('hidden')
    }
  })

  it('NON-ticketed events are untouched: the registration is still the record', () => {
    const { going, noTicket } = countGoing(
      [
        { registrationStatus: 'registered', validTicketCount: 0 },
        { registrationStatus: 'registered', validTicketCount: 0 },
        { registrationStatus: 'waitlisted', validTicketCount: 0 },
      ],
      false,
    )
    expect(going).toBe(2)
    expect(noTicket).toBe(0) // noTicket is a ticketed-event concept only
  })
})
