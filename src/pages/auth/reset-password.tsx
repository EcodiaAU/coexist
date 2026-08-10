import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Lock, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import { OGMeta } from '@/components/og-meta'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Header } from '@/components/header'

/**
 * Password reset form - the user lands here after clicking the reset link in
 * their email. The link carries a `type=recovery` hash that Supabase's
 * detectSessionInUrl turns into a PASSWORD_RECOVERY session.
 *
 * We do NOT assume that session exists: an expired/used link, or one opened in
 * a different browser, establishes no recovery session, and this page used to
 * render the form anyway and then fail on submit with a raw Supabase error and
 * no way out (A9). We also gate submit on a genuine recovery origin so a normal
 * logged-in session can't quietly change its password here (A10).
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const { updatePassword } = useAuth()
  const shouldReduceMotion = useReducedMotion()

  // Capture the URL hash synchronously on first render, before Supabase's
  // detectSessionInUrl strips it.
  const [initialHash] = useState(() =>
    typeof window !== 'undefined' ? window.location.hash : '',
  )
  const hashParams = new URLSearchParams(initialHash.replace(/^#/, ''))
  const hashError = hashParams.get('error') || hashParams.get('error_code')
  const isRecoveryHash = hashParams.get('type') === 'recovery'

  // 'checking' | 'ready' (recovery session confirmed) | 'invalid' (no/expired link)
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>(
    hashError ? 'invalid' : 'checking',
  )

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'invalid') return
    let settled = false
    const markReady = () => {
      if (!settled) { settled = true; setStatus('ready') }
    }

    // A recovery link in the URL is a valid recovery origin.
    if (isRecoveryHash) markReady()

    // Supabase fires PASSWORD_RECOVERY once it processes the recovery link.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') markReady()
    })

    // No recovery origin within a short grace period => treat as invalid.
    // (A normal logged-in session with no recovery hash lands here too - we
    // deliberately do NOT let it set a new password, A10.)
    const timer = setTimeout(() => {
      if (!settled) { settled = true; setStatus('invalid') }
    }, 3000)

    return () => { subscription.unsubscribe(); clearTimeout(timer) }
  }, [status, isRecoveryHash])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (status !== 'ready') return
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }

    setIsSubmitting(true)
    setError(null)

    const { error: authError } = await updatePassword(password)

    if (authError) {
      setError(authError.message)
      setIsSubmitting(false)
    } else {
      setDone(true)
      setIsSubmitting(false)
      setTimeout(() => navigate('/', { replace: true }), 2000)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-white">
      <OGMeta title="Set New Password" description="Set a new password for your Co-Exist account." noindex />
      <Header title="New Password" />

      <div className="flex-1 flex flex-col px-6 pt-8">
        <AnimatePresence mode="wait">
          {status === 'checking' ? (
            <motion.div
              key="checking"
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col items-center justify-center text-center"
            >
              <Loader2 className="w-8 h-8 text-neutral-400 animate-spin" />
              <p className="mt-4 text-neutral-500">Checking your reset link...</p>
            </motion.div>
          ) : status === 'invalid' ? (
            <motion.div
              key="invalid"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex-1 flex flex-col items-center justify-center text-center"
            >
              <div className="w-14 h-14 rounded-full bg-warning-50 flex items-center justify-center mb-6">
                <AlertTriangle className="w-7 h-7 text-warning-600" />
              </div>
              <h2 className="font-heading text-xl font-semibold text-neutral-900">
                This reset link has expired
              </h2>
              <p className="mt-2 text-neutral-500 leading-relaxed max-w-sm">
                Password reset links can only be used once and expire after a while. Request a fresh
                link and we'll email you a new one.
              </p>
              <Button
                variant="primary"
                size="lg"
                className="mt-8"
                onClick={() => navigate('/forgot-password')}
              >
                Request a new link
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="mt-2"
                onClick={() => navigate('/login')}
              >
                Back to login
              </Button>
            </motion.div>
          ) : done ? (
            <motion.div
              key="success"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex-1 flex flex-col items-center justify-center text-center"
            >
              <motion.div
                initial={shouldReduceMotion ? false : { scale: 0.5 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
              >
                <CheckCircle className="w-16 h-16 text-success mx-auto" />
              </motion.div>
              <h2 className="mt-6 font-heading text-xl font-semibold text-neutral-900">
                Password updated
              </h2>
              <p className="mt-2 text-neutral-500">Redirecting you now...</p>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              onSubmit={handleSubmit}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex-1 flex flex-col"
            >
              <div className="flex-1">
                <div className="w-14 h-14 rounded-full bg-neutral-50 flex items-center justify-center mb-6">
                  <Lock className="w-7 h-7 text-neutral-400" />
                </div>

                <h2 className="font-heading text-xl font-semibold text-neutral-900">
                  Set a new password
                </h2>
                <p className="mt-2 text-neutral-500 leading-relaxed">
                  Choose a strong password for your account.
                </p>

                <div className="mt-6 space-y-4">
                  <Input
                    type="password"
                    label="New password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <Input
                    type="password"
                    label="Confirm password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>

                {error && (
                  <motion.p
                    initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 text-sm text-error"
                    role="alert"
                  >
                    {error}
                  </motion.p>
                )}
              </div>

              <div
                className="py-6"
                style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
              >
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={isSubmitting}
                  disabled={!password || !confirm || password.length < 8}
                >
                  Update Password
                </Button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
