/**
 * Builds the ticket_confirmation send-email payload for ONE ticket, at send
 * time.
 *
 * WHY AT SEND TIME, and not stored on the outbox row when the intent was
 * recorded. Two of these fields go stale:
 *
 *   - A guest's CTA is a single-use magic link. Minted at enqueue time it can
 *     expire before a retry drains, and a member would be handed a dead link
 *     in the one email that is supposed to get them to their ticket.
 *   - An event's title, date and address are editable by an organiser. A
 *     confirmation that drains an hour late should describe the event as it is,
 *     not as it was when the payment landed.
 *
 * So the outbox stores INTENT (which template, which ticket, which member) and
 * this module resolves it into content on every attempt. The webhook's inline
 * attempt and the cron drainer both call it, which is also what stops the copy
 * from drifting between the two paths: there is one builder, not two.
 */

/**
 * A send that must NOT happen, as distinct from one that failed.
 *
 * The outbox has three outcomes and the difference between two of them is
 * decided here. A confirmation we cannot render RIGHT NOW is a `retry`; a
 * confirmation that must never be sent at all is a `suppressed`, and routing
 * the second through the first is how a row burns six attempts and lands in
 * `failed` for an operator to investigate a non-problem.
 */
export class TicketNotSendableError extends Error {
  readonly suppress = true
  constructor(message: string) {
    super(message)
    this.name = 'TicketNotSendableError'
  }
}

/** True when the throw means "never send this", not "could not send it yet". */
export function isNotSendable(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { suppress?: unknown }).suppress === true
}

/**
 * The only ticket state a confirmation may be sent for.
 *
 * WHY THIS GUARD EXISTS (added 2026-09-12 by the W2 verification pass). The
 * builder already SELECTed `status` and never read it, and no cancel, refund or
 * revoke path touches the outbox: `transactional_email_outbox` is referenced by
 * exactly two files, stripe-webhook and transactional-email-drain. So an owed
 * confirmation on a ticket that is refunded, cancelled or revoked before the
 * drainer reaches it still sent "your ticket is confirmed". `cancel-event`
 * makes that a bulk event: cancel an event holding N owed confirmations and N
 * people are told their ticket is confirmed for the event just cancelled.
 *
 * The mechanism derives CONTENT at send time for exactly this reason (an event
 * can change under a queued row). Eligibility is the same argument and was
 * missing: what was true when the intent was recorded is not what is true when
 * it drains.
 */
const SENDABLE_TICKET_STATUSES = new Set(['confirmed'])

export interface ContentClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>
      }
    }
  }
  auth: {
    admin: {
      getUserById(id: string): PromiseLike<{
        data: { user: { email?: string | null } | null } | null
        error?: unknown
      }>
      generateLink(args: {
        type: string
        email: string
        options?: { redirectTo?: string }
      }): PromiseLike<{
        data: { properties?: { action_link?: string } | null } | null
        error?: unknown
      }>
    }
  }
}

export interface TicketConfirmationPayload {
  type: 'ticket_confirmation'
  userId: string
  ticketId: string
  data: Record<string, unknown>
}

