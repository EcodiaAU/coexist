import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { useEffect } from 'react'
import { ToastProvider, useToast } from '@/components/toast'

/**
 * Regression: Sentry COEXIST-N (issue 7618256794) "Maximum update depth exceeded".
 *
 * ToastProvider used to recreate its `toast` API object and its context value
 * ({ toast }) on every render. Because add()/setToasts re-renders the provider,
 * `toast`'s identity churned on every toast. Any consumer that (correctly, per
 * react-hooks/exhaustive-deps) lists `toast` in an effect's dependency array and
 * calls toast.* inside that effect then looped: effect -> toast.success -> add ->
 * setToasts -> provider re-render -> new `toast` ref -> effect deps changed ->
 * effect re-fires -> ... until React aborts with "Maximum update depth exceeded".
 * The real-world trigger was use-sync-manager's runSync (toast.success('Back
 * online') on reconnect/foreground), whose runSync useCallback depends on `toast`.
 *
 * The fix memoises `toast` and the context value so their identity is stable, so a
 * `toast` dependency no longer re-fires consumer effects when a toast is shown.
 *
 * This test mounts that exact consumer shape. With the churn bug it exceeds the
 * update depth (render throws / the effect fires hundreds of times); with the fix
 * the effect fires exactly once and the tree renders.
 */

let effectRuns = 0

function SyncManagerLikeConsumer() {
  const { toast } = useToast()
  // Mirrors use-sync-manager: an effect that shows a toast, with `toast` in deps.
  useEffect(() => {
    effectRuns += 1
    toast.success('Back online', { duration: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast])
  return <span data-testid="ok">ok</span>
}

afterEach(() => {
  cleanup()
  effectRuns = 0
})

describe('ToastProvider stable identity (COEXIST-N max-update-depth regression)', () => {
  it('does not loop when a consumer effect depends on `toast` and calls it', () => {
    expect(() =>
      render(
        <ToastProvider>
          <SyncManagerLikeConsumer />
        </ToastProvider>,
      ),
    ).not.toThrow()

    // With a stable toast identity the effect settles immediately. A churning
    // identity would re-fire it unboundedly (React caps nested updates ~50 then
    // throws), so any value above a couple of runs is the bug resurfacing.
    expect(effectRuns).toBeLessThanOrEqual(2)
  })
})
