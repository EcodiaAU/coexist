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
 *   events whose collective has forms_migrated_at set AND whose date_start is on or
 *   after forms_migrated_at (collective has cut over from Forms to the app).
 *   Collectives with NULL forms_migrated_at are still using Forms for real events - their
 *   app events are NOT pushed to the sheet, preventing double-entries during transition.
 *   The migration gate is the SOLE filter; there is no test-title bypass.
 * - DEDUP: before appending any app-generated row, the function builds a signature set
 *   from all integer-ID (Forms-origin) rows already on the sheet. Signature format is
 *   (collective | date_iso | title), lowercased and trimmed. If an app event's signature
 *   matches a Forms row, the app event is SKIPPED (not appended) and logged in errors as
 *   `skippedDuplicates`. Admin must reconcile the Forms row manually - no auto-overwrite.
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
 *                                support will come via event_organisations table - see TODO)
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

// Only sync events from 2026-05-04 onwards - historical 2026 Forms data has
// already landed via prior sync runs; the cutover boundary going forward is
// the date Sunshine Coast + Melbourne flipped to app-canonical.
//
// Pre-2026-05-04: untouched (DB has the legacy backfill rows; sheet keeps
// its Forms-origin rows). 2026-05-04+: only post-cutover rows for non-migrated
// collectives flow sheet -> DB; only post-cutover events for migrated
// collectives (Sunshine Coast + Melbourne) flow DB -> sheet.
const SYNC_CUTOFF_DATE = '2026-05-04'

// Fixed namespace UUID for Forms-sourced synthetic events. Embedded as a literal
// and MUST NEVER CHANGE - changing it invalidates all existing synthetic UUIDs and
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

// ---- Title aliases ----
// Token-level expansions applied during fuzzy title matching. The classic case
// is acronyms vs full names ("OCCA" vs "Oxley Creek Catchment Association")
// where the leader wrote one form on the Form and another in the app for the
// same event. Keys are LOWERCASED single tokens or token-bigrams found in
// either source. Values are the canonical multi-token expansion.
//
// Adding a new alias is a single-source change; no DB migration. Order is not
// significant - the matcher applies all aliases before tokenisation.
const TITLE_ALIASES: Record<string, string> = {
  occa: 'oxley creek catchment association',
}

// Stopwords stripped before token-overlap fuzzy matching. Generic event-noise
// words that would otherwise dominate the overlap count for unrelated events
// on the same date. Note 'tree' and 'planting' are stopworded because virtually
// every conservation event uses them - the discriminator is the location /
// partner-org token, not the activity type.
const TITLE_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'at', 'of', 'in', 'on', 'for', 'to', 'from',
  'with', 'w', 'by', 'project', 'planting', 'tree', 'event',
])

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Workbook write endpoints throttle aggressively. The per-event trigger path
// and the hourly batch overlap and burst Graph PATCHes against the same
// workbook, which returns 429 EditModeCannotAcquireLockTooManyRequests (and
// occasionally 503/504). Before this guard those writes were dropped on the
// floor (`Failed to update row N (429)` in excel_sync_runs), so impact updates
// silently never reached the sheet. Retry with backoff that honours the
// Retry-After header. Origin: 2026-06-29 sheet/app reconciliation - live
// telemetry showed recurring 429s on to-excel update writes.
const GRAPH_MAX_RETRIES = 6
const GRAPH_RETRYABLE = new Set([429, 503, 504])

