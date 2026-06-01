import {
    type ReactElement,
    type ReactNode,
    useRef,
    useLayoutEffect,
    useMemo,
} from 'react'
import {
    useLocation,
    useOutlet,
    UNSAFE_LocationContext as LocationContext,
    type NavigationType,
} from 'react-router'
import { useSwipeBack } from '@/hooks/use-swipe-back'

const MAX_CACHED = 5

interface CachedPage {
  path: string
  element: ReactElement
  /** Saved scrollTop of the #main-content element inside this page */
  savedScroll: number
}

/** Find the #main-content scroll container inside a wrapper div */
function getScrollEl(wrapper: HTMLDivElement | null): HTMLElement | null {
  return wrapper?.querySelector('#main-content') as HTMLElement | null
}

/**
 * Freezes the React Router location context for its children.
 * This prevents cached pages from re-rendering when the global
 * route changes  they keep seeing the location from when they
 * were first created.
 */
function FrozenRouter({ location, children }: { location: ReturnType<typeof useLocation>; children: ReactNode }) {
  const locationCtx = useMemo(() => ({ location, navigationType: 'POP' as NavigationType }), [location])
  return (
    <LocationContext.Provider value={locationCtx}>
      {children}
    </LocationContext.Provider>
  )
}

/**
 * Keeps the last N route outlets alive in the DOM so that navigating
 * back renders instantly with preserved scroll position & state.
 *
 * Each cached page is wrapped in a frozen location context so it
 * doesn't re-render when the active route changes. Scroll position
 * is captured by a continuous scroll listener on the active page,
 * so it is always current at the moment of navigation (capturing
 * scroll in a post-render effect was unreliable because the wrapper
 * already had display:none applied, which makes scrollTop read 0).
 *
 * Swipe-back: useSwipeBack is the Safari/Chambers-style fire-and-forget
 * gesture (left-edge start + horizontal threshold -> navigate(-1)). The
 * page cache here gives the prior page an instant paint; no live drag,
 * no parallax, no spring snap - matches the chambers feel Tate asked for.
 */
