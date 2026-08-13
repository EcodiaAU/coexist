import {
  useRef,
  useState,
  useLayoutEffect,
  type ReactNode,
} from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

/* ------------------------------------------------------------------ */
/*  Virtualized                                                        */
/*                                                                     */
/*  Windows a flat item array so only the rows in view (plus overscan) */
/*  ever mount. Built for the App Hang cluster (Sentry COEXIST-K/S/X): */
/*  screens that rendered every attendee / message at once mounted     */
/*  hundreds of subtrees (avatars, ResizeObservers, per-row realtime   */
/*  subscriptions) in one synchronous pass, blocking the main thread   */
/*  2-6s and tripping the iOS OS-watchdog on the largest live events.  */
/*                                                                     */
/*  The list is usually NOT its own scroll container - it sits partway */
/*  down a page that scrolls (Co-Exist Page => <main id="main-content" */
/*  >). So we virtualize against an ancestor scroll element resolved by */
/*  id and offset the window by scrollMargin (the wrapper's distance    */
/*  from the top of that scroll element's content). This is the        */
/*  canonical react-virtual "scroll element is an ancestor" pattern and */
/*  keeps the page's single native scroll + pull-to-refresh intact.     */
/*                                                                     */
/*  Heights self-correct via measureElement, so rows do not need to be */
/*  a fixed height; estimateSize only seeds the first paint.           */
/* ------------------------------------------------------------------ */

export function Virtualized<T>({
  items,
  estimateSize,
  getKey,
  renderItem,
  overscan = 8,
  scrollElementId = 'main-content',
  className,
}: {
  items: T[]
  /** Seed height per index (px). Real height is measured after mount. */
  estimateSize: (index: number) => number
  getKey: (index: number) => string | number
  renderItem: (item: T, index: number) => ReactNode
  overscan?: number
  /** id of the ancestor scroll element (Co-Exist Page => "main-content"). */
  scrollElementId?: string
  className?: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  // Resolve the ancestor scroll element by walking UP from the wrapper to the
  // nearest scrollable ancestor. This binds to the real DOM parent that owns
  // this list, which is correct even when a global id is ambiguous - the Page
  // keeps a previous route's <main id="main-content"> mounted during the
  // transition, so getElementById can return the wrong (non-scrolling) one and
  // the window never updates as the user scrolls. Falls back to the id lookup,
  // then the document scroller, so it still resolves on desktop where the Page
  // clips overflow and the window scrolls.
  useLayoutEffect(() => {
    let el: HTMLElement | null = wrapRef.current?.parentElement ?? null
    while (el) {
      const oy = getComputedStyle(el).overflowY
      if (oy === 'auto' || oy === 'scroll') break
      el = el.parentElement
    }
    setScrollEl(
      el ??
        document.getElementById(scrollElementId) ??
        (document.scrollingElement as HTMLElement | null),
    )
  }, [scrollElementId])

  // scrollMargin = the wrapper's offset from the top of the scroll element's
  // scrollable content. Recomputed whenever the content above the list can
  // change height (the stats header, the search bar, a section collapsing).
  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || !scrollEl) return
    const recompute = () => {
      const top =
        wrap.getBoundingClientRect().top -
        scrollEl.getBoundingClientRect().top +
        scrollEl.scrollTop
      setScrollMargin((prev) => (Math.abs(prev - top) > 1 ? top : prev))
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(scrollEl)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [scrollEl, items.length])

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollEl,
    estimateSize,
    overscan,
    scrollMargin,
    getItemKey: getKey,
  })

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{
        height: virtualizer.getTotalSize(),
        position: 'relative',
        width: '100%',
      }}
    >
      {virtualItems.map((vi) => (
        <div
          key={vi.key}
          data-index={vi.index}
          ref={virtualizer.measureElement}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${vi.start - virtualizer.options.scrollMargin}px)`,
          }}
        >
          {renderItem(items[vi.index], vi.index)}
        </div>
      ))}
    </div>
  )
}
