import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * Subscribe to a Supabase realtime channel and surface status changes.
 *
 * Earlier versions of this helper ran their own retry loop that called
 * `channel.unsubscribe()` followed by `channel.subscribe(...)` on the same
 * channel instance. Phoenix (Supabase Realtime's transport) rejects a second
 * `subscribe`/`join` on the same channel with:
 *
 *   "Tried to join multiple times. 'join' can only be called a single time
 *    per channel instance"
 *
 * which surfaced as an unhandled error and painted over the React tree via
 * the boot-error overlay in iOS 1.8.21. Re-joining a Realtime channel
 * requires creating a fresh channel from `supabase.channel(...)`, not
 * recycling the old instance.
 *
 * The retry layer was also redundant: @supabase/realtime-js v2 already
 * reconnects the underlying WebSocket and re-joins all channels on its own
 * exponential backoff. Wrapping a second backoff around that fights its
 * lifecycle and produces the double-join above.
 *
 * Net behaviour now: subscribe once, surface status to the caller, clean up
 * on teardown. Let the socket layer handle reconnection.
 *
 * Usage:
 *   const channel = supabase.channel('my-channel').on(...)
 *   const cleanup = subscribeWithReconnect(channel, { onStatusChange })
 *   // later: cleanup(); supabase.removeChannel(channel)
 */
export function subscribeWithReconnect(
  channel: RealtimeChannel,
  options?: {
    /** Called when subscription status changes */
    onStatusChange?: (status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR') => void
    /** Retained for call-site compatibility; ignored (see comment above). */
    maxRetries?: number
  },
): () => void {
  let isCleanedUp = false

  channel.subscribe((status) => {
    if (isCleanedUp) return
    options?.onStatusChange?.(status)
  })

  return () => {
    isCleanedUp = true
    // Best-effort: unsubscribe always returns a Promise in v2.
    // Swallow rejections so a teardown race never bubbles up as an
    // unhandledrejection (which the boot-error overlay treats as fatal).
    try {
      const result = channel.unsubscribe() as unknown
      if (result && typeof (result as { catch?: unknown }).catch === 'function') {
        ;(result as Promise<unknown>).catch(() => { /* ignore */ })
      }
    } catch {
      // ignore - teardown is best-effort
    }
  }
}
