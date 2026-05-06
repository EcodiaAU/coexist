import { useState, useEffect, useRef, startTransition } from 'react'

/**
 * Returns true only when `isLoading` has been true for longer than `delayMs`.
 * This prevents loading skeletons from flashing on fast connections - the UI
 * simply appears - while still showing a sense of progress on slower loads.
 */
export function useDelayedLoading(isLoading: boolean, delayMs = 1000): boolean {
  const [show, setShow] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isLoading) {
      timerRef.current = setTimeout(() => {
        startTransition(() => setShow(true))
      }, delayMs)
    } else {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
      startTransition(() => setShow(false))
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [isLoading, delayMs])

  return isLoading && show
}
