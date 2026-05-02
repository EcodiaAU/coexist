import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle, X } from 'lucide-react'
import { BottomSheet } from '@/components/bottom-sheet'
import { Button } from '@/components/button'
import { Skeleton } from '@/components/skeleton'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { SurveyQuestionRenderer } from '@/components/survey-questions'
import {
  resolveOtherValues,
  parseSurveyQuestions,
  type SurveyQuestion,
} from '@/components/survey-questions-utils'

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

function useSurveyDetail(surveyId: string | null) {
  return useQuery({
    queryKey: ['survey-detail', surveyId],
    queryFn: async () => {
      if (!surveyId) return null
      const { data, error } = await supabase
        .from('surveys')
        .select('id, title, questions')
        .eq('id', surveyId)
        .single()
      if (error) throw error
      return { ...data, questions: parseSurveyQuestions(data.questions) }
    },
    enabled: !!surveyId,
    staleTime: 5 * 60 * 1000,
  })
}

/** Fetch the user's collective (name, state, region, role) for autofill */
function useUserCollective(collectiveId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['user-collective-autofill', collectiveId, user?.id],
    queryFn: async () => {
      if (!collectiveId || !user) return null
      const [{ data: collective }, { data: membership }] = await Promise.all([
        supabase.from('collectives').select('name, state, region').eq('id', collectiveId).single(),
        supabase.from('collective_members').select('role').eq('collective_id', collectiveId).eq('user_id', user.id).eq('status', 'active').maybeSingle(),
      ])
      return {
        name: collective?.name ?? null,
        state: collective?.state ?? null,
        region: collective?.region ?? null,
        role: membership?.role ?? null,
      }
    },
    enabled: !!collectiveId && !!user,
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TaskSurveyModal({
  open,
  onClose,
  surveyId,
  collectiveId,
  onSubmit,
  submitting,
}: {
  open: boolean
  onClose: () => void
  surveyId: string
  collectiveId?: string
  onSubmit: (answers: Record<string, unknown>) => void
  submitting: boolean
}) {
  const { data: survey, isLoading } = useSurveyDetail(surveyId)
  const { profile } = useAuth()
  const { data: collective } = useUserCollective(collectiveId)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [otherValues, setOtherValues] = useState<Record<string, string>>({})

  const questions: SurveyQuestion[] = survey?.questions ?? []

  // Auto-fill profile and collective fields when questions load
  useEffect(() => {
    if (!questions.length || !profile) return
    const autofilled: Record<string, unknown> = {}
    for (const q of questions) {
      if (q.type === 'profile_autofill' && q.profile_field) {
        const field = q.profile_field
        let value: unknown = null

        if (field.startsWith('collective.')) {
          const collectiveField = field.replace('collective.', '')
          if (collective) {
            value = (collective as Record<string, unknown>)[collectiveField]
          }
        } else {
          value = (profile as Record<string, unknown>)[field]
          if (Array.isArray(value)) {
            value = value.join(', ')
          }
        }

        if (value !== undefined && value !== null && value !== '') {
          autofilled[q.id] = String(value)
        }
      }
    }
    if (Object.keys(autofilled).length > 0) {
      setAnswers((prev) => ({ ...autofilled, ...prev }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions.length, profile, collective])

  const allRequiredAnswered = questions.every((q) => {
    if (!q.required) return true
    const val = answers[q.id]
    if (val === undefined || val === null || val === '') return false
    if (q.type === 'checkbox' && Array.isArray(val) && val.length === 0) return false
    return true
  })

  const setAnswer = (questionId: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  const handleSubmit = () => {
    const finalAnswers = resolveOtherValues(questions, answers, otherValues)
    onSubmit(finalAnswers)
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading text-lg font-semibold text-neutral-900">{survey?.title ?? 'Survey'}</h2>
        <button
          onClick={onClose}
          className="flex items-center justify-center rounded-full min-w-11 min-h-11 text-neutral-400 hover:bg-neutral-50 active:scale-[0.93] transition-[colors,transform] duration-150 cursor-pointer"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>
      {isLoading ? (
        <Skeleton variant="list-item" count={4} />
      ) : !questions.length ? (
        <p className="text-sm text-neutral-500 py-4">No questions found in this survey.</p>
      ) : (
        <div className="space-y-5">
          <p className="text-xs text-neutral-500">
            Please complete this survey to finish the task.
          </p>

          <SurveyQuestionRenderer
            questions={questions}
            answers={answers}
            setAnswer={setAnswer}
          />

          <Button
            variant="primary"
            fullWidth
            onClick={handleSubmit}
            loading={submitting}
            disabled={!allRequiredAnswered}
            icon={<CheckCircle size={15} />}
          >
            Submit Survey & Complete Task
          </Button>
        </div>
      )}
    </BottomSheet>
  )
}
