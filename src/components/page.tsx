import { type ReactNode, useRef } from 'react'
import { cn } from '@/lib/cn'
import { useLayout } from '@/hooks/use-layout'

interface PageProps {
  /** Optional header component (e.g. <Header />) */
  header?: ReactNode
  /** Sticky header rendered inside the scroll container  floats over content
   *  (use for full-bleed hero pages where header must overlay the hero) */
  stickyOverlay?: ReactNode
  /** Optional sticky bottom CTA */
  footer?: ReactNode
  /** Remove horizontal padding from footer (edge-to-edge) */
  fullWidthFooter?: boolean
  /** Remove horizontal padding from the entire page (content + footer go edge-to-edge) */
  fullBleed?: boolean
  /** Page content */
  children: ReactNode
  /** Additional class names */
  className?: string
  /** Hide the default atmospheric background (when the page provides its own) */
  noBackground?: boolean
  /** @deprecated Swipe-back is now handled globally by KeepAlive */
  swipeBack?: boolean
}

export function Page({
  header,
  stickyOverlay,
  footer,
  fullWidthFooter = false,
  fullBleed = false,
  children,
  className,
  noBackground = false,
}: PageProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { navMode } = useLayout()

  const isDesktopNav = navMode === 'sidebar'

  // Scroll save/restore is handled entirely by KeepAlive, which captures
  // scrollTop from #main-content before hiding a page and restores it
  // after showing. Page just provides the scroll container.

  const hasBottomTabs = navMode === 'bottom-tabs'

  // Standard header rendered directly in scroll container (takes layout space).
  // stickyOverlay pages supply their own header (usually transparent + collapse-header).
  const hasInlineHeader = !!header && !stickyOverlay

  return (
    <div className={cn('flex flex-col flex-1', !isDesktopNav && 'min-h-0')}>
      <main
        id="main-content"
        ref={scrollRef}
        className={cn(
          'relative flex-1',
          // On mobile/native, use inner scroll container for tab-bar offset + scroll restore
          // On desktop, clip overflow so sticky bg doesn't paint over the web footer
          isDesktopNav ? 'overflow-clip' : 'overflow-y-auto overflow-x-hidden overscroll-none hide-scrollbar',
          // Base gradient painted on element itself so first paint has colour (no flash)
          !noBackground && 'bg-gradient-to-b from-primary-50/40 via-white to-white',
          // Side padding for all page content (skip when fullBleed)
          fullBleed ? 'px-0' : 'px-4 lg:px-6',
          // Small gap between sidebar and page content on desktop
          !fullBleed && isDesktopNav && 'pl-4',
          className,
        )}
        style={{
          paddingBottom: hasBottomTabs
            ? 'calc(3.5rem + var(--safe-bottom))'
            : 'var(--safe-bottom)',
        }}
      >
        {/* Atmospheric background - sticky so it stays viewport-pinned while
            content scrolls over it. Negative margin collapses it out of flow. */}
        {!noBackground && (
          <div className={cn("pointer-events-none sticky top-0 h-[100dvh] -mb-[100dvh] -z-10 overflow-hidden", fullBleed ? 'mx-0' : '-mx-4 lg:-mx-6')} aria-hidden="true">
            <div className="absolute inset-0 bg-gradient-to-b from-primary-50/40 via-white to-white" />
          </div>
        )}

        {/* stickyOverlay: hero pages supply their own header (usually transparent + collapse-header).
            hasInlineHeader: standard pages render Header directly here  it takes natural space
            and sticks at the top of the scroll container. */}
        {stickyOverlay}
        {hasInlineHeader && header}

        <div className="relative">
          {children}
        </div>
      </main>

      {footer && (
        <div
          className={cn(
            'sticky bottom-0 z-30',
            fullBleed
              ? ''
              : 'bg-surface-0 border-t border-neutral-100 shadow-sm',
            (fullWidthFooter || fullBleed) ? 'px-0 py-0' : 'px-4 py-3',
          )}
          style={{
            paddingBottom: hasBottomTabs
              ? `calc(3.5rem + var(--safe-bottom)${fullBleed ? '' : ' + 1rem'})`
              : `calc(var(--safe-bottom)${fullBleed ? '' : ' + 1rem'})`,
          }}
        >
          {footer}
        </div>
      )}
    </div>
  )
}
