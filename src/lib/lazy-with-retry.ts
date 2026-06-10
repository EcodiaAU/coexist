import { lazy, type ComponentType } from 'react'

/**
 * Drop-in replacement for React.lazy that:
 *
 * 1. Retries a failed dynamic import up to `maxRetries` times with backoff
 *    (covers transient network blips).
 * 2. If it still can't load and the failure looks like a Vite chunk-hash
 *    mismatch ("Failed to fetch dynamically imported module"), it hard-reloads
 *    the page once so the browser picks up the new asset manifest.
 *
 * Why this exists: after a fresh deploy, any client still holding the OLD
 * `index.html`/asset manifest will try to fetch chunks with old hashed
 * filenames (e.g. `map-view-inner-BtVAFhm2.js`). Those no longer exist on
 * the CDN, so the import rejects and the user hits the ErrorBoundary. A
 * one-shot reload fixes it for 99% of cases - the user gets the new client
 * and everything just works.
 *
 * The reload is gated behind sessionStorage so we don't loop forever if
 * something else is actually broken.
 */

const RELOAD_GUARD_KEY = 'coexist-chunk-reload-attempted'

function isChunkLoadError(err: unknown): boolean {
  if (!err) return false
  const msg = err instanceof Error ? err.message : String(err)
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    // Firefox / Safari variants
    /ChunkLoadError/i.test(msg) ||
    /Loading chunk \d+ failed/i.test(msg)
  )
}

async function retryImport<T>(
  factory: () => Promise<T>,
  maxRetries: number,
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await factory()
    } catch (err) {
      lastErr = err
      if (attempt < maxRetries) {
        // Small backoff: 200ms, 500ms
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1) + 100 * attempt))
      }
    }
  }

  if (isChunkLoadError(lastErr) && typeof window !== 'undefined') {
    let alreadyReloaded = false
    try { alreadyReloaded = sessionStorage.getItem(RELOAD_GUARD_KEY) === '1' } catch { /* private mode */ }

    if (!alreadyReloaded) {
      try { sessionStorage.setItem(RELOAD_GUARD_KEY, '1') } catch { /* private mode */ }
      // Returning a never-resolving promise so React doesn't surface an
      // ErrorBoundary flash before the reload takes effect.
      window.location.reload()
      return new Promise<T>(() => {})
    }
    // We already tried reloading in this session - stop the loop and let
    // ErrorBoundary catch it so the user gets the proper error screen with
    // a manual reload button.
  }

  throw lastErr
}

// Matches React.lazy's signature so callers can swap `lazy` for
// `lazyWithRetry` with zero type friction. The `any` here mirrors
// React's own lazy typing - it's a generic component factory.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  maxRetries = 2,
) {
  return lazy(() => retryImport(factory, maxRetries))
}

/**
 * Clears the reload guard. Call this once the app has successfully mounted
 * so a future deploy triggers another reload attempt instead of skipping.
 */
export function clearChunkReloadGuard(): void {
  try { sessionStorage.removeItem(RELOAD_GUARD_KEY) } catch { /* noop */ }
}
