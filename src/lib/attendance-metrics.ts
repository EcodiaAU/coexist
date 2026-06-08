/**
 * Attendance + retention metrics - client types + plain-markdown renderer.
 *
 * Origin: Tate 2026-06-08. "Stop trying to do branded reports and just nail
 * the actual capability of surfacing metrics. Literally all it is is different
 * SQL queries, different scopes (time and collectives) and different math on
 * and between metrics... how many attendances at collective x between y and z,
 * and how many returned once, twice, 4 times."
 *
 * The numbers come from the canonical SQL engine coexist_attendance_metrics()
 * (migration 20260608100000). This module only types the result and renders it
 * as PLAIN markdown an exec can paste straight into their own doc - no branding,
 * no charts, no PDF.
 */

export interface PerCollectiveMetric {
  collective_id: string | null
  name: string | null
  events: number
  attendances: number
  unique_attendees: number
}

export interface AttendanceMetrics {
  scope: {
    collective_ids: string[] | null
    from: string
    to: string
    collective_names: string[]
  }
  events_in_scope: number
  events_with_attendance: number
  total_attendances: number
  unique_attendees: number
  registered_attendances: number
  walkin_attendances: number
  registrations: number
  signins: number
  followthrough_pct: number
  avg_attendance_per_event: number
  avg_attendance_per_active_event: number
  new_attendees: number
  returning_attendees: number
  retention: {
    attended_1: number
    attended_2: number
    attended_3: number
    attended_4_to_5: number
    attended_6_plus: number
    avg_events_per_attendee: number
    max_events_by_one_person: number
  }
  per_collective: PerCollectiveMetric[]
}

/** "1 Jan 2026" from an ISO/date string, in floating-local (UTC slice). */
function fmtDate(d: string): string {
  return new Date(d + (d.length === 10 ? 'T00:00:00Z' : '')).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function pct(part: number, whole: number): string {
  if (!whole) return '0%'
  return `${Math.round((part / whole) * 100)}%`
}

/**
 * Render the metrics as plain markdown. Deliberately unstyled - the whole point
 * is an exec pastes this into their own report and formats it however they like.
 */
export function formatAttendanceMetricsMd(m: AttendanceMetrics): string {
  const scopeLabel =
    m.scope.collective_names.length > 0
      ? m.scope.collective_names.join(', ')
      : 'All collectives (national)'
  const r = m.retention
  const lines: string[] = []

  lines.push(`## Co-Exist attendance metrics`)
  lines.push('')
  lines.push(`**Scope:** ${scopeLabel}`)
  lines.push(`**Dates:** ${fmtDate(m.scope.from)} to ${fmtDate(m.scope.to)}`)
  lines.push('')
  lines.push(`| Metric | Value |`)
  lines.push(`| --- | --- |`)
  lines.push(`| Events held | ${m.events_in_scope} |`)
  lines.push(`| Events with attendance | ${m.events_with_attendance} |`)
  lines.push(`| Total attendances | ${m.total_attendances} |`)
  lines.push(`| Unique attendees | ${m.unique_attendees} |`)
  lines.push(`| New attendees | ${m.new_attendees} (${pct(m.new_attendees, m.unique_attendees)}) |`)
  lines.push(`| Returning attendees | ${m.returning_attendees} (${pct(m.returning_attendees, m.unique_attendees)}) |`)
  lines.push(`| Avg attendance per event held | ${m.avg_attendance_per_event} |`)
  lines.push(`| Avg attendance per active event | ${m.avg_attendance_per_active_event} |`)
  lines.push(`| Registered vs walk-in | ${m.registered_attendances} / ${m.walkin_attendances} |`)
  lines.push(`| Registrations (signed up) | ${m.registrations} |`)
  lines.push(`| Sign-ins (actually attended) | ${m.signins} |`)
  lines.push(`| Follow-through rate | ${m.followthrough_pct}% |`)
  lines.push('')
  lines.push(`### Return frequency`)
  lines.push(`How many unique attendees came to N events in this window.`)
  lines.push('')
  lines.push(`| Events attended | People | Share |`)
  lines.push(`| --- | --- | --- |`)
  lines.push(`| 1 | ${r.attended_1} | ${pct(r.attended_1, m.unique_attendees)} |`)
  lines.push(`| 2 | ${r.attended_2} | ${pct(r.attended_2, m.unique_attendees)} |`)
  lines.push(`| 3 | ${r.attended_3} | ${pct(r.attended_3, m.unique_attendees)} |`)
  lines.push(`| 4-5 | ${r.attended_4_to_5} | ${pct(r.attended_4_to_5, m.unique_attendees)} |`)
  lines.push(`| 6+ | ${r.attended_6_plus} | ${pct(r.attended_6_plus, m.unique_attendees)} |`)
  lines.push('')
  const repeat = m.unique_attendees - r.attended_1
  lines.push(
    `Repeat attendees (came 2+ times): **${repeat}** (${pct(repeat, m.unique_attendees)}). ` +
      `Avg events per attendee: ${r.avg_events_per_attendee}. Most by one person: ${r.max_events_by_one_person}.`,
  )

  if (m.per_collective.length > 1) {
    lines.push('')
    lines.push(`### By collective`)
    lines.push('')
    lines.push(`| Collective | Events | Attendances | Unique attendees |`)
    lines.push(`| --- | --- | --- | --- |`)
    for (const c of m.per_collective) {
      lines.push(`| ${c.name ?? 'Unknown'} | ${c.events} | ${c.attendances} | ${c.unique_attendees} |`)
    }
  }

  lines.push('')
  lines.push(`_Generated ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} from live Co-Exist data._`)

  return lines.join('\n')
}
