// Collective-name matching for the excel-sync Edge Function.
//
// Forms leaders type a collective name free-hand into sheet col-3. Those strings
// drift from the canonical `collectives.name` in the DB in three ways:
//   1. Punctuation / hyphenation: "North-East Victoria" vs "North East Victoria".
//   2. Spacing / casing: "  melbourne  ", "MELBOURNE", "north  east   victoria".
//   3. A genuinely different label for the same collective: "Melbourne" on the
//      Form vs "Melbourne City" in the DB. Case (3) needs an explicit alias.
//
// Before 2026-08-17 the matcher lowercased + trimmed only, so (1) and (3) both
// fell through to "no collective match - skipped", silently dropping every Forms
// row for those collectives on every 30-min from-excel run (jobid 9). Grounded
// probe of excel_sync_runs on 2026-08-17: 11 rows/run skipping - 8x "Melbourne",
// 1x "North-East Victoria", 1x "Wild Mountains", 1x "Myall Park". See
// status_board f96b9058-7302-4fbf-ad5a-00a1d72dc0f7.
//
// The fix: one normaliser applied identically to the alias keys, the DB-name
// lookup keys, and the incoming sheet value, plus a "melbourne" alias for the
// label mismatch that normalisation cannot bridge. "Wild Mountains" and
// "Myall Park" have no matching collective and are left to fail closed (a
// coordinator decision, never a guessed mapping).

// Canonical alias registry. Key = a divergent sheet label; value = the canonical
// collective UUID it resolves to. This module is the single source of truth for
// the alias map. Mirror any change into backend/clients/coexist.md "Collective
// Aliases" per ~/ecodiaos/patterns/excel-sync-collectives-migration.md:
//   1. Confirm the target UUID against the live `collectives` table.
//   2. Add the entry below.
//   3. Mirror the row into clients/coexist.md.
//   4. Redeploy this Edge Function.
export const COLLECTIVE_ALIASES: Record<string, string> = {
  // Legacy fold. Predates a standalone "Byron Bay" collective now in the DB
  // (b889ebb8-6b59-418d-98a9-770f1caef999). Because aliases win over the DB-name
  // lookup, incoming "Byron Bay" still routes to Northern Rivers. Whether that is
  // still desired is a coordinator decision - left unchanged here on purpose.
  'byron bay': '9a2f9919-26b9-420d-b6f5-ddeb9a37b1b3', // -> Northern Rivers
  // The DB collective is named "Melbourne City"; this alias is redundant with the
  // direct name lookup but kept explicit as documentation of the pairing.
  'melbourne city': 'b6cae731-d6bf-4bf1-9640-0117feaa3755', // -> Melbourne City
  // Leaders write plain "Melbourne" on the Form; the DB name is "Melbourne City".
  // Added 2026-08-17 after the grounded probe found 8 "Melbourne" rows skipping
  // every run. Normalisation cannot bridge a one-word vs two-word label, so this
  // is an explicit alias.
  'melbourne': 'b6cae731-d6bf-4bf1-9640-0117feaa3755', // -> Melbourne City
}

/**
 * Normalise a collective name for matching. Lowercase, fold hyphens / dashes and
 * any stray punctuation to a single space, collapse runs of whitespace, trim.
 * Applied identically to the alias keys, the DB-name lookup keys, and the
 * incoming sheet value so all three compare on the same footing.
 *
 * "North-East Victoria" and "North East Victoria" both fold to
 * "north east victoria"; "  MELBOURNE  " folds to "melbourne".
 */
export function normaliseCollectiveName(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    // Any run of non-alphanumeric, non-whitespace chars (hyphens, en/em dashes,
    // apostrophes, commas, ...) becomes a single space. \p{L}\p{N} keep letters
    // and numbers including accents. Requires the u flag.
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Alias map keyed by the normalised form, built once from COLLECTIVE_ALIASES so
// the keys pass through the exact same normaliser as the DB names and inputs.
export const COLLECTIVE_ALIASES_NORMALISED: Record<string, string> = Object.fromEntries(
  Object.entries(COLLECTIVE_ALIASES).map(([k, v]) => [normaliseCollectiveName(k), v]),
)

/**
 * Resolve a raw sheet collective name to a canonical collective UUID, or
 * undefined when it matches neither an alias nor a DB collective name.
 *
 * `nameToId` MUST be keyed by normaliseCollectiveName(collective.name) so the
 * lookup keys and the query key share one normalisation. An alias wins over the
 * DB-name lookup so legacy divergent labels keep resolving to their historical
 * target.
 */
export function resolveCollectiveId(
  rawName: string,
  nameToId: Map<string, string>,
): string | undefined {
  const key = normaliseCollectiveName(rawName)
  if (!key) return undefined
  return COLLECTIVE_ALIASES_NORMALISED[key] ?? nameToId.get(key)
}
