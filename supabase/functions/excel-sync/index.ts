/**
 * excel-sync - Supabase Edge Function
 *
 * Sync between Co-Exist Supabase database and the
 * "Master Impact Data Sheet.xlsx" on SharePoint (OneDrive for Business).
 *
 * CRITICAL RULES:
 * - Default direction is `from-excel`. Calling without `?direction=...` does the safe read
 *   direction and never writes to the sheet.
 * - Pre-2026 data in Excel is UNTOUCHABLE. Never written to by the app.
 * - to-excel writes app-created completed events that pass the migration gate:
 *     (a) events whose title starts with "test" (dev/test, always sync regardless of
 *         collective state), OR
 *     (b) events whose collective has forms_migrated_at set AND whose date_start is
 *         on or after forms_migrated_at (collective has cut over from Forms to the app).
 *   Collectives with NULL forms_migrated_at are still using Forms for real events — their
 *   app events are NOT pushed to the sheet, preventing double-entries during transition.
 * - DEDUP: before appending any app-generated row, the function builds a signature set
 *   from all integer-ID (Forms-origin) rows already on the sheet. Signature format is
 *   (collective | date_iso | title), lowercased and trimmed. If an app event's signature
 *   matches a Forms row, the app event is SKIPPED (not appended) and logged in errors as
 *   `skippedDuplicates`. Admin must reconcile the Forms row manually — no auto-overwrite.
 * - from-excel is the PRIORITY direction. Run it first in full sync.
 *
 * Directions:
 *   POST /excel-sync?direction=to-excel      -> append/update migration-gated events in Excel
 *   POST /excel-sync?direction=from-excel    -> pull Excel data into Supabase (Excel wins)
 *   POST /excel-sync?direction=full          -> from-excel first, then to-excel
 *   POST /excel-sync?event_id=xxx            -> sync single event to Excel
 *
 * Column mapping (28 columns, A-AB on "Post Event Review" sheet):
 *   0:  ID                    <- event.id (or legacy ID from sheet)
 *   1:  Event Title           <- events.title
 *   2:  Date of Event         <- events.date_start (Excel serial number)
 *   3:  Collective            <- collectives.name
 *   4:  Location              <- events.address
 *   5:  Postcode              <- extracted from address
 *   6:  Primary Organiser     <- constant "Co-Exist" (matches Forms convention; partner-org
 *                                support will come via event_organisations table — see TODO)
 *   7:  Other Group Attended  <- survey answer q1
 *   8:  Which Landcare Group  <- survey answer q2
 *   9:  Which OzFish group    <- survey answer q3
 *   10: Co-Exist Leader       <- profiles.display_name (impact.logged_by or event creator)
 *   11: Number of Attendees   <- event_impact.attendees
 *   12: Type of Event         <- "Conservation" or "Recreation" based on activity_type
 *   13: Type of Conservation  <- activity label if conservation type
 *   14: Recreational type     <- activity label if recreational type
 *   15: Rubbish Removed (kg)  <- survey q4 or event_impact.rubbish_kg
 *   16: Trees Planted         <- survey q5 or event_impact.trees_planted
 *   17: Collect/Make Anything <- survey q6
 *   18: What & How Much       <- survey q7
 *   19: Hike/track name       <- survey q8
 *   20: Any Issues            <- survey q9
 *   21: Use First Aid Kit     <- survey q10
 *   22: Outstanding Highlights<- survey q11
 *   23: Images to OneDrive    <- survey q12
 *   24: Videos to Google      <- survey q13
 *   25: Grant Project         <- survey q14
 *   26: Year-Month            <- derived from date_start
 *   27: Posted Wrap-up Insta  <- survey q15
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { generate as uuidv5 } from 'https://deno.land/std@0.224.0/uuid/v5.ts'

// ---- Config ----
const GRAPH_TENANT_ID = Deno.env.get('GRAPH_TENANT_ID') ?? ''
const GRAPH_CLIENT_ID = Deno.env.get('GRAPH_CLIENT_ID') ?? ''
const GRAPH_CLIENT_SECRET = Deno.env.get('GRAPH_CLIENT_SECRET') ?? ''
const DRIVE_ID = 'b!jB_eUPJMbUWf3eip_Me-34G0StMYwYdHtdf4sTNow-uVV9nof_IvQprzswNpaD8y'
const ITEM_ID = '01RJHFBL37QUUGOQUVL5DJ67A53VKNDAGE'
const SHEET_NAME = 'Post Event Review'

// Only sync events from 2026 onwards - historical data is Excel-only
const SYNC_CUTOFF_DATE = '2026-01-01'

// Fixed namespace UUID for Forms-sourced synthetic events. Embedded as a literal
// and MUST NEVER CHANGE — changing it invalidates all existing synthetic UUIDs and
// causes duplicate rows on the next sync run.
const FORMS_NAMESPACE_UUID = '6b9c8f4a-2e3d-5c7a-8b1f-4a9e6d2c1b0f'

// ---- Collective aliases ----
// Legacy / divergent collective names on the Forms sheet that should resolve to a
// different canonical collective_id on reverse-sync. Key = lowercase + trimmed
// legacy name as it appears in sheet col-3. Value = canonical collective UUID
// in the DB.
//
// Adding a new alias is a coordinated change:
//   1. Add the row in `clients/coexist.md` "Collective Aliases" table (doctrine).
//   2. Add the entry below.
//   3. Redeploy this Edge Function.
//   4. Plan the data migration if the alias has its own row with events.
//
// See ~/ecodiaos/patterns/excel-sync-collectives-migration.md "Collective aliases".
const COLLECTIVE_ALIASES: Record<string, string> = {
  'byron bay': '9a2f9919-26b9-420d-b6f5-ddeb9a37b1b3', // -> Northern Rivers
  'melbourne city': 'b6cae731-d6bf-4bf1-9640-0117feaa3755', // -> Melbourne
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Activity types that are "Conservation" vs "Recreation"
const CONSERVATION_TYPES = ['clean_up', 'tree_planting', 'ecosystem_restoration']
const RECREATION_TYPES = ['nature_hike', 'camp_out', 'spotlighting']
const ACTIVITY_LABELS: Record<string, string> = {
  clean_up: 'Clean Up',
  tree_planting: 'Tree Planting',
  ecosystem_restoration: 'Ecosystem Restoration',
  nature_hike: 'Nature Hike',
  camp_out: 'Camp Out',
  spotlighting: 'Spotlighting',
  other: 'Other',
}

// ---- Microsoft Graph helpers ----

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

async function graphRequest(token: string, path: string, method = 'GET', body?: unknown) {
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${ITEM_ID}/workbook/worksheets/${encodeURIComponent(SHEET_NAME)}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Graph API ${method} ${path} failed (${res.status}): ${errText}`)
  }
  return res.json()
}

// ---- Date helpers ----

/** Convert ISO date to Excel serial number */
function dateToExcelSerial(isoDate: string): number {
  const date = new Date(isoDate)
  const excelEpoch = new Date(1899, 11, 30)
  const diffMs = date.getTime() - excelEpoch.getTime()
  return Math.floor(diffMs / (24 * 60 * 60 * 1000))
}

