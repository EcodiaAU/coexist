import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'
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

/**
 * Jump, never glide. globals.css gives every .overflow-y-auto container
 * `scroll-behavior: smooth`, so a plain `el.scrollTop = n` ANIMATES: a back
 * swipe showed the list at the top and then slid down to where you were, and
 * a forward admin-to-admin nav slid up to the top (Tate 2026-09-28, admin
 * events swipe-back must feel continuous). An explicit `behavior: 'instant'`
 * overrides the CSS. The typeof guard keeps jsdom, which has no
 * Element.scrollTo, on the plain assignment.
 */
function jumpTo(el: HTMLElement, top: number) {
  if (typeof el.scrollTo === 'function') el.scrollTo({ top, behavior: 'instant' as ScrollBehavior })
  else el.scrollTop = top
}

/**
 * The history entry the browser is on right now. BrowserRouter keeps its entry
 * key in history.state; the very first entry carries none and the router calls
 * it 'default'.
 */
function liveEntryKey(): string {
  const state = window.history.state as { key?: string } | null
  return state?.key ?? 'default'
}

// Budget for holding a restored position while the page settles (~0.65s).
const RESTORE_FRAMES = 40
const USER_SCROLL_EVENTS = ['touchstart', 'wheel', 'pointerdown', 'keydown'] as const

export function useScrollRestoration(ref: RefObject<HTMLElement | null>) {
  const location = useLocation()
  const navType = useNavigationType() // 'POP' | 'PUSH' | 'REPLACE'
  const key = location.key

  // Do nothing while this page animates out. AnimatedOutlet keys every page
  // by pathname and keeps the leaving one mounted for its exit fade, still
  // reading the LIVE location. Without this, the event page you swipe back
  // from adopted the admin list's entry for that fade: it restored the list's offset onto its own shorter container,
  // clamped, and saved the clamp over the list's value, so the list came back
  // hundreds of px short (Tate 2026-09-28). A different pathname can only mean
  // this instance is leaving; a search-param change on the same pathname is a
  // real new entry for it.
  const [mountPath] = useState(location.pathname)
  const leaving = location.pathname !== mountPath

  // Save on every scroll event, but ONLY while the browser is still on this
  // entry. A shell that stays mounted for the route-exit animation keeps
  // getting scroll events after the navigation: leaving admin events for a
  // public event page, the admin hero grows its back button (+56px) and scroll
  // anchoring moves the list to match, which saved an offset 56px past where
  // you were (Tate 2026-09-28). For the same reason there is no read on
  // cleanup: by the time it runs the layout has already moved. A Map write per
  // scroll event is cheap enough to need no throttle.
  useEffect(() => {
    const el = ref.current
    if (!el || leaving) return
    const onScroll = () => {
      if (liveEntryKey() === key) store.set(key, el.scrollTop)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [ref, key, leaving])

  // Restore on POP; reset to top otherwise. The page mounts shorter than it
  // will be (the admin hero arrives an effect later, data and images load), so
  // the restore turns scroll anchoring off and HOLDS the saved offset for the
  // whole settle window rather than stopping at the first frame it fits: with
  // anchoring on, content arriving above the viewport dragged the offset with
  // it and the list landed ~420px past the saved spot. The saved offset was
  // taken against the fully settled layout, so holding it is correct. Any
  // touch, wheel, pointer or key input hands control straight back.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || leaving) return
    const saved = store.get(key)
    if (navType !== 'POP') {
      jumpTo(el, 0)
      return
    }
    if (saved == null || saved <= 0) return

    const prevAnchor = el.style.overflowAnchor
    el.style.overflowAnchor = 'none'
    let frames = 0
    let raf = 0
    let done = false
    const stop = () => {
      if (done) return
      done = true
      if (raf) cancelAnimationFrame(raf)
      el.style.overflowAnchor = prevAnchor
      USER_SCROLL_EVENTS.forEach((t) => el.removeEventListener(t, stop))
    }
    USER_SCROLL_EVENTS.forEach((t) => el.addEventListener(t, stop, { passive: true }))
    const hold = () => {
      raf = 0
      if (done) return
      if (Math.abs(el.scrollTop - saved) > 2) jumpTo(el, saved)
      frames += 1
      if (frames < RESTORE_FRAMES) raf = requestAnimationFrame(hold)
      else stop()
    }
    raf = requestAnimationFrame(hold)
    return stop
    // a new entry (or leaving) is the only thing that should re-run restoration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, leaving])
}
