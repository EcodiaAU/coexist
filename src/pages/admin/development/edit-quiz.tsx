import { useState, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import { CircleDot, Save, Settings } from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Toggle } from '@/components/toggle'
import { Skeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import { useDevQuiz, useDevQuizQuestions, useUpdateQuiz, useSaveQuizQuestions, type QuizQuestionInput } from '@/hooks/use-admin-development'
import { QuestionBuilder } from '@/components/development/question-builder'
import { SaveSuccessBanner } from '@/components/development/save-success-banner'

export default function AdminEditQuizPage() {
  const { quizId } = useParams<{ quizId: string }>()
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const { stagger, fadeUp } = adminVariants(rm)
  const navigate = useNavigate()
  const { toast } = useToast()
  useAdminHeader('Edit Quiz')

  const { data: quiz, isLoading: quizLoading } = useDevQuiz(quizId)
  const { data: existingQuestions = [], isLoading: questionsLoading } = useDevQuizQuestions(quizId)
  const updateQuiz = useUpdateQuiz()
  const saveQuestions = useSaveQuizQuestions()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [passScore, setPassScore] = useState(70)
  const [randomize, setRandomize] = useState(false)
  const [timeLimit, setTimeLimit] = useState('')
  const [maxAttempts, setMaxAttempts] = useState(0)
  const [questions, setQuestions] = useState<QuizQuestionInput[]>([])
  const [initialized, setInitialized] = useState(false)
  const [saved, setSaved] = useState(false)

  // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing server data into local form state
  useEffect(() => { if (quiz && !initialized) { setTitle(quiz.title); setDescription(quiz.description ?? ''); setPassScore(quiz.pass_score); setRandomize(quiz.randomize_questions); setTimeLimit(quiz.time_limit_minutes ? String(quiz.time_limit_minutes) : ''); setMaxAttempts(quiz.max_attempts) } }, [quiz, initialized])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing server data into local form state
  useEffect(() => { if (existingQuestions.length > 0 && !initialized) { setQuestions(existingQuestions.map((q) => ({ id: q.id, question_type: q.question_type, question_text: q.question_text, explanation: q.explanation, points: q.points, image_url: q.image_url, sort_order: q.sort_order, options: (q.options ?? []).map((o) => ({ id: o.id, option_text: o.option_text, is_correct: o.is_correct, sort_order: o.sort_order })) }))); setInitialized(true) } }, [existingQuestions, initialized])

  const isSaving = updateQuiz.isPending || saveQuestions.isPending

  const handleSave = useCallback(async () => {
    if (!quizId || !title.trim()) return
    try {
      await updateQuiz.mutateAsync({ id: quizId, title: title.trim(), description: description.trim() || null, pass_score: passScore, randomize_questions: randomize, time_limit_minutes: timeLimit ? parseInt(timeLimit) : null, max_attempts: maxAttempts })
      await saveQuestions.mutateAsync({ quizId, questions })
      setSaved(true)
    } catch { toast.error('Failed to update quiz') }
  }, [quizId, title, description, passScore, randomize, timeLimit, maxAttempts, questions, updateQuiz, saveQuestions, toast])

  if (quizLoading || questionsLoading) return <div className="max-w-3xl mx-auto space-y-6 py-4"><Skeleton className="h-10 w-32 rounded-xl" /><Skeleton className="h-48 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /></div>

  if (saved) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto py-8">
        <SaveSuccessBanner show message="Quiz updated!" subtitle={`"${title}" has been saved successfully.`} editPath={`/admin/development/quizzes/${quizId}/edit`} onDismiss={() => setSaved(false)} />
      </motion.div>
    )
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="max-w-3xl mx-auto space-y-6">
      <motion.div variants={fadeUp} className="rounded-2xl bg-white shadow-sm p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-moss-500 to-moss-700 shadow-sm shadow-moss-600/20"><Settings size={16} className="text-white" /></div>
          <h2 className="font-heading text-base font-bold text-neutral-900">Quiz Settings</h2>
        </div>
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <Input type="textarea" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input label="Pass Score (%)" type="number" value={String(passScore)} onChange={(e) => setPassScore(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))} />
          <Input label="Time Limit (min)" type="number" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} placeholder="No limit" />
          <Input label="Max Attempts" type="number" value={String(maxAttempts)} onChange={(e) => setMaxAttempts(Math.max(0, parseInt(e.target.value) || 0))} placeholder="0 = unlimited" />
        </div>
        <Toggle label="Randomize question order" checked={randomize} onChange={setRandomize} />
      </motion.div>

      <motion.div variants={fadeUp}>
        <h2 className="flex items-center gap-2 font-heading text-[13px] font-bold text-neutral-700/60 uppercase tracking-widest mb-3"><CircleDot size={14} className="text-moss-500" /> Questions</h2>
        <QuestionBuilder questions={questions} onChange={setQuestions} />
      </motion.div>

      <motion.div variants={fadeUp} className="sticky bottom-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 -mb-4 sm:-mb-6 lg:-mb-8 px-4 sm:px-6 lg:px-8 py-3 bg-white/95 backdrop-blur-sm border-t border-neutral-100 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold text-neutral-400">{questions.length} question{questions.length !== 1 ? 's' : ''} · {questions.reduce((s, q) => s + (q.points ?? 1), 0)} pts</p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/development')}>Cancel</Button>
          <Button variant="primary" size="sm" icon={<Save size={14} />} onClick={handleSave} loading={isSaving} disabled={!title.trim()}>Save Quiz</Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
