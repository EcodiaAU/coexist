/**
 * invoke-report.ts - make a failed edge-function call from the CLIENT audible.
 *
 * The browser twin of supabase/functions/_shared/invoke-report.ts, and it exists
 * for the same reason. `supabase.functions.invoke` RESOLVES on a non-2xx instead
 * of throwing, so the two idioms that look like error handling both discard the
 * failure:
 *
 *   supabase.functions.invoke('send-email', {...})            // error dropped
 *   supabase.functions.invoke('send-email', {...}).catch(...) // catch never runs
 *
 * The second is worse than the first because it reads as handled. Seven Co-Exist
 * client call sites were written that way. On 19 August one admin device drove
 * 3,213 send-email calls in 18 minutes and 1,281 of them failed (865 x 500,
 * 318 x 401, 98 x 400, with 1,037 Resend rate_limit_exceeded underneath). Every
 * error was discarded at the call site, so the admin watched a clean run.
 *
 * The FunctionsHttpError handed back is also useless on its own: it stringifies
 * to "Edge Function returned a non-2xx status code", which is the entire content
 * of Sentry COEXIST-1B. The real status and body live on `.context`, a Response,
 * so read it.
 *
 * TWO failure shapes, and a caller that checks only the first still misses half:
 *   - a transport/HTTP failure arrives as `error`
 *   - an application failure arrives as a 200 whose `data.error` is set
 *
 * Best-effort by contract: a notification that fails must never roll back the
 * signup, cancellation or promotion that triggered it, so this only reports.
 */
import { captureException } from '@/lib/sentry'

export interface InvokeOutcome {
  ok: boolean
  detail: string | null
}

/**
 * Report a failed invoke and return what went wrong, or null when it succeeded.
 *
 * `data` is accepted as well as `error` because send-email answers some
 * failures with a 200 and `{ success: false, error }`.
 */
export async function reportInvokeError(
  caller: string,
  target: string,
  err: unknown,
  data?: unknown,
): Promise<string | null> {
  let detail: string | null = null

  if (err) {
    detail = (err as Error)?.message || String(err)
    const ctx = (err as { context?: Response }).context
    if (ctx && typeof ctx.text === 'function') {
      try {
        detail = `${ctx.status}: ${(await ctx.text()).slice(0, 300)}`
      } catch {
        // keep the base message; a body we cannot read is still worth reporting
      }
    }
  } else if (data && typeof data === 'object' && 'error' in data) {
    const appError = (data as { error?: unknown }).error
    if (appError) detail = String(appError)
  }

  if (!detail) return null
  captureException(new Error(`[${caller}] ${target} failed: ${detail}`), {
    extra: { caller, target, detail },
  })
  return detail
}

/**
 * Invoke an edge function and report a failure instead of dropping it.
 *
 * Deliberately never rejects and never throws: every call site this replaces was
 * a best-effort notification whose failure must not break the mutation that
 * triggered it. The difference from the code it replaces is that the failure is
 * now recorded rather than swallowed.
 */
export async function invokeAndReport(
  caller: string,
  target: string,
  options: { body?: unknown; headers?: Record<string, string> },
  client: { functions: { invoke: (t: string, o: unknown) => Promise<{ data: unknown; error: unknown }> } },
): Promise<InvokeOutcome> {
  try {
    const { data, error } = await client.functions.invoke(target, options)
    const detail = await reportInvokeError(caller, target, error, data)
    return { ok: detail === null, detail }
  } catch (err) {
    // A genuine throw (network down, CORS preflight refused) still lands here.
    const detail = await reportInvokeError(caller, target, err)
    return { ok: false, detail }
  }
}