/** Convert Excel serial number to ISO date string (YYYY-MM-DD) */
function excelSerialToDate(serial: number): string {
  const excelEpoch = new Date(1899, 11, 30)
  const date = new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000)
  return date.toISOString().split('T')[0]
}

/** Format date as YYYY-MM for Year-Month column */
function toYearMonth(isoDate: string): string {
  const d = new Date(isoDate)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Extract postcode (last 4-digit number) from address string */
function extractPostcode(address: string): string {
  const match = address?.match(/\b(\d{4})\b/g)
  return match ? match[match.length - 1] : ''
}

/** Convert yes_no survey answer to Yes/No string */
function yesNo(val: unknown): string {
  if (val === true || val === 'yes' || val === 'Yes') return 'Yes'
  if (val === false || val === 'no' || val === 'No') return 'No'
  return ''
}

// ---- Read existing Excel data ----

interface ExcelState {
  rows: unknown[][]
  existingIds: Set<string>
  rowCount: number
}

async function readExcelState(graphToken: string): Promise<ExcelState> {
  const usedRange = await graphRequest(graphToken, '/usedRange')
  const rows = usedRange.values ?? []
  const existingIds = new Set<string>()
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0]) existingIds.add(String(rows[i][0]))
  }
  return { rows, existingIds, rowCount: rows.length }
}

// ---- Build Excel row from Supabase data ----

interface EventData {
  id: string
  title: string
  date_start: string
  activity_type: string
  address: string
  collective_name: string
  creator_name: string
  leader_name: string
  attendees: number | null
  checked_in_count: number
  rubbish_kg: number | null
  trees_planted: number | null
  answers: Record<string, unknown>
}

function buildExcelRow(e: EventData): (string | number | null)[] {
  const isConservation = CONSERVATION_TYPES.includes(e.activity_type)
  const isRecreation = RECREATION_TYPES.includes(e.activity_type)
  const label = ACTIVITY_LABELS[e.activity_type] ?? e.activity_type

  return [
    e.id,                                                    // 0: ID
    e.title,                                                 // 1: Event Title
    dateToExcelSerial(e.date_start),                         // 2: Date of Event
    e.collective_name,                                       // 3: Collective
    e.address ?? '',                                         // 4: Location
    (e.answers?.postcode as string) ?? extractPostcode(e.address ?? ''), // 5: Postcode (survey answer, fallback to address extraction)
    // TODO: When partner-org events land, populate `event_organisations` + `organisations` tables
    // and pull the first related organisation's name here. For now, all app events are Co-Exist.
    // Matches the Forms convention of writing "Co-Exist" in this column for every row.
    'Co-Exist',                                              // 6: Primary Organiser of the Event
    (e.answers?.q1 as string) ?? '',                         // 7: Other Group Attended
    (e.answers?.q2 as string) ?? '',                         // 8: Which Landcare Group
    (e.answers?.q3 as string) ?? '',                         // 9: Which OzFish group
    (e.answers?.leader_name as string) ?? e.leader_name ?? '', // 10: Co-Exist Leader (from survey dropdown)
    e.attendees ?? e.checked_in_count ?? '',                  // 11: Number of Attendees (impact override or check-in count)
    isConservation ? 'Conservation' : isRecreation ? 'Recreation' : label, // 12: Type of Event
    isConservation ? label : '',                             // 13: Conservation type
    isRecreation ? label : '',                               // 14: Recreational type
    e.answers?.q4 ?? e.rubbish_kg ?? '',                     // 15: Rubbish Removed
    e.answers?.q5 ?? e.trees_planted ?? '',                  // 16: Trees Planted
    yesNo(e.answers?.q6),                                    // 17: Collect/Make Anything
    (e.answers?.q7 as string) ?? '',                         // 18: What & How Much
    (e.answers?.q8 as string) ?? '',                         // 19: Hike/track name
    (e.answers?.q9 as string) ?? '',                         // 20: Any Issues
    yesNo(e.answers?.q10),                                   // 21: Use First Aid Kit
    (e.answers?.q11 as string) ?? '',                        // 22: Outstanding Highlights
    yesNo(e.answers?.q12),                                   // 23: Images to OneDrive
    yesNo(e.answers?.q13),                                   // 24: Videos to Google
    (e.answers?.q14 as string) ?? '',                        // 25: Grant Project
    toYearMonth(e.date_start),                               // 26: Year-Month
    yesNo(e.answers?.q15),                                   // 27: Posted Wrap-up Insta
  ]
}

// ---- Fetch event data from Supabase ----

