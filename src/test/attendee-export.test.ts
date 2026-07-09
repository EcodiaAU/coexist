import { describe, it, expect } from 'vitest'
import {
  deriveStatus,
  filterByStatus,
  buildAttendeesCsv,
  buildPhoneList,
  answerCell,
  type AttendeeExportRow,
  type EventDetailsForExport,
} from '@/hooks/use-event-attendees-export'
import type { EventTicketQuestion } from '@/hooks/use-event-ticket-questions'

const details: EventDetailsForExport = {
  title: 'Wild Mountains Conservation Campout',
  date_start: '2026-07-10T14:00:00+00:00',
  date_end: null,
  address: '487 Philp Mountain Road',
  activity_type: 'campout',
  collective_name: 'Brisbane',
}

const q4wd: EventTicketQuestion = {
  id: 'q-4wd', event_id: 'e1', prompt: 'Arriving by 4WD?', help_text: null,
  question_type: 'boolean', options: [], required: true, is_active: true, sort_order: 0,
}
const qDiet: EventTicketQuestion = {
  id: 'q-multi', event_id: 'e1', prompt: 'Gear', help_text: null,
  question_type: 'multi_select', options: ['Tent', 'Swag'], required: false, is_active: true, sort_order: 1,
}
const questions = [q4wd, qDiet]

function row(p: Partial<AttendeeExportRow>): AttendeeExportRow {
  return {
    user_id: 'u', first_name: null, last_name: null, display_name: null, email: null, phone: null,
    postcode: null, dietary_requirements: null, medical_requirements: null,
    emergency_contact_name: null, emergency_contact_phone: null, emergency_contact_relationship: null,
    registration_status: null, registered_at: null, ticket_status: null, checked_in_at: null, custom_answers: null,
    ...p,
  }
}

describe('deriveStatus', () => {
  it('confirmed ticket is Going', () => {
    expect(deriveStatus(row({ ticket_status: 'confirmed', registration_status: 'registered' }))).toEqual({ label: 'Going', category: 'going' })
  })
  it('checked-in ticket is Checked in / going', () => {
    expect(deriveStatus(row({ ticket_status: 'confirmed', checked_in_at: '2026-07-10T00:00:00Z' }))).toEqual({ label: 'Checked in', category: 'going' })
  })
  it('waitlisted without confirmed ticket is Waitlisted', () => {
    expect(deriveStatus(row({ registration_status: 'waitlisted', ticket_status: 'cancelled' }))).toEqual({ label: 'Waitlisted', category: 'waitlisted' })
  })
  it('cancelled/refunded ticket is Cancelled', () => {
    expect(deriveStatus(row({ ticket_status: 'refunded', registration_status: 'cancelled' })).category).toBe('cancelled')
  })
  it('registered with no ticket is not Going (the Charli/Max case)', () => {
    expect(deriveStatus(row({ registration_status: 'registered', ticket_status: null }))).toEqual({ label: 'Registered (no ticket)', category: 'registered' })
  })
})

describe('filterByStatus', () => {
  const rows = [
    row({ ticket_status: 'confirmed' }),                         // going
    row({ registration_status: 'waitlisted' }),                  // waitlisted
    row({ ticket_status: 'cancelled', registration_status: 'cancelled' }), // cancelled
    row({ registration_status: 'registered' }),                  // registered-no-ticket
  ]
  it('all returns everyone', () => expect(filterByStatus(rows, 'all')).toHaveLength(4))
  it('going returns only confirmed-ticket holders', () => expect(filterByStatus(rows, 'going')).toHaveLength(1))
  it('waitlisted filters correctly', () => expect(filterByStatus(rows, 'waitlisted')).toHaveLength(1))
  it('registered-no-ticket is excluded from going', () =>
    expect(filterByStatus(rows, 'going').every((r) => r.registration_status !== 'registered' || r.ticket_status === 'confirmed')).toBe(true))
})

describe('answerCell', () => {
  it('boolean renders Yes/No', () => { expect(answerCell(true)).toBe('Yes'); expect(answerCell(false)).toBe('No') })
  it('array joins with semicolon', () => expect(answerCell(['Tent', 'Swag'])).toBe('Tent; Swag'))
  it('null/undefined blank', () => { expect(answerCell(null)).toBe(''); expect(answerCell(undefined)).toBe('') })
})

describe('buildAttendeesCsv', () => {
  const rows = [
    row({ first_name: 'Kiyan', last_name: 'Meharg', email: 'k@x.com', ticket_status: 'confirmed',
      dietary_requirements: 'None', medical_requirements: 'Type 1 diabetes',
      custom_answers: { 'q-4wd': true, 'q-multi': ['Tent', 'Swag'] } }),
    row({ display_name: 'Charli', email: 'c@x.com', registration_status: 'registered', ticket_status: null }),
  ]
  const csv = buildAttendeesCsv(rows, details, questions)
  const lines = csv.split('\n')
  const header = lines[2]
  const kiyan = lines.find((l) => l.startsWith('Kiyan')) ?? ''

  it('header carries base columns + one per question in order', () => {
    expect(header).toBe('Name,Status,Email,Phone,Postcode,Dietary,Medical,Emergency contact,Emergency phone,Arriving by 4WD?,Gear')
  })
  it('renders status label, medical, and boolean answer as Yes', () => {
    expect(kiyan).toContain('Going')
    expect(kiyan).toContain('Type 1 diabetes')
    expect(kiyan.endsWith('Yes,Tent; Swag')).toBe(true)
  })
  it('registered-no-ticket person is labelled, not dropped', () => {
    expect(lines.some((l) => l.startsWith('Charli') && l.includes('Registered (no ticket)'))).toBe(true)
  })
})

describe('buildPhoneList', () => {
  it('dedupes and skips blanks', () => {
    const rows = [row({ phone: '0400000000' }), row({ phone: '0400000000' }), row({ phone: null }), row({ phone: '0411111111' })]
    expect(buildPhoneList(rows)).toBe('0400000000\n0411111111')
  })
})
