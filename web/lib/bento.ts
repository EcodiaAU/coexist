/**
 * Bento helpers for a full-bleed, flush, flat-bottomed grid.
 *
 * 2 cols on mobile, 3 on desktop. The layout is built from rectangular blocks
 * that each tile a clean 3-wide region, cycled for variety: big-left, big-right,
 * and an all-small row. Every block ends on a flat edge, so the grid bottom is
 * always flat. The desktop spans rely on CSS sparse auto-placement, so the tile
 * EMISSION ORDER below matches row-major fill. Mobile is a plain 2-col grid (the
 * sm: spans don't apply) with the last tile widened to keep its row full.
 *
 * n = total number of tiles.
 */

export const BENTO_GRID =
  'grid auto-rows-[58vw] grid-cols-2 sm:auto-rows-[18rem] sm:grid-cols-3'

const BIG = 'sm:col-span-2 sm:row-span-2'
const ONE = 'sm:col-span-1'

// Each template consumes 3 tiles and fills a 3-col region. Emission order is
// row-major so sparse placement lands them exactly.
const BIG_LEFT = [BIG, ONE, ONE] //  [ BIG ][s] with [s] under the right column
const BIG_RIGHT = [ONE, BIG, ONE] //  [s][ BIG ] with [s] under the left column
const ALL_SMALL = [ONE, ONE, ONE]
const CYCLE = [BIG_LEFT, ALL_SMALL, BIG_RIGHT, ALL_SMALL, BIG_RIGHT, BIG_LEFT]

export function bentoSpans(n: number): string[] {
  if (n <= 0) return []
  const out: string[] = []
  const fullBlocks = Math.floor(n / 3)
  for (let bk = 0; bk < fullBlocks; bk++) {
    const tpl = CYCLE[bk % CYCLE.length]
    out.push(tpl[0], tpl[1], tpl[2])
  }
  const tail = n % 3
  for (let k = 0; k < tail; k++) out.push(ONE)

  // Tail's last tile fills the rest of its (fresh) row so the bottom stays flat.
  if (tail > 0) {
    const colOfLast = (tail - 1) % 3
    const fill = 3 - colOfLast
    out[n - 1] = fill === 3 ? 'sm:col-span-3' : fill === 2 ? 'sm:col-span-2' : 'sm:col-span-1'
  }

  // Mobile (2 cols): widen the last tile if its row would otherwise be half-empty.
  if (n > 1 && (n - 1) % 2 === 0) out[n - 1] = `col-span-2 ${out[n - 1]}`

  return out
}