export function KeepAlive() {
  const location = useLocation()
  const outlet = useOutlet()
  const path = location.pathname

  const cacheRef = useRef<CachedPage[]>([])
  // Track both pathname and search so a re-entry with a new query string
  // (e.g. /events/create?from=A then later ?from=B) updates the frozen
  // location instead of replaying the original. Without this, pages that
  // read query params via useSearchParams() get stuck on whichever value
  // was active when they were first cached.
  const lastProcessedRef = useRef<string | null>(null)
  const wrappersRef = useRef<Map<string, HTMLDivElement>>(new Map())
  // Frozen location per cached page  so back-nav doesn't re-render page contents
  const frozenLocationsRef = useRef<Map<string, ReturnType<typeof useLocation>>>(new Map())

  useSwipeBack()

  // ---- Synchronous cache update (during render) ----
  // Cache must be populated before JSX is returned so the new page is
  // included in the render output. Updating refs in effects caused a
  // blank-frame bug: the render would iterate a stale cache (new path
  // not yet added)  every cached page hidden  blank screen.
  const fingerprint = path + location.search
  // eslint-disable-next-line react-hooks/refs
  if (outlet && lastProcessedRef.current !== fingerprint) {
    const cache = cacheRef.current
    lastProcessedRef.current = fingerprint

    const existingIdx = cache.findIndex((c) => c.path === path)
    if (existingIdx >= 0) {
      const entry = cache[existingIdx]
      cache.splice(existingIdx, 1)
      cache.push(entry)
      // Search string changed for this cached path - refresh the frozen
      // location so children that read query params see the new values.
      const frozen = frozenLocationsRef.current.get(path)
      if (frozen && frozen.search !== location.search) {
        frozenLocationsRef.current.set(path, { ...location })
      }
    } else {
      frozenLocationsRef.current.set(path, { ...location })
      if (cache.length >= MAX_CACHED) {
        const evicted = cache.shift()
        if (evicted) {
          frozenLocationsRef.current.delete(evicted.path)
          wrappersRef.current.delete(evicted.path)
        }
      }
      cache.push({ path, element: outlet as ReactElement, savedScroll: 0 })
    }
  }

  // ---- Pre-paint scroll restoration + continuous scroll tracking ----
  // Three bugs the iterations of this code have had to address (1.8.6 feat 3 / 1.8.5 feat C):
  //
  //   1. SUSPENSE TIMING (b131f0f): pages are lazy-loaded via React.Suspense.
  //      On FIRST mount of any path, the lazy chunk hasn't resolved yet so
  //      #main-content has not rendered. Direct getScrollEl() returns null,
  //      so the listener never attaches. Fix: rAF-poll for the element.
  //
  //   2. IMMEDIATE-CAPTURE OVERWRITES SAVED VALUE (8a1bd35): the very-old code
  //      did `entry.savedScroll = scrollEl.scrollTop` at listener-attach time.
  //      On back-nav, freshly-revealed page's scrollTop is 0 (browser reset
  //      across display:none toggle). The capture raced ahead of restoration
  //      and wrote 0 over the saved 600.
  //
  //   3. POST-PAINT RESTORE FLASH (1.8.5 polish C): even with the Suspense +
  //      capture-race fixes in b131f0f, restoration ran in `useEffect` via 2x
  //      rAF. That puts the actual scrollTop write at LEAST 1 paint after the
  //      wrapper transitions from display:none to active. User sees: paint
  //      at top -> jump to saved position. Fix: do the restore in
  //      `useLayoutEffect` AND read scrollEl synchronously.
  useLayoutEffect(() => {
    const wrapper = wrappersRef.current.get(path)
    if (!wrapper) return
    const entry = cacheRef.current.find((c) => c.path === path)
    if (!entry) return

    let captureRaf = 0
    let trackingOpen = false
    let scrollEl: HTMLElement | null = null
    let listenerAttached = false
    let pollRaf = 0
    let polling = true

    const onScroll = () => {
      if (!trackingOpen || !scrollEl) return
      if (captureRaf) return
      captureRaf = requestAnimationFrame(() => {
        if (scrollEl) entry.savedScroll = scrollEl.scrollTop
        captureRaf = 0
      })
    }

    const setupTracking = () => {
      if (!polling || !scrollEl) return
      // CRITICAL: restore BEFORE attaching the listener AND BEFORE the browser
      // paints. We are in useLayoutEffect's synchronous window: the wrapper has
      // just transitioned from display:none to active, layout has been computed,
      // scrollTop assignment is honored. The next paint shows the page at the
      // saved scroll position - no flash at top.
      if (entry.savedScroll > 0 && scrollEl.scrollTop !== entry.savedScroll) {
        scrollEl.scrollTop = entry.savedScroll
      }
      // Attach AFTER the programmatic write so the scroll event our own
      // assignment dispatches doesn't trigger an extra capture (it would write
      // the same target value back, but we keep the path clean anyway).
      scrollEl.addEventListener('scroll', onScroll, { passive: true })
      listenerAttached = true
      trackingOpen = true
    }

    // Common case: cached page, #main-content already in DOM. Synchronous,
    // pre-paint restore. Then we re-assert across the next several frames
    // and a 200ms timeout because sticky/parallax layouts can briefly
    // recompute layout after the wrapper transitions from display:none to
    // active and image-load reflow can push the saved scroll target out
    // of reachable range until the page settles. Each re-assert only
    // writes if scrollTop drifted from savedScroll, so it's a no-op
    // unless the symptom actually fires.
    const lateRafs: number[] = []
    const lateTimers: ReturnType<typeof setTimeout>[] = []
    const reassert = () => {
      if (!scrollEl || !entry) return
      if (entry.savedScroll > 0 && scrollEl.scrollTop !== entry.savedScroll) {
        scrollEl.scrollTop = entry.savedScroll
      }
    }
    scrollEl = getScrollEl(wrapper)
    if (scrollEl) {
      setupTracking()
      lateRafs.push(requestAnimationFrame(() => {
        reassert()
        lateRafs.push(requestAnimationFrame(reassert))
      }))
      lateTimers.push(setTimeout(reassert, 60))
      lateTimers.push(setTimeout(reassert, 200))
    } else {
      // First-mount Suspense case: lazy chunk not yet resolved. No saved scroll
      // exists for this path (otherwise scrollEl would have been preserved
      // across visits), so no flash risk - just rAF-poll until the element
      // appears, then attach the listener for future captures.
      const tryAttach = () => {
        if (!polling) return
        const found = getScrollEl(wrapper)
        if (found) {
          scrollEl = found
          setupTracking()
          return
        }
        pollRaf = requestAnimationFrame(tryAttach)
      }
      pollRaf = requestAnimationFrame(tryAttach)
    }

    return () => {
      polling = false
      trackingOpen = false
      if (pollRaf) cancelAnimationFrame(pollRaf)
      if (captureRaf) cancelAnimationFrame(captureRaf)
      for (const r of lateRafs) cancelAnimationFrame(r)
      for (const t of lateTimers) clearTimeout(t)
      if (listenerAttached && scrollEl) {
        scrollEl.removeEventListener('scroll', onScroll)
      }
    }
  }, [path])

  // Read cache for rendering - refs are intentionally read during render here
  // because the cache must be synchronously available for rendering cached pages.
  // This is a KeepAlive component that needs mutable cache state outside of React's
  // state management to avoid re-rendering cached children.
  /* eslint-disable react-hooks/refs */
  const cache = cacheRef.current

  return (
    <div
      className="flex-1 min-h-0 min-w-0 max-w-full"
      style={{ display: 'grid', gridTemplate: '1fr / 1fr', overflowX: 'clip' }}
    >
      {cache.map((cached) => {
        const isActive = cached.path === path
        const gridStyle = { gridArea: '1 / 1' } as const
        const frozenLocation = frozenLocationsRef.current.get(cached.path) ?? location
        const ref = (el: HTMLDivElement | null) => {
          if (el) wrappersRef.current.set(cached.path, el)
        }

        // Inactive: hidden. display:none preserves DOM state and scrollTop
        // is restored explicitly when the page becomes active again.
        if (!isActive) {
          return (
            <div
              key={cached.path}
              ref={ref}
              className="flex flex-col min-h-0 min-w-0 overflow-x-clip bg-surface-1"
              style={{ ...gridStyle, display: 'none' }}
            >
              <FrozenRouter location={frozenLocation}>
                {cached.element}
              </FrozenRouter>
            </div>
          )
        }

        return (
          <div
            key={cached.path}
            ref={ref}
            className="flex flex-col min-h-0 min-w-0 overflow-x-clip bg-surface-1"
            style={{ ...gridStyle, zIndex: 1 }}
          >
            <FrozenRouter location={frozenLocation}>
              {cached.element}
            </FrozenRouter>
          </div>
        )
      })}
    </div>
  )
  /* eslint-enable react-hooks/refs */
}
