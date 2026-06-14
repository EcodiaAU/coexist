/**
 * stats-drift-check - Supabase Edge Function (Co-Exist)
 *
 * Self-contained app-vs-master-sheet stats drift detector. Runs entirely on the
 * Co-Exist project so it never depends on an EcodiaOS-side Microsoft Graph token
 * again (the prior EcodiaOS cron `coexist-stats-drift-check` went dark on
 * 2026-06-02 when it was folded into `coexist-health-pass`, whose sub-pass C has
 * no Graph token and could not read the master sheet).
 *
 * What it does, once per run:
 *   1. Reads the master sheet's human-maintained "OVERALL" tab TOTAL row via
 *      Microsoft Graph (same drive/item/credential plumbing as excel-sync). The
 *      OVERALL TOTAL is the only apples-to-apples comparand for the app's
 *      baseline+live rollup; summing the per-event "Post Event Review" tab
 *      undercounts because pre-2026 history lives only as aggregate year-rows.
 *   2. Computes the canonical app aggregation - the SAME national all-time
 *      rollup the /admin/impact summary cards show (baseline + live, with the
 *      baseline-remainder math ported verbatim from src/lib/impact-query.ts
 *      applyBaselineRemainder + src/hooks/use-impact.ts).
 *   3. Diffs the two. Any metric whose absolute delta exceeds 5% of the sheet
 *      total flags drift.
 *   4. Writes app_settings.stats_drift_last_run (the row the /admin/impact badge
 *      reads) and app_settings.stats_drift_detected.
 *
 * BADGE CONTRACT (verified against src/pages/admin/impact.tsx:538): the badge
 * fires when stats_drift_last_run.value.status === 'drift'. The prior cron wrote
 * status 'drift_detected', which !== 'drift', so the badge NEVER fired even on a
 * real drift reading. This function writes 'drift' / 'ok' so the badge reflects
 * reality. The richer payload shape (delta.<metric>.{ok,app,diff,sheet} plus the
 * informational delta.trees_2026) is preserved from the historical row so any
 * downstream reader stays compatible.
 *
 * ALERTING: this function owns ONLY the Co-Exist-side flag. The EcodiaOS
 * `coexist-health-pass` cron is the watcher that raises a status_board P2 when
 * stats_drift_last_run is stale (>36h) or status==='drift'. Keeping the
 * status_board write on the EcodiaOS side means no EcodiaOS service-role key has
 * to be embedded in this Co-Exist function.
 *
 * INVOKE:
 *   POST /stats-drift-check            -> run the check, write the flags
 *   POST /stats-drift-check?dry=1      -> compute + return, do NOT write
 *
 * Wired by pg_cron job `stats-drift-check-daily` (16:00 UTC = 02:00 AEST) via
 * public.cron_stats_drift_check().
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---- Config (mirrors excel-sync) ----
const GRAPH_TENANT_ID = Deno.env.get('GRAPH_TENANT_ID') ?? ''
const GRAPH_CLIENT_ID = Deno.env.get('GRAPH_CLIENT_ID') ?? ''
const GRAPH_CLIENT_SECRET = Deno.env.get('GRAPH_CLIENT_SECRET') ?? ''
const DRIVE_ID = 'b!jB_eUPJMbUWf3eip_Me-34G0StMYwYdHtdf4sTNow-uVV9nof_IvQprzswNpaD8y'
const ITEM_ID = '01RJHFBL37QUUGOQUVL5DJ67A53VKNDAGE'

// Sheet-side ground truth is the human-maintained "OVERALL" tab (one row per year
// plus a TOTAL row), NOT the per-event "Post Event Review" tab. Verified 2026-06-15:
// the OVERALL TOTAL row reproduces every historical drift-run figure exactly
// (attendees 6799, events 426, rubbish 5649.64, trees 45239) whereas a row-sum of
// Post Event Review undercounts by ~40% because the bulk pre-2026 history is only
// represented as aggregate year-rows on OVERALL, never as individual event rows.
// The app side adds those years back via the app_settings baseline, so OVERALL is
// the only apples-to-apples comparand.
const SHEET_NAME = 'OVERALL'

// OVERALL tab column indices (0-based). Header row:
//   0 Year | 1 Collectives | 2 Number of Attendees | 3 Number of Events |
//   4 Amount of Rubbish Removed (kg) | 5 Trees Planted | 6 Beach Clean Ups |
//   7 Tree Plantings | 8 Nature Hikes | 9 Leaders Trained
const COL_O_YEAR = 0
const COL_O_ATTENDEES = 2
const COL_O_EVENTS = 3
const COL_O_RUBBISH = 4
const COL_O_TREES = 5

// Canonical baseline floor (src/lib/impact-query.ts IMPACT_BASELINE_DATE).
const IMPACT_BASELINE_DATE = '2026-01-01'

// Drift threshold: 5% of the sheet total on any headline metric.
const DRIFT_THRESHOLD = 0.05

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ---- Microsoft Graph helpers (ported from excel-sync) ----

async function getGraphToken(): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GRAPH_CLIENT_ID,
        scope: 'https://graph.microsoft.com/.default',
        client_secret: GRAPH_CLIENT_SECRET,
        grant_type: 'client_credentials',
      }),
    },
  )
  const data = await res.json()
  if (!data.access_token) throw new Error(`Graph auth failed: ${JSON.stringify(data)}`)
  return data.access_token
}

async function readUsedRange(token: string, sheet: string): Promise<unknown[][]> {
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${ITEM_ID}/workbook/worksheets/${encodeURIComponent(sheet)}/usedRange`
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Graph usedRange read failed for '${sheet}' (${res.status}): ${errText}`)
  }
  const json = await res.json()
  return (json.values ?? []) as unknown[][]
}

async function listWorksheets(token: string): Promise<string[]> {
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${ITEM_ID}/workbook/worksheets`
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Graph worksheets list failed (${res.status}): ${await res.text()}`)
  const json = await res.json()
  return ((json.value ?? []) as { name: string }[]).map((w) => w.name)
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  return Number.isFinite(n) ? n : 0
}

// ---- Sheet-side totals ----

interface SheetTotals {
  events: number
  attendees: number
  rubbishKg: number
  trees: number
  /** Trees on the OVERALL 2026 row only (informational live comparison). */
  trees2026: number
  /** True when the TOTAL row was located - guards against a layout change. */
  totalRowFound: boolean
}

