import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { EventTicketQuestion, TicketAnswers } from './use-event-ticket-questions'

/**
 * Comprehensive attendee export. Sourced from the get_event_attendee_export
 * SECURITY DEFINER RPC, which unions everyone with a registration OR a ticket
 * for the event across ALL states, and returns full contact + dietary +
 * medical + emergency-contact fields plus the custom-question answers on the
 * ticket. One export replaces the old registered/checked-in split.
 *
 * "Going" means the person holds a confirmed (or checked-in) ticket, which is
 * the app's own attendance definition; someone who registered interest but
 * never completed a ticket reads as "Registered (no ticket)", not Going.
 */

export interface AttendeeExportRow {
  user_id: string
  first_name: string | null
  last_name: string | null
  display_name: string | null
  email: string | null
  phone: string | null
  postcode: string | null
  dietary_requirements: string | null
  medical_requirements: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  emergency_contact_relationship: string | null
  registration_status: string | null
  registered_at: string | null
  ticket_status: string | null
  checked_in_at: string | null
  custom_answers: TicketAnswers | null
}

export interface EventDetailsForExport {
  title: string
  date_start: string
  date_end: string | null
  address: string | null
  activity_type: string | null
  collective_name: string | null
}

export type AttendeeStatusFilter = 'all' | 'going' | 'waitlisted' | 'cancelled'

export const STATUS_FILTERS: { value: AttendeeStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'going', label: 'Going' },
  { value: 'waitlisted', label: 'Waitlisted' },
  { value: 'cancelled', label: 'Cancelled' },
]

type StatusCategory = 'going' | 'waitlisted' | 'cancelled' | 'registered' | 'other'

/**
 * Collapse the registration + ticket state into one human status label + a
 * filter category. Confirmed/checked-in ticket wins ("Going"); this is the
 * distinction that caused the Charli/Max "no ticket" confusion.
 */
export function deriveStatus(r: AttendeeExportRow): { label: string; category: StatusCategory } {
  const t = r.ticket_status
  const reg = r.registration_status
  if (t === 'confirmed' || t === 'checked_in') {
    return { label: r.checked_in_at ? 'Checked in' : 'Going', category: 'going' }
  }
  if (reg === 'waitlisted') return { label: 'Waitlisted', category: 'waitlisted' }
  if (t === 'cancelled' || t === 'refunded' || reg === 'cancelled') {
    return { label: 'Cancelled', category: 'cancelled' }
  }
  if (reg === 'registered' || reg === 'attended') {
    return { label: 'Registered (no ticket)', category: 'registered' }
  }
  return { label: reg ?? t ?? 'Unknown', category: 'other' }
}

export function filterByStatus(rows: AttendeeExportRow[], filter: AttendeeStatusFilter): AttendeeExportRow[] {
  if (filter === 'all') return rows
  return rows.filter((r) => deriveStatus(r).category === filter)
}

export function useEventAttendeesExport(eventId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['event-attendees-export', eventId],
    queryFn: async (): Promise<AttendeeExportRow[]> => {
      if (!eventId) return []
      const { data, error } = await supabase.rpc('get_event_attendee_export', { p_event_id: eventId })
      if (error) throw error
      // The RPC is typed as jsonb (Json), so narrow through unknown.
      return (Array.isArray(data) ? data : []) as unknown as AttendeeExportRow[]
    },
    enabled: enabled && !!eventId,
    staleTime: 60 * 1000,
  })
}

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function nameOf(r: AttendeeExportRow): string {
  // Full name first (Tate 2026-06-08): exports carry First + Last so leaders
  // can disambiguate people who share a first name; display_name is a fallback.
  const full = [r.first_name, r.last_name].map((s) => (s ?? '').trim()).filter(Boolean).join(' ')
  return full || (r.display_name ?? '')
}

/** Render one custom-answer value into a cell: bool -> Yes/No, array joined. */
export function answerCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (Array.isArray(v)) return v.map((x) => String(x)).join('; ')
  return String(v)
}

const BASE_HEADER = [
  'Name',
  'Status',
  'Email',
  'Phone',
  'Postcode',
  'Dietary',
  'Medical',
  'Emergency contact',
  'Emergency phone',
] as const

export function buildAttendeesCsv(
  rows: AttendeeExportRow[],
  details: EventDetailsForExport,
  questions: EventTicketQuestion[] = [],
): string {
  const header = [...BASE_HEADER, ...questions.map((q) => q.prompt)]
  const meta = [
    `Event: ${details.title}`,
    details.collective_name ? `Collective: ${details.collective_name}` : '',
    `Date: ${new Date(details.date_start).toLocaleString('en-AU', { timeZone: 'UTC' })}`,
    details.activity_type ? `Activity: ${details.activity_type}` : '',
    details.address ? `Address: ${details.address}` : '',
    `Count: ${rows.length}`,
  ].filter(Boolean)

  const csvRows: string[][] = [
    header,
    ...rows.map((r) => {
      const ans = r.custom_answers ?? {}
      return [
        nameOf(r),
        deriveStatus(r).label,
        r.email ?? '',
        r.phone ?? '',
        r.postcode ?? '',
        r.dietary_requirements ?? '',
        r.medical_requirements ?? '',
        r.emergency_contact_name ?? '',
        r.emergency_contact_phone ?? '',
        ...questions.map((q) => answerCell(ans[q.id])),
      ]
    }),
  ]

  const csvBody = csvRows
    .map((row) => row.map((v) => escapeCsv(String(v ?? ''))).join(','))
    .join('\n')
  return [`# ${meta.join(' | ')}`, '', csvBody].join('\n')
}

export function buildAttendeesPlainText(
  rows: AttendeeExportRow[],
  details: EventDetailsForExport,
  questions: EventTicketQuestion[] = [],
): string {
  const lines: string[] = []
  lines.push(details.title)
  lines.push(new Date(details.date_start).toLocaleString('en-AU', { timeZone: 'UTC' }))
  if (details.address) lines.push(details.address)
  if (details.collective_name) lines.push(details.collective_name)
  lines.push(`Count: ${rows.length}`)
  lines.push('')
  for (const r of rows) {
    const name = nameOf(r) || 'Unknown'
    const ans = r.custom_answers ?? {}
    const parts = [`${name} [${deriveStatus(r).label}]`]
    if (r.email) parts.push(`<${r.email}>`)
    if (r.phone) parts.push(r.phone)
    if (r.postcode) parts.push(`postcode ${r.postcode}`)
    if (r.dietary_requirements) parts.push(`dietary: ${r.dietary_requirements}`)
    if (r.medical_requirements) parts.push(`medical: ${r.medical_requirements}`)
    if (r.emergency_contact_name) {
      parts.push(`emergency: ${r.emergency_contact_name}${r.emergency_contact_phone ? ` ${r.emergency_contact_phone}` : ''}`)
    }
    for (const q of questions) {
      const cell = answerCell(ans[q.id])
      if (cell) parts.push(`${q.prompt} ${cell}`)
    }
    lines.push(`- ${parts.join(' · ')}`)
  }
  return lines.join('\n')
}

/**
 * Numbers-only list for the WhatsApp-add use case: one phone number per line,
 * deduped, rows without a phone skipped.
 */
export function buildPhoneList(rows: AttendeeExportRow[]): string {
  const seen = new Set<string>()
  const numbers: string[] = []
  for (const r of rows) {
    const phone = (r.phone ?? '').trim()
    if (!phone || seen.has(phone)) continue
    seen.add(phone)
    numbers.push(phone)
  }
  return numbers.join('\n')
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
