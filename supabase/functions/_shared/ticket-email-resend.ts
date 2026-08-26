/**
 * Re-runnable transactional resend for ONE event ticket (2026-08-26).
 *
 * WHY THIS EXISTS. On 2026-08-20T22:44:33Z event_tickets
 * 45e658d2-bb40-4747-9bc6-9ef88eb430ab was refunded AU$80.00 against
 * pi_3TsHNOCNw9X8EsOR0bJwSkYM ("Wild Mountains Conservation Campout").
 * stripe-webhook returned 200 for that delivery while its call to send-email
 * returned 401, and the caller swallowed the failure. The member has exactly
 * one resend_events row in all time (2026-08-19T23:23:04Z, her original
 * ticket) and none on the refund day, and the ticket row has not been written
 * since 22:44:33.459+00. Nothing retried, because nothing recorded that
 * anything had failed.
 *
 * notifyTicketRefund (_shared/ticket-refund-notify.ts) closes the forward
 * path: the NEXT refund is told exactly once. It cannot help her, because it
 * only ever fires from Stripe's charge.refunded and that delivery is six days
 * gone. Stripe will not send it again. This module is the missing operator
 * path: given a ticket that is ALREADY in its terminal state, send the
 * transactional email that should have gone out, exactly once, and leave a
 * durable record either way.
 *
 * THREE PROPERTIES, EACH LOAD-BEARING.
 *
 *   1. IDEMPOTENT ON TICKET ID, in two layers, because two different actors
 *      can send the same email.
 *        Layer A, cross-actor: for a refund it claims the same persisted
 *        column the webhook claims (event_tickets.refund_notified_at) with the
 *        same single conditional UPDATE. So this tool and a late Stripe retry
 *        cannot both send; whichever gets the row wins.
 *        Layer B, per-tool and template-agnostic: an audit_log row
 *        ('ticket_email_resent', target_id = ticket) is the ledger for every
 *        template, including ones with no claim column of their own.
 *      Layer A alone would not generalise past refunds. Layer B alone would
 *      not stop the webhook. Both, or the guard has a hole in it.
 *
 *   2. IT FAILS LOUDLY. This whole incident is a swallowed 401, so a silent
 *      catch here would be the bug wearing the fix's clothes. Every failure
 *      throws AND writes an audit_log row before it throws. A caller that
 *      never looks at the exit code still finds the failure in the database.
 *
 *   3. 2xx IS NOT SUCCESS. send-email answers HTTP 200 with { success: false }
 *      for a deliberate suppression (admin-disabled template, notification
 *      preference off, marketing opt-out) and HTTP 200 with { success: true }
 *      only when Resend actually accepted the message. A predicate of
 *      "res.ok" would green a suppression, which is the same
 *      presence-treated-as-sufficiency mistake that let the original 401
 *      window certify healthy. Success here is res.ok AND body.success ===
 *      true, and nothing else.
 *
 * A TEST SEND IS NOT A SEND. Passing an explicit recipient override (the
 * probe address) exercises the real transport without consuming the member's
 * one notification: it skips the claim, and its ledger row is marked
 * test_recipient so the idempotence check steps over it. Otherwise proving the
 * tool works would silently disarm it for the person it was built for.
 */

export interface UpdateResult {
  data: Array<{ id: string }> | null
  error: unknown
}

export interface SelectOneResult {
  data: Record<string, unknown> | null
  error: unknown
}

export interface SelectManyResult {
  data: Array<Record<string, unknown>> | null
  error: unknown
}

/**
 * The slice of the PostgREST builder this module uses, declared structurally
 * so a test can stand in a fake that exercises the REAL query shapes,
 * including the `.is('refund_notified_at', null)` claim and the audit_log
 * ledger read, rather than a paraphrase of them.
 */
