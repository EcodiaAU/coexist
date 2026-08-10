import { isNativePlatform } from '@/lib/native-share'

/**
 * Canonical public web origin for the Co-Exist app. This is the ONLY origin
 * that resolves for someone who is not already inside the native shell, so any
 * link we build for another person to open must use it on native.
 */
export const WEB_APP_URL = 'https://app.coexistaus.org'

/**
 * Origin to use when building a link that will be OPENED BY SOMEONE ELSE
 * (referral / invite / share links).
 *
 * On the web, window.location.origin is already https://app.coexistaus.org.
 * Inside the Capacitor native shell, window.location.origin is
 * `capacitor://localhost` (iOS) or `https://localhost` (Android) - a webview
 * origin that is dead for any recipient. So on native we MUST substitute the
 * public web origin, or every shared link is broken for the person receiving it.
 */
export function getPublicAppUrl(): string {
  if (isNativePlatform()) return WEB_APP_URL
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return WEB_APP_URL
}
