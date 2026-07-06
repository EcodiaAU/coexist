import { describe, it, expect } from 'vitest'
import { isValidPhone, PHONE_REGEX } from '@/lib/validation'

/**
 * The phone gate is a non-dismissable modal, so an AU-only validator would
 * hard-block every non-Australian member (backpackers are a real cohort).
 * These tests pin that the canonical validator accepts international formats
 * with a leading + and country code, and still rejects junk. Shared by the
 * PhoneGate, edit-profile, and profileUpdateSchema.phone.
 */

describe('isValidPhone - international acceptance', () => {
  const accepted = [
    '0400 000 000',        // AU mobile
    '0412345678',          // AU no spaces
    '+44 7911 123456',     // UK
    '+447911123456',       // UK no spaces
    '+1 (415) 555-0100',   // US with parens + dash
    '+81 90-1234-5678',    // Japan
    '+61 400 000 000',     // AU international form
    '+64 21 123 456',      // NZ
    '+49 30 123456',       // Germany
    '(02) 9876 5432',      // AU landline with parens
  ]
  it.each(accepted)('accepts %s', (v) => {
    expect(isValidPhone(v)).toBe(true)
    expect(PHONE_REGEX.test(v.trim())).toBe(true)
  })

  it('accepts a value with surrounding whitespace (trimmed)', () => {
    expect(isValidPhone('  +44 7911 123456  ')).toBe(true)
  })
})

describe('isValidPhone - junk rejection', () => {
  const rejected = [
    '',                    // empty
    '   ',                 // whitespace only
    '12345',                  // too short (5 chars)
    'not a phone',            // letters
    '+44 7911 ABCDEF',        // letters mixed in
    '+44 7911 123456 789012', // too long (22 chars, >20)
    '☎ 0400 000 000',         // emoji/symbol
    '0400/000/000',           // disallowed separator /
  ]
  it.each(rejected)('rejects %p', (v) => {
    expect(isValidPhone(v)).toBe(false)
  })

  it('boundary: 20 chars passes, 21 chars fails', () => {
    expect(isValidPhone('12345678901234567890')).toBe(true)   // 20
    expect(isValidPhone('123456789012345678901')).toBe(false) // 21
  })
})
