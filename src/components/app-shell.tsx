import { type ReactNode, memo, Suspense, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { cn } from '@/lib/cn'
import { useLayout } from '@/hooks/use-layout'
import { BottomTabBar } from '@/components/bottom-tab-bar'
import { UnifiedSidebar } from '@/components/unified-sidebar'
import { WebFooter } from '@/components/web-footer'
import { OfflineBanner } from '@/components/offline-banner'
import { SyncStatusBanner } from '@/components/sync-status-banner'
import { KeyboardOpenContext, useKeyboardOpen } from '@/components/app-shell-context'
import { MenuSheetProvider, useMenuSheet } from '@/hooks/use-menu-sheet'
import { useSyncManager } from '@/hooks/use-sync-manager'
import { usePushRegistration } from '@/hooks/use-push'
import { useAppLifecycle } from '@/hooks/use-app-lifecycle'
import { useAndroidBackButton } from '@/hooks/use-android-back-button'
import { useKeyboard } from '@/hooks/use-keyboard'
import { useKeyboardHeight } from '@/hooks/use-keyboard-height'
import { useRolePrefetch } from '@/hooks/use-role-prefetch'
import { useDataPrefetch } from '@/hooks/use-data-prefetch'
import { useUnreadCounts } from '@/hooks/use-chat'

interface AppShellProps {
  children: ReactNode
  /** Hide all navigation chrome (for splash, onboarding, auth) */
  bare?: boolean
}

export function AppShell({ children, bare = false }: AppShellProps) {
  // Scroll focused inputs into view when native keyboard opens
  // must run in BOTH bare and full shells so auth/onboarding pages work too.
  useKeyboard()
  // Android hardware back: minimize at root routes, history-back elsewhere.
  // No-op on iOS / web. Wired here so it covers bare shells too (auth /
  // onboarding) - a back-press during onboarding minimizing is the right
  // behaviour (resume picks up where they left off).
  useAndroidBackButton()
  // Track keyboard height via visualViewport and set --kb-height CSS variable
  // so fixed-position elements (bottom sheets, chat input) can offset above keyboard.
  const kbHeight = useKeyboardHeight()
  const keyboardOpen = kbHeight > 0

  if (bare) {
    return (
      <KeyboardOpenContext.Provider value={keyboardOpen}>
        <div className="flex flex-col min-h-dvh">
          <Suspense fallback={<div className="flex-1 bg-surface-1" />}>
            {children}
          </Suspense>
        </div>
      </KeyboardOpenContext.Provider>
    )
  }

  return (
    <KeyboardOpenContext.Provider value={keyboardOpen}>
      <MenuSheetProvider>
        <AppShellInner>{children}</AppShellInner>
      </MenuSheetProvider>
    </KeyboardOpenContext.Provider>
  )
}

/**
 * Stable sidebar wrapper - never re-renders on navigation because it
 * has no location/path dependencies. The UnifiedSidebar reads
 * useLocation() internally for active-link highlighting.
 */
const StableSidebar = memo(function StableSidebar() {
  return <UnifiedSidebar />
})

/**
 * Mobile sidebar overlay - depends on menu open/close state only.
 * The hamburger FAB is removed; "More" bottom tab opens this instead.
 */
const MobileSidebar = memo(function MobileSidebar() {
  const { open, closeMenu } = useMenuSheet()

  return (
    <UnifiedSidebar mobileOpen={open} onMobileClose={closeMenu} />
  )
})

/**
 * Location-aware chrome (footer, bottom tabs) - isolated so that
 * pathname changes only re-render this leaf, not the sidebar.
 */
function LocationAwareChrome({ showBottomTabs, syncWarning }: { showBottomTabs: boolean; syncWarning: boolean }) {
  const { isMobile, isWeb } = useLayout()
  const location = useLocation()
  const { openMenu } = useMenuSheet()
  const keyboardOpen = useKeyboardOpen()
  const isAdminRoute = location.pathname.startsWith('/admin')
  const isLeaderRoute = location.pathname.startsWith('/leader') && !location.pathname.startsWith('/leaderboard') && !location.pathname.startsWith('/leadership')
  const isChatRoute = location.pathname.startsWith('/chat/')

  // Compute total unread chat messages for the badge
  const { data: unreadCounts } = useUnreadCounts()
  const totalUnread = useMemo(
    () => Object.values(unreadCounts ?? {}).reduce((sum, n) => sum + (n as number), 0),
    [unreadCounts],
  )

  return (
    <>
      {/* Web footer - public marketing surface only. The admin and leader
          shells are internal tools and should not carry the consumer-facing
          footer (Co-Exist links, app-store badges, acknowledgment). */}
      {isWeb && !isMobile && !isChatRoute && !isAdminRoute && !isLeaderRoute && <WebFooter />}

      {/* Bottom tab bar (mobile + native) - hidden on admin/leader pages and when keyboard is open.
          Chat detail (/chat/<id>) keeps the tab bar visible so users can navigate out without back-button hunt. */}
      {showBottomTabs && !isAdminRoute && !isLeaderRoute && !keyboardOpen && (
        <BottomTabBar onMorePress={openMenu} chatBadge={totalUnread} syncWarning={syncWarning} />
      )}
    </>
  )
}

function AppShellInner({ children }: { children: ReactNode }) {
  const { navMode } = useLayout()
  const navigate = useNavigate()

  // Handles auto-sync on reconnect + toast notifications + persistent sync issue state
  const { syncIssue, pendingCount } = useSyncManager()

  // Push notification registration - sets up FCM/APNs listeners,
  // stores token in DB, handles deep-link routing on tap,
  // re-registers on app resume. Runs once for all authenticated users.
  usePushRegistration()

  // Native app lifecycle: invalidate queries on resume so stale data refreshes.
  useAppLifecycle()

  // Role-aware chunk prefetch  downloads the user's top 5 pages first,
  // then remaining common pages, so nav targets are instant.
  useRolePrefetch()

  // Role-aware data prefetch  warms TanStack Query cache with the
  // actual Supabase data each page needs, so first navigation renders
  // the final state with zero loading spinners.
  useDataPrefetch()

  const showBottomTabs = navMode === 'bottom-tabs'
  const showSidebar = navMode === 'sidebar'

  return (
    <div
      className={cn(
        'flex flex-col bg-surface-1',
        // Desktop web: document can grow for natural window scrolling + WebFooter
        showBottomTabs ? 'overflow-hidden' : 'min-h-dvh',
      )}
      style={showBottomTabs ? {
        // Use visualViewport-aware height so the shell shrinks when the native
        // keyboard opens. --kb-height is set by useKeyboardHeight via visualViewport.
        height: 'calc(100dvh - var(--kb-height, 0px))',
      } : undefined}
    >
      {/* Skip to content link for keyboard/screen reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:text-primary-700 focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>

      {/* Offline connectivity banner */}
      <OfflineBanner />

      {/* Persistent sync issue banner (auth expired / storage full) */}
      <SyncStatusBanner
        issue={syncIssue}
        pendingCount={pendingCount}
        onSignIn={() => navigate('/login')}
      />

      {/* Sidebar + content row */}
      <div className="flex flex-1 min-h-0">
        {/* Unified sidebar - desktop: permanent left sidebar (stable, no remount) */}
        {showSidebar && <StableSidebar />}

        {/* Content */}
        <main id="main-content" className="flex-1 flex flex-col min-w-0 min-h-0">
          {children}
        </main>
      </div>

      {/* Location-aware chrome (footer + bottom tabs) - isolated to prevent sidebar re-renders */}
      <LocationAwareChrome showBottomTabs={showBottomTabs} syncWarning={syncIssue !== null} />

      {/* Mobile sidebar overlay (opened via "More" tab in bottom bar) */}
      {showBottomTabs && <MobileSidebar />}
    </div>
  )
}
