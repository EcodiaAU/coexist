import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { motion, useReducedMotion } from 'framer-motion'
import { CheckCircle, AlertCircle, Loader2, Smartphone } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { OGMeta } from '@/components/og-meta'
import { Button } from '@/components/button'
import { useAuth } from '@/hooks/use-auth'

type CallbackState = 'processing' | 'success' | 'error'

/**
 * Handles auth callback redirects from Supabase email links
 * (email verification, magic links, password recovery).
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const { isLoading: authLoading, authError } = useAuth()
  const [state, setState] = useState<CallbackState>('processing')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
        setState('success')

        if (event === 'PASSWORD_RECOVERY') {
          setTimeout(() => navigate('/reset-password', { replace: true }), 1500)
        }
      }
    })

    const timeout = setTimeout(() => {
      setState((prev) => {
        if (prev === 'processing') {
          setErrorMsg('Verification timed out. The link may have expired.')
          return 'error'
        }
        return prev
      })
    }, 30_000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [navigate])

  useEffect(() => {
    if (state !== 'success') return
    if (authLoading) return

    if (authError) {
      setErrorMsg(authError)
      setState('error')
      return
    }

    if (!isMobileBrowser()) {
      navigate('/', { replace: true })
    }
  }, [state, authLoading, authError, navigate])

  return (
    <div data-eos-id="src/pages/auth/auth-callback.tsx#0" data-eos-v="2" className="min-h-dvh flex flex-col items-center justify-center px-6 bg-white">
      <OGMeta data-eos-id="src/pages/auth/auth-callback.tsx#1" title="Verifying..." description="Verifying your Co-Exist account." noindex />

      {state === 'processing' && (
        <motion.div data-eos-id="src/pages/auth/auth-callback.tsx#2"
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center text-center"
        >
          <Loader2 data-eos-id="src/pages/auth/auth-callback.tsx#3" className="w-12 h-12 text-neutral-400 animate-spin" />
          <p data-eos-id="src/pages/auth/auth-callback.tsx#4" className="mt-4 text-neutral-500 font-medium">Verifying your account...</p>
        </motion.div>
      )}

      {state === 'success' && (
        <motion.div data-eos-id="src/pages/auth/auth-callback.tsx#5"
          initial={shouldReduceMotion ? false : { scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="flex flex-col items-center text-center max-w-sm"
        >
          <div data-eos-id="src/pages/auth/auth-callback.tsx#6" className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center">
            <CheckCircle data-eos-id="src/pages/auth/auth-callback.tsx#7" className="w-10 h-10 text-success" />
          </div>
          <h1 data-eos-id="src/pages/auth/auth-callback.tsx#8" className="mt-6 font-heading text-2xl font-bold text-neutral-900">
            You're verified!
          </h1>
          <p data-eos-id="src/pages/auth/auth-callback.tsx#9" className="mt-2 text-neutral-500">
            Your account has been confirmed.
          </p>

          {isMobileBrowser() ? (
            <div data-eos-id="src/pages/auth/auth-callback.tsx#10" className="mt-8 w-full space-y-3">
              <Button data-eos-id="src/pages/auth/auth-callback.tsx#11"
                variant="primary"
                size="lg"
                fullWidth
                icon={<Smartphone data-eos-id="src/pages/auth/auth-callback.tsx#12" size={18} />}
                onClick={() => {
                  window.location.href = 'coexist://home'
                }}
              >
                Open Co-Exist App
              </Button>
              <Button data-eos-id="src/pages/auth/auth-callback.tsx#13"
                variant="ghost"
                size="lg"
                fullWidth
                onClick={() => navigate('/', { replace: true })}
              >
                Continue on web
              </Button>
            </div>
          ) : (
            <p data-eos-id="src/pages/auth/auth-callback.tsx#14" className="mt-4 text-sm text-neutral-400">Redirecting...</p>
          )}
        </motion.div>
      )}

      {state === 'error' && (
        <motion.div data-eos-id="src/pages/auth/auth-callback.tsx#15"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center text-center max-w-sm"
        >
          <div data-eos-id="src/pages/auth/auth-callback.tsx#16" className="w-20 h-20 rounded-full bg-error/10 flex items-center justify-center">
            <AlertCircle data-eos-id="src/pages/auth/auth-callback.tsx#17" className="w-10 h-10 text-error" />
          </div>
          <h1 data-eos-id="src/pages/auth/auth-callback.tsx#18" className="mt-6 font-heading text-2xl font-bold text-neutral-900">
            Something went wrong
          </h1>
          <p data-eos-id="src/pages/auth/auth-callback.tsx#19" className="mt-2 text-neutral-500">{errorMsg}</p>
          <div data-eos-id="src/pages/auth/auth-callback.tsx#20" className="mt-8 w-full space-y-3">
            <Button data-eos-id="src/pages/auth/auth-callback.tsx#21"
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => navigate('/login', { replace: true })}
            >
              Go to login
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  )
}

/** Detect if the user is on a mobile browser (not inside the Capacitor app). */
function isMobileBrowser(): boolean {
  if (Capacitor.isNativePlatform()) return false
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}
