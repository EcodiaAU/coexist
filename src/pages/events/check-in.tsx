import { useState, useCallback, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
    Camera,
    Hash,
    CheckCircle2,
    AlertCircle,
    Sparkles,
    XCircle,
    WifiOff,
    Clock,
    UserCheck,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useProfile } from '@/hooks/use-profile'
import { useEventDetail, useCheckIn } from '@/hooks/use-events'
import { useCodeCheckIn } from '@/hooks/use-event-tickets'
import { useCollectiveRole } from '@/hooks/use-collective-role'
import { useOffline } from '@/hooks/use-offline'
import { useCheckInValidation } from '@/hooks/use-check-in-validation'
import { CHECK_IN_ERROR_MESSAGES, type CheckInErrorKind } from '@/lib/constants/check-in'
import { queueOfflineCheckIn } from '@/lib/offline-sync'
import { supabase } from '@/lib/supabase'
import {
    Page,
    Header,
    Button,
    Skeleton,
    EmptyState,
    Celebration,
    WhatsNext,
} from '@/components'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ */
/*  Confetti particles (inline for check-in success)                   */
/* ------------------------------------------------------------------ */

const CONFETTI_COLORS = [
  'bg-primary-400',
  'bg-primary-500',
  'bg-secondary-400',
  'bg-accent-400',
  'bg-success-400',
  'bg-warning-400',
]

