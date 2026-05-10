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

/**
 * iOS UIKit interactive-pop spring curve. Apple uses this on UINavigationController
 * push/pop transitions; matches the "feel" of native back-swipe on iPhone.
 */
const IOS_SPRING_CURVE = 'cubic-bezier(0.32, 0.72, 0, 1)'
const IOS_SPRING_DURATION_MS = 350

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
 * Supports swipe-right-from-left-edge on mobile/native with iOS-spec
 * dual-layer animation: the active page slides out, the previous
 * page parallax-slides in from -30% to 0%, both on GPU-promoted
 * compositor layers with the iOS UIKit spring curve.
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
  const swipeRestoredRef = useRef<string | null>(null)
  // Frozen location per cached page  so back-nav doesn't re-render page contents
  const frozenLocationsRef = useRef<Map<string, ReturnType<typeof useLocation>>>(new Map())

  const { offsetX, swiping, animating } = useSwipeBack({ enabled: true })

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
  //   3. POST-PAINT RESTORE FLASH (this commit, 1.8.5 polish C): even with the
  //      Suspense + capture-race fixes in b131f0f, restoration ran in `useEffect`
  //      via 2x rAF. That puts the actual scrollTop write at LEAST 1 paint after
  //      the wrapper transitions from display:none to active. User sees: paint
  //      at top -> jump to saved position. This is exactly what Tate flagged
  //      ("not a tab mount-like setup"). Fix: do the restore in `useLayoutEffect`
  //      AND read scrollEl synchronously. useLayoutEffect runs AFTER DOM mutation
  //      (the display:none -> active toggle has been committed) but BEFORE the
  //      browser paints. For back-nav (the case Tate cares about) the page is
  //      already cached, #main-content is in the DOM, so getScrollEl() resolves
  //      synchronously and we can set scrollTop before the first paint of the
  //      now-active state. No visible flash. The Suspense rAF-poll is kept as
  //      a fallback for the truly-first-mount case (no saved scroll to restore
  //      anyway, so no jump risk; just need to attach the listener for future
  //      scroll captures).
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
    // pre-paint restore.
    scrollEl = getScrollEl(wrapper)
    if (scrollEl) {
      setupTracking()
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
      if (listenerAttached && scrollEl) {
        scrollEl.removeEventListener('scroll', onScroll)
      }
    }
  }, [path])

  // ---- Restore scroll on the swipe-preview page when it first appears ----
  // useLayoutEffect (not useEffect) so the restore is committed before paint.
  // When `swiping` flips false->true the prev page wrapper transitions from
  // display:none to a parallax-translated visible layer; we need scrollTop set
  // BEFORE the user sees the first frame of that translation - otherwise they
  // see scroll 0 first then the jump to saved.
  useLayoutEffect(() => {
    const cache = cacheRef.current
    const prevPage = cache.length >= 2 ? cache[cache.length - 2] : null
    if (!swiping || !prevPage) {
      swipeRestoredRef.current = null
      return
    }
    if (swipeRestoredRef.current === prevPage.path) return
    swipeRestoredRef.current = prevPage.path

    if (prevPage.savedScroll === 0) return
    const scrollEl = getScrollEl(wrappersRef.current.get(prevPage.path) ?? null)
    if (!scrollEl) return
    // Synchronous restore in the layout phase, before the browser paints the
    // newly-visible swipe-preview layer.
    if (scrollEl.scrollTop !== prevPage.savedScroll) {
      scrollEl.scrollTop = prevPage.savedScroll
    }
  }, [swiping])

  // Read cache for rendering - refs are intentionally read during render here
  // because the cache must be synchronously available for rendering cached pages.
  // This is a KeepAlive component that needs mutable cache state outside of React's
  // state management to avoid re-rendering cached children.
  /* eslint-disable react-hooks/refs */
  const cache = cacheRef.current
  const prevPage = cache.length >= 2 ? cache[cache.length - 2] : null

  // Compute swipe progress (0..1) for parallax + dim on the previous page.
  // Use viewport width as denominator so the parallax tracks 1:1 with the
  // active page slide.
  const vw = typeof window !== 'undefined' ? (window.innerWidth || 375) : 375
  const progress = swiping ? Math.min(1, Math.max(0, offsetX / vw)) : 0
  // Native iOS pops the previous page in from roughly -30% of viewport.
  const prevTranslateXPct = swiping ? -30 + progress * 30 : 0

  return (
    <div
      className="flex-1 min-h-0 min-w-0 max-w-full"
      style={{ display: 'grid', gridTemplate: '1fr / 1fr', overflowX: 'clip' }}
    >
      {cache.map((cached) => {
        const isActive = cached.path === path
        const isPrev = prevPage?.path === cached.path && !isActive
        const gridStyle = { gridArea: '1 / 1' } as const
        const frozenLocation = frozenLocationsRef.current.get(cached.path) ?? location
        const ref = (el: HTMLDivElement | null) => {
          if (el) wrappersRef.current.set(cached.path, el)
        }

        // During swipe: previous page is shown underneath with iOS-style
        // parallax (slides in from -30% to 0% as the active page slides out).
        // A solid background plus translate3d ensures it composites as its
        // own opaque layer  no bleed-through from below, no transparency.
        if (isPrev && swiping) {
          const prevTransform = `translate3d(${prevTranslateXPct}%, 0, 0)`
          const prevDimOpacity = (1 - progress) * 0.08
          return (
            <div
              key={cached.path}
              ref={ref}
              className="flex flex-col min-h-0 min-w-0 overflow-x-clip bg-surface-1"
              style={{
                ...gridStyle,
                zIndex: 0,
                pointerEvents: 'none',
                transform: prevTransform,
                transition: animating ? `transform ${IOS_SPRING_DURATION_MS}ms ${IOS_SPRING_CURVE}` : 'none',
                willChange: 'transform',
                backfaceVisibility: 'hidden',
              }}
            >
              <FrozenRouter location={frozenLocation}>
                {cached.element}
              </FrozenRouter>
              {/* Dim overlay sits above content but below the active page,
                  fading out as the previous page comes forward. iOS does
                  the same dim-fade during interactive pop. */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: 'rgba(0, 0, 0, 1)',
                  opacity: prevDimOpacity,
                  pointerEvents: 'none',
                  transition: animating ? `opacity ${IOS_SPRING_DURATION_MS}ms ${IOS_SPRING_CURVE}` : 'none',
                }}
              />
            </div>
          )
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

        // Active page. During swipe it gets:
        //   - GPU-promoted layer (translate3d + will-change + backface-hidden)
        //   - iOS spring curve for the snap animation
        //   - Solid bg-surface-1 so the layer composites opaquely (prevents
        //     transparency bleed where inner content has alpha gradients)
        //   - Subtle left-edge box shadow to separate from the page underneath
        const activeTransform = swiping ? `translate3d(${offsetX}px, 0, 0)` : undefined
        const swipeStyle = swiping
          ? {
              transform: activeTransform,
              transition: animating ? `transform ${IOS_SPRING_DURATION_MS}ms ${IOS_SPRING_CURVE}` : 'none',
              boxShadow: offsetX > 0 ? '-8px 0 24px -4px rgba(0,0,0,0.18)' : undefined,
              willChange: 'transform',
              backfaceVisibility: 'hidden' as const,
            }
          : {}

        return (
          <div
            key={cached.path}
            ref={ref}
            className="flex flex-col min-h-0 min-w-0 overflow-x-clip bg-surface-1"
            style={{ ...gridStyle, zIndex: 1, ...swipeStyle }}
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
