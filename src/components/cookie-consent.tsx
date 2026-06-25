import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Cookie, X } from 'lucide-react'
import { Button } from '@/components/button'
import { Toggle } from '@/components/toggle'
import { usePlatform } from '@/hooks/use-platform'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ */
/*  Cookie categories                                                  */
/* ------------------------------------------------------------------ */

interface CookieConsent {
  essential: true // always on
  analytics: boolean
  marketing: boolean
}

const STORAGE_KEY = 'coexist-cookie-consent'
const CONSENT_VERSION = '1.0'

function loadConsent(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed.version !== CONSENT_VERSION) return null
    return parsed.consent as CookieConsent
  } catch {
    return null
  }
}

function saveConsent(consent: CookieConsent) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: CONSENT_VERSION, consent, timestamp: Date.now() }),
  )
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CookieConsentBanner({ className }: { className?: string }) {
  const { isWeb } = usePlatform()
  const shouldReduceMotion = useReducedMotion()
  const existingConsent = isWeb ? loadConsent() : null
  const [visible, setVisible] = useState(() => isWeb && !existingConsent)
  const [showDetails, setShowDetails] = useState(false)
  const [consent, setConsent] = useState<CookieConsent>(
    () => existingConsent ?? { essential: true, analytics: true, marketing: false },
  )

  // Listen for re-open event from settings
  useEffect(() => {
    const handler = () => setVisible(true)
    window.addEventListener('coexist:open-cookie-consent', handler)
    return () => window.removeEventListener('coexist:open-cookie-consent', handler)
  }, [])

  const handleAcceptAll = useCallback(() => {
    const all: CookieConsent = { essential: true, analytics: true, marketing: true }
    setConsent(all)
    saveConsent(all)
    setVisible(false)
    // Re-init analytics now that consent is given
    window.dispatchEvent(new CustomEvent('coexist:consent-changed'))
  }, [])

  const handleRejectNonEssential = useCallback(() => {
    const minimal: CookieConsent = { essential: true, analytics: false, marketing: false }
    setConsent(minimal)
    saveConsent(minimal)
    setVisible(false)
  }, [])

  const handleSavePreferences = useCallback(() => {
    saveConsent(consent)
    setVisible(false)
    window.dispatchEvent(new CustomEvent('coexist:consent-changed'))
  }, [consent])

  if (!isWeb) return null

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={shouldReduceMotion ? { opacity: 1 } : { y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28, mass: 0.8 }}
          className={cn(
            'fixed bottom-0 inset-x-0 z-[60]',
            'mx-auto max-w-lg',
            'p-4',
            className,
          )}
        >
          <div className="rounded-md bg-white shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-start gap-3 p-4 pb-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-sm bg-white text-neutral-400 shrink-0">
                <Cookie size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-heading text-sm font-semibold text-neutral-900">
                  We use cookies
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">
                  We use cookies to improve your experience and analyse how the site is used.
                </p>
              </div>
              <button
                onClick={handleRejectNonEssential}
                className="flex items-center justify-center w-11 h-11 rounded-full text-neutral-500 hover:bg-neutral-100 active:scale-[0.98] transition-[colors,transform] duration-150 shrink-0"
                aria-label="Reject non-essential cookies"
              >
                <X size={16} />
              </button>
            </div>

            {/* Details toggle */}
            <AnimatePresence>
              {showDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden px-4"
                >
                  <div className="space-y-2 py-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-neutral-900">Essential</p>
                        <p className="text-[11px] text-neutral-500">Required for the site to work</p>
                      </div>
                      <Toggle checked disabled onChange={() => {}} size="sm" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-neutral-900">Analytics</p>
                        <p className="text-[11px] text-neutral-500">Help us improve the experience</p>
                      </div>
                      <Toggle
                        checked={consent.analytics}
                        onChange={(v) => setConsent((p) => ({ ...p, analytics: v }))}
                        size="sm"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-neutral-900">Marketing</p>
                        <p className="text-[11px] text-neutral-500">Personalised content and campaigns</p>
                      </div>
                      <Toggle
                        checked={consent.marketing}
                        onChange={(v) => setConsent((p) => ({ ...p, marketing: v }))}
                        size="sm"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Actions */}
            <div className="flex gap-2 p-4 pt-2">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs font-medium text-neutral-500 hover:text-neutral-700 active:scale-[0.97] transition-[colors,transform] duration-150 px-3 min-h-11 flex items-center justify-center cursor-pointer"
              >
                {showDetails ? 'Hide details' : 'Customise'}
              </button>
              <div className="flex-1" />
              {showDetails ? (
                <Button size="sm" onClick={handleSavePreferences}>
                  Save Preferences
                </Button>
              ) : (
                <Button size="sm" onClick={handleAcceptAll}>
                  Accept All
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
