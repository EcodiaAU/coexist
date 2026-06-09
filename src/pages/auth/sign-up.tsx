import { useState, useMemo, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { UserPlus } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { OGMeta } from '@/components/og-meta'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { DateInput } from '@/components/date-input'
import { Checkbox } from '@/components/checkbox'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { adminStagger as stagger, fadeOnly } from '@/lib/admin-motion'

/* ------------------------------------------------------------------ */
/*  Password strength                                                  */
/* ------------------------------------------------------------------ */

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++

  if (score <= 1) return { score, label: 'Weak', color: 'bg-error-500' }
  if (score <= 2) return { score, label: 'Fair', color: 'bg-warning-500' }
  if (score <= 3) return { score, label: 'Good', color: 'bg-warning-400' }
  return { score, label: 'Strong', color: 'bg-success-500' }
}

/* ------------------------------------------------------------------ */
/*  Age helpers                                                        */
/* ------------------------------------------------------------------ */

function calculateAge(dob: string): number {
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

export default function SignUpPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { signUp, signInWithGoogle, signInWithApple } = useAuth()
  const shouldReduceMotion = useReducedMotion()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Referral code from URL
  const refCode = searchParams.get('ref')?.trim().toUpperCase() || null
  // Validate referral code on mount
  const [refValid, setRefValid] = useState(false)

  useEffect(() => {
    if (!refCode) return
    supabase
      .from('referral_codes')
      .select('code')
      .eq('code', refCode)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setRefValid(true)
      })
  }, [refCode])

  const passwordStrength = useMemo(() => getPasswordStrength(password), [password])
  const isPasswordValid = password.length >= 8 && passwordStrength.score >= 2
  const age = dateOfBirth ? calculateAge(dateOfBirth) : null
  const isAgeValid = age !== null && age >= 18
  const maxDob = new Date().toISOString().split('T')[0]

  const canSubmit =
    displayName.trim() &&
    email.trim() &&
    isPasswordValid &&
    isAgeValid &&
    agreedToTerms

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setIsSubmitting(true)
    setError(null)

    const { error: authError, hasSession } = await signUp(email, password, displayName, dateOfBirth)

    setIsSubmitting(false)
    if (authError) {
      setError(authError.message)
    } else {
      // Store referral code so it can be accepted after email verification
      // (or immediately, when autoconfirm is on).
      if (refCode) {
        try { localStorage.setItem('coexist_referral_code', refCode) } catch { /* storage may be unavailable */ }
      }
      // When the project auto-confirms email, signUp returns a session right
      // away. Drop straight into the app instead of showing a "check your
      // inbox" screen for a verification email that will never arrive.
      if (hasSession) {
        navigate('/', { replace: true })
      } else {
        navigate('/verify-email', { state: { email } })
      }
    }
  }

  async function handleSocial(provider: 'google' | 'apple') {
    setError(null)
    const fn = provider === 'google' ? signInWithGoogle : signInWithApple
    const { error: authError } = await fn()
    if (authError) setError(authError.message)
  }

  // fadeOnly (opacity, NO transform) - a translateY transform on an input's
  // ancestor leaves `transform: translateY(0px)` at rest, which breaks the
  // Android WebView soft keyboard (won't pop up) and the IME. Login's fields
  // sit in a plain div and type fine; this matches that. Tate 2026-06-09.
  const childVariants = shouldReduceMotion ? undefined : fadeOnly

  return (
    <div
      className="flex flex-col bg-white overflow-hidden"
      style={{
        paddingTop: 'var(--safe-top)',
        // Lock the page to the visualViewport so the inner form area can
        // scroll inside the keyboard-reduced viewport. Without this the page
        // is min-h-dvh tall and the form area below the keyboard is
        // unreachable without dismissing the keyboard first (2026-05-16 Jade
        // feedback on Android signup).
        height: 'calc(100dvh - var(--kb-height, 0px))',
      }}
    >
      <OGMeta
        title="Sign Up"
        description="Create your free Co-Exist account. Join thousands of young Australians volunteering for conservation - tree planting, beach cleanups, habitat restoration, and more."
        canonicalPath="/signup"
        noindex
      />

      {/* Centered container. min-h-0 lets the inner scroll body actually
          shrink + scroll instead of growing the form past the height-locked
          root (which, with overflow-hidden, clipped the Create Account / Log in
          CTA off-screen when an error appeared - 2026-05-28 Android/iOS report). */}
      <div className="flex-1 min-h-0 flex flex-col w-full max-w-[440px] mx-auto">
        <motion.form
          onSubmit={handleSubmit}
          variants={shouldReduceMotion ? undefined : stagger}
          initial="hidden"
          animate="visible"
          className="flex-1 min-h-0 flex flex-col"
        >
          {/* Referral banner */}
          {refValid && (
            <motion.div
              variants={childVariants}
              className="mx-5 mt-3 flex items-center justify-center gap-2.5 rounded-xl bg-white border border-neutral-100 px-4 py-2.5"
            >
              <UserPlus size={16} className="text-neutral-500 shrink-0" />
              <p className="text-sm text-neutral-900">
                You've been invited to join the movement!
              </p>
            </motion.div>
          )}

          {/* Hero */}
          <motion.div variants={childVariants} className="px-4 sm:px-6 pt-6 pb-1 text-center">
            <h1 className="text-[28px] font-bold text-neutral-900 tracking-tight leading-tight">
              Join the movement
            </h1>
            <p className="mt-1 text-[15px] text-neutral-500">
              Create your account to get started
            </p>
          </motion.div>

          {/* Scrollable form body */}
          <div className="flex-1 min-h-0 px-6 pt-5 overflow-y-auto">
            {/* Social sign-up */}
            <motion.div variants={childVariants} className="flex gap-3">
              <button
                type="button"
                onClick={() => handleSocial('google')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2.5',
                  'h-[50px] rounded-2xl',
                  'bg-white border border-neutral-100',
                  'text-sm text-neutral-900 font-semibold',
                  'active:scale-[0.97] transition-transform duration-150',
                  'cursor-pointer hover:bg-neutral-50',
                )}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Google
              </button>

              <button
                type="button"
                onClick={() => handleSocial('apple')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2.5',
                  'h-[50px] rounded-2xl',
                  'bg-white border border-neutral-100',
                  'text-sm text-neutral-900 font-semibold',
                  'active:scale-[0.97] transition-transform duration-150',
                  'cursor-pointer hover:bg-neutral-50',
                )}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.32 2.32-1.55 4.3-3.74 4.25z" />
                </svg>
                Apple
              </button>
            </motion.div>

            {/* Divider */}
            <motion.div variants={childVariants} className="flex items-center gap-4 my-5">
              <div className="flex-1 h-px bg-neutral-100" />
              <span className="text-[11px] text-neutral-400 font-semibold uppercase tracking-[0.15em]">or</span>
              <div className="flex-1 h-px bg-neutral-100" />
            </motion.div>

            {/* Form card */}
            <motion.div
              variants={childVariants}
              className="bg-white rounded-2xl border border-neutral-100 p-5 space-y-4"
            >
              <Input
                label="Display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
                autoCapitalize="words"
                enterKeyHint="next"
                required
                maxLength={50}
              />

              <Input
                type="email"
                label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                enterKeyHint="next"
                required
              />

              <div>
                <Input
                  type="password"
                  label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  helperText="At least 8 characters with uppercase, number, or symbol"
                  required
                />
                {password.length > 0 && (
                  <div className="mt-2.5 flex items-center gap-2.5 px-0.5">
                    <div className="flex-1 flex gap-1">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <motion.div
                          key={i}
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: 0.25, delay: i * 0.05 }}
                          className={cn(
                            'h-1 flex-1 rounded-full origin-left transition-colors duration-300',
                            i < Math.ceil(passwordStrength.score / 1.25)
                              ? passwordStrength.color
                              : 'bg-neutral-100',
                          )}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] font-semibold text-neutral-500 min-w-[3rem]">
                      {passwordStrength.label}
                    </span>
                  </div>
                )}
              </div>

              <DateInput
                label="Date of Birth"
                value={dateOfBirth}
                onChange={setDateOfBirth}
                autoComplete="bday"
                max={maxDob}
                required
                helperText="You must be at least 18 years old"
                error={dateOfBirth && !isAgeValid ? 'You must be at least 18 to create an account' : undefined}
              />
            </motion.div>

            {/* Terms checkbox */}
            <motion.div variants={childVariants} className="mt-5 px-1">
              <Checkbox
                checked={agreedToTerms}
                onChange={setAgreedToTerms}
                label={
                  <>
                    I agree to the{' '}
                    <Link to="/terms" className="text-neutral-900 font-bold hover:underline">
                      Terms of Service
                    </Link>{' '}
                    and{' '}
                    <Link to="/privacy" className="text-neutral-900 font-bold hover:underline">
                      Privacy Policy
                    </Link>
                  </>
                }
              />
            </motion.div>

            {/* Error */}
            {error && (
              <motion.div
                initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 px-4 py-3 bg-error-50 border border-error-100 rounded-xl text-sm text-error-600 text-center font-medium"
                role="alert"
              >
                {error}
              </motion.div>
            )}
          </div>

          {/* Bottom CTA */}
          <motion.div
            variants={childVariants}
            className="px-4 sm:px-6 pt-4 pb-5"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
          >
            <Button
              type="submit"
              variant="auth"
              size="lg"
              fullWidth
              loading={isSubmitting}
              disabled={!canSubmit}
            >
              Create Account
            </Button>

            <p className="mt-4 text-center text-sm text-neutral-500">
              Already have an account?{' '}
              <Link to="/login" className="text-neutral-900 font-bold hover:underline">
                Log in
              </Link>
            </p>
          </motion.div>
        </motion.form>
      </div>
    </div>
  )
}
