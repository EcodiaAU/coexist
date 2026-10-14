import { useCallback, useEffect, useRef, useState, type FocusEvent } from 'react'
import { Capacitor } from '@capacitor/core'

/*
 * KEYBOARD ROOM FOR A WEBVIEW THAT CANNOT SEE THE KEYBOARD.
 *
 * Reported twice by Matthew Steele through Co-Exist (2026-09-23, re-forwarded
 * 2026-10-14): on the onboarding safety step the app "will not let me scroll
 * down". The 23 Sep fix (h-screen-kb, globals.css) subtracts --kb-height from the
 * screen root, which works on iOS. He is on a Samsung Galaxy S9 running Android
 * 10, and there --kb-height is always 0.
 *
 * WHY. MainActivity runs windowSoftInputMode="adjustNothing" (commit 44e83d5d).
 * On Android 10 and older that keeps the soft keyboard out of the window insets
 * entirely, so the Capacitor Keyboard plugin fires no keyboardWillShow, the
 * SystemBars plugin pads nothing, and the WebView keeps its full size, which
 * means visualViewport does not move either. Every signal useKeyboardHeight
 * listens to stays silent while the keyboard covers the bottom ~40% of the
 * screen. On Android 11+ the insets do arrive and the WebView shrinks, so this
 * never engages there.
 *
 * MEASURED on the deployed app at 360x740 (Galaxy S9 CSS size), keyboard
 * covering y>=440, scroll container at maximum scroll: Continue bottom y=648 and
 * "I'll do this later" y=716, both unreachable; with the keyboard closed both are
 * reachable (648 and 716 inside 740). So the step is a dead end exactly while
 * the keyboard is up, which is the whole time someone is typing in it.
 *
 * WHAT THIS DOES. While a text field inside the container has focus, and the
 * keyboard is invisible to layout (no --kb-height AND the WebView is still
 * full height), it reports `active` so the screen can render `blindKeyboardRoom()`
 * pixels of spacer at the end of its scroll content, and lifts the focused
 * field into the top part of the screen. Scrolling to the end then brings the
 * buttons above any keyboard up to 60% of the screen tall. The spacer stays
 * while focus moves between fields and buttons inside the container, and goes
 * 400ms after focus leaves it, so a tap on Continue never hits content that
 * moved under the finger.
 *
 * It never writes --kb-height: bottom sheets, modals and the chat input offset
 * themselves by that variable, and a guessed keyboard height that is harmless as
 * extra scroll room would float them off the keyboard.
 */

const ACTIVATE_DELAY_MS = 350
const RELEASE_DELAY_MS = 400

/** Fraction of the viewport the spacer adds; covers any keyboard up to this tall. */
export const BLIND_KEYBOARD_ROOM_FRACTION = 0.6

export function blindKeyboardRoom(): number {
  return Math.round(window.innerHeight * BLIND_KEYBOARD_ROOM_FRACTION)
}

export function isTextField(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) {
    return !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image', 'hidden'].includes(el.type)
  }
  return el.isContentEditable
}

/**
 * True when nothing has told the layout a keyboard is open: --kb-height is 0
 * and the WebView has not shrunk. On a phone where the keyboard is reported
 * (iOS, Android 11+) one of the two is always false while it is up.
 */
export function keyboardInvisibleToLayout(): boolean {
  const kb = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--kb-height')) || 0
  if (kb > 0) return false
  const screenH = window.screen?.height || 0
  if (!screenH) return true
  return window.innerHeight > screenH * 0.75
}

/** Scroll the focused field into the top of the screen if it may sit under the keyboard. */
export function liftAboveBlindKeyboard(el: HTMLElement, container: HTMLElement | null) {
  const scroller = container ?? el.closest<HTMLElement>('[data-kb-room-scroll]')
  if (!scroller) return
  const rect = el.getBoundingClientRect()
  if (rect.bottom <= window.innerHeight * 0.4) return
  scroller.scrollBy({ top: rect.top - window.innerHeight * 0.2, behavior: 'smooth' })
}

export function useBlindKeyboardRoom(enabled: boolean = Capacitor.getPlatform() === 'android') {
  const [active, setActive] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  const clearTimer = () => {
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    timer.current = undefined
  }

  useEffect(() => clearTimer, [])

  const onFocus = useCallback(
    (e: FocusEvent<HTMLElement>) => {
      if (!enabled) return
      const target = e.target
      if (!isTextField(target)) {
        // Focus moved to a button or link inside the container: keep the room.
        clearTimer()
        return
      }
      clearTimer()
      timer.current = window.setTimeout(() => {
        if (document.activeElement !== target) return
        if (!keyboardInvisibleToLayout()) {
          setActive(false)
          return
        }
        setActive(true)
        // Two frames: one for React to commit the spacer, one for layout.
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            liftAboveBlindKeyboard(target, target.closest<HTMLElement>('[data-kb-room-scroll]')),
          ),
        )
      }, ACTIVATE_DELAY_MS)
    },
    [enabled],
  )

  const onBlur = useCallback(
    (e: FocusEvent<HTMLElement>) => {
      if (!enabled) return
      const container = e.currentTarget
      const next = e.relatedTarget
      if (next instanceof Node && container.contains(next)) return
      clearTimer()
      timer.current = window.setTimeout(() => {
        const now = document.activeElement
        if (now && container.contains(now)) return
        setActive(false)
      }, RELEASE_DELAY_MS)
    },
    [enabled],
  )

  return { active: enabled && active, onFocus, onBlur }
}