function Confetti() {
  const shouldReduceMotion = useReducedMotion()
  const [particles] = useState(() => Array.from({ length: 40 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    size: 6 + Math.random() * 8,
    rotation: Math.random() * 360,
    direction: Math.random() > 0.5 ? 1 : -1,
    xDrift: (Math.random() - 0.5) * 200,
    duration: 1.5 + Math.random(),
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  })))
  if (shouldReduceMotion) return null

  return (
    <div data-eos-id="src/pages/events/check-in.tsx#0" data-eos-v="2" className="fixed inset-0 pointer-events-none z-50" aria-hidden="true">
      {particles.map((p, i) => (
        <motion.div data-eos-id="src/pages/events/check-in.tsx#1"
          key={i}
          className={cn('absolute rounded-sm', p.color)}
          style={{
            width: p.size,
            height: p.size * 0.6,
            left: `${p.left}%`,
            top: -20,
            rotate: p.rotation,
          }}
          initial={{ y: -20, opacity: 1 }}
          animate={{
            y: window.innerHeight + 50,
            opacity: [1, 1, 0],
            rotate: p.rotation + 360 * p.direction,
            x: p.xDrift,
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: 'easeIn',
          }}
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Check-in states                                                    */
/* ------------------------------------------------------------------ */

type CheckInState = 'idle' | 'success' | 'error' | 'waitlisted'

type ErrorKind = CheckInErrorKind

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function CheckInPage() {
  const { id: eventId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, isStaff: isGlobalStaff } = useAuth()
  const shouldReduceMotion = useReducedMotion()
  const { isOffline } = useOffline()

  const { data: profileData } = useProfile()
  const { data: event, isLoading } = useEventDetail(eventId)
  const showLoading = useDelayedLoading(isLoading)
  const checkInMutation = useCheckIn()
  const codeCheckIn = useCodeCheckIn()
  const { validateRegistration } = useCheckInValidation()
  const collectiveRole = useCollectiveRole(event?.collective_id)
  const isLeaderOrAbove = collectiveRole.isCoLeader || collectiveRole.isLeader || isGlobalStaff

  const [state, setState] = useState<CheckInState>('idle')
  // 3-digit check-in code. Sized to match the 3 inputs rendered below - 
  // previously was length 4 with dead slice logic that never triggered
  // because the 4th input was never rendered.
  const [digits, setDigits] = useState(['', '', ''])
  const [errorKind, setErrorKind] = useState<ErrorKind>('generic')
  const [showCelebration, setShowCelebration] = useState(false)
  const [checkedInOffline, setCheckedInOffline] = useState(false)
  const [promotingFromWaitlist, setPromotingFromWaitlist] = useState(false)

  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]

  // Focus first input on mount
  useEffect(() => {
    if (state === 'idle') {
      requestAnimationFrame(() => inputRefs[0].current?.focus())
    }
  }, [state])

  const handleDigitChange = useCallback((index: number, value: string) => {
    const char = value.replace(/[^a-zA-Z0-9]/g, '').slice(-1).toUpperCase()
    setDigits(prev => {
      const next = [...prev]
      next[index] = char
      return next
    })
    if (char && index < 2) {
      inputRefs[index + 1].current?.focus()
    }
  }, [])

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs[index - 1].current?.focus()
    }
  }, [digits])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 3)
    if (pasted.length === 3) {
      setDigits([pasted[0], pasted[1], pasted[2]])
      inputRefs[2].current?.focus()
    }
  }, [])

  const code = digits.join('')
  const isComplete = digits.every((d) => d !== '')

  /* ---- Offline check-in ---- */
  const handleOfflineCheckIn = useCallback(async () => {
    if (!eventId || !user) return

    try {
      const cached = await supabase
        .from('event_registrations')
        .select('status, checked_in_at')
        .eq('event_id', eventId)
        .eq('user_id', user.id)
        .maybeSingle()

      // Only one cached state still blocks the offline check-in: a row
      // already marked 'attended' with a checked_in_at timestamp. Missing
      // / waitlisted / cancelled all fall through to the queue and get
      // upserted to 'attended' on replay (server side does an UPSERT).
      // Per Tate 2026-05-23 Co-Exist incident.
      if (
        cached.data &&
        cached.data.status === 'attended' &&
        cached.data.checked_in_at
      ) {
        setErrorKind('already_checked_in')
        setState('error')
        return
      }
    } catch {
      // Query failed (truly offline / no cache) - proceed with queue
    }

    queueOfflineCheckIn(eventId, user.id)
    setCheckedInOffline(true)
    setState('success')
    setTimeout(() => setShowCelebration(true), 600)
  }, [eventId, user])

  /* ---- Code submit ---- */
  const handleCodeSubmit = useCallback(() => {
    if (!user || !isComplete) return

    if (isOffline) {
      handleOfflineCheckIn()
      return
    }

    codeCheckIn.mutate(
      { checkInCode: code },
      {
        onSuccess: () => {
          setState('success')
          setTimeout(() => setShowCelebration(true), 600)
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : ''
          if (msg.includes('Already checked in') || msg.includes('already checked in')) {
            setErrorKind('already_checked_in')
          } else if (msg.includes('not found') || msg.includes('No event')) {
            setErrorKind('invalid_qr')
          } else if (msg.includes('not registered')) {
            setErrorKind('not_registered')
          } else if (msg.includes('waitlist')) {
            setState('waitlisted')
            return
          } else if (msg.includes('cancelled')) {
            setErrorKind('event_cancelled')
          } else if (
            // Post-event backfill window guards (leaders only / impact logged /
            // before the day) raised by the BE check-in trigger. Participants
            // self-checking-in outside the day-of window land here.
            msg.includes('Check-in is closed') ||
            msg.includes('Post-event check-in') ||
            msg.includes('not available before the day') ||
            msg.includes('leaders only')
          ) {
            setErrorKind('event_not_active')
          } else {
            setErrorKind('generic')
          }
          setState('error')
        },
      },
    )
  }, [user, isComplete, code, isOffline, codeCheckIn, handleOfflineCheckIn])

  /* ---- Promote from waitlist (leader action) ---- */
  const handlePromoteFromWaitlist = useCallback(async () => {
    if (!eventId || !user) return
    setPromotingFromWaitlist(true)
    try {
      const { error } = await supabase
        .from('event_registrations')
        .update({ status: 'registered' })
        .eq('event_id', eventId)
        .eq('user_id', user.id)
        .eq('status', 'waitlisted')
      if (error) throw error
      // Now check in
      checkInMutation.mutate(
        { eventId, userId: user.id },
        {
          onSuccess: () => {
            setState('success')
            setTimeout(() => setShowCelebration(true), 600)
          },
          onError: () => {
            setErrorKind('generic')
            setState('error')
          },
        },
      )
    } catch {
      setErrorKind('generic')
      setState('error')
    } finally {
      setPromotingFromWaitlist(false)
    }
  }, [eventId, user, checkInMutation])

  if (showLoading) {
    return (
      <Page data-eos-id="src/pages/events/check-in.tsx#2" swipeBack header={<Header data-eos-id="src/pages/events/check-in.tsx#3" title="Check In" back />}>
        <div data-eos-id="src/pages/events/check-in.tsx#4" className="pt-8 space-y-4">
          <Skeleton data-eos-id="src/pages/events/check-in.tsx#5" variant="title" />
          <Skeleton data-eos-id="src/pages/events/check-in.tsx#6" variant="card" />
        </div>
      </Page>
    )
  }
  if (!event) {
    return (
      <Page data-eos-id="src/pages/events/check-in.tsx#7" swipeBack header={<Header data-eos-id="src/pages/events/check-in.tsx#8" title="Check In" back />}>
        <EmptyState data-eos-id="src/pages/events/check-in.tsx#9"
          illustration="error"
          title="Event not found"
          description="We couldn't find this event."
          action={{ label: 'Go Back', onClick: () => navigate(-1) }}
        />
      </Page>
    )
  }

  return (
    <Page data-eos-id="src/pages/events/check-in.tsx#10" swipeBack header={<Header data-eos-id="src/pages/events/check-in.tsx#11" title="Check In" back />}>
      <AnimatePresence data-eos-id="src/pages/events/check-in.tsx#12" mode="wait">
        {state === 'success' ? (
          <motion.div data-eos-id="src/pages/events/check-in.tsx#13"
            key="success"
            initial={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.4, type: 'spring', stiffness: 300 }}
            className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center"
          >
            <Confetti data-eos-id="src/pages/events/check-in.tsx#14" />

            <motion.div data-eos-id="src/pages/events/check-in.tsx#15"
              initial={shouldReduceMotion ? undefined : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.2, type: 'spring', stiffness: 200 }}
              className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center mb-6"
            >
              <CheckCircle2 data-eos-id="src/pages/events/check-in.tsx#16" size={40} className="text-primary-400" />
            </motion.div>

            <motion.h2 data-eos-id="src/pages/events/check-in.tsx#17"
              initial={shouldReduceMotion ? undefined : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.3 }}
              className="font-heading text-2xl font-bold text-neutral-900"
            >
              You're checked in!
            </motion.h2>

            <motion.p data-eos-id="src/pages/events/check-in.tsx#18" data-eos-var="event.title" data-eos-var-label="Title" data-eos-var-scope="prop"
              initial={shouldReduceMotion ? undefined : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.4 }}
              className="text-neutral-500 mt-2 max-w-xs"
            >
              Welcome to {event.title}. Have a great time making an impact!
            </motion.p>

            {/* Offline notice */}
            {checkedInOffline && (
              <motion.div data-eos-id="src/pages/events/check-in.tsx#19"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="flex items-center gap-2 mt-3 px-3 py-2 rounded-sm bg-warning-50 text-warning-700 text-caption"
              >
                <WifiOff data-eos-id="src/pages/events/check-in.tsx#20" size={14} />
                Queued offline - will sync when you reconnect
              </motion.div>
            )}

            {/* Profile survey prompt for first-time check-ins */}
            {profileData && !profileData.profile_details_completed && (
              <motion.div data-eos-id="src/pages/events/check-in.tsx#21"
                initial={shouldReduceMotion ? undefined : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.6 }}
                className="mt-6 w-full max-w-xs"
              >
                <div data-eos-id="src/pages/events/check-in.tsx#22" className="rounded-sm bg-primary-50 border border-neutral-200 p-4 text-center">
                  <p data-eos-id="src/pages/events/check-in.tsx#23" className="text-sm font-semibold text-neutral-900">
                    Quick profile setup
                  </p>
                  <p data-eos-id="src/pages/events/check-in.tsx#24" className="text-xs text-neutral-500 mt-1">
                    Help us keep you safe - takes 1 minute
                  </p>
                  <Button data-eos-id="src/pages/events/check-in.tsx#25"
                    variant="primary"
                    size="sm"
                    fullWidth
                    className="mt-3"
                    onClick={() => navigate(`/events/${event.id}/profile-survey`)}
                  >
                    Fill In Details
                  </Button>
                </div>
              </motion.div>
            )}

            {/* What's next? */}
            <motion.div data-eos-id="src/pages/events/check-in.tsx#26"
              initial={shouldReduceMotion ? undefined : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.8 }}
              className="mt-8 w-full max-w-xs"
            >
              <WhatsNext data-eos-id="src/pages/events/check-in.tsx#27"
                suggestions={[
                  {
                    label: 'View Event Details',
                    description: 'See the schedule and other attendees',
                    icon: <CheckCircle2 data-eos-id="src/pages/events/check-in.tsx#28" size={18} />,
                    to: `/events/${event.id}`,
                  },
                  {
                    label: 'Share a Photo',
                    description: 'Capture the moment with your group',
                    icon: <Camera data-eos-id="src/pages/events/check-in.tsx#29" size={18} />,
                    to: `/events/${event.id}?tab=photos`,
                  },
                ]}
              />
            </motion.div>
          </motion.div>
        ) : state === 'waitlisted' ? (
          <motion.div data-eos-id="src/pages/events/check-in.tsx#30"
            key="waitlisted"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center"
          >
            <div data-eos-id="src/pages/events/check-in.tsx#31" className="w-16 h-16 rounded-full bg-warning-100 flex items-center justify-center mb-4">
              <Clock data-eos-id="src/pages/events/check-in.tsx#32" size={32} className="text-warning-600" />
            </div>
            <h2 data-eos-id="src/pages/events/check-in.tsx#33" className="font-heading text-xl font-bold text-neutral-900">
              You're on the Waitlist
            </h2>
            <p data-eos-id="src/pages/events/check-in.tsx#34" className="text-neutral-500 mt-2 max-w-xs">
              {isLeaderOrAbove
                ? 'This person is waitlisted. You can confirm their spot and check them in.'
                : "You're on the waitlist \u2014 the coordinator can confirm your spot."}
            </p>
            <div data-eos-id="src/pages/events/check-in.tsx#35" className="mt-6 w-full max-w-xs space-y-2">
              {isLeaderOrAbove && (
                <Button data-eos-id="src/pages/events/check-in.tsx#36"
                  variant="primary"
                  fullWidth
                  icon={<UserCheck data-eos-id="src/pages/events/check-in.tsx#37" size={18} />}
                  loading={promotingFromWaitlist}
                  onClick={handlePromoteFromWaitlist}
                >
                  Move from Waitlist & Check In
                </Button>
              )}
              <Button data-eos-id="src/pages/events/check-in.tsx#38" variant="ghost" fullWidth onClick={() => navigate(`/events/${event.id}`)}>
                View Event
              </Button>
            </div>
          </motion.div>
        ) : state === 'error' ? (
          <motion.div data-eos-id="src/pages/events/check-in.tsx#39"
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center"
          >
            <div data-eos-id="src/pages/events/check-in.tsx#40" className="w-16 h-16 rounded-full bg-error-100 flex items-center justify-center mb-4">
              <XCircle data-eos-id="src/pages/events/check-in.tsx#41" size={32} className="text-error-600" />
            </div>
            <h2 data-eos-id="src/pages/events/check-in.tsx#42" className="font-heading text-xl font-bold text-neutral-900">
              {errorKind === 'already_checked_in' ? 'Already Checked In' : 'Check-in Failed'}
            </h2>
            <p data-eos-id="src/pages/events/check-in.tsx#43" data-eos-var="CHECK_IN_ERROR_MESSAGES.[..]" data-eos-var-label="]" data-eos-var-scope="prop" className="text-neutral-500 mt-2 max-w-xs">
              {CHECK_IN_ERROR_MESSAGES[errorKind]}
            </p>
            <div data-eos-id="src/pages/events/check-in.tsx#44" className="mt-6 w-full max-w-xs space-y-2">
              {errorKind === 'already_checked_in' || errorKind === 'event_cancelled' || errorKind === 'event_not_active' ? (
                <Button data-eos-id="src/pages/events/check-in.tsx#45" variant="primary" fullWidth onClick={() => navigate(`/events/${event.id}`)}>
                  View Event
                </Button>
              ) : (
                <Button data-eos-id="src/pages/events/check-in.tsx#46" variant="primary" fullWidth onClick={() => { setState('idle'); setDigits(['', '', '']) }}>
                  Try Again
                </Button>
              )}
              <Button data-eos-id="src/pages/events/check-in.tsx#47" variant="ghost" fullWidth onClick={() => navigate(-1)}>
                Go Back
              </Button>
            </div>
          </motion.div>
        ) : (
          /* ---- Idle: 3-digit code entry ---- */
          <motion.div data-eos-id="src/pages/events/check-in.tsx#48"
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="pt-6 pb-8"
          >
            <div data-eos-id="src/pages/events/check-in.tsx#49" className="text-center mb-8">
              <div data-eos-id="src/pages/events/check-in.tsx#50" className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-4">
                <Hash data-eos-id="src/pages/events/check-in.tsx#51" size={28} className="text-primary-500" />
              </div>
              <h2 data-eos-id="src/pages/events/check-in.tsx#52" className="font-heading text-xl font-bold text-neutral-900">
                Enter Check-In Code
              </h2>
              <p data-eos-id="src/pages/events/check-in.tsx#53" className="text-sm text-neutral-500 mt-1 max-w-xs mx-auto">
                Ask your leader for the 3-character code
              </p>
            </div>

            {/* Event card preview */}
            <div data-eos-id="src/pages/events/check-in.tsx#54" className="rounded-sm bg-white p-4 mb-6">
              <p data-eos-id="src/pages/events/check-in.tsx#55" data-eos-var="event.title" data-eos-var-label="Title" data-eos-var-scope="prop" className="text-sm font-semibold text-neutral-900">{event.title}</p>
              <p data-eos-id="src/pages/events/check-in.tsx#56" data-eos-var="event.collectives.name" data-eos-var-label="Name" data-eos-var-scope="prop" className="text-caption text-neutral-500 mt-0.5">
                {event.collectives?.name}
              </p>
            </div>

            {/* Offline banner */}
            {isOffline && (
              <div data-eos-id="src/pages/events/check-in.tsx#57" className="flex items-center gap-2 p-3 rounded-sm bg-warning-50 text-warning-700 text-sm font-medium mb-4">
                <WifiOff data-eos-id="src/pages/events/check-in.tsx#58" size={16} />
                You're offline. Check-in will be queued and synced later.
              </div>
            )}

            {/* 3-digit PIN entry */}
            <div data-eos-id="src/pages/events/check-in.tsx#59" className="flex justify-center gap-3 mb-6" onPaste={handlePaste}>
              {[0, 1, 2].map((i) => (
                <input data-eos-id="src/pages/events/check-in.tsx#60"
                  key={i}
                  ref={inputRefs[i]}
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  maxLength={1}
                  value={digits[i]}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="w-18 h-22 text-center text-3xl font-heading font-bold rounded-sm border-2 border-neutral-200 bg-white focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-colors"
                  autoComplete="off"
                />
              ))}
            </div>

            <Button data-eos-id="src/pages/events/check-in.tsx#61"
              variant="primary"
              size="lg"
              fullWidth
              loading={codeCheckIn.isPending}
              disabled={!isComplete}
              onClick={handleCodeSubmit}
            >
              Check In
            </Button>

            {/* Offline notice */}
            {!isOffline && (
              <div data-eos-id="src/pages/events/check-in.tsx#62" className="mt-6 flex items-start gap-2 p-3 rounded-sm bg-warning-50 text-warning-700 text-caption">
                <AlertCircle data-eos-id="src/pages/events/check-in.tsx#63" size={16} className="shrink-0 mt-0.5" />
                <span data-eos-id="src/pages/events/check-in.tsx#64">
                  No signal? Check-in will be queued and synced when you're back online.
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Celebration overlay */}
      <Celebration data-eos-id="src/pages/events/check-in.tsx#65"
        open={showCelebration}
        onClose={() => setShowCelebration(false)}
        title="Amazing work!"
        subtitle="Thanks for checking in - enjoy making an impact!"
        icon={<Sparkles data-eos-id="src/pages/events/check-in.tsx#66" size={36} className="text-white" />}
        autoDismiss={4000}
      />
    </Page>
  )
}
