#!/usr/bin/env node
/**
 * generate-legacy-import-sql.mjs
 *
 * Reads the legacy Co-Exist Excel spreadsheets and generates a SQL migration
 * that inserts historical events + event_impact rows into Supabase.
 *
 * Uses subqueries to resolve collective IDs and user IDs at runtime,
 * so it works against any environment (local dev, staging, production).
 *
 * Usage:  node scripts/generate-legacy-import-sql.mjs
 * Output: supabase/migrations/071_import_legacy_impact_data.sql
 */

import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createHash } from 'crypto'
import XLSX from 'xlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA = join(ROOT, 'data')
const OUT = join(ROOT, 'supabase', 'migrations', '071_import_legacy_impact_data.sql')

/* ------------------------------------------------------------------ */
/*  Collective name → slug mapping                                     */
/*                                                                     */
/*  Maps spreadsheet collective names to the slug column in the        */
/*  collectives table. The SQL uses:                                   */
/*    (SELECT id FROM collectives WHERE slug = '<slug>' LIMIT 1)       */
/* ------------------------------------------------------------------ */

const COLLECTIVE_SLUG_MAP = {
  'byron bay':            'byron-bay',
  'byron':                'byron-bay',
  'sydney':               'sydney',
  'melbourne':            'melbourne',
  'melbourne city':       'melbourne',
  'melb':                 'melbourne',
  'mornington peninsula': 'melbourne',
  'gold coast':           'gold-coast',
  'sunshine coast':       'sunshine-coast',
  'brisbane':             'brisbane',
  'adelaide':             'adelaide',
  'perth':                'perth',
  'hobart':               'hobart',
  'cairns':               'cairns',
  'newcastle':            'newcastle',
  'wollongong':           'wollongong',
  'canberra':             'canberra',
  'geelong':              'melbourne',
  'ipswich':              'brisbane',
  'townsville':           'cairns',
}

/* ------------------------------------------------------------------ */
/*  Activity type mapping                                              */
/* ------------------------------------------------------------------ */

function mapActivityType(type, subtype, title) {
  const t = ((type || '') + ' ' + (subtype || '') + ' ' + (title || '')).toLowerCase()
  if (/beach\s*clean|shore\s*clean|coast.*clean|litter/.test(t)) return 'shore_cleanup'
  if (/tree\s*plant|planting/.test(t)) return 'tree_planting'
  if (/weed|bush\s*regen|habitat|regen|bushcare|restor/.test(t)) return 'land_regeneration'
  if (/hike|walk|nature\s*hik|spotlighting|spotlight|falls/.test(t)) return 'nature_walk'
  if (/camp\s*out|campout/.test(t)) return 'camp_out'
  if (/retreat/.test(t)) return 'retreat'
  if (/film|screen/.test(t)) return 'film_screening'
  if (/marine|dune\s*brush|mangrove|coral|reef|snorkel/.test(t)) return 'marine_restoration'
  if (/clean\s*up|cleanup/.test(t)) return 'shore_cleanup'
  return 'workshop'
}

/* ------------------------------------------------------------------ */
/*  Deterministic UUID v5 (sha1-based)                                 */
/* ------------------------------------------------------------------ */

const UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

function uuid5(name) {
  const hash = createHash('sha1')
    .update(Buffer.from(UUID_NAMESPACE.replace(/-/g, ''), 'hex'))
    .update(name)
    .digest('hex')
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '5' + hash.slice(13, 16),
    ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-')
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function resolveCollectiveSlug(name) {
  if (!name) return null
  const key = name.toString().trim().toLowerCase()
    .replace(/\s*collective\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return COLLECTIVE_SLUG_MAP[key] || null
}

function parseDate(val) {
  if (!val) return null
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val)
    if (d) return new Date(d.y, d.m - 1, d.d, 8, 0, 0)
  }
  const s = val.toString().trim()
  const auMatch = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (auMatch) {
    const day = parseInt(auMatch[1])
    const month = parseInt(auMatch[2]) - 1
    let year = parseInt(auMatch[3])
    if (year < 100) year += 2000
    return new Date(year, month, day, 8, 0, 0)
  }
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d
  return null
}

