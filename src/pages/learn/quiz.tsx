import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Trophy,
  RotateCcw,
  Check,
  X,
  CircleDot,
  Target,
} from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Button } from '@/components/button'
import { Skeleton } from '@/components/skeleton'
import { ProgressRing } from '@/components/development/progress-ring'
import { useToast } from '@/components/toast'
import { QuizQuestionCard } from '@/components/development/quiz-question-card'
import { cn } from '@/lib/cn'
import { useDevQuiz, useDevQuizQuestions } from '@/hooks/use-admin-development'
import { useSubmitQuiz, useQuizAttempts } from '@/hooks/use-development-progress'

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LearnQuizPage() {
  const { quizId } = useParams<{ quizId: string }>()
  const [searchParams] = useSearchParams()
  const moduleId = searchParams.get('moduleId')
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const { toast } = useToast()

  const { data: quiz, isLoading: quizLoading } = useDevQuiz(quizId)
  const { data: questions = [], isLoading: questionsLoading } = useDevQuizQuestions(quizId)
  const { data: _attempts = [] } = useQuizAttempts(quizId)
  const submitQuiz = useSubmitQuiz()

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Map<string, { selectedOptionIds: string[]; textResponse?: string }>>(new Map())
  const [showResults, setShowResults] = useState(false)
  const [results, setResults] = useState<{ score: number; passed: boolean; total: number; earned: number } | null>(null)
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)
  const timerRef = useRef(0)
  const autoSubmitRef = useRef(false)

  // Check if max attempts exceeded
  const attempts = _attempts ?? []
  const maxAttempts = quiz?.max_attempts ?? 0 // 0 = unlimited
  const attemptsExhausted = maxAttempts > 0 && attempts.length >= maxAttempts
  const previouslyPassed = attempts.some((a) => a.passed)

  // Time tracking + time limit countdown
  const limitSec = quiz?.time_limit_minutes ? quiz.time_limit_minutes * 60 : null
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialising from derived prop, runs once
    if (limitSec) setTimeRemaining(limitSec)
  }, [limitSec])
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) {
        timerRef.current += 1
        if (limitSec) {
          setTimeRemaining((prev) => {
            if (prev === null) return null
            const next = prev - 1
            if (next <= 0) autoSubmitRef.current = true
            return Math.max(0, next)
          })
        }
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [limitSec])

  // Use a stable random seed for consistent shuffle across re-renders
  const [shuffleSeed] = useState(() => Math.random())
  const orderedQuestions = useMemo(() => {
    if (quiz?.randomize_questions && questions.length > 1) {
      // Fisher-Yates shuffle with seeded PRNG
      const arr = [...questions]
      let seed = shuffleSeed * 2147483647
      const nextSeed = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(nextSeed() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      return arr
    }
    return questions
  }, [questions, quiz?.randomize_questions, shuffleSeed])

  const currentQuestion = orderedQuestions[currentIndex]
  const isLastQuestion = currentIndex === orderedQuestions.length - 1
  const allAnswered = answers.size === orderedQuestions.length
  const progressPct = orderedQuestions.length > 0 ? Math.round(((currentIndex + 1) / orderedQuestions.length) * 100) : 0

  const handleAnswer = useCallback(
    (selectedOptionIds: string[], textResponse?: string) => {
      if (!currentQuestion) return
      setAnswers((prev) => {
        const next = new Map(prev)
        next.set(currentQuestion.id, { selectedOptionIds, textResponse })
        return next
      })
    },
    [currentQuestion],
  )

  const handleNext = () => {
    if (isLastQuestion && allAnswered) handleSubmit()
    else if (!isLastQuestion) setCurrentIndex((i) => i + 1)
  }

  const handleSubmit = useCallback(async () => {
    if (!quiz || !quizId) return
    const totalPoints = orderedQuestions.reduce((sum, q) => sum + (q.points ?? 1), 0)
    let earnedPoints = 0
    const responses = orderedQuestions.map((q) => {
      const answer = answers.get(q.id)
      const selectedIds = answer?.selectedOptionIds ?? []
      const options = q.options ?? []
      let isCorrect = false
      if (q.question_type === 'short_answer') {
        isCorrect = true
      } else {
        const correctIds = new Set(options.filter((o) => o.is_correct).map((o) => o.id))
        const selectedSet = new Set(selectedIds)
        isCorrect = correctIds.size === selectedSet.size && [...correctIds].every((id) => selectedSet.has(id))
      }
      const pts = isCorrect ? (q.points ?? 1) : 0
      earnedPoints += pts
      return { question_id: q.id, selected_option_ids: selectedIds, text_response: answer?.textResponse, is_correct: isCorrect, points_earned: pts }
    })
    const scorePct = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0
    const passed = scorePct >= (quiz.pass_score ?? 70)
    try {
      await submitQuiz.mutateAsync({ quiz_id: quizId, module_id: moduleId, score_pct: scorePct, points_earned: earnedPoints, points_total: totalPoints, passed, time_spent_sec: timerRef.current, responses })
      setResults({ score: scorePct, passed, total: totalPoints, earned: earnedPoints })
      setShowResults(true)
    } catch {
      toast.error('Failed to submit quiz')
    }
  }, [quiz, quizId, moduleId, orderedQuestions, answers, submitQuiz, toast])

  // Auto-submit when time runs out
  useEffect(() => {
    if (autoSubmitRef.current && !showResults) {
      autoSubmitRef.current = false
      toast.warning('Time is up! Submitting your answers...')
      handleSubmit()
    }
  }, [timeRemaining, showResults, handleSubmit, toast])

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const isLoading = quizLoading || questionsLoading

  if (isLoading) {
    return (
      <Page header={<Header title="" back />}>
        <div className="max-w-2xl mx-auto space-y-6 pb-20 pt-4">
          <Skeleton className="h-10 w-48 rounded-sm" />
          <Skeleton className="h-3 rounded-full" />
          <Skeleton className="h-64 rounded-md" />
        </div>
      </Page>
    )
  }

  if (!quiz) {
    return (
      <Page header={<Header title="" back />}>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="flex items-center justify-center w-14 h-14 rounded-md bg-neutral-100 mb-4">
            <CircleDot size={24} strokeWidth={1.5} className="text-neutral-400" />
          </div>
          <p className="text-[15px] font-bold text-neutral-900">Quiz not found</p>
          <p className="text-[13px] text-neutral-500 mt-1">This quiz may have been removed or is no longer available.</p>
          <Button variant="ghost" size="sm" onClick={() => navigate('/learn')} className="mt-3">
            Back to My Learning
          </Button>
        </div>
      </Page>
    )
  }

  /* ── Attempts exhausted screen ── */
  if (attemptsExhausted && !showResults) {
    const bestAttempt = attempts.reduce((best, a) => (a.score_pct > best.score_pct ? a : best), attempts[0])
    return (
      <Page header={<Header title="" back />}>
        <div className="max-w-2xl mx-auto pb-20 pt-4 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-md bg-neutral-100 mb-5">
            <RotateCcw size={28} className="text-neutral-500" />
          </div>
          <h2 className="font-heading text-xl font-bold text-neutral-900 mb-2">
            {previouslyPassed ? 'Quiz Passed' : 'No Attempts Remaining'}
          </h2>
          <p className="text-[13px] text-neutral-500 mb-6">
            {previouslyPassed
              ? `You passed with ${bestAttempt.score_pct}%. Well done!`
              : `You've used all ${maxAttempts} attempt${maxAttempts === 1 ? '' : 's'}. Your best score was ${bestAttempt.score_pct}%.`}
          </p>
          <Button variant="primary" size="md" onClick={() => moduleId ? navigate(`/learn/module/${moduleId}`) : navigate('/learn')}>
            {previouslyPassed ? 'Continue' : 'Back to Learning'}
          </Button>
        </div>
      </Page>
    )
  }

  /* ── Results screen ── */
  if (showResults && results) {
    return (
      <Page header={<Header title="" back />}>
      <div className="max-w-2xl mx-auto pb-20 pt-4">
        <motion.div
          initial={rm ? {} : { opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          {/* Result icon */}
          <motion.div
            initial={rm ? {} : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 15 }}
            className={cn(
              'inline-flex items-center justify-center w-20 h-20 rounded-full mb-6',
              results.passed
                ? 'bg-primary-50'
                : 'bg-neutral-100',
            )}
          >
            {results.passed ? (
              <Trophy size={36} className="text-primary-600" />
            ) : (
              <RotateCcw size={36} className="text-bark-600" />
            )}
          </motion.div>

          <h2 className="font-heading text-2xl font-bold text-neutral-900 mb-1">
            {results.passed ? 'Congratulations!' : 'Keep Going!'}
          </h2>
          <p className="text-[13px] text-neutral-500 mb-8">
            {results.passed
              ? 'You passed the quiz successfully'
              : `You need ${quiz.pass_score}% to pass. Try again!`}
          </p>

          {/* Score card */}
          <div className="inline-flex items-center gap-5 px-7 py-5 rounded-md bg-white border border-neutral-100 shadow-sm mb-8">
            <div className="text-center">
              <p className={cn('text-4xl font-bold tabular-nums', results.passed ? 'text-primary-600' : 'text-bark-600')}>
                {results.score}%
              </p>
              <p className="text-[11px] text-neutral-500 font-medium mt-1">Score</p>
            </div>
            <div className="w-px h-12 bg-neutral-100" />
            <div className="text-center">
              <p className="text-4xl font-bold text-neutral-900 tabular-nums">
                {results.earned}<span className="text-neutral-400">/{results.total}</span>
              </p>
              <p className="text-[11px] text-neutral-500 font-medium mt-1">Points</p>
            </div>
          </div>

          {/* Per-question breakdown */}
          <div className="rounded-md bg-neutral-50 border border-neutral-100 p-4 mb-8 text-left max-h-72 overflow-y-auto">
            <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-400 mb-3">Question Breakdown</p>
            <div className="space-y-1.5">
              {orderedQuestions.map((q, i) => {
                const answer = answers.get(q.id)
                const selectedIds = new Set(answer?.selectedOptionIds ?? [])
                const correctIds = new Set((q.options ?? []).filter((o) => o.is_correct).map((o) => o.id))
                const isCorrect = q.question_type === 'short_answer' || (correctIds.size === selectedIds.size && [...correctIds].every((id) => selectedIds.has(id)))
                return (
                  <div key={q.id} className={cn('flex items-center gap-2.5 py-2.5 px-3 rounded-sm', isCorrect ? 'bg-primary-50' : 'bg-white')}>
                    <div className={cn('flex items-center justify-center w-6 h-6 rounded-full shrink-0', isCorrect ? 'bg-moss-100 text-moss-600' : 'bg-error-100 text-error-500')}>
                      {isCorrect ? <Check size={11} /> : <X size={11} />}
                    </div>
                    <p className="text-[13px] text-neutral-700 flex-1 min-w-0 line-clamp-1">Q{i + 1}: {q.question_text}</p>
                    <span className="text-[11px] text-neutral-400 tabular-nums shrink-0 font-bold">
                      {isCorrect ? q.points ?? 1 : 0}/{q.points ?? 1}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-center gap-3">
            {!results.passed && !(maxAttempts > 0 && attempts.length >= maxAttempts) && (
              <Button
                variant="secondary"
                size="md"
                icon={<RotateCcw size={14} />}
                onClick={() => {
                  setShowResults(false); setResults(null); setCurrentIndex(0); setAnswers(new Map()); timerRef.current = 0; autoSubmitRef.current = false
                  if (quiz?.time_limit_minutes) setTimeRemaining(quiz.time_limit_minutes * 60)
                }}
              >
                Try Again{maxAttempts > 0 ? ` (${maxAttempts - attempts.length} left)` : ''}
              </Button>
            )}
            <Button
              variant="primary"
              size="md"
              onClick={() => moduleId ? navigate(`/learn/complete?type=module&id=${moduleId}`) : navigate('/learn')}
            >
              {results.passed ? 'Continue' : 'Back to Learning'}
            </Button>
          </div>
        </motion.div>
      </div>
      </Page>
    )
  }

  /* ── Quiz taking ── */
  return (
    <Page header={<Header title="" back />}>
    <div className="max-w-2xl mx-auto pb-20">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 bg-white border-b border-neutral-100 -mx-4 px-4 py-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-neutral-900 truncate">{quiz.title}</p>
            <p className="text-[11px] text-neutral-500 font-medium">
              Question {currentIndex + 1} of {orderedQuestions.length}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {timeRemaining !== null ? (
              <span className={cn(
                'flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-sm tabular-nums',
                timeRemaining <= 60 ? 'text-error-600 bg-error-50 animate-pulse' : 'text-neutral-500 bg-neutral-50',
              )}>
                <Clock size={11} />
                {formatTime(timeRemaining)}
              </span>
            ) : quiz.time_limit_minutes ? (
              <span className="flex items-center gap-1 text-[11px] font-bold text-neutral-500 bg-neutral-50 px-2 py-1 rounded-sm">
                <Clock size={11} />
                {quiz.time_limit_minutes}m
              </span>
            ) : null}
            <ProgressRing percent={progressPct} size={36} strokeWidth={3.5} />
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-2.5 h-1 rounded-full bg-primary-100 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-moss-500"
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.25 }}
          />
        </div>
      </div>

      {/* ── Question dots ── */}
      <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1 scrollbar-none">
        {orderedQuestions.map((q, i) => {
          const answered = answers.has(q.id)
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => setCurrentIndex(i)}
              className={cn(
                'w-8 h-8 rounded-sm text-[11px] font-bold tabular-nums transition-colors shrink-0',
                i === currentIndex
                  ? 'bg-primary-600 text-white shadow-sm'
                  : answered
                    ? 'bg-moss-100 text-moss-700'
                    : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100',
              )}
            >
              {i + 1}
            </button>
          )
        })}
      </div>

      {/* ── Question ── */}
      <AnimatePresence mode="wait">
        {currentQuestion && (
          <motion.div
            key={currentQuestion.id}
            initial={rm ? {} : { opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={rm ? {} : { opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <QuizQuestionCard question={currentQuestion} onAnswer={handleAnswer} showFeedback />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Navigation ── */}
      <div className="flex items-center justify-between mt-8 gap-3">
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowLeft size={14} />}
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
        >
          Previous
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon={isLastQuestion && allAnswered ? <Target size={14} /> : <ArrowRight size={14} />}
          onClick={handleNext}
          disabled={!answers.has(currentQuestion?.id ?? '')}
          loading={submitQuiz.isPending}
        >
          {isLastQuestion && allAnswered ? 'Submit Quiz' : 'Next'}
        </Button>
      </div>
    </div>
    </Page>
  )
}
