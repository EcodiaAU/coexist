import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'
import type { EventTicketQuestion, TicketAnswers } from '@/hooks/use-event-ticket-questions'

interface Props {
  open: boolean
  questions: EventTicketQuestion[]
  submitting?: boolean
  onClose: () => void
  onSubmit: (answers: TicketAnswers) => void
}

function isBlank(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

/**
 * Collects answers to an event's custom ticket questions before checkout.
 * Mirrors CampoutRequirementsModal (portal overlay, blocking). Required
 * questions must be answered before Continue enables. The answers object is
 * keyed by question id and sent to the checkout edge function, which persists
 * it on the ticket (and re-validates required server-side).
 */
export function TicketQuestionsModal({ open, questions, submitting, onClose, onSubmit }: Props) {
  const [answers, setAnswers] = useState<TicketAnswers>({})

  const missingRequired = useMemo(
    () => questions.some((q) => q.required && isBlank(answers[q.id])),
    [questions, answers],
  )

  if (!open) return null

  const set = (id: string, value: TicketAnswers[string]) => setAnswers((a) => ({ ...a, [id]: value }))
  const toggleMulti = (id: string, opt: string) => {
    const cur = Array.isArray(answers[id]) ? (answers[id] as string[]) : []
    set(id, cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt])
  }

  return createPortal(
    <div data-eos-id="src/components/ticket-questions-modal.tsx#0" data-eos-v="2" className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div data-eos-id="src/components/ticket-questions-modal.tsx#1" className="fixed inset-0 bg-black/60" aria-hidden="true" onClick={submitting ? undefined : onClose} />
      <div data-eos-id="src/components/ticket-questions-modal.tsx#2"
        role="dialog"
        aria-modal="true"
        aria-label="A few questions before you book"
        className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[85vh] overflow-y-auto"
      >
        <div data-eos-id="src/components/ticket-questions-modal.tsx#3" className="px-5 pt-5 pb-3">
          <h2 data-eos-id="src/components/ticket-questions-modal.tsx#4" className="text-base font-semibold text-neutral-900">A few questions before you book</h2>
          <p data-eos-id="src/components/ticket-questions-modal.tsx#5" className="text-xs text-neutral-500 mt-0.5">The organiser needs these for this event.</p>
        </div>

        <div data-eos-id="src/components/ticket-questions-modal.tsx#6" className="px-5 pb-4 space-y-4">
          {questions.map((q) => (
            <div data-eos-id="src/components/ticket-questions-modal.tsx#7" key={q.id} className="space-y-1.5">
              <label data-eos-id="src/components/ticket-questions-modal.tsx#8" data-eos-var="q.prompt" data-eos-var-label="Prompt" data-eos-var-scope="item" className="block text-sm font-medium text-neutral-800">
                {q.prompt}
                {q.required && <span data-eos-id="src/components/ticket-questions-modal.tsx#9" className="text-error-600 ml-0.5">*</span>}
              </label>
              {q.help_text && <p data-eos-id="src/components/ticket-questions-modal.tsx#10" data-eos-var="q.help_text" data-eos-var-label="Help text" data-eos-var-scope="item" className="text-xs text-neutral-500">{q.help_text}</p>}

              {q.question_type === 'short_text' && (
                <input data-eos-id="src/components/ticket-questions-modal.tsx#11"
                  type="text"
                  value={(answers[q.id] as string) ?? ''}
                  onChange={(e) => set(q.id, e.target.value)}
                  className="w-full h-10 px-3 rounded-sm bg-surface-3 text-[16px] text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              )}
              {q.question_type === 'long_text' && (
                <textarea data-eos-id="src/components/ticket-questions-modal.tsx#12"
                  rows={3}
                  value={(answers[q.id] as string) ?? ''}
                  onChange={(e) => set(q.id, e.target.value)}
                  className="w-full px-3 py-2 rounded-sm bg-surface-3 text-[16px] text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-400"
                />
              )}
              {q.question_type === 'boolean' && (
                <div data-eos-id="src/components/ticket-questions-modal.tsx#13" className="flex gap-2">
                  {['Yes', 'No'].map((opt) => {
                    const val = opt === 'Yes'
                    const active = answers[q.id] === val
                    return (
                      <button data-eos-id="src/components/ticket-questions-modal.tsx#14"
                        key={opt}
                        type="button"
                        onClick={() => set(q.id, val)}
                        className={`flex-1 h-10 rounded-sm text-sm font-semibold transition-colors ${active ? 'bg-primary-600 text-white' : 'bg-surface-3 text-neutral-700'}`}
                      >
                        {opt}
                      </button>
                    )
                  })}
                </div>
              )}
              {q.question_type === 'single_select' && (
                <div data-eos-id="src/components/ticket-questions-modal.tsx#15" className="flex flex-wrap gap-2">
                  {q.options.map((opt) => {
                    const active = answers[q.id] === opt
                    return (
                      <button data-eos-id="src/components/ticket-questions-modal.tsx#16"
                        key={opt}
                        type="button"
                        onClick={() => set(q.id, opt)}
                        className={`px-3 h-9 rounded-full text-sm font-medium transition-colors ${active ? 'bg-primary-600 text-white' : 'bg-surface-3 text-neutral-700'}`}
                      >
                        {opt}
                      </button>
                    )
                  })}
                </div>
              )}
              {q.question_type === 'multi_select' && (
                <div data-eos-id="src/components/ticket-questions-modal.tsx#17" className="flex flex-wrap gap-2">
                  {q.options.map((opt) => {
                    const active = Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt)
                    return (
                      <button data-eos-id="src/components/ticket-questions-modal.tsx#18"
                        key={opt}
                        type="button"
                        onClick={() => toggleMulti(q.id, opt)}
                        className={`px-3 h-9 rounded-full text-sm font-medium transition-colors ${active ? 'bg-primary-600 text-white' : 'bg-surface-3 text-neutral-700'}`}
                      >
                        {opt}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <div data-eos-id="src/components/ticket-questions-modal.tsx#19" className="sticky bottom-0 bg-white border-t border-neutral-100 px-5 py-3 flex gap-2">
          <button data-eos-id="src/components/ticket-questions-modal.tsx#20"
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 h-11 rounded-full text-sm font-semibold text-neutral-700 bg-neutral-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button data-eos-id="src/components/ticket-questions-modal.tsx#21"
            type="button"
            onClick={() => onSubmit(answers)}
            disabled={missingRequired || submitting}
            className="flex-1 h-11 rounded-full text-sm font-semibold text-white bg-primary-600 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 data-eos-id="src/components/ticket-questions-modal.tsx#22" size={15} className="animate-spin" />}
            Continue to payment
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
