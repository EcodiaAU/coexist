import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { PluginListenerHandle } from '@capacitor/core'
import {
  NATIVE_TABS,
  NATIVE_TAB_TINT,
  activeNativeTabKey,
  formatNativeBadge,
  isBlockingOverlayOpen,
  nativeGlassTabBarSupported,
  nativeGlassTabBarSupportedSync,
  onNativeGlassTabBarSupportChange,
  setNativeTabBarSpace,
  type NativeTabKey,
} from '@/lib/native-tab-bar'

/**
 * true = drive the native Liquid Glass bar, false = render the web BottomTabBar,
 * null = an iPhone build with the plugin is still asking Device for its iOS
 * version (one call per session, a few ms). Render no bar while null so the web
 * bar never flashes before the glass one.
 */
export function useNativeGlassTabBar(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(() => nativeGlassTabBarSupportedSync())
  useEffect(() => {
    if (supported !== null) return
    let alive = true
    void nativeGlassTabBarSupported().then((ok) => { if (alive) setSupported(ok) })
    return () => { alive = false }
  }, [supported])
  // Reduce Transparency toggled in Settings while the app runs: swap bars on return.
  useEffect(() => onNativeGlassTabBarSupportChange(setSupported), [])
  return supported
}

/* Overlay presence as an external store: one MutationObserver for the app, read once per frame. */
let overlayOpen = false
const overlayListeners = new Set<() => void>()
let overlayObserver: MutationObserver | null = null
let overlayRaf = 0

function recomputeOverlay() {
  overlayRaf = 0
  const next = isBlockingOverlayOpen(document)
  if (next !== overlayOpen) {
    overlayOpen = next
    overlayListeners.forEach((l) => l())
  }
}

function subscribeOverlay(listener: () => void) {
  overlayListeners.add(listener)
  if (!overlayObserver) {
    overlayObserver = new MutationObserver(() => {
      if (!overlayRaf) overlayRaf = requestAnimationFrame(recomputeOverlay)
    })
    overlayObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['role', 'aria-modal', 'aria-hidden', 'class'],
    })
    recomputeOverlay()
  }
  return () => {
    overlayListeners.delete(listener)
    if (overlayListeners.size === 0 && overlayObserver) {
      overlayObserver.disconnect()
      overlayObserver = null
      if (overlayRaf) cancelAnimationFrame(overlayRaf)
      overlayRaf = 0
    }
  }
}

function useBlockingOverlayOpen(): boolean {
  return useSyncExternalStore(subscribeOverlay, () => overlayOpen, () => false)
}

interface NativeTabBarControllerProps {
  /** The shell's own rule: false on admin and leader routes and while the keyboard is up. */
  visible: boolean
  chatBadge: number
  onMorePress: () => void
}

/**
 * Drives the native iOS tab bar from route state. Renders nothing: the bar is
 * a UIKit view above the WebView. Routing stays in React Router; the bar only
 * reports taps (tabSelect) and mirrors the current route.
 */
export function NativeTabBarController({ visible, chatBadge, onMorePress }: NativeTabBarControllerProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const overlay = useBlockingOverlayOpen()

  // A route outside every tab (an event page, settings) keeps the last tab
  // selected, because a UITabBar always has one; the web bar shows none there.
  const routeTab = activeNativeTabKey(location.pathname)
  const lastTabRef = useRef<NativeTabKey>('home')
  if (routeTab) lastTabRef.current = routeTab
  const selectedId = routeTab ?? lastTabRef.current

  const shown = visible && !overlay
  const badge = formatNativeBadge(chatBadge)

  // Latest values for the tabSelect listener, which is registered once.
  const latest = useRef({ navigate, onMorePress, selectedId, pathname: location.pathname })
  latest.current = { navigate, onMorePress, selectedId, pathname: location.pathname }
  const pushStateRef = useRef<() => void>(() => {})

  useEffect(() => {
    let disposed = false
    let handle: PluginListenerHandle | null = null
    void (async () => {
      const { NativeNavigation } = await import('@capgo/capacitor-native-navigation')
      if (disposed) return
      await NativeNavigation.configure({ contentInsetMode: 'css' }).catch(() => {})
      const h = await NativeNavigation.addListener('tabSelect', ({ id }) => {
        const tab = NATIVE_TABS.find((t) => t.key === id)
        if (!tab) return
        if (tab.isMore) {
          latest.current.onMorePress()
          // The system bar has already moved its highlight to More; put it back on the route's tab.
          pushStateRef.current()
          return
        }
        if (latest.current.pathname !== tab.path) latest.current.navigate(tab.path)
      })
      if (disposed) { void h.remove(); return }
      handle = h
      pushStateRef.current()
    })()
    return () => {
      disposed = true
      setNativeTabBarSpace(false)
      void handle?.remove()
      void import('@capgo/capacitor-native-navigation')
        .then(({ NativeNavigation }) => NativeNavigation.setTabbar({ hidden: true, animated: false }))
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    const push = () => {
      void import('@capgo/capacitor-native-navigation').then(({ NativeNavigation }) => {
        if (!shown) return NativeNavigation.setTabbar({ hidden: true, animated: true })
        return NativeNavigation.setTabbar({
          hidden: false,
          animated: true,
          selectedId,
          labelVisibilityMode: 'labeled',
          icons: true,
          colors: { tint: NATIVE_TAB_TINT },
          tabs: NATIVE_TABS.map((t) => ({
            id: t.key,
            title: t.label,
            icon: { ios: { sfSymbol: t.sfSymbol } },
            selectedIcon: { ios: { sfSymbol: t.sfSymbolSelected } },
            ...(t.key === 'chat' && badge ? { badge } : {}),
          })),
        })
      }).catch(() => {})
    }
    pushStateRef.current = push
    setNativeTabBarSpace(shown)
    push()
  }, [shown, selectedId, badge])

  return null
}
