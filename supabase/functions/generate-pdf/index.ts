/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * generate-pdf - Generate PDF reports for admin exports
 *
 * Called from Admin > Exports when the user selects PDF format.
 * Generates a PDF, uploads it to Supabase Storage, and returns a signed URL.
 *
 * Supported exportIds: members, attendance, impact-csv, impact-pdf, survey, financial,
 * orders, reconciliation, gst, donation-tax, charity-annual
 */

/* ------------------------------------------------------------------ */
/*  PDF generation via HTML → jsPDF-style text layout                  */
/* ------------------------------------------------------------------ */

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildHtmlTable(title: string, headers: string[], rows: string[][], dateRange: string): string {
  const headerCells = headers.map((h) => `<th style="border:1px solid #ddd;padding:8px;background:#1a6b3c;color:#fff;text-align:left;">${escapeHtml(h)}</th>`).join('')
  const bodyRows = rows.map((row, i) => {
    const bg = i % 2 === 0 ? '#fff' : '#f9f9f9'
    const cells = row.map((c) => `<td style="border:1px solid #ddd;padding:6px;">${escapeHtml(String(c ?? ''))}</td>`).join('')
    return `<tr style="background:${bg}">${cells}</tr>`
  }).join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
  h1 { color: #1a6b3c; margin: 0; }
  h2 { margin: 8px 0 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { border: 1px solid #ddd; padding: 8px; background: #1a6b3c; color: #fff; text-align: left; }
  td { border: 1px solid #ddd; padding: 6px; }
  .footer { text-align: center; color: #999; margin-top: 24px; font-size: 10px; }
  @media print {
    body { margin: 20px; }
    button { display: none !important; }
    @page { margin: 1.5cm; }
  }
</style>
</head>
<body>
  <div style="text-align:center;margin-bottom:24px;">
    <h1>Co-Exist Australia</h1>
    <h2>${escapeHtml(title)}</h2>
    <p style="color:#666;margin:0;">${dateRange ? `Period: ${escapeHtml(dateRange)}` : `Generated: ${new Date().toLocaleDateString('en-AU')}`}</p>
  </div>
  <button onclick="window.print()" style="display:block;margin:0 auto 20px;padding:8px 24px;background:#1a6b3c;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;">
    Save as PDF
  </button>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <p class="footer">Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC &bull; Co-Exist Australia</p>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`
}

/* ------------------------------------------------------------------ */
/*  Data fetchers per export type                                      */
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
  scope: string | undefined,
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
        headers: ['Event', 'Trees Planted', 'Volunteer Hours', 'Rubbish (kg)', 'Coastline (m)', 'Area Restored (m²)', 'Native Plants', 'Wildlife Sightings', 'Date'],
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
      // Aggregate key stats for ACNC annual report
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
        ['Area Restored (m²)', String(totals.area)],
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

    case 'impact-pdf': {
      let query = supabase
        .from('event_impact')
        .select('event_id, trees_planted, hours_total, rubbish_kg, coastline_cleaned_m, area_restored_sqm, native_plants, wildlife_sightings, logged_at, events(title)')
        .order('logged_at', { ascending: false })
      query = applyDateFilter(query, 'logged_at')
      const { data, error } = await query
      if (error) throw error

      const totals = (data ?? []).reduce((acc: any, r: any) => {
        acc.trees += r.trees_planted ?? 0
        acc.hours += r.hours_total ?? 0
        acc.rubbish += r.rubbish_kg ?? 0
        acc.plants += r.native_plants ?? 0
        acc.wildlife += r.wildlife_sightings ?? 0
        return acc
      }, { trees: 0, hours: 0, rubbish: 0, plants: 0, wildlife: 0 })

      const summaryRows: string[][] = [
        ['--- SUMMARY ---', '', '', '', '', '', '', '', ''],
        ['ALL EVENTS', String(totals.trees), String(totals.hours), String(totals.rubbish), '', '', String(totals.plants), String(totals.wildlife), ''],
        ['--- EVENT BREAKDOWN ---', '', '', '', '', '', '', '', ''],
        ...(data ?? []).map((r: any) => [
          r.events?.title ?? r.event_id ?? '', String(r.trees_planted ?? 0),
          String(r.hours_total ?? 0), String(r.rubbish_kg ?? 0),
          String(r.coastline_cleaned_m ?? 0), String(r.area_restored_sqm ?? 0),
          String(r.native_plants ?? 0), String(r.wildlife_sightings ?? 0),
          r.logged_at?.slice(0, 10) ?? '',
        ]),
      ]

      return {
        title: 'Environmental Impact Report',
        headers: ['Event', 'Trees Planted', 'Volunteer Hours', 'Rubbish (kg)', 'Coastline (m)', 'Area Restored (m²)', 'Native Plants', 'Wildlife Sightings', 'Date'],
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ---- Authenticate the caller ----
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

    // Verify caller is an admin
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

    // ---- Parse request ----
    const { exportId, dateStart, dateEnd, scope } = await req.json()
    if (!exportId) {
      return new Response(JSON.stringify({ error: 'exportId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ---- Fetch data and build HTML ----
    const { title, headers, rows } = await fetchExportData(supabase, exportId, dateStart, dateEnd, scope)

    const dateRange = dateStart || dateEnd
      ? `${dateStart || 'start'} to ${dateEnd || 'present'}`
      : ''

    const html = buildHtmlTable(title, headers, rows, dateRange)

    // ---- Return HTML directly - frontend opens a blob URL and prints it ----
    return new Response(
      JSON.stringify({ html }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[generate-pdf] Error:', err)
    return new Response(
      JSON.stringify({ error: 'PDF generation failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
