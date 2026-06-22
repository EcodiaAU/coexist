import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Trash2, Mail, CheckCircle, AlertTriangle, ArrowLeft, Shield, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { OGMeta } from '@/components/og-meta'
import { WebFooter } from '@/components/web-footer'
import { APP_NAME, CONTACT_EMAIL } from '@/lib/constants'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'


/* ------------------------------------------------------------------ */
/*  Steps                                                              */
/* ------------------------------------------------------------------ */

type Step = 'info' | 'login' | 'processing' | 'done'

/* ------------------------------------------------------------------ */
/*  Soft-delete helper                                                 */
/* ------------------------------------------------------------------ */

async function softDeleteUser(userId: string): Promise<{ error: string | null; alreadyPending: boolean }> {
  // Check if already pending deletion
  const { data: existing } = await supabase
    .from('profiles')
    .select('deletion_status')
    .eq('id', userId)
    .single()

  if ((existing as Record<string, unknown> | null)?.deletion_status === 'pending_deletion') {
    await supabase.auth.signOut()
    return { error: null, alreadyPending: true }
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      deleted_at: new Date().toISOString(),
      deletion_status: 'pending_deletion',
      deletion_requested_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (error) return { error: 'Failed to process deletion request. Please contact support.', alreadyPending: false }

  await supabase.auth.signOut()
  return { error: null, alreadyPending: false }
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AccountDeletionPage() {
  const shouldReduceMotion = useReducedMotion()
  const [step, setStep] = useState<Step>('info')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const oauthHandled = useRef(false)

  /* ---- Handle OAuth redirect back ---- */
  // When user returns from Google/Apple OAuth with ?confirm=1,
  // Supabase auto-picks up the hash fragment and creates a session.
  // We listen for SIGNED_IN, then soft-delete immediately.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('confirm') !== '1') return

    setStep('processing')

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (oauthHandled.current) return
      if (event === 'SIGNED_IN' && session?.user) {
        oauthHandled.current = true
        const result = await softDeleteUser(session.user.id)
        if (result.error) {
          setError(result.error)
          setStep('login')
        } else {
          // Clean up URL
          window.history.replaceState({}, '', '/account-deletion')
          setStep('done')
        }
      }
    })

    // Also check if there's already a session (e.g. hash already processed)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (oauthHandled.current) return
      if (session?.user) {
        oauthHandled.current = true
        const result = await softDeleteUser(session.user.id)
        if (result.error) {
          setError(result.error)
          setStep('login')
        } else {
          window.history.replaceState({}, '', '/account-deletion')
          setStep('done')
        }
      }
    })

    // Timeout after 30s
    const timeout = setTimeout(() => {
      if (!oauthHandled.current) {
        setError('Sign-in timed out. Please try again.')
        setStep('login')
      }
    }, 30_000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  /* ---- Email + password sign-in → soft-delete ---- */
  const handlePasswordDelete = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (signInError || !data.user) {
        setError('Invalid email or password. If you signed up with Google or Apple, use those buttons below instead.')
        setLoading(false)
        return
      }

      const result = await softDeleteUser(data.user.id)
      if (result.error) {
        setError(result.error)
        setLoading(false)
        return
      }
      setStep('done')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /* ---- OAuth sign-in → redirect back with ?confirm=1 ---- */
  const handleOAuthDelete = async (provider: 'google' | 'apple') => {
    setLoading(true)
    setError('')
    const redirectTo = `${window.location.origin}/account-deletion?confirm=1`
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    })
    if (oauthError) {
      setError(`Failed to sign in with ${provider === 'google' ? 'Google' : 'Apple'}. Please try again.`)
      setLoading(false)
    }
    // Page will redirect to the OAuth provider
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50/30 via-white to-primary-50/10 flex flex-col">
      <OGMeta
        title="Delete Account"
        description="Request deletion of your Co-Exist account and all associated data."
        canonicalPath="/account-deletion"
      />

      {/* Header bar */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-neutral-100">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <a href="/" className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-neutral-50 transition-colors" aria-label="Back to home">
            <ArrowLeft size={20} className="text-primary-700" />
          </a>
          <h1 className="font-heading text-lg font-semibold text-neutral-900">{APP_NAME}</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-4 py-8 sm:py-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            className="w-full max-w-lg space-y-6"
            variants={shouldReduceMotion ? undefined : stagger}
            initial="hidden"
            animate="visible"
          >
            {/* ---- Info step ---- */}
            {step === 'info' && (
              <>
                <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="text-center space-y-3">
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-error/10 flex items-center justify-center">
                    <Trash2 size={28} className="text-error" />
                  </div>
                  <h2 className="font-heading text-2xl font-bold text-neutral-900">Delete Your Account</h2>
                  <p className="text-neutral-500 text-sm leading-relaxed max-w-md mx-auto">
                    Request deletion of your {APP_NAME} account and all associated personal data.
                  </p>
                </motion.div>

                <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="bg-white/90 rounded-2xl shadow-sm border border-neutral-100 p-5 space-y-4">
                  <h3 className="font-heading font-semibold text-neutral-900">What happens when you delete your account</h3>
                  <ul className="space-y-3 text-sm text-neutral-600">
                    <li className="flex gap-3">
                      <Shield size={18} className="text-neutral-400 shrink-0 mt-0.5" />
                      <span>Your account will be marked for deletion with a <strong className="text-primary-700">30-day grace period</strong>. During this time, you can recover your account by simply logging back in.</span>
                    </li>
                    <li className="flex gap-3">
                      <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                      <span>After 30 days, all your personal data will be <strong className="text-primary-700">permanently removed</strong>, including your profile, event history, chat messages, points, and badges.</span>
                    </li>
                    <li className="flex gap-3">
                      <Mail size={18} className="text-neutral-400 shrink-0 mt-0.5" />
                      <span>Financial records (donations, orders) will be anonymised for accounting compliance but will no longer be linked to you.</span>
                    </li>
                  </ul>
                </motion.div>

                <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
                  <Button
                    variant="danger"
                    size="lg"
                    fullWidth
                    onClick={() => setStep('login')}
                  >
                    I understand, continue
                  </Button>
                </motion.div>
              </>
            )}

            {/* ---- Processing (OAuth redirect back) ---- */}
            {step === 'processing' && (
              <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="text-center space-y-4 py-12">
                <div className="mx-auto w-10 h-10 rounded-full border-2 border-neutral-200 border-t-primary-600 animate-spin" />
                <p className="text-primary-500 text-sm">Processing your deletion request...</p>
              </motion.div>
            )}

            {/* ---- Login + delete step ---- */}
            {step === 'login' && (
              <>
                <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="text-center space-y-3">
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-primary-100 flex items-center justify-center">
                    <Lock size={28} className="text-primary-700" />
                  </div>
                  <h2 className="font-heading text-2xl font-bold text-neutral-900">Confirm Your Identity</h2>
                  <p className="text-neutral-500 text-sm leading-relaxed max-w-md mx-auto">
                    Sign in to confirm the deletion request. Use the same method you used to create your account.
                  </p>
                </motion.div>

                {/* OAuth buttons */}
                <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="space-y-3">
                  <button
                    type="button"
                    className="w-full h-12 rounded-xl border border-neutral-200 bg-white flex items-center justify-center gap-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50"
                    onClick={() => handleOAuthDelete('google')}
                    disabled={loading}
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    Continue with Google
                  </button>

                  <button
                    type="button"
                    className="w-full h-12 rounded-xl border border-neutral-200 bg-black flex items-center justify-center gap-3 text-sm font-medium text-white hover:bg-neutral-800 transition-colors disabled:opacity-50"
                    onClick={() => handleOAuthDelete('apple')}
                    disabled={loading}
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
                      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                    </svg>
                    Continue with Apple
                  </button>
                </motion.div>

                {/* Divider */}
                <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-neutral-100" />
                  <span className="text-xs text-neutral-500 uppercase tracking-wider">or with email</span>
                  <div className="flex-1 h-px bg-neutral-100" />
                </motion.div>

                {/* Email + password form */}
                <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="space-y-4">
                  <Input
                    type="email"
                    label="Email address"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError('') }}
                    autoComplete="email"
                    required
                  />

                  <Input
                    type="password"
                    label="Password"
                    placeholder="Your account password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError('') }}
                    autoComplete="current-password"
                    required
                  />

                  {error && (
                    <motion.p
                      initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-sm text-error"
                      role="alert"
                    >
                      {error}
                    </motion.p>
                  )}

                  <Button
                    variant="danger"
                    size="lg"
                    fullWidth
                    loading={loading}
                    onClick={handlePasswordDelete}
                    disabled={!email.trim() || !password.trim()}
                  >
                    Delete my account
                  </Button>

                  <button
                    type="button"
                    className="w-full text-center text-sm text-neutral-500 hover:text-primary-700 transition-colors py-2"
                    onClick={() => { setStep('info'); setError(''); setPassword('') }}
                  >
                    Go back
                  </button>

                  <p className="text-center text-xs text-neutral-500">
                    Forgot your password? <a href="/forgot-password" className="text-primary-600 underline underline-offset-2">Reset it first</a>, then return here.
                  </p>
                </motion.div>
              </>
            )}

            {/* ---- Done step ---- */}
            {step === 'done' && (
              <>
                <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="text-center space-y-3">
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-primary-100 flex items-center justify-center">
                    <CheckCircle size={28} className="text-primary-700" />
                  </div>
                  <h2 className="font-heading text-2xl font-bold text-neutral-900">Account Deletion Requested</h2>
                  <p className="text-neutral-500 text-sm leading-relaxed max-w-md mx-auto">
                    Your account has been marked for deletion. You have <strong className="text-primary-700">30 days</strong> to change your mind by logging back in.
                  </p>
                </motion.div>

                <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="bg-white/90 rounded-2xl shadow-sm border border-neutral-100 p-5 space-y-3">
                  <h3 className="font-heading font-semibold text-neutral-900">What happens next</h3>
                  <ul className="space-y-2 text-sm text-neutral-600">
                    <li className="flex gap-2">
                      <span className="text-neutral-500">1.</span>
                      Your account is immediately deactivated.
                    </li>
                    <li className="flex gap-2">
                      <span className="text-neutral-500">2.</span>
                      Within 30 days, you can recover your account by logging in.
                    </li>
                    <li className="flex gap-2">
                      <span className="text-neutral-500">3.</span>
                      After 30 days, all personal data is permanently removed.
                    </li>
                  </ul>
                </motion.div>

                <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="text-center text-sm text-neutral-500">
                  Questions? Contact us at{' '}
                  <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary-700 underline underline-offset-2">
                    {CONTACT_EMAIL}
                  </a>
                </motion.div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <WebFooter />
    </div>
  )
}
