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

/**
 * True when the field scrolls inside its own scroller below the room scroller.
 * The spacer extends a step whose content scrolls as a whole. A step that owns
 * its scroller (Join your Collectives: a min-h-0 flex with an overflow list) is
 * squeezed by it instead: measured on Android 10, typing in the collective
 * search shrank the list to an 18px viewport, so the results were invisible
 * while typing. Without the room that list stays visible above the keyboard.
 */
export function insideNestedScroller(el: HTMLElement, scroller: HTMLElement | null): boolean {
  for (let n = el.parentElement; n && n !== scroller; n = n.parentElement) {
    const y = getComputedStyle(n).overflowY
    if (y === 'auto' || y === 'scroll') return true
  }
  return false
}

/** Scroll the focused field into the top of the screen if it may sit under the keyboard. */
export function liftAboveBlindKeyboard(el: HTMLElement, container: HTMLElement | null) {
  const scroller = container ?? el.closest<HTMLElement>('[data-kb-room-scroll]')
  if (!scroller) return
  const rect = el.getBoundingClientRect()
  if (rect.bottom <= window.innerHeight * 0.4) return
  scroller.scrollBy({ top: rect.top - window.innerHeight * 0.2, behavior: 'smooth' })
}

export interface BlindKeyboardRoomOptions {
  /** Defaults to Android native. */
  enabled?: boolean
  /**
   * Releases the room whenever it changes. Pass the step (or whatever swaps the
   * content under the container).
   *
   * WHY (2026-10-16). Tapping Continue moves focus to the button, which is
   * inside the container, so onBlur keeps the room on purpose. The step change
   * then unmounts that button, and a removed element fires no blur React
   * delivers. Without this the room outlived its step: proven on an Android 10
   * emulator, the 444px spacer rode from the location step through phone and
   * safety into "Join your Collectives", whose min-h-0 layout gave the
   * collective list an 18px viewport and left the bottom 60% of the screen
   * blank. Releasing at once is safe because the content under the finger is
   * being replaced anyway; the 400ms delay only matters within a step. The
   * room remembers the key it opened under, so it is derived off as soon as the
   * key moves, and a timer armed on the old step cannot reopen it on the new
   * one. A field on the new step opens a fresh room under the new key.
   */
  resetKey?: unknown
}

export function useBlindKeyboardRoom({
  enabled = Capacitor.getPlatform() === 'android',
  resetKey,
}: BlindKeyboardRoomOptions = {}) {
  // The resetKey the room was opened under, or null when closed.
  const [openFor, setOpenFor] = useState<{ key: unknown } | null>(null)
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
      const key = resetKey
      timer.current = window.setTimeout(() => {
        if (document.activeElement !== target) return
        const scroller = target.closest<HTMLElement>('[data-kb-room-scroll]')
        if (!keyboardInvisibleToLayout() || insideNestedScroller(target, scroller)) {
          setOpenFor(null)
          return
        }
        setOpenFor({ key })
        // Two frames: one for React to commit the spacer, one for layout.
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            liftAboveBlindKeyboard(target, scroller),
          ),
        )
      }, ACTIVATE_DELAY_MS)
    },
    [enabled, resetKey],
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
        setOpenFor(null)
      }, RELEASE_DELAY_MS)
    },
    [enabled],
  )

  const active = enabled && openFor !== null && Object.is(openFor.key, resetKey)
  return { active, onFocus, onBlur }
}
