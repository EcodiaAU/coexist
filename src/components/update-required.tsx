import { motion, useReducedMotion } from 'framer-motion'
import { Capacitor } from '@capacitor/core'
import { APP_NAME } from '@/lib/constants'
import { cn } from '@/lib/cn'

interface UpdateRequiredProps {
  latestVersion?: string | null
  installedVersion?: string
  className?: string
}

const APP_STORE_URL = 'https://apps.apple.com/au/app/co-exist/id6450456311'
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=org.coexistaus.app'

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
    ? `Co-Exist ${latestVersion} fixes how event times are stored across timezones.`
    : 'A required update is ready that fixes how event times are stored across timezones.'

  return (
    <div
      className={cn(
        'fixed inset-0 z-[200] flex flex-col items-center justify-center',
        'bg-white px-6 text-center',
        className,
      )}
      role="alert"
      aria-label="App update required"
    >
      <motion.div
        className="flex flex-col items-center gap-4 max-w-sm"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="font-heading text-3xl font-bold text-black tracking-tight">
          {APP_NAME}
        </h1>

        <svg
          width="120"
          height="80"
          viewBox="0 0 120 80"
          fill="none"
          aria-hidden="true"
          className="my-4"
        >
          <ellipse cx="60" cy="72" rx="50" ry="6" fill="var(--color-primary-100)" />
          <rect x="56" y="40" width="8" height="32" rx="3" fill="var(--color-secondary-400)" />
          <circle cx="60" cy="32" r="24" fill="var(--color-primary-300)" />
          <circle cx="48" cy="38" r="16" fill="var(--color-primary-400)" />
          <circle cx="72" cy="38" r="16" fill="var(--color-primary-400)" />
        </svg>

        <h2 className="font-heading text-xl font-semibold text-neutral-900">
          Update required
        </h2>

        <p className="text-sm text-neutral-500 leading-relaxed">
          {versionTagline}
        </p>

        {installedVersion && (
          <p className="text-xs text-neutral-400">
            You have v{installedVersion}
            {latestVersion ? `. Latest is v${latestVersion}.` : '.'}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-3 w-full">
          {(isIOS || !isNative) && (
            <a
              href={APP_STORE_URL}
              target={isNative ? undefined : '_blank'}
              rel="noopener noreferrer"
              className={cn(
                'inline-flex items-center justify-center min-h-12 w-full px-5 rounded-2xl',
                'bg-black text-white text-sm font-semibold',
                'active:scale-[0.98] transition-transform duration-150',
              )}
            >
              Update on App Store
            </a>
          )}
          {(isAndroid || !isNative) && (
            <a
              href={PLAY_STORE_URL}
              target={isNative ? undefined : '_blank'}
              rel="noopener noreferrer"
              className={cn(
                'inline-flex items-center justify-center min-h-12 w-full px-5 rounded-2xl',
                'bg-primary-500 text-white text-sm font-semibold',
                'active:scale-[0.98] transition-transform duration-150',
              )}
            >
              Update on Google Play
            </a>
          )}
        </div>

        <p className="mt-2 text-xs text-neutral-400">
          The app can't be used until the update is installed.
        </p>
      </motion.div>
    </div>
  )
}
