import type { CSSProperties } from 'react'

/**
 * Build a CSS object-position style for a cover image given a focal point.
 *
 * Focal point columns (`cover_image_position_x`, `cover_image_position_y`) live
 * on `events` and `collectives` and are integers between 0 and 100 representing
 * percentage offsets. When values are null/undefined (older rows or queries
 * that did not select the columns) we fall back to 50/50 which mirrors the DB
 * default and the existing centre-cropped behaviour.
 *
 * Pair with `object-cover` (Tailwind) on the same `<img>` for the focal point
 * to actually take effect.
 */
export function coverImagePositionStyle(
  x: number | null | undefined,
  y: number | null | undefined,
): CSSProperties {
  const xv = typeof x === 'number' && Number.isFinite(x) ? clamp(x) : 50
  const yv = typeof y === 'number' && Number.isFinite(y) ? clamp(y) : 50
  return { objectPosition: `${xv}% ${yv}%` }
}

function clamp(n: number): number {
  if (n < 0) return 0
  if (n > 100) return 100
  return n
}
