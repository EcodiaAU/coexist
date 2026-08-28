import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  guestSafetyPayload,
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

/* ------------------------------------------------------------------ */
/*  Guest checkout payload coverage                                    */
/*                                                                     */
/*  The gate TypeScript cannot be.                                     */
/*                                                                     */
/*  guest-ticket-checkout hard-requires an emergency contact and 400s   */
/*  without one. A caller that collects the contact and forgets to      */
/*  forward it does not degrade, it DEAD-ENDS: the buyer fills the form */
/*  in, the server says it is blank, and no amount of retrying works.   */
/*  That shipped on 2026-08-28 (Keely de Klerk, and the Northern        */
/*  Rivers team, could not buy a camp-out ticket at all) because        */
/*  campout-type.tsx typed its handler `(reqs: {dietary, medical})` and */
/*  a handler taking FEWER properties is structurally assignable to one */
/*  taking more. The compiler had nothing to say. So the guard is a     */
/*  source scan: every fetch of guest-ticket-checkout builds its safety */
/*  fields through guestSafetyPayload, and nobody hand-rolls the keys.  */
/* ------------------------------------------------------------------ */

describe('guest checkout safety payload', () => {
  const ROOT = path.resolve(__dirname, '../..')
  const CALLER_GLOB = ['src/pages/public/campout-type.tsx', 'src/pages/public/event.tsx']

  // Every source file that POSTs to the function, discovered rather than
  // listed, so a brand-new buy surface is covered the day it is added.
  function callerFiles(): string[] {
    const found: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        // Test sources name the endpoint in order to talk about it (this file
        // included). Scanning them would make the guard discover itself and
        // fail on its own fixture.
        if (entry.isDirectory()) { if (entry.name !== 'test') walk(full) }
        else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
          const body = fs.readFileSync(full, 'utf8')
          if (body.includes('functions/v1/guest-ticket-checkout')) {
            found.push(path.relative(ROOT, full).split(path.sep).join('/'))
          }
        }
      }
    }
    walk(path.join(ROOT, 'src'))
    return found.sort()
  }

  it('finds the buy surfaces it is meant to be guarding', () => {
    // If this fails the discovery walk broke and every assertion below would
    // pass vacuously over an empty list.
    expect(callerFiles()).toEqual(CALLER_GLOB.sort())
  })

  it.each(callerFiles())('%s forwards the whole safety set', (file) => {
    const body = fs.readFileSync(path.join(ROOT, file), 'utf8')
    expect(body).toContain('guestSafetyPayload')
  })

  it.each(callerFiles())('%s does not hand-roll the safety keys', (file) => {
    const body = fs.readFileSync(path.join(ROOT, file), 'utf8')
    // Hand-building any one of these at a call site is how the set drifts:
    // it compiles, and it silently omits whatever the author forgot.
    for (const key of ['emergency_name:', 'emergency_phone:', 'emergency_relationship:', 'dietary:', 'medical:']) {
      expect(body).not.toContain(key)
    }
  })

  it('sends every field the server reads, under the exact keys it reads them by', () => {
    // Pinned against supabase/functions/guest-ticket-checkout/index.ts, which
    // reads body.emergency_name / body.emergency_phone /
    // body.emergency_relationship / body.dietary / body.medical.
    expect(guestSafetyPayload({
      dietary: 'Coeliac',
      medical: 'Gluten',
      emergencyName: 'Mel de Klerk',
      emergencyPhone: '0449791006',
      emergencyRelationship: 'Mother',
    })).toEqual({
      dietary: 'Coeliac',
      medical: 'Gluten',
      emergency_name: 'Mel de Klerk',
      emergency_phone: '0449791006',
      emergency_relationship: 'Mother',
    })
  })

  // The server treats a whitespace-only name or phone as absent, so passing
  // one through unchanged is correct: it must fail the gate, not sneak past it.
  it('does not launder a blank contact into a present-looking one', () => {
    const out = guestSafetyPayload({
      dietary: 'None', medical: 'None',
      emergencyName: '   ', emergencyPhone: '', emergencyRelationship: '',
    })
    expect(out.emergency_name.trim()).toBe('')
    expect(out.emergency_phone.trim()).toBe('')
  })
})
