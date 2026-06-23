import { Capacitor } from '@capacitor/core'

/**
 * Store-routing platform. Native shell first, then a mobile-browser UA sniff so
 * a person reading the site on their phone sees the right store (usePlatform()
 * treats a mobile browser as web, which is wrong for "download the app").
 */
export function getDevicePlatform(): 'ios' | 'android' | 'web' {
  if (typeof window === 'undefined') return 'web'
  if (Capacitor.isNativePlatform()) return Capacitor.getPlatform() as 'ios' | 'android'
  const ua = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
  if (/android/.test(ua)) return 'android'
  return 'web'
}

export const APP_STORE_URL = 'https://apps.apple.com/au/app/co-exist/id6760897574'
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=org.coexistaus.app&hl=en'
