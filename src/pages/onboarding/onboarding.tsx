import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database.types'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/cn'
import { Button } from '@/components/button'

import { StepNameHandle } from './steps/step-name-handle'
import { StepLocation } from './steps/step-location'
import { StepCollective } from './steps/step-collective'
import { StepFirstEvent } from './steps/step-first-event'
import { StepCelebration } from './steps/step-celebration'

const TOTAL_STEPS = 4

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

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { user, collectiveRoles, isStaff, refreshProfile, markOnboardingComplete } = useAuth()
  const shouldReduceMotion = useReducedMotion()

  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [showCelebration, setShowCelebration] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isLeaderAfterComplete = useRef(false)

  // Shared onboarding data
  const [data, setData] = useState({
    displayName: '',
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
    if (step < TOTAL_STEPS - 1) {
      setDirection(1)
      setStep((s) => s + 1)
    } else {
      completeOnboarding()
    }
  }, [step, completeOnboarding])

  const goBack = useCallback(() => {
    if (step > 0) {
      setDirection(-1)
      setStep((s) => s - 1)
    }
  }, [step])

  if (showCelebration) {
    return (
      <StepCelebration
        onContinue={() =>
          navigate(isLeaderAfterComplete.current ? '/leader-welcome' : '/', { replace: true })
        }
      />
    )
  }

  const steps = [
    <StepNameHandle
      key="name"
      displayName={data.displayName}
      onChange={(name) => updateData({ displayName: name })}
      onNext={goNext}
      onSkip={goNext}
    />,
    <StepLocation
      key="location"
      location={data.location}
      onChange={(loc, point) => updateData({ location: loc, locationPoint: point })}
      onNext={goNext}
      onSkip={goNext}
    />,
    <StepCollective
      key="collective"
      selectedId={data.collectiveId}
      onSelect={(id) => updateData({ collectiveId: id })}
      onNext={goNext}
      onSkip={goNext}
    />,
    <StepFirstEvent
      key="event"
      collectiveId={data.collectiveId}
      onNext={goNext}
      onSkip={goNext}
    />,
  ]

  return (
    <div className="h-dvh flex flex-col bg-white overflow-hidden">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 pt-6 pb-4 px-6">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
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
            {steps[step]}
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
