import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import { CircleDot, Save, Settings } from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Toggle } from '@/components/toggle'
import { useToast } from '@/components/toast'
import { useAuth } from '@/hooks/use-auth'
import { useCreateQuiz, useSaveQuizQuestions, type QuizQuestionInput } from '@/hooks/use-admin-development'
import { QuestionBuilder } from '@/components/development/question-builder'
import { SaveSuccessBanner } from '@/components/development/save-success-banner'

export default function AdminCreateQuizPage() {
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const { stagger, fadeUp } = adminVariants(rm)
  const navigate = useNavigate()
  const { user } = useAuth()
  const { toast } = useToast()

  useAdminHeader('Create Quiz')

  const createQuiz = useCreateQuiz()
  const saveQuestions = useSaveQuizQuestions()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [passScore, setPassScore] = useState(70)
  const [randomize, setRandomize] = useState(false)
  const [timeLimit, setTimeLimit] = useState('')
  const [maxAttempts, setMaxAttempts] = useState(0)
  const [questions, setQuestions] = useState<QuizQuestionInput[]>([])
  const [saved, setSaved] = useState<{ id: string } | null>(null)

  const isSaving = createQuiz.isPending || saveQuestions.isPending
  const canSave = title.trim().length > 0

  const handleSave = useCallback(async () => {
    if (!user || !canSave) return
    try {
      const quiz = await createQuiz.mutateAsync({ title: title.trim(), description: description.trim() || undefined, pass_score: passScore, randomize_questions: randomize, time_limit_minutes: timeLimit ? parseInt(timeLimit) : null, max_attempts: maxAttempts, created_by: user.id })
      if (questions.length > 0) await saveQuestions.mutateAsync({ quizId: quiz.id, questions })
      setSaved({ id: quiz.id })
    } catch { toast.error('Failed to create quiz') }
  }, [user, title, description, passScore, randomize, timeLimit, maxAttempts, questions, canSave, createQuiz, saveQuestions, toast])

  const resetForm = () => { setTitle(''); setDescription(''); setPassScore(70); setRandomize(false); setTimeLimit(''); setMaxAttempts(0); setQuestions([]); setSaved(null) }

  if (saved) {
    return (
      <motion.div data-eos-id="src/pages/admin/development/create-quiz.tsx#0" data-eos-v="2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto py-8">
        <SaveSuccessBanner data-eos-id="src/pages/admin/development/create-quiz.tsx#1" show message="Quiz created!" subtitle={`"${title}" is ready. You can now attach it to a module content block.`} editPath={`/admin/development/quizzes/${saved.id}/edit`} onDismiss={resetForm} />
      </motion.div>
    )
  }

  return (
    <motion.div data-eos-id="src/pages/admin/development/create-quiz.tsx#2" variants={stagger} initial="hidden" animate="visible" className="max-w-3xl mx-auto space-y-6">
      <motion.div data-eos-id="src/pages/admin/development/create-quiz.tsx#3" variants={fadeUp} className="rounded-md bg-white shadow-sm p-5 sm:p-6 space-y-4">
        <div data-eos-id="src/pages/admin/development/create-quiz.tsx#4" className="flex items-center gap-2.5 mb-1">
          <div data-eos-id="src/pages/admin/development/create-quiz.tsx#5" className="flex items-center justify-center w-9 h-9 rounded-sm bg-moss-700 shadow-sm">
            <Settings data-eos-id="src/pages/admin/development/create-quiz.tsx#6" size={16} className="text-white" />
          </div>
          <h2 data-eos-id="src/pages/admin/development/create-quiz.tsx#7" className="font-heading text-base font-bold text-neutral-900">Quiz Settings</h2>
        </div>
        <Input data-eos-id="src/pages/admin/development/create-quiz.tsx#8" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Leadership Principles Assessment" required />
        <Input data-eos-id="src/pages/admin/development/create-quiz.tsx#9" type="textarea" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description of what this quiz assesses" rows={2} />
        <div data-eos-id="src/pages/admin/development/create-quiz.tsx#10" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input data-eos-id="src/pages/admin/development/create-quiz.tsx#11" label="Pass Score (%)" type="number" value={String(passScore)} onChange={(e) => setPassScore(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))} />
          <Input data-eos-id="src/pages/admin/development/create-quiz.tsx#12" label="Time Limit (min)" type="number" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} placeholder="No limit" />
          <Input data-eos-id="src/pages/admin/development/create-quiz.tsx#13" label="Max Attempts" type="number" value={String(maxAttempts)} onChange={(e) => setMaxAttempts(Math.max(0, parseInt(e.target.value) || 0))} placeholder="0 = unlimited" />
        </div>
        <Toggle data-eos-id="src/pages/admin/development/create-quiz.tsx#14" label="Randomize question order" checked={randomize} onChange={setRandomize} />
      </motion.div>

      <motion.div data-eos-id="src/pages/admin/development/create-quiz.tsx#15" variants={fadeUp}>
        <h2 data-eos-id="src/pages/admin/development/create-quiz.tsx#16" className="flex items-center gap-2 font-heading text-[13px] font-bold text-neutral-700/60 uppercase tracking-widest mb-3">
          <CircleDot data-eos-id="src/pages/admin/development/create-quiz.tsx#17" size={14} className="text-moss-500" /> Questions
        </h2>
        <QuestionBuilder data-eos-id="src/pages/admin/development/create-quiz.tsx#18" questions={questions} onChange={setQuestions} />
      </motion.div>

      <motion.div data-eos-id="src/pages/admin/development/create-quiz.tsx#19" variants={fadeUp} className="sticky bottom-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 -mb-4 sm:-mb-6 lg:-mb-8 px-4 sm:px-6 lg:px-8 py-3 bg-white/95 backdrop-blur-sm border-t border-neutral-100 flex items-center justify-between gap-3">
        <p data-eos-id="src/pages/admin/development/create-quiz.tsx#20" data-eos-var="q.points" data-eos-var-label="Points" data-eos-var-scope="prop" className="text-[11px] font-semibold text-neutral-400">
          {questions.length} question{questions.length !== 1 ? 's' : ''} · {questions.reduce((sum, q) => sum + (q.points ?? 1), 0)} total points
        </p>
        <div data-eos-id="src/pages/admin/development/create-quiz.tsx#21" className="flex items-center gap-2">
          <Button data-eos-id="src/pages/admin/development/create-quiz.tsx#22" variant="ghost" size="sm" onClick={() => navigate('/admin/development')}>Cancel</Button>
          <Button data-eos-id="src/pages/admin/development/create-quiz.tsx#23" variant="primary" size="sm" icon={<Save data-eos-id="src/pages/admin/development/create-quiz.tsx#24" size={14} />} onClick={handleSave} loading={isSaving} disabled={!canSave}>Save Quiz</Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
