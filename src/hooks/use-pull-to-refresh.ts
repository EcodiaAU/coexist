import { useEffect, useRef, useState, type RefObject } from 'react'

const THRESHOLD = 72 // px of pull past which release triggers a refresh
const MAX_PULL = 110 // visual cap on how far the indicator travels
const RESISTANCE = 0.5 // finger-distance -> pull-distance damping

export interface PullToRefreshState {
  /** Current pull distance in px (0..MAX_PULL). */
  pull: number
  /** True while onRefresh() is in flight. */
  refreshing: boolean
  /** Pull distance at which release fires a refresh. */
  threshold: number
}

/**
 * Touch pull-to-refresh for a scroll container. Only engages when the
 * container is scrolled to the very top and the user drags DOWN, so it never
 * fights normal scrolling. Entirely inert when `onRefresh` is undefined (no
 * listeners attached), so pages that do not opt in pay nothing.
 *
 * Web + native WebView both fire touch events, so this works on mobile web and
 * inside Capacitor; desktop (no touch) simply never triggers.
 */
export function usePullToRefresh(
  scrollRef: RefObject<HTMLElement | null>,
  onRefresh?: () => void | Promise<void>,
): PullToRefreshState {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const pullRef = useRef(0)
  const refreshingRef = useRef(false)
  const startY = useRef<number | null>(null)
  const active = useRef(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !onRefresh) return

    let raf = 0
    const setPullBoth = (v: number) => {
      pullRef.current = v
      setPull(v)
    }

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1) return
      // A pull only begins at the very top of the scroll container.
      if (el.scrollTop > 0) {
        active.current = false
        startY.current = null
        return
      }
      startY.current = e.touches[0].clientY
      active.current = true
    }

    const onMove = (e: TouchEvent) => {
      if (!active.current || startY.current == null || refreshingRef.current) return
      // Scrolled away from the top mid-gesture -> hand back to normal scroll.
      if (el.scrollTop > 0) {
        active.current = false
        startY.current = null
        if (pullRef.current !== 0) setPullBoth(0)
        return
      }
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0) {
        if (pullRef.current !== 0) setPullBoth(0)
        return
      }
      // Genuine downward pull from the top: take over the gesture so the
      // native rubber-band does not also move.
      if (e.cancelable) e.preventDefault()
      const dist = Math.min(MAX_PULL, dy * RESISTANCE)
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setPullBoth(dist))
    }

    const onEnd = () => {
      if (!active.current) return
      active.current = false
      startY.current = null
      if (pullRef.current >= THRESHOLD) {
        refreshingRef.current = true
        setRefreshing(true)
        setPullBoth(THRESHOLD)
        Promise.resolve(onRefresh()).finally(() => {
          refreshingRef.current = false
          setRefreshing(false)
          setPullBoth(0)
        })
      } else {
        setPullBoth(0)
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    // Non-passive so preventDefault can suppress the native scroll while pulling.
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })

    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [scrollRef, onRefresh])

  return { pull, refreshing, threshold: THRESHOLD }
}
