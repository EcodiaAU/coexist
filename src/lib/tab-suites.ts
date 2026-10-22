// The one table behind the bottom tab bar, for every part of the app.
//
// The member app, the leader suite (/leader) and the admin suite (/admin) each
// carry their own four tabs, but they are the SAME bar: one host in the app
// shell (LocationAwareChrome) renders it, as Apple's Liquid Glass UITabBar on a
// capable iPhone (src/lib/native-tab-bar.ts) and as the web BottomTabBar
// everywhere else. Until 2026-10-22 the leader and admin layouts mounted their
// own web bars with their own styling, and the shell hid the glass bar on their
// routes, so an iPhone showed Liquid Glass on member pages and a plain white
// bar the moment you opened a leader or admin page (Tate, iMessage 4142).
//
// Every suite has exactly four tabs. That is load-bearing for the glass bar:
// the native plugin reuses its four tab controllers when the count is
// unchanged and only swaps their items, so moving between suites never
// re-hosts the WebView. src/test/tab-suites.test.ts pins it.

import {
  CalendarDays,
  Home,
  LayoutDashboard,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  User,
  type LucideIcon,
} from 'lucide-react'
import type { Suite } from '@/components/sidebar/types'

export type { Suite }

export interface TabSpec {
  /** Stable id. Shared across suites where the tab is the same place ('home' is always '/', 'chat' always '/chat'). */
  key: string
  label: string
  path: string
  /** Match only this exact path (no prefix matching). */
  exact?: boolean
  /** Opens the More sidebar instead of navigating. */
  isMore?: boolean
  /** Web bar icon. */
  icon: LucideIcon
  /** Glass bar icons (SF Symbols). Each name must exist on iOS 26 or the slot draws blank. */
  sfSymbol: string
  sfSymbolSelected: string
}

const HOME_TAB: TabSpec = { key: 'home', label: 'Home', path: '/', exact: true, icon: Home, sfSymbol: 'house', sfSymbolSelected: 'house.fill' }
/** The way back to the member app from inside a suite: same place as Home, labelled for the context. */
const APP_TAB: TabSpec = { ...HOME_TAB, label: 'App' }
const CHAT_TAB: TabSpec = { key: 'chat', label: 'Chat', path: '/chat', icon: MessageCircle, sfSymbol: 'message', sfSymbolSelected: 'message.fill' }
const MORE_TAB: TabSpec = { key: 'more', label: 'More', path: '/more', exact: true, isMore: true, icon: MoreHorizontal, sfSymbol: 'ellipsis', sfSymbolSelected: 'ellipsis' }

export const TAB_SUITES: Readonly<Record<Suite, readonly TabSpec[]>> = {
  main: [
    HOME_TAB,
    CHAT_TAB,
    { key: 'profile', label: 'Profile', path: '/profile', icon: User, sfSymbol: 'person', sfSymbolSelected: 'person.fill' },
    MORE_TAB,
  ],
  leader: [
    APP_TAB,
    { key: 'leader-home', label: 'Dashboard', path: '/leader', exact: true, icon: LayoutDashboard, sfSymbol: 'square.grid.2x2', sfSymbolSelected: 'square.grid.2x2.fill' },
    { key: 'leader-events', label: 'Events', path: '/leader/events', icon: CalendarDays, sfSymbol: 'calendar', sfSymbolSelected: 'calendar' },
    MORE_TAB,
  ],
  admin: [
    APP_TAB,
    CHAT_TAB,
    { key: 'admin-collectives', label: 'Collectives', path: '/admin/collectives', icon: MapPin, sfSymbol: 'mappin.and.ellipse', sfSymbolSelected: 'mappin.and.ellipse' },
    MORE_TAB,
  ],
}

/**
 * Which part of the app a route belongs to. The ONE copy of this rule: the tab
 * bar and the sidebar both read it. /leaderboard and /leadership are member
 * pages that happen to start with "/leader".
 */
export function resolveSuite(pathname: string): Suite {
  if (pathname.startsWith('/admin')) return 'admin'
  if (pathname.startsWith('/leader') && !pathname.startsWith('/leaderboard') && !pathname.startsWith('/leadership')) return 'leader'
  return 'main'
}

/** More never reads active; '/' and exact tabs match exactly; the rest by prefix. */
export function isTabActive(tab: Pick<TabSpec, 'path' | 'exact' | 'isMore'>, pathname: string): boolean {
  if (tab.isMore) return false
  if (tab.exact || tab.path === '/') return pathname === tab.path
  return pathname.startsWith(tab.path)
}

/** The tab a route belongs to within its suite's tabs, or null for a route outside every tab. */
export function activeTabKey(tabs: readonly TabSpec[], pathname: string): string | null {
  return tabs.find((t) => isTabActive(t, pathname))?.key ?? null
}

/**
 * The tab the glass bar shows selected. A UITabBar always has one selected, so
 * a route outside every tab (an event page, /admin itself) keeps the last tab
 * the user was on when that tab exists in this suite, else the suite's first
 * tab. The web bar shows none selected on those routes.
 */
export function selectedTabKey(tabs: readonly TabSpec[], pathname: string, lastKey: string | null): string {
  const routeKey = activeTabKey(tabs, pathname)
  if (routeKey) return routeKey
  if (lastKey && tabs.some((t) => t.key === lastKey && !t.isMore)) return lastKey
  return tabs[0].key
}
