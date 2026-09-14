/**
 * The two pure decisions behind onboarding's collective step.
 *
 * They live here rather than inline in onboarding.tsx because the bug they
 * exist to prevent is invisible on screen: the step used to hold a single
 * `selectedId`, so tapping a second collective REPLACED the first and the only
 * feedback was a check badge quietly moving. A user at a Co-Exist event picked
 * the three Queensland collectives, was joined to one, and the Brisbane event
 * he came to sign in for never reached his home feed (Tate, 2026-09-14). The
 * home carousel reads every active membership (use-home-feed.ts), so a lost
 * membership is a lost event, and Explore is the workaround rather than the
 * flow.
 */

/** Add the collective if it is not selected, remove it if it is. Order-stable. */
export function toggleCollectiveSelection(selectedIds: string[], id: string): string[] {
  return selectedIds.includes(id)
    ? selectedIds.filter((c) => c !== id)
    : [...selectedIds, id]
}

/**
 * Every collective the user should end up a member of: all of their picks,
 * plus the national (Australia) collective so everyone has the org-wide group
 * chat and national events. Deduped, so a user who explicitly picked the
 * national one is not written twice, and order-stable so the picks are joined
 * in the order they were made.
 */
export function collectivesToJoin(
  selectedIds: string[],
  nationalCollectiveId: string | null | undefined,
): string[] {
  return [...new Set([...selectedIds, ...(nationalCollectiveId ? [nationalCollectiveId] : [])])]
}
