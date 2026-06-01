import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'

/**
 * Hardware back button handling on Android.
 *
 * Default Capacitor behaviour on Android lets the WebView consume the
 * back press as history-back, then if there's no history it EXITS the
 * app entirely. Exiting kills realtime subscriptions, drops the
 * keyboard-height observers, and forces a cold start on the next
 * launch - including the splash + auth resolution cycle. That is the
 * wrong default for a long-session app where leaders are mid-event.
 *
 * This hook installs an Android-only listener that:
 *  - at a root tab route (home / events / collectives / chat / profile /
 *    impact / more / shop), minimizes the app instead of exiting. The
 *    OS keeps the process warm; the next foreground keeps state.
 *  - at any deeper route OR when an in-app modal is open, falls back to
 *    history-back so the navigation feels native.
 *  - on iOS / web, does nothing (App.addListener doesn't fire there).
 *
 * Origin: 2026-06-01 Android love arc. iOS users only have the system
 * home-indicator gesture (no hardware back); Android users had a
 * back-press that exited the whole app from /home, which felt broken
 * after a long event-day session.
 */
const ROOT_ROUTES = new Set([
  '/',
  '/home',
  '/events',
  '/collectives',
  '/chat',
  '/profile',
  '/impact',
  '/more',
  '/shop',
])

export function useAndroidBackButton() {
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return

    let handle: { remove: () => void } | null = null

    import('@capacitor/app').then(({ App }) => {
      App.addListener('backButton', ({ canGoBack }) => {
        // Read pathname fresh at fire-time, NOT through React state -
        // the listener is registered once and lives across navigations.
        const path = window.location.pathname
        const atRoot = ROOT_ROUTES.has(path)

        if (atRoot || !canGoBack) {
          // Minimize keeps the app process warm. App.exitApp() would
          // cold-start the next launch + drop realtime subscriptions.
          App.minimizeApp()
          return
        }

        window.history.back()
      }).then((h) => {
        handle = h
      })
    })

    return () => {
      handle?.remove()
    }
  }, [])
}
