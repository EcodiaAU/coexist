import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Mail, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { OGMeta } from '@/components/og-meta'
import { Button } from '@/components/button'

export default function EmailVerificationPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const shouldReduceMotion = useReducedMotion()
  const email = (location.state as { email?: string })?.email ?? ''

  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [resendError, setResendError] = useState<string | null>(null)

  // If the project auto-confirms email, a session is already present (or
  // about to arrive). Bounce into the app instead of asking the user to
  // click a verification link that was never sent.
  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) navigate('/', { replace: true })
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted && session) navigate('/', { replace: true })
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [navigate])

  async function handleResend() {
    if (!email || resending) return
    setResending(true)
    setResendError(null)
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    setResending(false)
    if (error) {
      setResendError(error.message)
    } else {
      setResent(true)
      setTimeout(() => setResent(false), 5000)
    }
  }

  return (
    <div data-eos-id="src/pages/auth/email-verification.tsx#0" data-eos-v="2" className="min-h-dvh flex flex-col items-center justify-center px-6 bg-white">
      <OGMeta data-eos-id="src/pages/auth/email-verification.tsx#1"
        title="Verify Your Email"
        description="Check your inbox to verify your Co-Exist account email address and start volunteering for conservation."
        noindex
      />
      {/* Envelope icon */}
      <motion.div data-eos-id="src/pages/auth/email-verification.tsx#2"
        initial={shouldReduceMotion ? false : { scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="mb-8"
      >
        <div data-eos-id="src/pages/auth/email-verification.tsx#3" className="w-24 h-24 rounded-full bg-neutral-50 flex items-center justify-center">
          <Mail data-eos-id="src/pages/auth/email-verification.tsx#4" className="w-12 h-12 text-neutral-400" />
        </div>
      </motion.div>

      <motion.div data-eos-id="src/pages/auth/email-verification.tsx#5"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="text-center max-w-sm"
      >
        <h1 data-eos-id="src/pages/auth/email-verification.tsx#6" className="font-heading text-2xl font-bold text-neutral-900">
          Check your inbox
        </h1>
        <p data-eos-id="src/pages/auth/email-verification.tsx#7" className="mt-3 text-neutral-500 leading-relaxed">
          We've sent a verification link to{' '}
          {email ? (
            <span data-eos-id="src/pages/auth/email-verification.tsx#8" className="font-medium text-neutral-900">{email}</span>
          ) : (
            'your email'
          )}
          . Tap the link to verify your account.
        </p>
      </motion.div>

      <motion.div data-eos-id="src/pages/auth/email-verification.tsx#9"
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8 space-y-3 w-full max-w-sm"
      >
        <Button data-eos-id="src/pages/auth/email-verification.tsx#10"
          variant="secondary"
          size="lg"
          fullWidth
          icon={<RefreshCw data-eos-id="src/pages/auth/email-verification.tsx#11" size={18} className={resending ? 'animate-spin' : ''} />}
          loading={resending}
          onClick={handleResend}
          disabled={resent}
        >
          {resent ? 'Email sent!' : 'Resend verification email'}
        </Button>

        <Button data-eos-id="src/pages/auth/email-verification.tsx#12"
          variant="ghost"
          size="lg"
          fullWidth
          onClick={() => navigate('/login')}
        >
          Back to login
        </Button>
      </motion.div>

      {resendError && (
        <p data-eos-id="src/pages/auth/email-verification.tsx#13" className="mt-4 text-sm text-error text-center" role="alert">
          {resendError}
        </p>
      )}

      <p data-eos-id="src/pages/auth/email-verification.tsx#14" className="mt-8 text-xs text-neutral-400 text-center max-w-xs">
        Didn't receive the email? Check your spam folder or try a different email address.
      </p>
    </div>
  )
}
