import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { useQueryClient } from '@tanstack/react-query'
import * as Sentry from '@sentry/capacitor'
import { scheduleIdle } from '@/lib/defer'

/**
 * Query-key prefixes that must be fresh the moment the app returns to the
 * foreground: chat, unread badges, notifications, updates and the home feed.
 * These are the "what changed while I was away" surfaces a returning user looks
 * at first. Everything else (event lists, leader dashboards, admin suite,
 * profiles, collectives) keeps its normal staleTime (5 min, set in main.tsx)
 * and refetches lazily when its screen is next mounted, so a resume does not
 * fire a full-cache refetch storm on the already-contended main thread.
 * Origin: Sentry COEXIST-K resume hang, issue 7616758580.
 */
const RESUME_REFRESH_PREFIXES = new Set([
  'home',
  'chat-messages',
  'channel-messages',
  'chat-poll',
  'unread-counts',
  'channel-unread',
  'notifications',
  'notifications-unread',
  'updates-unread',
  'my-events',
  'my-tasks',
  // Event-day is the live check-in gate. A leader who backgrounds the app
  // mid-event and comes back must not be shown the roster and walk-in tallies
  // from before they left, which is what happened at the Darwin East Point
  // Beach Clean Up on 2026-08-30.
  'event-roster',
  'event-walk-ins',
])

/** A resume that takes at least this long to settle is the COEXIST-K signature. */
const SLOW_RESUME_THRESHOLD_MS = 2000

/**
 * Handles native app lifecycle events (pause/resume).
 *
 * On resume the previous behaviour was a synchronous, blanket
 * `queryClient.invalidateQueries()` (every query in the cache) fired inside the
 * `resume` tick. After a long background iOS jettisons the WKWebView
 * WebContent process; on resume WebKit must relaunch and re-render it, and the
 * native main thread parks waiting on that IPC (Sentry COEXIST-K, issue
 * 7616758580, Family B: WebKit AuxiliaryProcessProxy::sendWithAsyncReply).
 * Dumping a full invalidate + refetch storm into that same tick lengthens the
 * visible hang.
 *
 * Now the invalidation is (1) deferred off the synchronous resume tick so first
 * paint is not blocked, and (2) narrowed to the freshness-critical prefixes
 * above so resume does not refetch every batch query at once. The whole window
 * is wrapped in a Sentry span (`app.resume.web-rehydrate`) plus breadcrumbs and
 * a slow-resume message so native-main-to-web-resume duration is measured on
 * the issue going forward.
 *
 * HONEST CAVEAT: the native WebContent relaunch itself happens while JS is not
 * running, so it is not directly observable from the WebView. This span
 * measures the app-side resume-to-settle window (the portion we control), not
 * the native relaunch latency.
 *
 * Call once in AppShell.
 */
export function useAppLifecycle() {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let resumeHandle: { remove: () => void } | null = null
    let pauseHandle: { remove: () => void } | null = null

    // Dynamic import to match existing pattern and avoid pulling @capacitor/app into main chunk
    import('@capacitor/app').then(({ App }) => {
      App.addListener('resume', () => {
        const startedAt = performance.now()
        const span = Sentry.startInactiveSpan({
          name: 'app.resume.web-rehydrate',
          op: 'app.resume',
          forceTransaction: true,
        })
        Sentry.addBreadcrumb({
          category: 'app.lifecycle',
          message: 'resume: start',
          level: 'info',
        })

        let settled = false
        const settle = () => {
          if (settled) return
          settled = true
          const durationMs = Math.round(performance.now() - startedAt)
          Sentry.addBreadcrumb({
            category: 'app.lifecycle',
            message: 'resume: settled',
            level: 'info',
            data: { duration_ms: durationMs },
          })
          span.setAttribute('duration_ms', durationMs)
          span.end()
          // Breadcrumbs only attach to a co-firing error, and the span is
          // sampled (tracesSampleRate 0.1 in prod). Surface a slow resume as
          // its own searchable event so it is visible on issue 7616758580 even
          // when no hang error is captured.
          if (durationMs >= SLOW_RESUME_THRESHOLD_MS) {
            Sentry.captureMessage(
              `slow app resume web-rehydrate: ${durationMs}ms`,
              'warning',
            )
          }
        }

        // Defer the cache work off the synchronous resume tick so first paint
        // is not blocked by an invalidate/refetch storm while WebKit is still
        // rehydrating the WebContent process.
        scheduleIdle(() => {
          queryClient.invalidateQueries({
            predicate: (query) =>
              RESUME_REFRESH_PREFIXES.has(query.queryKey[0] as string),
          })
          // Approximate "first settle after resume": one paint after the
          // invalidation was dispatched.
          requestAnimationFrame(settle)
        })
        // Safety net: end the span even if a paint never comes because the app
        // was re-backgrounded before settling (rAF does not fire when hidden).
        setTimeout(settle, 5000)
      }).then(h => { resumeHandle = h })

      // Pause: no-op for now. Realtime subscriptions auto-reconnect.
      App.addListener('pause', () => {}).then(h => { pauseHandle = h })
    })

    return () => {
      resumeHandle?.remove()
      pauseHandle?.remove()
    }
  }, [queryClient])
}
