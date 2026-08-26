/**
 * Reading a Resend bounce back to the refund notification it silently consumed
 * (2026-08-26).
 *
 * THE FAILURE THIS CLOSES. event_tickets.refund_notified_at is claimed by a
 * conditional UPDATE before the send, so a Stripe retry cannot double-send.
 * That guard is correct and it has one blind spot: Resend answers 200 on
 * ACCEPTANCE, and the bounce lands on this webhook seconds later. Grounded
 * case, ticket 45e658d2-bb40-4747-9bc6-9ef88eb430ab: 09:59:22 sent=true and the
 * claim stamped, 09:59:35 email.bounced. The member was marked as told, nothing
 * arrived, and the claim being consumed is what BLOCKED the retry. Reported
 * success plus a consumed claim plus no delivery is silent data loss.
 *
 * THE RELEASE IS SCOPED, NOT BLIND. Two rules keep a compensating write from
 * doing harm:
 *   1. Only a BOUNCE releases. A complaint means it arrived and the member
 *      marked it spam; re-sending into that is the wrong answer.
 *   2. Only a claim NO NEWER than the send that bounced is released. Without
 *      that, a late bounce from an old attempt would unmark a member a later
 *      attempt actually reached, and the next Stripe retry would mail them
 *      twice. The send time is `data.created_at` on the Resend event, so the
 *      caller can express the guard as `refund_notified_at <= sentAt`.
 *
 * Releasing does NOT resend. Refund notifications fire from charge.refunded and
 * nowhere else, so a released claim simply becomes visible again to the next
 * Stripe retry and to an operator running scripts/resend-ticket-email.ts. There
 * is no loop here.
 */

export interface ResendEventLike {
  type?: string
  data?: {
    created_at?: string
    tags?: Record<string, string> | Array<{ name?: string; value?: string }>
  }
}

export interface RefundReleaseTarget {
  ticketId: string
  /** ISO timestamp of the send that bounced. Upper bound on the claim released. */
  sentAtIso: string
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/**
 * Resend echoes tags back as an object on the webhook payload, but the send API
 * takes an array of {name,value}. Both shapes are read so a payload-format
 * change on Resend's side degrades to "no release" instead of a crash.
 */
type TagBag = Record<string, string> | Array<{ name?: string; value?: string }> | undefined

function readTag(tags: TagBag, name: string): string | null {
  if (!tags) return null
  if (Array.isArray(tags)) {
    const hit = tags.find((t) => t?.name === name)
    return typeof hit?.value === 'string' ? hit.value : null
  }
  const v = (tags as Record<string, unknown>)[name]
  return typeof v === 'string' ? v : null
}

/**
 * Returns the ticket whose refund-notification claim this event must release,
 * or null when the event is anything else. Pure, so the decision is testable
 * without a database.
 */
export function refundReleaseTarget(evt: ResendEventLike | null | undefined): RefundReleaseTarget | null {
  if (!evt || evt.type !== 'email.bounced') return null
  const tags = evt.data?.tags
  if (readTag(tags, 'type') !== 'ticket_refunded') return null
  const ticketId = readTag(tags, 'ticket_id')
  if (!ticketId || !UUID_RE.test(ticketId)) return null
  const sentAtIso = evt.data?.created_at
  // No send timestamp means the "do not clobber a newer claim" guard cannot be
  // expressed, so the release is refused. Failing closed here costs one manual
  // resend; failing open costs a member a duplicate refund email.
  if (typeof sentAtIso !== 'string' || Number.isNaN(Date.parse(sentAtIso))) return null
  return { ticketId, sentAtIso }
}
