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
export function bentoFeatured(i: number): string {
  return i === 0 ? 'sm:col-span-2' : ''
}

export function bentoLastFill(n: number, i: number): string {
  if (i !== n - 1 || n <= 1) return ''
  // Desktop (4 cols): the featured tile adds one extra cell, so cells occupied
  // before the last tile = n. Fill the rest of that row.
  const r4 = n % 4
  const desktop = r4 === 0 ? 'sm:col-span-4' : r4 === 1 ? 'sm:col-span-3' : r4 === 2 ? 'sm:col-span-2' : 'sm:col-span-1'
  // Mobile (2 cols): featured is a single cell, so cells before last = n - 1.
  const r2 = (n - 1) % 2
  const mobile = r2 === 0 ? 'col-span-2' : ''
  return `${mobile} ${desktop}`
}