/** Wall-clock long form, matching every other Co-Exist transactional email. */
export function formatEventDateLong(dateStart: string | null | undefined): string {
  if (!dateStart) return ''
  return new Date(dateStart).toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export interface BuildArgs {
  ticketId: string
  appUrl?: string
  /**
   * Whether the holder is a guest (a shell account with a random password,
   * created by guest-ticket-checkout) and therefore needs a magic link.
   *
   * THERE IS NO PERSISTED GUEST MARKER. Guest-ness exists only in the Stripe
   * checkout metadata (`metadata.guest === 'true'`), and guest-ticket-checkout
   * creates the account with email_confirm=true and a random password, which is
   * indistinguishable from a member's row. So the webhook, which is the only
   * actor that sees that metadata, records the flag onto the outbox row's
   * context at enqueue time and it travels with the intent.
   *
   * When it is genuinely unknown (a row the reconciliation sweep created from
   * paid state alone, long after the Stripe metadata is out of reach) this is
   * left undefined and the MAGIC LINK is used, because a magic link lands both
   * a guest AND a member on their ticket while a direct link lands only a
   * member and shows a guest a login wall. A reconcile row exists because
   * somebody got nothing, so the branch that reaches more people wins.
   */
  guest?: boolean
}

/**
 * Resolves a ticket into a send-email payload. Throws when the ticket or its
 * holder cannot be read, because a confirmation addressed to nobody is a
 * failure to retry rather than a send to skip.
 */
export async function buildTicketConfirmation(
  db: ContentClient,
  args: BuildArgs,
): Promise<TicketConfirmationPayload> {
  const appUrl = args.appUrl ?? 'https://app.coexistaus.org'

  const { data: ticket, error: ticketErr } = await db
    .from('event_tickets')
    .select('id, status, event_id, user_id, quantity, ticket_code, price_cents')
    .eq('id', args.ticketId)
    .maybeSingle()

  if (ticketErr) throw new Error(`could not read ticket ${args.ticketId}: ${String(ticketErr)}`)
  if (!ticket) throw new Error(`no ticket ${args.ticketId}`)

  const userId = (ticket.user_id as string | null) ?? null
  if (!userId) throw new Error(`ticket ${args.ticketId} has no holder`)

  // Eligibility at SEND time, for the same reason content is built at send
  // time: the ticket may have been refunded, cancelled or revoked since the
  // intent was recorded. This is a deliberate non-send, never a retry.
  const ticketStatus = (ticket.status as string | null) ?? ''
  if (!SENDABLE_TICKET_STATUSES.has(ticketStatus)) {
    throw new TicketNotSendableError(
      `ticket ${args.ticketId} is '${ticketStatus || 'unknown'}', not confirmed; ` +
        'a confirmation for a voided ticket is a deliberate non-send',
    )
  }

  const { data: ev } = await db
    .from('events')
    .select('title, date_start, address')
    .eq('id', ticket.event_id)
    .maybeSingle()

  const quantity = (ticket.quantity as number | null) ?? 1
  // price_cents is the per-ticket price; the email shows what they paid.
  const amount = (((ticket.price_cents as number | null) ?? 0) * quantity) / 100

  // The plain ticket page is auth-gated. A guest holds only a shell account
  // with no password, so a direct link lands them on a login wall; a fresh
  // magic link signs them in and drops them on the ticket. A member keeps the
  // direct link, which survives forwarding and re-reading.
  const ticketPath = `/events/${ticket.event_id}/ticket-confirmation?ticket_id=${args.ticketId}`
  let ticketUrl = `${appUrl}${ticketPath}`

  const isGuest = args.guest ?? true
  if (isGuest) {
    const { data: holder } = await db.auth.admin.getUserById(userId)
    const guestEmail = holder?.user?.email
    if (guestEmail) {
      const { data: magic } = await db.auth.admin.generateLink({
        type: 'magiclink',
        email: guestEmail,
        options: { redirectTo: `${appUrl}${ticketPath}` },
      })
      if (magic?.properties?.action_link) ticketUrl = magic.properties.action_link
    }
  }

  return {
    type: 'ticket_confirmation',
    userId,
    ticketId: args.ticketId,
    data: {
      name: '',
      event_title: (ev?.title as string | undefined) ?? 'Event',
      event_date: formatEventDateLong(ev?.date_start as string | null | undefined),
      event_location: (ev?.address as string | undefined) ?? '',
      ticket_code: (ticket.ticket_code as string | null) ?? '',
      quantity,
      amount: amount.toFixed(2),
      currency: 'AUD',
      ticket_url: ticketUrl,
    },
  }
}

/**
 * The send-email success predicate, in one place because getting it wrong in
 * either direction is a known live failure.
 *
 * send-email answers in three shapes and they are NOT two:
 *   - non-2xx                  -> a real failure. RETRY.
 *   - 200 { success: true }    -> Resend accepted it. SENT.
 *   - 200 { success: false }   -> a deliberate non-send (preference off,
 *     or { skipped: true }        opt-out, admin-disabled template, dead
 *                                address). SUPPRESSED, and never retried.
 *
 * Collapsing suppressed into failure gives a member who opted out an email
 * every five minutes forever. Collapsing it into success is what let the
 * original 401 window certify healthy for months.
 */
export function classifySendResult(
  status: number,
  body: { success?: boolean; skipped?: boolean; reason?: string; error?: string } | null,
): { outcome: 'sent' | 'suppressed' | 'retry'; detail: string } {
  const httpOk = status >= 200 && status < 300
  if (!httpOk) {
    return { outcome: 'retry', detail: `send-email returned HTTP ${status}: ${JSON.stringify(body)}` }
  }
  if (body?.success === true) {
    return { outcome: 'sent', detail: 'accepted by Resend' }
  }
  return {
    outcome: 'suppressed',
    detail: `deliberate non-send: ${body?.reason ?? body?.error ?? JSON.stringify(body)}`,
  }
}
