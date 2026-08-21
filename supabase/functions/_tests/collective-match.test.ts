// Unit tests for the excel-sync collective-name matcher (2026-08-17).
// Run: deno test supabase/functions/_tests/collective-match.test.ts
//
// Each assertion is grounded in the live skip list probed from excel_sync_runs
// on 2026-08-17 (11 rows/run hitting "no collective match - skipped"):
//   8x "Melbourne"           (Forms IDs 59,68,77,93,98,116,123,135)
//   1x "North-East Victoria" (Forms ID 233)
//   1x "Wild Mountains"      (Forms ID 231)  -> no collective, coordinator decision
//   1x "Myall Park"          (Forms ID 239)  -> no collective, coordinator decision
// See status_board f96b9058-7302-4fbf-ad5a-00a1d72dc0f7.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  normaliseCollectiveName,
  resolveCollectiveId,
} from '../_shared/collective-match.ts'

// Canonical (id, name) rows exactly as they exist in the live `collectives`
// table on 2026-08-17. The matcher keys nameToId by the SAME normaliser the
// Edge Function uses, so this mirror faithfully exercises the real path.
const MELBOURNE_CITY = 'b6cae731-d6bf-4bf1-9640-0117feaa3755'
const NORTH_EAST_VIC = '4ceed5af-9d9e-4378-a3bd-a706d46750d5'
const NORTHERN_RIVERS = '9a2f9919-26b9-420d-b6f5-ddeb9a37b1b3'
const BRISBANE = '067ff792-8406-4ed9-8192-0a5b4fb04f70'

const DB_COLLECTIVES: [string, string][] = [
  [MELBOURNE_CITY, 'Melbourne City'],
  [NORTH_EAST_VIC, 'North East Victoria'],
  [NORTHERN_RIVERS, 'Northern Rivers'],
  ['b889ebb8-6b59-418d-98a9-770f1caef999', 'Byron Bay'],
  [BRISBANE, 'Brisbane'],
]
const nameToId = new Map(
  DB_COLLECTIVES.map(([id, name]) => [normaliseCollectiveName(name), id]),
)

Deno.test('the 8 "Melbourne" rows now resolve via the melbourne alias -> Melbourne City', () => {
  assertEquals(resolveCollectiveId('Melbourne', nameToId), MELBOURNE_CITY)
})

Deno.test('"North-East Victoria" now resolves via normalisation -> North East Victoria', () => {
  assertEquals(resolveCollectiveId('North-East Victoria', nameToId), NORTH_EAST_VIC)
})

Deno.test('normalisation tolerates casing, double-spaces and trailing punctuation', () => {
  assertEquals(resolveCollectiveId('  MELBOURNE  ', nameToId), MELBOURNE_CITY)
  assertEquals(resolveCollectiveId('north   east   victoria', nameToId), NORTH_EAST_VIC)
  assertEquals(resolveCollectiveId('North East Victoria.', nameToId), NORTH_EAST_VIC)
  assertEquals(resolveCollectiveId('Melbourne City', nameToId), MELBOURNE_CITY)
})

Deno.test('an exact DB name resolves directly, no alias needed', () => {
  assertEquals(resolveCollectiveId('Brisbane', nameToId), BRISBANE)
})

Deno.test('the two unmatched collectives fail closed (coordinator decision, never a guessed map)', () => {
  assertEquals(resolveCollectiveId('Wild Mountains', nameToId), undefined)
  assertEquals(resolveCollectiveId('Myall Park', nameToId), undefined)
})

Deno.test('a deliberately bogus name and an empty name return undefined (no over-matching)', () => {
  assertEquals(resolveCollectiveId('Totally Not A Collective 12345', nameToId), undefined)
  assertEquals(resolveCollectiveId('', nameToId), undefined)
  assertEquals(resolveCollectiveId('   ', nameToId), undefined)
})

Deno.test('the byron bay alias still wins over the standalone Byron Bay collective (documented legacy behaviour)', () => {
  // Pinned so a future coordinator decision to re-point Byron Bay is a conscious
  // change, not an accidental drift.
  assertEquals(resolveCollectiveId('Byron Bay', nameToId), NORTHERN_RIVERS)
})

Deno.test('normaliseCollectiveName folds hyphens/punctuation and collapses whitespace', () => {
  assertEquals(normaliseCollectiveName('North-East  Victoria'), 'north east victoria')
  assertEquals(normaliseCollectiveName("O'Malley - Park"), 'o malley park')
  assertEquals(normaliseCollectiveName('  Gold   Coast  '), 'gold coast')
})
