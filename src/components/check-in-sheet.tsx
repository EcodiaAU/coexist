import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
    Camera,
    CheckCircle2, XCircle,
    WifiOff,
    Sparkles,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { useProfile } from '@/hooks/use-profile'
import { useCheckIn } from '@/hooks/use-events'
import { useCodeCheckIn } from '@/hooks/use-event-tickets'
import { useOffline } from '@/hooks/use-offline'
import { useCheckInValidation } from '@/hooks/use-check-in-validation'
import { CHECK_IN_ERROR_MESSAGES, type CheckInErrorKind } from '@/lib/constants/check-in'
import { queueOfflineCheckIn } from '@/lib/offline-sync'
import { BottomSheet } from '@/components/bottom-sheet'
import { Button } from '@/components/button'
import { Celebration } from '@/components/celebration'
import { Confetti } from '@/components/confetti'
import { WhatsNext } from '@/components/whats-next'
import { ProfileDetails, CheckInModeView } from '@/components/check-in-form'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Step = 'details' | 'checkin' | 'success' | 'error'
type ErrorKind = CheckInErrorKind

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface CheckInSheetProps {
  open: boolean
  onClose: () => void
  eventId: string
  eventTitle: string
  collectiveName?: string
}

/* ------------------------------------------------------------------ */
/*  Orchestrator                                                       */
/* ------------------------------------------------------------------ */

