import { Capacitor } from '@capacitor/core'

// Thin haptics helper (C5). The base is heavily iOS, where the Web Vibration
// API (navigator.vibrate) is a no-op, so tactile feedback was silently absent.
// On native we route through @capacitor/haptics; on web we fall back to
// navigator.vibrate (works on Android browsers, silent on iOS Safari as before).
//
// The plugin is dynamically imported and cached so it never enters the web
// critical bundle and never fires the Capacitor proxy `.then` trap.

type HapticsModule = {
  Haptics: {
    impact: (opts: { style: unknown }) => Promise<void>
    notification: (opts: { type: unknown }) => Promise<void>
    selectionStart: () => Promise<void>
    selectionChanged: () => Promise<void>
    selectionEnd: () => Promise<void>
  }
  ImpactStyle: { Light: unknown; Medium: unknown; Heavy: unknown }
  NotificationType: { Success: unknown; Warning: unknown; Error: unknown }
}

let modRef: HapticsModule | null = null
let loadPromise: Promise<void> | null = null

function ensure(): Promise<void> {
  if (loadPromise) return loadPromise
  if (!Capacitor.isNativePlatform()) {
    loadPromise = Promise.resolve()
    return loadPromise
  }
  loadPromise = (async () => {
    try {
      modRef = (await import('@capacitor/haptics')) as unknown as HapticsModule
    } catch {
      modRef = null
    }
  })()
  return loadPromise
}

function webVibrate(ms = 15) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(ms)
  }
}

/** A discrete impact tap (buttons, long-press, tab switches). */
export async function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'light'): Promise<void> {
  if (!Capacitor.isNativePlatform()) { webVibrate(style === 'heavy' ? 25 : 15); return }
  await ensure()
  if (!modRef) { webVibrate(); return }
  try {
    const s = style === 'heavy' ? modRef.ImpactStyle.Heavy
      : style === 'medium' ? modRef.ImpactStyle.Medium
        : modRef.ImpactStyle.Light
    await modRef.Haptics.impact({ style: s })
  } catch { /* best-effort */ }
}

/** A notification result cue (check-in success, error toast). */
export async function hapticNotification(type: 'success' | 'warning' | 'error' = 'success'): Promise<void> {
  if (!Capacitor.isNativePlatform()) { webVibrate(); return }
  await ensure()
  if (!modRef) { webVibrate(); return }
  try {
    const t = type === 'error' ? modRef.NotificationType.Error
      : type === 'warning' ? modRef.NotificationType.Warning
        : modRef.NotificationType.Success
    await modRef.Haptics.notification({ type: t })
  } catch { /* best-effort */ }
}

/** A light selection tick (segmented controls, pickers). */
export async function hapticSelection(): Promise<void> {
  if (!Capacitor.isNativePlatform()) { webVibrate(10); return }
  await ensure()
  if (!modRef) { webVibrate(10); return }
  try {
    await modRef.Haptics.selectionStart()
    await modRef.Haptics.selectionChanged()
    await modRef.Haptics.selectionEnd()
  } catch { /* best-effort */ }
}
