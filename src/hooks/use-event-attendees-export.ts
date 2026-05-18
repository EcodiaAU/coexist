import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface AttendeeExportRow {
  user_id: string
  display_name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  emergency_contact_relationship: string | null
  status: string
  registered_at: string | null
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
 * Admin-only attendee export. Pulls every registration for an event with
 * the full profile (incl. emergency contacts) so Jess can copy-paste or
 * download as a file to forward externally. The select goes through the
 * regular PostgREST surface so RLS on `profiles` decides what's visible;
 * an admin role sees everything.
 */
export function useEventAttendeesExport(eventId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['event-attendees-export', eventId],
    queryFn: async (): Promise<AttendeeExportRow[]> => {
      if (!eventId) return []
      const { data, error } = await supabase
        .from('event_registrations')
        .select(`
          status,
          registered_at,
          checked_in_at,
          user_id,
          profiles!event_registrations_user_id_fkey(
            display_name,
            first_name,
            last_name,
            email,
            phone,
            emergency_contact_name,
            emergency_contact_phone,
            emergency_contact_relationship
          )
        `)
        .eq('event_id', eventId)
        .order('registered_at', { ascending: true })

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
          emergency_contact_name: p.emergency_contact_name ?? null,
          emergency_contact_phone: p.emergency_contact_phone ?? null,
          emergency_contact_relationship: p.emergency_contact_relationship ?? null,
          status: (row as { status: string }).status,
          registered_at: (row as { registered_at: string | null }).registered_at ?? null,
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

export function buildAttendeesCsv(rows: AttendeeExportRow[], details: EventDetailsForExport): string {
  const header = [
    'Name',
    'Email',
    'Phone',
    'Status',
    'Registered',
    'Checked in',
    'Emergency contact',
    'Emergency phone',
    'Relationship',
  ]
  const meta = [
    `Event: ${details.title}`,
    details.collective_name ? `Collective: ${details.collective_name}` : '',
    `Date: ${new Date(details.date_start).toLocaleString('en-AU')}`,
    details.activity_type ? `Activity: ${details.activity_type}` : '',
    details.address ? `Address: ${details.address}` : '',
    `Total: ${rows.length}`,
  ].filter(Boolean)

  const csvRows: string[][] = [
    header,
    ...rows.map((r) => [
      r.display_name ?? [r.first_name, r.last_name].filter(Boolean).join(' ') ?? '',
      r.email ?? '',
      r.phone ?? '',
      r.status,
      r.registered_at ? new Date(r.registered_at).toLocaleString('en-AU') : '',
      r.checked_in_at ? new Date(r.checked_in_at).toLocaleString('en-AU') : '',
      r.emergency_contact_name ?? '',
      r.emergency_contact_phone ?? '',
      r.emergency_contact_relationship ?? '',
    ]),
  ]

  const csvBody = csvRows.map((row) => row.map((v) => escapeCsv(String(v ?? ''))).join(',')).join('\n')
  return [
    `# ${meta.join(' | ')}`,
    '',
    csvBody,
  ].join('\n')
}

export function buildAttendeesPlainText(rows: AttendeeExportRow[], details: EventDetailsForExport): string {
  const lines: string[] = []
  lines.push(details.title)
  lines.push(new Date(details.date_start).toLocaleString('en-AU'))
  if (details.address) lines.push(details.address)
  if (details.collective_name) lines.push(details.collective_name)
  lines.push(`Total registered: ${rows.length}`)
  lines.push('')
  for (const r of rows) {
    const name = r.display_name ?? [r.first_name, r.last_name].filter(Boolean).join(' ') ?? 'Unknown'
    lines.push(`- ${name}${r.email ? ` <${r.email}>` : ''}${r.phone ? ` · ${r.phone}` : ''}`)
    if (r.emergency_contact_name || r.emergency_contact_phone) {
      const rel = r.emergency_contact_relationship ? ` (${r.emergency_contact_relationship})` : ''
      lines.push(`    emergency: ${r.emergency_contact_name ?? ''}${rel}${r.emergency_contact_phone ? ` · ${r.emergency_contact_phone}` : ''}`)
    }
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