async function fetchEventData(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
): Promise<EventData | null> {
  const { data: event } = await supabase
    .from('events')
    .select('id, title, date_start, activity_type, address, collective_id, created_by')
    .eq('id', eventId)
    .single()

  if (!event) return null

  // Enforce 2026+ cutoff
  if (event.date_start < SYNC_CUTOFF_DATE) return null

  const { data: collective } = await supabase
    .from('collectives')
    .select('name')
    .eq('id', event.collective_id)
    .single()

  const { data: creator } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', event.created_by)
    .single()

  const { data: impact } = await supabase
    .from('event_impact')
    .select('attendees, rubbish_kg, trees_planted, logged_by')
    .eq('event_id', eventId)
    .single()

  // Get actual check-in count for attendees
  const { count: checkedInCount } = await supabase
    .from('event_registrations')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('checked_in', true)

  let leaderName = creator?.display_name ?? ''
  if (impact?.logged_by && impact.logged_by !== event.created_by) {
    const { data: leader } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', impact.logged_by)
      .single()
    if (leader) leaderName = leader.display_name
  }

  const { data: surveys } = await supabase
    .from('surveys')
    .select('id')
    .eq('activity_type', event.activity_type)
    .eq('is_impact_form', true)
    .eq('status', 'active')

  let answers: Record<string, unknown> = {}
  if (surveys && surveys.length > 0) {
    const surveyIds = surveys.map((s: { id: string }) => s.id)
    const { data: responses } = await supabase
      .from('survey_responses')
      .select('answers')
      .eq('event_id', eventId)
      .in('survey_id', surveyIds)
      .order('submitted_at', { ascending: false })
      .limit(1)

    if (responses && responses.length > 0) {
      answers = (responses[0].answers as Record<string, unknown>) ?? {}
    }
  }

  return {
    id: event.id,
    title: event.title,
    date_start: event.date_start,
    activity_type: event.activity_type,
    address: event.address ?? '',
    collective_name: collective?.name ?? '',
    creator_name: creator?.display_name ?? '',
    leader_name: leaderName,
    attendees: impact?.attendees ?? null,
    checked_in_count: checkedInCount ?? 0,
    rubbish_kg: impact?.rubbish_kg ?? null,
    trees_planted: impact?.trees_planted ?? null,
    answers,
  }
}

// ---- Dedup helper ----

/** Canonical signature for matching Forms rows against app events.
 *  Format: collective|date_iso_yyyy_mm_dd|title (all lowercased and trimmed). */
function sigOf(collective: string, dateIso: string, title: string): string {
  return [
    (collective ?? '').trim().toLowerCase(),
    dateIso.slice(0, 10),
    (title ?? '').trim().toLowerCase(),
  ].join('|')
}

// ---- Forms row helpers (from-excel direction only) ----

// Reverse-map sheet display labels back to DB activity_type enum values.
// The sheet writes human-readable labels in col 13 (conservation type) or col 14 (recreation type).
// Unmapped values default to 'other' with a warning appended to errors.
const SHEET_LABEL_TO_ACTIVITY_TYPE: Record<string, string> = {
  'bee hotel': 'workshop',
  'bee hotel building': 'workshop',
  'bush walk': 'nature_walk',
  'bushwalk': 'nature_walk',
  'camp out': 'camp_out',
  'citizen science': 'workshop',
  'clean up': 'clean_up',
  'conservation & recreation': 'other',
  'conservation and recreation': 'other',
  'ecosystem restoration': 'ecosystem_restoration',
  'land regeneration': 'land_regeneration',
  'marine restoration': 'marine_restoration',
  'nature hike': 'nature_hike',
  'nature hike & camp out': 'camp_out',
  'nature hike & dip': 'nature_hike',
  'nature hike & photography': 'nature_hike',
  'nature hike & sunset': 'nature_hike',
  'nature walk': 'nature_walk',
  'nature walk & sunset': 'nature_walk',
  'other': 'other',
  'paint & dip': 'workshop',
  'paint and dip': 'workshop',
  'picnic': 'retreat',
  'reef restoration': 'marine_restoration',
  'retreat': 'retreat',
  'shore clean up': 'shore_cleanup',
  'shore cleanup': 'shore_cleanup',
  'snorkel': 'marine_restoration',
  'snorkeling': 'marine_restoration',
  'snorkelling': 'marine_restoration',
  'spotlighting': 'spotlighting',
  'tree planting': 'tree_planting',
  'trivia': 'workshop',
  'weeding': 'land_regeneration',
  'wildlife spotting': 'spotlighting',
  'workshop': 'workshop',
}

// Token-CONTAINS fallback for Layer 4 — ordered most-specific first so longer tokens win.
const TOKEN_TO_ACTIVITY_TYPE: [string, string][] = [
  ['marine restoration', 'marine_restoration'],
  ['reef restoration',   'marine_restoration'],
  ['shore clean',        'shore_cleanup'],
  ['tree planting',      'tree_planting'],
  ['land regeneration',  'land_regeneration'],
  ['ecosystem restoration', 'ecosystem_restoration'],
  ['clean up',           'clean_up'],
  ['cleanup',            'clean_up'],
  ['snorkel',            'marine_restoration'],
  ['spotting',           'spotlighting'],
  ['spotlight',          'spotlighting'],
  ['nature hike',        'nature_hike'],
  ['nature walk',        'nature_walk'],
  ['bush walk',          'nature_walk'],
  ['hike',               'nature_hike'],
  ['walk',               'nature_walk'],
  ['weeding',            'land_regeneration'],
  ['invasive',           'land_regeneration'],
  ['hotel',              'workshop'],
  ['citizen science',    'workshop'],
  ['trivia',             'workshop'],
  ['picnic',             'retreat'],
  ['camp out',           'camp_out'],
  ['paint',              'workshop'],
  ['painting',           'workshop'],
  ['restoration',        'ecosystem_restoration'],
  ['conservation',       'other'],
  ['workshop',           'workshop'],
]

// Generate a deterministic UUID v5 from a Forms integer ID.
// Pure function of formsId — re-running sync is safe (upserts are no-ops when unchanged).
async function formsIdToUuid(formsId: string | number): Promise<string> {
  const data = new TextEncoder().encode(`forms-${formsId}`)
  return await uuidv5(FORMS_NAMESPACE_UUID, data)
}

