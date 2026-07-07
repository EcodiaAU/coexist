// _shared/sentry.ts
// Unified Ecodia Sentry bug-wall - Supabase Edge Function (Deno) error capture.
// Built 2026-07-07 (EDGE worker). Reports uncaught handler errors into this
// app's existing Sentry project, tagged environment=edge-function +
// function=<name>, then re-throws so the runtime still returns its 500.
//
// DSN is injected as the SENTRY_DSN function secret (a public send-only key).
// If SENTRY_DSN is unset the wrapper is a transparent pass-through, so local
// dev and any un-provisioned project keep working unchanged.
import * as Sentry from "https://esm.sh/@sentry/deno@10.63.0";

let _initialised = false;

function ensureInit(): boolean {
  const dsn = Deno.env.get("SENTRY_DSN");
  if (!dsn) return false;
  if (!_initialised) {
    Sentry.init({
      dsn,
      environment: "edge-function",
      // Edge isolates are short-lived; we only want error capture, so disable
      // performance tracing to keep cold-start + payload minimal.
      tracesSampleRate: 0,
      release: Deno.env.get("SENTRY_RELEASE") || undefined,
    });
    _initialised = true;
  }
  return true;
}

type Handler = (req: Request) => Response | Promise<Response>;

/**
 * Wrap a Deno.serve handler so any uncaught error is reported to Sentry
 * (tagged function=<name>, environment=edge-function) then re-thrown.
 *
 *   Deno.serve(withSentry("my-fn", async (req) => { ... }))
 */
export function withSentry(functionName: string, handler: Handler): Handler {
  const active = ensureInit();
  return async (req: Request): Promise<Response> => {
    if (!active) return await handler(req);
    try {
      return await handler(req);
    } catch (err) {
      Sentry.withScope((scope) => {
        scope.setTag("function_name", functionName);
        scope.setContext("request", { url: req.url, method: req.method });
        Sentry.captureException(err);
      });
      // The isolate can be frozen immediately after the response resolves;
      // flush the event before we re-throw.
      await Sentry.flush(2000);
      throw err;
    }
  };
}

// Re-export the SDK for functions that want to capture handled errors
// (inside a caught branch) without going through the wrapper.
export { Sentry };
