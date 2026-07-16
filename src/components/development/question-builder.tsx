import { useState } from 'react'
import {
  CircleDot,
  CheckSquare,
  ToggleLeft,
  MessageSquare,
  Trash2,
  Plus,
  GripVertical,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { cn } from '@/lib/cn'
import type { QuizQuestionInput, DevQuestionType } from '@/hooks/use-admin-development'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const QUESTION_TYPES: { type: DevQuestionType; label: string; icon: React.ReactNode }[] = [
  { type: 'multiple_choice', label: 'Multiple Choice', icon: <CircleDot data-eos-id="src/components/development/question-builder.tsx#0" size={14} /> },
  { type: 'multi_select', label: 'Multi-Select', icon: <CheckSquare data-eos-id="src/components/development/question-builder.tsx#1" size={14} /> },
  { type: 'true_false', label: 'True / False', icon: <ToggleLeft data-eos-id="src/components/development/question-builder.tsx#2" size={14} /> },
  { type: 'short_answer', label: 'Short Answer', icon: <MessageSquare data-eos-id="src/components/development/question-builder.tsx#3" size={14} /> },
]

function questionTypeLabel(type: DevQuestionType) {
  return QUESTION_TYPES.find((qt) => qt.type === type)?.label ?? type
}

function questionTypeIcon(type: DevQuestionType) {
  return QUESTION_TYPES.find((qt) => qt.type === type)?.icon ?? <CircleDot data-eos-id="src/components/development/question-builder.tsx#4" size={14} />
}

/* ------------------------------------------------------------------ */
/*  Single question card (display mode)                                */
/* ------------------------------------------------------------------ */

function QuestionCard({
  question,
  index,
  onEdit,
  onRemove,
}: {
  question: QuizQuestionInput
  index: number
  onEdit: () => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div data-eos-id="src/components/development/question-builder.tsx#5" className="group rounded-sm border border-white/60 bg-white/80 shadow-sm p-4">
      <div data-eos-id="src/components/development/question-builder.tsx#6" className="flex items-start gap-3">
        <div data-eos-id="src/components/development/question-builder.tsx#7" className="mt-0.5 text-primary-300">
          <GripVertical data-eos-id="src/components/development/question-builder.tsx#8" size={18} />
        </div>

        <div data-eos-id="src/components/development/question-builder.tsx#9" className="flex-1 min-w-0">
          <div data-eos-id="src/components/development/question-builder.tsx#10" className="flex items-center gap-2 mb-1 flex-wrap">
            <span data-eos-id="src/components/development/question-builder.tsx#11" className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 text-xs font-bold tabular-nums">
              {index + 1}
            </span>
            <span data-eos-id="src/components/development/question-builder.tsx#12" data-eos-var="question.question_type,question.question_type" data-eos-var-label="Question type, Question type" data-eos-var-scope="prop" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-primary-100 text-primary-600">
              {questionTypeIcon(question.question_type)}
              {questionTypeLabel(question.question_type)}
            </span>
            <span data-eos-id="src/components/development/question-builder.tsx#13" data-eos-var="question.points,question.points" data-eos-var-label="Points, Points" data-eos-var-scope="prop" className="text-xs text-primary-400 font-medium">
              {question.points ?? 1} pt{(question.points ?? 1) !== 1 ? 's' : ''}
            </span>
          </div>

          <p data-eos-id="src/components/development/question-builder.tsx#14" data-eos-var="question.question_text" data-eos-var-label="Question text" data-eos-var-scope="prop" className="text-sm text-neutral-900 font-medium">{question.question_text}</p>

          {/* Options preview */}
          {question.options && question.options.length > 0 && (
            <div data-eos-id="src/components/development/question-builder.tsx#15" className="flex flex-wrap gap-1.5 mt-2">
              {question.options.map((opt, i) => (
                <span data-eos-id="src/components/development/question-builder.tsx#16" data-eos-var="opt.is_correct,opt.option_text" data-eos-var-label="Is correct, Option text" data-eos-var-scope="item"
                  key={i}
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs',
                    opt.is_correct
                      ? 'bg-moss-100 text-moss-700 font-semibold'
                      : 'bg-primary-50 text-primary-500',
                  )}
                >
                  {opt.is_correct && '✓ '}
                  {opt.option_text}
                </span>
              ))}
            </div>
          )}

          {/* Explanation toggle */}
          {question.explanation && (
            <button data-eos-id="src/components/development/question-builder.tsx#17"
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 mt-2 text-xs text-neutral-500 hover:text-neutral-700 transition-colors"
            >
              {expanded ? <ChevronUp data-eos-id="src/components/development/question-builder.tsx#18" size={12} /> : <ChevronDown data-eos-id="src/components/development/question-builder.tsx#19" size={12} />}
              Explanation
            </button>
          )}
          <AnimatePresence data-eos-id="src/components/development/question-builder.tsx#20">
            {expanded && question.explanation && (
              <motion.p data-eos-id="src/components/development/question-builder.tsx#21" data-eos-var="question.explanation" data-eos-var-label="Explanation" data-eos-var-scope="prop"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-xs text-neutral-500 mt-1 pl-2 border-l-2 border-neutral-200"
              >
                {question.explanation}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <div data-eos-id="src/components/development/question-builder.tsx#22" className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button data-eos-id="src/components/development/question-builder.tsx#23"
            type="button"
            onClick={onEdit}
            className="flex items-center justify-center w-8 h-8 rounded-sm text-primary-400 hover:text-primary-600 hover:bg-neutral-100 transition-colors"
          >
            <MessageSquare data-eos-id="src/components/development/question-builder.tsx#24" size={14} />
          </button>
          <button data-eos-id="src/components/development/question-builder.tsx#25"
            type="button"
            onClick={onRemove}
            className="flex items-center justify-center w-8 h-8 rounded-sm text-error-400 hover:text-error-600 hover:bg-error-100/60 transition-colors"
          >
            <Trash2 data-eos-id="src/components/development/question-builder.tsx#26" size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Add / edit question form                                           */
/* ------------------------------------------------------------------ */

function QuestionForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: QuizQuestionInput
  onSave: (q: QuizQuestionInput) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<QuizQuestionInput>(
    initial ?? {
      question_type: 'multiple_choice',
      question_text: '',
      explanation: null,
      points: 1,
      sort_order: 0,
      options: [
        { option_text: '', is_correct: true, sort_order: 0 },
        { option_text: '', is_correct: false, sort_order: 1 },
      ],
    },
  )

  const needsOptions = draft.question_type === 'multiple_choice' || draft.question_type === 'multi_select'
  const isTrueFalse = draft.question_type === 'true_false'

  // Auto-set true/false options when switching to that type
  const setType = (type: DevQuestionType) => {
    const update: Partial<QuizQuestionInput> = { question_type: type }
    if (type === 'true_false') {
      update.options = [
        { option_text: 'True', is_correct: true, sort_order: 0 },
        { option_text: 'False', is_correct: false, sort_order: 1 },
      ]
    } else if (type === 'short_answer') {
      update.options = []
    } else if (!draft.options || draft.options.length === 0) {
      update.options = [
        { option_text: '', is_correct: true, sort_order: 0 },
        { option_text: '', is_correct: false, sort_order: 1 },
      ]
    }
    setDraft((d) => ({ ...d, ...update }))
  }

  const updateOption = (index: number, changes: Partial<NonNullable<typeof draft.options>[0]>) => {
    const opts = [...(draft.options ?? [])]
    opts[index] = { ...opts[index], ...changes }

    // For multiple_choice + true_false: only one correct answer
    if (changes.is_correct && changes.is_correct === true && draft.question_type !== 'multi_select') {
      opts.forEach((o, i) => {
        if (i !== index) o.is_correct = false
      })
    }

    setDraft((d) => ({ ...d, options: opts }))
  }

  const addOption = () => {
    setDraft((d) => ({
      ...d,
      options: [
        ...(d.options ?? []),
        { option_text: '', is_correct: false, sort_order: (d.options?.length ?? 0) },
      ],
    }))
  }

  const removeOption = (index: number) => {
    setDraft((d) => ({
      ...d,
      options: (d.options ?? []).filter((_, i) => i !== index).map((o, i) => ({ ...o, sort_order: i })),
    }))
  }

  const canSave = draft.question_text.trim().length > 0

  return (
    <motion.div data-eos-id="src/components/development/question-builder.tsx#27"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-sm border-2 border-neutral-200 bg-neutral-50 p-5 space-y-4"
    >
      <p data-eos-id="src/components/development/question-builder.tsx#28" className="text-sm font-semibold text-neutral-900">
        {initial ? 'Edit Question' : 'Add Question'}
      </p>

      {/* Type picker */}
      <div data-eos-id="src/components/development/question-builder.tsx#29">
        <label data-eos-id="src/components/development/question-builder.tsx#30" className="block text-sm font-medium text-neutral-900 mb-1.5">Question Type</label>
        <div data-eos-id="src/components/development/question-builder.tsx#31" className="flex flex-wrap gap-2">
          {QUESTION_TYPES.map((qt) => (
            <button data-eos-id="src/components/development/question-builder.tsx#32" data-eos-var="qt.icon,qt.label" data-eos-var-label="Icon, Label" data-eos-var-scope="item"
              key={qt.type}
              type="button"
              onClick={() => setType(qt.type)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold transition-colors',
                draft.question_type === qt.type
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-primary-500 hover:bg-primary-100',
              )}
            >
              {qt.icon}
              {qt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Question text */}
      <Input data-eos-id="src/components/development/question-builder.tsx#33" type="textarea" label="Question" value={draft.question_text} onChange={(e) => setDraft((d) => ({ ...d, question_text: e.target.value }))} placeholder="Enter your question..." rows={3} />

      {/* Points */}
      <Input data-eos-id="src/components/development/question-builder.tsx#34"
        label="Points"
        type="number"
        value={String(draft.points ?? 1)}
        onChange={(e) => setDraft((d) => ({ ...d, points: Math.max(1, parseInt(e.target.value) || 1) }))}
        className="max-w-[120px]"
      />

      {/* Options (for choice types) */}
      {(needsOptions || isTrueFalse) && (
        <div data-eos-id="src/components/development/question-builder.tsx#35" className="space-y-2">
          <label data-eos-id="src/components/development/question-builder.tsx#36" data-eos-var="draft.question_type" data-eos-var-label="Question type" data-eos-var-scope="prop" className="block text-sm font-medium text-primary-700">
            Options {draft.question_type === 'multi_select' ? '(select all correct)' : '(select correct)'}
          </label>
          {(draft.options ?? []).map((opt, i) => (
            <div data-eos-id="src/components/development/question-builder.tsx#37" key={i} className="flex items-center gap-2">
              <button data-eos-id="src/components/development/question-builder.tsx#38" data-eos-var="opt.is_correct" data-eos-var-label="Is correct" data-eos-var-scope="item"
                type="button"
                onClick={() => updateOption(i, { is_correct: !opt.is_correct })}
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-sm border-2 transition-colors shrink-0',
                  opt.is_correct
                    ? 'border-moss-500 bg-moss-100 text-moss-600'
                    : 'border-neutral-200 bg-white text-neutral-400 hover:border-neutral-300',
                )}
              >
                {opt.is_correct && '✓'}
              </button>
              <Input data-eos-id="src/components/development/question-builder.tsx#39"
                value={opt.option_text}
                onChange={(e) => updateOption(i, { option_text: e.target.value })}
                placeholder={`Option ${i + 1}`}
                className="flex-1"
                disabled={isTrueFalse}
              />
              {!isTrueFalse && (draft.options?.length ?? 0) > 2 && (
                <button data-eos-id="src/components/development/question-builder.tsx#40"
                  type="button"
                  onClick={() => removeOption(i)}
                  className="text-error-400 hover:text-error-600 transition-colors"
                >
                  <Trash2 data-eos-id="src/components/development/question-builder.tsx#41" size={14} />
                </button>
              )}
            </div>
          ))}
          {!isTrueFalse && (
            <button data-eos-id="src/components/development/question-builder.tsx#42"
              type="button"
              onClick={addOption}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-500 hover:text-primary-700 transition-colors mt-1"
            >
              <Plus data-eos-id="src/components/development/question-builder.tsx#43" size={12} />
              Add Option
            </button>
          )}
        </div>
      )}

      {/* Explanation */}
      <Input data-eos-id="src/components/development/question-builder.tsx#44" type="textarea" label="Explanation" value={draft.explanation ?? ''} onChange={(e) => setDraft((d) => ({ ...d, explanation: e.target.value || null }))} placeholder="Explain why this is the correct answer..." rows={2} />

      {/* Actions */}
      <div data-eos-id="src/components/development/question-builder.tsx#45" className="flex justify-end gap-2 pt-2">
        <Button data-eos-id="src/components/development/question-builder.tsx#46" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button data-eos-id="src/components/development/question-builder.tsx#47" variant="primary" size="sm" onClick={() => onSave(draft)} disabled={!canSave}>
          {initial ? 'Update Question' : 'Add Question'}
        </Button>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main question builder                                              */
/* ------------------------------------------------------------------ */

interface QuestionBuilderProps {
  questions: QuizQuestionInput[]
  onChange: (questions: QuizQuestionInput[]) => void
  className?: string
}

export function QuestionBuilder({ questions, onChange, className }: QuestionBuilderProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [isAdding, setIsAdding] = useState(false)

  const addQuestion = (q: QuizQuestionInput) => {
    onChange([...questions, { ...q, sort_order: questions.length }])
    setIsAdding(false)
  }

  const updateQuestion = (index: number, q: QuizQuestionInput) => {
    const updated = [...questions]
    updated[index] = { ...q, sort_order: index }
    onChange(updated)
    setEditingIndex(null)
  }

  const removeQuestion = (index: number) => {
    onChange(
      questions.filter((_, i) => i !== index).map((q, i) => ({ ...q, sort_order: i })),
    )
    if (editingIndex === index) setEditingIndex(null)
  }

  return (
    <div data-eos-id="src/components/development/question-builder.tsx#48" className={cn('space-y-3', className)}>
      <AnimatePresence data-eos-id="src/components/development/question-builder.tsx#49" mode="popLayout">
        {questions.map((q, i) => (
          <motion.div data-eos-id="src/components/development/question-builder.tsx#50"
            key={i}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            {editingIndex === i ? (
              <QuestionForm data-eos-id="src/components/development/question-builder.tsx#51"
                initial={q}
                onSave={(updated) => updateQuestion(i, updated)}
                onCancel={() => setEditingIndex(null)}
              />
            ) : (
              <QuestionCard data-eos-id="src/components/development/question-builder.tsx#52"
                question={q}
                index={i}
                onEdit={() => setEditingIndex(i)}
                onRemove={() => removeQuestion(i)}
              />
            )}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Empty state */}
      {questions.length === 0 && !isAdding && (
        <div data-eos-id="src/components/development/question-builder.tsx#53" className="flex flex-col items-center justify-center py-10 rounded-sm border-2 border-dashed border-neutral-200 bg-neutral-50">
          <CircleDot data-eos-id="src/components/development/question-builder.tsx#54" size={28} className="text-primary-300 mb-2" />
          <p data-eos-id="src/components/development/question-builder.tsx#55" className="text-sm font-medium text-neutral-500 mb-1">No questions yet</p>
          <p data-eos-id="src/components/development/question-builder.tsx#56" className="text-xs text-neutral-400 mb-4">Add questions to build your quiz</p>
          <Button data-eos-id="src/components/development/question-builder.tsx#57" variant="primary" size="sm" icon={<Plus data-eos-id="src/components/development/question-builder.tsx#58" size={14} />} onClick={() => setIsAdding(true)}>
            Add First Question
          </Button>
        </div>
      )}

      {/* Add question form */}
      <AnimatePresence data-eos-id="src/components/development/question-builder.tsx#59">
        {isAdding && (
          <QuestionForm data-eos-id="src/components/development/question-builder.tsx#60"
            onSave={addQuestion}
            onCancel={() => setIsAdding(false)}
          />
        )}
      </AnimatePresence>

      {/* Add button */}
      {questions.length > 0 && !isAdding && editingIndex === null && (
        <button data-eos-id="src/components/development/question-builder.tsx#61"
          type="button"
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-sm border border-dashed border-neutral-300 text-sm font-semibold text-neutral-500 hover:border-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 transition-transform active:scale-[0.98] w-full justify-center"
        >
          <Plus data-eos-id="src/components/development/question-builder.tsx#62" size={15} />
          Add Question
        </button>
      )}
    </div>
  )
}

export default QuestionBuilder
