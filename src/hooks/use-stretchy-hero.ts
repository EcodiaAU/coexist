import { useCallback, useRef } from 'react'

/**
 * Stretchy hero (touch-driven, iOS App-Store-style pull-to-stretch).
 *
 * WHY TOUCH-DRIVEN, NOT NATIVE BOUNCE: on mobile the app shell is
 * `overflow-hidden` at a fixed 100dvh and the real scroller is an inner
 * `overflow:auto` div. Modern iOS WKWebView only rubber-bands its own top-level
 * scroll view, never an inner container, so there is no native bounce to lean
 * on. We synthesise the pull from touch events.
 *
 * SEAMLESS ENGAGEMENT: the pull engages the moment the content reaches the top
 * DURING a continuous drag (not only if the finger already started at the top),
 * and the stretch is measured from the finger position AT that moment (dynamic
 * anchor) so there is no jump. That is what makes it bounce from the first pull
 * instead of "hit the ceiling, lift, pull again".
 *
 * Attach the returned ref to the HERO BOX (the element whose height defines the
 * hero and contains the object-cover image). The image + gradient fill the
 * extra height, so growing it reveals nothing; a bottom-anchored title rides
 * down with the box.
 */

const RUBBER_COEFF = 0.6 // small-pull slope + asymptote fraction of hero height

// iOS-style rubber-band resistance: soft at first, asymptotes to `dim`.
function rubberBand(delta: number, dim: number): number {
  if (delta <= 0 || dim <= 0) return 0
  return (delta * dim * RUBBER_COEFF) / (dim + RUBBER_COEFF * delta)
}

/**
 * Framework-agnostic core so the exact production logic can be exercised by a
 * headless touch harness. Returns a cleanup function.
 */
export function attachStretchyPull(scroller: HTMLElement, hero: HTMLElement): () => void {
  let lastY = 0
  let engaged = false
  let anchorY = 0 // finger Y at the moment overscroll engaged
  let baseH = 0 // hero height at engagement

  // Tell the universal overscroll bounce (useScrollBounce) to leave the TOP
  // edge to us; it keeps the bottom.
  scroller.dataset.stretchyHero = '1'

  const onStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return
    lastY = e.touches[0].clientY
    engaged = false
    hero.style.transition = 'none'
  }

  const onMove = (e: TouchEvent) => {
    if (e.touches.length !== 1) return
    const y = e.touches[0].clientY

    if (!engaged) {
      const movingDown = y > lastY
      lastY = y
      // Engage the instant the scroller is at the top and the finger is still
      // pulling down, wherever the drag began. Anchor here so pull starts at 0.
      if (scroller.scrollTop <= 0 && movingDown) {
        engaged = true
        anchorY = y
        baseH = hero.getBoundingClientRect().height || 1
      } else {
        return // let the browser scroll normally
      }
    }

    const raw = y - anchorY
    if (raw < 0) {
      // Finger returned above the anchor: collapse, hand back to scroll.
      hero.style.height = ''
      engaged = false
      lastY = y
      return
    }
    // raw === 0 on the engagement event: stay engaged, grow by 0 (no jump).
    e.preventDefault()
    hero.style.height = `${baseH + rubberBand(raw, baseH * RUBBER_COEFF)}px`
    lastY = y
  }

  const onEnd = () => {
    if (!engaged) return
    engaged = false
    hero.style.transition = 'height 480ms cubic-bezier(0.16, 1, 0.3, 1)'
    hero.style.height = `${baseH}px`
    const done = () => {
      hero.removeEventListener('transitionend', done)
      hero.style.height = ''
      hero.style.transition = ''
    }
    hero.addEventListener('transitionend', done)
  }

  scroller.addEventListener('touchstart', onStart, { passive: true })
  scroller.addEventListener('touchmove', onMove, { passive: false })
  scroller.addEventListener('touchend', onEnd, { passive: true })
  scroller.addEventListener('touchcancel', onEnd, { passive: true })

  return () => {
    scroller.removeEventListener('touchstart', onStart)
    scroller.removeEventListener('touchmove', onMove)
    scroller.removeEventListener('touchend', onEnd)
    scroller.removeEventListener('touchcancel', onEnd)
    hero.style.height = ''
    hero.style.transition = ''
    delete scroller.dataset.stretchyHero
  }
}

// Nearest scrollable ancestor of `el`, so a hero works in ANY layout scroller
// (Page's #main-content, admin-layout, leader-layout) without hardcoding an id.
export function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement
  while (node) {
    const oy = getComputedStyle(node).overflowY
    if (oy === 'auto' || oy === 'scroll') return node
    node = node.parentElement
  }
  return document.getElementById('main-content')
}

export function useStretchyHero<T extends HTMLElement = HTMLDivElement>() {
  const cleanupRef = useRef<(() => void) | null>(null)

  // Callback ref so heroes that mount LATE (admin/leader set their header via
  // context after the layout mounts) or REMOUNT on navigation still attach,
  // and detach cleanly when the hero leaves. Stable identity (useCallback [])
  // so React only fires it on actual mount/unmount, not every render.
  return useCallback((node: T | null) => {
    if (cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
    }
    if (!node) return
    const scroller = findScrollParent(node)
    if (!scroller) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // Touch-only feature; pointer/desktop leaves the hero untouched.
    if (!('ontouchstart' in window) && navigator.maxTouchPoints === 0) return
    cleanupRef.current = attachStretchyPull(scroller, node)
  }, [])
}
