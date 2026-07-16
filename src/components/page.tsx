import { type ReactNode, useRef } from 'react'
import { cn } from '@/lib/cn'
import { useLayout } from '@/hooks/use-layout'
import { useKeyboardOpen } from '@/components/app-shell-context'

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
  /** @deprecated Swipe-back is now handled globally by useSwipeBack in AppShell */
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
  const keyboardOpen = useKeyboardOpen()

  const isDesktopNav = navMode === 'sidebar'

  // No JS scroll save/restore: when the KeepAlive cache layer was removed
  // (to match the Chambers fire-and-forget nav feel) the back-nav scroll
  // hop went with it. Pages start at the top of their scroll container
  // on entry, same as Chambers.

  const hasBottomTabs = navMode === 'bottom-tabs'

  // Bottom tabs are visually hidden when the keyboard is open
  // (LocationAwareChrome in app-shell.tsx), so the footer should NOT keep
  // its 3.5rem tab-bar buffer in that state - that buffer is what was
  // pushing the Save button ~3.5rem above the keyboard top. With keyboard
  // up, paint the footer flush against the keyboard line.
  const tabsVisuallyHidden = hasBottomTabs && keyboardOpen

  // Standard header rendered directly in scroll container (takes layout space).
  // stickyOverlay pages supply their own header (usually transparent + collapse-header).
  const hasInlineHeader = !!header && !stickyOverlay

  return (
    <div data-eos-id="src/components/page.tsx#0" className={cn('flex flex-col flex-1', !isDesktopNav && 'min-h-0')}>
      <main data-eos-id="src/components/page.tsx#1"
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
          paddingBottom: tabsVisuallyHidden
            ? 'var(--safe-bottom)'
            : hasBottomTabs
              ? 'calc(3.5rem + var(--safe-bottom))'
              : 'var(--safe-bottom)',
        }}
      >
        {/* Atmospheric background - sticky so it stays viewport-pinned while
            content scrolls over it. Negative margin collapses it out of flow. */}
        {!noBackground && (
          <div data-eos-id="src/components/page.tsx#2" className={cn("pointer-events-none sticky top-0 h-[100dvh] -mb-[100dvh] -z-10 overflow-hidden", fullBleed ? 'mx-0' : '-mx-4 lg:-mx-6')} aria-hidden="true">
            <div data-eos-id="src/components/page.tsx#3" className="absolute inset-0 bg-gradient-to-b from-primary-50/40 via-white to-white" />
          </div>
        )}

        {/* stickyOverlay: hero pages supply their own header (usually transparent + collapse-header).
            hasInlineHeader: standard pages render Header directly here  it takes natural space
            and sticks at the top of the scroll container. */}
        {stickyOverlay}
        {hasInlineHeader && header}

        <div data-eos-id="src/components/page.tsx#4" className="relative">
          {children}
        </div>
      </main>

      {footer && (
        <div data-eos-id="src/components/page.tsx#5"
          className={cn(
            'sticky bottom-0 z-30',
            fullBleed
              ? ''
              : 'bg-surface-0 border-t border-neutral-100 shadow-sm',
            (fullWidthFooter || fullBleed)
              ? 'px-0 py-0'
              : keyboardOpen
                ? 'px-4 py-2'
                : 'px-4 py-3',
          )}
          style={{
            // When the soft keyboard is up the bottom tabs are hidden by
            // LocationAwareChrome (app-shell.tsx) so we drop the 3.5rem buffer
            // that was sitting under the Save button. The shell shrinks via
            // height: calc(100dvh - var(--kb-height)) so sticky bottom-0 sits
            // flush against the keyboard top - safe-bottom is irrelevant
            // (home indicator is hidden when keyboard up) and the 1rem gap
            // collapses to a tighter 0.25rem so the button sits right above
            // the keyboard line.
            // When keyboard is up: env(safe-area-inset-bottom) is unreliable on Android
            // gesture nav (returns 20-30px even when keyboard shown). Use a fixed small
            // value instead so the button sits flush against the keyboard line.
            paddingBottom: tabsVisuallyHidden
              ? (fullBleed ? '0px' : '6px')
              : hasBottomTabs
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
