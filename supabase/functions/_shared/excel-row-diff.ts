// Change detection for excel-sync to-excel row updates (2026-09-21).
//
// WHY THIS EXISTS. The to-excel update loop PATCHes one Microsoft Graph range
// per sheet row and paces each write by 250ms, so a full pass costs roughly
// 1.25s per row. At 108 rows that is ~135s of a ~166s run, and the run has a
// HARD ceiling: the Edge Function gateway returns 504 at 150s and the Deno
// isolate is torn down at ~201s. Measured 2026-09-21 against project
// tjutlbzekfouwsiaplbr: `shutdown` events in function_logs for the excel-sync
// function cluster at :03:21 after the :00 cron fire, and the observed
// excel_sync_runs duration ceiling is 200-205s across 11 weeks while the mean
// climbed 86s -> 166s. A run killed before it finishes writes NO row in
// excel_sync_runs, which is why 78 of 336 hourly fires over 14d left no trace
// and no error counter could ever see it (pg_cron still reports `succeeded`,
// because it only sees the async net.http_post enqueue).
//
// Re-PATCHing a row whose 28 cells already match the sheet buys nothing and
// spends the margin, so skip it.

/** Normalise one cell for comparison. Excel round-trips types: a cell written
 *  as the number 5 reads back as 5, and one written as "5" may also read back
 *  as 5, so a raw === comparison marks every row changed and the change
 *  detection silently does nothing. */
export const normCell = (v: unknown): string => String(v ?? '').trim()

/** True when `desired` differs from what the sheet already holds at that row.
 *
 *  BIASED TOWARDS "CHANGED" on purpose. A false "unchanged" silently drops real
 *  client data; a false "changed" costs one wasted PATCH. So an absent fresh row
 *  is always changed, and a cell we want non-blank where the sheet holds nothing
 *  is changed. Blank is never equal to zero, because `Number('')` is 0 and
 *  treating those as equal would skip writing a real 0 over an empty cell. */
export function rowDiffers(desired: (string | number | null)[], fresh: unknown[] | undefined): boolean {
  if (!fresh) return true
  for (let i = 0; i < desired.length; i++) {
    const a = normCell(desired[i])
    const b = normCell(fresh[i])
    if (a === b) continue
    // Numeric equality: 5, "5" and "5.0" are the same cell value.
    const na = Number(a), nb = Number(b)
    if (a !== '' && b !== '' && Number.isFinite(na) && Number.isFinite(nb) && na === nb) continue
    return true
  }
  return false
}
