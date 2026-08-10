import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'

// Injected by vite.config.ts `define` from package.json at build time.
declare const __APP_VERSION__: string

/** Web/build version baked in at compile time (e.g. "2.2.0"). */
export const BUILD_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'

/**
 * The user-facing app version. Starts from the compile-time BUILD_VERSION and,
 * on native, upgrades to the real installed build via @capacitor/app
 * (`version (build)`, e.g. "2.2.0 (89)") so support can identify the exact
 * binary a member is running. On web the compile-time value stands.
 */
export function useAppVersion(): string {
  const [version, setVersion] = useState<string>(BUILD_VERSION)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let mounted = true
    import('@capacitor/app')
      .then(({ App }) => App.getInfo())
      .then((info) => {
        if (mounted && info?.version) {
          setVersion(info.build ? `${info.version} (${info.build})` : info.version)
        }
      })
      .catch(() => { /* fall back to BUILD_VERSION */ })
    return () => { mounted = false }
  }, [])

  return version
}
