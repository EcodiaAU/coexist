import { useState, useEffect } from 'react'
import { Plus, Trash2, BarChart3 } from 'lucide-react'
import { BottomSheet } from '@/components/bottom-sheet'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Checkbox } from '@/components/checkbox'

interface CreatePollSheetProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: {
    question: string
    options: string[]
    allowMultiple: boolean
    anonymous: boolean
  }) => void
  loading?: boolean
}

export function CreatePollSheet({ open, onClose, onSubmit, loading }: CreatePollSheetProps) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [anonymous, setAnonymous] = useState(false)

  const canSubmit = question.trim().length > 0 && options.filter((o) => o.trim()).length >= 2

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit({
      question: question.trim(),
      options: options.filter((o) => o.trim()).map((o) => o.trim()),
      allowMultiple,
      anonymous,
    })
    // Close sheet; form resets when sheet re-opens (avoids data loss if parent mutation fails)
    onClose()
  }

  // Reset form fields when the sheet closes
  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setQuestion('')
        setOptions(['', ''])
        setAllowMultiple(false)
        setAnonymous(false)
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [open])

  const addOption = () => {
    if (options.length >= 8) return
    setOptions([...options, ''])
  }

  const removeOption = (index: number) => {
    if (options.length <= 2) return
    setOptions(options.filter((_, i) => i !== index))
  }

  return (
    <BottomSheet data-eos-id="src/components/create-poll-sheet.tsx#0" open={open} onClose={onClose}>
      <div data-eos-id="src/components/create-poll-sheet.tsx#1" className="pb-4">
        {/* Header */}
        <div data-eos-id="src/components/create-poll-sheet.tsx#2" className="flex items-center gap-2.5 mb-4">
          <div data-eos-id="src/components/create-poll-sheet.tsx#3" className="flex h-10 w-10 items-center justify-center rounded-sm bg-primary-100 text-primary-600">
            <BarChart3 data-eos-id="src/components/create-poll-sheet.tsx#4" size={20} />
          </div>
          <div data-eos-id="src/components/create-poll-sheet.tsx#5">
            <h3 data-eos-id="src/components/create-poll-sheet.tsx#6" className="text-base font-bold text-neutral-900">Create Poll</h3>
            <p data-eos-id="src/components/create-poll-sheet.tsx#7" className="text-xs text-neutral-500">Ask your collective a question</p>
          </div>
        </div>

        {/* Question */}
        <div data-eos-id="src/components/create-poll-sheet.tsx#8" className="mb-4">
          <Input data-eos-id="src/components/create-poll-sheet.tsx#9"
            label="Question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What would you like to ask?"
            maxLength={200}
          />
        </div>

        {/* Options */}
        <div data-eos-id="src/components/create-poll-sheet.tsx#10" className="mb-4">
          <p data-eos-id="src/components/create-poll-sheet.tsx#11" className="text-xs font-semibold text-neutral-900 mb-1.5">
            Options (min 2, max 8)
          </p>
          <div data-eos-id="src/components/create-poll-sheet.tsx#12" className="space-y-2">
            {options.map((opt, i) => (
              <div data-eos-id="src/components/create-poll-sheet.tsx#13" key={i} className="flex items-center gap-2">
                <Input data-eos-id="src/components/create-poll-sheet.tsx#14"
                  value={opt}
                  onChange={(e) => {
                    const newOpts = [...options]
                    newOpts[i] = e.target.value
                    setOptions(newOpts)
                  }}
                  placeholder={`Option ${i + 1}`}
                  maxLength={100}
                  className="flex-1"
                />
                {options.length > 2 && (
                  <button data-eos-id="src/components/create-poll-sheet.tsx#15"
                    type="button"
                    onClick={() => removeOption(i)}
                    className="flex items-center justify-center min-h-11 min-w-11 rounded-full text-error-400 hover:bg-error-50 active:scale-[0.98] transition-transform duration-150 cursor-pointer select-none"
                    aria-label={`Remove option ${i + 1}`}
                  >
                    <Trash2 data-eos-id="src/components/create-poll-sheet.tsx#16" size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {options.length < 8 && (
            <button data-eos-id="src/components/create-poll-sheet.tsx#17"
              type="button"
              onClick={addOption}
              className="flex items-center gap-1.5 mt-2 text-xs font-semibold text-primary-500 hover:text-primary-700 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none min-h-11 px-1"
            >
              <Plus data-eos-id="src/components/create-poll-sheet.tsx#18" size={14} />
              Add option
            </button>
          )}
        </div>

        {/* Toggles */}
        <div data-eos-id="src/components/create-poll-sheet.tsx#19" className="space-y-3 mb-5">
          <Checkbox data-eos-id="src/components/create-poll-sheet.tsx#20" checked={allowMultiple} onChange={setAllowMultiple} label="Allow multiple votes" />
          <Checkbox data-eos-id="src/components/create-poll-sheet.tsx#21" checked={anonymous} onChange={setAnonymous} label="Anonymous voting" />
        </div>

        {/* Submit */}
        <Button data-eos-id="src/components/create-poll-sheet.tsx#22"
          variant="primary"
          size="lg"
          fullWidth
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          loading={loading}
        >
          Post Poll
        </Button>
      </div>
    </BottomSheet>
  )
}
