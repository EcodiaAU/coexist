// _shared/sentry.ts - Unified Sentry bug-wall, Deno edge-function error capture.
//
// Every edge function reports into the app's ONE Sentry project (env SENTRY_DSN),
// separated from the web + native surfaces by environment='edge-function' plus a
// per-function tag. Wrap a Deno.serve handler:
//
//   import { withSentry } from '../_shared/sentry.ts'
//   Deno.serve(withSentry('my-function', async (req) => { ... }))
//
// For handlers that catch their own errors and return a 500 (most of ours do),
// also call captureEdgeError(fnName, err) in the catch block so the swallowed
// error still reaches the wall.
//
// Secret:  supabase secrets set SENTRY_DSN=<app dsn> --project-ref <project-ref>
// If SENTRY_DSN is unset the wrapper is a transparent no-op (safe by default).
//
// defaultIntegrations:false is required for the restricted Supabase edge runtime
// (the default Deno context/globalHandlers integrations touch APIs the isolate
// does not grant); we capture explicitly instead.

import * as Sentry from 'https://deno.land/x/sentry@8.55.0/index.mjs'

const DSN = Deno.env.get('SENTRY_DSN')
let initialised = false

function ensureInit(): void {
  if (initialised) return
  initialised = true
  if (!DSN) return
  Sentry.init({
    dsn: DSN,
    environment: 'edge-function',
    defaultIntegrations: false,
    tracesSampleRate: 0,
  })
}

type Handler = (req: Request) => Response | Promise<Response>

export function withSentry(fnName: string, handler: Handler): Handler {
  return async (req: Request): Promise<Response> => {
    ensureInit()
    try {
      return await handler(req)
    } catch (err) {
      captureEdgeError(fnName, err, { method: req.method, url: req.url })
      throw err
    }
  }
}

// Manual capture for handlers that swallow errors and return their own 500.
export function captureEdgeError(
  fnName: string,
  err: unknown,
  extra?: Record<string, unknown>,
): void {
  ensureInit()
  if (!DSN) return
  try {
    Sentry.withScope((scope) => {
      scope.setTag('function', fnName)
      scope.setTag('environment', 'edge-function')
      if (extra) scope.setContext('request', extra)
      Sentry.captureException(err)
    })
    // best-effort delivery before the isolate is torn down
    Sentry.flush(2000)
  } catch (_) {
    // never let telemetry break the function
  }
}

export { Sentry }
