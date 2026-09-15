import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { motion, useReducedMotion } from 'framer-motion'
import { CheckCircle, AlertCircle, Loader2, Smartphone } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { OGMeta } from '@/components/og-meta'
import { Button } from '@/components/button'
import { useAuth } from '@/hooks/use-auth'
import {
  readAuthLinkErrorFromWindow,
  safeNextPath,
  type AuthLinkError,
} from '@/lib/auth-link-error'

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
  const [searchParams] = useSearchParams()
  // Where a resent link was aimed. Set by signInWithMagicLink when the member
  // is recovering from a link that aged out, so they land back on the ticket
  // they were trying to open rather than the home feed.
  const nextPath = safeNextPath(searchParams.get('next'))
  const [linkError, setLinkError] = useState<AuthLinkError | null>(null)

  useEffect(() => {
    let active = true
    // Supabase reports a spent link in the fragment and establishes no session,
    // so no auth event will ever arrive. Reading it up front turns a 30 second
    // wait that ends in a guess ("may have expired") into an immediate, correct
    // answer with a way out.
    const failed = readAuthLinkErrorFromWindow()
    if (failed) {
      setLinkError(failed)
      setErrorMsg(failed.message)
      setState('error')
      return
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
        setState('success')

        if (event === 'PASSWORD_RECOVERY') {
          setTimeout(() => navigate('/reset-password', { replace: true }), 1500)
        }
      }
    })

    // Fallback: detectSessionInUrl can fire SIGNED_IN before this listener
    // subscribes (fast device / cached / re-mount), so no event reaches us and
    // the page sits at "processing" until the 30s timeout then falsely reports
    // an expired link. getSession() catches the already-established session.
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) {
        setState((prev) => (prev === 'processing' ? 'success' : prev))
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
      active = false
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
      navigate(nextPath ?? '/', { replace: true })
    }
  }, [state, authLoading, authError, navigate, nextPath])

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 bg-white">
      <OGMeta title="Verifying..." description="Verifying your Co-Exist account." noindex />

      {state === 'processing' && (
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center text-center"
        >
          <Loader2 className="w-12 h-12 text-neutral-400 animate-spin" />
          <p className="mt-4 text-neutral-500 font-medium">Verifying your account...</p>
        </motion.div>
      )}

      {state === 'success' && (
        <motion.div
          initial={shouldReduceMotion ? false : { scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="flex flex-col items-center text-center max-w-sm"
        >
          <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-success" />
          </div>
          <h1 className="mt-6 font-heading text-2xl font-bold text-neutral-900">
            You're verified!
          </h1>
          <p className="mt-2 text-neutral-500">
            Your account has been confirmed.
          </p>

          {isMobileBrowser() ? (
            <div className="mt-8 w-full space-y-3">
              <Button
                variant="primary"
                size="lg"
                fullWidth
                icon={<Smartphone size={18} />}
                onClick={() => {
                  window.location.href = 'coexist://home'
                }}
              >
                Open Co-Exist App
              </Button>
              <Button
                variant="ghost"
                size="lg"
                fullWidth
                onClick={() => navigate(nextPath ?? '/', { replace: true })}
              >
                Continue on web
              </Button>
            </div>
          ) : (
            <p className="mt-4 text-sm text-neutral-400">Redirecting...</p>
          )}
        </motion.div>
      )}

      {state === 'error' && (
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center text-center max-w-sm"
        >
          <div className="w-20 h-20 rounded-full bg-error/10 flex items-center justify-center">
            <AlertCircle className="w-10 h-10 text-error" />
          </div>
          <h1 className="mt-6 font-heading text-2xl font-bold text-neutral-900">
            {linkError?.isExpired ? 'That link has expired' : 'Something went wrong'}
          </h1>
          <p className="mt-2 text-neutral-500">{errorMsg}</p>
          {linkError?.isExpired && (
            <p className="mt-2 text-sm text-neutral-400">
              Nothing is wrong with your account or your booking. Sign in below and we can send
              you a fresh link.
            </p>
          )}
          <div className="mt-8 w-full space-y-3">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() =>
                // Hand the reason forward so login explains it rather than
                // showing a bare form, and keep the destination so the fresh
                // link returns them to where the dead one was pointing.
                navigate('/login', {
                  replace: true,
                  state: {
                    linkError,
                    ...(nextPath ? { from: { pathname: nextPath, search: '' } } : {}),
                  },
                })
              }
            >
              {linkError?.isExpired ? 'Get a fresh link' : 'Go to login'}
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
