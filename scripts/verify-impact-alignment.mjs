// Verify that the v57 fix to fetchImpactRows produces matching trees totals across
// the surfaces. This mimics the post-v57 logic for /admin's national all-time call
// and prints the same numbers /admin/impact computes internally.
//
// Reads VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY from .env.production.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '..', '.env.production')
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
    }),
)

const SUPABASE_URL = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !ANON) {
  console.error('missing supabase env')
  process.exit(1)
}

const BASELINE_TREES = 36_637

async function rest(pathWithQuery, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${pathWithQuery}`, {
    ...opts,
    headers: {
      apikey: ANON,
      authorization: `Bearer ${ANON}`,
      accept: 'application/json',
      ...(opts.headers || {}),
    },
  })
  if (!r.ok) {
    const text = await r.text()
    throw new Error(`${r.status} ${pathWithQuery}: ${text.slice(0, 200)}`)
  }
  return r.json()
}

const now = new Date().toISOString()
const baselineDate = new Date('2026-01-01').toISOString()

// ── Mimic the POST-FIX third else branch (includeLegacy=true, no collectiveId)
// All events (any status) lt date_start=now, NO baselineDate floor.
const allEventsAllStatus = await rest(
  `events?select=id&date_start=lt.${now}`,
)
const allEventsLiveStatus = await rest(
  `events?select=id&date_start=lt.${now}&status=in.(published,completed)`,
)
const eventCountPublished = allEventsLiveStatus.length
const allEventIds = allEventsAllStatus.map((e) => e.id)

console.log('events_all_status:', allEventsAllStatus.length)
console.log('events_published_or_completed:', eventCountPublished)

// Step 2: fetch event_impact rows for ALL those event ids, split live vs legacy.
async function fetchImpactForIds(ids) {
  const out = []
  const CHUNK = 200
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK)
    const idsCsv = slice.join(',')
    const rows = await rest(
      `event_impact?select=event_id,trees_planted,attendees,rubbish_kg,hours_total,notes&event_id=in.(${idsCsv})`,
    )
    out.push(...rows)
  }
  return out
}

const allImpact = await fetchImpactForIds(allEventIds)
const liveRows = allImpact.filter((r) => !r.notes || !r.notes.startsWith('Legacy import:'))
const legacyRows = allImpact.filter((r) => r.notes && r.notes.startsWith('Legacy import:'))

const sum = (rows, k) => rows.reduce((acc, r) => acc + (Number(r[k]) || 0), 0)

const liveTrees = sum(liveRows, 'trees_planted')
const legacyTrees = sum(legacyRows, 'trees_planted')

// applyBaselineRemainder for all-time national: addBaseline=true
const remainder = Math.max(0, BASELINE_TREES - legacyTrees)
const adminTotalTrees = liveTrees + legacyTrees + remainder

console.log('\n── trees alignment (national all-time) ──')
console.log('  liveTrees (live event_impact):       ', liveTrees)
console.log('  legacyTrees (legacy import rows):    ', legacyTrees)
console.log('  BASELINE_TREES (constant):           ', BASELINE_TREES)
console.log('  remainder = max(0, BASELINE - legacy):', remainder)
console.log('  TOTAL (live + legacy + remainder):   ', adminTotalTrees)

// Compare to pre-fix behaviour (third else still applied baselineDate floor,
// so legacyRows was always 0 even with includeLegacy=true).
const preFixTotal = liveTrees + 0 + BASELINE_TREES
console.log('\n── pre-fix behaviour (for comparison) ──')
console.log('  pre-fix /admin total (live + BASELINE_TREES):', preFixTotal)
console.log('  delta this fix recovers:                     ', adminTotalTrees - preFixTotal)

// Event count math (matches use-admin-dashboard.ts post-v56)
const liveEventIdsWithImpact = new Set(liveRows.map((r) => r.event_id))
const legacyEventIdSet = new Set(legacyRows.map((r) => r.event_id))
const uniqueEventCount = new Set([...liveEventIdsWithImpact, ...legacyEventIdSet]).size
const BASELINE_EVENTS = 340
const eventsRemainder = Math.max(0, BASELINE_EVENTS - legacyEventIdSet.size)
console.log('\n── events alignment ──')
console.log('  uniqueEventCount (live + legacy ids with impact):', uniqueEventCount)
console.log('  legacy event ids with impact:                    ', legacyEventIdSet.size)
console.log('  events remainder = max(0, 340 - legacy.size):    ', eventsRemainder)
console.log('  totalEvents shown on /admin:                     ', uniqueEventCount + eventsRemainder)
