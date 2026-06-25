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
  { type: 'multiple_choice', label: 'Multiple Choice', icon: <CircleDot size={14} /> },
  { type: 'multi_select', label: 'Multi-Select', icon: <CheckSquare size={14} /> },
  { type: 'true_false', label: 'True / False', icon: <ToggleLeft size={14} /> },
  { type: 'short_answer', label: 'Short Answer', icon: <MessageSquare size={14} /> },
]

function questionTypeLabel(type: DevQuestionType) {
  return QUESTION_TYPES.find((qt) => qt.type === type)?.label ?? type
}

function questionTypeIcon(type: DevQuestionType) {
  return QUESTION_TYPES.find((qt) => qt.type === type)?.icon ?? <CircleDot size={14} />
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
    <div className="group rounded-sm border border-white/60 bg-white/80 shadow-sm p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-primary-300">
          <GripVertical size={18} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 text-primary-600 text-xs font-bold tabular-nums">
              {index + 1}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-primary-100 text-primary-600">
              {questionTypeIcon(question.question_type)}
              {questionTypeLabel(question.question_type)}
            </span>
            <span className="text-xs text-primary-400 font-medium">
              {question.points ?? 1} pt{(question.points ?? 1) !== 1 ? 's' : ''}
            </span>
          </div>

          <p className="text-sm text-neutral-900 font-medium">{question.question_text}</p>

          {/* Options preview */}
          {question.options && question.options.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {question.options.map((opt, i) => (
                <span
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
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 mt-2 text-xs text-neutral-500 hover:text-neutral-700 transition-colors"
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Explanation
            </button>
          )}
          <AnimatePresence>
            {expanded && question.explanation && (
              <motion.p
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

        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center justify-center w-8 h-8 rounded-sm text-primary-400 hover:text-primary-600 hover:bg-neutral-100 transition-colors"
          >
            <MessageSquare size={14} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="flex items-center justify-center w-8 h-8 rounded-sm text-error-400 hover:text-error-600 hover:bg-error-100/60 transition-colors"
          >
            <Trash2 size={14} />
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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-sm border-2 border-neutral-200 bg-neutral-50 p-5 space-y-4"
    >
      <p className="text-sm font-semibold text-neutral-900">
        {initial ? 'Edit Question' : 'Add Question'}
      </p>

      {/* Type picker */}
      <div>
        <label className="block text-sm font-medium text-neutral-900 mb-1.5">Question Type</label>
        <div className="flex flex-wrap gap-2">
          {QUESTION_TYPES.map((qt) => (
            <button
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
      <Input type="textarea" label="Question" value={draft.question_text} onChange={(e) => setDraft((d) => ({ ...d, question_text: e.target.value }))} placeholder="Enter your question..." rows={3} />

      {/* Points */}
      <Input
        label="Points"
        type="number"
        value={String(draft.points ?? 1)}
        onChange={(e) => setDraft((d) => ({ ...d, points: Math.max(1, parseInt(e.target.value) || 1) }))}
        className="max-w-[120px]"
      />

      {/* Options (for choice types) */}
      {(needsOptions || isTrueFalse) && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-primary-700">
            Options {draft.question_type === 'multi_select' ? '(select all correct)' : '(select correct)'}
          </label>
          {(draft.options ?? []).map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <button
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
              <Input
                value={opt.option_text}
                onChange={(e) => updateOption(i, { option_text: e.target.value })}
                placeholder={`Option ${i + 1}`}
                className="flex-1"
                disabled={isTrueFalse}
              />
              {!isTrueFalse && (draft.options?.length ?? 0) > 2 && (
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  className="text-error-400 hover:text-error-600 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          {!isTrueFalse && (
            <button
              type="button"
              onClick={addOption}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-500 hover:text-primary-700 transition-colors mt-1"
            >
              <Plus size={12} />
              Add Option
            </button>
          )}
        </div>
      )}

      {/* Explanation */}
      <Input type="textarea" label="Explanation" value={draft.explanation ?? ''} onChange={(e) => setDraft((d) => ({ ...d, explanation: e.target.value || null }))} placeholder="Explain why this is the correct answer..." rows={2} />

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={() => onSave(draft)} disabled={!canSave}>
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
    <div className={cn('space-y-3', className)}>
      <AnimatePresence mode="popLayout">
        {questions.map((q, i) => (
          <motion.div
            key={i}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            {editingIndex === i ? (
              <QuestionForm
                initial={q}
                onSave={(updated) => updateQuestion(i, updated)}
                onCancel={() => setEditingIndex(null)}
              />
            ) : (
              <QuestionCard
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
        <div className="flex flex-col items-center justify-center py-10 rounded-sm border-2 border-dashed border-neutral-200 bg-neutral-50">
          <CircleDot size={28} className="text-primary-300 mb-2" />
          <p className="text-sm font-medium text-neutral-500 mb-1">No questions yet</p>
          <p className="text-xs text-neutral-400 mb-4">Add questions to build your quiz</p>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setIsAdding(true)}>
            Add First Question
          </Button>
        </div>
      )}

      {/* Add question form */}
      <AnimatePresence>
        {isAdding && (
          <QuestionForm
            onSave={addQuestion}
            onCancel={() => setIsAdding(false)}
          />
        )}
      </AnimatePresence>

      {/* Add button */}
      {questions.length > 0 && !isAdding && editingIndex === null && (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-sm border border-dashed border-neutral-300 text-sm font-semibold text-neutral-500 hover:border-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 transition-transform active:scale-[0.98] w-full justify-center"
        >
          <Plus size={15} />
          Add Question
        </button>
      )}
    </div>
  )
}

export default QuestionBuilder
