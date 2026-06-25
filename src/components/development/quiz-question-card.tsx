import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, X } from 'lucide-react'
import { Input } from '@/components/input'
import { cn } from '@/lib/cn'
import type { DevQuizQuestion, DevQuizOption } from '@/hooks/use-admin-development'

interface QuizQuestionCardProps {
  question: DevQuizQuestion
  onAnswer: (selectedOptionIds: string[], textResponse?: string) => void
  showFeedback?: boolean
  disabled?: boolean
  className?: string
}

export function QuizQuestionCard({
  question,
  onAnswer,
  showFeedback = false,
  disabled = false,
  className,
}: QuizQuestionCardProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [textInput, setTextInput] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const options = question.options ?? []
  const isChoice = question.question_type === 'multiple_choice' || question.question_type === 'true_false'
  const isMulti = question.question_type === 'multi_select'
  const isText = question.question_type === 'short_answer'

  const handleOptionClick = (optionId: string) => {
    if (disabled || submitted) return

    if (isChoice) {
      // Single select
      setSelectedIds(new Set([optionId]))
    } else if (isMulti) {
      // Toggle
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(optionId)) next.delete(optionId)
        else next.add(optionId)
        return next
      })
    }
  }

  const handleSubmit = () => {
    if (submitted) return
    setSubmitted(true)

    if (isText) {
      onAnswer([], textInput)
    } else {
      onAnswer(Array.from(selectedIds))
    }
  }

  const isCorrectOption = (opt: DevQuizOption) => opt.is_correct
  const isSelectedOption = (opt: DevQuizOption) => selectedIds.has(opt.id)

  const getOptionState = (opt: DevQuizOption): 'default' | 'selected' | 'correct' | 'incorrect' => {
    if (!submitted || !showFeedback) {
      return isSelectedOption(opt) ? 'selected' : 'default'
    }
    if (isSelectedOption(opt) && isCorrectOption(opt)) return 'correct'
    if (isSelectedOption(opt) && !isCorrectOption(opt)) return 'incorrect'
    if (!isSelectedOption(opt) && isCorrectOption(opt)) return 'correct'
    return 'default'
  }

  const canSubmit = isText ? textInput.trim().length > 0 : selectedIds.size > 0

  return (
    <div className={cn('space-y-4', className)}>
      {/* Question text */}
      <div>
        <p className="text-base font-semibold text-neutral-900 leading-relaxed">
          {question.question_text}
        </p>
        {question.image_url && (
          <img
            src={question.image_url}
            alt="Question illustration"
            className="mt-3 rounded-sm max-h-48 object-contain"
          />
        )}
      </div>

      {/* Options */}
      {!isText && (
        <div className="space-y-2">
          {options.map((opt) => {
            const state = getOptionState(opt)
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleOptionClick(opt.id)}
                disabled={disabled || submitted}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-sm text-left text-sm font-medium transition-transform border-2',
                  state === 'default' && 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50',
                  state === 'selected' && 'border-primary-500 bg-primary-50 text-primary-800',
                  state === 'correct' && 'border-moss-400 bg-moss-50 text-moss-800',
                  state === 'incorrect' && 'border-error-300 bg-error-50 text-error-700',
                  (disabled || submitted) && 'cursor-default',
                )}
              >
                {/* Selection indicator */}
                <div
                  className={cn(
                    'flex items-center justify-center w-6 h-6 rounded-full border-2 shrink-0 text-xs',
                    state === 'default' && 'border-neutral-300',
                    state === 'selected' && 'border-primary-500 bg-primary-500 text-white',
                    state === 'correct' && 'border-moss-500 bg-moss-500 text-white',
                    state === 'incorrect' && 'border-error-400 bg-error-400 text-white',
                  )}
                >
                  {state === 'correct' && <Check size={12} />}
                  {state === 'incorrect' && <X size={12} />}
                  {state === 'selected' && <Check size={12} />}
                </div>
                <span className="flex-1">{opt.option_text}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Short answer */}
      {isText && (
        <Input type="textarea" value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder="Type your answer..." disabled={disabled || submitted} rows={4} />
      )}

      {/* Submit button */}
      {!submitted && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || disabled}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-sm text-sm font-semibold transition-transform',
            canSubmit
              ? 'bg-primary-600 text-white hover:bg-primary-700 active:scale-[0.98]'
              : 'bg-neutral-200 text-neutral-400 cursor-not-allowed',
          )}
        >
          Check Answer
        </button>
      )}

      {/* Feedback / explanation */}
      {submitted && showFeedback && question.explanation && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-sm bg-neutral-50 border border-neutral-200 px-4 py-3"
        >
          <p className="text-xs font-semibold text-neutral-500 mb-1">Explanation</p>
          <p className="text-sm text-neutral-700">{question.explanation}</p>
        </motion.div>
      )}
    </div>
  )
}

export default QuizQuestionCard
