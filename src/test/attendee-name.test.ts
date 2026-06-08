import { describe, it, expect } from 'vitest'
import { attendeeName } from '@/lib/attendee-name'

describe('attendeeName (First + Last for leader disambiguation)', () => {
  it('prefers full first + last name', () => {
    expect(attendeeName({ first_name: 'Sam', last_name: 'Rivers', display_name: 'samr' })).toBe('Sam Rivers')
  })
  it('disambiguates two people with the same first name', () => {
    const a = attendeeName({ first_name: 'Sam', last_name: 'Rivers' })
    const b = attendeeName({ first_name: 'Sam', last_name: 'Toombs' })
    expect(a).not.toBe(b)
  })
  it('falls back to display_name when no real name', () => {
    expect(attendeeName({ display_name: 'eco_sam' })).toBe('eco_sam')
  })
  it('handles a missing half without a dangling space', () => {
    expect(attendeeName({ first_name: 'Sam', last_name: null })).toBe('Sam')
    expect(attendeeName({ first_name: null, last_name: 'Rivers' })).toBe('Rivers')
  })
  it('falls back to the provided fallback when empty', () => {
    expect(attendeeName(null, 'attendee')).toBe('attendee')
    expect(attendeeName({ first_name: ' ', last_name: '', display_name: '' }, 'Unknown')).toBe('Unknown')
  })
})
