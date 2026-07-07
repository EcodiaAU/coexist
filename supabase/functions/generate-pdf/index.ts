/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * generate-pdf - Generate PDF reports for admin exports
 *
 * Called from Admin > Reports. Builds an HTML document the browser prints
 * as PDF. The Impact Report is a multi-section editorial document with
 * headline totals + per-collective breakdown + activity-type breakdown +
 * leadership roster. Other exports use a flat single-table layout.
 *
 * Supported exportIds: members, attendance, impact-csv, impact-pdf, survey,
 * financial, orders, reconciliation, gst, donation-tax, charity-annual
 */

function escapeHtml(str: string): string {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/* ------------------------------------------------------------------ */
/*  Shared HTML chrome for all report types                            */
/* ------------------------------------------------------------------ */

const REPORT_CSS = `
  :root {
    --ink: #1a1a1a;
    --ink-soft: #555;
    --ink-trace: #888;
    --line: #d8d8d8;
    --line-soft: #ececec;
  }
  * { box-sizing: border-box; }
  body {
    font-family: Calibri, "Segoe UI", Arial, sans-serif;
    color: var(--ink);
    margin: 40px 50px;
    font-size: 11pt;
    line-height: 1.45;
  }
  h1 {
    font-size: 22pt;
    font-weight: 700;
    color: var(--ink);
    margin: 0 0 4px 0;
    letter-spacing: -0.01em;
  }
  h2 {
    font-size: 13pt;
    font-weight: 700;
    margin: 32px 0 12px 0;
    color: var(--ink);
    border-bottom: 1px solid var(--line);
    padding-bottom: 6px;
  }
  .doc-header {
    margin-bottom: 28px;
    padding-bottom: 16px;
    border-bottom: 2px solid var(--ink);
  }
  .doc-header .meta {
    color: var(--ink-soft);
    font-size: 10pt;
    margin: 2px 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
    margin: 0 0 6px 0;
  }
  th {
    text-align: left;
    padding: 6px 8px;
    border-bottom: 1.5px solid var(--ink);
    font-weight: 700;
    background: transparent;
    color: var(--ink);
    font-size: 10pt;
  }
  td {
    padding: 5px 8px;
    border-bottom: 1px solid var(--line-soft);
    vertical-align: top;
  }
  tr.total-row td {
    font-weight: 700;
    border-top: 1.5px solid var(--ink);
    border-bottom: 1.5px solid var(--ink);
    padding-top: 8px;
  }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.muted { color: var(--ink-soft); font-style: italic; }
  .kv-table td { border: none; padding: 4px 8px 4px 0; }
  .kv-table td:first-child { color: var(--ink-soft); width: 40%; }
  .kv-table td:last-child { font-weight: 600; font-variant-numeric: tabular-nums; }
  .footer-note {
    margin-top: 36px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
    font-size: 9pt;
    color: var(--ink-trace);
  }
  .print-btn {
    display: block;
    margin: 0 auto 28px;
    padding: 8px 24px;
    background: var(--ink);
    color: #fff;
    border: 0;
    border-radius: 4px;
    cursor: pointer;
    font-size: 10pt;
    font-family: inherit;
  }
  @media print {
    .print-btn { display: none !important; }
    @page { margin: 1.8cm; }
    body { margin: 0; }
    h2 { page-break-after: avoid; }
    tr { page-break-inside: avoid; }
  }
`

function htmlShell(title: string, bodyInner: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Save as PDF</button>
  ${bodyInner}
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 300); };</script>
</body>
</html>`
}

/* ------------------------------------------------------------------ */
/*  Flat single-table layout (used by every export except Impact)      */
/* ------------------------------------------------------------------ */

function buildFlatTableReport(title: string, headers: string[], rows: string[][], dateRange: string): string {
  const headerCells = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')
  const bodyRows = rows.map((row) => {
    const cells = row.map((c) => `<td>${escapeHtml(String(c ?? ''))}</td>`).join('')
    return `<tr>${cells}</tr>`
  }).join('')

  const inner = `
    <div class="doc-header">
      <h1>${escapeHtml(title)}</h1>
      <p class="meta">Co-Exist Australia</p>
      <p class="meta">${dateRange ? `Period: ${escapeHtml(dateRange)}` : `Generated: ${new Date().toLocaleDateString('en-AU')}`}</p>
    </div>
    <table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <p class="footer-note">Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. Co-Exist Australia.</p>`

  return htmlShell(title, inner)
}

/* ------------------------------------------------------------------ */
/*  Impact Report - multi-section editorial layout                     */
/* ------------------------------------------------------------------ */

interface CollectiveRow {
  id: string
  name: string
  region: string | null
  state: string | null
  is_active: boolean
}

interface EventWithImpact {
  id: string
  title: string
  date_start: string
  activity_type: string | null
  collective_id: string | null
  status: string
  event_impact: Array<{
    attendees: number | null
    trees_planted: number | null
    rubbish_kg: number | null
    hours_total: number | null
    native_plants: number | null
    area_restored_sqm: number | null
    wildlife_sightings: number | null
  }>
}

interface MemberRow {
  collective_id: string
  role: string
}

const ACTIVITY_LABELS: Record<string, string> = {
  clean_up: 'Clean-up',
  shore_cleanup: 'Shoreline clean-up',
  nature_hike: 'Nature hike',
  nature_walk: 'Nature walk',
  tree_planting: 'Tree planting',
  spotlighting: 'Spotlighting (wildlife)',
  land_regeneration: 'Land regeneration',
  ecosystem_restoration: 'Ecosystem restoration',
  marine_restoration: 'Marine restoration',
  workshop: 'Workshop',
  camp_out: 'Camp out',
  retreat: 'Retreat',
  other: 'Other',
}

function num(n: number | null | undefined): string {
  if (n == null) return '0'
  return Math.round(n).toLocaleString('en-AU')
}

function dec(n: number | null | undefined, places = 1): string {
  if (n == null) return '0'
  return n.toLocaleString('en-AU', { minimumFractionDigits: places, maximumFractionDigits: places })
}

async function buildImpactReport(
  supabase: ReturnType<typeof createClient>,
  dateStart: string | undefined,
  dateEnd: string | undefined,
  collectiveId: string | undefined,
): Promise<{ title: string; html: string }> {
  // ---- Pull collectives. Active + Byron Bay (legacy alias for Northern Rivers). ----
  const { data: collectivesData, error: cErr } = await supabase
    .from('collectives')
    .select('id, name, region, state, is_active')
    .or('is_active.eq.true,name.eq.Byron Bay')
    .order('name')
  if (cErr) throw cErr
  const collectives = (collectivesData ?? []) as unknown as CollectiveRow[]

  // ---- Pull events in range with embedded impact. ----
  let eventsQuery = supabase
    .from('events')
    .select('id, title, date_start, activity_type, collective_id, status, event_impact(attendees, trees_planted, rubbish_kg, hours_total, native_plants, area_restored_sqm, wildlife_sightings)')
    .neq('status', 'cancelled')
  if (dateStart) eventsQuery = eventsQuery.gte('date_start', dateStart)
  if (dateEnd) eventsQuery = eventsQuery.lte('date_start', dateEnd + 'T23:59:59')
  if (collectiveId) eventsQuery = eventsQuery.eq('collective_id', collectiveId)
  const { data: eventsData, error: eErr } = await eventsQuery
  if (eErr) throw eErr
  const events = (eventsData ?? []) as unknown as EventWithImpact[]

  // ---- Pull active leaders for the leadership roster. ----
  const { data: membersData, error: mErr } = await supabase
    .from('collective_members')
    .select('collective_id, role')
    .in('role', ['leader', 'co_leader', 'assist_leader'])
    .eq('status', 'active')
  if (mErr) throw mErr
  const members = (membersData ?? []) as unknown as MemberRow[]

  /* ---- Aggregate ---- */

  const collectiveById = new Map<string, CollectiveRow>()
  for (const c of collectives) collectiveById.set(c.id, c)

  const byCollective = new Map<string, {
    name: string; region: string; state: string;
    events: number; attendees: number; trees: number; rubbish: number; hours: number;
  }>()

  const byActivity = new Map<string, {
    label: string; events: number; trees: number; rubbish: number;
  }>()

  const leadersByCollective = new Map<string, number>()
  for (const m of members) {
    leadersByCollective.set(m.collective_id, (leadersByCollective.get(m.collective_id) ?? 0) + 1)
  }

  let totalEvents = 0
  let totalAttendees = 0
  let totalTrees = 0
  let totalRubbish = 0
  let totalHours = 0
  let totalNativePlants = 0
  let totalAreaRestored = 0

  for (const e of events) {
    totalEvents++

    const impact = e.event_impact?.[0] ?? null
    const attendees = impact?.attendees ?? 0
    const trees = impact?.trees_planted ?? 0
    const rubbish = Number(impact?.rubbish_kg ?? 0)
    const hours = Number(impact?.hours_total ?? 0)
    const plants = impact?.native_plants ?? 0
    const area = Number(impact?.area_restored_sqm ?? 0)

    totalAttendees += attendees
    totalTrees += trees
    totalRubbish += rubbish
    totalHours += hours
    totalNativePlants += plants
    totalAreaRestored += area

    // Per collective
    if (e.collective_id) {
      const c = collectiveById.get(e.collective_id)
      if (c) {
        const key = c.id
        const row = byCollective.get(key) ?? {
          name: c.name,
          region: c.region ?? c.name,
          state: c.state ?? '',
          events: 0, attendees: 0, trees: 0, rubbish: 0, hours: 0,
        }
        row.events++
        row.attendees += attendees
        row.trees += trees
        row.rubbish += rubbish
        row.hours += hours
        byCollective.set(key, row)
      }
    }

    // Per activity type
    const activityKey = e.activity_type ?? 'other'
    const activityRow = byActivity.get(activityKey) ?? {
      label: ACTIVITY_LABELS[activityKey] ?? activityKey,
      events: 0, trees: 0, rubbish: 0,
    }
    activityRow.events++
    activityRow.trees += trees
    activityRow.rubbish += rubbish
    byActivity.set(activityKey, activityRow)
  }

  // Sort per-collective: events desc, then attendees desc
  const perCollectiveSorted = Array.from(byCollective.values()).sort((a, b) => {
    if (b.events !== a.events) return b.events - a.events
    return b.attendees - a.attendees
  })

  // Sort activity types by event count desc
  const perActivitySorted = Array.from(byActivity.values()).sort((a, b) => b.events - a.events)

  // Sort leaders desc, only show collectives the report scope includes
  const leadersSorted = collectives
    .filter((c) => c.is_active && (!collectiveId || c.id === collectiveId))
    .map((c) => ({ name: c.name, leaders: leadersByCollective.get(c.id) ?? 0 }))
    .sort((a, b) => b.leaders - a.leaders)

  const totalLeaders = leadersSorted.reduce((s, r) => s + r.leaders, 0)
  const distinctRegions = new Set(collectives.filter((c) => c.is_active).map((c) => c.region ?? c.name)).size
  const distinctStates = new Set(collectives.filter((c) => c.is_active).map((c) => c.state).filter(Boolean)).size

  /* ---- Render ---- */

  const dateRange = dateStart || dateEnd
    ? `${dateStart || 'start'} to ${dateEnd || 'present'}`
    : 'All time'

  const scopeNote = collectiveId
    ? `Single-collective view: ${escapeHtml(collectiveById.get(collectiveId)?.name ?? collectiveId)}`
    : `National (${distinctRegions} regions, ${distinctStates} states/territories)`

  const headlineRows = [
    ['Active collectives', collectiveId ? '1 (this collective)' : `${collectives.filter((c) => c.is_active).length}`],
    ['Events delivered', num(totalEvents)],
    ['Total attendances', num(totalAttendees)],
    ['Trees planted', num(totalTrees)],
    ['Litter removed', `${dec(totalRubbish, 1)} kg`],
    ['Native plants planted', num(totalNativePlants)],
    ['Volunteer hours logged', num(totalHours)],
    ['Area restored', `${num(totalAreaRestored)} sqm`],
    ['Active leadership roles', collectiveId
      ? `${leadersSorted.find((l) => true)?.leaders ?? 0}`
      : `${totalLeaders} (Leaders + Co-Leaders + Assistant Leaders)`],
  ]

  const headlineHtml = `<table class="kv-table"><tbody>${headlineRows.map((r) =>
    `<tr><td>${escapeHtml(r[0])}</td><td>${escapeHtml(r[1])}</td></tr>`).join('')}</tbody></table>`

  // Per-collective table
  const perCollectiveTotal = {
    events: perCollectiveSorted.reduce((s, r) => s + r.events, 0),
    attendees: perCollectiveSorted.reduce((s, r) => s + r.attendees, 0),
    trees: perCollectiveSorted.reduce((s, r) => s + r.trees, 0),
    rubbish: perCollectiveSorted.reduce((s, r) => s + r.rubbish, 0),
    hours: perCollectiveSorted.reduce((s, r) => s + r.hours, 0),
  }

  const perCollectiveHtml = perCollectiveSorted.length === 0
    ? `<p class="muted">No events in this period.</p>`
    : `<table>
        <thead><tr>
          <th>#</th>
          <th>Collective</th>
          <th>State</th>
          <th class="num">Events</th>
          <th class="num">Attendees</th>
          <th class="num">Trees</th>
          <th class="num">Litter (kg)</th>
          <th class="num">Hours</th>
        </tr></thead>
        <tbody>
          ${perCollectiveSorted.map((r, i) =>
            `<tr>
              <td>${i + 1}</td>
              <td>${escapeHtml(r.name)}</td>
              <td>${escapeHtml(r.state)}</td>
              <td class="num">${num(r.events)}</td>
              <td class="num">${num(r.attendees)}</td>
              <td class="num">${num(r.trees)}</td>
              <td class="num">${dec(r.rubbish, 1)}</td>
              <td class="num">${num(r.hours)}</td>
            </tr>`).join('')}
          <tr class="total-row">
            <td></td>
            <td>TOTAL</td>
            <td></td>
            <td class="num">${num(perCollectiveTotal.events)}</td>
            <td class="num">${num(perCollectiveTotal.attendees)}</td>
            <td class="num">${num(perCollectiveTotal.trees)}</td>
            <td class="num">${dec(perCollectiveTotal.rubbish, 1)}</td>
            <td class="num">${num(perCollectiveTotal.hours)}</td>
          </tr>
        </tbody>
      </table>`

  // Activity-type table
  const perActivityHtml = perActivitySorted.length === 0
    ? `<p class="muted">No events in this period.</p>`
    : `<table>
        <thead><tr>
          <th>Activity type</th>
          <th class="num">Events</th>
          <th class="num">Trees</th>
          <th class="num">Litter (kg)</th>
        </tr></thead>
        <tbody>
          ${perActivitySorted.map((r) =>
            `<tr>
              <td>${escapeHtml(r.label)}</td>
              <td class="num">${num(r.events)}</td>
              <td class="num">${num(r.trees)}</td>
              <td class="num">${dec(r.rubbish, 1)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`

  // Leadership table
  const leadershipHtml = leadersSorted.length === 0
    ? `<p class="muted">No leadership data for this scope.</p>`
    : `<table>
        <thead><tr>
          <th>Collective</th>
          <th class="num">Active leaders</th>
        </tr></thead>
        <tbody>
          ${leadersSorted.map((r) =>
            `<tr>
              <td>${escapeHtml(r.name)}</td>
              <td class="num">${num(r.leaders)}</td>
            </tr>`).join('')}
          <tr class="total-row">
            <td>TOTAL</td>
            <td class="num">${num(totalLeaders)}</td>
          </tr>
        </tbody>
      </table>`

  const title = collectiveId
    ? `Impact Report - ${collectiveById.get(collectiveId)?.name ?? 'Collective'}`
    : 'Impact Report'

  const inner = `
    <div class="doc-header">
      <h1>${escapeHtml(title)}</h1>
      <p class="meta">Co-Exist Australia</p>
      <p class="meta">Period: ${escapeHtml(dateRange)}</p>
      <p class="meta">${scopeNote}</p>
    </div>

    <h2>Headline totals</h2>
    ${headlineHtml}

    <h2>Per-collective breakdown</h2>
    ${perCollectiveHtml}

    <h2>Activity-type breakdown</h2>
    ${perActivityHtml}

    <h2>Leadership roster</h2>
    ${leadershipHtml}

    <p class="footer-note">
      Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. Data sourced from the Co-Exist app (Supabase).
      Volunteer hours are leader-reported. Where an event has no end-time recorded, hours default to attendees x 3h.
    </p>`

  return { title, html: htmlShell(title, inner) }
}

/* ------------------------------------------------------------------ */
/*  Data fetchers for the flat-table reports                           */
/* ------------------------------------------------------------------ */

interface ExportResult {
  title: string
  headers: string[]
  rows: string[][]
}

async function fetchExportData(
  supabase: ReturnType<typeof createClient>,
  exportId: string,
  dateStart: string | undefined,
  dateEnd: string | undefined,
  _scope: string | undefined,
): Promise<ExportResult> {
  const applyDateFilter = (query: any, col = 'created_at') => {
    if (dateStart) query = query.gte(col, dateStart)
    if (dateEnd) query = query.lte(col, dateEnd + 'T23:59:59')
    return query
  }

  switch (exportId) {
    case 'members': {
      let query = supabase
        .from('profiles')
        .select('display_name, email, role, created_at')
        .order('created_at', { ascending: false })
      query = applyDateFilter(query)
      const { data, error } = await query
      if (error) throw error
      return {
        title: 'Member Report',
        headers: ['Name', 'Email', 'Role', 'Join Date'],
        rows: (data ?? []).map((r: any) => [
          r.display_name ?? '', r.email ?? '', r.role ?? '', r.created_at?.slice(0, 10) ?? '',
        ]),
      }
    }

    case 'attendance': {
      let query = supabase
        .from('event_registrations')
        .select('event_id, user_id, registered_at, checked_in_at, events(title), profiles(display_name, email)')
        .order('registered_at', { ascending: false })
      query = applyDateFilter(query, 'registered_at')
      const { data, error } = await query
      if (error) throw error
      return {
        title: 'Attendance Report',
        headers: ['Event', 'Name', 'Email', 'Checked In', 'Check-in Time'],
        rows: (data ?? []).map((r: any) => [
          r.events?.title ?? '', r.profiles?.display_name ?? '', r.profiles?.email ?? '',
          r.checked_in_at ? 'Yes' : 'No', r.checked_in_at?.slice(0, 16)?.replace('T', ' ') ?? '',
        ]),
      }
    }

    case 'impact-csv': {
      let query = supabase
        .from('event_impact')
        .select('event_id, trees_planted, hours_total, rubbish_kg, coastline_cleaned_m, area_restored_sqm, native_plants, wildlife_sightings, logged_at, events(title)')
        .order('logged_at', { ascending: false })
      query = applyDateFilter(query, 'logged_at')
      const { data, error } = await query
      if (error) throw error
      return {
        title: 'Environmental Impact Report',
        headers: ['Event', 'Trees Planted', 'Volunteer Hours', 'Rubbish (kg)', 'Coastline (m)', 'Area Restored (sqm)', 'Native Plants', 'Wildlife Sightings', 'Date'],
        rows: (data ?? []).map((r: any) => [
          r.events?.title ?? r.event_id ?? '', String(r.trees_planted ?? 0),
          String(r.hours_total ?? 0), String(r.rubbish_kg ?? 0),
          String(r.coastline_cleaned_m ?? 0), String(r.area_restored_sqm ?? 0),
          String(r.native_plants ?? 0), String(r.wildlife_sightings ?? 0),
          r.logged_at?.slice(0, 10) ?? '',
        ]),
      }
    }

    case 'survey': {
      let query = supabase
        .from('survey_responses')
        .select('id, survey_id, event_id, user_id, answers, submitted_at, surveys(title), events(title), profiles(display_name)')
        .order('submitted_at', { ascending: false })
      query = applyDateFilter(query, 'submitted_at')
      const { data, error } = await query
      if (error) throw error
      return {
        title: 'Survey Responses Report',
        headers: ['Response ID', 'Survey', 'Event', 'Respondent', 'Answers', 'Submitted'],
        rows: (data ?? []).map((r: any) => [
          r.id ?? '', r.surveys?.title ?? r.survey_id ?? '', r.events?.title ?? r.event_id ?? '',
          r.profiles?.display_name ?? r.user_id ?? '',
          JSON.stringify(r.answers ?? {}), r.submitted_at?.slice(0, 10) ?? '',
        ]),
      }
    }

    case 'financial': {
      let query = supabase
        .from('donations')
        .select('id, amount_cents, currency, donor_name, donor_email, receipt_number, created_at')
        .order('created_at', { ascending: false })
      query = applyDateFilter(query)
      const { data, error } = await query
      if (error) throw error
      return {
        title: 'Financial Report - Donations',
        headers: ['ID', 'Amount', 'Currency', 'Donor Name', 'Donor Email', 'Receipt #', 'Date'],
        rows: (data ?? []).map((r: any) => [
          r.id ?? '', ((r.amount_cents ?? 0) / 100).toFixed(2), r.currency ?? 'AUD',
          r.donor_name ?? '', r.donor_email ?? '', r.receipt_number ?? '',
          r.created_at?.slice(0, 10) ?? '',
        ]),
      }
    }

    case 'orders': {
      let query = supabase
        .from('merch_orders')
        .select('id, status, total_cents, shipping_name, shipping_address, shipping_city, shipping_state, shipping_postcode, created_at')
        .order('created_at', { ascending: false })
      query = applyDateFilter(query)
      const { data, error } = await query
      if (error) throw error
      return {
        title: 'Merchandise Orders Report',
        headers: ['Order ID', 'Status', 'Total', 'Name', 'Address', 'City', 'State', 'Postcode', 'Date'],
        rows: (data ?? []).map((r: any) => [
          r.id ?? '', r.status ?? '', ((r.total_cents ?? 0) / 100).toFixed(2),
          r.shipping_name ?? '', r.shipping_address ?? '', r.shipping_city ?? '',
          r.shipping_state ?? '', r.shipping_postcode ?? '', r.created_at?.slice(0, 10) ?? '',
        ]),
      }
    }

    case 'reconciliation': {
      let query = supabase
        .from('payments')
        .select('id, stripe_payment_id, amount_cents, status, type, created_at')
        .order('created_at', { ascending: false })
      query = applyDateFilter(query)
      const { data, error } = await query
      if (error) throw error
      return {
        title: 'Payment Reconciliation Report',
        headers: ['ID', 'Stripe Payment ID', 'Amount', 'Status', 'Type', 'Date'],
        rows: (data ?? []).map((r: any) => [
          r.id ?? '', r.stripe_payment_id ?? '', ((r.amount_cents ?? 0) / 100).toFixed(2),
          r.status ?? '', r.type ?? '', r.created_at?.slice(0, 10) ?? '',
        ]),
      }
    }

    case 'gst': {
      let query = supabase
        .from('merch_orders')
        .select('id, total_cents, gst_cents, status, created_at')
        .eq('status', 'delivered')
        .order('created_at', { ascending: false })
      query = applyDateFilter(query)
      const { data, error } = await query
      if (error) throw error
      return {
        title: 'GST Report',
        headers: ['Order ID', 'Total (ex GST)', 'GST', 'Total (inc GST)', 'Date'],
        rows: (data ?? []).map((r: any) => {
          const gst = (r.gst_cents ?? 0) / 100
          const total = (r.total_cents ?? 0) / 100
          return [r.id ?? '', (total - gst).toFixed(2), gst.toFixed(2), total.toFixed(2), r.created_at?.slice(0, 10) ?? '']
        }),
      }
    }

    case 'donation-tax': {
      let query = supabase
        .from('donations')
        .select('donor_name, donor_email, amount_cents, receipt_number, created_at')
        .order('donor_email')
      query = applyDateFilter(query)
      const { data, error } = await query
      if (error) throw error
      const byDonor: Record<string, { name: string; email: string; total: number; count: number }> = {}
      for (const d of (data ?? []) as any[]) {
        const key = d.donor_email ?? 'unknown'
        if (!byDonor[key]) byDonor[key] = { name: d.donor_name ?? '', email: key, total: 0, count: 0 }
        byDonor[key].total += (d.amount_cents ?? 0)
        byDonor[key].count++
      }
      return {
        title: 'Donation Tax Summary',
        headers: ['Donor Name', 'Email', 'Total Donated', 'Donation Count'],
        rows: Object.values(byDonor).map((d) => [
          d.name, d.email, (d.total / 100).toFixed(2), String(d.count),
        ]),
      }
    }

    case 'charity-annual': {
      const [membersRes, eventsRes, impactRes, donationsRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('events').select('id, title, start_time, status').eq('status', 'completed').order('start_time'),
        supabase.from('event_impact').select('trees_planted, hours_total, rubbish_kg, coastline_cleaned_m, area_restored_sqm, native_plants, wildlife_sightings'),
        supabase.from('donations').select('amount_cents, donor_name, donor_email, created_at'),
      ])
      const totalMembers = membersRes.count ?? 0
      const events = eventsRes.data ?? []
      const impacts = impactRes.data ?? []
      const donations = donationsRes.data ?? []

      const totals = impacts.reduce((acc: any, r: any) => {
        acc.trees += r.trees_planted ?? 0
        acc.hours += r.hours_total ?? 0
        acc.rubbish += r.rubbish_kg ?? 0
        acc.coastline += r.coastline_cleaned_m ?? 0
        acc.area += r.area_restored_sqm ?? 0
        acc.plants += r.native_plants ?? 0
        acc.wildlife += r.wildlife_sightings ?? 0
        return acc
      }, { trees: 0, hours: 0, rubbish: 0, coastline: 0, area: 0, plants: 0, wildlife: 0 })

      const totalDonations = donations.reduce((sum: number, d: any) => sum + (d.amount_cents ?? 0), 0)

      const summaryRows: string[][] = [
        ['Total Members', String(totalMembers)],
        ['Events Completed', String(events.length)],
        ['Total Volunteer Hours', String(totals.hours)],
        ['Trees Planted', String(totals.trees)],
        ['Native Plants', String(totals.plants)],
        ['Rubbish Collected (kg)', String(totals.rubbish)],
        ['Coastline Cleaned (m)', String(totals.coastline)],
        ['Area Restored (sqm)', String(totals.area)],
        ['Wildlife Sightings', String(totals.wildlife)],
        ['Total Donations Received', `$${(totalDonations / 100).toFixed(2)}`],
        ['Unique Donors', String(new Set(donations.map((d: any) => d.donor_email).filter(Boolean)).size)],
      ]

      return {
        title: 'Charity Annual Report',
        headers: ['Metric', 'Value'],
        rows: summaryRows,
      }
    }

    default:
      throw new Error(`Unknown export type: ${exportId}`)
  }
}

