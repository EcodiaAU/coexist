import { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'

/**
 * Track the native keyboard height so fixed-position / flex-end elements
 * (bottom sheets, chat inputs) can offset themselves above the keyboard.
 *
 * Two signal sources, used together:
 *  - Capacitor Keyboard plugin events (only available on Capacitor native).
 *    Reliable on iOS, less reliable on some Android OEMs.
 *  - Visual Viewport API (works on every Chromium-based runtime including
 *    Capacitor Android, Chrome, Samsung Internet, Edge mobile, PWA).
 *
 * Previously this hook returned early when not on native, leaving the web
 * + PWA codepath without keyboard awareness. Bug repro 2026-04-29: a leader
 * on Samsung and another on Android (Brendan) both reported the Save
 * button on the personal-todo modal was hidden behind the soft keyboard.
 * Root cause: the BottomSheet relied on `keyboardHeight` to inset itself
 * above the keyboard, but the hook reported 0 because either (a) the user
 * was on the web build, or (b) the Capacitor plugin event did not fire.
 *
 * Fix: always subscribe to Visual Viewport (it is the cross-platform truth
 * source) and treat the Capacitor plugin event as a refinement when present.
 *
 * Sets CSS custom property `--kb-height` on `<html>` so any element can use
 * `calc(... + var(--kb-height, 0px))` without needing the hook directly.
 *
 * Returns 0 when the keyboard is hidden.
 */
export function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0)

  useEffect(() => {
    let currentHeight = 0

    const setHeight = (h: number) => {
      currentHeight = h
      setKeyboardHeight(h)
      document.documentElement.style.setProperty('--kb-height', `${h}px`)
    }

    // Capacitor plugin events - native only. Best signal where they fire.
    let showListenerP: ReturnType<typeof Keyboard.addListener> | undefined
    let hideListenerP: ReturnType<typeof Keyboard.addListener> | undefined

    if (Capacitor.isNativePlatform()) {
      showListenerP = Keyboard.addListener('keyboardWillShow', (info) => {
        setHeight(Math.round(info.keyboardHeight))
      })
      hideListenerP = Keyboard.addListener('keyboardWillHide', () => {
        setHeight(0)
      })
    }

    // Visual Viewport API - works everywhere. Primary signal on web/PWA,
    // fallback on Android Capacitor when the plugin event is delayed/missing.
    const vv = window.visualViewport
    let vvUpdate: (() => void) | undefined
    if (vv) {
      vvUpdate = () => {
        const vvHeight = Math.max(0, Math.round(window.innerHeight - vv.height))
        // Threshold filtering:
        //  - >=80px = soft keyboard up (typical keyboards are 240-360px)
        //  - <40px while currently open = keyboard dismissed
        //  - in-between = treat as no-op (browser chrome collapse, autofill bar)
        if (vvHeight >= 80) {
          if (Math.abs(vvHeight - currentHeight) >= 4) setHeight(vvHeight)
        } else if (currentHeight > 0 && vvHeight < 40) {
          setHeight(0)
        }
      }
      vv.addEventListener('resize', vvUpdate)
    }

    return () => {
      showListenerP?.then((h) => h.remove())
      hideListenerP?.then((h) => h.remove())
      if (vv && vvUpdate) {
        vv.removeEventListener('resize', vvUpdate)
      }
      document.documentElement.style.setProperty('--kb-height', '0px')
    }
  }, [])

  return keyboardHeight
}
