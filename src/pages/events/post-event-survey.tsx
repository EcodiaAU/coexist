import { useState, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
    CheckCircle2,
    Send,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/use-auth'
import { useEventDetail, ACTIVITY_TYPE_LABELS, isPastEvent } from '@/hooks/use-events'
import { wallClockNow } from '@/lib/date-format'
import { useEventSurvey } from '@/hooks/use-event-survey'
import { SurveyQuestionRenderer } from '@/components/survey-questions'
import { canSubmitSurvey, stripHiddenAnswers } from '@/components/survey-questions-utils'
import {
    Page,
    Header,
    Button,
    Skeleton,
    EmptyState,
    WhatsNext,
} from '@/components'
import { useToast } from '@/components/toast'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database.types'

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

function useAttendanceCheck(eventId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['attendance-check', eventId, user?.id],
    queryFn: async () => {
      if (!eventId || !user) return null
      const { data } = await supabase
        .from('event_registrations')
        .select('status, checked_in_at')
        .eq('event_id', eventId)
        .eq('user_id', user.id)
        .maybeSingle()
      return data
    },
    enabled: !!eventId && !!user,
    staleTime: 5 * 60 * 1000,
  })
}

function useExistingResponse(surveyId: string | undefined, eventId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['survey-response', surveyId, eventId, user?.id],
    queryFn: async () => {
      if (!surveyId || !eventId || !user) return null
      const { data } = await supabase
        .from('survey_responses')
        .select('*')
        .eq('survey_id', surveyId)
        .eq('event_id', eventId)
        .eq('user_id', user.id)
        .maybeSingle()
      return data
    },
    enabled: !!surveyId && !!eventId && !!user,
  })
}

