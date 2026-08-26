import { describe, it, expect, vi, beforeEach } from 'vitest'

const captureException = vi.fn()
vi.mock('@/lib/sentry', () => ({ captureException: (...a: unknown[]) => captureException(...a) }))

const { reportInvokeError, invokeAndReport } = await import('./invoke-report')

/** The shape supabase-js hands back on a non-2xx: a message that says nothing
 *  and a `.context` Response that says everything. */
function functionsHttpError(status: number, body: string) {
  const err = new Error('Edge Function returned a non-2xx status code') as Error & { context: Response }
  err.context = new Response(body, { status })
  return err
}

function clientReturning(result: { data: unknown; error: unknown }) {
  return { functions: { invoke: vi.fn().mockResolvedValue(result) } }
}

beforeEach(() => captureException.mockClear())

describe('reportInvokeError', () => {
  it('returns null and reports nothing on success', async () => {
    expect(await reportInvokeError('c', 'send-email', null, { success: true })).toBeNull()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('reads the real status and body off FunctionsHttpError.context', async () => {
    const detail = await reportInvokeError('c', 'send-email', functionsHttpError(401, '{"error":"Missing authorization"}'))
    // Without the .context read this is "Edge Function returned a non-2xx status
    // code", which is the entire content of Sentry COEXIST-1B.
    expect(detail).toBe('401: {"error":"Missing authorization"}')
    expect(captureException).toHaveBeenCalledTimes(1)
  })

  it('keeps the base message when the context body cannot be read', async () => {
    const err = new Error('boom') as Error & { context: Response }
    err.context = { status: 500, text: () => Promise.reject(new Error('consumed')) } as unknown as Response
    expect(await reportInvokeError('c', 'send-email', err)).toBe('boom')
  })

  it('catches the OTHER failure shape: a 200 whose data.error is set', async () => {
    const detail = await reportInvokeError('c', 'send-email', null, { success: false, error: 'Unknown email type: nope' })
    expect(detail).toBe('Unknown email type: nope')
    expect(captureException).toHaveBeenCalledTimes(1)
  })

  it('does not report a 200 whose data.error is empty', async () => {
    expect(await reportInvokeError('c', 'send-email', null, { success: true, error: undefined })).toBeNull()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('reports a plain thrown value that carries no context', async () => {
    expect(await reportInvokeError('c', 'send-push', new Error('network down'))).toBe('network down')
  })
})

describe('invokeAndReport', () => {
  it('reports the resolved error that a bare call site would have dropped', async () => {
    const client = clientReturning({ data: null, error: functionsHttpError(500, 'rate_limit_exceeded') })
    const out = await invokeAndReport('cancelEvent', 'send-email', { body: {} }, client)
    expect(out.ok).toBe(false)
    expect(out.detail).toBe('500: rate_limit_exceeded')
    expect(captureException).toHaveBeenCalledTimes(1)
  })

  it('is ok on a clean call', async () => {
    const client = clientReturning({ data: { success: true }, error: null })
    expect(await invokeAndReport('c', 'send-email', { body: {} }, client)).toEqual({ ok: true, detail: null })
    expect(captureException).not.toHaveBeenCalled()
  })

  it('never rejects, because a failed notification must not roll back its mutation', async () => {
    const client = { functions: { invoke: vi.fn().mockRejectedValue(new Error('CORS preflight refused')) } }
    const out = await invokeAndReport('c', 'send-email', { body: {} }, client)
    expect(out).toEqual({ ok: false, detail: 'CORS preflight refused' })
  })

  it('surfaces an application failure delivered with a 200', async () => {
    const client = clientReturning({ data: { success: false, error: 'No recipient email' }, error: null })
    const out = await invokeAndReport('c', 'send-email', { body: {} }, client)
    expect(out).toEqual({ ok: false, detail: 'No recipient email' })
  })
})
