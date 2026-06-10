import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'

function isTextInput(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) {
    const type = el.type
    return (
      type === 'text' ||
      type === 'email' ||
      type === 'password' ||
      type === 'search' ||
      type === 'tel' ||
      type === 'url' ||
      type === 'number' ||
      type === 'date' ||
      type === 'datetime-local' ||
      type === 'time'
    )
  }
  if (el instanceof HTMLSelectElement) return true
  if (el.getAttribute('contenteditable') === 'true') return true
  return false
}

function scrollFocusedIntoView(delay = 300) {
  const el = document.activeElement
  if (!isTextInput(el)) return

  // Use setTimeout to let the WebView body resize settle before scrolling.
  // requestAnimationFrame alone fires before Capacitor's body resize completes.
  setTimeout(() => {
    // Re-check - focus may have moved during the delay
    const current = document.activeElement
    if (!isTextInput(current)) return
    // 'nearest' scrolls only as much as needed to bring the input into the
    // visible scrollport. Keyboard avoidance is handled declaratively by the
    // global `scroll-margin-bottom: var(--kb-height)` rule on form fields, so
    // 'nearest' lands the input just above the keyboard line instead of
    // shooting to the top of the screen ('start') or recentering far above
    // the keyboard top ('center', which overshoots when Capacitor Keyboard
    // resize:'none' leaves window.innerHeight at the full WebView height).
    current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, delay)
}

/**
 * Listens for native keyboard show/hide events and scrolls the
 * focused input into view so it isn't hidden behind the keyboard.
 *
 * On native: uses Capacitor Keyboard plugin events.
 * Also listens for focusin on text inputs to handle field-switching
 * while the keyboard is already open.
 */
export function useKeyboard() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let keyboardVisible = false

    // When keyboard appears, scroll the focused element into view
    const onKeyboardShow = () => {
      keyboardVisible = true
      scrollFocusedIntoView()
    }

    const onKeyboardHide = () => {
      keyboardVisible = false
    }

    // Use keyboardDidShow for the scroll - by this point the body
    // resize has completed and scrollIntoView targets the right position.
    const showListener = Keyboard.addListener('keyboardDidShow', onKeyboardShow)
    const hideListener = Keyboard.addListener('keyboardDidHide', onKeyboardHide)

    // Handle focus changes (e.g. tapping a different input while keyboard is open)
    const onFocusIn = (e: FocusEvent) => {
      if (!keyboardVisible) return
      if (!isTextInput(e.target as Element)) return
      scrollFocusedIntoView(150)
    }

    document.addEventListener('focusin', onFocusIn, { passive: true })

    return () => {
      showListener.then((h) => h.remove())
      hideListener.then((h) => h.remove())
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [])
}
