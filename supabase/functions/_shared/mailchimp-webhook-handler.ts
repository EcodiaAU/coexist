/**
 * mailchimp-webhook-handler.ts - the request handler behind
 * supabase/functions/mailchimp-webhook, with its I/O injected so the whole
 * HTTP path (auth, signature, dedupe, the Co-Exist write) is tested in
 * _tests/mailchimp-webhook-handler.test.ts.
 *
 * Mailchimp calls this unauthenticated (it cannot present a Supabase JWT), so
 * verify_jwt=false and the request proves itself three ways, in this order:
 *   1. the URL token we registered the webhook with (?token=...), constant-time
 *   2. X-Mailchimp-Signature, HMAC-SHA256 over "{t}.{raw body}", when a signing
 *      secret is stored (Mailchimp returns it once, at webhook creation)
 *   3. data[list_id] must be the configured audience
 * Anything failing 1 or 2 is 401 and touches nothing.
 *
 * Mailchimp retries a non-2xx for up to 75 minutes, so every delivery is
 * recorded under a dedupe key first and a retry of one we already handled is a
 * 200 no-op. It must answer inside 10 seconds, which two small writes do.
 */

import {
  normaliseEmail,
  parseWebhookForm,
  timingSafeEqualStr,
  verifyWebhookSignature,
  webhookAction,
  webhookDedupeKey,
} from './mailchimp.ts'

export interface WebhookSecrets {
  webhook_token: string | null
  webhook_signing_secret: string | null
}

export interface WebhookDeps {
  audienceId: string
  loadSecrets(): Promise<WebhookSecrets | null>
  /**
   * Insert the delivery. False when this dedupe key was already HANDLED. A row
   * whose outcome starts 'error:' is re-claimed and returns true, so a delivery
   * that failed mid-write is processed again on Mailchimp's retry.
   */
  recordEvent(row: {
    dedupe_key: string
    type: string
    email: string | null
    list_id: string | null
    fired_at: string | null
    payload: Record<string, unknown>
    outcome: string
  }): Promise<boolean>
  setEventOutcome(dedupeKey: string, outcome: string): Promise<void>
  /** Consent opt-out: profiles.marketing_opt_in=false via unsubscribe_by_email, and the newsletter row. */
  unsubscribe(email: string): Promise<{ profiles: number; newsletter: number }>
  /** Address death: email_suppressions reason 'bounce'. */
  suppressBounce(email: string): Promise<'inserted' | 'existing'>
  /** Keep our sync state's view of Mailchimp current, so the next sync does not fight it. */
  markState(email: string, mcStatus: 'unsubscribed' | 'cleaned'): Promise<void>
  nowSeconds?: () => number
}

const TEXT = { 'Content-Type': 'text/plain' }

export function createWebhookHandler(deps: WebhookDeps) {
  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url)

    // Mailchimp validates a new webhook URL with a GET before saving it.
    if (req.method === 'GET' || req.method === 'HEAD') return new Response('ok', { status: 200, headers: TEXT })
    if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: TEXT })

    const secrets = await deps.loadSecrets()
    const expectedToken = secrets?.webhook_token ?? ''
    const token = url.searchParams.get('token') ?? ''
    if (!expectedToken || !timingSafeEqualStr(token, expectedToken)) {
      return new Response('unauthorised', { status: 401, headers: TEXT })
    }

    const raw = await req.text()
    if (secrets?.webhook_signing_secret) {
      const verdict = await verifyWebhookSignature(
        raw,
        req.headers.get('x-mailchimp-signature'),
        secrets.webhook_signing_secret,
        (deps.nowSeconds ?? (() => Math.floor(Date.now() / 1000)))(),
      )
      if (verdict !== 'valid') return new Response(`signature ${verdict}`, { status: 401, headers: TEXT })
    }

    const ev = parseWebhookForm(raw)
    const action = webhookAction(ev, deps.audienceId)
    const key = await webhookDedupeKey(ev)
    const fresh = await deps.recordEvent({
      dedupe_key: key,
      type: ev.type || 'unknown',
      email: normaliseEmail(ev.data.email) || null,
      list_id: ev.data.list_id ?? null,
      fired_at: ev.fired_at || null,
      payload: { type: ev.type, fired_at: ev.fired_at, data: ev.data },
      outcome: action.kind === 'ignore' ? `ignored: ${action.why}` : 'received',
    })
    if (!fresh) return new Response('duplicate', { status: 200, headers: TEXT })
    if (action.kind === 'ignore') return new Response('ignored', { status: 200, headers: TEXT })

    try {
      if (action.kind === 'unsubscribe') {
        const r = await deps.unsubscribe(action.email)
        await deps.markState(action.email, 'unsubscribed')
        await deps.setEventOutcome(key, `unsubscribed in Co-Exist (profiles=${r.profiles}, newsletter=${r.newsletter})`)
      } else {
        const r = await deps.suppressBounce(action.email)
        await deps.markState(action.email, 'cleaned')
        await deps.setEventOutcome(key, `suppression ${r} (bounce)`)
      }
      return new Response('ok', { status: 200, headers: TEXT })
    } catch (e) {
      const msg = String((e as Error)?.message ?? e).slice(0, 200)
      await deps.setEventOutcome(key, `error: ${msg}`).catch(() => {})
      // 500 so Mailchimp retries; the 'error:' outcome lets recordEvent re-claim
      // the row, so the retry is processed instead of read as a duplicate.
      return new Response('error', { status: 500, headers: TEXT })
    }
  }
}