async function graphRequest(token: string, path: string, method = 'GET', body?: unknown) {
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${ITEM_ID}/workbook/worksheets/${encodeURIComponent(SHEET_NAME)}${path}`
  let lastErrText = ''
  let lastStatus = 0
  for (let attempt = 0; attempt <= GRAPH_MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.ok) return res.json()

    lastStatus = res.status
    lastErrText = await res.text()

    if (GRAPH_RETRYABLE.has(res.status) && attempt < GRAPH_MAX_RETRIES) {
      // Prefer the server's Retry-After (seconds); fall back to capped
      // exponential backoff with jitter. Graph workbook throttles can ask for
      // 15-30s, so cap generously at 30s.
      const retryAfter = Number(res.headers.get('retry-after'))
      const backoff = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(30000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 500)
      console.log(`[excel-sync] Graph ${method} ${path} ${res.status}; retry ${attempt + 1}/${GRAPH_MAX_RETRIES} after ${backoff}ms`)
      await sleep(backoff)
      continue
    }
    break
  }
  throw new Error(`Graph API ${method} ${path} failed (${lastStatus}) after retries: ${lastErrText}`)
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

/** Convert yes_no survey answer to Yes/No string. `fallback` is the value
 *  to use when the leader didn't answer (blank/NA/null). Set to 'No' for
 *  columns the Forms-era convention always populated (FirstAid, OneDrive,
 *  GVids, Insta - 0 blanks across 43 Forms rows in May 2026). Leave blank
 *  ('') for truly optional yes/no (only q6 Collect). */
function yesNo(val: unknown, fallback: '' | 'Yes' | 'No' = ''): string {
  if (val === true || val === 'yes' || val === 'Yes') return 'Yes'
  if (val === false || val === 'no' || val === 'No') return 'No'
  return fallback
}

/** Yes-only yes_no for sheet cells the Forms convention leaves blank on No.
 *  q6 "Collect or make anything?" Forms data: 37 blank, 5 Yes, only 1 No
 *  across 43 rows - leaders almost never explicitly write "No"; blank IS the
 *  "no" signal. Coerce No-pick to blank so the sheet matches Form convention.
 *  Origin: Tate verbatim 2026-05-18 - "make no not put anything in". */
function yesOrBlank(val: unknown): string {
  return yesNo(val) === 'Yes' ? 'Yes' : ''
}

// Treat empty/whitespace/"NA"/"N/A"/"-"/"none"/"no"/"nil"/"nope" as
// no-answer. Leaders often type these in optional fields to mean "not
// applicable" - the sheet should land the column-specific default (blank
// for col 8/9 Landcare/OzFish, "No, just Co-Exist!" for col 7, "No" for
// col 20/22/25 Issues/Highlights/Grant) rather than the literal "NA"/"No"
// in fields where the Forms convention left them blank.
//
// Safe across all call sites:
//   - yesNo() does NOT call isNoAnswer; an explicit "No" still maps to 'No'.
//   - freeText() with fallback "No" (Issues/Highlights/Grant): if leader
//     types "No", freeText returns ''; the || 'No' fallback then writes "No"
//     to the cell - same end result.
//   - freeText() without fallback (Landcare/OzFish/Hike/WhatHow): "No" -> ''
//     matches Forms convention of blank-when-not-applicable.
function isNoAnswer(val: unknown): boolean {
  if (val === null || val === undefined) return true
  const s = String(val).trim().toLowerCase()
  return (
    s === '' || s === 'na' || s === 'n/a' || s === '-' ||
    s === 'none' || s === 'no' || s === 'nil' || s === 'nope'
  )
}

// Interpret q1 across the two response shapes:
//   NEW (post-2026-05-18 night): q1 = "Yes"/"No" yes_no, q1_name = free text
//   LEGACY (pre-2026-05-18): q1 = free-text group name, no q1_name
// Returns the partner-group name when a group attended, '' when only Co-Exist
// was there. Either shape converges on the same answer so the sheet col 7
// stays stable across the schema shift.
function readOtherGroupName(q1: unknown, q1Name: unknown): string {
  const q1Raw = typeof q1 === 'string' ? q1.trim() : q1
  // NEW shape: explicit Yes/No
  if (q1Raw === 'Yes' || q1Raw === 'yes' || q1Raw === true) {
    return isNoAnswer(q1Name) ? '' : String(q1Name).trim()
  }
  if (q1Raw === 'No' || q1Raw === 'no' || q1Raw === false) {
    return '' // leader explicitly said no other group attended
  }
  // Blank / unanswered
  if (isNoAnswer(q1Raw)) return ''
  // LEGACY shape: q1 itself is the partner name (Hannah's "Norman Creek...",
  // Caitlyn's "Tree Project" etc submitted before the schema change).
  return String(q1Raw).trim()
}

// True iff the leader confirmed another group attended (either via the new
// q1=Yes flag or a legacy free-text response in q1). Gates whether the
// Landcare/OzFish text answers land on the sheet - matches the survey UI
// where q2/q3 are hidden when q1=No.
function otherGroupAttended(q1: unknown, q1Name: unknown): boolean {
  return readOtherGroupName(q1, q1Name).length > 0
}

// Derive sheet col 6 (Primary Organiser) + col 7 (Other Group Attended) from
// event-level external-collaboration data + survey answers.
//
// Three states:
//
//   STATE 1 - only Co-Exist at the event
//     is_external_collaboration=false, no partner_name, no other-group named
//     -> col 6 = "Co-Exist", col 7 = "No, just Co-Exist!"
//
//   STATE 2 - Co-Exist organised, another group also attended
//     is_external_collaboration=false AND (partner_name set OR q1 named)
//     -> col 6 = "Co-Exist", col 7 = partner_name OR named other-group
//
//   STATE 3 - another group organised, Co-Exist attended/supported
//     is_external_collaboration=true
//     -> col 6 = partner_name (preferred) || named other-group || "Co-Exist"
//        col 7 = "No, just Co-Exist!" (no third group implied)
//
// Origin: Tate verbatim 2026-05-18 - "if only coexist at the event it says
// 'No, just Co-Exist!'; if organised by coexist but another group attended,
// that's mapped into the sheet; if organised by another group, just put that
// other group into the event organiser column".
function deriveOrganiserAndOtherGroup(
  isExternal: boolean,
  partnerName: string,
  q1: unknown,
  q1Name: unknown,
): { organiser: string; otherGroup: string } {
  const partner = (partnerName ?? '').trim()
  const otherName = readOtherGroupName(q1, q1Name)

  if (isExternal) {
    const organiser = partner || otherName || 'Co-Exist'
    return { organiser, otherGroup: 'No, just Co-Exist!' }
  }

  const namedOther = partner || otherName
  if (namedOther) {
    return { organiser: 'Co-Exist', otherGroup: namedOther }
  }
  return { organiser: 'Co-Exist', otherGroup: 'No, just Co-Exist!' }
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
  /** events.is_external_collaboration - driven by the "External Collab" toggle
   *  in create-event step 5. TRUE means the partner organisation organised the
   *  event; FALSE (default) means Co-Exist organised. Used to derive sheet
   *  cols 6 + 7 via deriveOrganiserAndOtherGroup. */
  is_external_collaboration: boolean
  /** events.event_extras.partner_name - free-text partner-organisation name
   *  collected on create-event step 5 ("Partner Organisation (optional)").
   *  When set together with is_external_collaboration=true, the partner is the
   *  organiser; when set with is_external_collaboration=false, the partner is
   *  the "other group attended". Empty string when no partner. */
  partner_name: string
  attendees: number | null
  checked_in_count: number
  rubbish_kg: number | null
  trees_planted: number | null
  answers: Record<string, unknown>
  /** True when an event_impact row exists for this event, meaning the leader
   *  has submitted the impact form (via survey link or Log Impact UI).
   *  Used by syncToExcel to gate APPEND operations: only events with impact
   *  data are written to the master sheet. UPDATE operations (existing sheet
   *  rows) are not gated - they receive whatever data is available. */
  hasImpactData: boolean
  /** True when the event's start date has already passed (i.e. the event has
   *  occurred). Used by syncToExcel to gate APPEND operations alongside
   *  hasImpactData: future-dated events should never appear in the post-event
   *  master impact sheet, even if an event_impact row somehow exists.
   *  Predicate: new Date(date_start) <= new Date() (UTC server time). */
  hasHappened: boolean
}

// Coerce a free-text survey answer to either the trimmed value or "" when the
// leader skipped / typed "NA" / "N/A" / "-" / "none". Mirrors the Forms-era
// sheet convention where unanswered cells are blank, not literal "NA".
function freeText(val: unknown): string {
  return isNoAnswer(val) ? '' : String(val).trim()
}

// Like freeText, but for numeric-intent cells (kg, count). Returns the number
// when coercible AND non-zero. Returns '' for blank/NA OR for zero OR for
// unparseable text (e.g. "12kg"):
//   - blank/NA: leader didn't fill it
//   - zero: leader typed 0 meaning "none/not applicable" - Forms convention
//     has zero 0s in cols 15 (Rubbish) + 16 (Trees) across 43 rows; blanks
//     are the "no quantity" signal
//   - unparseable string: never leak a non-numeric value into a number column,
//     which would break sheet sums and sorts
// Falls through to fallback only if fallback is itself a non-zero finite
// number; otherwise blank.
function numberOrBlank(val: unknown, fallback: number | null): string | number {
  if (!isNoAnswer(val)) {
    const n = typeof val === 'number' ? val : Number(String(val).trim())
    if (Number.isFinite(n) && n !== 0) return n
    if (Number.isFinite(n) && n === 0) return ''
  }
  if (fallback === null || fallback === undefined || fallback === 0) return ''
  return fallback
}

function buildExcelRow(e: EventData): (string | number | null)[] {
  const isConservation = CONSERVATION_TYPES.includes(e.activity_type)
  const isRecreation = RECREATION_TYPES.includes(e.activity_type)
  const label = ACTIVITY_LABELS[e.activity_type] ?? e.activity_type

  // Cols 6 + 7 derived from event-level external-collab data + survey q1/q1_name.
  // See deriveOrganiserAndOtherGroup for the three-state mapping.
  const { organiser, otherGroup } = deriveOrganiserAndOtherGroup(
    e.is_external_collaboration,
    e.partner_name,
    e.answers?.q1,
    e.answers?.q1_name,
  )

  // Landcare/OzFish text answers only land on the sheet when the leader
  // confirmed another group attended (q1=Yes in new schema, or non-empty
  // legacy free-text q1). Mirrors the survey UI where q2/q3 are hidden
  // when q1=No - sheet never carries a Landcare name for a "just Co-Exist"
  // event even if a leader typed something stale into q2 then changed q1.
  const groupAttended = otherGroupAttended(e.answers?.q1, e.answers?.q1_name)

  // Doctrine for every survey-derived column on this row: "if the leader did
  // not answer it, leave the cell BLANK". Mirrors the Forms-era convention on
  // the master sheet, where unanswered cells were genuinely empty rather than
  // a literal "NA". yesNo() already returns "" for unknown values; freeText()
  // and numberOrBlank() handle the strings + numerics the same way.
  // Origin: Tate verbatim 2026-05-18 - "what was it and how much, that should
  // be left blank if unanswered, not them have to put NA".

  // Forms-convention column doctrine, derived from 43 May-2026 Forms-origin
  // rows on the master sheet (rows 240-286, Forms IDs only):
  //
  //   ALWAYS populated (0-1 blank / 43):
  //     col 7  OtherGroup  -> "No, just Co-Exist!" default
  //     col 20 Issues      -> "No" default (free text or "No")
  //     col 21 FirstAid    -> "No" default (yes/no)
  //     col 22 Highlights  -> "No" default (free text)
  //     col 23 OneDrive    -> "No" default (yes/no, sheet often "Yes")
  //     col 24 GoogleVids  -> "No" default (yes/no)
  //     col 25 Grant       -> "No" default (free text)
  //     col 27 Insta       -> "No" default (yes/no)
  //
  //   OFTEN blank (truly optional in Form):
  //     col 8 Landcare, col 9 OzFish, col 15 Rubbish, col 16 Trees,
  //     col 17 Collect, col 18 WhatHow, col 19 Hike
  //
  // Origin: Tate verbatim 2026-05-18 - "since all the rows in the any issues
  // column have either an issue or 'No', those ones ARE NOT left blank...
  // it needs to be identical to their conventions and way of doing it via
  // their form". Conventions analysis at backend/drafts/coexist-sheet-column-
  // conventions-2026-05-18.md.

  return [
    e.id,                                                    // 0: ID
    e.title,                                                 // 1: Event Title
    dateToExcelSerial(e.date_start),                         // 2: Date of Event
    e.collective_name,                                       // 3: Collective
    e.address ?? '',                                         // 4: Location
    freeText(e.answers?.postcode) || extractPostcode(e.address ?? ''), // 5: Postcode (survey answer, fallback to address extraction)
    organiser,                                               // 6: Primary Organiser of the Event
    otherGroup,                                              // 7: Other Group Attended (always populated)
    // col 8 (Landcare) + col 9 (OzFish): derived from q1_name substring when
    // a partner group attended. Legacy responses had explicit q2/q3 fields but
    // those were removed from the survey UI (2026-05-18 night) - leaders kept
    // typing "No" in them, polluting the sheet. We now extract Landcare/OzFish
    // chapter names automatically from q1_name (or legacy q1 free-text) when
    // they contain the keyword. Old responses with explicit q2/q3 still
    // populate the cells via the fallback (q2/q3 -> direct freeText).
    (() => {
      if (!groupAttended) return ''
      const legacy = freeText(e.answers?.q2)
      if (legacy) return legacy
      const partnerName = readOtherGroupName(e.answers?.q1, e.answers?.q1_name)
      return /landcare/i.test(partnerName) ? partnerName : ''
    })(),                                                    // 8: Landcare
    (() => {
      if (!groupAttended) return ''
      const legacy = freeText(e.answers?.q3)
      if (legacy) return legacy
      const partnerName = readOtherGroupName(e.answers?.q1, e.answers?.q1_name)
      return /ozfish/i.test(partnerName) ? partnerName : ''
    })(),                                                    // 9: OzFish
    freeText(e.answers?.leader_name) || e.leader_name || '', // 10: Co-Exist Leader (from survey dropdown)
    e.attendees ?? e.checked_in_count ?? '',                  // 11: Number of Attendees (impact override or check-in count)
    isConservation ? 'Conservation' : isRecreation ? 'Recreation' : label, // 12: Type of Event
    isConservation ? label : '',                             // 13: Conservation type (optional)
    isRecreation ? label : '',                               // 14: Recreational type (optional)
    numberOrBlank(e.answers?.q4, e.rubbish_kg),              // 15: Rubbish Removed (optional - blank when N/A)
    numberOrBlank(e.answers?.q5, e.trees_planted),           // 16: Trees Planted (optional - blank when N/A)
    yesOrBlank(e.answers?.q6),                               // 17: Collect/Make Anything (Yes-only; No -> blank, matches Forms 37 blank / 5 Yes / 1 No)
    // 18: What & How Much - defensive gate on q6=Yes. Mirrors col 8/9
    // gating on q1=Yes. Catches stale q7 from a Yes->No->save flip on legacy
    // responses; new responses are already stripped by stripHiddenAnswers
    // at submit time.
    (() => {
      const q6yes = yesNo(e.answers?.q6) === 'Yes'
      return q6yes ? freeText(e.answers?.q7) : ''
    })(),                                                    // 18: What & How Much (Yes-gated)
    freeText(e.answers?.q8),                                 // 19: Hike/track name (optional - blank when N/A)
    freeText(e.answers?.q9) || 'No',                         // 20: Any Issues (ALWAYS populated, "No" default)
    yesNo(e.answers?.q10, 'No'),                             // 21: Use First Aid Kit (ALWAYS populated, "No" default)
    freeText(e.answers?.q11) || 'No',                        // 22: Outstanding Highlights (ALWAYS populated, "No" default)
    yesNo(e.answers?.q12, 'No'),                             // 23: Images to OneDrive (ALWAYS populated, "No" default)
    yesNo(e.answers?.q13, 'No'),                             // 24: Videos to Google (ALWAYS populated, "No" default)
    freeText(e.answers?.q14) || 'No',                        // 25: Grant Project (ALWAYS populated, "No" default)
    toYearMonth(e.date_start),                               // 26: Year-Month
    yesNo(e.answers?.q15, 'No'),                             // 27: Posted Wrap-up Insta (ALWAYS populated, "No" default)
  ]
}

// ---- Fetch event data from Supabase ----

async function fetchEventData(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
): Promise<EventData | null> {
  const { data: event } = await supabase
    .from('events')
    .select('id, title, date_start, activity_type, address, collective_id, created_by, is_external_collaboration, event_extras')
    .eq('id', eventId)
    .single()

  if (!event) return null

  // Enforce 2026+ cutoff
  if (event.date_start < SYNC_CUTOFF_DATE) return null

  const partnerName = String(
    ((event.event_extras as Record<string, unknown> | null)?.partner_name as string | undefined) ?? '',
  ).trim()

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
    is_external_collaboration: Boolean(event.is_external_collaboration),
    partner_name: partnerName,
    attendees: impact?.attendees ?? null,
    checked_in_count: checkedInCount ?? 0,
    rubbish_kg: impact?.rubbish_kg ?? null,
    trees_planted: impact?.trees_planted ?? null,
    answers,
    // True when an event_impact row exists. Covers both submission paths:
    // (1) survey link → survey_responses INSERT → sync_survey_response_to_event_impact
    //     trigger → event_impact INSERT
    // (2) leader uses Log Impact UI → direct event_impact INSERT
    // Either path results in an event_impact row. No row = no impact data yet.
    hasImpactData: impact !== null,
    // True when the event's start date is in the past (event has occurred).
    // Guards the APPEND branch: post-event master sheet rows must only cover
    // events that have actually happened. Future-dated events (e.g. 22 May 2026
    // appearing during a 11 May sync run) are skipped until the date passes.
    hasHappened: new Date(event.date_start) <= new Date(),
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

// Token-CONTAINS fallback for Layer 4 - ordered most-specific first so longer tokens win.
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
// Pure function of formsId - re-running sync is safe (upserts are no-ops when unchanged).
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

/** Reduce a title to a stopword-stripped, alias-expanded token set. Used by
 *  the anti-resynthesis matcher: titles that share 2+ content tokens after
 *  this normalisation are treated as the same event. The 165-synth-dupe
 *  sweep on 2026-05-04 used this exact algorithm to cluster
 *  "Oxley Creek Catchment Association" with "OCCA" - a Jaccard pass alone
 *  missed it because OCCA is one short token vs four long tokens. Token
 *  overlap >= 2 is robust to that asymmetry. */
function titleContentTokens(s: string): Set<string> {
  // Apply title aliases BEFORE tokenisation so 'occa' expands to four tokens.
  let normalised = normaliseTitle(s)
  for (const [alias, expansion] of Object.entries(TITLE_ALIASES)) {
    // Whole-token replacement so we don't accidentally replace inside a longer
    // token. Word boundary regex on the lowercase normalised form.
    const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
    normalised = normalised.replace(re, expansion)
  }
  const tokens = normalised.split(' ').filter(Boolean).filter(t => !TITLE_STOPWORDS.has(t))
  return new Set(tokens)
}

/** Count of shared tokens between two titles after stopword strip + alias
 *  expansion. 2+ shared tokens = same event for anti-resynthesis purposes. */
function titleTokenOverlap(a: string, b: string): number {
  const tokensA = titleContentTokens(a)
  const tokensB = titleContentTokens(b)
  let overlap = 0
  for (const t of tokensA) if (tokensB.has(t)) overlap++
  return overlap
}

/** Detect Forms-synthetic event UUIDs by inspecting the version digit.
 *  formsIdToUuid uses UUID v5 (deterministic), so position 14 in the
 *  canonical string form is the literal '5'. App events are inserted with
 *  Postgres uuid_generate_v4(), where position 14 is '4'.
 *
 *  Used by syncToExcel to skip synthetic events (those that originated from
 *  the sheet) so they are never pushed back, regardless of whether their
 *  created_by field is null or set to the system admin user (both patterns
 *  exist in the DB depending on when the event was imported). */
function isSyntheticFormsUuid(id: string): boolean {
  return id.length >= 15 && id.charAt(14) === '5'
}

/** Find the best-matching event for a Forms row. Returns the event_id if a
 *  match is found, otherwise null.
 *
 *  Candidate pool: all events for the same collective within the date window,
 *  including synthetic events created by previous sync runs. Including
 *  synthetics enables idempotent re-sync: a Forms row that was processed in a
 *  previous sync will match its own synthetic event (same collective + similar
 *  date + similar title) and update event_impact in place rather than creating
 *  a duplicate. The DB-level partial unique index (events_synthetic_dedup) and
 *  the existence guard (fork_mp138va4) provide additional protection layers.
 *
 *  Three-tier match criteria:
 *  Tier 1 (close-date, low-Jaccard-bar): same collective, |date - formsDate|
 *    <= 1 day, Jaccard similarity >= 0.34. Catches the common timezone-drift
 *    case (Forms midnight UTC+10 vs app local time).
 *  Tier 2 (wide-date, high-Jaccard-bar): same collective,
 *    |date - formsDate| <= 31 days, Jaccard similarity >= 0.55. Catches the
 *    real-world case where the leader submitted the Form with a wrong date.
 *  Tier 3 (anti-resynthesis token-overlap): same collective,
 *    |date - formsDate| <= 1 day, content-token overlap >= 2 after stopword
 *    strip + TITLE_ALIASES expansion. Catches the OCCA/Oxley case where
 *    Jaccard misses (one token vs four) but token overlap clearly identifies
 *    the same event. Origin: 165-synth-dupe sweep 2026-05-04.
 *
 *  Tier 1 is preferred when both apply (closer dates win). Within a tier:
 *  higher sim, then closer date. */
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
    // NOTE: synthetic events (UUID v5) are intentionally included as candidates.
    // If a synthetic event from a previous sync run matches this Forms row by
    // title+date, we match it and update event_impact in place - that is the
    // correct idempotent-resync behaviour. The DB-level events_synthetic_dedup
    // index and the existence guard provide structural dedup on top of this.
    const sim = titleSimilarity(c.title, formsTitle)
    const overlap = titleTokenOverlap(c.title, formsTitle)
    const deltaMs = Math.abs(new Date(c.date_start).getTime() - formsDate.getTime())
    let tier: number | null = null
    if (deltaMs <= dayMs && sim >= 0.34) tier = 1
    else if (deltaMs <= 31 * dayMs && sim >= 0.55) tier = 2
    else if (deltaMs <= dayMs && overlap >= 2) tier = 3
    if (tier === null) continue
    // Lower tier number wins (Tier 1 > Tier 2 > Tier 3). Within a tier:
    // higher sim, then closer date. For Tier 3, sim may be low - that's
    // expected; the tier ordering already protects against false positives.
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
  /** Events skipped at the APPEND stage because no impact survey has been submitted yet.
   *  These events are eligible (migration-gated, app-created) but will not land on the
   *  master sheet until the leader submits their impact form. Also counted in `skipped`. */
  skippedNoImpact: number
  weakDedupWarnings: { eventId: string; collective: string; date: string; title: string; existingFormsTitle: string }[]
  errors: string[]
}> {
  const errors: string[] = []
  const weakDedupWarnings: { eventId: string; collective: string; date: string; title: string; existingFormsTitle: string }[] = []
  let appended = 0
  let updated = 0
  let skipped = 0
  let skippedDuplicates = 0
  let skippedNoImpact = 0

  // Read existing Excel data
  let excelState: ExcelState
  try {
    excelState = await readExcelState(graphToken)
  } catch (err) {
    errors.push(`Failed to read Excel: ${(err as Error).message}`)
    return { appended, updated, skipped, skippedDuplicates, skippedNoImpact, weakDedupWarnings, errors }
  }

  // Build a map of existing event IDs to their row index (1-based)
  const idToRowIndex = new Map<string, number>()
  for (let i = 1; i < excelState.rows.length; i++) {
    const id = String(excelState.rows[i][0] ?? '')
    if (id) idToRowIndex.set(id, i + 1) // +1 because Excel rows are 1-based
  }

  // Build a signature set from Forms rows (integer IDs only) for dedup protection.
  // If an app event's signature matches a Forms row, it is skipped - not appended.
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
    // Only integer IDs are Forms rows - UUIDs are app rows and don't belong in the dedup set
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

  // Determine which events to sync.
  //
  // The migration gate (collective.forms_migrated_at IS NOT NULL AND
  // event.date_start >= forms_migrated_at) is applied in BOTH single-event
  // mode (eventId passed in by the pg_cron trigger or manual call) and
  // batch mode. Otherwise the trigger-driven per-event path silently
  // bypasses the gate and leaks events from non-migrated collectives onto
  // the sheet. See ~/ecodiaos/patterns/excel-sync-collectives-migration.md.
  let eventIds: string[] = []
  if (eventId) {
    // Single-event mode: apply the SAME migration gate as batch mode.
    const { data: ev } = await supabase
      .from('events')
      .select('id, title, date_start, collective_id, collectives(forms_migrated_at)')
      .eq('id', eventId)
      .single()
    if (!ev) {
      eventIds = []
    } else {
      const migratedAt = (ev.collectives as any)?.forms_migrated_at
      if (!migratedAt) {
        // Collective has not migrated; gate blocks. Skip silently.
        eventIds = []
      } else if (new Date(ev.date_start as string) < new Date(migratedAt as string)) {
        // Event predates the collective's cutover; gate blocks. Skip silently.
        eventIds = []
      } else {
        eventIds = [eventId]
      }
    }
  } else {
    // Batch mode: app-created events that pass the migration gate.
    // Pull collective forms_migrated_at and filter in JS:
    //   events only sync if their collective has forms_migrated_at set AND
    //   date_start >= forms_migrated_at (the collective has cut over from Forms).
    //   No test-title bypass - gate-only doctrine post 2026-05-04 cutover.
    //
    // STATUS GATE: 'published' AND 'completed'. 'draft' events stay off the
    // sheet (work in progress); 'cancelled' events stay off (deletion intent).
    //
    // IMPACT-SURVEY GATE (added 2026-05-11, Co-Exist 1.8.5):
    // Events are only APPENDED to the sheet when an event_impact row exists,
    // meaning the leader has submitted their impact data (via the impact survey
    // link or the Log Impact UI). This prevents empty-survey-column rows from
    // polluting Charlie's canonical sheet view (Charlie's complaint, May 2026).
    // The gate applies to APPEND only - UPDATE operations on rows already in
    // the sheet are not gated (impact-less rows placed pre-gate still receive
    // updates once impact data arrives).
    // See fetchEventData.hasImpactData and the append branch below.
    // Doctrine: ~/ecodiaos/patterns/sync-back-must-filter-synthetic-from-source.md
    //
    // NOTE: The pre-gate deploy may have already placed impact-less rows on
    // the sheet. Run the cleanup SQL in ~/ecodiaos/drafts/coexist-impact-sheet-cleanup-2026-05-11.sql
    // to identify and remove those rows BEFORE rebaselining with this version.
    //
    // This MUST stay symmetric with the syncFromExcel reconciliation candidate
    // selector - reconciliation cancels migrated-collective events that are in
    // the DB but absent from the sheet, and that selector must be a SUBSET of
    // (or equal to) what to-excel pushes. Otherwise reconciliation cancels
    // events that to-excel never pushed = the bug fixed in this commit.
    // See ~/ecodiaos/patterns/sync-back-must-filter-synthetic-from-source.md
    // and ~/ecodiaos/patterns/excel-sync-collectives-migration.md.
    const { data: events } = await supabase
      .from('events')
      .select('id, title, date_start, collective_id, collectives(forms_migrated_at)')
      .in('status', ['published', 'completed'])
      .gte('date_start', SYNC_CUTOFF_DATE)
      .order('date_start', { ascending: true })

    const filtered = ((events ?? []) as any[]).filter((e: any) => {
      const migratedAt = (e.collectives as any)?.forms_migrated_at
      if (!migratedAt) return false
      return new Date(e.date_start) >= new Date(migratedAt)
    })

    eventIds = filtered.map((e: any) => e.id)
  }

  // Sort into append vs update
  const newRows: (string | number | null)[][] = []
  const updateRows: { rowIndex: number; row: (string | number | null)[] }[] = []

  // Pre-fetch the created_by / UUID status for candidate events so we can skip
  // synthetic events (those created by the from-excel reverse-sync). Synthetic
  // events ORIGINATED from the sheet and must not be pushed back, otherwise
  // each sheet->DB sync triggers N spurious to-excel calls that attempt to
  // write the same data back under a (potentially differently-aliased)
  // collective name, missing the dedup signature and appending duplicates.
  //
  // Identification: two overlapping signals, both detected:
  //   1. created_by IS NULL - legacy synthetic events imported before the
  //      system-user resolution was added.
  //   2. isSyntheticFormsUuid(id) - UUID v5 (version digit at position 14 =
  //      '5'). Newer synthetic events have created_by set to the admin user
  //      ID, so the created_by IS NULL check alone is insufficient.
  // Using both signals ensures all synthetic events are skipped regardless
  // of which import path created them.
  //
  // Audit 2026-05-11 (fork_mp14bxww_0103ed): confirmed both signals required.
  // DB has synthetic events with created_by IS NULL (pre-systemUserId path)
  // and with created_by = admin UUID (post-systemUserId path). UUID v5 check
  // covers both. See ~/ecodiaos/patterns/sync-back-must-filter-synthetic-from-source.md.
  const syntheticEventIds = new Set<string>()
  if (eventIds.length > 0) {
    try {
      const { data: syntheticEvents } = await supabase
        .from('events')
        .select('id, title, created_by')
        .in('id', eventIds)
      for (const e of (syntheticEvents ?? []) as { id: string; title: string; created_by: string | null }[]) {
        if (e.created_by === null || isSyntheticFormsUuid(e.id)) {
          syntheticEventIds.add(e.id)
        }
      }
    } catch {
      // Non-fatal - fall through and let the dedup signature catch what it can.
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
        // App event already in sheet - UPDATE the row (no impact gate on updates;
        // rows placed before this gate was deployed still receive data as it arrives).
        updateRows.push({ rowIndex: existingRowIndex, row })
        updated++
      } else {
        // New app event - APPEND path.
        //
        // APPEND GATE (two predicates, both must be true):
        //
        // 1. IMPACT-SURVEY GATE (added 2026-05-11, Co-Exist 1.8.5, commit a9e5937):
        //    An event_impact row must exist (data.hasImpactData), meaning the leader
        //    submitted impact data via the survey link or Log Impact UI. Without this,
        //    every published/completed migrated-collective event lands on Charlie's
        //    sheet with cols 11-27 blank - polluting the canonical view.
        //
        // 2. FUTURE-EVENT GATE (added 2026-05-11, Co-Exist 1.8.5):
        //    The event's start date must be in the past (data.hasHappened). The master
        //    sheet captures POST-event impact data; future-dated events (e.g. an event
        //    scheduled for 22 May syncing during an 11 May run) must not appear until
        //    after the event has occurred, even if an event_impact row exists.
        //
        // Both gates are ONLY on the append branch. UPDATE above is intentionally
        // ungated so pre-gate rows on the sheet still receive data as it arrives.
        //
        // Collectives with forms_migrated_at IS NULL are already excluded by the
        // outer migration gate; these gates only fire for migrated-collective events.
        // See ~/ecodiaos/patterns/excel-sync-collectives-migration.md.
        if (!data.hasImpactData || !data.hasHappened) {
          if (!data.hasImpactData) skippedNoImpact++
          skipped++
          console.log(`[excel-sync] skip append: event=${eid} hasImpactData=${data.hasImpactData} hasHappened=${data.hasHappened}`)
          errors.push(`INFO Event ${eid}: skipped append (hasImpactData=${data.hasImpactData} hasHappened=${data.hasHappened})`)
          continue
        }

        // Dedup check: if this event matches a Forms row on (collective, date, title), skip it.
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
        // - admin reconciliation. The warning surfaces the suspect pair so
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

  // Update existing rows. Pace each PATCH to avoid bursting the workbook write
  // lock (the cause of the 429 EditModeCannotAcquireLock storms). graphRequest
  // already retries with backoff; the inter-row delay keeps a healthy run from
  // tripping the throttle in the first place.
  for (let u = 0; u < updateRows.length; u++) {
    const { rowIndex, row } = updateRows[u]
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
    if (u < updateRows.length - 1) await sleep(250)
  }

  return { appended, updated, skipped, skippedDuplicates, skippedNoImpact, weakDedupWarnings, errors }
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
  cancelledViaSheetAbsence: number
  skippedPostCutoverMigrated: number
  errors: string[]
}> {
  const errors: string[] = []
  let synced = 0
  let skippedLegacy = 0
  let syncedFormsRows = 0
  let skippedNoCollective = 0
  const cancelledViaSheetAbsence = 0
  // Counts sheet rows skipped because their collective has flipped to
  // app-canonical mode (forms_migrated_at IS NOT NULL) and the row date is at
  // or after the cutover. Those rows shouldn't flow sheet -> DB; their app
  // counterpart owns the data and goes the other direction (DB -> sheet).
  let skippedPostCutoverMigrated = 0
  // Track event_ids observed during this run (linked-app-events + synthetic
  // events). Used by the tail reconciliation phase to flip migrated-collective
  // events that are absent from the sheet to status='cancelled'.
  const seenEventIds = new Set<string>()
  const runStartedAt = new Date()

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
      cancelledViaSheetAbsence,
      skippedPostCutoverMigrated,
      errors: [`Failed to read Excel: ${(err as Error).message}`],
    }
  }

  if (rows.length < 2) {
    return { synced, skippedLegacy, syncedFormsRows, skippedNoCollective, cancelledViaSheetAbsence, skippedPostCutoverMigrated, errors: ['No data rows in Excel'] }
  }

  // Build a collective name -> id lookup to avoid a DB query per Forms row.
  // Normalised to lowercase for case-insensitive matching against sheet values.
  // Also track forms_migrated_at per collective_id so the row processing loop
  // can skip rows that belong to a migrated collective at or after their
  // cutover date - those events are app-canonical and should not flow back
  // from sheet to DB. Tate, 4 May 2026 18:25: "only sunshine coast and
  // melbourne are syncing 4/05/2026 and onwards events to the sheet but that
  // all other collectives are syncing all events from 4/05 and beyond from
  // sheet to db".
  const collectiveNameToId = new Map<string, string>()
  const collectiveMigratedAt = new Map<string, string | null>()
  try {
    const { data: collectives } = await supabase
      .from('collectives')
      .select('id, name, forms_migrated_at')
    for (const c of (collectives ?? []) as { id: string; name: string; forms_migrated_at: string | null }[]) {
      collectiveNameToId.set(c.name.trim().toLowerCase(), c.id)
      collectiveMigratedAt.set(c.id, c.forms_migrated_at)
    }
  } catch (err) {
    errors.push(`Failed to load collectives: ${(err as Error).message}`)
    // Non-fatal - Forms rows will all land in skippedNoCollective
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
    // null is acceptable - created_by may be nullable on the events table
  }

  // Process each data row (skip header row)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const excelId = String(row[0] ?? '')
    if (!excelId) continue

    try {
      // Sync-direction audit (fork_mp14bxww_0103ed, 2026-05-11):
      // Sheet->App direction correctly scoped per:
      //   ~/ecodiaos/patterns/sheet-as-projection-sync-direction-discipline.md
      //   ~/ecodiaos/patterns/sync-back-must-filter-synthetic-from-source.md
      //
      // Row ID types on the sheet:
      //   UUID (v4 or v5) - event already exists in DB. isUuid path only updates
      //     event_impact; it never creates a new event or synthetic. Synthetic
      //     events (UUID v5) that appear on the sheet are handled safely here -
      //     they receive an impact update and are marked seenEventIds so
      //     reconciliation does not cancel them.
      //   Integer - Forms submission ID. isFormsId path runs findMatchingAppEvent
      //     (now includes synthetics as candidates) then existence guard then
      //     synthetic creation. Only this path ever creates synthetic events.
      //   Other - legacy/unrecognised; skipped.
      //
      // App->Sheet direction: syntheticEventIds set (above this loop) uses the
      // dual-signal check (created_by IS NULL OR isSyntheticFormsUuid) to skip
      // all synthetic events from the push-back path. Both directions confirmed
      // correctly scoped as of this audit.
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(excelId)
      const isFormsId = /^\d+$/.test(excelId)

      if (!isUuid && !isFormsId) {
        // Unrecognised ID format - not a UUID and not a plain integer
        skippedLegacy++
        continue
      }

      if (isUuid) {
        // App-created event or synthetic UUID v5: Excel wins on impact fields
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

        // Direct UUID row - the app event itself is on the sheet, mark seen.
        seenEventIds.add(excelId)
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
          errors.push(`${rowLabel}: no collective match for "${collectiveName}" - skipped`)
          skippedNoCollective++
          continue
        }

        // Parse date from col 2 (Excel serial number or ISO string).
        // Forms rows carry a calendar date, no time. Stamp at NOON AEST so
        // the calendar day reads correctly in every Australian timezone
        // (midnight-AEST = 22:00-AWST previous-or-same day, which flipped
        // Perth events onto the wrong calendar day in viewer-local lists).
        // Origin: Jess 2026-05-25 P1 "perth time zones didn't get fixed".
        const dateRaw = row[2]
        let dateIso: string
        if (typeof dateRaw === 'number' && dateRaw > 1000) {
          dateIso = excelSerialToDate(dateRaw) + 'T12:00:00+10:00'
        } else if (typeof dateRaw === 'string' && dateRaw.match(/\d{4}-\d{2}-\d{2}/)) {
          dateIso = dateRaw.includes('T') ? dateRaw : dateRaw + 'T12:00:00+10:00'
        } else {
          errors.push(`${rowLabel}: unparseable date "${dateRaw}" - skipped`)
          skippedLegacy++
          continue
        }

        // Migrated-collective skip: if this row belongs to a collective that
        // has flipped to app-canonical and the row date is on or after the
        // cutover, skip. The app event is the source of truth going forward;
        // sheet rows for these collectives at this date are either stale
        // imports or accidental manual writes - either way, don't pull back.
        const migratedAtForCollective = collectiveMigratedAt.get(collectiveId)
        if (migratedAtForCollective &&
            new Date(dateIso).getTime() >= new Date(migratedAtForCollective).getTime()) {
          errors.push(`INFO ${rowLabel}: collective is post-cutover migrated (${migratedAtForCollective}); skipped from-excel`)
          skippedPostCutoverMigrated++
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
            seenEventIds.add(matchedAppEventId)
            syncedFormsRows++
            continue
          }

          // App event already has event_impact (leader logged via the app
          // path, or PR #8 trigger already fired). Don't clobber. Skip the
          // synthetic write too: linkage is the source of truth now.
          errors.push(`INFO ${rowLabel}: app event ${matchedAppEventId} already has impact; skipped (linked)`)
          seenEventIds.add(matchedAppEventId)
          syncedFormsRows++
          continue
        }

        // Fallback: findMatchingAppEvent returned null. This can happen when no
        // event (app-created or synthetic) has a title+date similar enough to
        // this Forms row. Before creating a new synthetic event, do one more
        // check by exact collective+date+lower(title) match. This catches the
        // edge case where the title similarity thresholds reject a match that
        // is nonetheless the same physical event (e.g. truncated or reformatted
        // titles). Guards against duplicate synthetic event creation.
        //
        // Note: findMatchingAppEvent now includes synthetic events from previous
        // syncs as candidates (fork_mp14bxww_0103ed). The root cause of the 179
        // duplicates on 2026-05-04 (synthetic exclusion in findMatchingAppEvent
        // preventing re-sync idempotency) is fixed. This existence guard remains
        // as a belt-and-braces layer for title-similarity edge cases.
        //
        // Prevention guard added 2026-05-11 (fork_mp138va4_fe0506).
        const existenceGuardDayStart = dateIso.slice(0, 10) + 'T00:00:00.000Z'
        const existenceGuardNextDay = new Date(
          new Date(dateIso.slice(0, 10)).getTime() + 2 * 24 * 60 * 60 * 1000, // +2d window for TZ drift
        ).toISOString().slice(0, 10) + 'T00:00:00.000Z'
        const { data: existingBySignature } = await supabase
          .from('events')
          .select('id, title')
          .eq('collective_id', collectiveId)
          .gte('date_start', existenceGuardDayStart)
          .lt('date_start', existenceGuardNextDay)

        if (existingBySignature && existingBySignature.length > 0) {
          const titleLc = title.trim().toLowerCase()
          const existingMatch = (existingBySignature as { id: string; title: string }[]).find(
            e => e.title.trim().toLowerCase() === titleLc,
          )
          if (existingMatch) {
            // Found an existing event (possibly synthetic with different UUID) -
            // upsert impact onto it instead of creating a new synthetic.
            const { error: guardImpactErr } = await supabase
              .from('event_impact')
              .upsert(
                {
                  event_id: existingMatch.id,
                  attendees: attendees ?? 0,
                  rubbish_kg: rubbishKg ?? 0,
                  trees_planted: treesPlanted ?? 0,
                  logged_at: dateIso,
                  logged_by: systemUserId,
                },
                { onConflict: 'event_id' },
              )

            if (guardImpactErr) {
              errors.push(`${rowLabel}: existence-guard impact upsert failed for ${existingMatch.id}: ${guardImpactErr.message}`)
            } else {
              errors.push(`INFO ${rowLabel}: existence guard matched existing event ${existingMatch.id} (title="${existingMatch.title}"); impact updated, no new synthetic created`)
            }
            seenEventIds.add(existingMatch.id)
            syncedFormsRows++
            continue
          }
        }

        // No existing event found - safe to create a new synthetic.
        // Deterministic UUID v5 keeps re-runs idempotent.
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
          // Event was created - count the row regardless of impact failure
        }

        seenEventIds.add(syntheticId)
        syncedFormsRows++
      }
    } catch (err) {
      errors.push(`Row ${i + 1} (${excelId}): ${(err as Error).message}`)
    }
  }

  // ---- Tail reconciliation phase: PERMANENTLY REMOVED 2026-05-18 ----
  //
  // The "sheet-canonical delete propagation" phase that previously lived here
  // auto-cancelled app events whose sheet row was missing during a from-excel
  // run. It bit four times in May 2026 - the most recent on 2026-05-18 18:30
  // AEST when the collective-migration flip expanded the candidate pool and
  // the next from-excel cron silently cancelled two real events (Brisbane
  // Enoggera Hill Reservoir Nature Hike + Mornington Peninsula Balnarring
  // Tree Planting w/ MCC Landcare). Restored manually + permanent removal
  // commits here.
  //
  // Origin: Tate verbatim 2026-05-18 night - "events have been cancelling
  // and that cant keep happening... do the proper long term fix to make
  // sure events on the app dont get deleted".
  //
  // What that means in practice:
  //   * from-excel still pulls Forms-row impact data into event_impact
  //     (lines above this comment) - the useful half of the direction.
  //   * No code path in this Edge Function ever sets events.status =
  //     'cancelled' or stamps cancelled_via_sheet_sync_at. Sheet rows can be
  //     manually deleted by an admin and the corresponding app event stays
  //     untouched. Admin must cancel via the app or directly via SQL if
  //     they want the DB event gone.
  //   * cancelledViaSheetAbsence is retained in the return shape as a
  //     constant 0 for back-compat with status_board health-check probes
  //     and the excel_sync_runs schema. New deployments should ignore it.
  //
  // If the sheet-canonical delete propagation is ever needed again, it
  // MUST land behind an explicit per-collective opt-in flag plus a
  // recently-pushed-on-sheet guard tighter than 6h. See the audit at
  // ~/ecodiaos/backend/drafts/coexist-excel-sync-audit-2026-05-18.md for
  // the full failure history.

  return { synced, skippedLegacy, syncedFormsRows, skippedNoCollective, cancelledViaSheetAbsence: 0, skippedPostCutoverMigrated, errors }
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
      Deno.env.get('COEXIST_SERVICE_ROLE_KEY') ?? '',
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

    // KILL SWITCH for to-excel (sheet writes). app_settings key
    // `excel_sync_to_excel_paused` (jsonb {"paused":true} or boolean true)
    // short-circuits ALL sheet-write paths: hourly batch, per-event trigger,
    // and manual calls. from-excel (DB-only, never writes the sheet) is
    // unaffected. Purpose: to-excel does row-INDEX-based PATCHes; when multiple
    // writers (per-event trigger + hourly batch) run concurrently, or a human
    // edits the workbook, an index computed from a stale snapshot lands on a
    // shifted row and clobbers it (observed 2026-06-29: duplicate app rows +
    // overwritten Forms rows). Flip this flag true to freeze sheet writes
    // during any manual reconciliation, then clear it. Default (no row / false)
    // = normal operation.
    let toExcelPaused = false
    try {
      const { data: pauseRow } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'excel_sync_to_excel_paused')
        .maybeSingle()
      const v = (pauseRow as { value?: unknown } | null)?.value
      toExcelPaused = v === true || v === 'true'
        || (typeof v === 'object' && v !== null && (v as { paused?: unknown }).paused === true)
    } catch { /* fail open: a missing flag must not break normal sync */ }

    // For 'full' sync: from-excel FIRST (Excel is truth), then to-excel
    if (direction === 'from-excel' || direction === 'full') {
      results.fromExcel = await syncFromExcel(supabase, graphToken)
    }

    if (direction === 'to-excel' || direction === 'full') {
      if (toExcelPaused) {
        results.toExcel = { paused: true, reason: 'excel_sync_to_excel_paused flag set; sheet writes frozen' }
        console.log('[excel-sync] to-excel SKIPPED: excel_sync_to_excel_paused flag is set')
      } else {
        results.toExcel = await syncToExcel(supabase, graphToken, eventId)
      }
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
        skippedNoImpact?: number; weakDedupWarnings?: unknown[]; errors?: string[]
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
      // Non-fatal - monitoring failure shouldn't fail the sync.
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
