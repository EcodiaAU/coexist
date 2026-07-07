import { useEffect, type RefObject } from 'react'

/**
 * Universal overscroll bounce (touch-driven, top + bottom).
 *
 * Same reason as the stretchy hero: the mobile shell is overflow-hidden at fixed
 * 100dvh and the real scroller is an inner `#main-content` div, which WKWebView
 * never rubber-bands natively. This synthesises the bounce for EVERY page: when
 * the scroller is at a bound and the finger drags past it, we translate the
 * scroll-content wrapper with a damped rubber-band curve and spring it back on
 * release. Pinned background + sticky footer live outside the wrapper, so they
 * stay put and the bounce reveals the page's own background, never white.
 *
 * Coordination with the stretchy hero: on hero pages `attachStretchyPull` sets
 * `scroller.dataset.stretchyHero`, and this hook then leaves the TOP edge to the
 * hero (height-grow) and only owns the BOTTOM. Non-hero pages get both edges.
 */

const RUBBER_COEFF = 0.55
const MAX_PULL = 150 // asymptotic bounce distance (px)

function rubberBand(delta: number): number {
  if (delta <= 0) return 0
  return (delta * MAX_PULL * RUBBER_COEFF) / (MAX_PULL + RUBBER_COEFF * delta)
}

export function attachOverscrollBounce(
  scroller: HTMLElement,
  content: HTMLElement,
  opts: { top: boolean; bottom: boolean },
): () => void {
  let startY = 0
  let armed = false
  let active = false
  let dir: 0 | 1 | -1 = 0 // 1 = pulling top down, -1 = pulling bottom up

  const atTop = () => scroller.scrollTop <= 0
  const atBottom = () =>
    scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1

  // Top is deferred to the stretchy hero when one is mounted on this scroller.
  const topEnabled = () => opts.top && !scroller.dataset.stretchyHero

  const setY = (y: number) => {
    content.style.transform = y === 0 ? '' : `translateY(${y}px)`
  }

  const onStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return
    startY = e.touches[0].clientY
    armed = true
    active = false
    dir = 0
    content.style.transition = 'none'
  }

  const onMove = (e: TouchEvent) => {
    if (!armed) return
    const dy = e.touches[0].clientY - startY
    if (!active) {
      if (dy > 0 && atTop() && topEnabled()) dir = 1
      else if (dy < 0 && atBottom() && opts.bottom) dir = -1
      else return // normal scroll: leave it to the browser
      active = true
    }
    if (dir === 1) {
      if (dy <= 0) { setY(0); active = false; return }
      e.preventDefault()
      setY(rubberBand(dy))
    } else if (dir === -1) {
      if (dy >= 0) { setY(0); active = false; return }
      e.preventDefault()
      setY(-rubberBand(-dy))
    }
  }

  const onEnd = () => {
    if (!armed) return
    armed = false
    if (!active) return
    active = false
    content.style.transition = 'transform 450ms cubic-bezier(0.16, 1, 0.3, 1)'
    setY(0)
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
    content.style.transform = ''
    content.style.transition = ''
  }
}

/** Wire the bounce to a scroller + its scroll-content wrapper. */
export function useScrollBounce(
  scrollRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  opts: { top?: boolean; bottom?: boolean } = {},
) {
  const top = opts.top ?? true
  const bottom = opts.bottom ?? true
  useEffect(() => {
    const scroller = scrollRef.current
    const content = contentRef.current
    if (!scroller || !content) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!('ontouchstart' in window) && navigator.maxTouchPoints === 0) return
    return attachOverscrollBounce(scroller, content, { top, bottom })
  }, [scrollRef, contentRef, top, bottom])
}
