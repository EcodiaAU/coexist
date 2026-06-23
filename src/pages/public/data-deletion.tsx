import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  Database, CheckCircle, ArrowLeft, Lock, Shield,
  MessageSquare, Calendar, Bell, Award, ClipboardList,
  Users, Flag, Send, Trophy,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { OGMeta } from '@/components/og-meta'
import { WebFooter } from '@/components/web-footer'
import { APP_NAME, CONTACT_EMAIL } from '@/lib/constants'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'


/* ------------------------------------------------------------------ */
/*  Data categories                                                    */
/* ------------------------------------------------------------------ */

interface DataCategory {
  id: string
  label: string
  description: string
  icon: React.ReactNode
}

const DATA_CATEGORIES: DataCategory[] = [
  { id: 'chat_messages', label: 'Chat messages', description: 'All messages you sent in collective chats', icon: <MessageSquare size={18} /> },
  { id: 'event_history', label: 'Event history', description: 'Event registrations, check-ins, and impact logs', icon: <Calendar size={18} /> },
  { id: 'notifications', label: 'Notifications', description: 'All notifications and alerts', icon: <Bell size={18} /> },
  { id: 'points', label: 'Points & rewards', description: 'Points earned from events and activities', icon: <Award size={18} /> },
  { id: 'survey_responses', label: 'Survey responses', description: 'Answers to surveys and questionnaires', icon: <ClipboardList size={18} /> },
  { id: 'social', label: 'Posts & comments', description: 'Posts, comments, and likes you created', icon: <Users size={18} /> },
  { id: 'reports', label: 'Content reports', description: 'Reports you filed on content', icon: <Flag size={18} /> },
  { id: 'invites', label: 'Invites', description: 'Invitations you sent to others', icon: <Send size={18} /> },
  { id: 'challenges', label: 'Challenges & offers', description: 'Challenge participation and offer redemptions', icon: <Trophy size={18} /> },
]

/* ------------------------------------------------------------------ */
/*  Steps                                                              */
/* ------------------------------------------------------------------ */

