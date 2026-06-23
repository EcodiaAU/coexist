/**
 * Bento helpers for a full-bleed, flush, flat-bottomed grid.
 *
 * The grid is 2 cols on mobile, 4 on desktop, with fixed row height. The first
 * tile is wide on desktop (a visual anchor). The LAST tile is widened to fill
 * the remainder of its row, so the grid always ends on a flat edge with no gap
 * before the next section. We deliberately do NOT use grid-flow-dense: with only
 * the first tile spanning, tiles flow in order with no internal holes, which
 * keeps the last-tile math exact.
 *
 * n = total number of tiles in the grid.
 */

// Shared grid sizing for all three bento pages. 2 cols on mobile, 3 on desktop
// (bigger, less crowded tiles). Bump the auto-rows values here to size them.
export const BENTO_GRID =
  'grid auto-rows-[64vw] grid-cols-2 sm:auto-rows-[24rem] sm:grid-cols-3'

export function bentoFeatured(i: number): string {
  return i === 0 ? 'sm:col-span-2' : ''
}

export function bentoLastFill(n: number, i: number): string {
  if (i !== n - 1 || n <= 1) return ''
  // Desktop (3 cols): the featured tile adds one extra cell, so cells occupied
  // before the last tile = n. Fill the rest of that row.
  const r3 = n % 3
  const desktop = r3 === 0 ? 'sm:col-span-3' : r3 === 1 ? 'sm:col-span-2' : 'sm:col-span-1'
  // Mobile (2 cols): featured is a single cell, so cells before last = n - 1.
  const r2 = (n - 1) % 2
  const mobile = r2 === 0 ? 'col-span-2' : ''
  return `${mobile} ${desktop}`
}
