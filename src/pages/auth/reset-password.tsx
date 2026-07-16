import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Lock, CheckCircle } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { OGMeta } from '@/components/og-meta'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Header } from '@/components/header'

/**
 * Password reset form - the user lands here after clicking the
 * reset link in their email. Supabase has already established a
 * PASSWORD_RECOVERY session via the hash fragment by the time this
 * page renders (handled by auth-callback or onAuthStateChange).
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const { updatePassword } = useAuth()
  const shouldReduceMotion = useReducedMotion()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
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
          {done ? (
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
