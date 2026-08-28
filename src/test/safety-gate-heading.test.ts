import { describe, it, expect } from 'vitest'
import { safetyGateHeading } from '@/lib/dietary'

/* ------------------------------------------------------------------ */
/*  App-open safety gate: heading                                      */
/*                                                                     */
/*  The gate renders one to three field groups (dietary, medical,      */
/*  emergency contact) and its heading has to match the body. A        */
/*  heading naming a field the body does not show reads as a broken    */
/*  form and teaches people to distrust the prompt.                    */
/*                                                                     */
/*  Written 2026-08-28 by the independent verification of 8c848446.    */
/*  That commit added the emergency-contact group to the backstop and  */
/*  left the heading on a dietary/medical-shaped ternary, so the       */
/*  emergency-only case fell through to 'Any dietary requirements?'    */
/*  over a body with no dietary field. Measured the same day: 8 of the */
/*  10 upcoming-overnight seats with nobody to call had ALREADY        */
/*  answered dietary and medical, so emergency-only is the single most */
/*  common way this gate can open.                                     */
/* ------------------------------------------------------------------ */

describe('safetyGateHeading', () => {
  // The defect. Measured 2026-08-28 across the 4 upcoming overnight events:
  // 8 of the 10 seats with no reachable emergency contact had ALREADY answered
  // dietary and medical, so emergency-contact-only is the most common way this
  // gate can open. The heading fell through a dietary/medical-shaped ternary to
  // 'Any dietary requirements?' over a body containing no dietary field at all.
  it('names the emergency contact when that is the only thing asked', () => {
    const h = safetyGateHeading({ dietary: false, medical: false, emergency: true })
    expect(h).toBe('Who should we call in an emergency?')
    expect(h).not.toMatch(/dietary/i)
    expect(h).not.toMatch(/medical|allerg/i)
  })

  it('names medical when that is the only thing asked', () => {
    expect(safetyGateHeading({ dietary: false, medical: true, emergency: false }))
      .toBe('Any medical needs or allergies?')
  })

  it('names dietary when that is the only thing asked', () => {
    expect(safetyGateHeading({ dietary: true, medical: false, emergency: false }))
      .toBe('Any dietary requirements?')
  })

  // Any two or more fields: one neutral heading rather than a list that would
  // have to enumerate three combinations.
  it('uses the neutral heading whenever more than one field is asked', () => {
    for (const need of [
      { dietary: true, medical: true, emergency: false },
      { dietary: true, medical: false, emergency: true },
      { dietary: false, medical: true, emergency: true },
      { dietary: true, medical: true, emergency: true },
    ]) {
      expect(safetyGateHeading(need)).toBe('A couple of details for your event')
    }
  })

  // A heading must never name a field the body will not render. This is the
  // rule the old ternary broke, stated so it cannot regress silently.
  it('never names a field that is not being asked', () => {
    expect(safetyGateHeading({ dietary: false, medical: true, emergency: false }))
      .not.toMatch(/dietary/i)
    expect(safetyGateHeading({ dietary: true, medical: false, emergency: false }))
      .not.toMatch(/medical|allerg|emergency/i)
  })
})

