import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const APP_VERSION = '1.0.0'

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
}

/** How often to re-check (ms) */
const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Checks the Supabase `app_settings` key/value table for maintenance mode
 * and minimum/latest version. Each row has { key: text, value: jsonb }.
 * Expected keys:
 *   maintenance_mode    → jsonb boolean or string "true"
 *   maintenance_message → jsonb string
 *   min_version         → jsonb string e.g. "1.1.0"
 *   latest_version      → jsonb string e.g. "1.2.0"
 *
 * Returns safe defaults if the table doesn't exist or the fetch fails.
 */
export function useAppUpdate(): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>({
    updateAvailable: false,
    latestVersion: APP_VERSION,
    forceUpdate: false,
    maintenanceMode: false,
  })
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined)

  useEffect(() => {
    let mounted = true

    async function check() {
      try {
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

        const forceUpdate = minVersion ? compareSemver(APP_VERSION, minVersion) < 0 : false
        const updateAvailable = latestVersion ? compareSemver(APP_VERSION, latestVersion) < 0 : false

        if (mounted) {
          setStatus({ updateAvailable, latestVersion, forceUpdate, maintenanceMode, maintenanceMessage })
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

export { APP_VERSION }
