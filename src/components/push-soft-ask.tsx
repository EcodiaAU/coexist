import { useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { BellRing, X } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { Button } from '@/components/button'
import { usePush } from '@/hooks/use-push'
import { useAuth } from '@/hooks/use-auth'

const DISMISS_KEY = 'pushSoftAskDismissed'

/**
 * One-time soft-ask card for push notifications (A6). The push registration
 * hook no longer cold-fires the OS permission dialog on first authed entry;
 * this card asks WITH context, and only the explicit "Enable" tap triggers the
 * real OS prompt. Native only, shown once per install:
 *   - only when the OS state is still 'prompt' (never asked)
 *   - hidden after the user taps Enable or Not now (persisted)
 */
export function PushSoftAsk() {
  const { user } = useAuth()
  const { checkPermissions, requestPermission } = usePush()
  const shouldReduceMotion = useReducedMotion()
  const [visible, setVisible] = useState(false)
  const [requesting, setRequesting] = useState(false)

  useEffect(() => {
    if (!user || !Capacitor.isNativePlatform()) return
    let cancelled = false

    async function maybeShow() {
      try {
        const dismissed = await Preferences.get({ key: DISMISS_KEY })
        if (dismissed?.value === '1') return
        const state = await checkPermissions()
        // Only ask when the user has never been prompted. 'granted' registers
        // silently elsewhere; 'denied' is handled by the settings banner.
        if (!cancelled && (state === 'prompt' || state === 'prompt-with-rationale')) {
          // Small delay so the card doesn't fight the first paint of Home.
          setTimeout(() => { if (!cancelled) setVisible(true) }, 1200)
        }
      } catch { /* best-effort */ }
    }
    void maybeShow()
    return () => { cancelled = true }
  }, [user, checkPermissions])

  const dismiss = async () => {
    setVisible(false)
    try { await Preferences.set({ key: DISMISS_KEY, value: '1' }) } catch { /* best-effort */ }
  }

  const handleEnable = async () => {
    setRequesting(true)
    await requestPermission()
    setRequesting(false)
    await dismiss()
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28, mass: 0.8 }}
          className="fixed bottom-0 inset-x-0 z-[60] mx-auto max-w-lg p-4"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <div className="rounded-md bg-white shadow-lg border border-neutral-100 overflow-hidden">
            <div className="flex items-start gap-3 p-4">
              <div className="flex items-center justify-center w-9 h-9 rounded-sm bg-primary-100 text-primary-600 shrink-0">
                <BellRing size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-heading text-sm font-semibold text-neutral-900">
                  Get notified about events near you
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">
                  Event reminders, chat replies and announcements from your collective. You can fine-tune these anytime in Settings.
                </p>
              </div>
              <button
                type="button"
                onClick={dismiss}
                className="flex items-center justify-center w-9 h-9 rounded-full text-neutral-400 hover:bg-neutral-100 shrink-0"
                aria-label="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex gap-2 px-4 pb-4">
              <Button variant="ghost" size="sm" onClick={dismiss} disabled={requesting}>
                Not now
              </Button>
              <div className="flex-1" />
              <Button variant="primary" size="sm" loading={requesting} onClick={handleEnable}>
                Enable notifications
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