export interface ResendClient {
  from(table: string): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: unknown): {
        is(column: string, value: null): { select(columns: string): PromiseLike<UpdateResult> }
        select(columns: string): PromiseLike<UpdateResult>
      }
    }
    insert(values: Record<string, unknown>): PromiseLike<{ error: unknown }>
    select(columns: string): {
      eq(column: string, value: unknown): {
        eq(column: string, value: unknown): { limit(n: number): PromiseLike<SelectManyResult> }
        maybeSingle(): PromiseLike<SelectOneResult>
      }
    }
  }
}

/** What send-email actually answered. Status and body are both required: a 200 carrying success:false is a suppression, not a delivery. */
export interface SendResponse {
  status: number
  body: { success?: boolean; error?: string; skipped?: boolean; reason?: string } | null
}

export interface ResendDeps {
  db: ResendClient
  /** Invokes send-email. Must surface the HTTP status; a sender that collapses status into a boolean cannot tell a 401 from a suppression. */
  sendEmail: (payload: {
    type: string
    userId?: string
    to?: string
    data: Record<string, unknown>
  }) => Promise<SendResponse>
}

export interface ResendArgs {
  ticketId: string
  /** send-email template key. Defaults to the one implied by the ticket status. */
  template?: string
  /** Explicit recipient. Present means this is a TEST send: no claim, ledger row marked test_recipient. */
  toOverride?: string
  /**
   * Clear the shared claim column before claiming it, for a ticket the
   * migration backfill stamped as notified.
   *
   * Migration 20260826090000 deliberately stamps every already-refunded ticket
   * so that shipping the webhook path does not mail people about refunds that
   * are weeks old. Its own comment names the escape hatch: "To re-enable one
   * deliberately: set refund_notified_at = null for that ticket". This is that
   * gesture, made explicit and audited instead of typed as raw SQL.
   *
   * It clears the SHARED claim only. The per-tool ledger still holds, so a
   * ticket that has genuinely been sent stays blocked and this cannot become a
   * one-flag double-send.
   */
  releaseClaim?: boolean
  nowIso: string
}

export type ResendOutcomeName =
  | 'sent'
  | 'test_sent'
  | 'already_sent'

export interface ResendResult {
  outcome: ResendOutcomeName
  sent: boolean
  template: string
  ticketId: string
  recipientOverride: string | null
}

/** Every failure path throws this, so a caller cannot mistake a failure for a no-op. */
export class ResendFailure extends Error {
  readonly stage: string
  readonly detail: unknown
  constructor(stage: string, message: string, detail?: unknown) {
    super(message)
    this.name = 'ResendFailure'
    this.stage = stage
    this.detail = detail
  }
}

/** Ticket status -> the transactional email that status implies. */
const STATUS_TEMPLATE: Record<string, string> = {
  refunded: 'ticket_refunded',
  confirmed: 'ticket_confirmation',
}

/**
 * Templates whose single-send guarantee is ALSO enforced by a persisted column
 * on event_tickets. These are the ones another actor (the Stripe webhook) can
 * send independently, so the claim has to be shared with that actor rather
 * than private to this tool.
 */
const TEMPLATE_CLAIM_COLUMN: Record<string, string> = {
  ticket_refunded: 'refund_notified_at',
}

const LEDGER_ACTION = 'ticket_email_resent'
const LEDGER_FAILED = 'ticket_email_resend_failed'
const LEDGER_RELEASED = 'ticket_email_resend_claim_released'

