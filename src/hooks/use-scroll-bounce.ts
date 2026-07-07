import { useEffect, type RefObject } from 'react'

/**
 * Universal overscroll bounce (touch-driven, bottom by default).
 *
 * Same reason as the stretchy hero: the mobile shell is overflow-hidden at fixed
 * 100dvh and the real scroller is an inner overflow:auto div, which WKWebView
 * never rubber-bands. We synthesise the bounce from touch events.
 *
 * SEAMLESS ENGAGEMENT: the bounce engages the moment the content reaches the
 * bound DURING a continuous drag (not only if the finger started at the bound),
 * anchored at the finger position at that instant so it starts from 0 with no
 * jump. That is what makes it feel bouncy from the first pull instead of hitting
 * a hard ceiling first.
 *
 * The pinned background + sticky footer live outside the translated wrapper, so
 * the bounce reveals the page's own background, never white. On hero pages
 * `attachStretchyPull` sets `dataset.stretchyHero`, so this leaves the TOP to
 * the hero height-grow and only owns the bottom.
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
  let lastY = 0
  let engaged: 'top' | 'bottom' | null = null
  let anchorY = 0

  const topEnabled = () => opts.top && !scroller.dataset.stretchyHero

  const onStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return
    lastY = e.touches[0].clientY
    engaged = null
    content.style.transition = 'none'
  }

  const onMove = (e: TouchEvent) => {
    if (e.touches.length !== 1) return
    const y = e.touches[0].clientY
    const max = scroller.scrollHeight - scroller.clientHeight

    if (!engaged) {
      const movingUp = y < lastY
      const movingDown = y > lastY
      lastY = y
      if (opts.bottom && movingUp && scroller.scrollTop >= max - 1) {
        engaged = 'bottom'
        anchorY = y
      } else if (topEnabled() && movingDown && scroller.scrollTop <= 0) {
        engaged = 'top'
        anchorY = y
      } else {
        return // let the browser scroll normally
      }
    }

    if (engaged === 'bottom') {
      const raw = anchorY - y
      if (raw < 0) {
        content.style.transform = ''
        engaged = null
        lastY = y
        return
      }
      e.preventDefault()
      content.style.transform = `translateY(${-rubberBand(raw)}px)`
    } else {
      const raw = y - anchorY
      if (raw < 0) {
        content.style.transform = ''
        engaged = null
        lastY = y
        return
      }
      e.preventDefault()
      content.style.transform = `translateY(${rubberBand(raw)}px)`
    }
    lastY = y
  }

  const onEnd = () => {
    if (!engaged) return
    engaged = null
    content.style.transition = 'transform 450ms cubic-bezier(0.16, 1, 0.3, 1)'
    content.style.transform = ''
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
