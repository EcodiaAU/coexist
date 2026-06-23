/**
 * Bento helpers for a full-bleed, flush, flat-bottomed grid.
 *
 * 2 cols on mobile, 3 on desktop. For real bento variety some desktop tiles are
 * 2x2 features; the rest are 1x1, and the LAST tile is widened to fill the rest
 * of its row so the grid always ends on a flat edge. We simulate CSS sparse
 * auto-placement so the spans never leave holes and the bottom is always flat,
 * for any tile count.
 */

// Shared grid sizing. 1x1 tiles are big; 2x2 features are large. Bump here.
export const BENTO_GRID =
  'grid auto-rows-[58vw] grid-cols-2 sm:auto-rows-[18rem] sm:grid-cols-3'

const COLS = 3

/**
 * Returns a span className per tile (length n). Desktop spans use sm:; mobile is
 * a plain 2-col grid (the sm: spans don't apply) with the last tile filling its
 * row.
 */
export function bentoSpans(n: number): string[] {
  const occ: boolean[][] = []
  const ensure = (r: number) => {
    while (occ.length <= r) occ.push(new Array(COLS).fill(false))
  }
  const free = (r: number, c: number) => {
    ensure(r)
    return !occ[r][c]
  }
  const fill = (r: number, c: number, w: number, h: number) => {
    for (let dr = 0; dr < h; dr++) {
      ensure(r + dr)
      for (let dc = 0; dc < w; dc++) occ[r + dr][c + dc] = true
    }
  }

  const out: string[] = new Array(n).fill('sm:col-span-1')
  let r = 0
  let c = 0
  const advance = () => {
    // move to the next free cell, scanning row-major
    while (true) {
      c++
      if (c >= COLS) {
        c = 0
        r++
      }
      if (free(r, c)) return
    }
  }
  // start at first free
  ensure(0)

  for (let i = 0; i < n; i++) {
    // make sure (r,c) is free (it should be)
    while (!free(r, c)) advance()
    const isLast = i === n - 1
    const colsLeft = COLS - c
    // A 2x2 feature at every fresh row start (the geometry naturally spaces them
    // ~2 rows apart), as long as enough tiles remain to keep the bottom flat.
    const wantBig = c === 0 && !isLast && n - i >= 4 && colsLeft >= 2

    if (wantBig) {
      fill(r, c, 2, 2)
      out[i] = 'sm:col-span-2 sm:row-span-2'
    } else if (isLast) {
      fill(r, c, colsLeft, 1)
      out[i] = colsLeft >= 3 ? 'sm:col-span-3' : colsLeft === 2 ? 'sm:col-span-2' : 'sm:col-span-1'
    } else {
      fill(r, c, 1, 1)
      out[i] = 'sm:col-span-1'
    }
    if (i < n - 1) advance()
  }

  // Mobile (2 cols): all tiles are 1x1; widen the last so its row is full.
  if (n > 1 && (n - 1) % 2 === 0) out[n - 1] = `col-span-2 ${out[n - 1]}`

  return out
}