// ---- Title-similarity helpers (used by Forms-row to app-event matcher) ----

/** Normalise a title for fuzzy comparison: lowercase, strip punctuation,
 *  collapse whitespace. */
function normaliseTitle(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Word-level Jaccard similarity on normalised titles. Robust to word-order
 *  drift ("Tree Planting w/ OzFish" vs "Ozfish x Coexist Tree planting").
 *  Threshold 0.34 is permissive enough to catch leader title drift while
 *  staying above unrelated events on the same date. */
function titleSimilarity(a: string, b: string): number {
  const tokensA = new Set(normaliseTitle(a).split(' ').filter(Boolean))
  const tokensB = new Set(normaliseTitle(b).split(' ').filter(Boolean))
  if (tokensA.size === 0 || tokensB.size === 0) return 0
  let intersect = 0
  for (const t of tokensA) if (tokensB.has(t)) intersect++
  const union = tokensA.size + tokensB.size - intersect
  return union === 0 ? 0 : intersect / union
}

/** Detect Forms-synthetic event UUIDs by inspecting the version digit.
 *  formsIdToUuid uses UUID v5 (deterministic), so position 14 in the
 *  canonical string form is the literal '5'. App events are inserted with
 *  Postgres uuid_generate_v4(), where position 14 is '4'. Filtering on this
 *  digit cleanly excludes ALL synthetic events from the matcher candidate
 *  pool, so a Forms row never matches itself or another synthetic. */
function isSyntheticFormsUuid(id: string): boolean {
  return id.length >= 15 && id.charAt(14) === '5'
}

/** Find the best-matching app-created event for a Forms row. Returns the
 *  app event_id if a match is found, otherwise null.
 *
 *  Two-tier match criteria:
 *  Tier 1 (close-date, low-title-bar): same collective, app-created (UUID v4),
 *    |date - formsDate| <= 1 day, Jaccard similarity >= 0.34. Catches the
 *    common timezone-drift case (Forms midnight UTC+10 vs app local time).
 *  Tier 2 (wide-date, high-title-bar): same collective, app-created,
 *    |date - formsDate| <= 31 days, Jaccard similarity >= 0.55. Catches the
 *    real-world case where the leader submitted the Form with a wrong date.
 *
 *  Tier 1 is preferred when both apply (closer dates win). When multiple
 *  candidates within a tier match, picks the highest similarity then the
 *  closest date. Synthetic events (UUID v5 from formsIdToUuid) are excluded
 *  so the matcher never matches a Forms row to itself or another synthetic. */
async function findMatchingAppEvent(
  supabase: ReturnType<typeof createClient>,
  collectiveId: string,
  formsDateIso: string,
  formsTitle: string,
): Promise<string | null> {
  const formsDate = new Date(formsDateIso)
  const dayMs = 24 * 60 * 60 * 1000
  // Pull the wide window (Tier 2) and tier candidates in JS.
  const winStart = new Date(formsDate.getTime() - 31 * dayMs).toISOString()
  const winEnd = new Date(formsDate.getTime() + 31 * dayMs).toISOString()

  const { data: candidates } = await supabase
    .from('events')
    .select('id, title, date_start, created_by')
    .eq('collective_id', collectiveId)
    .gte('date_start', winStart)
    .lte('date_start', winEnd)

  if (!candidates || candidates.length === 0) return null

  let best: { id: string; sim: number; deltaMs: number; tier: number } | null = null
  for (const c of candidates as { id: string; title: string; date_start: string }[]) {
    if (isSyntheticFormsUuid(c.id)) continue
    const sim = titleSimilarity(c.title, formsTitle)
    const deltaMs = Math.abs(new Date(c.date_start).getTime() - formsDate.getTime())
    let tier: number | null = null
    if (deltaMs <= dayMs && sim >= 0.34) tier = 1
    else if (deltaMs <= 31 * dayMs && sim >= 0.55) tier = 2
    if (tier === null) continue
    // Lower tier number wins (Tier 1 > Tier 2). Within a tier: higher sim,
    // then closer date.
    if (
      !best
      || tier < best.tier
      || (tier === best.tier && sim > best.sim)
      || (tier === best.tier && sim === best.sim && deltaMs < best.deltaMs)
    ) {
      best = { id: c.id, sim, deltaMs, tier }
    }
  }
  return best?.id ?? null
}

// Reverse-map sheet cols 12/13/14 back to a DB activity_type enum value.
//   col[12]: "Conservation" | "Recreation" | label
//   col[13]: conservation-specific label (when col[12] is "Conservation")
//   col[14]: recreation-specific label (when col[12] is "Recreation")
// Fallback chain: (1) exact map, (2) strip "& X"/"and X" suffix, (3) strip parens + hyphen
// tail, (4) token-CONTAINS against TOKEN_TO_ACTIVITY_TYPE. Layers 3-4 emit INFO telemetry
// to errors so resolution strategy is visible in sync logs without blocking the run.
function mapSheetActivityType(row: unknown[], errors: string[], rowLabel: string): string {
  const eventType = String(row[12] ?? '').trim().toLowerCase()
  const conservationType = String(row[13] ?? '').trim().toLowerCase()
  const recreationType = String(row[14] ?? '').trim().toLowerCase()

  let label: string
  if (eventType === 'conservation' && conservationType) {
    label = conservationType
  } else if (eventType === 'recreation' && recreationType) {
    label = recreationType
  } else {
    label = eventType
  }

  // Layer 1: exact match
  const mapped = SHEET_LABEL_TO_ACTIVITY_TYPE[label]
  if (mapped) return mapped

  // Layer 2: strip trailing "& X" or "and X" suffix and retry
  const andStripped = label.replace(/\s+(&|and)\s+\S.*$/i, '').trim()
  if (andStripped !== label && SHEET_LABEL_TO_ACTIVITY_TYPE[andStripped]) return SHEET_LABEL_TO_ACTIVITY_TYPE[andStripped]

  // Layer 3: paren-qualifier strip + hyphen-tail strip, then retry exact map
  const l3Paren = label.replace(/\s*\(.*?\)\s*/g, ' ').trim()
  const l3 = l3Paren.replace(/\s*-\s*.*$/, '').trim()
  const mappedL3 = (l3 && l3 !== label && l3 !== andStripped) ? SHEET_LABEL_TO_ACTIVITY_TYPE[l3] : undefined
  if (mappedL3) {
    const strategy = l3Paren !== label
      ? (l3 !== l3Paren ? 'paren-strip+hyphen-strip' : 'paren-strip')
      : 'hyphen-strip'
    errors.push(`INFO ${rowLabel}: activity type "${label}" resolved to "${mappedL3}" via ${strategy}`)
    return mappedL3
  }

  // Layer 4: token-CONTAINS fallback (ordered most-specific first)
  for (const [token, actType] of TOKEN_TO_ACTIVITY_TYPE) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(label)) {
      errors.push(`INFO ${rowLabel}: activity type "${label}" resolved to "${actType}" via token-contains: ${token}`)
      return actType
    }
  }

  if (label) {
    const strippedNote = andStripped !== label ? ` (stripped: "${andStripped}")` : ''
    errors.push(`${rowLabel}: activity type "${label}"${strippedNote} not in mapping, defaulted to 'other'`)
  }
  return 'other'
}

