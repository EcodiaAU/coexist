import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Mail, CheckCircle } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { OGMeta } from '@/components/og-meta'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Header } from '@/components/header'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const { resetPassword } = useAuth()
  const shouldReduceMotion = useReducedMotion()

  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setIsSubmitting(true)
    setError(null)

    const { error: authError } = await resetPassword(email)

    if (authError) {
      setError(authError.message)
      setIsSubmitting(false)
    } else {
      setSent(true)
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-white">
      <OGMeta
        title="Reset Password"
        description="Reset your Co-Exist account password. Enter your email to receive a secure password reset link."
        canonicalPath="/forgot-password"
        noindex
      />
      <Header title="Reset Password" back />

      <div className="flex-1 flex flex-col px-6 pt-8">
        <AnimatePresence mode="wait">
          {sent ? (
            <motion.div
              key="success"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -16 }}
              transition={{ duration: 0.3 }}
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
                Check your inbox
              </h2>
              <p className="mt-2 text-neutral-500 max-w-xs">
                We've sent a password reset link to{' '}
                <span className="font-medium text-neutral-900">{email}</span>
              </p>
              <Button
                variant="ghost"
                className="mt-8"
                onClick={() => navigate('/login')}
              >
                Back to login
              </Button>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              onSubmit={handleSubmit}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -16 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col"
            >
              <div className="flex-1">
                <div className="w-14 h-14 rounded-full bg-neutral-50 flex items-center justify-center mb-6">
                  <Mail className="w-7 h-7 text-neutral-400" />
                </div>

                <h2 className="font-heading text-xl font-semibold text-neutral-900">
                  Forgot your password?
                </h2>
                <p className="mt-2 text-neutral-500 leading-relaxed">
                  Enter your email and we'll send you a link to reset it.
                </p>

                <div className="mt-6">
                  <Input
                    type="email"
                    label="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
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
                  disabled={!email.trim()}
                >
                  Send Reset Link
                </Button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
