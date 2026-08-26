// _shared/invoke-report.ts - make a failed cross-function call audible.
//
// `functions.invoke` RESOLVES on a non-2xx instead of throwing. A call written
// as a bare `await invoke(...)` inside try/catch therefore swallows every
// failure twice over: the catch never runs, and the returned { error } is
// dropped on the floor. Ten server-initiated Co-Exist emails failed exactly
// that way for days while every caller reported success to its own client.
//
// The FunctionsHttpError handed back is also useless on its own: it
// stringifies to "Edge Function returned a non-2xx status code", which is all
// Sentry COEXIST-1B has ever shown. The real status and body live on .context,
// a Response, so read it.
//
// Best-effort by contract: a notification that fails must never roll back the
// ticket, payment or transfer that triggered it, so this only reports.

export async function reportInvokeError(
  caller: string,
  target: string,
  err: unknown,
): Promise<string | null> {
  if (!err) return null
  let detail = (err as Error)?.message || String(err)
  const ctx = (err as { context?: Response }).context
  if (ctx && typeof ctx.text === 'function') {
    try {
      detail = `${ctx.status}: ${(await ctx.text()).slice(0, 300)}`
    } catch {
      // keep the base message; a body we cannot read is still worth reporting
    }
  }
  console.error(`[${caller}] ${target} returned an error:`, detail)
  return detail
}
