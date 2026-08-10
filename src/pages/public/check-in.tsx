/**
 * Public Check-In Page  -  /check-in/:token
 *
 * Anyone who scans a Co-Exist event QR code lands here. No auth required.
 * Submits to the public-event-check-in Edge Function.
 *
 * States: loading -> idle -> submitting -> success | error | rate_limited | invalid
 *
 * Mobile-first, no app chrome. A branded event hero (cover image + title +
 * date + place) sits above an overlapping form card. Every edge respects the
 * device safe-area insets so it fits notches + home indicators cleanly.
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { CheckCircle2, AlertCircle, Loader2, Calendar, MapPin, WifiOff, Download, Clock } from 'lucide-react'
import { useImeSafeOnChange } from '@/hooks/use-ime-safe-on-change'
import { formatEventDate } from '@/lib/date-format'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type PageState =
  | 'loading'
  | 'idle'
  | 'submitting'
  | 'success'
  | 'error'
  | 'rate_limited'
  | 'invalid'
  | 'network_error' // transient/5xx/timeout on the info load - retryable, NOT a dead link
  | 'closed' // valid event but not its day - show the date instead of the live form

type ClosedReason = 'future' | 'past'

interface EventInfo {
  event_title: string
  collective_name: string
  cover_image_url?: string | null
  date_start?: string | null
  address?: string | null
  activity_type?: string | null
  timezone?: string | null
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-event-check-in`

// How long we wait for the /info load before treating it as a network problem
// (routes to the retry state, never to the "invalid link" dead-end).
const INFO_TIMEOUT_MS = 8000

// Calendar-day helpers that mirror the edge function EXACTLY so the client's
// open/closed decision matches the server's day-guard. The event's calendar day
// is the stored wall-clock's UTC slice; "today" is the current day in the
// event's collective timezone (the scanner is physically at the event).
function eventDayUTC(isoString: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(isoString))
}
function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

// Safe-area-aware edge padding for the whole page (notch + home indicator +
// landscape rounded corners). The CSS vars are defined in globals.css.
const safeEdges: React.CSSProperties = {
  paddingLeft: 'var(--safe-left, 0px)',
  paddingRight: 'var(--safe-right, 0px)',
}

const inputCls = cn(
  'w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 text-base text-neutral-900',
  'placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-400/40',
  'focus:border-primary-400 transition-colors duration-150',
)

const btnCls = cn(
  'w-full rounded-xl bg-primary-600 text-white font-bold text-base py-4',
  'flex items-center justify-center gap-2',
  'shadow-lg shadow-primary-600/20 active:scale-[0.98] transition-transform duration-100',
  'disabled:opacity-60 disabled:cursor-not-allowed',
)

/* A small labelled meta row (date, place) shown over the hero image. */
function HeroMeta({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-white/90 text-sm">
      <span className="shrink-0 opacity-80">{icon}</span>
      <span className="truncate">{children}</span>
    </div>
  )
}

/* Centred status screens (loading / invalid / network-error / closed / rate
   limited / success). Declared at module scope - it closes over nothing but the
   module-level safeEdges - so React never re-creates it per render. */