export function CheckInSheet({ open, onClose, eventId, eventTitle, collectiveName }: CheckInSheetProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const rm = useReducedMotion()
  const { isOffline } = useOffline()
  const { data: profileData } = useProfile()
  const checkInMutation = useCheckIn()
  const codeCheckIn = useCodeCheckIn()
  const { validateRegistration } = useCheckInValidation()

  const needsDetails = profileData && !profileData.profile_details_completed
  const [step, setStep] = useState<Step>('checkin')
  const [errorKind, setErrorKind] = useState<ErrorKind>('generic')
  const [showCelebration, setShowCelebration] = useState(false)
  const [checkedInOffline, setCheckedInOffline] = useState(false)

  // Reset state when sheet opens
  useEffect(() => {
    if (open) {
      setStep(needsDetails ? 'details' : 'checkin')
      setShowCelebration(false)
      setCheckedInOffline(false)
    }
  }, [open, needsDetails])

  /* ---- Check-in logic ---- */
  const validateAndCheckIn = useCallback(
    async (targetEventId: string) => {
      if (!user) return

      const validation = await validateRegistration(targetEventId, user.id)

      if (validation.status === 'error') {
        setErrorKind(validation.kind)
        setStep('error')
        return
      }

      // No-row, waitlisted, and cancelled all fall through to the
      // mutation: useCheckIn self path upserts to 'attended' on the day,
      // matching the "register + sign in on the day" model.
      checkInMutation.mutate(
        { eventId: targetEventId, userId: user.id },
        {
          onSuccess: () => {
            setStep('success')
            setTimeout(() => setShowCelebration(true), 600)
          },
          onError: () => {
            setErrorKind('generic')
            setStep('error')
          },
        },
      )
    },
    [user, checkInMutation],
  )

  const handleOfflineCheckIn = useCallback(() => {
    if (!eventId || !user) return
    queueOfflineCheckIn(eventId, user.id)
    setCheckedInOffline(true)
    setStep('success')
    setTimeout(() => setShowCelebration(true), 600)
  }, [eventId, user])

  const handleCheckIn = useCallback((resolvedEventId: string) => {
    if (isOffline) handleOfflineCheckIn()
    else validateAndCheckIn(resolvedEventId)
  }, [isOffline, validateAndCheckIn, handleOfflineCheckIn])

  /* ---- 3-digit code handler ---- */
  const handleCodeSubmit = useCallback((code: string) => {
    if (!user) return
    codeCheckIn.mutate(
      { checkInCode: code },
      {
        onSuccess: (result) => {
          setStep('success')
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
          } else {
            setErrorKind('generic')
          }
          setStep('error')
        },
      },
    )
  }, [user, codeCheckIn])

  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  const snapPoints = [0.92]

  return (
    <>
      <BottomSheet data-eos-id="src/components/check-in-sheet.tsx#0" data-eos-v="2" open={open} onClose={handleClose} snapPoints={snapPoints}>
        <div data-eos-id="src/components/check-in-sheet.tsx#1" className="h-[70vh] overflow-y-auto relative">
        <AnimatePresence data-eos-id="src/components/check-in-sheet.tsx#2" mode="wait">
          {/* Profile details (blocks check-in) */}
          {step === 'details' && (
            <ProfileDetails data-eos-id="src/components/check-in-sheet.tsx#3" onComplete={() => setStep('checkin')} />
          )}

          {/* 3-digit code entry */}
          {step === 'checkin' && (
            <CheckInModeView data-eos-id="src/components/check-in-sheet.tsx#4"
              eventTitle={eventTitle}
              collectiveName={collectiveName}
              isPending={checkInMutation.isPending || codeCheckIn.isPending}
              onManualSubmit={handleCodeSubmit}
            />
          )}

          {/* Success */}
          {step === 'success' && (
            <motion.div data-eos-id="src/components/check-in-sheet.tsx#5"
              key="success"
              initial={rm ? undefined : { opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={rm ? { duration: 0 } : { duration: 0.35, type: 'spring', stiffness: 300 }}
              className="flex flex-col items-center py-6 text-center"
            >
              <Confetti data-eos-id="src/components/check-in-sheet.tsx#6" active count={40} duration={2500} />

              <motion.div data-eos-id="src/components/check-in-sheet.tsx#7"
                initial={rm ? undefined : { scale: 0 }}
                animate={{ scale: 1 }}
                transition={rm ? { duration: 0 } : { delay: 0.2, type: 'spring', stiffness: 200 }}
                className="w-18 h-18 rounded-full bg-primary-100 flex items-center justify-center mb-5"
              >
                <CheckCircle2 data-eos-id="src/components/check-in-sheet.tsx#8" size={36} className="text-primary-400" />
              </motion.div>

              <motion.h3 data-eos-id="src/components/check-in-sheet.tsx#9"
                initial={rm ? undefined : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={rm ? { duration: 0 } : { delay: 0.3 }}
                className="font-heading text-xl font-bold text-neutral-900"
              >
                You're checked in!
              </motion.h3>

              <motion.p data-eos-id="src/components/check-in-sheet.tsx#10"
                initial={rm ? undefined : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={rm ? { duration: 0 } : { delay: 0.4 }}
                className="text-neutral-500 mt-1.5 max-w-xs text-sm"
              >
                Welcome to {eventTitle}. Have a great time making an impact!
              </motion.p>

              {checkedInOffline && (
                <motion.div data-eos-id="src/components/check-in-sheet.tsx#11"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                  className="flex items-center gap-2 mt-3 px-3 py-2 rounded-sm bg-warning-50 text-warning-700 text-caption"
                >
                  <WifiOff data-eos-id="src/components/check-in-sheet.tsx#12" size={14} />
                  Queued offline - will sync when you reconnect
                </motion.div>
              )}

              <motion.div data-eos-id="src/components/check-in-sheet.tsx#13"
                initial={rm ? undefined : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={rm ? { duration: 0 } : { delay: 0.6 }}
                className="mt-6 w-full"
              >
                <WhatsNext data-eos-id="src/components/check-in-sheet.tsx#14"
                  suggestions={[
                    {
                      label: 'View Event Details',
                      description: 'See the schedule and other attendees',
                      icon: <CheckCircle2 data-eos-id="src/components/check-in-sheet.tsx#15" size={18} />,
                      onClick: () => { onClose(); navigate(`/events/${eventId}`) },
                    },
                    {
                      label: 'Share a Photo',
                      description: 'Capture the moment with your group',
                      icon: <Camera data-eos-id="src/components/check-in-sheet.tsx#16" size={18} />,
                      onClick: () => { onClose(); navigate(`/events/${eventId}?tab=photos`) },
                    },
                  ]}
                />
              </motion.div>

              <Button data-eos-id="src/components/check-in-sheet.tsx#17" variant="ghost" className="mt-4" onClick={handleClose}>
                Done
              </Button>
            </motion.div>
          )}

          {/* Error */}
          {step === 'error' && (
            <motion.div data-eos-id="src/components/check-in-sheet.tsx#18"
              key="error"
              initial={rm ? undefined : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={rm ? { opacity: 0 } : { opacity: 0, y: -12 }}
              transition={rm ? { duration: 0 } : { duration: 0.25, ease: 'easeInOut' }}
              className="flex flex-col items-center py-8 text-center"
            >
              <div data-eos-id="src/components/check-in-sheet.tsx#19" className="w-14 h-14 rounded-full bg-error-100 flex items-center justify-center mb-4">
                <XCircle data-eos-id="src/components/check-in-sheet.tsx#20" size={28} className="text-error-600" />
              </div>
              <h3 data-eos-id="src/components/check-in-sheet.tsx#21" className="font-heading text-lg font-bold text-neutral-900">
                {errorKind === 'already_checked_in' ? 'Already Checked In' : 'Check-in Failed'}
              </h3>
              <p data-eos-id="src/components/check-in-sheet.tsx#22" data-eos-var="CHECK_IN_ERROR_MESSAGES.[..]" data-eos-var-label="]" data-eos-var-scope="prop" className="text-neutral-500 mt-1.5 max-w-xs text-sm">
                {CHECK_IN_ERROR_MESSAGES[errorKind]}
              </p>
              <div data-eos-id="src/components/check-in-sheet.tsx#23" className="mt-5 w-full space-y-2">
                {errorKind === 'already_checked_in' ? (
                  <Button data-eos-id="src/components/check-in-sheet.tsx#24" variant="primary" fullWidth onClick={() => { onClose(); navigate(`/events/${eventId}`) }}>
                    View Event
                  </Button>
                ) : (
                  <Button data-eos-id="src/components/check-in-sheet.tsx#25" variant="primary" fullWidth onClick={() => setStep('checkin')}>
                    Try Again
                  </Button>
                )}
                <Button data-eos-id="src/components/check-in-sheet.tsx#26" variant="ghost" fullWidth onClick={handleClose}>
                  Close
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </BottomSheet>

      <Celebration data-eos-id="src/components/check-in-sheet.tsx#27"
        open={showCelebration}
        onClose={() => setShowCelebration(false)}
        title="Amazing work!"
        subtitle="Thanks for checking in - enjoy making an impact!"
        icon={<Sparkles data-eos-id="src/components/check-in-sheet.tsx#28" size={36} className="text-white" />}
        autoDismiss={4000}
      />
    </>
  )
}