/**
 * Parse the OVERALL tab. The all-time comparands come from the row whose first
 * cell is the literal 'TOTAL'; the 2026 live slice comes from the row whose first
 * cell is the number 2026. Throws on a missing TOTAL row so a silent layout drift
 * can never masquerade as a clean (or falsely-drifting) reading.
 */
function computeSheetTotals(rows: unknown[][]): SheetTotals {
  const t: SheetTotals = {
    events: 0, attendees: 0, rubbishKg: 0, trees: 0, trees2026: 0, totalRowFound: false,
  }
  for (const row of rows) {
    if (!row) continue
    const label = String(row[COL_O_YEAR] ?? '').trim()
    if (label.toUpperCase() === 'TOTAL') {
      t.attendees = num(row[COL_O_ATTENDEES])
      t.events = num(row[COL_O_EVENTS])
      t.rubbishKg = num(row[COL_O_RUBBISH])
      t.trees = num(row[COL_O_TREES])
      t.totalRowFound = true
    } else if (label === '2026') {
      t.trees2026 = num(row[COL_O_TREES])
    }
  }
  if (!t.totalRowFound) {
    throw new Error("OVERALL tab TOTAL row not found - sheet layout may have changed")
  }
  return t
}

// ---- App-side canonical aggregation ----
// Ports the national all-time rollup that the /admin/impact summary cards use:
//   src/lib/impact-query.ts (fetchImpactRows national + fetchBaselineSettings +
//   applyBaselineRemainder) and src/hooks/use-impact.ts (eventsHeld math).

