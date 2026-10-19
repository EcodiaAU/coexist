// Native iOS 26 Liquid Glass tab bar.
//
// On an iPhone running iOS 26 or later, inside a store build that carries
// @capgo/capacitor-native-navigation, the member tab bar (Home, Chat, Profile,
// More) is a real UIKit UITabBar hosted by a UITabBarController, so iOS draws
// it in Apple's own Liquid Glass material. Everywhere else (Android, the web,
// iOS 25 and older, and any phone still on a store build without the plugin)
// the web BottomTabBar renders exactly as before.
//
// The plugin is inert in the binary until JS calls it, so this file is the
// only switch: set NATIVE_GLASS_TAB_BAR to false and ship an OTA to put every
// iPhone back on the web tab bar without a store release.

import { Capacitor } from '@capacitor/core'

/** Kill switch. false + an OTA = every iPhone back on the web tab bar. */
export const NATIVE_GLASS_TAB_BAR = true

/** Liquid Glass is an iOS 26 material; below it the plugin draws a blur capsule, which we do not ship. */
export const NATIVE_TAB_BAR_MIN_IOS_MAJOR = 26

/** Capacitor plugin names, as registered by registerPlugin() in each package. */
export const NATIVE_NAVIGATION_PLUGIN = 'NativeNavigation'
export const DEVICE_PLUGIN = 'Device'

/**
 * While the glass bar shows, UIKit counts it inside env(safe-area-inset-bottom)
 * (measured on iOS 26.5: 34px without the bar, 83px with it), so every layout
 * that adds the web bar's 3.5rem on top of --safe-bottom would clear the bar
 * twice. Those layouts read --tab-bar-space instead, which is 0 here.
 */
export const TAB_BAR_SPACE_VAR = '--tab-bar-space'

export function setNativeTabBarSpace(shown: boolean, root: HTMLElement = document.documentElement): void {
  if (shown) root.style.setProperty(TAB_BAR_SPACE_VAR, '0px')
  else root.style.removeProperty(TAB_BAR_SPACE_VAR)
}

/** Brand tint for the selected tab (--color-primary-800). iOS 26 ignores the inactive tint by design. */
export const NATIVE_TAB_TINT = '#3d4d33'

export type NativeTabKey = 'home' | 'chat' | 'profile' | 'more'

export interface NativeTabSpec {
  key: NativeTabKey
  label: string
  path: string
  exact?: boolean
  isMore?: boolean
  sfSymbol: string
  sfSymbolSelected: string
}

/** Mirrors baseTabs in bottom-tab-bar.tsx, with SF Symbols in place of the lucide icons. */
export const NATIVE_TABS: readonly NativeTabSpec[] = [
  { key: 'home', label: 'Home', path: '/', exact: true, sfSymbol: 'house', sfSymbolSelected: 'house.fill' },
  { key: 'chat', label: 'Chat', path: '/chat', sfSymbol: 'message', sfSymbolSelected: 'message.fill' },
  { key: 'profile', label: 'Profile', path: '/profile', sfSymbol: 'person', sfSymbolSelected: 'person.fill' },
  { key: 'more', label: 'More', path: '/more', exact: true, isMore: true, sfSymbol: 'ellipsis', sfSymbolSelected: 'ellipsis' },
]

/** Same rule as BottomTabBar.isActive: More never reads active, '/' and exact tabs match exactly, the rest by prefix. */
export function isNativeTabActive(tab: Pick<NativeTabSpec, 'path' | 'exact' | 'isMore'>, pathname: string): boolean {
  if (tab.isMore) return false
  if (tab.exact || tab.path === '/') return pathname === tab.path
  return pathname.startsWith(tab.path)
}

/** The tab a route belongs to, or null for a route outside every tab (an event page, settings). */
export function activeNativeTabKey(pathname: string): NativeTabKey | null {
  return NATIVE_TABS.find((t) => isNativeTabActive(t, pathname))?.key ?? null
}

export function formatNativeBadge(count: number): string | undefined {
  if (!Number.isFinite(count) || count <= 0) return undefined
  return count > 99 ? '99+' : String(Math.floor(count))
}

/** Leading integer of an OS version string ("26.0.1" -> 26). Anything unparseable reads 0, which fails the gate closed. */
export function iosMajorVersion(osVersion: string | undefined | null): number {
  const m = /^\s*(\d+)/.exec(osVersion ?? '')
  return m ? Number(m[1]) : 0
}

