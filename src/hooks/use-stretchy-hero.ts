import { useCallback, useRef } from 'react'

/**
 * Stretchy hero (touch-driven, iOS App-Store-style pull-to-stretch).
 *
 * WHY TOUCH-DRIVEN, NOT NATIVE BOUNCE: on mobile the app shell is
 * `overflow-hidden` at a fixed 100dvh and the real scroller is the inner
 * `#main-content` div. Modern iOS WKWebView only rubber-bands its own
 * top-level scroll view, never an inner `overflow:auto` container, so there is
 * no native bounce to lean on. We synthesise the pull ourselves: while the
 * scroller is at the top and the finger drags down, we grow the hero box's
 * height with a damped rubber-band curve (so content below rides down with it)
 * and spring it back on release. Because it is plain touch + layout, it is
 * verifiable in Chrome touch-emulation, not only on-device.
 *
 * Attach the returned ref to the HERO BOX (the element whose height defines the
 * hero and that contains the object-cover image). The image + gradient fill it
 * (`absolute inset-0`), so they cover the extra height with no gap. A
 * bottom-anchored title rides down with the box, which is the intended feel.
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
  let baseH = 0 // measured hero height at gesture start (px)
  let startY = 0
  let armed = false
  let pulling = false

  // Tell the universal overscroll bounce (useScrollBounce) to leave the TOP
  // edge to us; it keeps the bottom.
  scroller.dataset.stretchyHero = '1'

  const setHeight = (h: number | null) => {
    if (h == null) {
      hero.style.height = ''
      hero.style.transition = ''
    } else {
      hero.style.height = `${h}px`
    }
  }

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return
    if (scroller.scrollTop > 0) return
    baseH = hero.getBoundingClientRect().height
    if (baseH <= 0) return
    startY = e.touches[0].clientY
    armed = true
    pulling = false
    hero.style.transition = 'none'
  }

  const onTouchMove = (e: TouchEvent) => {
    if (!armed) return
    // If the user has scrolled into content, hand back to native scroll.
    if (scroller.scrollTop > 1) {
      if (pulling) release()
      armed = false
      return
    }
    const dy = e.touches[0].clientY - startY
    if (dy > 0) {
      // Actively pulling the top down: take over so the scroller does nothing.
      e.preventDefault()
      pulling = true
      const pull = rubberBand(dy, baseH * RUBBER_COEFF)
      setHeight(baseH + pull)
    } else if (pulling) {
      // Reversed back to the top: collapse the stretch, release to native.
      setHeight(baseH)
      pulling = false
    }
  }

  const release = () => {
    // Spring the hero back to its natural height, then let CSS reclaim it.
    hero.style.transition = 'height 480ms cubic-bezier(0.16, 1, 0.3, 1)'
    setHeight(baseH)
    const done = () => {
      hero.removeEventListener('transitionend', done)
      setHeight(null) // clear inline height + transition so CSS/aspect-ratio owns it again
    }
    hero.addEventListener('transitionend', done)
    pulling = false
  }

  const onTouchEnd = () => {
    if (!armed) return
    armed = false
    if (pulling) release()
  }

  scroller.addEventListener('touchstart', onTouchStart, { passive: true })
  scroller.addEventListener('touchmove', onTouchMove, { passive: false })
  scroller.addEventListener('touchend', onTouchEnd, { passive: true })
  scroller.addEventListener('touchcancel', onTouchEnd, { passive: true })

  return () => {
    scroller.removeEventListener('touchstart', onTouchStart)
    scroller.removeEventListener('touchmove', onTouchMove)
    scroller.removeEventListener('touchend', onTouchEnd)
    scroller.removeEventListener('touchcancel', onTouchEnd)
    setHeight(null)
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
