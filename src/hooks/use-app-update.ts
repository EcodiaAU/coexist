import { useState, useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { supabase } from '@/lib/supabase'
import { getAppVersion, whenAppVersionReady } from '@/lib/app-version'

/** Compare two semver strings. Returns -1, 0, or 1. */
function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

interface UpdateStatus {
  updateAvailable: boolean
  latestVersion: string | null
  forceUpdate: boolean
  maintenanceMode: boolean
  maintenanceMessage?: string
  /** Current installed version (resolved from Capacitor App on native, falls back to web constant). */
  installedVersion: string
}

/** How often to re-check (ms) */
const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Checks the Supabase `app_settings` key/value table for maintenance mode
 * and minimum/latest version. Each row has { key: text, value: jsonb }.
 * Expected keys:
 *   maintenance_mode    -> jsonb boolean or string "true"
 *   maintenance_message -> jsonb string
 *   min_version         -> jsonb string e.g. "1.8.14"
 *   latest_version      -> jsonb string e.g. "1.8.14"
 *
 * The installed version is resolved at runtime from Capacitor App's
 * `getInfo()` on native, so a 1.8.14 iOS binary reports as "1.8.14"
 * and the comparison against min_version is meaningful. Pre-2026-05-26
 * the hook compared a hardcoded "1.0.0", which silently force-updated
 * every native user any time min_version was set above zero -- so the
 * key was never set in production. The cutover rollout for floating-
 * local will set min_version = '1.8.14' once enough native users have
 * installed the matching build.
 *
 * Returns safe defaults if the table doesn't exist or the fetch fails.
 */
export function useAppUpdate(): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>({
    updateAvailable: false,
    latestVersion: getAppVersion(),
    forceUpdate: false,
    maintenanceMode: false,
    installedVersion: getAppVersion(),
  })
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined)

  useEffect(() => {
    let mounted = true

    async function check() {
      try {
        // Wait for the native version lookup to finish so the very
        // first comparison uses the real CFBundleShortVersionString,
        // not the fallback constant. On web this resolves immediately.
        const installed = await whenAppVersionReady()

        const { data, error } = await supabase.from('app_settings')
          .select('key, value')
          .in('key', ['maintenance_mode', 'maintenance_message', 'min_version', 'latest_version'])

        if (error || !data) return

        // value is jsonb - could be string, boolean, number, etc.
        const config: Record<string, string> = {}
        for (const row of data) {
          const v = row.value
          config[row.key] = typeof v === 'string' ? v : JSON.stringify(v)
        }

        const maintenanceMode = config.maintenance_mode === 'true'
        const maintenanceMessage = config.maintenance_message || undefined
        const minVersion = config.min_version || null
        const latestVersion = config.latest_version || null

        // Force-update is a NATIVE-only gate. The web app (app.coexist.au)
        // always serves the latest deployed bundle, so it can never be
        // "behind" min_version - blocking it would lock web users behind an
        // App Store screen they cannot satisfy. So min_version applies only
        // to installed native binaries, whose real version resolves via
        // App.getInfo(). On web, forceUpdate is always false.
        const isNative = Capacitor.isNativePlatform()
        const forceUpdate = isNative && minVersion ? compareSemver(installed, minVersion) < 0 : false
        const updateAvailable = isNative && latestVersion ? compareSemver(installed, latestVersion) < 0 : false

        if (mounted) {
          setStatus({
            updateAvailable,
            latestVersion,
            forceUpdate,
            maintenanceMode,
            maintenanceMessage,
            installedVersion: installed,
          })
        }
      } catch {
        // Network error - keep previous status, don't crash
      }
    }

    check()
    intervalRef.current = setInterval(check, CHECK_INTERVAL_MS)

    return () => {
      mounted = false
      clearInterval(intervalRef.current)
    }
  }, [])

  return status
}

export { getAppVersion as APP_VERSION_RESOLVER }