export interface NativeTabBarEnv {
  enabled: boolean
  platform: string
  hasNavigationPlugin: boolean
  hasDevicePlugin: boolean
  osVersion: string | undefined | null
  /** Device model identifier ("iPhone17,1"). iPadOS 26 puts a UITabBarController's bar at the TOP, so iPad keeps the web bar. */
  model: string | undefined | null
}

/** Pure gate, so the decision is testable without a phone. */
export function shouldUseNativeTabBar(env: NativeTabBarEnv): boolean {
  if (!env.enabled) return false
  if (env.platform !== 'ios') return false
  if (!env.hasNavigationPlugin || !env.hasDevicePlugin) return false
  if (!(env.model ?? '').startsWith('iPhone')) return false
  return iosMajorVersion(env.osVersion) >= NATIVE_TAB_BAR_MIN_IOS_MAJOR
}

let supportPromise: Promise<boolean> | null = null
let supportResolved: boolean | null = null

/**
 * Synchronous half of the gate (no plugin call). False on Android, the web and
 * any store build without the plugin, so those render the web bar on the first
 * frame with no wait.
 */
export function nativeTabBarPossible(): boolean {
  return shouldUseNativeTabBar({
    enabled: NATIVE_GLASS_TAB_BAR,
    platform: Capacitor.getPlatform(),
    hasNavigationPlugin: Capacitor.isPluginAvailable(NATIVE_NAVIGATION_PLUGIN),
    hasDevicePlugin: Capacitor.isPluginAvailable(DEVICE_PLUGIN),
    osVersion: '99',
    model: 'iPhone',
  })
}

/** The settled answer, or null while the one Device.getInfo() call is in flight. */
export function nativeGlassTabBarSupportedSync(): boolean | null {
  if (supportResolved !== null) return supportResolved
  if (!nativeTabBarPossible()) return false
  return null
}

/**
 * Resolves once per app session. Never rejects: any failure (old store build
 * without the plugin, Device unavailable) answers false and the web bar stays.
 */
export function nativeGlassTabBarSupported(): Promise<boolean> {
  if (supportPromise) return supportPromise
  supportPromise = (async () => {
    const platform = Capacitor.getPlatform()
    const hasNavigationPlugin = Capacitor.isPluginAvailable(NATIVE_NAVIGATION_PLUGIN)
    const hasDevicePlugin = Capacitor.isPluginAvailable(DEVICE_PLUGIN)
    if (!nativeTabBarPossible()) return false
    try {
      const { Device } = await import('@capacitor/device')
      const { osVersion, model } = await Device.getInfo()
      return shouldUseNativeTabBar({ enabled: NATIVE_GLASS_TAB_BAR, platform, hasNavigationPlugin, hasDevicePlugin, osVersion, model })
    } catch {
      return false
    }
  })().then((ok) => {
    supportResolved = ok
    return ok
  })
  return supportPromise
}

/**
 * Anything that covers the screen must also cover the tab bar. A web overlay
 * cannot paint over a native view, so the bar hides while one is open: every
 * modal surface (BottomSheet, the More sidebar, Radix dialogs) and the
 * full-screen fixed layers (chat search, photo viewer, update-required,
 * celebration) that take input. Decorative layers (confetti) are
 * pointer-events-none and do not count.
 */
const MODAL_SELECTOR = '[aria-modal="true"], [role="dialog"]:not([aria-modal="false"]), [role="alertdialog"]'
const FULLSCREEN_SELECTOR = '.fixed.inset-0'

export function isBlockingOverlayOpen(doc: Document = document): boolean {
  const view = doc.defaultView
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>(MODAL_SELECTOR))) {
    // display:none leaves no box; a closed-but-mounted dialog must not hide the bar.
    if (el.getClientRects().length > 0) return true
  }
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>(FULLSCREEN_SELECTOR))) {
    if (el.getAttribute('aria-hidden') === 'true') continue
    if (el.classList.contains('pointer-events-none')) continue
    const style = view?.getComputedStyle(el)
    if (!style) continue
    if (style.pointerEvents === 'none' || style.visibility === 'hidden' || style.display === 'none') continue
    const z = Number.parseInt(style.zIndex, 10)
    if (Number.isFinite(z) && z >= 50) return true
  }
  return false
}