function safeNum(val) {
  if (val == null || val === '' || val === '-') return null
  const s = val.toString().replace(/[,\s]/g, '').replace(/kg|tonnes?|t$/i, '')
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

function safeInt(val) {
  const n = safeNum(val)
  return n != null ? Math.round(n) : null
}

function esc(str) {
  if (str == null) return 'NULL'
  return "'" + str.toString().replace(/'/g, "''").replace(/\\/g, '\\\\') + "'"
}

function num(val) {
  return val == null ? 'NULL' : val.toString()
}

/* ------------------------------------------------------------------ */
/*  Read + parse workbooks                                             */
/* ------------------------------------------------------------------ */

console.log('Reading Excel files...')

const masterWb = XLSX.readFile(join(DATA, 'Master Impact Data Sheet.xlsx'))
const eventsWb = XLSX.readFile(join(DATA, 'Events & Impact 23-25.xlsx'))

const postEventSheet = masterWb.Sheets['Post Event Review']
const postEventRows = XLSX.utils.sheet_to_json(postEventSheet, { defval: '' })
console.log(`  Post Event Review: ${postEventRows.length} rows`)

const events2024Rows = eventsWb.Sheets['2024'] ? XLSX.utils.sheet_to_json(eventsWb.Sheets['2024'], { defval: '' }) : []
const events2025Rows = eventsWb.Sheets['2025'] ? XLSX.utils.sheet_to_json(eventsWb.Sheets['2025'], { defval: '' }) : []
console.log(`  Events & Impact 2024: ${events2024Rows.length} rows`)
console.log(`  Events & Impact 2025: ${events2025Rows.length} rows`)

/* ------------------------------------------------------------------ */
/*  Collect all event records                                          */
/* ------------------------------------------------------------------ */

/**
 * Each record stores the raw data. We'll generate per-row INSERT statements
 * with subqueries so collective_id and created_by resolve at runtime.
 */
const records = []
const insertedSigs = new Set()
let skipped = 0
const unmatchedCollectives = new Set()

console.log('\nProcessing Post Event Review...')

for (const row of postEventRows) {
  const title = (row['Event Title'] || row['Event title'] || '').toString().trim()
  const dateRaw = row['Date of Event'] || row['Date'] || row['date'] || ''
  const collectiveRaw = (row['Collective'] || row['collective'] || '').toString().trim()
  const location = (row['Location'] || row['location'] || '').toString().trim()
  const postcode = (row['Postcode'] || row['postcode'] || '').toString().trim()
  const attendance = safeInt(row['Number of Attendees'] || row['Attendance'] || row['attendance'])
  const eventType = (row['Type of Event'] || '').toString()
  const consType = (row['Type of Conservation Event'] || row['Type of Conservation event'] || '').toString()
  const rubbishKg = safeNum(row['Amount of Rubbish Removed (kg\'s)'] || row['Amount of Rubbish Removed (kgs)'] || row['Rubbish Removed'] || row['Litter Removed'])
  const treesPlanted = safeInt(row['Trees Planted'] || row['trees planted'])
  const weeds = safeInt(row['Weeds'] || row['weeds'])
  const highlights = (row['Outstanding Highlights'] || row['Highlights'] || '').toString().trim()
  const issues = (row['Any Issues'] || row['Issues'] || '').toString().trim()
  const grantProject = (row['Grant Project'] || '').toString().trim()

  if (!title || !dateRaw) { skipped++; continue }

  const date = parseDate(dateRaw)
  if (!date) { skipped++; continue }

  const slug = resolveCollectiveSlug(collectiveRaw)
  if (!slug) {
    if (collectiveRaw) unmatchedCollectives.add(collectiveRaw)
    skipped++
    continue
  }

  const address = [location, postcode].filter(Boolean).join(' ')
  const activityType = mapActivityType(eventType, consType, title)

  const sig = `${date.toISOString().slice(0, 10)}|${slug}|${title.toLowerCase().slice(0, 40)}`
  if (insertedSigs.has(sig)) continue
  insertedSigs.add(sig)

  const noteParts = [`Legacy import: ${attendance ?? '?'} attendees`]
  if (highlights) noteParts.push(`Highlights: ${highlights}`)
  if (issues) noteParts.push(`Issues: ${issues}`)
  if (grantProject) noteParts.push(`Grant: ${grantProject}`)

  records.push({
    sig,
    slug,
    title,
    activityType,
    address: address || null,
    dateIso: date.toISOString().replace('Z', '+10:00'),
    dateEnd: new Date(date.getTime() + 4 * 60 * 60 * 1000).toISOString().replace('Z', '+10:00'),
    treesPlanted,
    rubbishKg,
    weeds,
    notes: noteParts.join('. '),
    customMetrics: null,
  })
}

console.log(`  Events from Post Event Review: ${records.length}`)
console.log(`  Skipped: ${skipped}`)
if (unmatchedCollectives.size > 0) {
  console.log(`  Unmatched collectives: ${[...unmatchedCollectives].join(', ')}`)
}

/* ── Supplementary 2024/2025 rows ── */

console.log('\nProcessing Events & Impact 2024/2025 supplements...')
let supplementAdded = 0

function processSupplementRow(row) {
  const title = (row['Event'] || row['event'] || '').toString().trim()
  const dateRaw = row['Date'] || row['date'] || ''
  const collectiveRaw = (row['Collective'] || row['collective'] || '').toString().trim()
  const location = (row['Location'] || row['location'] || '').toString().trim()
  const attendance = safeInt(row['Attendance'] || row['attendance'] || row['Sign in #\'s'])
  const rubbishKg = safeNum(row['Litter Removed'] || row['litter removed'] || row['Litter removed'])
  const treesPlanted = safeInt(row['Trees Planted'] || row['trees planted'] || row['Trees planted'])
  const weeds = safeInt(row['Weeds'] || row['weeds'])
  const contractorCost = safeNum(row['Contractor Cost'] || row['contractor cost'])

  if (!title) return
  const date = parseDate(dateRaw)
  if (!date) return

  const slug = resolveCollectiveSlug(collectiveRaw)
  if (!slug) {
    if (collectiveRaw) unmatchedCollectives.add(collectiveRaw)
    return
  }

  const activityType = mapActivityType('', '', title)
  const sig = `${date.toISOString().slice(0, 10)}|${slug}|${title.toLowerCase().slice(0, 40)}`
  if (insertedSigs.has(sig)) return
  insertedSigs.add(sig)

  const hasImpact = rubbishKg || treesPlanted || weeds || attendance
  if (!hasImpact) return

  records.push({
    sig,
    slug,
    title,
    activityType,
    address: location || null,
    dateIso: date.toISOString().replace('Z', '+10:00'),
    dateEnd: new Date(date.getTime() + 4 * 60 * 60 * 1000).toISOString().replace('Z', '+10:00'),
    treesPlanted,
    rubbishKg,
    weeds,
    notes: `Legacy import: ${attendance ?? '?'} attendees`,
    customMetrics: contractorCost ? JSON.stringify({ contractor_cost: contractorCost }) : null,
  })

  supplementAdded++
}

for (const row of events2024Rows) processSupplementRow(row)
for (const row of events2025Rows) processSupplementRow(row)

console.log(`  Supplementary events added: ${supplementAdded}`)
console.log(`  Total records: ${records.length}`)

if (unmatchedCollectives.size > 0) {
  console.log(`\n  All unmatched collectives: ${[...unmatchedCollectives].join(', ')}`)
}

/* ------------------------------------------------------------------ */
/*  Generate SQL - individual INSERT statements with subqueries        */
/* ------------------------------------------------------------------ */

console.log('\nGenerating SQL migration...')

const lines = []

lines.push(`-- 071_import_legacy_impact_data.sql`)
lines.push(`-- Generated by scripts/generate-legacy-import-sql.mjs`)
lines.push(`-- One-time import of legacy Co-Exist impact data (2022-2026)`)
lines.push(`-- Source: data/Master Impact Data Sheet.xlsx, data/Events & Impact 23-25.xlsx`)
lines.push(`--`)
lines.push(`-- Total records: ${records.length}`)
lines.push(`-- Generated: ${new Date().toISOString()}`)
lines.push(``)
lines.push(`BEGIN;`)
lines.push(``)
lines.push(`-- ─────────────────────────────────────────────────────────────────────`)
lines.push(`-- Resolve the import user: first super_admin by created_at.`)
lines.push(`-- This avoids hardcoding a UUID that only exists in seed data.`)
lines.push(`-- ─────────────────────────────────────────────────────────────────────`)
lines.push(``)
lines.push(`DO $$`)
lines.push(`DECLARE`)
lines.push(`  _user_id uuid;`)
lines.push(`  _coll_id uuid;`)
lines.push(`  _event_id uuid;`)
lines.push(`  _impact_id uuid;`)
lines.push(`BEGIN`)
lines.push(``)
lines.push(`-- Pick the first super_admin as the import user`)
lines.push(`SELECT p.id INTO _user_id`)
lines.push(`  FROM profiles p`)
lines.push(`  WHERE p.role = 'super_admin'`)
lines.push(`  ORDER BY p.created_at`)
lines.push(`  LIMIT 1;`)
lines.push(``)
lines.push(`IF _user_id IS NULL THEN`)
lines.push(`  RAISE EXCEPTION 'No super_admin user found - cannot attribute legacy imports';`)
lines.push(`END IF;`)
lines.push(``)

for (const rec of records) {
  const eventId = uuid5(`coexist-event:${rec.sig}`)
  const impactId = uuid5(`coexist-impact:${rec.sig}`)

  lines.push(`-- ${rec.title} (${rec.dateIso.slice(0, 10)}, ${rec.slug})`)
  lines.push(`SELECT id INTO _coll_id FROM collectives WHERE slug = ${esc(rec.slug)} LIMIT 1;`)
  lines.push(`IF _coll_id IS NOT NULL THEN`)
  lines.push(`  _event_id := ${esc(eventId)}::uuid;`)
  lines.push(`  _impact_id := ${esc(impactId)}::uuid;`)
  lines.push(`  INSERT INTO events (id, collective_id, created_by, title, activity_type, address, date_start, date_end, status, created_at)`)
  lines.push(`    VALUES (_event_id, _coll_id, _user_id, ${esc(rec.title)}, ${esc(rec.activityType)}, ${esc(rec.address)}, ${esc(rec.dateIso)}, ${esc(rec.dateEnd)}, 'completed', ${esc(rec.dateIso)})`)
  lines.push(`    ON CONFLICT (id) DO NOTHING;`)

  const cmVal = rec.customMetrics ? esc(rec.customMetrics) + '::jsonb' : "'{}'::jsonb"
  lines.push(`  INSERT INTO event_impact (id, event_id, logged_by, trees_planted, rubbish_kg, invasive_weeds_pulled, notes, logged_at, custom_metrics)`)
  lines.push(`    VALUES (_impact_id, _event_id, _user_id, ${num(rec.treesPlanted)}, ${num(rec.rubbishKg)}, ${num(rec.weeds)}, ${esc(rec.notes)}, ${esc(rec.dateIso)}, ${cmVal})`)
  lines.push(`    ON CONFLICT (id) DO NOTHING;`)
  lines.push(`END IF;`)
  lines.push(``)
}

lines.push(`END $$;`)
lines.push(``)
lines.push(`COMMIT;`)

writeFileSync(OUT, lines.join('\n'), 'utf-8')
console.log(`\nDone! Migration written to:`)
console.log(`  ${OUT}`)
console.log(`  ${records.length} event+impact record pairs`)
