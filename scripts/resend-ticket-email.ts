#!/usr/bin/env -S deno run --allow-env --allow-net
/**
 * resend-ticket-email.ts - send the transactional email a ticket should have
 * received, once, for a ticket already in its terminal state.
 *
 * WHY. On 2026-08-20T22:44:33Z a Co-Exist member was refunded AU$80.00 and
 * never told. stripe-webhook returned 200 to Stripe while its call to
 * send-email returned 401, the caller swallowed the failure, and nothing
 * recorded that anything had gone wrong. Stripe will not deliver
 * charge.refunded again, so the forward fix in
 * _shared/ticket-refund-notify.ts cannot reach anyone already dropped. This is
 * the operator path for that gap, and for the next one.
 *
 * USAGE
 *   deno run --allow-env --allow-net scripts/resend-ticket-email.ts \
 *     --ticket <uuid> [--template ticket_refunded] [--to probe@example.org] [--dry-run]
 *
 *   --to    Sends to that address instead of the member. This is a TEST send:
 *           it does not consume the member's one notification, so a probe
 *           cannot silently disarm the real send.
 *   --dry-run  Resolves and prints the payload, sends nothing, writes nothing.
 *   --release-claim
 *           Clears event_tickets.refund_notified_at first, for a ticket that
 *           migration 20260826090000 stamped as notified during its backfill.
 *           That backfill is deliberate suppression of old refunds, and its own
 *           comment names this as the way to re-enable one per person. It
 *           clears the SHARED claim only: the per-tool ledger still blocks a
 *           ticket that has genuinely been sent, so this is not a double-send
 *           lever.
 *
 * ENVIRONMENT
 *   SUPABASE_URL          https://<ref>.supabase.co
 *   SUPABASE_SERVICE_KEY  the key the edge runtime holds as
 *                         SUPABASE_SERVICE_ROLE_KEY. On a project with the new
 *                         API key system that is the sb_secret_... key, NOT the
 *                         legacy service_role JWT. send-email compares the
 *                         bearer against that env var, so the legacy JWT 401s.
 *                         patterns/edge-function-service-role-env-is-the-new-sb-secret-key-not-legacy-jwt-2026-07-14
 *
 * EXIT CODES
 *   0  sent, or already sent (idempotent no-op), or dry run
 *   1  anything else, always with the reason on stderr AND a row in audit_log
 *
 * send-email is called with plain fetch and an explicit Authorization header
 * ON PURPOSE. The outage this tool exists for was supabase-js >= 2.112.2
 * dropping that header against a new-format key, so the remediation path does
 * not route through the client that caused it.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import {
  ResendFailure,
  resendTicketEmail,
  type ResendClient,
  type SendResponse,
} from '../supabase/functions/_shared/ticket-email-resend.ts'

function arg(name: string): string | undefined {
  const flag = `--${name}`
  const i = Deno.args.indexOf(flag)
  if (i !== -1 && i + 1 < Deno.args.length) return Deno.args[i + 1]
  const inline = Deno.args.find((a) => a.startsWith(`${flag}=`))
  return inline ? inline.slice(flag.length + 1) : undefined
}
const has = (name: string) => Deno.args.includes(`--${name}`)

const ticketId = arg('ticket')
if (!ticketId) {
  console.error('resend-ticket-email: --ticket <uuid> is required')
  Deno.exit(2)
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_KEY') ?? ''
if (!supabaseUrl || !serviceKey) {
  console.error('resend-ticket-email: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set')
  Deno.exit(2)
}

const template = arg('template')
const toOverride = arg('to')
const dryRun = has('dry-run')
const releaseClaim = has('release-claim')
const nowIso = new Date().toISOString()

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function callSendEmail(payload: {
  type: string
  userId?: string
  to?: string
  data: Record<string, unknown>
}): Promise<SendResponse> {
  if (dryRun) {
    console.log('[dry-run] would POST to send-email:')
    console.log(JSON.stringify(payload, null, 2))
    return { status: 200, body: { success: true } }
  }
  const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      // Explicit, because supabase-js is what dropped it.
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  let body: SendResponse['body'] = null
  const text = await res.text()
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { success: false, error: text.slice(0, 400) }
  }
  return { status: res.status, body }
}

try {
  const result = await resendTicketEmail(
    {
      db: supabase as unknown as ResendClient,
      sendEmail: callSendEmail,
    },
    { ticketId, template, toOverride, releaseClaim, nowIso },
  )
  console.log(JSON.stringify({ ...result, dryRun }, null, 2))
  if (result.outcome === 'already_sent') {
    console.log('nothing sent: this ticket has already been notified for that template.')
  }
  Deno.exit(0)
} catch (err) {
  if (err instanceof ResendFailure) {
    console.error(`resend-ticket-email FAILED at stage '${err.stage}': ${err.message}`)
    console.error(JSON.stringify(err.detail ?? {}, null, 2))
    console.error(
      `a row was written to audit_log (action='ticket_email_resend_failed', target_id='${ticketId}').`,
    )
    Deno.exit(1)
  }
  console.error('resend-ticket-email FAILED:', (err as Error).message)
  Deno.exit(1)
}
