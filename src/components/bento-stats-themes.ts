/**
 * Legacy bento theme exports - kept for any external consumers but
 * lives in its own module (not bento-stats.tsx) so that fast-refresh
 * works on BentoStatCard / BentoStatGrid.
 */

export type BentoTheme = string

export function bentoBoldTheme(_i: number): BentoTheme {
  return 'moss'
}

export function bentoMixedTheme(_i: number): BentoTheme {
  return 'moss-soft'
}
