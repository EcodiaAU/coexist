import {
    type ReactElement,
    type ReactNode,
    useRef,
    useEffect,
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

  // ---- Continuous scroll tracking on the active page ----
  // Reading scrollTop in a post-render effect (as the previous implementation
  // did) is unreliable because by the time the effect runs, React has already
  // committed display:none on the leaving page's wrapper, which makes the
  // descendant #main-content's scrollTop read as 0. Instead, listen to scroll
  // events on the active page and continuously persist its scrollTop to the
  // cache entry. The value is therefore always current at the moment of
  // navigation, with no need for a "save on leave" capture.
  useEffect(() => {
    const wrapper = wrappersRef.current.get(path)
    if (!wrapper) return
    const scrollEl = getScrollEl(wrapper)
    if (!scrollEl) return

    const entry = cacheRef.current.find((c) => c.path === path)
    if (!entry) return

    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        entry.savedScroll = scrollEl.scrollTop
        raf = 0
      })
    }
    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    // Capture once immediately in case scroll already happened before listener attached
    entry.savedScroll = scrollEl.scrollTop

    return () => {
      scrollEl.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [path])

  // ---- Restore scroll on the active page after it becomes visible ----
  // Used on back-navigation when the cached page is shown again. The active
  // page's wrapper has been display:none for the duration of the forward
  // visit; some browsers preserve scrollTop across display:none toggles but
  // not all, so explicitly restore.
  useEffect(() => {
    const entry = cacheRef.current.find((c) => c.path === path)
    if (!entry || entry.savedScroll === 0) return
    const scrollEl = getScrollEl(wrappersRef.current.get(path) ?? null)
    if (!scrollEl) return
    // Double-rAF to wait for display:none -> visible repaint
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (scrollEl.scrollTop !== entry.savedScroll) {
          scrollEl.scrollTop = entry.savedScroll
        }
      })
    })
  }, [path])

  // ---- Restore scroll on the swipe-preview page when it first appears ----
  useEffect(() => {
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
    // Restore on the next frame, before the user sees a flash at scroll 0.
    requestAnimationFrame(() => {
      if (scrollEl.scrollTop !== prevPage.savedScroll) {
        scrollEl.scrollTop = prevPage.savedScroll
      }
    })
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
