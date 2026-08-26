/**
 * send-email-batch.ts - send one email type to many people in ONE call.
 *
 * send-email has provided a `recipients` batch path since 2026-08-13, sending
 * through Resend's /emails/batch endpoint at up to 100 per request specifically
 * so a large send stays under Resend's 10 req/s limit. No client site used it.
 * Two admin actions instead looped `for (const reg of registrations)` and called
 * send-email once per person.
 *
 * On 19 August one admin device drove 3,213 send-email calls in 18 minutes.
 * 1,281 failed, 1,037 of them with Resend rate_limit_exceeded, and because every
 * call site discarded its error the admin saw a clean run. The same send through
 * this path is ceil(N/100) calls.
 *
 * DEPLOY ORDER IS A HARD CONSTRAINT, NOT A PREFERENCE. send-email MUST be
 * deployed before or with this client. A send-email deployed before batch
 * recipient resolution requires a literal `to` on every recipient and silently
 * drops the rest, and its batch return carried no CORS headers because no
 * browser had ever reached it, so from a browser that response is not merely
 * wrong, it is unreadable: the fetch is blocked before any body arrives and
 * `functions.invoke` yields a FunctionsFetchError rather than the payload the
 * capability probe below needs. See
 * patterns/supabase-edge-function-needs-cors-for-capacitor-webview-2026-06-16.
 *
 * The `resolved` capability probe therefore covers a send-email that answers
 * readably without understanding userId-only recipients. It CANNOT rescue a
 * pre-CORS deployment reached from a browser, and it deliberately does not fall
 * back on a transport error, because a 502 from the batch endpoint can mean some
 * chunks were already delivered and re-sending those people is the worse
 * outcome.
 */
import { supabase } from '@/lib/supabase'
import { invokeAndReport, reportInvokeError } from '@/lib/invoke-report'

export interface BatchRecipient {
  userId?: string
  to?: string
  data?: Record<string, unknown>
}

export interface BatchOutcome {
  /** How many recipients send-email accepted for delivery. */
  sent: number
  /** True when the batch path was unusable and each recipient was sent singly. */
  fellBack: boolean
}

interface BatchResponse {
  success?: boolean
  sent?: number
  resolved?: number
  skipped?: number
  error?: string
}

export async function sendEmailToMany(
  caller: string,
  type: string,
  recipients: BatchRecipient[],
): Promise<BatchOutcome> {
  if (recipients.length === 0) return { sent: 0, fellBack: false }

  const { data, error } = await supabase.functions.invoke('send-email', {
    body: { type, recipients },
  })
  const detail = await reportInvokeError(caller, 'send-email', error, data)
  const body = (data ?? null) as BatchResponse | null

  if (detail !== null) {
    // A real failure, not a capability gap. Do NOT fan out: a 502 from the batch
    // endpoint can mean some chunks were already delivered, and re-sending those
    // people is a worse outcome than the one already reported.
    return { sent: body?.sent ?? 0, fellBack: false }
  }

  if (typeof body?.resolved === 'number') {
    if (body.resolved === 0) {
      // The function understood the request and found nobody to send to. A
      // fan-out would resolve the same nobody, so report rather than retry.
      await reportInvokeError(
        caller,
        'send-email',
        null,
        { error: `batch resolved 0 deliverable addresses from ${recipients.length} recipients` },
      )
    }
    return { sent: body.sent ?? 0, fellBack: false }
  }

  // No `resolved` marker: this send-email predates userId resolution in the
  // batch path and has delivered to nobody. Send each recipient singly so the
  // mail actually goes out.
  let sent = 0
  for (const r of recipients) {
    const out = await invokeAndReport(
      caller,
      'send-email',
      { body: { type, userId: r.userId, to: r.to, data: r.data } },
      supabase,
    )
    if (out.ok) sent += 1
  }
  return { sent, fellBack: true }
}
