/**
 * recipient-partition.ts - account for EVERY recipient handed to a batch send,
 * so a person who silently vanishes is a number the caller can see.
 *
 * THE DEFECT THIS EXISTS TO KILL (Co-Exist, 2026-09-17, Kurt Jones P1).
 *
 * send-email's batch path collapsed three different fates into one filter:
 *
 *     const addressed = payload.recipients
 *       .map((r) => (r.to ? r : { ...r, to: resolvedById.get(r.userId) ?? '' }))
 *       .filter((r) => r.to && !(r.userId && optedOut.has(r.userId)))
 *
 * A member who opted out and a member whose address could not be resolved both
 * leave that line the same way, and both land in a single `skipped` count.
 * They are not the same thing at all:
 *
 *   - OPTED OUT is the system working. The member asked not to be mailed.
 *   - UNRESOLVED is the system LOSING someone. They are an active member who
 *     wanted this mail and got nothing, and nobody was told.
 *
 * Measured on the Perth Coastal Festival reminder, 2026-09-17 10:52:47Z: 49 of
 * 424 eligible members (11.6%) left without an address and the send reported a
 * clean success. All 49 had BOTH an auth email and a profile email, only 4 were
 * Apple relays, and not one produced a Resend event of any kind. The loss was
 * invisible because `skipped` is a number nobody reads as an alarm.
 *
 * So: count them apart, name the userIds in the log, and put `unresolved` on
 * the response where a caller and a reconcile probe can both see it.
 */

export interface BatchRecipientLike {
  to?: string
  userId?: string
  data?: Record<string, unknown>
}

export interface RecipientPartition<T extends BatchRecipientLike> {
  /** Recipients that have an address and have not opted out. These go on. */
  addressed: (T & { to: string })[]
  /** Recipients that arrived with a userId and left WITHOUT an address. The
   *  silent loss. */
  unresolvedIds: string[]
  /** Recipients that carried neither an address nor a userId. A caller bug,
   *  counted rather than dropped so it cannot hide inside `skipped` either. */
  unaddressable: number
  /** Recipients suppressed because the member switched this notification off. */
  optedOut: number
}

/**
 * Split recipients by what actually happened to each one.
 *
 * `resolvedById` is the address resolved for a userId, absent when resolution
 * found nothing. `optedOutIds` is the consent set, already loaded.
 */
export function partitionRecipients<T extends BatchRecipientLike>(
  recipients: readonly T[],
  resolvedById: ReadonlyMap<string, string>,
  optedOutIds: ReadonlySet<string>,
): RecipientPartition<T> {
  const addressed: (T & { to: string })[] = []
  const unresolvedIds: string[] = []
  let unaddressable = 0
  let optedOut = 0

  for (const r of recipients) {
    const to = r.to || (r.userId ? resolvedById.get(r.userId) ?? '' : '')
    if (!to) {
      // Order matters: a userId that resolved to nothing is the loss we are
      // hunting. A recipient with no userId at all never had a chance and is a
      // different (caller-side) defect.
      if (r.userId) unresolvedIds.push(r.userId)
      else unaddressable++
      continue
    }
    if (r.userId && optedOutIds.has(r.userId)) {
      optedOut++
      continue
    }
    addressed.push({ ...r, to } as T & { to: string })
  }

  return { addressed, unresolvedIds, unaddressable, optedOut }
}
