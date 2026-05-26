import { Capacitor } from '@capacitor/core'

/**
 * Single source of truth for the running app's version string.
 *
 * On native (iOS/Android) we resolve at runtime via `App.getInfo()`,
 * which returns the build's MARKETING_VERSION (iOS) / versionName
 * (Android). On web we use the FALLBACK_VERSION constant, which is
 * bumped alongside the native marketing version so the web SPA reports
 * the matching version when checked against app_settings.min_version.
 *
 * Lookup is LAZY (only fires when something calls
 * `whenAppVersionReady()`) and the `@capacitor/app` import is dynamic.
 * Doing the work at module-load time triggered a white-screen startup
 * on iOS build 48 (1.8.14) -- the eager async IIFE landed an unhandled
 * rejection during the cold-start race with Capacitor's plugin
 * registration. Lazy + dynamic-import dodges that race.
 *
 * Update protocol: when bumping iOS MARKETING_VERSION /
 * Android versionName, bump FALLBACK_VERSION in the same commit.
 */
const FALLBACK_VERSION = '1.8.15'

let cached: string = FALLBACK_VERSION
let initPromise: Promise<string> | null = null

export function getAppVersion(): string {
  return cached
}

export function whenAppVersionReady(): Promise<string> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    try {
      if (!Capacitor.isNativePlatform()) return cached
      const { App } = await import('@capacitor/app')
      const info = await App.getInfo()
      if (info?.version) cached = info.version
    } catch {
      // keep fallback - never crash the app over a version lookup
    }
    return cached
  })()
  return initPromise
}