function useSubmitSurvey() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      surveyId,
      eventId,
      answers,
    }: {
      surveyId: string
      eventId: string
      answers: Json
    }) => {
      if (!user) throw new Error('Not authenticated')

      // The unique key on this table is a FUNCTIONAL index
      // (COALESCE(event_id, ...)) which PostgREST cannot target by name
      // or column-list for upsert. Do an explicit lookup, then update or
      // insert.
      const { data: existing, error: lookupError } = await supabase
        .from('survey_responses')
        .select('id')
        .eq('survey_id', surveyId)
        .eq('event_id', eventId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (lookupError) throw lookupError
      if (existing?.id) {
        const { error: updateError } = await supabase
          .from('survey_responses')
          .update({ answers })
          .eq('id', existing.id)
        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase
          .from('survey_responses')
          .insert({
            survey_id: surveyId,
            event_id: eventId,
            user_id: user.id,
            answers,
          })
        if (insertError) throw insertError
      }

      // NOTE: Attendees do NOT call syncSurveyImpact. Impact-tagged survey
      // answers are only synced to event_impact via the leader's log-impact
      // submission. If attendees wrote here they'd overwrite the leader's
      // authoritative impact figures with their own individual answers.
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['survey-response', variables.surveyId] })
      queryClient.invalidateQueries({ queryKey: ['pending-surveys'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function PostEventSurveyPage() {
  const { id: eventId } = useParams<{ id: string }>()
  const shouldReduceMotion = useReducedMotion()

  const { data: event, isLoading: eventLoading } = useEventDetail(eventId)
  const { data: surveyData, isLoading: surveyLoading } = useEventSurvey(eventId, event?.activity_type, 'attendee')
  const questions = surveyData?.questions ?? []
  const surveyId = surveyData?.surveyId
  const { data: existingResponse } = useExistingResponse(surveyId, eventId)
  const { data: attendance, isLoading: attendanceLoading } = useAttendanceCheck(eventId)
  const submitMutation = useSubmitSurvey()

  const [userAnswers, setUserAnswers] = useState<Record<string, unknown>>({})
  const [submitted, setSubmitted] = useState(false)

  // Pre-fill from existing response
  const existingAnswers = useMemo(() => {
    const resp = existingResponse as Record<string, unknown> | null | undefined
    return (resp?.answers as Record<string, unknown>) ?? {}
  }, [existingResponse])

  // Merge, don't swap. The prior code used
  //   Object.keys(userAnswers).length > 0 ? userAnswers : existingAnswers
  // which meant that as soon as the attendee touched ONE field on a
  // previously-saved response, `answers` collapsed to just that key and every
  // other saved answer vanished from both the renderer and the required-check,
  // so a fully-filled survey reported "required sections incomplete". Merging
  // existing under the user's edits preserves the untouched answers.
  const answers: Record<string, unknown> = useMemo(
    () => ({ ...existingAnswers, ...userAnswers }),
    [existingAnswers, userAnswers],
  )

  const setAnswer = useCallback((key: string, value: unknown) => {
    setUserAnswers((prev) => ({ ...prev, [key]: value }))
  }, [])

  // Canonical gate: every visible required question must be filled. Shared
  // with log-impact so both survey surfaces recognise 0 ratings, "No"
  // answers, "0" number entries and multi-selects identically, and skip
  // hidden conditional follow-ups.
  const canSubmit = canSubmitSurvey(questions, answers)

  const { toast } = useToast()

  const handleSubmit = useCallback(async () => {
    if (!eventId || !surveyId || !canSubmit || !questions.length) return
    try {
      const cleanAnswers = stripHiddenAnswers(questions, answers)
      await submitMutation.mutateAsync({ surveyId, eventId, answers: cleanAnswers as Json })
      setSubmitted(true)
    } catch {
      toast.error('Failed to submit survey. Please try again.')
    }
  }, [eventId, surveyId, canSubmit, answers, submitMutation, questions, toast])

  // 7-day survey window
  const surveyWindowExpired = useMemo(() => {
    if (!event || !isPastEvent(event)) return false
    const eventEnd = new Date(event.date_end ?? event.date_start).getTime()
    // Floating-local: event.date_end is wall-clock-as-UTC, so the "7 day
    // window expired" check compares against wall-clock-now.
    return (wallClockNow().getTime() - eventEnd) / (1000 * 60 * 60 * 24) > 7
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.date_end, event?.date_start])

  const isLoading = eventLoading || surveyLoading || attendanceLoading
  const showLoading = useDelayedLoading(isLoading)

  if (showLoading) {
    return (
      <Page swipeBack header={<Header title="Survey" back />}>
        <div className="p-4 space-y-4">
          <Skeleton className="h-20 rounded-md" />
          <Skeleton className="h-32 rounded-md" />
          <Skeleton className="h-32 rounded-md" />
        </div>
      </Page>
    )
  }
  if (!event) {
    return (
      <Page swipeBack header={<Header title="Survey" back />}>
        <EmptyState
          illustration="error"
          title="Event not found"
          description="This event may have been removed."
          action={{ label: 'Go Home', to: '/' }}
        />
      </Page>
    )
  }

  if (attendance && attendance.status !== 'attended') {
    const wasRegistered = attendance.status === 'registered' || attendance.status === 'waitlisted'
    return (
      <Page swipeBack header={<Header title="Survey" back />}>
        <EmptyState
          illustration="error"
          title="Survey not available"
          description={wasRegistered
            ? "You registered but weren't checked in at this event, so we can't accept your post-event answers. If you did attend, ask an event leader to check you in (post-event backfill is open until impact is logged)."
            : "We don't have a record of you attending this event. Only checked-in attendees can complete the post-event survey."}
          action={{ label: 'Back to Event', to: `/events/${eventId}` }}
        />
      </Page>
    )
  }
  if (!attendance) {
    return (
      <Page swipeBack header={<Header title="Survey" back />}>
        <EmptyState
          illustration="error"
          title="Survey not available"
          description="We don't have a record of you attending this event. Only checked-in attendees can complete the post-event survey. If you did attend, ask an event leader to check you in."
          action={{ label: 'Back to Event', to: `/events/${eventId}` }}
        />
      </Page>
    )
  }

  if (surveyWindowExpired && !existingResponse) {
    return (
      <Page swipeBack header={<Header title="Survey" back />}>
        <EmptyState
          illustration="error"
          title="Survey closed"
          description="The feedback window for this event has closed (7 days after the event)."
          action={{ label: 'Back to Event', to: `/events/${eventId}` }}
        />
      </Page>
    )
  }

  if (!questions.length) {
    return (
      <Page swipeBack header={<Header title="Survey" back />}>
        <EmptyState
          illustration="success"
          title="No survey for this event type"
          description="Thanks for attending! No additional feedback is needed."
          action={{ label: 'Back to Event', to: `/events/${eventId}` }}
        />
      </Page>
    )
  }

  if (submitted) {
    return (
      <Page swipeBack header={<Header title="Survey" back />}>
        <div className="p-4">
          <motion.div
            initial={shouldReduceMotion ? {} : { opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-8 sm:py-12 space-y-4"
          >
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-success-100 text-success-600 mx-auto">
              <CheckCircle2 size={32} />
            </div>
            <h2 className="font-heading text-xl font-bold text-neutral-900">Thanks for your feedback!</h2>
            <p className="text-sm text-neutral-500 max-w-xs mx-auto">
              Your response helps us improve future {ACTIVITY_TYPE_LABELS[event.activity_type] ?? 'events'}.
            </p>
          </motion.div>

          <WhatsNext
            suggestions={[
              { label: 'View Event', to: `/events/${eventId}` },
              { label: 'My Events', to: '/events' },
              { label: 'Home', to: '/' },
            ]}
          />
        </div>
      </Page>
    )
  }

  return (
    <Page
      swipeBack
      header={<Header title="Post-Event Survey" back />}
      footer={
        <Button
          variant="primary"
          size="lg"
          fullWidth
          icon={<Send size={16} />}
          disabled={!canSubmit}
          loading={submitMutation.isPending}
          onClick={handleSubmit}
        >
          Submit Feedback
        </Button>
      }
    >
      <div className="p-4 space-y-6 pb-6">
        {/* Event context */}
        <div className="rounded-md bg-white p-4 border border-neutral-100">
          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
            {ACTIVITY_TYPE_LABELS[event.activity_type] ?? event.activity_type}
          </p>
          <h2 className="font-heading text-lg font-bold text-neutral-900 mt-1">
            {event.title}
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            How was it? Your feedback helps us improve.
          </p>
        </div>

        {/* Questions - shared renderer */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={shouldReduceMotion ? undefined : { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
        >
          <SurveyQuestionRenderer
            questions={questions}
            answers={answers}
            setAnswer={setAnswer}
          />
        </motion.div>
      </div>
    </Page>
  )
}
