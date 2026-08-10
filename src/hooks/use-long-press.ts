import { useRef, useEffect, useCallback } from 'react'
import { hapticImpact } from '@/lib/haptics'

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
      // Haptic confirmation that the long-press gesture has triggered. Long-press
      // is a discrete intentional gesture, so a confirmation pulse that
      // distinguishes it from a normal tap is worth it. Native (iOS + Android)
      // uses @capacitor/haptics; web falls back to navigator.vibrate.
      void hapticImpact('medium')
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