/** applyBaselineRemainder, verbatim from src/lib/impact-query.ts. */
function applyBaselineRemainder(liveSum: number, legacySum: number, baseline: number): number {
  const remainder = Math.max(0, baseline - legacySum)
  return liveSum + legacySum + remainder
}

interface AppTotals {
  events: number
  attendees: number
  rubbishKg: number
  trees: number
  /** Live (post-baseline, non-legacy) trees only - 2026 comparison. */
  trees2026Live: number
}

type Supa = ReturnType<typeof createClient>

async function fetchBaseline(supabase: Supa): Promise<{
  attendees: number; events: number; trees: number; rubbishKg: number
}> {
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', [
      'impact_baseline_attendees',
      'impact_baseline_events',
      'impact_baseline_trees',
      'impact_baseline_rubbish_kg',
    ])
  const m: Record<string, number> = {}
  for (const r of (data ?? []) as { key: string; value: { count?: number } }[]) {
    m[r.key] = r.value?.count ?? 0
  }
  return {
    attendees: m['impact_baseline_attendees'] ?? 5500,
    events: m['impact_baseline_events'] ?? 340,
    trees: m['impact_baseline_trees'] ?? 36637,
    rubbishKg: m['impact_baseline_rubbish_kg'] ?? 4900,
  }
}

async function computeAppTotals(supabase: Supa): Promise<AppTotals> {
  const baseline = await fetchBaseline(supabase)
  const nowIso = new Date().toISOString()

  // National all-time scope: published/completed events from the baseline floor
  // up to now (mirrors fetchImpactRows national branch).
  const { data: eventRows, error: evErr } = await supabase
    .from('events')
    .select('id')
    .in('status', ['published', 'completed'])
    .gte('date_start', IMPACT_BASELINE_DATE)
    .lt('date_start', nowIso)
  if (evErr) throw evErr
  const eventIds = (eventRows ?? []).map((e: { id: string }) => e.id)

  // event_impact rows for those events, in chunks (mirror fetchImpactRows CHUNK).
  const CHUNK = 200
  type ImpactRow = {
    event_id: string | null
    attendees: number | null
    rubbish_kg: number | null
    trees_planted: number | null
    notes: string | null
  }
  const liveRows: ImpactRow[] = []
  const legacyRows: ImpactRow[] = []
  for (let i = 0; i < eventIds.length; i += CHUNK) {
    const chunk = eventIds.slice(i, i + CHUNK)
    if (chunk.length === 0) continue
    const { data, error } = await supabase
      .from('event_impact')
      .select('event_id, attendees, rubbish_kg, trees_planted, notes')
      .in('event_id', chunk)
      .range(0, 9999)
    if (error) throw error
    for (const r of (data ?? []) as ImpactRow[]) {
      const isLegacy = typeof r.notes === 'string' && r.notes.startsWith('Legacy import:')
      if (isLegacy) legacyRows.push(r)
      else liveRows.push(r)
    }
  }

  const sum = (rows: ImpactRow[], key: 'attendees' | 'rubbish_kg' | 'trees_planted') =>
    rows.reduce((s, r) => s + (Number(r[key]) || 0), 0)

  const liveTrees = sum(liveRows, 'trees_planted')
  const liveAttendees = sum(liveRows, 'attendees')
  const liveRubbish = sum(liveRows, 'rubbish_kg')
  const legacyTrees = sum(legacyRows, 'trees_planted')
  const legacyAttendees = sum(legacyRows, 'attendees')
  const legacyRubbish = sum(legacyRows, 'rubbish_kg')

  // eventsHeld: distinct event_ids with any impact row + max(0, baseline - legacy ids)
  // (use-impact.ts uniqueEventCount + remainder).
  const liveIds = new Set(liveRows.map((r) => r.event_id).filter((x): x is string => !!x))
  const legacyIds = new Set(legacyRows.map((r) => r.event_id).filter((x): x is string => !!x))
  const uniqueEventCount = new Set([...liveIds, ...legacyIds]).size

  return {
    events: uniqueEventCount + Math.max(0, baseline.events - legacyIds.size),
    attendees: Math.round(applyBaselineRemainder(liveAttendees, legacyAttendees, baseline.attendees)),
    rubbishKg: Math.round((applyBaselineRemainder(liveRubbish, legacyRubbish, baseline.rubbishKg)) * 100) / 100,
    trees: applyBaselineRemainder(liveTrees, legacyTrees, baseline.trees),
    trees2026Live: liveTrees,
  }
}

