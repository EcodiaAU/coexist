import { useEffect, useLayoutEffect, type RefObject } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Per-history-entry scroll save/restore for the Page scroll container.
 *
 * Kurt (2026-08-12): lists that lead into nested detail pages must remember
 * where you were when you come back. The KeepAlive cache that used to give
 * this for free was removed to match the Chambers fire-and-forget nav feel
 * (see page.tsx history), which also killed the back-nav scroll hop. This
 * restores it without KeepAlive by saving the scrollTop of the inner scroll
 * container against the router's location.key.
 *
 * Why location.key and not pathname: the same path can appear at multiple
 * points in the history stack (list -> detail -> back to a DIFFERENT list
 * instance of the same route). location.key is unique per history entry, so
 * each entry restores its own position and forward navigations always start
 * at the top.
 *
 * Restore only fires on POP (back/forward gesture or hardware back). PUSH and
 * REPLACE start at the top, matching the expectation that opening something
 * new shows it from the top.
 */
const store = new Map<string, number>()

export function useScrollRestoration(ref: RefObject<HTMLElement | null>) {
  const location = useLocation()
  const navType = useNavigationType() // 'POP' | 'PUSH' | 'REPLACE'
  const key = location.key

  // Save: rAF-throttled on scroll, plus a final save on unmount so the very
  // last position before navigating away is captured.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (ref.current) store.set(key, ref.current.scrollTop)
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
      if (ref.current) store.set(key, ref.current.scrollTop)
    }
  }, [ref, key])

  // Restore on POP; reset to top otherwise. Content often mounts shorter than
  // its final height (data/images still loading), so a single scrollTop set
  // can clamp short. Retry across a few frames until the target is reachable
  // or a ~0.6s budget elapses.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const saved = store.get(key)
    if (navType === 'POP' && saved != null && saved > 0) {
      let frames = 0
      const tryRestore = () => {
        const node = ref.current
        if (!node) return
        node.scrollTop = saved
        frames += 1
        if (Math.abs(node.scrollTop - saved) > 2 && frames < 40) {
          requestAnimationFrame(tryRestore)
        }
      }
      requestAnimationFrame(tryRestore)
    } else if (navType !== 'POP') {
      el.scrollTop = 0
    }
    // key is the only dependency that should re-run restoration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