// ---- Sync: Supabase -> Excel (migration-gated, append new + update existing) ----

async function syncToExcel(
  supabase: ReturnType<typeof createClient>,
  graphToken: string,
  eventId?: string,
): Promise<{
  appended: number
  updated: number
  skipped: number
  skippedDuplicates: number
  weakDedupWarnings: { eventId: string; collective: string; date: string; title: string; existingFormsTitle: string }[]
  errors: string[]
}> {
  const errors: string[] = []
  const weakDedupWarnings: { eventId: string; collective: string; date: string; title: string; existingFormsTitle: string }[] = []
  let appended = 0
  let updated = 0
  let skipped = 0
  let skippedDuplicates = 0

  // Read existing Excel data
  let excelState: ExcelState
  try {
    excelState = await readExcelState(graphToken)
  } catch (err) {
    errors.push(`Failed to read Excel: ${(err as Error).message}`)
    return { appended, updated, skipped, skippedDuplicates, errors }
  }

  // Build a map of existing event IDs to their row index (1-based)
  const idToRowIndex = new Map<string, number>()
  for (let i = 1; i < excelState.rows.length; i++) {
    const id = String(excelState.rows[i][0] ?? '')
    if (id) idToRowIndex.set(id, i + 1) // +1 because Excel rows are 1-based
  }

  // Build a signature set from Forms rows (integer IDs only) for dedup protection.
  // If an app event's signature matches a Forms row, it is skipped — not appended.
  // This prevents double-entries during the transition from Forms to the app for any
  // collective that had real events logged via both systems on the same date.
  //
  // ALSO build a WEAK signature index: (collective_lc, date_iso) -> existing Forms title.
  // This catches the "same event, different title" case (Apr 11 Adelaide
  // 'Craigburn Farm Hike' vs 'Craigburn Nature Hike'). Strict signature misses
  // it because titles differ. We do NOT auto-skip on weak match (false positives
  // would lose data when two genuinely-distinct events fall on the same day for
  // the same collective). Instead we surface a warning the admin can act on.
  const formsSignatures = new Set<string>()
  const formsWeakIndex = new Map<string, string>() // 'collective_lc|date_iso' -> existing Forms title
  for (let i = 1; i < excelState.rows.length; i++) {
    const row = excelState.rows[i]
    const id = String(row[0] ?? '')
    if (!id) continue
    // Only integer IDs are Forms rows — UUIDs are app rows and don't belong in the dedup set
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(id)) continue

    const title = String(row[1] ?? '')
    const dateSerial = Number(row[2])
    const dateIso = Number.isFinite(dateSerial) ? excelSerialToDate(dateSerial) : ''
    const collective = String(row[3] ?? '')
    if (!title || !dateIso) continue
    formsSignatures.add(sigOf(collective, dateIso, title))
    const weakKey = `${collective.trim().toLowerCase()}|${dateIso.slice(0, 10)}`
    if (!formsWeakIndex.has(weakKey)) formsWeakIndex.set(weakKey, title)
  }

  // Determine which events to sync
  let eventIds: string[] = []
  if (eventId) {
    eventIds = [eventId]
  } else {
    // Batch mode: completed 2026+ events that pass the migration gate.
    // Pull collective forms_migrated_at and filter in JS:
    //   (a) test-prefixed titles always sync (dev/test events, regardless of collective state)
    //   (b) non-test events only sync if their collective has forms_migrated_at set AND
    //       date_start >= forms_migrated_at (the collective has cut over from Forms)
    const { data: events } = await supabase
      .from('events')
      .select('id, title, date_start, collective_id, collectives(forms_migrated_at)')
      .eq('status', 'completed')
      .gte('date_start', SYNC_CUTOFF_DATE)
      .order('date_start', { ascending: true })

    const filtered = ((events ?? []) as any[]).filter((e: any) => {
      if (/^test/i.test(e.title)) return true
      const migratedAt = (e.collectives as any)?.forms_migrated_at
      if (!migratedAt) return false
      return new Date(e.date_start) >= new Date(migratedAt)
    })

    eventIds = filtered.map((e: any) => e.id)
  }

  // Sort into append vs update
  const newRows: (string | number | null)[][] = []
  const updateRows: { rowIndex: number; row: (string | number | null)[] }[] = []

  // Pre-fetch the created_by status for the candidate events so we can skip
  // synthetic events (those created by the from-excel reverse-sync). Synthetic
  // events have created_by IS NULL because their data ORIGINATED from the
  // sheet — pushing them back creates duplicate rows. The trigger
  // excel_sync_on_event_impact fires for every event_impact INSERT/UPDATE
  // (including the ones from-excel just inserted), so without this guard each
  // sheet→DB sync produces N spurious to-excel calls that try to write the
  // synthetic data back to the sheet under a (potentially differently-aliased)
  // collective name, missing the dedup signature and appending duplicates.
  // App-created events (created_by IS NOT NULL) and test-prefix events flow as
  // before. See ~/ecodiaos/patterns/excel-sync-collectives-migration.md.
  const syntheticEventIds = new Set<string>()
  if (eventIds.length > 0) {
    try {
      const { data: syntheticEvents } = await supabase
        .from('events')
        .select('id, title, created_by')
        .in('id', eventIds)
      for (const e of (syntheticEvents ?? []) as { id: string; title: string; created_by: string | null }[]) {
        // Test-prefix events bypass the synthetic guard (legacy test-mode flow).
        if (e.created_by === null && !/^test/i.test(e.title ?? '')) {
          syntheticEventIds.add(e.id)
        }
      }
    } catch {
      // Non-fatal — fall through and let the dedup signature catch what it can.
    }
  }

  for (const eid of eventIds) {
    try {
      // Skip synthetic events. Their data is already on the sheet (that's where
      // it came from). Pushing back would create a (collective_alias-confused)
      // duplicate.
      if (syntheticEventIds.has(eid)) {
        skipped++
        continue
      }

      const data = await fetchEventData(supabase, eid)
      if (!data) {
        skipped++
        continue
      }

      const row = buildExcelRow(data)
      const existingRowIndex = idToRowIndex.get(eid)

      if (existingRowIndex) {
        // App event already in sheet - UPDATE the row
        updateRows.push({ rowIndex: existingRowIndex, row })
        updated++
      } else {
        // New app event - check dedup before appending.
        // If this event matches a Forms row on (collective, date, title), skip it.
        // The Forms row is the authoritative record for that event; appending an app row
        // would create a duplicate. Admin must reconcile the Forms row manually.
        const eventSig = sigOf(data.collective_name, data.date_start, data.title)
        if (formsSignatures.has(eventSig)) {
          skippedDuplicates++
          errors.push(`Event ${eid}: skipped (matches Forms row signature ${eventSig})`)
          continue
        }

        // Weak (collective, date) match warning. Strict signature missed it
        // because the titles differ (typically leader free-text drift between
        // Forms title and app title for the same event). We do NOT auto-skip
        // — admin reconciliation. The warning surfaces the suspect pair so
        // monitoring can flag it for review.
        const dateIso = (data.date_start ?? '').slice(0, 10)
        const weakKey = `${(data.collective_name ?? '').trim().toLowerCase()}|${dateIso}`
        const existingFormsTitle = formsWeakIndex.get(weakKey)
        if (existingFormsTitle && existingFormsTitle.trim().toLowerCase() !== (data.title ?? '').trim().toLowerCase()) {
          weakDedupWarnings.push({
            eventId: eid,
            collective: data.collective_name ?? '',
            date: dateIso,
            title: data.title ?? '',
            existingFormsTitle,
          })
        }

        newRows.push(row)
        appended++
      }
    } catch (err) {
      errors.push(`Event ${eid}: ${(err as Error).message}`)
    }
  }

  // Append new rows to the end of the sheet
  if (newRows.length > 0) {
    try {
      const startRow = excelState.rowCount + 1
      const endRow = startRow + newRows.length - 1
      const range = `A${startRow}:AB${endRow}`

      await graphRequest(
        graphToken,
        `/range(address='${range}')`,
        'PATCH',
        { values: newRows },
      )
    } catch (err) {
      errors.push(`Failed to append rows: ${(err as Error).message}`)
      appended = 0
    }
  }

  // Update existing rows
  for (const { rowIndex, row } of updateRows) {
    try {
      await graphRequest(
        graphToken,
        `/range(address='A${rowIndex}:AB${rowIndex}')`,
        'PATCH',
        { values: [row] },
      )
    } catch (err) {
      errors.push(`Failed to update row ${rowIndex}: ${(err as Error).message}`)
    }
  }

  return { appended, updated, skipped, skippedDuplicates, weakDedupWarnings, errors }
}