function CentredStatus({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-dvh bg-gradient-to-b from-primary-50 to-white flex flex-col items-center justify-center px-6 text-center"
      style={{ ...safeEdges, paddingTop: 'var(--safe-top, 0px)', paddingBottom: 'var(--safe-bottom, 0px)' }}
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PublicCheckInPage() {
  const { token } = useParams<{ token: string }>()

  const [pageState, setPageState] = useState<PageState>('loading')
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [closedReason, setClosedReason] = useState<ClosedReason>('future')

  // Form fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [honeypot, setHoneypot] = useState('')

  // IME-safe handlers for Samsung Keyboard / GBoard - see useImeSafeOnChange
  const nameProps = useImeSafeOnChange<HTMLInputElement>(setName)
  const emailProps = useImeSafeOnChange<HTMLInputElement>(setEmail)
  const phoneProps = useImeSafeOnChange<HTMLInputElement>(setPhone)

  // Load event info. Distinguishes a genuinely dead link (404 -> 'invalid')
  // from a transient blip (timeout / network throw / 5xx -> 'network_error'
  // with Retry), so a valid attendee with a momentary drop at a remote/outdoor
  // event is never wrongly told their link is dead (B3). Also computes openness
  // client-side so an off-day scan shows the event date instead of a live form
  // the server would only reject after submit.
  const loadInfo = useCallback(async () => {
    if (!token) {
      setPageState('invalid')
      return
    }
    setPageState('loading')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), INFO_TIMEOUT_MS)
    try {
      const res = await fetch(`${FUNCTIONS_URL}/info?token=${encodeURIComponent(token)}`, {
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (res.status === 404) {
        setPageState('invalid') // genuinely unknown/disabled token
        return
      }
      if (!res.ok) {
        setPageState('network_error') // 5xx / gateway - retryable, not a dead link
        return
      }
      const data: EventInfo = await res.json()
      setEventInfo(data)
      // Client-side day guard: if today (in the event's tz) is not the event's
      // calendar day, show the date instead of the form.
      if (data.date_start) {
        const tz = data.timezone ?? 'Australia/Sydney'
        const eDay = eventDayUTC(data.date_start)
        const tDay = todayInTz(tz)
        if (eDay !== tDay) {
          setClosedReason(eDay < tDay ? 'past' : 'future')
          setPageState('closed')
          return
        }
      }
      setPageState('idle')
    } catch {
      clearTimeout(timer)
      setPageState('network_error') // abort/timeout/offline - retryable
    }
  }, [token])

  useEffect(() => {
    void loadInfo()
  }, [loadInfo])

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

  /* ---- Centred status screens (loading / invalid / rate limited) ---- */

  if (pageState === 'loading') {
    return (
      <CentredStatus>
        <Loader2 size={30} className="text-primary-400 animate-spin" />
        <p className="mt-3 text-sm text-neutral-500">Loading event...</p>
      </CentredStatus>
    )
  }

  if (pageState === 'invalid') {
    return (
      <CentredStatus>
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-error-50">
          <AlertCircle size={30} className="text-error-500" />
        </div>
        <h1 className="mt-4 font-heading text-2xl font-semibold text-neutral-900">Link not found</h1>
        <p className="mt-2 text-sm text-neutral-500 max-w-xs">
          This check-in link is invalid or has expired. Ask your event leader for the current code.
        </p>
      </CentredStatus>
    )
  }

  if (pageState === 'network_error') {
    return (
      <CentredStatus>
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-warning-50">
          <WifiOff size={30} className="text-warning-500" />
        </div>
        <h1 className="mt-4 font-heading text-2xl font-semibold text-neutral-900">Couldn't load</h1>
        <p className="mt-2 text-sm text-neutral-500 max-w-xs">
          We couldn't reach the event just now. Check your connection and try again.
        </p>
        <button type="button" onClick={() => void loadInfo()} className={cn(btnCls, 'mt-6 max-w-xs')}>
          Try again
        </button>
      </CentredStatus>
    )
  }

  if (pageState === 'closed') {
    const closedDate = eventInfo?.date_start
      ? formatEventDate(eventInfo.date_start, eventInfo.timezone ?? undefined)
      : null
    return (
      <CentredStatus>
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary-50">
          {closedReason === 'future' ? (
            <Clock size={30} className="text-primary-500" />
          ) : (
            <Calendar size={30} className="text-primary-500" />
          )}
        </div>
        <h1 className="mt-4 font-heading text-2xl font-semibold text-neutral-900">
          {closedReason === 'future' ? 'Check-in not open yet' : 'This event has ended'}
        </h1>
        {eventInfo && (
          <p className="mt-2 text-base text-neutral-700 max-w-xs font-medium">{eventInfo.event_title}</p>
        )}
        <p className="mt-2 text-sm text-neutral-500 max-w-xs">
          {closedReason === 'future'
            ? closedDate
              ? `Check-in opens on the day of the event, ${closedDate}. See you there.`
              : 'Check-in opens on the day of the event. See you there.'
            : closedDate
              ? `This event was on ${closedDate}. Check-in is closed.`
              : 'Check-in for this event is closed.'}
        </p>
        <Link to="/download" className={cn(btnCls, 'mt-6 max-w-xs')}>
          <Download size={18} />
          Get the Co-Exist app
        </Link>
      </CentredStatus>
    )
  }

  if (pageState === 'rate_limited') {
    return (
      <CentredStatus>
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-warning-50">
          <AlertCircle size={30} className="text-warning-500" />
        </div>
        <h1 className="mt-4 font-heading text-2xl font-semibold text-neutral-900">Too many attempts</h1>
        <p className="mt-2 text-sm text-neutral-500 max-w-xs">
          Too many check-in attempts from this device. Please wait a few minutes and try again.
        </p>
      </CentredStatus>
    )
  }

  if (pageState === 'success') {
    return (
      <CentredStatus>
        <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-success-100">
          <CheckCircle2 size={48} className="text-success-600" />
          <div className="absolute inset-0 rounded-full ring-4 ring-success-200/60 animate-ping opacity-30" />
        </div>
        <h1 className="mt-6 font-heading text-3xl font-semibold text-neutral-900">You're checked in!</h1>
        {eventInfo && (
          <p className="mt-2 text-base text-neutral-600 max-w-xs">
            Welcome to <span className="font-semibold text-neutral-800">{eventInfo.event_title}</span>
            {eventInfo.collective_name ? ` with ${eventInfo.collective_name}` : ''}.
          </p>
        )}
        <p className="mt-6 text-sm text-neutral-500 max-w-xs">
          Enjoy the event. Get the app to connect with your collective and track your impact.
        </p>
        {/* Highest-intent moment: a real, tappable download CTA (was dead grey text). */}
        <Link to="/download" className={cn(btnCls, 'mt-5 max-w-xs')}>
          <Download size={18} />
          Get the Co-Exist app
        </Link>
        {/* Greeter flow: check the next person in without reloading the page. */}
        <button
          type="button"
          onClick={() => {
            setName('')
            setEmail('')
            setPhone('')
            setErrorMessage('')
            setPageState('idle')
          }}
          className="mt-2 w-full max-w-xs text-center text-sm font-medium text-primary-600 underline py-2"
        >
          Check in someone else
        </button>
      </CentredStatus>
    )
  }

  /* ---- Form states (idle / submitting / error) with the event hero ---- */

  const hasCover = !!eventInfo?.cover_image_url
  const dateLabel =
    eventInfo?.date_start
      ? formatEventDate(eventInfo.date_start, eventInfo.timezone ?? undefined)
      : null

  return (
    <div className="min-h-dvh w-full bg-neutral-50 flex flex-col">
      {/* ============================ Hero ============================ */}
      <div className="relative w-full">
        {/* Background: event cover image, or a branded green gradient. */}
        {hasCover ? (
          <>
            <img
              src={eventInfo!.cover_image_url as string}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/20" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary-500 via-primary-600 to-primary-800" />
        )}

        {/* Hero content */}
        <div
          className="relative flex flex-col justify-end min-h-[42dvh] px-5 pb-6"
          style={{ paddingTop: 'calc(var(--safe-top, 0px) + 24px)' }}
        >
          {/* Event identity */}
          {eventInfo && (
            <div>
              {eventInfo.collective_name && (
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/80 mb-2">
                  {eventInfo.collective_name}
                </p>
              )}
              <h1 className="font-heading text-[28px] leading-[1.08] font-semibold text-white drop-shadow-sm">
                {eventInfo.event_title}
              </h1>
              <div className="mt-3 space-y-1.5">
                {dateLabel && <HeroMeta icon={<Calendar size={15} />}>{dateLabel}</HeroMeta>}
                {eventInfo.address && <HeroMeta icon={<MapPin size={15} />}>{eventInfo.address}</HeroMeta>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===================== Form (below the hero) ===================== */}
      <main className="flex-1 w-full bg-white">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="px-5 pt-6"
          style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 24px)' }}
        >
          <h2 className="font-heading text-xl font-semibold text-neutral-900">Check in</h2>
          <p className="mt-1 text-sm text-neutral-500">
            No account needed. Add your details and you are on the list.
          </p>

          {/* Error banner */}
          {pageState === 'error' && errorMessage && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-error-50 border border-error-200 px-4 py-3">
              <AlertCircle size={16} className="text-error-500 mt-0.5 shrink-0" />
              <p className="text-sm text-error-700">{errorMessage}</p>
            </div>
          )}

          <div className="mt-5 space-y-4">
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
                {...nameProps}
                autoComplete="name"
                required
              />
            </div>

            {/* Email or phone: exactly one is required (validated below). The
                old "Email *" asterisk falsely implied email was mandatory. */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-neutral-700">
                Email
              </label>
              <input
                className={inputCls}
                type="email"
                placeholder="jane@example.com"
                value={email}
                {...emailProps}
                autoComplete="email"
                inputMode="email"
              />
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-neutral-700">
                Phone
              </label>
              <input
                className={inputCls}
                type="tel"
                placeholder="0412 345 678"
                value={phone}
                {...phoneProps}
                autoComplete="tel"
                inputMode="tel"
              />
              <p className="text-xs text-neutral-400">
                Enter your email or phone so we can reach you.
              </p>
            </div>
          </div>

          {/* Honeypot  -  hidden from real users, filled by bots */}
          <div style={{ display: 'none' }} aria-hidden="true">
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
          <button type="submit" className={cn(btnCls, 'mt-6')} disabled={pageState === 'submitting'}>
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

          {pageState === 'error' && (
            <button
              type="button"
              onClick={() => setPageState('idle')}
              className="mt-2 w-full text-center text-sm text-neutral-500 underline py-2"
            >
              Try again
            </button>
          )}
        </form>
      </main>
    </div>
  )
}
