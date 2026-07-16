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
    <AnimatePresence data-eos-id="src/components/cookie-consent.tsx#0" data-eos-v="2">
      {visible && (
        <motion.div data-eos-id="src/components/cookie-consent.tsx#1"
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
          <div data-eos-id="src/components/cookie-consent.tsx#2" className="rounded-md bg-white shadow-sm overflow-hidden">
            {/* Header */}
            <div data-eos-id="src/components/cookie-consent.tsx#3" className="flex items-start gap-3 p-4 pb-2">
              <div data-eos-id="src/components/cookie-consent.tsx#4" className="flex items-center justify-center w-8 h-8 rounded-sm bg-white text-neutral-400 shrink-0">
                <Cookie data-eos-id="src/components/cookie-consent.tsx#5" size={18} />
              </div>
              <div data-eos-id="src/components/cookie-consent.tsx#6" className="flex-1 min-w-0">
                <h3 data-eos-id="src/components/cookie-consent.tsx#7" className="font-heading text-sm font-semibold text-neutral-900">
                  We use cookies
                </h3>
                <p data-eos-id="src/components/cookie-consent.tsx#8" className="text-xs text-neutral-500 mt-0.5 leading-relaxed">
                  We use cookies to improve your experience and analyse how the site is used.
                </p>
              </div>
              <button data-eos-id="src/components/cookie-consent.tsx#9"
                onClick={handleRejectNonEssential}
                className="flex items-center justify-center w-11 h-11 rounded-full text-neutral-500 hover:bg-neutral-100 active:scale-[0.98] transition-[colors,transform] duration-150 shrink-0"
                aria-label="Reject non-essential cookies"
              >
                <X data-eos-id="src/components/cookie-consent.tsx#10" size={16} />
              </button>
            </div>

            {/* Details toggle */}
            <AnimatePresence data-eos-id="src/components/cookie-consent.tsx#11">
              {showDetails && (
                <motion.div data-eos-id="src/components/cookie-consent.tsx#12"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden px-4"
                >
                  <div data-eos-id="src/components/cookie-consent.tsx#13" className="space-y-2 py-2">
                    <div data-eos-id="src/components/cookie-consent.tsx#14" className="flex items-center justify-between">
                      <div data-eos-id="src/components/cookie-consent.tsx#15">
                        <p data-eos-id="src/components/cookie-consent.tsx#16" className="text-xs font-medium text-neutral-900">Essential</p>
                        <p data-eos-id="src/components/cookie-consent.tsx#17" className="text-[11px] text-neutral-500">Required for the site to work</p>
                      </div>
                      <Toggle data-eos-id="src/components/cookie-consent.tsx#18" checked disabled onChange={() => {}} size="sm" />
                    </div>
                    <div data-eos-id="src/components/cookie-consent.tsx#19" className="flex items-center justify-between">
                      <div data-eos-id="src/components/cookie-consent.tsx#20">
                        <p data-eos-id="src/components/cookie-consent.tsx#21" className="text-xs font-medium text-neutral-900">Analytics</p>
                        <p data-eos-id="src/components/cookie-consent.tsx#22" className="text-[11px] text-neutral-500">Help us improve the experience</p>
                      </div>
                      <Toggle data-eos-id="src/components/cookie-consent.tsx#23"
                        checked={consent.analytics}
                        onChange={(v) => setConsent((p) => ({ ...p, analytics: v }))}
                        size="sm"
                      />
                    </div>
                    <div data-eos-id="src/components/cookie-consent.tsx#24" className="flex items-center justify-between">
                      <div data-eos-id="src/components/cookie-consent.tsx#25">
                        <p data-eos-id="src/components/cookie-consent.tsx#26" className="text-xs font-medium text-neutral-900">Marketing</p>
                        <p data-eos-id="src/components/cookie-consent.tsx#27" className="text-[11px] text-neutral-500">Personalised content and campaigns</p>
                      </div>
                      <Toggle data-eos-id="src/components/cookie-consent.tsx#28"
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
            <div data-eos-id="src/components/cookie-consent.tsx#29" className="flex gap-2 p-4 pt-2">
              <button data-eos-id="src/components/cookie-consent.tsx#30"
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs font-medium text-neutral-500 hover:text-neutral-700 active:scale-[0.97] transition-[colors,transform] duration-150 px-3 min-h-11 flex items-center justify-center cursor-pointer"
              >
                {showDetails ? 'Hide details' : 'Customise'}
              </button>
              <div data-eos-id="src/components/cookie-consent.tsx#31" className="flex-1" />
              {showDetails ? (
                <Button data-eos-id="src/components/cookie-consent.tsx#32" size="sm" onClick={handleSavePreferences}>
                  Save Preferences
                </Button>
              ) : (
                <Button data-eos-id="src/components/cookie-consent.tsx#33" size="sm" onClick={handleAcceptAll}>
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
