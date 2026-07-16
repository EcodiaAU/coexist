import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Mail } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { OGMeta } from '@/components/og-meta'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { cn } from '@/lib/cn'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isLoading, signIn, signInWithGoogle, signInWithApple, signInWithMagicLink } = useAuth()
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [magicLinkSent, setMagicLinkSent] = useState(false)

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/'
  useEffect(() => {
    if (user && !isLoading) {
      navigate(from, { replace: true })
    }
  }, [user, isLoading, navigate, from])

  const canSubmit = email.trim() && password.length > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setIsSubmitting(true)
    setError(null)

    const { error: authError } = await signIn(email, password)

    if (authError) {
      setError(authError.message)
    }
    setIsSubmitting(false)
  }

  async function handleSocial(provider: 'google' | 'apple') {
    setError(null)
    const fn = provider === 'google' ? signInWithGoogle : signInWithApple
    const { error: authError } = await fn()
    if (authError) setError(authError.message)
  }

  async function handleMagicLink() {
    if (!email.trim()) {
      setError('Enter your email first')
      return
    }
    setError(null)
    const { error: authError } = await signInWithMagicLink(email)
    if (authError) {
      setError(authError.message)
    } else {
      setMagicLinkSent(true)
    }
  }

  return (
    <div data-eos-id="src/pages/auth/login.tsx#0" data-eos-v="2"
      className="min-h-dvh flex flex-col bg-surface-warm"
      style={{ paddingTop: 'var(--safe-top)' }}
    >
      <OGMeta data-eos-id="src/pages/auth/login.tsx#1"
        title="Log In"
        description="Sign in to your Co-Exist account. Access conservation events, connect with your collective, and track your environmental impact across Australia."
        canonicalPath="/login"
        noindex
      />

      {/* Content */}
      <div data-eos-id="src/pages/auth/login.tsx#2" className="flex-1 flex flex-col w-full max-w-[440px] mx-auto">
        <motion.form data-eos-id="src/pages/auth/login.tsx#3"
          onSubmit={handleSubmit}
          className="flex-1 flex flex-col"
          onFocus={(e) => {
            const target = e.target as HTMLElement
            if (target.tagName === 'INPUT') {
              setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)
            }
          }}
        >
          {/* Heading */}
          <div data-eos-id="src/pages/auth/login.tsx#4" className="px-4 sm:px-6 pt-10 pb-2 text-center">
            <motion.h1 data-eos-id="src/pages/auth/login.tsx#5"
              initial={rm ? {} : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="text-[32px] font-bold tracking-tight leading-tight text-neutral-900"
            >
              Welcome back
            </motion.h1>
            <motion.p data-eos-id="src/pages/auth/login.tsx#6"
              initial={rm ? {} : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25 }}
              className="mt-2 text-[15px] text-neutral-500"
            >
              Sign in to continue
            </motion.p>
          </div>

          {/* Form body */}
          <motion.div data-eos-id="src/pages/auth/login.tsx#7"
            initial={rm ? {} : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="flex-1 px-6 pt-8"
          >
            {/* Social sign-in */}
            <div data-eos-id="src/pages/auth/login.tsx#8" className="flex gap-3">
              <button data-eos-id="src/pages/auth/login.tsx#9"
                type="button"
                onClick={() => handleSocial('google')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2.5',
                  'h-[52px] rounded-md',
                  'bg-white border-2 border-neutral-200 text-neutral-900',
                  'text-sm font-semibold',
                  'active:scale-[0.97] transition-all duration-200',
                  'cursor-pointer hover:border-neutral-400 hover:bg-neutral-50',
                )}
              >
                <svg data-eos-id="src/pages/auth/login.tsx#10" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path data-eos-id="src/pages/auth/login.tsx#11" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path data-eos-id="src/pages/auth/login.tsx#12" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path data-eos-id="src/pages/auth/login.tsx#13" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path data-eos-id="src/pages/auth/login.tsx#14" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Google
              </button>

              <button data-eos-id="src/pages/auth/login.tsx#15"
                type="button"
                onClick={() => handleSocial('apple')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2.5',
                  'h-[52px] rounded-md',
                  'bg-white border-2 border-neutral-200 text-neutral-900',
                  'text-sm font-semibold',
                  'active:scale-[0.97] transition-all duration-200',
                  'cursor-pointer hover:border-neutral-400 hover:bg-neutral-50',
                )}
              >
                <svg data-eos-id="src/pages/auth/login.tsx#16" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path data-eos-id="src/pages/auth/login.tsx#17" d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.32 2.32-1.55 4.3-3.74 4.25z" />
                </svg>
                Apple
              </button>
            </div>

            {/* Divider */}
            <div data-eos-id="src/pages/auth/login.tsx#18" className="flex items-center gap-4 my-7">
              <div data-eos-id="src/pages/auth/login.tsx#19" className="flex-1 h-px bg-neutral-300" />
              <span data-eos-id="src/pages/auth/login.tsx#20" className="text-[11px] text-neutral-400 font-semibold uppercase tracking-[0.15em]">or</span>
              <div data-eos-id="src/pages/auth/login.tsx#21" className="flex-1 h-px bg-neutral-300" />
            </div>

            {/* Form fields */}
            <div data-eos-id="src/pages/auth/login.tsx#22" className="space-y-3">
              <Input data-eos-id="src/pages/auth/login.tsx#23"
                type="email"
                label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                inputClassName="bg-white border-2 border-neutral-200 text-neutral-900 focus:border-primary-500 rounded-sm"
              />

              <Input data-eos-id="src/pages/auth/login.tsx#24"
                type="password"
                label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                inputClassName="bg-white border-2 border-neutral-200 text-neutral-900 focus:border-primary-500 rounded-sm"
              />

              <div data-eos-id="src/pages/auth/login.tsx#25" className="flex items-center justify-center gap-6 pt-1">
                <button data-eos-id="src/pages/auth/login.tsx#26"
                  type="button"
                  onClick={handleMagicLink}
                  className="flex items-center gap-1.5 text-xs text-neutral-500 font-semibold hover:text-neutral-700 active:scale-[0.97] transition-[colors,transform] duration-150 cursor-pointer"
                >
                  <Mail data-eos-id="src/pages/auth/login.tsx#27" size={13} />
                  {magicLinkSent ? 'Link sent!' : 'Magic link'}
                </button>
                <Link data-eos-id="src/pages/auth/login.tsx#28"
                  to="/forgot-password"
                  className="text-xs text-neutral-500 font-semibold hover:text-neutral-700 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            {/* Error */}
            {error && (
              <motion.div data-eos-id="src/pages/auth/login.tsx#29"
                initial={rm ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 px-4 py-3 bg-error-50 border border-error-100 rounded-sm text-sm text-error-600 text-center font-medium"
                role="alert"
              >
                {error}
              </motion.div>
            )}
          </motion.div>

          {/* Bottom CTA */}
          <motion.div data-eos-id="src/pages/auth/login.tsx#30"
            initial={rm ? {} : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.45 }}
            className="px-4 sm:px-6 pt-6 pb-6"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
          >
            <Button data-eos-id="src/pages/auth/login.tsx#31"
              type="submit"
              variant="auth"
              size="lg"
              fullWidth
              loading={isSubmitting}
              disabled={!canSubmit}
            >
              Log In
            </Button>

            <p data-eos-id="src/pages/auth/login.tsx#32" className="mt-6 text-center text-sm text-neutral-500">
              New to Co-Exist?{' '}
              <Link data-eos-id="src/pages/auth/login.tsx#33" to="/signup" className="text-neutral-900 font-bold hover:underline transition-colors">
                Create account
              </Link>
            </p>
          </motion.div>
        </motion.form>
      </div>
    </div>
  )
}
