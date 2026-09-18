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
  /** Recipients that have a SENDABLE address and have not opted out. These go on. */
  addressed: (T & { to: string })[]
  /** Recipients that arrived with a userId and left WITHOUT a sendable address.
   *  The silent loss. */
  unresolvedIds: string[]
  /** Recipients that carried neither a usable address nor a userId. A caller
   *  bug, counted rather than dropped so it cannot hide inside `skipped`. */
  unaddressable: number
  /** Recipients suppressed because the member switched this notification off. */
  optedOut: number
  /** Addresses refused by the shape check, whatever route they arrived by.
   *  These are the ones that would have taken their whole chunk down. */
  malformed: string[]
}

/**
 * Split recipients by what actually happened to each one.
 *
 * `resolvedById` is the address resolved for a userId, absent when resolution
 * found nothing. `optedOutIds` is the consent set, already loaded.
 *
 * `isSendable` is applied to EVERY address, including a literal `to` the caller
 * supplied. That is not belt-and-braces over resolveRecipientEmail: the batch
 * path takes a literal `to` verbatim and never resolves it, so until
 * 2026-09-18 a malformed literal reached the Resend payload unchecked. Resend
 * answers the WHOLE chunk 422 for one bad entry, so a single literal cost the
 * other 99 people in its chunk their mail. Proven on the deployed function:
 * [hayesabigail@y7mail, code@ecodia.au] answered resolved:2 skipped:0 and
 * HTTP 502, and the good address received nothing. The app's own
 * sendEmailToMany fallback passes `to`, so this was live production reach.
 */
export function partitionRecipients<T extends BatchRecipientLike>(
  recipients: readonly T[],
  resolvedById: ReadonlyMap<string, string>,
  optedOutIds: ReadonlySet<string>,
  isSendable: (email: string) => boolean = () => true,
): RecipientPartition<T> {
  const addressed: (T & { to: string })[] = []
  const unresolvedIds: string[] = []
  const malformed: string[] = []
  let unaddressable = 0
  let optedOut = 0

  for (const r of recipients) {
    let to = r.to || (r.userId ? resolvedById.get(r.userId) ?? '' : '')
    if (to && !isSendable(to)) {
      // Refused before it can reach a payload. It is recorded as malformed AND
      // falls through to the unresolved accounting below, because from the
      // member's side the outcome is identical: we hold no address that can
      // reach them.
      malformed.push(to)
      to = ''
    }
    if (!to) {
      // Order matters: a userId that ended without an address is the loss we
      // are hunting. A recipient with no userId at all never had a chance and
      // is a different (caller-side) defect.
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

  return { addressed, unresolvedIds, unaddressable, optedOut, malformed }
}
