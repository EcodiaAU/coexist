import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Mail, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { OGMeta } from '@/components/og-meta'
import { Button } from '@/components/button'
import { Input } from '@/components/input'

export default function EmailVerificationPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const shouldReduceMotion = useReducedMotion()

  // The email arrives via router state, but a hard refresh / deep-link drops
  // that state, leaving the old page with an enabled Resend button that did
  // nothing (A11). Keep it as editable state and recover the address from the
  // session where possible; if we still can't, let the user type it in.
  const stateEmail = (location.state as { email?: string })?.email ?? ''
  const [email, setEmail] = useState(stateEmail)

  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [resendError, setResendError] = useState<string | null>(null)

  // If the project auto-confirms email, a session is already present (or
  // about to arrive). Bounce into the app instead of asking the user to
  // click a verification link that was never sent. Also recover the address
  // from the user record when router state was lost.
  useEffect(() => {
    let mounted = true
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return
      if (!stateEmail && data.user?.email) setEmail(data.user.email)
    })
    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) navigate('/', { replace: true })
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted && session) navigate('/', { replace: true })
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [navigate, stateEmail])

  async function handleResend() {
    if (!email.trim() || resending) return
    setResending(true)
    setResendError(null)
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() })
    setResending(false)
    if (error) {
      setResendError(error.message)
    } else {
      setResent(true)
      setTimeout(() => setResent(false), 5000)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 bg-white">
      <OGMeta
        title="Verify Your Email"
        description="Check your inbox to verify your Co-Exist account email address and start volunteering for conservation."
        noindex
      />
      {/* Envelope icon */}
      <motion.div
        initial={shouldReduceMotion ? false : { scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="mb-8"
      >
        <div className="w-24 h-24 rounded-full bg-neutral-50 flex items-center justify-center">
          <Mail className="w-12 h-12 text-neutral-400" />
        </div>
      </motion.div>

      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="text-center max-w-sm"
      >
        <h1 className="font-heading text-2xl font-bold text-neutral-900">
          Check your inbox
        </h1>
        <p className="mt-3 text-neutral-500 leading-relaxed">
          We've sent a verification link to{' '}
          {email ? (
            <span className="font-medium text-neutral-900">{email}</span>
          ) : (
            'your email'
          )}
          . Tap the link to verify your account.
        </p>
      </motion.div>

      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8 space-y-3 w-full max-w-sm"
      >
        {!email && (
          <Input
            type="email"
            label="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@email.com"
          />
        )}
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          icon={<RefreshCw size={18} className={resending ? 'animate-spin' : ''} />}
          loading={resending}
          onClick={handleResend}
          disabled={resent || !email.trim()}
        >
          {resent ? 'Email sent!' : 'Resend verification email'}
        </Button>

        <Button
          variant="ghost"
          size="lg"
          fullWidth
          onClick={() => navigate('/login')}
        >
          Back to login
        </Button>
      </motion.div>

      {resendError && (
        <p className="mt-4 text-sm text-error text-center" role="alert">
          {resendError}
        </p>
      )}

      <p className="mt-8 text-xs text-neutral-400 text-center max-w-xs">
        Didn't receive the email? Check your spam folder or try a different email address.
      </p>
    </div>
  )
}
