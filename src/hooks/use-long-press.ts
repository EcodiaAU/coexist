import { useRef, useEffect, useCallback } from 'react'

interface LongPressHandlers {
  onTouchStart: () => void
  onTouchEnd: () => void
  onTouchCancel: () => void
}

/**
 * Hook for handling long-press interactions on mobile
 * Triggers callback after 500ms of sustained touch
 */
export function useLongPress(onLongPress?: () => void): LongPressHandlers {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
      }
    }
  }, [])

  const handleTouchStart = useCallback(() => {
    if (!onLongPress) return
    longPressTimerRef.current = setTimeout(() => {
      onLongPress()
      // Haptic confirmation that the long-press gesture has triggered.
      // Kept (per haptic pruning policy) because long-press is a discrete
      // intentional gesture; users benefit from a confirmation pulse that
      // distinguishes it from a normal tap. Web Vibration API only - silent
      // on iOS, fires on Android browsers + WebView.
      if ('vibrate' in navigator) {
        navigator.vibrate(15)
      }
    }, 500)
  }, [onLongPress])

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchEnd,
  }
}
