/**
 * Public Check-In Page  -  /check-in/:token
 *
 * Anyone who scans a Co-Exist event QR code lands here. No auth required.
 * Submits to the public-event-check-in Edge Function.
 *
 * States: loading → idle → submitting → success | error | rate_limited | invalid
 *
 * Mobile-first. No app chrome (bare AppShell). Festival UX: large tap targets,
 * minimal fields, clear success/failure feedback.
 */
import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { Leaf, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type PageState = 'loading' | 'idle' | 'submitting' | 'success' | 'error' | 'rate_limited' | 'invalid'

interface EventInfo {
  event_title: string
  collective_name: string
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-event-check-in`

const inputCls = cn(
  'w-full rounded-2xl border border-neutral-200 bg-white/80 px-4 py-3.5 text-base text-neutral-900',
  'placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-400/40',
  'focus:border-primary-400 transition-colors duration-150',
)

const btnCls = cn(
  'w-full rounded-2xl bg-primary-500 text-white font-bold text-base py-4',
  'flex items-center justify-center gap-2',
  'shadow-md shadow-primary-300/40 active:scale-[0.98] transition-transform duration-100',
  'disabled:opacity-60 disabled:cursor-not-allowed',
)

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PublicCheckInPage() {
  const { token } = useParams<{ token: string }>()

  const [pageState, setPageState] = useState<PageState>('loading')
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  // Form fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [honeypot, setHoneypot] = useState('')

  // Load event info on mount
  useEffect(() => {
    if (!token) {
      setPageState('invalid')
      return
    }
    fetch(`${FUNCTIONS_URL}/info?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) {
          setPageState('invalid')
          return
        }
        const data: EventInfo = await res.json()
        setEventInfo(data)
        setPageState('idle')
      })
      .catch(() => setPageState('invalid'))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!name.trim()) {
      setErrorMessage('Your name is required.')
      setPageState('error')
      return
    }
    if (!email.trim() && !phone.trim()) {
      setErrorMessage('Please provide your email or phone number.')
      setPageState('error')
      return
    }

    setPageState('submitting')
    setErrorMessage('')

    try {
      // Include the user's auth token if they're logged in (optional)
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const res = await fetch(FUNCTIONS_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          token,
          first_name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          website_url: honeypot, // honeypot  -  always empty for real humans
        }),
      })

      const data = await res.json()

      if (res.status === 429) {
        setPageState('rate_limited')
        return
      }
      if (!res.ok) {
        setErrorMessage(data.error ?? 'Something went wrong. Please try again.')
        setPageState('error')
        return
      }

      setPageState('success')
    } catch {
      setErrorMessage('Network error. Please check your connection and try again.')
      setPageState('error')
    }
  }

  /* ---- Render ---- */

  return (
    <div className="min-h-dvh bg-gradient-to-b from-primary-50 to-white flex flex-col">
      {/* Header */}
      <header className="px-5 pt-8 pb-4 flex items-center gap-2">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary-500 shadow-sm">
          <Leaf size={18} className="text-white" />
        </div>
        <span className="font-heading font-bold text-primary-700 text-lg tracking-tight">Co-Exist</span>
      </header>

      <main className="flex-1 px-5 pb-10">
        {/* Loading */}
        {pageState === 'loading' && (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Loader2 size={28} className="text-primary-400 animate-spin" />
            <p className="text-sm text-neutral-500">Loading event...</p>
          </div>
        )}

        {/* Invalid token */}
        {pageState === 'invalid' && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-error-50">
              <AlertCircle size={28} className="text-error-500" />
            </div>
            <h1 className="font-heading text-xl font-bold text-neutral-900">Link not found</h1>
            <p className="text-sm text-neutral-500 max-w-xs">
              This check-in link is invalid or has expired. Ask your event leader for the current code.
            </p>
          </div>
        )}

        {/* Rate limited */}
        {pageState === 'rate_limited' && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-warning-50">
              <AlertCircle size={28} className="text-warning-500" />
            </div>
            <h1 className="font-heading text-xl font-bold text-neutral-900">Too many attempts</h1>
            <p className="text-sm text-neutral-500 max-w-xs">
              Too many check-in attempts from this device. Please wait a few minutes and try again.
            </p>
          </div>
        )}

        {/* Success */}
        {pageState === 'success' && (
          <div className="flex flex-col items-center justify-center gap-5 pt-10 text-center">
            <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-success-100">
              <CheckCircle2 size={40} className="text-success-500" />
              {/* Decorative ring */}
              <div className="absolute inset-0 rounded-full ring-4 ring-success-200/60 animate-ping opacity-30" />
            </div>
            <div>
              <h1 className="font-heading text-2xl font-bold text-neutral-900 mb-1">
                You're checked in!
              </h1>
              {eventInfo && (
                <p className="text-base text-neutral-600">
                  Welcome to <span className="font-semibold">{eventInfo.event_title}</span>
                  {eventInfo.collective_name ? ` with ${eventInfo.collective_name}` : ''}.
                </p>
              )}
            </div>
            <p className="text-sm text-neutral-400 mt-2">
              Enjoy the event! Download the Co-Exist app to connect with your collective.
            </p>
          </div>
        )}

        {/* Idle / error form */}
        {(pageState === 'idle' || pageState === 'submitting' || pageState === 'error') && (
          <form onSubmit={handleSubmit} noValidate className="space-y-4 pt-2">
            {/* Event info header */}
            {eventInfo && (
              <div className="mb-6">
                <p className="text-xs font-semibold text-primary-500 uppercase tracking-wider mb-1">
                  {eventInfo.collective_name}
                </p>
                <h1 className="font-heading text-2xl font-bold text-neutral-900 leading-tight">
                  Check in to<br />{eventInfo.event_title}
                </h1>
              </div>
            )}

            {/* Error banner */}
            {pageState === 'error' && errorMessage && (
              <div className="flex items-start gap-2.5 rounded-xl bg-error-50 border border-error-200 px-4 py-3">
                <AlertCircle size={16} className="text-error-500 mt-0.5 shrink-0" />
                <p className="text-sm text-error-700">{errorMessage}</p>
              </div>
            )}

            {/* Name */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-neutral-700">
                Your name <span className="text-error-500">*</span>
              </label>
              <input
                className={inputCls}
                type="text"
                placeholder="Jane Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-neutral-700">
                Email <span className="text-error-500">*</span>
              </label>
              <input
                className={inputCls}
                type="email"
                placeholder="jane@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
              />
            </div>

            {/* Phone (optional) */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-neutral-700">
                Phone <span className="text-xs font-normal text-neutral-400">(optional)</span>
              </label>
              <input
                className={inputCls}
                type="tel"
                placeholder="0412 345 678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                inputMode="tel"
              />
            </div>

            {/* Honeypot  -  hidden from real users, filled by bots */}
            <div
              style={{ display: 'none' }}
              aria-hidden="true"
            >
              <input
                type="text"
                name="website_url"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              className={cn(btnCls, 'mt-2')}
              disabled={pageState === 'submitting'}
            >
              {pageState === 'submitting' ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Checking in...
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  Check In
                </>
              )}
            </button>

            {/* Error try again */}
            {pageState === 'error' && (
              <button
                type="button"
                onClick={() => setPageState('idle')}
                className="w-full text-center text-sm text-neutral-500 underline py-2"
              >
                Try again
              </button>
            )}
          </form>
        )}
      </main>

      {/* Footer */}
      <footer className="px-5 pb-6 text-center">
        <p className="text-xs text-neutral-400">
          Co-Exist  -  connecting conservation communities
        </p>
      </footer>
    </div>
  )
}
