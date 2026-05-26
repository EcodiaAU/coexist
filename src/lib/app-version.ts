import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

/**
 * Single source of truth for the running app's version string.
 *
 * On native (iOS/Android) we resolve at runtime via `App.getInfo()`,
 * which returns the build's MARKETING_VERSION (iOS) / versionName
 * (Android). On web we use the FALLBACK_VERSION constant, which is
 * bumped alongside the native MARKETING_VERSION so the web SPA reports
 * the matching version when checked against app_settings.min_version.
 *
 * The resolved value is cached at module scope. First reads from
 * `getAppVersion()` are synchronous and return the fallback; the
 * `whenAppVersionReady()` promise resolves once the native lookup
 * lands (or immediately on web). Consumers that care about the real
 * version (the min-version force-update check) should `await
 * whenAppVersionReady()` before comparing.
 *
 * Update protocol: when bumping iOS MARKETING_VERSION /
 * Android versionName, bump FALLBACK_VERSION in the same commit.
 */
const FALLBACK_VERSION = '1.8.14'

let cached: string = FALLBACK_VERSION
let resolved = false

const ready: Promise<string> = (async () => {
  if (!Capacitor.isNativePlatform()) {
    resolved = true
    return cached
  }
  try {
    const info = await App.getInfo()
    if (info?.version) cached = info.version
  } catch {
    // keep fallback
  }
  resolved = true
  return cached
})()

export function getAppVersion(): string {
  return cached
}

export function isAppVersionResolved(): boolean {
  return resolved
}

export function whenAppVersionReady(): Promise<string> {
  return ready
}
