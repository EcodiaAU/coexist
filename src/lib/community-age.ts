/**
 * Co-Exist is a community for under-30s. Anyone 30 or older who signs up sees
 * a friendly heads-up beside their date of birth (Tate, iMessage 2026-10-06).
 *
 * Informational only: it is NOT an age gate. It never feeds canSubmit, so an
 * over-30 still creates their account exactly as before. The only hard age
 * rule on signup stays the 18+ check.
 */
export const COMMUNITY_AGE_CEILING = 30

export function isAtOrOverCommunityAge(age: number | null | undefined): boolean {
  return typeof age === 'number' && age >= COMMUNITY_AGE_CEILING
}
