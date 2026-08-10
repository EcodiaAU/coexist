import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'

// Honour the OS text-size / Dynamic Type setting on native (C4). The app's type
// is rem on a fixed root and globals.css pinned text-size-adjust:100%, so a
// low-vision user who bumped their system font size saw no change. We read the
// device's preferred text zoom via @capacitor/text-zoom and scale the document
// root font-size (which scales all rem-based type), re-applying on resume in
// case the setting changed while backgrounded. An upper clamp keeps the fixed
// layout from breaking at the largest accessibility sizes.
//
// Web is unaffected: the hook is native-gated and returns immediately.

const MIN_SCALE = 1.0
const MAX_SCALE = 1.4

export function useTextZoom() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let removed = false
    let appListener: { remove: () => void } | null = null

    const apply = async () => {
      try {
        const { TextZoom } = await import('@capacitor/text-zoom')
        const { value } = await TextZoom.getPreferred()
        const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, value || 1))
        document.documentElement.style.fontSize = `${Math.round(clamped * 100)}%`
      } catch { /* plugin unavailable - leave root font-size untouched */ }
    }

    void apply()

    import('@capacitor/app')
      .then(({ App }) => {
        if (removed) return
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) void apply()
        }).then((l) => {
          if (removed) l.remove()
          else appListener = l
        })
      })
      .catch(() => { /* best-effort */ })

    return () => { removed = true; appListener?.remove() }
  }, [])
}