// ---- Sync: Excel -> Supabase (Excel is source of truth) ----

async function syncFromExcel(
  supabase: ReturnType<typeof createClient>,
  graphToken: string,
): Promise<{
  synced: number
  skippedLegacy: number
  syncedFormsRows: number
  skippedNoCollective: number
  errors: string[]
}> {
  const errors: string[] = []
  let synced = 0
  let skippedLegacy = 0
  let syncedFormsRows = 0
  let skippedNoCollective = 0

  // Read all Excel data
  let rows: unknown[][]
  try {
    const usedRange = await graphRequest(graphToken, '/usedRange')
    rows = usedRange.values ?? []
  } catch (err) {
    return {
      synced,
      skippedLegacy,
      syncedFormsRows,
      skippedNoCollective,
      errors: [`Failed to read Excel: ${(err as Error).message}`],
    }
  }

  if (rows.length < 2) {
    return { synced, skippedLegacy, syncedFormsRows, skippedNoCollective, errors: ['No data rows in Excel'] }
  }

  // Build a collective name -> id lookup to avoid a DB query per Forms row.
  // Normalised to lowercase for case-insensitive matching against sheet values.
  const collectiveNameToId = new Map<string, string>()
  try {
    const { data: collectives } = await supabase.from('collectives').select('id, name')
    for (const c of (collectives ?? []) as { id: string; name: string }[]) {
      collectiveNameToId.set(c.name.trim().toLowerCase(), c.id)
    }
  } catch (err) {
    errors.push(`Failed to load collectives: ${(err as Error).message}`)
    // Non-fatal — Forms rows will all land in skippedNoCollective
  }

  // Resolve a system user for created_by / logged_by on synthetic Forms events.
  // Falls back to null if none found (acceptable if the column is nullable).
  let systemUserId: string | null = null
  try {
    const { data: adminUser } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'super_admin'])
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    systemUserId = (adminUser as { id: string } | null)?.id ?? null
  } catch {
    // null is acceptable — created_by may be nullable on the events table
  }

  // Process each data row (skip header row)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const excelId = String(row[0] ?? '')
    if (!excelId) continue

    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(excelId)
      const isFormsId = /^\d+$/.test(excelId)

      if (!isUuid && !isFormsId) {
        // Unrecognised ID format — not a UUID and not a plain integer
        skippedLegacy++
        continue
      }

      if (isUuid) {
        // App-created event: Excel wins on impact fields
        const attendees = row[11] ? Number(row[11]) : null
        const rubbishKg = row[15] ? Number(row[15]) : null
        const treesPlanted = row[16] ? Number(row[16]) : null

        if (attendees !== null || rubbishKg !== null || treesPlanted !== null) {
          const { error } = await supabase
            .from('event_impact')
            .upsert(
              {
                event_id: excelId,
                attendees,
                rubbish_kg: rubbishKg,
                trees_planted: treesPlanted,
              },
              { onConflict: 'event_id' },
            )

          if (error) {
            errors.push(`Row ${i + 1} (${excelId}): impact upsert failed: ${error.message}`)
            continue
          }
        }

        synced++
      } else {
        // Forms integer ID: try to LINK the impact data to an existing app-
        // created event in the same collective on the same date (within +/- 1
        // day) with a similar title. This is the primary fix for Jess's bug
        // (Apr 28 2026): without linkage, the synthetic event got the impact
        // row but the leader's app-created event stayed empty, so the
        // "Submit Impact Form" virtual task never cleared. If no app match
        // exists, fall back to the synthetic-event path so Forms submissions
        // for events that were never created in the app still land cleanly.
        const rowLabel = `Row ${i + 1} (Forms ID ${excelId})`

        // Resolve collective from col 3. Check the alias map FIRST so legacy
        // / divergent sheet names (e.g. "Byron Bay" -> Northern Rivers,
        // "Melbourne City" -> Melbourne) map to their canonical UUID even when
        // the alias row no longer exists in the collectives table. Fall back
        // to the name-to-id lookup built from the collectives table.
        const collectiveName = String(row[3] ?? '').trim()
        const collectiveNameLc = collectiveName.toLowerCase()
        const collectiveId =
          COLLECTIVE_ALIASES[collectiveNameLc] ?? collectiveNameToId.get(collectiveNameLc)
        if (!collectiveId) {
          errors.push(`${rowLabel}: no collective match for "${collectiveName}" — skipped`)
          skippedNoCollective++
          continue
        }

        // Parse date from col 2 (Excel serial number or ISO string)
        const dateRaw = row[2]
        let dateIso: string
        if (typeof dateRaw === 'number' && dateRaw > 1000) {
          dateIso = excelSerialToDate(dateRaw) + 'T00:00:00+10:00'
        } else if (typeof dateRaw === 'string' && dateRaw.match(/\d{4}-\d{2}-\d{2}/)) {
          dateIso = dateRaw.includes('T') ? dateRaw : dateRaw + 'T00:00:00+10:00'
        } else {
          errors.push(`${rowLabel}: unparseable date "${dateRaw}" — skipped`)
          skippedLegacy++
          continue
        }

        const title = String(row[1] ?? '').trim() || `Forms Event ${excelId}`
        const address = String(row[4] ?? '').trim()
        const activityType = mapSheetActivityType(row, errors, rowLabel)

        const attendees = row[11] ? Number(row[11]) : null
        const rubbishKg = row[15] ? Number(row[15]) : null
        const treesPlanted = row[16] ? Number(row[16]) : null

        // Try to match an existing app event before synthesising. If matched,
        // write event_impact directly to the app event_id so the leader's
        // "Submit Impact Form" task clears.
        const matchedAppEventId = await findMatchingAppEvent(
          supabase,
          collectiveId,
          dateIso,
          title,
        )

        if (matchedAppEventId) {
          // Link path: write impact to the app event without touching the
          // event row (the leader owns the title/date/status). Additive
          // upsert so we never clobber leader-logged values: the trigger
          // already wired up by survey_responses (PR #8) and the Log Impact
          // UI take precedence; this just fills the gap when neither has
          // run yet.
          const { error: existingErr, data: existing } = await supabase
            .from('event_impact')
            .select('event_id')
            .eq('event_id', matchedAppEventId)
            .maybeSingle()

          if (existingErr) {
            errors.push(`${rowLabel}: lookup failed for app event ${matchedAppEventId}: ${existingErr.message}`)
            continue
          }

          if (!existing) {
            const { error: insertErr } = await supabase
              .from('event_impact')
              .insert({
                event_id: matchedAppEventId,
                attendees: attendees ?? 0,
                rubbish_kg: rubbishKg ?? 0,
                trees_planted: treesPlanted ?? 0,
                logged_at: dateIso,
                logged_by: systemUserId,
                custom_metrics: { auto_derived_from_forms: true, forms_id: String(excelId) },
                notes: 'Auto-derived from Microsoft Forms submission via excel sync. Leader can refine via Log Impact.',
              })

            if (insertErr) {
              errors.push(`${rowLabel}: link-to-app insert failed: ${insertErr.message}`)
              continue
            }
            errors.push(`INFO ${rowLabel}: linked Forms impact to app event ${matchedAppEventId} (title="${title}")`)
            syncedFormsRows++
            continue
          }

          // App event already has event_impact (leader logged via the app
          // path, or PR #8 trigger already fired). Don't clobber. Skip the
          // synthetic write too: linkage is the source of truth now.
          errors.push(`INFO ${rowLabel}: app event ${matchedAppEventId} already has impact; skipped (linked)`)
          syncedFormsRows++
          continue
        }

        // Fallback: no app match. Create synthetic event + impact as before.
        // This preserves the canonical record for Forms submissions made
        // without a matching app-created event (legacy data, leaders who
        // skip the app entirely, etc.). Deterministic UUID v5 keeps re-runs
        // idempotent.
        const syntheticId = await formsIdToUuid(excelId)

        const { error: eventError } = await supabase
          .from('events')
          .upsert(
            {
              id: syntheticId,
              collective_id: collectiveId,
              created_by: systemUserId,
              title,
              date_start: dateIso,
              date_end: dateIso,
              status: 'completed',
              is_public: true,
              activity_type: activityType,
              address: address || null,
            },
            { onConflict: 'id' },
          )

        if (eventError) {
          errors.push(`${rowLabel}: event upsert failed: ${eventError.message}`)
          continue
        }

        const { error: impactError } = await supabase
          .from('event_impact')
          .upsert(
            {
              event_id: syntheticId,
              attendees: attendees ?? 0,
              rubbish_kg: rubbishKg ?? 0,
              trees_planted: treesPlanted ?? 0,
              logged_at: dateIso,
              logged_by: systemUserId,
            },
            { onConflict: 'event_id' },
          )

        if (impactError) {
          errors.push(`${rowLabel}: impact upsert failed: ${impactError.message}`)
          // Event was created — count the row regardless of impact failure
        }

        syncedFormsRows++
      }
    } catch (err) {
      errors.push(`Row ${i + 1} (${excelId}): ${(err as Error).message}`)
    }
  }

  return { synced, skippedLegacy, syncedFormsRows, skippedNoCollective, errors }
}

