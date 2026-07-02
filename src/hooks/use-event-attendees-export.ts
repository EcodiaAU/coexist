import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface AttendeeExportRow {
  user_id: string
  display_name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  postcode: string | null
  dietary_requirements: string | null
  checked_in_at: string | null
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
 * Admin-only attendee export, scoped to **checked-in attendees only** -
 * the use case (per Jess 2026-05-18) is forwarding post-event survey
 * lists to partner orgs, so registrations that never showed up are
 * irrelevant. The select pulls only the fields that need to leave the
 * platform (name, email, postcode), nothing more.
 */
export function useEventAttendeesExport(eventId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['event-attendees-export', eventId],
    queryFn: async (): Promise<AttendeeExportRow[]> => {
      if (!eventId) return []
      const { data, error } = await supabase
        .from('event_registrations')
        .select(`
          checked_in_at,
          user_id,
          profiles!event_registrations_user_id_fkey(
            display_name,
            first_name,
            last_name,
            email,
            postcode,
            dietary_requirements
          )
        `)
        .eq('event_id', eventId)
        .not('checked_in_at', 'is', null)
        .order('checked_in_at', { ascending: true })

      if (error) throw error

      return (data ?? []).map((row) => {
        const p = (row as { profiles?: Record<string, string | null> | null }).profiles ?? {}
        return {
          user_id: (row as { user_id: string }).user_id,
          display_name: p.display_name ?? null,
          first_name: p.first_name ?? null,
          last_name: p.last_name ?? null,
          email: p.email ?? null,
          postcode: p.postcode ?? null,
          dietary_requirements: p.dietary_requirements ?? null,
          checked_in_at: (row as { checked_in_at: string | null }).checked_in_at ?? null,
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

export function buildAttendeesCsv(rows: AttendeeExportRow[], details: EventDetailsForExport): string {
  const header = ['Name', 'Email', 'Postcode', 'Dietary']
  const meta = [
    `Event: ${details.title}`,
    details.collective_name ? `Collective: ${details.collective_name}` : '',
    `Date: ${new Date(details.date_start).toLocaleString('en-AU', { timeZone: 'UTC' })}`,
    details.activity_type ? `Activity: ${details.activity_type}` : '',
    details.address ? `Address: ${details.address}` : '',
    `Checked in: ${rows.length}`,
  ].filter(Boolean)

  const csvRows: string[][] = [
    header,
    ...rows.map((r) => [nameOf(r), r.email ?? '', r.postcode ?? '', r.dietary_requirements ?? '']),
  ]

  const csvBody = csvRows
    .map((row) => row.map((v) => escapeCsv(String(v ?? ''))).join(','))
    .join('\n')
  return [`# ${meta.join(' | ')}`, '', csvBody].join('\n')
}

export function buildAttendeesPlainText(rows: AttendeeExportRow[], details: EventDetailsForExport): string {
  const lines: string[] = []
  lines.push(details.title)
  lines.push(new Date(details.date_start).toLocaleString('en-AU', { timeZone: 'UTC' }))
  if (details.address) lines.push(details.address)
  if (details.collective_name) lines.push(details.collective_name)
  lines.push(`Checked in: ${rows.length}`)
  lines.push('')
  for (const r of rows) {
    const name = nameOf(r) || 'Unknown'
    const parts = [name]
    if (r.email) parts.push(`<${r.email}>`)
    if (r.postcode) parts.push(`postcode ${r.postcode}`)
    if (r.dietary_requirements) parts.push(`dietary: ${r.dietary_requirements}`)
    lines.push(`- ${parts.join(' · ')}`)
  }
  return lines.join('\n')
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
