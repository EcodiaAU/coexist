import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database.types'
import { useAuth } from '@/hooks/use-auth'
import { useUserLocation } from '@/hooks/use-nearby'
import { cn } from '@/lib/cn'
import { Button } from '@/components/button'
import { takePendingClaim } from '@/lib/pending-claim'

import { StepNameHandle } from './steps/step-name-handle'
import { StepLocation } from './steps/step-location'
import { StepPhone } from './steps/step-phone'
import { StepCollective } from './steps/step-collective'
import { StepFirstEvent } from './steps/step-first-event'
import { StepCelebration } from './steps/step-celebration'

// The profile-bootstrap fallback in use-auth writes this literal when a social
// signup arrives with no name in its provider metadata. Treat it as "no real
// name" so we still ask once, but never re-ask a user who gave a real name.
const NEW_USER_FALLBACK = 'New User'

type StepId = 'name' | 'location' | 'phone' | 'collective' | 'event'

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { user, profile, collectiveRoles, isStaff, refreshProfile, markOnboardingComplete } = useAuth()
  const shouldReduceMotion = useReducedMotion()

  // Trigger the device location permission prompt as soon as onboarding opens
  // (step 0), so the OS dialog appears well before the "Join a Collective"
  // step. The resolved coords are cached under ['user-location'] and read back
  // by StepCollective to rank collectives by proximity. Fire-and-cache: we
  // don't block any step on the result.
  useUserLocation()

  // Name is captured at sign-up (writes profiles.display_name via user
  // metadata, see use-auth), and phone was historically captured by a blocking
  // PhoneGate modal the instant onboarding finished. Both are folded in here so
  // nothing is asked twice and there's no post-onboarding ambush (Tate
  // 2026-07-26). The step list is computed ONCE from the settled profile
  // (route-guard guarantees it's loaded before /onboarding mounts) so it never
  // reshuffles mid-flow.
  const existingName = (profile?.display_name ?? '').trim()
  const hasRealName = existingName.length > 0 && existingName !== NEW_USER_FALLBACK
  const existingPhone = (profile?.phone ?? '').trim()

  const [stepOrder] = useState<StepId[]>(
    () =>
      [
        hasRealName ? null : 'name',
        'location',
        existingPhone ? null : 'phone',
        'collective',
        'event',
      ].filter(Boolean) as StepId[],
  )
  const totalSteps = stepOrder.length

  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [showCelebration, setShowCelebration] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isLeaderAfterComplete = useRef(false)

  // Shared onboarding data (name + phone prefilled from the profile so a user
  // who already has them never has to re-enter).
  const [data, setData] = useState({
    displayName: hasRealName ? existingName : '',
    phone: existingPhone,
    location: '',
    locationPoint: null as { lat: number; lng: number } | null,
    collectiveId: null as string | null,
  })

  const updateData = useCallback(
    (patch: Partial<typeof data>) => setData((prev) => ({ ...prev, ...patch })),
    [],
  )

  const completeOnboarding = useCallback(async () => {
    if (!user) return
    // Guard against double-submit. Step components don't receive isSubmitting
    // so they can't visually disable their Next buttons - if the user
    // double-taps the final step, we'd otherwise fire two parallel profile
    // upserts plus two sets of emails.
    if (isSubmitting) return

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const profilePayload: Record<string, unknown> = {
        id: user.id,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      }

      if (data.displayName) profilePayload.display_name = data.displayName
      if (data.location) profilePayload.location = data.location
      // Persist phone here so a new user who filled it in during onboarding
      // never trips the legacy PhoneGate backstop (which only shows when a
      // fully-onboarded profile has no phone on file).
      if (data.phone) profilePayload.phone = data.phone

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(profilePayload as Tables<'profiles'>, { onConflict: 'id' })

      if (profileError) {
        console.error('[onboarding] Failed to save profile:', profileError)
        setSubmitError('Something went wrong saving your profile. Tap retry.')
        return
      }

      // Auto-join the national (Australia) collective so every user
      // has access to the org-wide group chat and national events.
      const { data: nationalCollective } = await supabase
        .from('collectives')
        .select('id')
        .eq('is_national', true)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()

      const collectiveIds = [
        ...(data.collectiveId ? [data.collectiveId] : []),
        ...(nationalCollective?.id && nationalCollective.id !== data.collectiveId
          ? [nationalCollective.id]
          : []),
      ]

      for (const cId of collectiveIds) {
        const { error: memberError } = await supabase
          .from('collective_members')
          .upsert(
            {
              collective_id: cId,
              user_id: user.id,
              role: 'participant',
              status: 'active',
            },
            { onConflict: 'collective_id,user_id' },
          )

        if (memberError) {
          console.error(`[onboarding] Failed to join collective ${cId}:`, memberError)
        }
      }

      markOnboardingComplete()
      await refreshProfile()

      const hasLeaderRole = collectiveRoles.some(
        (m) => m.role === 'leader' || m.role === 'co_leader' || m.role === 'assist_leader',
      )
      isLeaderAfterComplete.current = hasLeaderRole || isStaff

      setShowCelebration(true)
    } catch (err) {
      console.error('[onboarding] Unexpected error:', err)
      setSubmitError('Something went wrong. Tap retry.')
    } finally {
      setIsSubmitting(false)
    }
  }, [user, isSubmitting, data, collectiveRoles, isStaff, markOnboardingComplete, refreshProfile])

  const goNext = useCallback(() => {
    if (step < totalSteps - 1) {
      setDirection(1)
      setStep((s) => s + 1)
    } else {
      completeOnboarding()
    }
  }, [step, totalSteps, completeOnboarding])

  const goBack = useCallback(() => {
    if (step > 0) {
      setDirection(-1)
      setStep((s) => s - 1)
    }
  }, [step])

  if (showCelebration) {
    return (
      <StepCelebration
        onContinue={() => {
          // An Eventbrite-migration invitee who just signed up resumes their
          // campout claim ahead of the normal landing.
          const pendingClaim = takePendingClaim()
          navigate(pendingClaim ?? (isLeaderAfterComplete.current ? '/leader-welcome' : '/'), { replace: true })
        }}
      />
    )
  }

  function renderStep(id: StepId) {
    switch (id) {
      case 'name':
        return (
          <StepNameHandle
            displayName={data.displayName}
            onChange={(name) => updateData({ displayName: name })}
            onNext={goNext}
            onSkip={goNext}
          />
        )
      case 'location':
        return (
          <StepLocation
            location={data.location}
            onChange={(loc, point) => updateData({ location: loc, locationPoint: point })}
            onNext={goNext}
            onSkip={goNext}
          />
        )
      case 'phone':
        return (
          <StepPhone
            phone={data.phone}
            onChange={(phone) => updateData({ phone })}
            onNext={goNext}
          />
        )
      case 'collective':
        return (
          <StepCollective
            selectedId={data.collectiveId}
            locationPoint={data.locationPoint}
            onSelect={(id) => updateData({ collectiveId: id })}
            onNext={goNext}
            onSkip={goNext}
          />
        )
      case 'event':
        return (
          <StepFirstEvent
            collectiveId={data.collectiveId}
            onNext={goNext}
            onSkip={goNext}
          />
        )
    }
  }

  return (
    <div className="h-dvh flex flex-col bg-white overflow-hidden">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 pt-6 pb-4 px-6">
        {Array.from({ length: totalSteps }, (_, i) => (
          <motion.div
            key={i}
            className={cn(
              'h-1.5 rounded-full transition-colors duration-300',
              i === step ? 'bg-neutral-900 w-6' : i < step ? 'bg-neutral-300 w-1.5' : 'bg-neutral-100 w-1.5',
            )}
            layout={!shouldReduceMotion}
          />
        ))}
      </div>

      {/* Back button (visible from step 1 onward) */}
      {step > 0 && (
        <button
          type="button"
          onClick={goBack}
          className="self-start ml-4 mb-2 text-sm text-neutral-500 hover:text-neutral-900 active:scale-[0.97] transition-[colors,transform] duration-150 cursor-pointer"
        >
          &larr; Back
        </button>
      )}

      {/* Step content with animated transitions */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={shouldReduceMotion ? undefined : slideVariants}
            initial={shouldReduceMotion ? false : 'enter'}
            animate="center"
            exit={shouldReduceMotion ? undefined : 'exit'}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="absolute inset-0 flex flex-col"
          >
            {renderStep(stepOrder[step])}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Error banner + retry */}
      {submitError && (
        <div className="px-4 sm:px-6 pb-4">
          <p className="text-sm text-error-600 text-center mb-2">{submitError}</p>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={isSubmitting}
            onClick={completeOnboarding}
          >
            Retry
          </Button>
        </div>
      )}
    </div>
  )
}

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? '100%' : '-100%',
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? '-100%' : '100%',
    opacity: 0,
  }),
}
