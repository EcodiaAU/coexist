import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const EDGE_PX = 32 // how close to the left edge the gesture must start
const TRIGGER_PX = 80 // horizontal travel needed to fire
const MAX_VERTICAL = 40 // bail if the gesture is mostly vertical (it's a scroll)

/**
 * Safari-style edge swipe-to-go-back. A horizontal drag that STARTS within
 * EDGE_PX of the left screen edge and travels right past TRIGGER_PX calls
 * navigate(-1). No live interactive drag, no parallax, no spring snap -
 * AnimatedOutlet (src/components/animated-outlet.tsx) handles the brief
 * fade-up enter / fade-down exit inside each layout shell, identical to the
 * Chambers app's PageFrame.
 *
 * Capacitor iOS webviews do not provide native swipe-back, so the app has
 * to supply it. Gated to left-edge starts so it never competes with normal
 * horizontal content (carousels, the side sheet) or vertical scrolling.
 *
 * A fullscreen overlay (photo carousel lightbox, video viewer, etc) can
 * opt out by setting `<body data-suppress-swipe-back="true">`. Without
 * this, horizontal swipes inside the carousel that start near the left
 * edge would also trigger a page-back navigation.
 */
export function useSwipeBack(): void {
  const navigate = useNavigate()

  useEffect(() => {
    let startX = 0
    let startY = 0
    let tracking = false

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        tracking = false
        return
      }
      if (typeof document !== 'undefined' && document.body.dataset.suppressSwipeBack === 'true') {
        tracking = false
        return
      }
      const t = e.touches[0]
      tracking = t.clientX <= EDGE_PX
      startX = t.clientX
      startY = t.clientY
    }

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return
      tracking = false
      const t = e.changedTouches[0]
      if (!t) return
      const dx = t.clientX - startX
      const dy = Math.abs(t.clientY - startY)
      if (dx >= TRIGGER_PX && dy <= MAX_VERTICAL) {
        navigate(-1)
      }
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchend', onEnd)
    }
  }, [navigate])
}