// ---- Delete: Remove event row from Excel (dev/test only, no auto-trigger) ----

async function deleteFromExcel(
  graphToken: string,
  eventId: string,
): Promise<{ deleted: boolean; error?: string }> {
  // Read sheet to find the row
  let excelState: ExcelState
  try {
    excelState = await readExcelState(graphToken)
  } catch (err) {
    return { deleted: false, error: `Failed to read Excel: ${(err as Error).message}` }
  }

  // Find the row index for this event ID
  let targetRowIndex = -1
  for (let i = 1; i < excelState.rows.length; i++) {
    if (String(excelState.rows[i][0]) === eventId) {
      targetRowIndex = i + 1 // 1-based Excel row
      break
    }
  }

  if (targetRowIndex === -1) {
    return { deleted: false, error: `Event ${eventId} not found in sheet` }
  }

  // Delete the row using Graph API
  try {
    const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${ITEM_ID}/workbook/worksheets/${encodeURIComponent(SHEET_NAME)}/range(address='A${targetRowIndex}:AB${targetRowIndex}')/delete`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${graphToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ shift: 'Up' }),
    })
    if (!res.ok) {
      const errText = await res.text()
      return { deleted: false, error: `Graph API delete failed (${res.status}): ${errText}` }
    }
    return { deleted: true }
  } catch (err) {
    return { deleted: false, error: (err as Error).message }
  }
}

// ---- Main handler ----

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const direction = url.searchParams.get('direction') ?? 'from-excel'
    const eventId = url.searchParams.get('event_id') ?? undefined

    // Auth: require service_role or valid user token
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const graphToken = await getGraphToken()
    const results: Record<string, unknown> = {}

    // Delete: manual only, for dev/test cleanup
    if (direction === 'delete') {
      if (!eventId) {
        return new Response(
          JSON.stringify({ error: 'event_id required for delete' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      results.delete = await deleteFromExcel(graphToken, eventId)
      return new Response(JSON.stringify({ ok: true, direction, ...results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // For 'full' sync: from-excel FIRST (Excel is truth), then to-excel
    if (direction === 'from-excel' || direction === 'full') {
      results.fromExcel = await syncFromExcel(supabase, graphToken)
    }

    if (direction === 'to-excel' || direction === 'full') {
      results.toExcel = await syncToExcel(supabase, graphToken, eventId)
    }

    // ---- Monitoring heartbeat: write a summary row to excel_sync_runs ----
    // Captures per-run metrics so a daily aggregator can spot dark windows,
    // surging dupe-warnings, or repeated sync failures. Failure to write the
    // monitoring row is logged but does not fail the sync response.
    try {
      const fromEx = (results.fromExcel ?? null) as null | {
        synced?: number; syncedFormsRows?: number; skippedNoCollective?: number; skippedLegacy?: number; errors?: string[]
      }
      const toEx = (results.toExcel ?? null) as null | {
        appended?: number; updated?: number; skipped?: number; skippedDuplicates?: number;
        weakDedupWarnings?: unknown[]; errors?: string[]
      }
      const sheetRows = (fromEx as any)?._sheetRows ?? null // hook for future surfacing
      await supabase.from('excel_sync_runs').insert({
        run_at: new Date().toISOString(),
        direction,
        event_id: eventId ?? null,
        from_excel_synced: fromEx?.synced ?? null,
        from_excel_forms_rows_synced: fromEx?.syncedFormsRows ?? null,
        from_excel_skipped_no_collective: fromEx?.skippedNoCollective ?? null,
        from_excel_skipped_legacy: fromEx?.skippedLegacy ?? null,
        from_excel_error_count: (fromEx?.errors ?? []).length,
        to_excel_appended: toEx?.appended ?? null,
        to_excel_updated: toEx?.updated ?? null,
        to_excel_skipped: toEx?.skipped ?? null,
        to_excel_skipped_duplicates: toEx?.skippedDuplicates ?? null,
        to_excel_weak_dedup_warning_count: (toEx?.weakDedupWarnings ?? []).length,
        to_excel_error_count: (toEx?.errors ?? []).length,
        summary: {
          fromExcel: fromEx,
          toExcel: toEx,
          sheetRows,
        },
      })
    } catch (mErr) {
      // Non-fatal — monitoring failure shouldn't fail the sync.
      console.warn(`excel_sync_runs insert failed: ${(mErr as Error).message}`)
    }

    return new Response(JSON.stringify({ ok: true, direction, ...results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