/* ------------------------------------------------------------------ */
/*  Main handler                                                       */
/* ------------------------------------------------------------------ */

Deno.serve(withSentry('generate-pdf', async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const token = authHeader.replace('Bearer ', '')
    const gotruRes = await fetch(`${Deno.env.get('SUPABASE_URL')!}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! },
    })
    if (!gotruRes.ok) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const caller = await gotruRes.json() as { id: string; email?: string }

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (!callerProfile || !['national_leader', 'manager', 'admin'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { exportId, dateStart, dateEnd, scope, collectiveId } = await req.json()
    if (!exportId) {
      return new Response(JSON.stringify({ error: 'exportId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ---- Impact report uses dedicated multi-section renderer. ----
    if (exportId === 'impact-pdf') {
      const { html } = await buildImpactReport(supabase, dateStart, dateEnd, collectiveId)
      return new Response(
        JSON.stringify({ html }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ---- All other reports use the flat single-table layout. ----
    const { title, headers, rows } = await fetchExportData(supabase, exportId, dateStart, dateEnd, scope)
    const dateRange = dateStart || dateEnd ? `${dateStart || 'start'} to ${dateEnd || 'present'}` : ''
    const html = buildFlatTableReport(title, headers, rows, dateRange)

    return new Response(
      JSON.stringify({ html }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[generate-pdf] Error:', err)
    return new Response(
      JSON.stringify({ error: 'PDF generation failed', detail: String((err as Error)?.message ?? err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
}))
