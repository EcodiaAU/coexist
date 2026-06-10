import { useState, useEffect, useRef, startTransition } from 'react'

/**
 * Returns true only when `isLoading` has been true for longer than `delayMs`.
 * This prevents loading skeletons from flashing on fast connections - the UI
 * simply appears - while still showing a sense of progress on slower loads.
 *
 * USAGE WARNING (fork_moy0mxm3 1.8.5 item 8 retrospective): callers MUST
 * NOT treat `useDelayedLoading(...) === false` as "data is ready". The hook
 * returns false during the first `delayMs` of every load, even though the
 * query is still in flight. The correct guard pattern is:
 *
 *   const showLoading = useDelayedLoading(isLoading)
 *   if (isLoading) {
 *     return showLoading ? <Skeleton /> : <Placeholder />
 *   }
 *   if (isError) return <Error />
 *   if (!data) return <NotFound />   // SAFE: query has finished
 *
 * NOT this (which renders NotFound during the pre-delay window):
 *
 *   if (showLoading) return <Skeleton />
 *   if (!data) return <NotFound />   // BUG: fires during fast loads
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