type Step = 'info' | 'login' | 'select' | 'processing' | 'done'

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DataDeletionPage() {
  const shouldReduceMotion = useReducedMotion()
  const [step, setStep] = useState<Step>('info')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deletedCategories, setDeletedCategories] = useState<string[]>([])
  const sessionRef = useRef<string | null>(null)
  const oauthHandled = useRef(false)

  const allSelected = selected.size === DATA_CATEGORIES.length
  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(DATA_CATEGORIES.map((c) => c.id)))
    }
  }
  const toggleCategory = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /* ---- Handle OAuth redirect back ---- */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('confirm') !== '1') return

    setStep('processing')

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (oauthHandled.current) return
      if (session?.access_token) {
        oauthHandled.current = true
        sessionRef.current = session.access_token
        window.history.replaceState({}, '', '/data-deletion')
        setStep('select')
      }
    })

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (oauthHandled.current) return
      if (session?.access_token) {
        oauthHandled.current = true
        sessionRef.current = session.access_token
        window.history.replaceState({}, '', '/data-deletion')
        setStep('select')
      }
    })

    const timeout = setTimeout(() => {
      if (!oauthHandled.current) {
        setError('Sign-in timed out. Please try again.')
        setStep('login')
      }
    }, 30_000)

    return () => { subscription.unsubscribe(); clearTimeout(timeout) }
  }, [])

  /* ---- Email + password sign-in ---- */
  const handlePasswordLogin = async () => {
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
      if (signInError || !data.session) {
        setError('Invalid email or password. If you signed up with Google or Apple, use those buttons above instead.')
        setLoading(false)
        return
      }
      sessionRef.current = data.session.access_token
      setStep('select')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /* ---- OAuth sign-in ---- */
  const handleOAuthLogin = async (provider: 'google' | 'apple') => {
    setLoading(true)
    setError('')
    const redirectTo = `${window.location.origin}/data-deletion?confirm=1`
    const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } })
    if (oauthError) {
      setError(`Failed to sign in with ${provider === 'google' ? 'Google' : 'Apple'}. Please try again.`)
      setLoading(false)
    }
  }

  /* ---- Delete selected data ---- */
  const handleDeleteData = async () => {
    if (selected.size === 0) {
      setError('Please select at least one data category.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const categories = allSelected ? ['all'] : Array.from(selected)
      const { data, error: fnError } = await supabase.functions.invoke('delete-user-data', {
        body: { categories },
      })
      if (fnError) {
        setError('Failed to delete data. Please try again or contact support.')
        setLoading(false)
        return
      }
      setDeletedCategories(data?.deleted ?? categories)
      await supabase.auth.signOut()
      setStep('done')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50/30 via-white to-primary-50/10 flex flex-col">
      <OGMeta
        title="Delete Your Data"
        description={`Request deletion of your ${APP_NAME} data without removing your account.`}
        canonicalPath="/data-deletion"
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
                  <div className="mx-auto w-14 h-14 rounded-md bg-primary-100 flex items-center justify-center">
                    <Database size={28} className="text-primary-700" />
                  </div>
                  <h2 className="font-heading text-2xl font-bold text-neutral-900">Delete Your Data</h2>
                  <p className="text-neutral-500 text-sm leading-relaxed max-w-md mx-auto">
                    Request deletion of some or all of your {APP_NAME} data while keeping your account active.
                  </p>
                </motion.div>

                <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="bg-white/90 rounded-md shadow-sm border border-neutral-100 p-5 space-y-4">
                  <h3 className="font-heading font-semibold text-neutral-900">How it works</h3>
                  <ul className="space-y-3 text-sm text-neutral-600">
                    <li className="flex gap-3">
                      <Shield size={18} className="text-neutral-400 shrink-0 mt-0.5" />
                      <span>Sign in to verify your identity, then choose which data to delete.</span>
                    </li>
                    <li className="flex gap-3">
                      <Database size={18} className="text-neutral-400 shrink-0 mt-0.5" />
                      <span>Selected data is <strong className="text-primary-700">permanently deleted</strong> from our servers. This action cannot be undone.</span>
                    </li>
                    <li className="flex gap-3">
                      <CheckCircle size={18} className="text-neutral-400 shrink-0 mt-0.5" />
                      <span>Your account, profile, and memberships remain active. Only the selected data categories are removed.</span>
                    </li>
                  </ul>
                  <p className="text-xs text-neutral-500">
                    Financial records (donations, orders) are retained in anonymised form for legal and accounting compliance.
                    To delete your entire account, visit <a href="/account-deletion" className="text-primary-600 underline underline-offset-2">account deletion</a>.
                  </p>
                </motion.div>

                <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
                  <Button variant="primary" size="lg" fullWidth onClick={() => setStep('login')}>
                    Continue
                  </Button>
                </motion.div>
              </>
            )}

            {/* ---- Processing (OAuth redirect back) ---- */}
            {step === 'processing' && (
              <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="text-center space-y-4 py-12">
                <div className="mx-auto w-10 h-10 rounded-full border-2 border-neutral-200 border-t-primary-600 animate-spin" />
                <p className="text-neutral-500 text-sm">Verifying your identity...</p>
              </motion.div>
            )}

            {/* ---- Login step ---- */}
            {step === 'login' && (
              <>
                <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="text-center space-y-3">
                  <div className="mx-auto w-14 h-14 rounded-md bg-primary-100 flex items-center justify-center">
                    <Lock size={28} className="text-primary-700" />
                  </div>
                  <h2 className="font-heading text-2xl font-bold text-neutral-900">Confirm Your Identity</h2>
                  <p className="text-neutral-500 text-sm leading-relaxed max-w-md mx-auto">
                    Sign in to verify your identity before deleting data.
                  </p>
                </motion.div>

                {/* OAuth buttons */}
                <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="space-y-3">
                  <button
                    type="button"
                    className="w-full h-12 rounded-sm border border-neutral-200 bg-white flex items-center justify-center gap-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50"
                    onClick={() => handleOAuthLogin('google')}
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
                    className="w-full h-12 rounded-sm border border-neutral-200 bg-black flex items-center justify-center gap-3 text-sm font-medium text-white hover:bg-neutral-800 transition-colors disabled:opacity-50"
                    onClick={() => handleOAuthLogin('apple')}
                    disabled={loading}
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
                      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                    </svg>
                    Continue with Apple
                  </button>
                </motion.div>

                <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-neutral-100" />
                  <span className="text-xs text-neutral-500 uppercase tracking-wider">or with email</span>
                  <div className="flex-1 h-px bg-neutral-100" />
                </motion.div>

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
                    variant="primary"
                    size="lg"
                    fullWidth
                    loading={loading}
                    onClick={handlePasswordLogin}
                    disabled={!email.trim() || !password.trim()}
                  >
                    Sign in
                  </Button>

                  <button
                    type="button"
                    className="w-full text-center text-sm text-neutral-500 hover:text-primary-700 transition-colors py-2"
                    onClick={() => { setStep('info'); setError(''); setPassword('') }}
                  >
                    Go back
                  </button>
                </motion.div>
              </>
            )}

            {/* ---- Select categories step ---- */}
            {step === 'select' && (
              <>
                <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="text-center space-y-3">
                  <div className="mx-auto w-14 h-14 rounded-md bg-primary-100 flex items-center justify-center">
                    <Database size={28} className="text-primary-700" />
                  </div>
                  <h2 className="font-heading text-2xl font-bold text-neutral-900">Choose Data to Delete</h2>
                  <p className="text-neutral-500 text-sm leading-relaxed max-w-md mx-auto">
                    Select the data categories you want to permanently remove. Your account will remain active.
                  </p>
                </motion.div>

                <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
                  {/* Select all */}
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-3 mb-2 rounded-sm bg-neutral-50 hover:bg-neutral-100 transition-colors"
                    onClick={toggleAll}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${allSelected ? 'bg-primary-700 border-primary-700' : 'border-primary-300 bg-white'}`}>
                      {allSelected && <CheckCircle size={14} className="text-white" />}
                    </div>
                    <span className="text-sm font-medium text-neutral-700">Select all</span>
                  </button>

                  {/* Category list */}
                  <div className="bg-white/90 rounded-md shadow-sm border border-neutral-100 overflow-hidden divide-y divide-neutral-100">
                    {DATA_CATEGORIES.map((cat) => {
                      const isSelected = selected.has(cat.id)
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-neutral-50 transition-colors text-left"
                          onClick={() => toggleCategory(cat.id)}
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-primary-700 border-primary-700' : 'border-primary-300 bg-white'}`}>
                            {isSelected && <CheckCircle size={14} className="text-white" />}
                          </div>
                          <div className="w-8 h-8 rounded-sm bg-primary-50 flex items-center justify-center shrink-0">
                            <span className="text-primary-500">{cat.icon}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-neutral-700">{cat.label}</p>
                            <p className="text-xs text-neutral-500 truncate">{cat.description}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </motion.div>

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

                <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="space-y-3">
                  <Button
                    variant="danger"
                    size="lg"
                    fullWidth
                    loading={loading}
                    onClick={handleDeleteData}
                    disabled={selected.size === 0}
                  >
                    Delete {selected.size === 0 ? 'selected data' : selected.size === DATA_CATEGORIES.length ? 'all data' : `${selected.size} categor${selected.size === 1 ? 'y' : 'ies'}`}
                  </Button>

                  <p className="text-center text-xs text-neutral-500">
                    This action is permanent and cannot be undone.
                  </p>
                </motion.div>
              </>
            )}

            {/* ---- Done step ---- */}
            {step === 'done' && (
              <>
                <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="text-center space-y-3">
                  <div className="mx-auto w-14 h-14 rounded-md bg-primary-100 flex items-center justify-center">
                    <CheckCircle size={28} className="text-primary-700" />
                  </div>
                  <h2 className="font-heading text-2xl font-bold text-neutral-900">Data Deleted</h2>
                  <p className="text-neutral-500 text-sm leading-relaxed max-w-md mx-auto">
                    The selected data has been permanently removed from our servers. Your account remains active.
                  </p>
                </motion.div>

                <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="bg-white/90 rounded-md shadow-sm border border-neutral-100 p-5 space-y-3">
                  <h3 className="font-heading font-semibold text-neutral-900">What was deleted</h3>
                  <ul className="space-y-1.5 text-sm text-neutral-600">
                    {deletedCategories.map((cat) => (
                      <li key={cat} className="flex items-center gap-2">
                        <CheckCircle size={14} className="text-primary-500 shrink-0" />
                        {cat.replace(/_/g, ' ')}
                      </li>
                    ))}
                  </ul>
                </motion.div>

                <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="bg-white/90 rounded-md shadow-sm border border-neutral-100 p-5 space-y-3">
                  <h3 className="font-heading font-semibold text-neutral-900">What was retained</h3>
                  <ul className="space-y-1.5 text-sm text-neutral-600">
                    <li className="flex items-center gap-2">
                      <Shield size={14} className="text-neutral-400 shrink-0" />
                      Your account and profile
                    </li>
                    <li className="flex items-center gap-2">
                      <Shield size={14} className="text-neutral-400 shrink-0" />
                      Collective memberships
                    </li>
                    <li className="flex items-center gap-2">
                      <Shield size={14} className="text-neutral-400 shrink-0" />
                      Anonymised financial records (donations, orders)
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
