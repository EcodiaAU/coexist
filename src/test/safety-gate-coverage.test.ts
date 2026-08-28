import { describe, it, expect } from 'vitest'
import {
  hasEmergencyContact,
  LIVE_REGISTRATION_STATUSES,
  LIVE_TICKET_STATUSES,
} from '@/lib/dietary'

/* ------------------------------------------------------------------ */
/*  Safety-data coverage gate                                          */
/*                                                                     */
/*  Pins the rules that decide WHO gets asked for the retreat safety   */
/*  set (dietary, medical, emergency contact). Written 2026-08-28       */
/*  after a live probe of the Murbpook Outback Campout (2026-09-19,    */
/*  Morgan SA, 15 seats) found 4 seats with a gap, and a fleet-wide     */
/*  sweep found 10 of 57 seats on upcoming overnight events with no    */
/*  reachable emergency contact.                                        */
/* ------------------------------------------------------------------ */

describe('LIVE_TICKET_STATUSES', () => {
  // The defect. An organiser hold (reserve-event-spot) writes status
  // 'reserved'. It was absent from the eligibility filter, so a held seat was
  // never asked for anything: not at hold time (the organiser does not know
  // the member's contact) and not on app open (this filter excluded them).
  it('counts an organiser hold as a live seat', () => {
    expect(LIVE_TICKET_STATUSES).toContain('reserved')
  })

  it('counts every pre-attendance state that implies someone will turn up', () => {
    expect(LIVE_TICKET_STATUSES).toContain('pending')
    expect(LIVE_TICKET_STATUSES).toContain('confirmed')
    expect(LIVE_TICKET_STATUSES).toContain('checked_in')
  })

  // A seat that is gone must not nag its former holder.
  it('excludes seats that no longer exist', () => {
    expect(LIVE_TICKET_STATUSES).not.toContain('cancelled')
    expect(LIVE_TICKET_STATUSES).not.toContain('refunded')
  })

  // Guards against a future status being added to the DB check constraint
  // and silently not being considered here.
  it('covers exactly the live half of the status domain', () => {
    const domain = ['pending', 'confirmed', 'cancelled', 'refunded', 'checked_in', 'reserved']
    const dead = ['cancelled', 'refunded']
    expect([...LIVE_TICKET_STATUSES].sort()).toEqual(domain.filter((s) => !dead.includes(s)).sort())
  })
})

describe('LIVE_REGISTRATION_STATUSES', () => {
  it('counts a real registration', () => {
    expect(LIVE_REGISTRATION_STATUSES).toContain('registered')
    expect(LIVE_REGISTRATION_STATUSES).toContain('attended')
  })

  // 'invited' is the bulk-import state, 4,861 rows as at 2026-08-28, most of
  // whom never accepted. Arming a blocking modal on it would nag thousands of
  // people who hold no seat.
  it('does not count a bulk invite as a seat', () => {
    expect(LIVE_REGISTRATION_STATUSES).not.toContain('invited')
    expect(LIVE_REGISTRATION_STATUSES).not.toContain('waitlisted')
    expect(LIVE_REGISTRATION_STATUSES).not.toContain('cancelled')
  })
})

describe('hasEmergencyContact', () => {
  it('needs both a name and a phone', () => {
    expect(hasEmergencyContact({ emergency_contact_name: 'Sarah', emergency_contact_phone: '0403507939' })).toBe(true)
    // A name with no number is not reachable, which is the whole point.
    expect(hasEmergencyContact({ emergency_contact_name: 'Sarah', emergency_contact_phone: null })).toBe(false)
    expect(hasEmergencyContact({ emergency_contact_name: null, emergency_contact_phone: '0403507939' })).toBe(false)
  })

  it('treats whitespace as unanswered', () => {
    expect(hasEmergencyContact({ emergency_contact_name: '  ', emergency_contact_phone: '0403507939' })).toBe(false)
    expect(hasEmergencyContact({ emergency_contact_name: 'Sarah', emergency_contact_phone: '   ' })).toBe(false)
  })

  it('treats a missing or absent profile as unanswered rather than throwing', () => {
    expect(hasEmergencyContact(null)).toBe(false)
    expect(hasEmergencyContact(undefined)).toBe(false)
    expect(hasEmergencyContact({})).toBe(false)
  })

  // Unlike dietary and medical there is no "None" quick-fill, so the string
  // 'None' is a real contact name and must not be special-cased away. This
  // pins the asymmetry so nobody "tidies" it later.
  it('does not special-case a None sentinel', () => {
    expect(hasEmergencyContact({ emergency_contact_name: 'None', emergency_contact_phone: '000' })).toBe(true)
  })
})
