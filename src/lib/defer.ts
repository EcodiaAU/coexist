/**
 * Defer work off the current (synchronous) tick so it does not block the
 * critical path.
 *
 * Used on the native app-resume path. After a long background iOS jettisons the
 * WKWebView WebContent process under memory pressure; on resume WebKit must
 * relaunch and re-render it, and the native main thread parks waiting on that
 * IPC (Sentry COEXIST-K, issue 7616758580, Family B:
 * WebKit AuxiliaryProcessProxy::sendWithAsyncReply). Running cache
 * invalidations, refetch storms, or native-bridge re-registration synchronously
 * inside the `resume` tick piles onto that contention and lengthens the visible
 * hang. Deferring lets first paint happen, then does the work when the browser
 * is idle.
 *
 * Prefers requestIdleCallback (fires when the main thread is genuinely idle,
 * with a timeout ceiling so the work is never starved) and falls back to a
 * macrotask on engines that lack it (older iOS Safari / WKWebView).
 */
export function scheduleIdle(cb: () => void, timeout = 500): void {
  const ric = (
    globalThis as {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout?: number },
      ) => number
    }
  ).requestIdleCallback
  if (typeof ric === 'function') {
    ric(() => cb(), { timeout })
  } else {
    setTimeout(cb, 0)
  }
}
