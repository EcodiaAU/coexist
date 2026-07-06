import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface AttendeeExportRow {
  user_id: string
  display_name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  postcode: string | null
  dietary_requirements: string | null
  checked_in_at: string | null
  registered_at: string | null
}

export interface EventDetailsForExport {
  title: string
  date_start: string
  date_end: string | null
  address: string | null
  activity_type: string | null
  collective_name: string | null
}

/**
 * Which registrations the export covers:
 *  - 'registered'  - everyone with an active registration ('registered' or
 *    'attended' status), usable BEFORE the event. Use case (Jess via Tate,
 *    2026-07-06): dietaries report for grocery shopping ahead of a camp-out,
 *    and phone numbers for adding newcomers to the WhatsApp chat.
 *  - 'checked_in'  - only attendees with a check-in timestamp, the original
 *    post-event scope (per Jess 2026-05-18) for partner-org survey lists.
 *
 * Statuses come from the live registration_status enum (probed via pg_enum
 * 2026-07-06): registered | waitlisted | cancelled | attended | invited.
 * 'registered' + 'attended' matches the app's own "going" count on the
 * event page; waitlisted/invited/cancelled are excluded.
 */
export type AttendeeExportScope = 'registered' | 'checked_in'

const PROFILE_FIELDS = `
          display_name,
          first_name,
          last_name,
          email,
          phone,
          postcode,
          dietary_requirements
` as const

/**
 * Leader/staff attendee export. The select pulls only the fields that need
 * to leave the platform (name, email, phone, postcode, dietary), nothing
 * more. Leaders already see phone + dietary per attendee on the event-day
 * roster, so this exposes no new PII class to them.
 */
export function useEventAttendeesExport(
  eventId: string | undefined,
  scope: AttendeeExportScope,
  enabled = true,
) {
  return useQuery({
    queryKey: ['event-attendees-export', eventId, scope],
    queryFn: async (): Promise<AttendeeExportRow[]> => {
      if (!eventId) return []
      let query = supabase
        .from('event_registrations')
        .select(`
          checked_in_at,
          registered_at,
          user_id,
          profiles!event_registrations_user_id_fkey(${PROFILE_FIELDS})
        `)
        .eq('event_id', eventId)

      if (scope === 'checked_in') {
        query = query.not('checked_in_at', 'is', null).order('checked_in_at', { ascending: true })
      } else {
        query = query
          .in('status', ['registered', 'attended'])
          .order('registered_at', { ascending: true })
      }

      const { data, error } = await query
      if (error) throw error

      return (data ?? []).map((row) => {
        const p = (row as { profiles?: Record<string, string | null> | null }).profiles ?? {}
        return {
          user_id: (row as { user_id: string }).user_id,
          display_name: p.display_name ?? null,
          first_name: p.first_name ?? null,
          last_name: p.last_name ?? null,
          email: p.email ?? null,
          phone: p.phone ?? null,
          postcode: p.postcode ?? null,
          dietary_requirements: p.dietary_requirements ?? null,
          checked_in_at: (row as { checked_in_at: string | null }).checked_in_at ?? null,
          registered_at: (row as { registered_at: string | null }).registered_at ?? null,
        }
      })
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
  // Full name first (Tate 2026-06-08): exports must carry First + Last so
  // leaders/execs can disambiguate people who share a first name; the
  // self-chosen display_name is only a fallback.
  const full = [r.first_name, r.last_name].map((s) => (s ?? '').trim()).filter(Boolean).join(' ')
  return full || (r.display_name ?? '')
}

function scopeCountLabel(scope: AttendeeExportScope, count: number): string {
  return scope === 'checked_in' ? `Checked in: ${count}` : `Registered: ${count}`
}

export function buildAttendeesCsv(
  rows: AttendeeExportRow[],
  details: EventDetailsForExport,
  scope: AttendeeExportScope,
): string {
  const header = ['Name', 'Email', 'Phone', 'Postcode', 'Dietary']
  const meta = [
    `Event: ${details.title}`,
    details.collective_name ? `Collective: ${details.collective_name}` : '',
    `Date: ${new Date(details.date_start).toLocaleString('en-AU', { timeZone: 'UTC' })}`,
    details.activity_type ? `Activity: ${details.activity_type}` : '',
    details.address ? `Address: ${details.address}` : '',
    scopeCountLabel(scope, rows.length),
  ].filter(Boolean)

  const csvRows: string[][] = [
    header,
    ...rows.map((r) => [
      nameOf(r),
      r.email ?? '',
      r.phone ?? '',
      r.postcode ?? '',
      r.dietary_requirements ?? '',
    ]),
  ]

  const csvBody = csvRows
    .map((row) => row.map((v) => escapeCsv(String(v ?? ''))).join(','))
    .join('\n')
  return [`# ${meta.join(' | ')}`, '', csvBody].join('\n')
}

export function buildAttendeesPlainText(
  rows: AttendeeExportRow[],
  details: EventDetailsForExport,
  scope: AttendeeExportScope,
): string {
  const lines: string[] = []
  lines.push(details.title)
  lines.push(new Date(details.date_start).toLocaleString('en-AU', { timeZone: 'UTC' }))
  if (details.address) lines.push(details.address)
  if (details.collective_name) lines.push(details.collective_name)
  lines.push(scopeCountLabel(scope, rows.length))
  lines.push('')
  for (const r of rows) {
    const name = nameOf(r) || 'Unknown'
    const parts = [name]
    if (r.email) parts.push(`<${r.email}>`)
    if (r.phone) parts.push(r.phone)
    if (r.postcode) parts.push(`postcode ${r.postcode}`)
    if (r.dietary_requirements) parts.push(`dietary: ${r.dietary_requirements}`)
    lines.push(`- ${parts.join(' · ')}`)
  }
  return lines.join('\n')
}

/**
 * Numbers-only list for the WhatsApp-add use case: one phone number per
 * line, deduped, rows without a phone skipped. Paste straight into a
 * contacts import or a WhatsApp participant add.
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