// ---- Diff ----

interface MetricDelta { ok: boolean; app: number; diff: number; sheet: number }

function metricDelta(app: number, sheet: number): MetricDelta {
  const diff = Math.round((app - sheet) * 100) / 100
  const denom = sheet === 0 ? 1 : Math.abs(sheet)
  const ok = Math.abs(diff) <= DRIFT_THRESHOLD * denom
  return { ok, app, diff, sheet }
}

// ---- Main handler ----

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const dryRun = url.searchParams.get('dry') === '1'
    const probeSheet = url.searchParams.get('probe')

    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Probe mode: dump worksheet names, or the raw usedRange of a named sheet, so
    // the sheet-side parser can be locked against the real workbook layout.
    if (probeSheet !== null) {
      const t = await getGraphToken()
      const names = await listWorksheets(t)
      if (probeSheet === '' || probeSheet === '1') {
        return new Response(JSON.stringify({ ok: true, worksheets: names }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const rows = await readUsedRange(t, probeSheet)
      return new Response(
        JSON.stringify({ ok: true, sheet: probeSheet, rowCount: rows.length, rows: rows.slice(0, 40) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('COEXIST_SERVICE_ROLE_KEY') ?? '',
    )

    const graphToken = await getGraphToken()
    const sheetRows = await readUsedRange(graphToken, SHEET_NAME)
    const sheet = computeSheetTotals(sheetRows)
    const app = await computeAppTotals(supabase)

    // Diagnostics: raw sheet shape, so a drift reading can be distinguished from
    // a truncated/partial Graph read.
    const diag = {
      sheet: SHEET_NAME,
      rawRows: sheetRows.length,
      widthCols: sheetRows[0]?.length ?? 0,
      totalRowFound: sheet.totalRowFound,
      sheet2026Trees: sheet.trees2026,
    }

    const delta = {
      trees: metricDelta(app.trees, sheet.trees),
      events: metricDelta(app.events, sheet.events),
      attendees: metricDelta(app.attendees, sheet.attendees),
      rubbish_kg: metricDelta(app.rubbishKg, sheet.rubbishKg),
      // Informational: live 2026 trees vs sheet 2026 trees. Does NOT gate drift -
      // the baseline portion is identical static data on both sides, so the live
      // slice is the truer signal but is surfaced for diagnosis only.
      trees_2026: {
        diff: Math.round((app.trees2026Live - sheet.trees2026) * 100) / 100,
        note: 'informational',
        sheet: sheet.trees2026,
        app_live: app.trees2026Live,
      },
    }

    const driftDetected = !delta.trees.ok || !delta.events.ok || !delta.attendees.ok || !delta.rubbish_kg.ok
    const runAt = new Date().toISOString()
    const value = {
      delta,
      run_at: runAt,
      // Badge contract: impact.tsx reads === 'drift'. Use 'drift' / 'ok'.
      status: driftDetected ? 'drift' : 'ok',
    }

    if (!dryRun) {
      const { error: e1 } = await supabase
        .from('app_settings')
        .upsert({ key: 'stats_drift_last_run', value, updated_at: runAt }, { onConflict: 'key' })
      if (e1) throw e1
      const { error: e2 } = await supabase
        .from('app_settings')
        .upsert(
          { key: 'stats_drift_detected', value: { value: driftDetected }, updated_at: runAt },
          { onConflict: 'key' },
        )
      if (e2) throw e2
    }

    return new Response(
      JSON.stringify({ ok: true, dryRun, driftDetected, status: value.status, run_at: runAt, delta, diag }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