function formatEventDate(dateStart: string | null | undefined): string {
  if (!dateStart) return ''
  return new Date(dateStart).toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Records a failure in audit_log and then throws. The write is best-effort by
 * necessity (if the database is the thing that is broken there is nowhere to
 * write), but the throw is not: the caller always learns.
 */
async function failLoudly(
  deps: ResendDeps,
  args: ResendArgs,
  stage: string,
  message: string,
  detail: Record<string, unknown>,
  userId?: string | null,
): Promise<never> {
  try {
    await deps.db.from('audit_log').insert({
      user_id: userId ?? null,
      action: LEDGER_FAILED,
      target_type: 'event_ticket',
      target_id: args.ticketId,
      details: { stage, message, ...detail, at: args.nowIso },
    })
  } catch (writeErr) {
    console.error('[ticket-email-resend] could not record the failure:', writeErr)
  }
  throw new ResendFailure(stage, message, detail)
}

export async function resendTicketEmail(
  deps: ResendDeps,
  args: ResendArgs,
): Promise<ResendResult> {
  const tickets = () => deps.db.from('event_tickets')
  const isTest = typeof args.toOverride === 'string' && args.toOverride.length > 0

  // 1. Read the ticket. A missing ticket is an operator typo, and quietly
  //    doing nothing about a typo is how the six days happened.
  const { data: ticket, error: readError } = await tickets()
    .select('id, status, event_id, user_id, ticket_code, price_cents, refund_notified_at')
    .eq('id', args.ticketId)
    .maybeSingle()

  if (readError) {
    return await failLoudly(deps, args, 'read_ticket', 'could not read the ticket', {
      error: String(readError),
    })
  }
  if (!ticket) {
    return await failLoudly(deps, args, 'read_ticket', `no ticket ${args.ticketId}`, {})
  }

  const status = String(ticket.status ?? '')
  const template = args.template ?? STATUS_TEMPLATE[status]
  const userId = (ticket.user_id as string | null) ?? null

  if (!template) {
    return await failLoudly(
      deps,
      args,
      'template',
      `ticket status '${status}' implies no transactional email; pass an explicit template`,
      { status },
      userId,
    )
  }

  // 2. Layer B: the per-tool ledger. Checked for every template, including the
  //    ones with no claim column. Test sends are excluded from the read below
  //    so a probe cannot suppress the real send.
  const { data: priorRows, error: ledgerError } = await deps.db
    .from('audit_log')
    .select('id, details')
    .eq('target_id', args.ticketId)
    .eq('action', LEDGER_ACTION)
    .limit(50)

  if (ledgerError) {
    return await failLoudly(deps, args, 'ledger_read', 'could not read the resend ledger', {
      error: String(ledgerError),
    }, userId)
  }

  const priorRealSend = (priorRows ?? []).some((row) => {
    const details = (row.details ?? {}) as Record<string, unknown>
    return details.template === template && details.test_recipient !== true
  })

  if (priorRealSend && !isTest) {
    return {
      outcome: 'already_sent',
      sent: false,
      template,
      ticketId: args.ticketId,
      recipientOverride: null,
    }
  }

  // 3. Layer A: the shared claim. One conditional UPDATE, so Postgres decides
  //    the winner between this tool and a late Stripe retry rather than this
  //    process deciding. Skipped for a test send, which must not consume the
  //    member's one notification.
  const claimColumn = TEMPLATE_CLAIM_COLUMN[template]
  if (claimColumn && !isTest && args.releaseClaim) {
    // Deliberate, audited, and reached only past the ledger check above, so it
    // can undo the migration backfill without becoming a double-send lever.
    const { error: releaseError } = await tickets()
      .update({ [claimColumn]: null })
      .eq('id', args.ticketId)
      .select('id')
    if (releaseError) {
      return await failLoudly(
        deps,
        args,
        'release_claim',
        `could not clear ${claimColumn}`,
        { error: String(releaseError), column: claimColumn },
        userId,
      )
    }
    await deps.db.from('audit_log').insert({
      user_id: userId,
      action: LEDGER_RELEASED,
      target_type: 'event_ticket',
      target_id: args.ticketId,
      details: { template, column: claimColumn, at: args.nowIso },
    })
  }
  if (claimColumn && !isTest) {
    const { data: claimed, error: claimError } = await tickets()
      .update({ [claimColumn]: args.nowIso })
      .eq('id', args.ticketId)
      .is(claimColumn, null)
      .select('id')

    if (claimError) {
      // Includes the case the column does not exist yet, which is exactly the
      // shape that must NOT be shrugged off: an unguarded send here is the
      // four-identical-emails failure.
      return await failLoudly(
        deps,
        args,
        'claim',
        `could not claim ${claimColumn} (is migration 20260826090000 applied?)`,
        { error: String(claimError), column: claimColumn },
        userId,
      )
    }
    if (!claimed || claimed.length === 0) {
      return {
        outcome: 'already_sent',
        sent: false,
        template,
        ticketId: args.ticketId,
        recipientOverride: null,
      }
    }
  }

  // 4. Name the event. Same fields and date formatting the webhook path uses,
  //    so a resent email reads identically to one sent on the day.
  const { data: ev } = await deps.db
    .from('events')
    .select('title, date_start, address')
    .eq('id', ticket.event_id)
    .maybeSingle()

  const refundAmount = ((ticket.price_cents as number | null) ?? 0) / 100
  const payload = {
    type: template,
    userId: isTest ? undefined : (userId ?? undefined),
    to: isTest ? args.toOverride : undefined,
    data: {
      name: '',
      event_title: (ev?.title as string | undefined) ?? 'your event',
      event_date: formatEventDate(ev?.date_start as string | null | undefined),
      event_location: (ev?.address as string | undefined) ?? '',
      ticket_code: (ticket.ticket_code as string | null) ?? '',
      refund_amount: refundAmount.toFixed(2),
      amount: refundAmount.toFixed(2),
      currency: 'AUD',
      quantity: 1,
    },
  }

  let response: SendResponse
  try {
    response = await deps.sendEmail(payload)
  } catch (err) {
    await releaseClaim(deps, args, claimColumn, isTest)
    return await failLoudly(deps, args, 'send', `send-email threw: ${(err as Error).message}`, {
      template,
    }, userId)
  }

  // 5. The predicate. Transport success AND application success, because
  //    send-email answers 200 for a deliberate suppression too.
  const httpOk = response.status >= 200 && response.status < 300
  const appOk = response.body?.success === true
  if (!httpOk || !appOk) {
    await releaseClaim(deps, args, claimColumn, isTest)
    return await failLoudly(
      deps,
      args,
      httpOk ? 'suppressed' : 'http',
      httpOk
        ? `send-email returned ${response.status} but did not send: ${JSON.stringify(response.body)}`
        : `send-email returned ${response.status}`,
      { template, status: response.status, body: response.body },
      userId,
    )
  }

  // 6. Record the send. A ledger row that only exists on success would leave
  //    the same silent gap this module was built to close, which is why the
  //    failure paths above write one too.
  const { error: ledgerWriteError } = await deps.db.from('audit_log').insert({
    user_id: userId,
    action: LEDGER_ACTION,
    target_type: 'event_ticket',
    target_id: args.ticketId,
    details: {
      template,
      status: response.status,
      test_recipient: isTest,
      recipient_override: isTest ? args.toOverride : null,
      at: args.nowIso,
    },
  })
  if (ledgerWriteError) {
    console.error('[ticket-email-resend] sent but could not record it:', ledgerWriteError)
  }

  return {
    outcome: isTest ? 'test_sent' : 'sent',
    sent: true,
    template,
    ticketId: args.ticketId,
    recipientOverride: isTest ? (args.toOverride as string) : null,
  }
}

/**
 * Give the notification back after a failed send, so a later attempt (this
 * tool re-run, or a Stripe retry) can still reach the member. Consuming the
 * claim on a transient failure would cost them their only telling, which is
 * the exact outcome this module exists to undo.
 */
async function releaseClaim(
  deps: ResendDeps,
  args: ResendArgs,
  claimColumn: string | undefined,
  isTest: boolean,
): Promise<void> {
  if (!claimColumn || isTest) return
  try {
    await deps.db
      .from('event_tickets')
      .update({ [claimColumn]: null })
      .eq('id', args.ticketId)
      .select('id')
  } catch (err) {
    console.error('[ticket-email-resend] could not release the claim:', err)
  }
}
