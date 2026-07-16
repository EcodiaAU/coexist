import { motion, useReducedMotion } from 'framer-motion'
import { Capacitor } from '@capacitor/core'
import { APP_NAME } from '@/lib/constants'
import { cn } from '@/lib/cn'

interface UpdateRequiredProps {
  latestVersion?: string | null
  installedVersion?: string
  className?: string
}

// Web (Vercel) + visible href fallback.
// No /au/ in the path - hardcoding the storefront country produced
// "not available in your region" for any user whose Apple ID is signed
// in to a non-AU storefront, even when the app IS live on AU (verified
// 2026-06-01 via the iTunes lookup API). Apple resolves the country-less
// /app/idXXXX URL against the user's own storefront, so a US Apple ID
// gets the US listing (404 if not available there) and an AU Apple ID
// gets the AU listing. This is the correct cross-store deep-link shape.
const APP_STORE_WEB = 'https://apps.apple.com/app/id6760897574'
const PLAY_STORE_WEB = 'https://play.google.com/store/apps/details?id=org.coexistaus.app'

// Native deep-link schemes. A plain https://apps.apple.com link does NOT open
// the App Store app from inside a WKWebView - Apple disables universal-link
// handling for webview-initiated navigation, so the link just tries to load
// the store web page inside the webview and appears to do nothing. The
// itms-apps:// (iOS) and market:// (Android) schemes are non-http, so
// Capacitor's navigation delegate hands them straight to the OS, which opens
// the native store app on the app's listing.
const APP_STORE_DEEP = 'itms-apps://apps.apple.com/app/id6760897574'
const PLAY_STORE_DEEP = 'market://details?id=org.coexistaus.app'

function openStore(platform: 'ios' | 'android') {
  const isNative = Capacitor.isNativePlatform()
  const url = isNative
    ? platform === 'ios' ? APP_STORE_DEEP : PLAY_STORE_DEEP
    : platform === 'ios' ? APP_STORE_WEB : PLAY_STORE_WEB
  // '_system' matches the app's existing external-open convention
  // (see event-detail.tsx). On native the custom scheme hands off to the
  // OS store app; on web '_blank' opens a new tab.
  window.open(url, isNative ? '_system' : '_blank')
}

/**
 * Blocking screen shown when the installed app version is older than
 * the value stored in `app_settings.min_version`. Renders Store links
 * sized for the running platform so a single tap takes the user to
 * the right update flow.
 *
 * Origin: 2026-05-26 floating-local rollout. Without a forced-update
 * gate, native stragglers on the pre-floating-local code would render
 * wall-clock-as-UTC stored event dates through the old local-tz
 * formatter and see every event shifted by 8-11 hours. The gate
 * fires only when min_version is bumped, which the cutover sequence
 * does as the last step after the data migration runs.
 */
export function UpdateRequired({
  latestVersion,
  installedVersion,
  className,
}: UpdateRequiredProps) {
  const shouldReduceMotion = useReducedMotion()
  const isIOS = Capacitor.getPlatform() === 'ios'
  const isAndroid = Capacitor.getPlatform() === 'android'
  const isNative = Capacitor.isNativePlatform()

  const versionTagline = latestVersion
    ? `Co-Exist ${latestVersion} brings the latest fixes and improvements.`
    : 'A required update is ready with the latest fixes and improvements.'

  return (
    <div data-eos-id="src/components/update-required.tsx#0" data-eos-v="2"
      className={cn(
        'fixed inset-0 z-[200] flex flex-col items-center justify-center',
        'bg-white px-6 text-center',
        className,
      )}
      role="alert"
      aria-label="App update required"
    >
      <motion.div data-eos-id="src/components/update-required.tsx#1"
        className="flex flex-col items-center gap-4 max-w-sm"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 data-eos-id="src/components/update-required.tsx#2" className="font-heading text-3xl font-bold text-black tracking-tight">
          {APP_NAME}
        </h1>

        <svg data-eos-id="src/components/update-required.tsx#3"
          width="120"
          height="80"
          viewBox="0 0 120 80"
          fill="none"
          aria-hidden="true"
          className="my-4"
        >
          <ellipse data-eos-id="src/components/update-required.tsx#4" cx="60" cy="72" rx="50" ry="6" fill="var(--color-primary-100)" />
          <rect data-eos-id="src/components/update-required.tsx#5" x="56" y="40" width="8" height="32" rx="3" fill="var(--color-secondary-400)" />
          <circle data-eos-id="src/components/update-required.tsx#6" cx="60" cy="32" r="24" fill="var(--color-primary-300)" />
          <circle data-eos-id="src/components/update-required.tsx#7" cx="48" cy="38" r="16" fill="var(--color-primary-400)" />
          <circle data-eos-id="src/components/update-required.tsx#8" cx="72" cy="38" r="16" fill="var(--color-primary-400)" />
        </svg>

        <h2 data-eos-id="src/components/update-required.tsx#9" className="font-heading text-xl font-semibold text-neutral-900">
          Update required
        </h2>

        <p data-eos-id="src/components/update-required.tsx#10" className="text-sm text-neutral-500 leading-relaxed">
          {versionTagline}
        </p>

        {installedVersion && (
          <p data-eos-id="src/components/update-required.tsx#11" className="text-xs text-neutral-400">
            You have v{installedVersion}
            {latestVersion ? `. Latest is v${latestVersion}.` : '.'}
          </p>
        )}

        <div data-eos-id="src/components/update-required.tsx#12" className="mt-4 flex flex-col gap-3 w-full">
          {(isIOS || !isNative) && (
            <a data-eos-href="dynamic" data-eos-href-label="Value" data-eos-href-scope="prop" data-eos-id="src/components/update-required.tsx#13"
              href={isNative ? APP_STORE_DEEP : APP_STORE_WEB}
              target={isNative ? undefined : '_blank'}
              rel="noopener noreferrer"
              onClick={(e) => {
                if (isNative) {
                  e.preventDefault()
                  openStore('ios')
                }
              }}
              className={cn(
                'inline-flex items-center justify-center min-h-12 w-full px-5 rounded-md',
                'bg-black text-white text-sm font-semibold',
                'active:scale-[0.98] transition-transform duration-150',
              )}
            >
              Update on App Store
            </a>
          )}
          {(isAndroid || !isNative) && (
            <a data-eos-href="dynamic" data-eos-href-label="Value" data-eos-href-scope="prop" data-eos-id="src/components/update-required.tsx#14"
              href={isNative ? PLAY_STORE_DEEP : PLAY_STORE_WEB}
              target={isNative ? undefined : '_blank'}
              rel="noopener noreferrer"
              onClick={(e) => {
                if (isNative) {
                  e.preventDefault()
                  openStore('android')
                }
              }}
              className={cn(
                'inline-flex items-center justify-center min-h-12 w-full px-5 rounded-md',
                'bg-primary-500 text-white text-sm font-semibold',
                'active:scale-[0.98] transition-transform duration-150',
              )}
            >
              Update on Google Play
            </a>
          )}
        </div>

        <p data-eos-id="src/components/update-required.tsx#15" className="mt-2 text-xs text-neutral-400">
          The app can't be used until the update is installed.
        </p>
      </motion.div>
    </div>
  )
}
