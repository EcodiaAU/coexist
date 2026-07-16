import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams, useParams } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
    Plus,
    Trash2,
    ClipboardList,
    Star,
    MessageSquare,
    CircleDot,
    ToggleLeft,
    Check,
    UserCircle, Hash,
    Calendar,
    Mail,
    Phone, ChevronDown,
    ChevronUp,
    X,
    AlertCircle,
    Pencil,
    ListChecks,
    Sliders, Eye,
    BarChart3, Send
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAdminHeader } from '@/components/admin-layout'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Dropdown } from '@/components/dropdown'
import { Toggle } from '@/components/toggle'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { ACTIVITY_TYPE_OPTIONS, ACTIVITY_TYPE_LABELS } from '@/hooks/use-events'
import { useImpactMetricDefs } from '@/hooks/use-impact-metric-defs'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type QuestionType =
  | 'multiple_choice'
  | 'checkbox'       // multi-select
  | 'rating'
  | 'scale'          // 1-10 or custom range
  | 'free_text'
  | 'yes_no'
  | 'dropdown'
  | 'number'
  | 'date'
  | 'email'
  | 'phone'
  | 'profile_autofill'

interface SurveyQuestion {
  id: string
  type: QuestionType
  text: string
  description?: string
  options?: string[]
  allow_other?: boolean
  required?: boolean
  profile_field?: string
  placeholder?: string
  // Scale/rating options
  min_value?: number
  max_value?: number
  min_label?: string
  max_label?: string
  // Rating config
  star_count?: number // 3, 5, 7, or 10
  // Number constraints
  number_min?: number
  number_max?: number
  number_step?: number
  // Text constraints
  text_min_length?: number
  text_max_length?: number
  text_multiline?: boolean
  // Date constraints
  date_min?: string
  date_max?: string
  // Impact metric mapping (number questions only)
  impact_metric?: string
}

const PROFILE_FIELD_OPTIONS = [
  { value: 'display_name', label: 'Display Name' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'age', label: 'Age' },
  { value: 'date_of_birth', label: 'Date of Birth' },
  { value: 'gender', label: 'Gender' },
  { value: 'pronouns', label: 'Pronouns' },
  { value: 'location', label: 'Location' },
  { value: 'postcode', label: 'Postcode' },
  { value: 'instagram_handle', label: 'Instagram Handle' },
  { value: 'bio', label: 'Bio' },
  { value: 'membership_level', label: 'Membership Level' },
  { value: 'interests', label: 'Interests' },
  { value: 'accessibility_requirements', label: 'Accessibility Requirements' },
  { value: 'emergency_contact_name', label: 'Emergency Contact Name' },
  { value: 'emergency_contact_phone', label: 'Emergency Contact Phone' },
  { value: 'collective.name', label: 'Collective  Name' },
  { value: 'collective.state', label: 'Collective  State' },
  { value: 'collective.region', label: 'Collective  Region' },
  { value: 'collective.role', label: 'Collective  Role' },
]

interface SurveyTemplate {
  name: string
  description: string
  questions: SurveyQuestion[]
}

const TEMPLATES: SurveyTemplate[] = [
  {
    name: 'Post-Event Satisfaction',
    description: 'Gather feedback after each event',
    questions: [
      { id: '1', type: 'rating', text: 'How would you rate this event overall?', required: true },
      { id: '2', type: 'yes_no', text: 'Would you attend a similar event again?', required: true },
      { id: '3', type: 'multiple_choice', text: 'What was the best part?', options: ['Activities', 'People', 'Location', 'Impact'], allow_other: true, required: true },
      { id: '4', type: 'free_text', text: 'Any suggestions for improvement?', description: 'Share anything that could make future events even better' },
    ],
  },
  {
    name: 'New Member Welcome',
    description: 'Welcome survey for new members',
    questions: [
      { id: '1', type: 'multiple_choice', text: 'How did you hear about Co-Exist?', options: ['Social media', 'Friend', 'Event', 'School/Uni'], allow_other: true, required: true },
      { id: '2', type: 'rating', text: 'How easy was the sign-up process?', required: true },
      { id: '3', type: 'checkbox', text: 'What interests you most?', description: 'Select all that apply', options: ['Tree planting', 'Beach cleanup', 'Wildlife', 'Community', 'Education'], allow_other: true },
      { id: '4', type: 'free_text', text: 'Anything else you\'d like us to know?' },
    ],
  },
  {
    name: 'Annual Feedback',
    description: 'Yearly membership feedback survey',
    questions: [
      { id: '1', type: 'scale', text: 'Overall satisfaction with Co-Exist this year?', min_value: 1, max_value: 10, min_label: 'Very unsatisfied', max_label: 'Extremely satisfied', required: true },
      { id: '2', type: 'rating', text: 'How well does your collective communicate?', required: true },
      { id: '3', type: 'yes_no', text: 'Do you feel your volunteering made an impact?', required: true },
      { id: '4', type: 'checkbox', text: 'What should we focus on next year?', description: 'Select all that apply', options: ['More events', 'Better communication', 'More locations', 'Partnerships', 'Education'], allow_other: true },
      { id: '5', type: 'free_text', text: 'Share your favourite memory from this year' },
    ],
  },
]

/* ------------------------------------------------------------------ */
/*  Question type config                                               */
/* ------------------------------------------------------------------ */

const QUESTION_TYPES: { value: QuestionType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'multiple_choice', label: 'Multiple Choice', icon: <CircleDot data-eos-id="src/pages/admin/create-survey.tsx#0" size={14} />, description: 'Single select from a list' },
  { value: 'checkbox', label: 'Checkboxes', icon: <ListChecks data-eos-id="src/pages/admin/create-survey.tsx#1" size={14} />, description: 'Multi-select from a list' },
  { value: 'dropdown', label: 'Dropdown', icon: <ChevronDown data-eos-id="src/pages/admin/create-survey.tsx#2" size={14} />, description: 'Select from a dropdown menu' },
  { value: 'rating', label: 'Rating (1–5 stars)', icon: <Star data-eos-id="src/pages/admin/create-survey.tsx#3" size={14} />, description: '5-star rating scale' },
  { value: 'scale', label: 'Linear Scale', icon: <Sliders data-eos-id="src/pages/admin/create-survey.tsx#4" size={14} />, description: 'Numeric range (e.g. 1–10)' },
  { value: 'free_text', label: 'Free Text', icon: <MessageSquare data-eos-id="src/pages/admin/create-survey.tsx#5" size={14} />, description: 'Open-ended text response' },
  { value: 'yes_no', label: 'Yes / No', icon: <ToggleLeft data-eos-id="src/pages/admin/create-survey.tsx#6" size={14} />, description: 'Simple yes or no' },
  { value: 'number', label: 'Number', icon: <Hash data-eos-id="src/pages/admin/create-survey.tsx#7" size={14} />, description: 'Numeric input' },
  { value: 'date', label: 'Date', icon: <Calendar data-eos-id="src/pages/admin/create-survey.tsx#8" size={14} />, description: 'Date picker' },
  { value: 'email', label: 'Email', icon: <Mail data-eos-id="src/pages/admin/create-survey.tsx#9" size={14} />, description: 'Email address input' },
  { value: 'phone', label: 'Phone', icon: <Phone data-eos-id="src/pages/admin/create-survey.tsx#10" size={14} />, description: 'Phone number input' },
  { value: 'profile_autofill', label: 'Profile Auto-fill', icon: <UserCircle data-eos-id="src/pages/admin/create-survey.tsx#11" size={14} />, description: 'Pre-filled from user profile' },
]

const questionTypeIcons: Record<string, React.ReactNode> = Object.fromEntries(
  QUESTION_TYPES.map((t) => [t.value, t.icon]),
)

const questionTypeLabels: Record<string, string> = Object.fromEntries(
  QUESTION_TYPES.map((t) => [t.value, t.label]),
)

const HAS_OPTIONS: QuestionType[] = ['multiple_choice', 'checkbox', 'dropdown']
const HAS_SCALE: QuestionType[] = ['scale']

/* ------------------------------------------------------------------ */
/*  Option Chip Builder                                                */
/* ------------------------------------------------------------------ */

function OptionChipBuilder({
  options,
  onChange,
  allowOther,
}: {
  options: string[]
  onChange: (opts: string[]) => void
  allowOther?: boolean
}) {
  const [draft, setDraft] = useState('')
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  const addOption = () => {
    const trimmed = draft.trim()
    if (!trimmed || options.includes(trimmed)) return
    onChange([...options, trimmed])
    setDraft('')
  }

  const removeOption = (idx: number) => {
    onChange(options.filter((_, i) => i !== idx))
    if (editingIdx === idx) setEditingIdx(null)
  }

  const startEditing = (idx: number) => {
    setEditingIdx(idx)
    setEditValue(options[idx])
    // Focus happens via useEffect
  }

  const commitEdit = () => {
    if (editingIdx === null) return
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== options[editingIdx]) {
      // Check for duplicates
      if (!options.some((o, i) => i !== editingIdx && o === trimmed)) {
        onChange(options.map((o, i) => (i === editingIdx ? trimmed : o)))
      }
    }
    setEditingIdx(null)
    setEditValue('')
  }

  const moveOption = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= options.length) return
    const next = [...options]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(next)
  }

  useEffect(() => {
    if (editingIdx !== null && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingIdx])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addOption()
    }
    if (e.key === 'Backspace' && !draft && options.length > 0) {
      removeOption(options.length - 1)
    }
  }

  return (
    <div data-eos-id="src/pages/admin/create-survey.tsx#12">
      <label data-eos-id="src/pages/admin/create-survey.tsx#13" className="block text-xs font-medium text-neutral-400 mb-1.5">Options</label>

      {/* Option list  each on its own row for easy editing */}
      {options.length > 0 && (
        <div data-eos-id="src/pages/admin/create-survey.tsx#14" className="space-y-1.5 mb-2">
          <AnimatePresence data-eos-id="src/pages/admin/create-survey.tsx#15" mode="popLayout">
            {options.map((opt, i) => (
              <motion.div data-eos-id="src/pages/admin/create-survey.tsx#16"
                key={`opt-${i}-${opt}`}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-1.5 group"
              >
                {/* Option number */}
                <span data-eos-id="src/pages/admin/create-survey.tsx#17" className="flex items-center justify-center w-5 h-5 rounded-md bg-neutral-50 text-[10px] font-bold text-neutral-400 shrink-0">
                  {i + 1}
                </span>

                {editingIdx === i ? (
                  <input data-eos-id="src/pages/admin/create-survey.tsx#18"
                    ref={editInputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
                      if (e.key === 'Escape') { setEditingIdx(null) }
                    }}
                    onBlur={commitEdit}
                    className="flex-1 min-w-0 h-9 px-2.5 rounded-sm bg-white border-2 border-primary-400 text-sm text-neutral-900 outline-none"
                  />
                ) : (
                  <button data-eos-id="src/pages/admin/create-survey.tsx#19"
                    type="button"
                    onClick={() => startEditing(i)}
                    className="flex-1 min-w-0 h-9 px-2.5 rounded-sm bg-white border border-neutral-100 text-sm text-neutral-700 text-left truncate hover:bg-neutral-50 hover:border-neutral-200 transition-colors cursor-pointer"
                  >
                    {opt}
                  </button>
                )}

                {/* Reorder buttons - always visible (no hover-only on mobile) */}
                <div data-eos-id="src/pages/admin/create-survey.tsx#20" className="flex items-center gap-0.5 shrink-0">
                  <button data-eos-id="src/pages/admin/create-survey.tsx#21"
                    type="button"
                    onClick={() => moveOption(i, -1)}
                    disabled={i === 0}
                    className="flex items-center justify-center min-w-9 min-h-9 rounded-sm text-neutral-400 hover:text-neutral-600 active:bg-neutral-100 disabled:opacity-20 cursor-pointer transition-colors"
                    aria-label="Move option up"
                  >
                    <ChevronUp data-eos-id="src/pages/admin/create-survey.tsx#22" size={14} />
                  </button>
                  <button data-eos-id="src/pages/admin/create-survey.tsx#23"
                    type="button"
                    onClick={() => moveOption(i, 1)}
                    disabled={i === options.length - 1}
                    className="flex items-center justify-center min-w-9 min-h-9 rounded-sm text-neutral-400 hover:text-neutral-600 active:bg-neutral-100 disabled:opacity-20 cursor-pointer transition-colors"
                    aria-label="Move option down"
                  >
                    <ChevronDown data-eos-id="src/pages/admin/create-survey.tsx#24" size={14} />
                  </button>
                </div>

                {/* Remove */}
                <button data-eos-id="src/pages/admin/create-survey.tsx#25"
                  type="button"
                  onClick={() => removeOption(i)}
                  className="flex items-center justify-center min-w-9 min-h-9 rounded-sm text-neutral-300 hover:bg-error-50 hover:text-error-600 active:bg-error-100 transition-colors cursor-pointer shrink-0"
                  aria-label={`Remove "${opt}"`}
                >
                  <X data-eos-id="src/pages/admin/create-survey.tsx#26" size={12} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* "Other" preview pill */}
          {allowOther && (
            <div data-eos-id="src/pages/admin/create-survey.tsx#27" className="flex items-center gap-1.5">
              <span data-eos-id="src/pages/admin/create-survey.tsx#28" className="flex items-center justify-center w-5 h-5 rounded-md bg-neutral-50 text-[10px] font-bold text-neutral-300 shrink-0">
                +
              </span>
              <div data-eos-id="src/pages/admin/create-survey.tsx#29" className="flex-1 h-9 px-2.5 rounded-sm bg-neutral-50/50 border border-dashed border-neutral-200 flex items-center">
                <span data-eos-id="src/pages/admin/create-survey.tsx#30" className="text-sm text-neutral-400 italic">Other (write-in)</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add new option input */}
      <div data-eos-id="src/pages/admin/create-survey.tsx#31" className="flex items-center gap-2">
        <div data-eos-id="src/pages/admin/create-survey.tsx#32" className="flex-1 relative">
          <input data-eos-id="src/pages/admin/create-survey.tsx#33"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => { if (draft.trim()) addOption() }}
            placeholder={options.length === 0 ? 'Type your first option...' : 'Add another option...'}
            className="w-full h-9 px-3 rounded-sm bg-surface-3 border border-neutral-100/50 outline-none text-sm text-neutral-900 placeholder:text-neutral-300 focus:ring-2 focus:ring-primary-500 transition-shadow"
          />
        </div>
        <Button data-eos-id="src/pages/admin/create-survey.tsx#34"
          variant="ghost"
          size="sm"
          onClick={addOption}
          disabled={!draft.trim()}
          icon={<Plus data-eos-id="src/pages/admin/create-survey.tsx#35" size={14} />}
        >
          Add
        </Button>
      </div>
      <p data-eos-id="src/pages/admin/create-survey.tsx#36" className="text-[11px] text-neutral-400 mt-1">
        Press Enter to add. Click an option to edit it. Drag to reorder.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Question Editor (inline editing for each question)                 */
/* ------------------------------------------------------------------ */

function QuestionEditor({
  question,
  index,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  question: SurveyQuestion
  index: number
  onChange: (updated: SurveyQuestion) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const hasOptions = HAS_OPTIONS.includes(question.type)
  const hasScale = HAS_SCALE.includes(question.type)
  const { surveyLinkableMetrics } = useImpactMetricDefs()

  const update = (partial: Partial<SurveyQuestion>) =>
    onChange({ ...question, ...partial })

  return (
    <motion.div data-eos-id="src/pages/admin/create-survey.tsx#37"
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      className="rounded-sm bg-white border border-neutral-100 shadow-sm overflow-hidden"
    >
      {/* Header row - always visible, tappable to expand */}
      <div data-eos-id="src/pages/admin/create-survey.tsx#38"
        className="flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-3 cursor-pointer hover:bg-neutral-50/30 active:bg-neutral-50/50 transition-colors select-none"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Number badge */}
        <span data-eos-id="src/pages/admin/create-survey.tsx#39" className="flex items-center justify-center w-6 h-6 rounded-md bg-neutral-100 text-[11px] font-bold text-neutral-600 shrink-0">
          {index + 1}
        </span>

        {/* Type badge - icon only on mobile, icon + label on sm+ */}
        <span data-eos-id="src/pages/admin/create-survey.tsx#40" data-eos-var="questionTypeIcons.[..]" data-eos-var-label="]" data-eos-var-scope="prop" className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md bg-neutral-50 text-neutral-400 shrink-0">
          {questionTypeIcons[question.type]}
          <span data-eos-id="src/pages/admin/create-survey.tsx#41" data-eos-var="questionTypeLabels.[..]" data-eos-var-label="]" data-eos-var-scope="prop" className="text-[11px] font-medium text-neutral-400 hidden sm:inline">{questionTypeLabels[question.type]}</span>
        </span>

        {/* Question text - wraps (never truncates) so the full prompt is readable */}
        <p data-eos-id="src/pages/admin/create-survey.tsx#42" className="flex-1 text-sm font-medium text-neutral-900 break-words whitespace-normal min-w-0">
          {question.text || <span data-eos-id="src/pages/admin/create-survey.tsx#43" className="text-neutral-300 italic">Untitled</span>}
          {question.required && <span data-eos-id="src/pages/admin/create-survey.tsx#44" className="text-error-500 ml-0.5">*</span>}
        </p>

        {/* Actions - touch-friendly 44px targets */}
        <div data-eos-id="src/pages/admin/create-survey.tsx#45" className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
          <button data-eos-id="src/pages/admin/create-survey.tsx#46"
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            className="flex items-center justify-center min-w-9 min-h-9 sm:min-w-8 sm:min-h-8 rounded-sm text-neutral-300 hover:text-neutral-600 hover:bg-neutral-100 active:bg-neutral-200 disabled:opacity-20 cursor-pointer transition-colors"
            aria-label="Move up"
          >
            <ChevronUp data-eos-id="src/pages/admin/create-survey.tsx#47" size={16} />
          </button>
          <button data-eos-id="src/pages/admin/create-survey.tsx#48"
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            className="flex items-center justify-center min-w-9 min-h-9 sm:min-w-8 sm:min-h-8 rounded-sm text-neutral-300 hover:text-neutral-600 hover:bg-neutral-100 active:bg-neutral-200 disabled:opacity-20 cursor-pointer transition-colors"
            aria-label="Move down"
          >
            <ChevronDown data-eos-id="src/pages/admin/create-survey.tsx#49" size={16} />
          </button>
          <button data-eos-id="src/pages/admin/create-survey.tsx#50"
            type="button"
            onClick={onRemove}
            className="flex items-center justify-center min-w-9 min-h-9 sm:min-w-8 sm:min-h-8 rounded-sm text-neutral-300 hover:text-error-600 hover:bg-error-50 active:bg-error-100 cursor-pointer transition-colors"
            aria-label="Remove question"
          >
            <Trash2 data-eos-id="src/pages/admin/create-survey.tsx#51" size={14} />
          </button>
        </div>

        <ChevronDown data-eos-id="src/pages/admin/create-survey.tsx#52"
          size={14}
          className={cn(
            'text-neutral-300 transition-transform duration-200 shrink-0',
            expanded && 'rotate-180',
          )}
        />
      </div>

      {/* Expanded editor */}
      <AnimatePresence data-eos-id="src/pages/admin/create-survey.tsx#53">
        {expanded && (
          <motion.div data-eos-id="src/pages/admin/create-survey.tsx#54"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div data-eos-id="src/pages/admin/create-survey.tsx#55" className="px-4 pb-4 pt-1 space-y-3 border-t border-neutral-100/50">
              {/* Question type */}
              <Dropdown data-eos-id="src/pages/admin/create-survey.tsx#56"
                options={QUESTION_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                value={question.type}
                onChange={(v) => {
                  const newType = v as QuestionType
                  const patch: Partial<SurveyQuestion> = { type: newType }
                  // Clear irrelevant fields when switching type
                  if (!HAS_OPTIONS.includes(newType)) {
                    patch.options = undefined
                    patch.allow_other = undefined
                  }
                  if (!HAS_SCALE.includes(newType)) {
                    patch.min_value = undefined
                    patch.max_value = undefined
                    patch.min_label = undefined
                    patch.max_label = undefined
                  }
                  if (newType !== 'rating') {
                    patch.star_count = undefined
                  } else {
                    patch.star_count = question.star_count ?? 5
                  }
                  if (newType !== 'number') {
                    patch.number_min = undefined
                    patch.number_max = undefined
                    patch.number_step = undefined
                    patch.impact_metric = undefined
                  }
                  if (newType !== 'free_text') {
                    patch.text_min_length = undefined
                    patch.text_max_length = undefined
                    patch.text_multiline = undefined
                  } else {
                    patch.text_multiline = question.text_multiline ?? true
                  }
                  if (newType !== 'date') {
                    patch.date_min = undefined
                    patch.date_max = undefined
                  }
                  if (newType !== 'profile_autofill') {
                    patch.profile_field = undefined
                  }
                  // Reset placeholder for types that don't use it
                  if (!['free_text', 'number', 'email', 'phone'].includes(newType)) {
                    patch.placeholder = undefined
                  }
                  update(patch)
                }}
                label="Question Type"
              />

              {/* Profile field picker */}
              {question.type === 'profile_autofill' && (
                <>
                  <Dropdown data-eos-id="src/pages/admin/create-survey.tsx#57"
                    options={PROFILE_FIELD_OPTIONS}
                    value={question.profile_field ?? 'display_name'}
                    onChange={(v) => update({ profile_field: v })}
                    label="Profile Field"
                  />
                  <div data-eos-id="src/pages/admin/create-survey.tsx#58" className="rounded-sm bg-plum-50 border border-plum-100 px-3 py-2.5">
                    <p data-eos-id="src/pages/admin/create-survey.tsx#59" className="text-[11px] text-plum-600 leading-relaxed">
                      This field will be auto-filled from the respondent's profile. They can review but not edit the value.
                    </p>
                  </div>
                </>
              )}

              {/* Question text */}
              <Input data-eos-id="src/pages/admin/create-survey.tsx#60"
                label={question.type === 'profile_autofill' ? 'Label (optional)' : 'Question Text'}
                value={question.text}
                onChange={(e) => update({ text: e.target.value })}
                placeholder={question.type === 'profile_autofill'
                  ? PROFILE_FIELD_OPTIONS.find((f) => f.value === question.profile_field)?.label ?? 'Field label'
                  : 'What would you like to ask?'}
                required={question.type !== 'profile_autofill'}
              />

              {/* Description */}
              <Input data-eos-id="src/pages/admin/create-survey.tsx#61"
                label="Description (optional)"
                value={question.description ?? ''}
                onChange={(e) => update({ description: e.target.value || undefined })}
                placeholder="Add helper text or instructions for this question"
              />

              {/* Options builder for MC/checkbox/dropdown */}
              {hasOptions && (
                <>
                  <OptionChipBuilder data-eos-id="src/pages/admin/create-survey.tsx#62"
                    options={question.options ?? []}
                    onChange={(opts) => update({ options: opts })}
                    allowOther={question.allow_other}
                  />

                  {/* Allow "Other" option */}
                  <div data-eos-id="src/pages/admin/create-survey.tsx#63" className="flex items-center justify-between px-3 py-2.5 rounded-sm bg-neutral-50/50 border border-neutral-100/50">
                    <div data-eos-id="src/pages/admin/create-survey.tsx#64">
                      <p data-eos-id="src/pages/admin/create-survey.tsx#65" className="text-sm font-medium text-neutral-700">Allow "Other" answer</p>
                      <p data-eos-id="src/pages/admin/create-survey.tsx#66" className="text-[11px] text-neutral-400">
                        Respondents can type their own answer if none of the options fit
                      </p>
                    </div>
                    <Toggle data-eos-id="src/pages/admin/create-survey.tsx#67"
                      checked={question.allow_other ?? false}
                      onChange={(v) => update({ allow_other: v })}
                    />
                  </div>
                </>
              )}

              {/* Rating config */}
              {question.type === 'rating' && (
                <div data-eos-id="src/pages/admin/create-survey.tsx#68" className="space-y-3">
                  <Dropdown data-eos-id="src/pages/admin/create-survey.tsx#69"
                    options={[
                      { value: '3', label: '3 stars' },
                      { value: '5', label: '5 stars (default)' },
                      { value: '7', label: '7 stars' },
                      { value: '10', label: '10 stars' },
                    ]}
                    value={String(question.star_count ?? 5)}
                    onChange={(v) => update({ star_count: parseInt(v) || 5 })}
                    label="Star Count"
                  />
                  {/* Rating preview */}
                  <div data-eos-id="src/pages/admin/create-survey.tsx#70" className="rounded-sm bg-neutral-50/50 border border-neutral-100/50 px-3 py-2.5">
                    <p data-eos-id="src/pages/admin/create-survey.tsx#71" className="text-[11px] text-neutral-400 mb-1.5 flex items-center gap-1">
                      <Eye data-eos-id="src/pages/admin/create-survey.tsx#72" size={10} /> Preview
                    </p>
                    <div data-eos-id="src/pages/admin/create-survey.tsx#73" className="flex gap-1">
                      {Array.from({ length: question.star_count ?? 5 }, (_, i) => (
                        <Star data-eos-id="src/pages/admin/create-survey.tsx#74"
                          key={i}
                          size={20}
                          className={cn(
                            'transition-colors',
                            i < 3 ? 'text-warning-400 fill-warning-400' : 'text-primary-200',
                          )}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Scale config */}
              {hasScale && (
                <div data-eos-id="src/pages/admin/create-survey.tsx#75" className="space-y-3">
                  <div data-eos-id="src/pages/admin/create-survey.tsx#76" className="grid grid-cols-2 gap-3">
                    <Input data-eos-id="src/pages/admin/create-survey.tsx#77"
                      label="Min Value"
                      type="number"
                      value={String(question.min_value ?? 1)}
                      onChange={(e) => update({ min_value: parseInt(e.target.value) || 1 })}
                    />
                    <Input data-eos-id="src/pages/admin/create-survey.tsx#78"
                      label="Max Value"
                      type="number"
                      value={String(question.max_value ?? 10)}
                      onChange={(e) => update({ max_value: parseInt(e.target.value) || 10 })}
                    />
                  </div>
                  <div data-eos-id="src/pages/admin/create-survey.tsx#79" className="grid grid-cols-2 gap-3">
                    <Input data-eos-id="src/pages/admin/create-survey.tsx#80"
                      label="Min Label (optional)"
                      value={question.min_label ?? ''}
                      onChange={(e) => update({ min_label: e.target.value || undefined })}
                      placeholder="e.g. Not at all"
                    />
                    <Input data-eos-id="src/pages/admin/create-survey.tsx#81"
                      label="Max Label (optional)"
                      value={question.max_label ?? ''}
                      onChange={(e) => update({ max_label: e.target.value || undefined })}
                      placeholder="e.g. Extremely"
                    />
                  </div>
                  {/* Scale preview */}
                  <div data-eos-id="src/pages/admin/create-survey.tsx#82" className="rounded-sm bg-neutral-50/50 border border-neutral-100/50 px-3 py-2.5">
                    <p data-eos-id="src/pages/admin/create-survey.tsx#83" className="text-[11px] text-neutral-400 mb-1.5 flex items-center gap-1">
                      <Eye data-eos-id="src/pages/admin/create-survey.tsx#84" size={10} /> Preview
                    </p>
                    <div data-eos-id="src/pages/admin/create-survey.tsx#85" className="flex items-center gap-2">
                      {question.min_label && (
                        <span data-eos-id="src/pages/admin/create-survey.tsx#86" data-eos-var="question.min_label" data-eos-var-label="Min label" data-eos-var-scope="prop" className="text-[11px] text-neutral-500">{question.min_label}</span>
                      )}
                      <div data-eos-id="src/pages/admin/create-survey.tsx#87" className="flex gap-1 flex-wrap">
                        {Array.from(
                          { length: Math.min((question.max_value ?? 10) - (question.min_value ?? 1) + 1, 20) },
                          (_, i) => (question.min_value ?? 1) + i,
                        ).map((n) => (
                          <span data-eos-id="src/pages/admin/create-survey.tsx#88"
                            key={n}
                            className="flex items-center justify-center w-7 h-7 rounded-sm bg-white border border-neutral-200 text-xs font-medium text-neutral-600"
                          >
                            {n}
                          </span>
                        ))}
                      </div>
                      {question.max_label && (
                        <span data-eos-id="src/pages/admin/create-survey.tsx#89" data-eos-var="question.max_label" data-eos-var-label="Max label" data-eos-var-scope="prop" className="text-[11px] text-neutral-500">{question.max_label}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Free text config */}
              {question.type === 'free_text' && (
                <div data-eos-id="src/pages/admin/create-survey.tsx#90" className="space-y-3">
                  <div data-eos-id="src/pages/admin/create-survey.tsx#91" className="flex items-center justify-between px-3 py-2.5 rounded-sm bg-neutral-50/50 border border-neutral-100/50">
                    <div data-eos-id="src/pages/admin/create-survey.tsx#92">
                      <p data-eos-id="src/pages/admin/create-survey.tsx#93" className="text-sm font-medium text-neutral-700">Multi-line</p>
                      <p data-eos-id="src/pages/admin/create-survey.tsx#94" className="text-[11px] text-neutral-400">Allow longer paragraph responses</p>
                    </div>
                    <Toggle data-eos-id="src/pages/admin/create-survey.tsx#95"
                      checked={question.text_multiline ?? true}
                      onChange={(v) => update({ text_multiline: v })}
                    />
                  </div>
                  <div data-eos-id="src/pages/admin/create-survey.tsx#96" className="grid grid-cols-2 gap-3">
                    <Input data-eos-id="src/pages/admin/create-survey.tsx#97"
                      label="Min Length"
                      type="number"
                      value={question.text_min_length != null ? String(question.text_min_length) : ''}
                      onChange={(e) => {
                        const v = e.target.value.trim()
                        update({ text_min_length: v ? parseInt(v) || undefined : undefined })
                      }}
                      placeholder="No minimum"
                    />
                    <Input data-eos-id="src/pages/admin/create-survey.tsx#98"
                      label="Max Length"
                      type="number"
                      value={question.text_max_length != null ? String(question.text_max_length) : ''}
                      onChange={(e) => {
                        const v = e.target.value.trim()
                        update({ text_max_length: v ? parseInt(v) || undefined : undefined })
                      }}
                      placeholder="No maximum"
                    />
                  </div>
                  <Input data-eos-id="src/pages/admin/create-survey.tsx#99"
                    label="Placeholder (optional)"
                    value={question.placeholder ?? ''}
                    onChange={(e) => update({ placeholder: e.target.value || undefined })}
                    placeholder="e.g. Share your thoughts..."
                  />
                  {/* Free text preview */}
                  <div data-eos-id="src/pages/admin/create-survey.tsx#100" className="rounded-sm bg-neutral-50/50 border border-neutral-100/50 px-3 py-2.5">
                    <p data-eos-id="src/pages/admin/create-survey.tsx#101" className="text-[11px] text-neutral-400 mb-1.5 flex items-center gap-1">
                      <Eye data-eos-id="src/pages/admin/create-survey.tsx#102" size={10} /> Preview
                    </p>
                    {question.text_multiline !== false ? (
                      <div data-eos-id="src/pages/admin/create-survey.tsx#103" data-eos-var="question.placeholder" data-eos-var-label="Placeholder" data-eos-var-scope="prop" className="h-16 rounded-sm bg-white border border-neutral-200 px-3 py-2 text-xs text-neutral-300">
                        {question.placeholder || 'Type your response here...'}
                      </div>
                    ) : (
                      <div data-eos-id="src/pages/admin/create-survey.tsx#104" data-eos-var="question.placeholder" data-eos-var-label="Placeholder" data-eos-var-scope="prop" className="h-9 rounded-sm bg-white border border-neutral-200 px-3 flex items-center text-xs text-neutral-300">
                        {question.placeholder || 'Type your response here...'}
                      </div>
                    )}
                    {(question.text_min_length || question.text_max_length) && (
                      <p data-eos-id="src/pages/admin/create-survey.tsx#105" data-eos-var="question.text_min_length,question.text_min_length,question.text_max_length" data-eos-var-label="Text min length, Text min length, Text max length" data-eos-var-scope="prop" className="text-[10px] text-neutral-400 mt-1">
                        {question.text_min_length ? `Min ${question.text_min_length}` : ''}
                        {question.text_min_length && question.text_max_length ? '  ' : ''}
                        {question.text_max_length ? `Max ${question.text_max_length}` : ''}
                        {' characters'}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Number config */}
              {question.type === 'number' && (
                <div data-eos-id="src/pages/admin/create-survey.tsx#106" className="space-y-3">
                  <div data-eos-id="src/pages/admin/create-survey.tsx#107" className="grid grid-cols-3 gap-3">
                    <Input data-eos-id="src/pages/admin/create-survey.tsx#108"
                      label="Minimum"
                      type="number"
                      value={question.number_min != null ? String(question.number_min) : ''}
                      onChange={(e) => {
                        const v = e.target.value.trim()
                        update({ number_min: v ? parseFloat(v) : undefined })
                      }}
                      placeholder="No min"
                    />
                    <Input data-eos-id="src/pages/admin/create-survey.tsx#109"
                      label="Maximum"
                      type="number"
                      value={question.number_max != null ? String(question.number_max) : ''}
                      onChange={(e) => {
                        const v = e.target.value.trim()
                        update({ number_max: v ? parseFloat(v) : undefined })
                      }}
                      placeholder="No max"
                    />
                    <Input data-eos-id="src/pages/admin/create-survey.tsx#110"
                      label="Step"
                      type="number"
                      value={question.number_step != null ? String(question.number_step) : ''}
                      onChange={(e) => {
                        const v = e.target.value.trim()
                        update({ number_step: v ? parseFloat(v) : undefined })
                      }}
                      placeholder="1"
                    />
                  </div>
                  <Input data-eos-id="src/pages/admin/create-survey.tsx#111"
                    label="Placeholder (optional)"
                    value={question.placeholder ?? ''}
                    onChange={(e) => update({ placeholder: e.target.value || undefined })}
                    placeholder="e.g. Enter a number..."
                  />
                  <Dropdown data-eos-id="src/pages/admin/create-survey.tsx#112"
                    label="Impact Metric (optional)"
                    options={[
                      { value: '', label: 'None - not linked to impact stats' },
                      ...surveyLinkableMetrics.map((m) => ({ value: m.key, label: m.label })),
                    ]}
                    value={question.impact_metric ?? ''}
                    onChange={(v) => update({ impact_metric: v || undefined })}
                  />
                  {/* Number preview */}
                  <div data-eos-id="src/pages/admin/create-survey.tsx#113" className="rounded-sm bg-neutral-50/50 border border-neutral-100/50 px-3 py-2.5">
                    <p data-eos-id="src/pages/admin/create-survey.tsx#114" className="text-[11px] text-neutral-400 mb-1.5 flex items-center gap-1">
                      <Eye data-eos-id="src/pages/admin/create-survey.tsx#115" size={10} /> Preview
                    </p>
                    <div data-eos-id="src/pages/admin/create-survey.tsx#116" className="flex items-center gap-2">
                      <div data-eos-id="src/pages/admin/create-survey.tsx#117" data-eos-var="question.placeholder" data-eos-var-label="Placeholder" data-eos-var-scope="prop" className="h-9 w-32 rounded-sm bg-white border border-neutral-200 px-3 flex items-center text-xs text-neutral-300">
                        {question.placeholder || '0'}
                      </div>
                      {(question.number_min != null || question.number_max != null) && (
                        <span data-eos-id="src/pages/admin/create-survey.tsx#118" data-eos-var="question.number_min,question.number_min,question.number_max,question.number_step" data-eos-var-label="Number min, Number min, Number max, Number step" data-eos-var-scope="prop" className="text-[10px] text-neutral-400">
                          {question.number_min != null ? `Min: ${question.number_min}` : ''}
                          {question.number_min != null && question.number_max != null ? ' · ' : ''}
                          {question.number_max != null ? `Max: ${question.number_max}` : ''}
                          {question.number_step ? ` · Step: ${question.number_step}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Date config */}
              {question.type === 'date' && (
                <div data-eos-id="src/pages/admin/create-survey.tsx#119" className="space-y-3">
                  <div data-eos-id="src/pages/admin/create-survey.tsx#120" className="grid grid-cols-2 gap-3">
                    <Input data-eos-id="src/pages/admin/create-survey.tsx#121"
                      label="Earliest Date (optional)"
                      type="date"
                      value={question.date_min ?? ''}
                      onChange={(e) => update({ date_min: e.target.value || undefined })}
                    />
                    <Input data-eos-id="src/pages/admin/create-survey.tsx#122"
                      label="Latest Date (optional)"
                      type="date"
                      value={question.date_max ?? ''}
                      onChange={(e) => update({ date_max: e.target.value || undefined })}
                    />
                  </div>
                  {/* Date preview */}
                  <div data-eos-id="src/pages/admin/create-survey.tsx#123" className="rounded-sm bg-neutral-50/50 border border-neutral-100/50 px-3 py-2.5">
                    <p data-eos-id="src/pages/admin/create-survey.tsx#124" className="text-[11px] text-neutral-400 mb-1.5 flex items-center gap-1">
                      <Eye data-eos-id="src/pages/admin/create-survey.tsx#125" size={10} /> Preview
                    </p>
                    <div data-eos-id="src/pages/admin/create-survey.tsx#126" className="flex items-center gap-2">
                      <div data-eos-id="src/pages/admin/create-survey.tsx#127" className="h-9 w-40 rounded-sm bg-white border border-neutral-200 px-3 flex items-center text-xs text-neutral-300">
                        <Calendar data-eos-id="src/pages/admin/create-survey.tsx#128" size={12} className="mr-1.5" /> Select a date
                      </div>
                      {(question.date_min || question.date_max) && (
                        <span data-eos-id="src/pages/admin/create-survey.tsx#129" data-eos-var="question.date_min,question.date_min,question.date_max" data-eos-var-label="Date min, Date min, Date max" data-eos-var-scope="prop" className="text-[10px] text-neutral-400">
                          {question.date_min ? `From: ${question.date_min}` : ''}
                          {question.date_min && question.date_max ? ' · ' : ''}
                          {question.date_max ? `Until: ${question.date_max}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Email config */}
              {question.type === 'email' && (
                <div data-eos-id="src/pages/admin/create-survey.tsx#130" className="space-y-3">
                  <Input data-eos-id="src/pages/admin/create-survey.tsx#131"
                    label="Placeholder (optional)"
                    value={question.placeholder ?? ''}
                    onChange={(e) => update({ placeholder: e.target.value || undefined })}
                    placeholder="e.g. you@example.com"
                  />
                  <div data-eos-id="src/pages/admin/create-survey.tsx#132" className="rounded-sm bg-neutral-50/50 border border-neutral-100/50 px-3 py-2.5">
                    <p data-eos-id="src/pages/admin/create-survey.tsx#133" className="text-[11px] text-neutral-400 mb-1.5 flex items-center gap-1">
                      <Eye data-eos-id="src/pages/admin/create-survey.tsx#134" size={10} /> Preview
                    </p>
                    <div data-eos-id="src/pages/admin/create-survey.tsx#135" data-eos-var="question.placeholder" data-eos-var-label="Placeholder" data-eos-var-scope="prop" className="h-9 w-56 rounded-sm bg-white border border-neutral-200 px-3 flex items-center text-xs text-neutral-300">
                      <Mail data-eos-id="src/pages/admin/create-survey.tsx#136" size={12} className="mr-1.5 text-neutral-400" />
                      {question.placeholder || 'you@example.com'}
                    </div>
                    <p data-eos-id="src/pages/admin/create-survey.tsx#137" className="text-[10px] text-neutral-400 mt-1">
                      Email format is validated automatically
                    </p>
                  </div>
                </div>
              )}

              {/* Phone config */}
              {question.type === 'phone' && (
                <div data-eos-id="src/pages/admin/create-survey.tsx#138" className="space-y-3">
                  <Input data-eos-id="src/pages/admin/create-survey.tsx#139"
                    label="Placeholder (optional)"
                    value={question.placeholder ?? ''}
                    onChange={(e) => update({ placeholder: e.target.value || undefined })}
                    placeholder="e.g. 0412 345 678"
                  />
                  <div data-eos-id="src/pages/admin/create-survey.tsx#140" className="rounded-sm bg-neutral-50/50 border border-neutral-100/50 px-3 py-2.5">
                    <p data-eos-id="src/pages/admin/create-survey.tsx#141" className="text-[11px] text-neutral-400 mb-1.5 flex items-center gap-1">
                      <Eye data-eos-id="src/pages/admin/create-survey.tsx#142" size={10} /> Preview
                    </p>
                    <div data-eos-id="src/pages/admin/create-survey.tsx#143" data-eos-var="question.placeholder" data-eos-var-label="Placeholder" data-eos-var-scope="prop" className="h-9 w-48 rounded-sm bg-white border border-neutral-200 px-3 flex items-center text-xs text-neutral-300">
                      <Phone data-eos-id="src/pages/admin/create-survey.tsx#144" size={12} className="mr-1.5 text-neutral-400" />
                      {question.placeholder || '0412 345 678'}
                    </div>
                    <p data-eos-id="src/pages/admin/create-survey.tsx#145" className="text-[10px] text-neutral-400 mt-1">
                      Phone number format is validated automatically
                    </p>
                  </div>
                </div>
              )}

              {/* Yes/No preview */}
              {question.type === 'yes_no' && (
                <div data-eos-id="src/pages/admin/create-survey.tsx#146" className="rounded-sm bg-neutral-50/50 border border-neutral-100/50 px-3 py-2.5">
                  <p data-eos-id="src/pages/admin/create-survey.tsx#147" className="text-[11px] text-neutral-400 mb-1.5 flex items-center gap-1">
                    <Eye data-eos-id="src/pages/admin/create-survey.tsx#148" size={10} /> Preview
                  </p>
                  <div data-eos-id="src/pages/admin/create-survey.tsx#149" className="flex gap-2">
                    <span data-eos-id="src/pages/admin/create-survey.tsx#150" className="flex items-center justify-center h-9 px-5 rounded-sm bg-white border border-neutral-200 text-sm font-medium text-neutral-600">
                      Yes
                    </span>
                    <span data-eos-id="src/pages/admin/create-survey.tsx#151" className="flex items-center justify-center h-9 px-5 rounded-sm bg-white border border-neutral-200 text-sm font-medium text-neutral-600">
                      No
                    </span>
                  </div>
                </div>
              )}

              {/* Multiple choice / checkbox / dropdown preview */}
              {hasOptions && (question.options?.length ?? 0) > 0 && (
                <div data-eos-id="src/pages/admin/create-survey.tsx#152" className="rounded-sm bg-neutral-50/50 border border-neutral-100/50 px-3 py-2.5">
                  <p data-eos-id="src/pages/admin/create-survey.tsx#153" className="text-[11px] text-neutral-400 mb-1.5 flex items-center gap-1">
                    <Eye data-eos-id="src/pages/admin/create-survey.tsx#154" size={10} /> Preview
                  </p>
                  {question.type === 'dropdown' ? (
                    <div data-eos-id="src/pages/admin/create-survey.tsx#155" className="h-9 w-56 rounded-sm bg-white border border-neutral-200 px-3 flex items-center justify-between text-xs text-neutral-300">
                      <span data-eos-id="src/pages/admin/create-survey.tsx#156">Select an option</span>
                      <ChevronDown data-eos-id="src/pages/admin/create-survey.tsx#157" size={12} />
                    </div>
                  ) : (
                    <div data-eos-id="src/pages/admin/create-survey.tsx#158" className="space-y-1.5">
                      {question.options?.map((opt) => (
                        <div data-eos-id="src/pages/admin/create-survey.tsx#159" key={opt} className="flex items-center gap-2">
                          <span data-eos-id="src/pages/admin/create-survey.tsx#160" className={cn(
                            'flex items-center justify-center w-4 h-4 border border-neutral-300 shrink-0',
                            question.type === 'multiple_choice' ? 'rounded-full' : 'rounded',
                          )} />
                          <span data-eos-id="src/pages/admin/create-survey.tsx#161" className="text-xs text-neutral-600">{opt}</span>
                        </div>
                      ))}
                      {question.allow_other && (
                        <div data-eos-id="src/pages/admin/create-survey.tsx#162" className="flex items-center gap-2">
                          <span data-eos-id="src/pages/admin/create-survey.tsx#163" className={cn(
                            'flex items-center justify-center w-4 h-4 border border-neutral-300 shrink-0',
                            question.type === 'multiple_choice' ? 'rounded-full' : 'rounded',
                          )} />
                          <span data-eos-id="src/pages/admin/create-survey.tsx#164" className="text-xs text-neutral-400 italic">Other:</span>
                          <div data-eos-id="src/pages/admin/create-survey.tsx#165" className="flex-1 h-6 rounded border border-dashed border-primary-200 bg-white" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Required toggle */}
              <div data-eos-id="src/pages/admin/create-survey.tsx#166" className="flex items-center justify-between px-3 py-2.5 rounded-sm bg-neutral-50/50 border border-neutral-100/50">
                <div data-eos-id="src/pages/admin/create-survey.tsx#167">
                  <p data-eos-id="src/pages/admin/create-survey.tsx#168" className="text-sm font-medium text-neutral-700">Required</p>
                  <p data-eos-id="src/pages/admin/create-survey.tsx#169" className="text-[11px] text-neutral-400">
                    Respondents must answer this question to submit the survey
                  </p>
                </div>
                <Toggle data-eos-id="src/pages/admin/create-survey.tsx#170"
                  checked={question.required ?? false}
                  onChange={(v) => update({ required: v })}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

function validateSurvey(title: string, questions: SurveyQuestion[]): string[] {
  const errors: string[] = []
  if (!title.trim()) errors.push('Survey title is required')
  if (questions.length === 0) errors.push('Add at least one question')

  questions.forEach((q, i) => {
    const num = i + 1
    const label = questionTypeLabels[q.type] ?? q.type

    // Text required for all non-autofill questions
    if (!q.text.trim() && q.type !== 'profile_autofill') {
      errors.push(`Question ${num}: text is required`)
    }

    // Choice types need at least 2 options
    if (HAS_OPTIONS.includes(q.type) && (!q.options || q.options.length < 2)) {
      errors.push(`Question ${num} (${label}): needs at least 2 options`)
    }

    // Check for duplicate options
    if (HAS_OPTIONS.includes(q.type) && q.options) {
      const seen = new Set<string>()
      for (const opt of q.options) {
        if (seen.has(opt.toLowerCase())) {
          errors.push(`Question ${num} (${label}): duplicate option "${opt}"`)
          break
        }
        seen.add(opt.toLowerCase())
      }
    }

    // Scale validation
    if (q.type === 'scale') {
      const min = q.min_value ?? 1
      const max = q.max_value ?? 10
      if (min >= max) errors.push(`Question ${num}: min must be less than max`)
      if (max - min > 20) errors.push(`Question ${num}: scale range too large (max 20 steps)`)
    }

    // Rating validation
    if (q.type === 'rating') {
      const stars = q.star_count ?? 5
      if (stars < 2 || stars > 10) {
        errors.push(`Question ${num}: star count must be between 2 and 10`)
      }
    }

    // Number validation
    if (q.type === 'number') {
      if (q.number_min != null && q.number_max != null && q.number_min >= q.number_max) {
        errors.push(`Question ${num}: minimum must be less than maximum`)
      }
      if (q.number_step != null && q.number_step <= 0) {
        errors.push(`Question ${num}: step must be a positive number`)
      }
    }

    // Text length validation
    if (q.type === 'free_text') {
      if (q.text_min_length != null && q.text_max_length != null && q.text_min_length > q.text_max_length) {
        errors.push(`Question ${num}: min length must be less than max length`)
      }
      if (q.text_min_length != null && q.text_min_length < 0) {
        errors.push(`Question ${num}: min length cannot be negative`)
      }
    }

    // Date validation
    if (q.type === 'date') {
      if (q.date_min && q.date_max && q.date_min > q.date_max) {
        errors.push(`Question ${num}: earliest date must be before latest date`)
      }
    }

    // Profile autofill validation
    if (q.type === 'profile_autofill' && !q.profile_field) {
      errors.push(`Question ${num}: select a profile field`)
    }
  })

  return errors
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function CreateSurveyPage() {
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const params = useParams<{ id?: string }>()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const isEdit = !!params.id
  const surveyId = params.id

  useAdminHeader(isEdit ? 'Edit Survey' : 'Create Survey')

  // Load existing survey for edit mode
  const { data: existingSurvey, isLoading: loadingSurvey } = useQuery({
    queryKey: ['admin-survey-detail', surveyId],
    queryFn: async () => {
      if (!surveyId) return null
      const { data, error } = await supabase
        .from('surveys')
        .select('*')
        .eq('id', surveyId)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!surveyId,
    staleTime: 30 * 1000,
  })

  // Pre-load template if ?template=index was passed
  const templateIndex = searchParams.get('template')
  const initialTemplate = templateIndex !== null ? TEMPLATES[Number(templateIndex)] : null

  const [title, setTitle] = useState(initialTemplate?.name ?? '')
  const [description, setDescription] = useState('')
  const [autoSendAfterEvent, setAutoSendAfterEvent] = useState(false)
  const [isImpactForm, setIsImpactForm] = useState(false)
  const [activityType, setActivityType] = useState('')
  const [questions, setQuestions] = useState<SurveyQuestion[]>(initialTemplate?.questions ?? [])
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [initialized, setInitialized] = useState(!isEdit)

  // Populate form when editing
  useEffect(() => {
    if (existingSurvey && !initialized) {
      setTitle(existingSurvey.title ?? '')
      setDescription((existingSurvey as Record<string, unknown>).description as string ?? '')
      setAutoSendAfterEvent(existingSurvey.auto_send_after_event ?? false)
      setIsImpactForm(existingSurvey.is_impact_form ?? false)
      setActivityType((existingSurvey as Record<string, unknown>).activity_type as string ?? '')
      // Parse questions  could be string or object
      let parsedQuestions: SurveyQuestion[] = []
      try {
        const raw = typeof existingSurvey.questions === 'string'
          ? JSON.parse(existingSurvey.questions)
          : existingSurvey.questions
        parsedQuestions = (Array.isArray(raw) ? raw : []).map((q: Record<string, unknown>) => ({
          id: (q.id as string) || crypto.randomUUID(),
          type: (q.type as QuestionType) || 'free_text',
          text: (q.text as string) || '',
          description: (q.description as string) || undefined,
          options: Array.isArray(q.options) ? q.options as string[] : undefined,
          allow_other: (q.allow_other as boolean) ?? false,
          required: (q.required as boolean) ?? false,
          profile_field: (q.profile_field as string) || undefined,
          placeholder: (q.placeholder as string) || undefined,
          min_value: (q.min_value as number) ?? undefined,
          max_value: (q.max_value as number) ?? undefined,
          min_label: (q.min_label as string) || undefined,
          max_label: (q.max_label as string) || undefined,
          star_count: (q.star_count as number) ?? undefined,
          number_min: (q.number_min as number) ?? undefined,
          number_max: (q.number_max as number) ?? undefined,
          number_step: (q.number_step as number) ?? undefined,
          text_min_length: (q.text_min_length as number) ?? undefined,
          text_max_length: (q.text_max_length as number) ?? undefined,
          text_multiline: (q.text_multiline as boolean) ?? undefined,
          date_min: (q.date_min as string) || undefined,
          date_max: (q.date_max as string) || undefined,
          impact_metric: (q.impact_metric as string) || undefined,
        }))
      } catch {
        parsedQuestions = []
      }
      setQuestions(parsedQuestions)
      setInitialized(true)
    }
  }, [existingSurvey, initialized])

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title,
        description: description.trim() || null,
        questions: JSON.stringify(questions),
        auto_send_after_event: autoSendAfterEvent && !isImpactForm,
        is_impact_form: isImpactForm,
        activity_type: (autoSendAfterEvent || isImpactForm) && activityType ? activityType : null,
        status: 'active',
      }

      if (isEdit && surveyId) {
        const { error } = await supabase
          .from('surveys')
          .update(payload)
          .eq('id', surveyId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('surveys').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-surveys'] })
      queryClient.invalidateQueries({ queryKey: ['admin-survey-detail', surveyId] })
      // Invalidate leader-facing caches so impact forms / event surveys reflect changes
      queryClient.invalidateQueries({ queryKey: ['impact-form-surveys'] })
      queryClient.invalidateQueries({ queryKey: ['event-survey'] })
      queryClient.invalidateQueries({ queryKey: ['pending-impact-form-tasks'] })
      toast.success(isEdit ? 'Survey updated' : 'Survey created')
      navigate('/admin/surveys')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('surveys_impact_form_activity_type_unique')) {
        const typeName = ACTIVITY_TYPE_LABELS[activityType] ?? activityType
        toast.error(`There's already an active impact form for "${typeName}". Go to Surveys, find the existing one, and deactivate or delete it first.`)
      } else {
        toast.error(isEdit ? 'Failed to update survey' : 'Failed to create survey')
      }
    },
  })

  const handleSubmit = () => {
    const errors = validateSurvey(title, questions)
    if (isImpactForm && !activityType) {
      errors.push('Impact forms must be linked to an activity type')
    }
    setValidationErrors(errors)
    if (errors.length > 0) {
      toast.error(errors[0])
      return
    }
    saveMutation.mutate()
  }

  // Question CRUD
  const addQuestion = useCallback((type: QuestionType = 'multiple_choice') => {
    const newQ: SurveyQuestion = {
      id: crypto.randomUUID(),
      type,
      text: '',
      required: false,
      ...(HAS_OPTIONS.includes(type) && { options: [], allow_other: false }),
      ...(type === 'rating' && { star_count: 5 }),
      ...(type === 'scale' && { min_value: 1, max_value: 10 }),
      ...(type === 'free_text' && { text_multiline: true }),
      ...(type === 'profile_autofill' && { profile_field: 'display_name' }),
    }
    setQuestions((prev) => [...prev, newQ])
  }, [])

  const updateQuestion = useCallback((id: string, updated: SurveyQuestion) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? updated : q)))
  }, [])

  const removeQuestion = useCallback((id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id))
  }, [])

  const moveQuestion = useCallback((idx: number, dir: -1 | 1) => {
    setQuestions((prev) => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }, [])

  // Show loading skeleton while fetching survey for edit
  if (isEdit && loadingSurvey) {
    return (
      <div data-eos-id="src/pages/admin/create-survey.tsx#171" className="max-w-4xl mx-auto pb-8">
        <div data-eos-id="src/pages/admin/create-survey.tsx#172" className="mb-8">
          <div data-eos-id="src/pages/admin/create-survey.tsx#173" className="h-7 w-48 rounded-sm bg-neutral-100 animate-pulse" />
          <div data-eos-id="src/pages/admin/create-survey.tsx#174" className="h-4 w-72 rounded-sm bg-neutral-50 animate-pulse mt-2" />
        </div>
        <div data-eos-id="src/pages/admin/create-survey.tsx#175" className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div data-eos-id="src/pages/admin/create-survey.tsx#176" key={i} className="h-20 rounded-sm bg-neutral-50 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div data-eos-id="src/pages/admin/create-survey.tsx#177" className="max-w-4xl mx-auto pb-8">
      {/* Page header */}
      <div data-eos-id="src/pages/admin/create-survey.tsx#178" className="mb-8">
        <h1 data-eos-id="src/pages/admin/create-survey.tsx#179" className="font-heading text-2xl font-bold text-neutral-900">
          {isEdit ? 'Edit Survey' : 'Create Survey'}
        </h1>
        <p data-eos-id="src/pages/admin/create-survey.tsx#180" className="text-sm text-neutral-400 mt-1">
          {isEdit
            ? 'Update your survey questions and settings'
            : 'Build a survey to collect feedback from your community'}
        </p>
      </div>

      {/* Title & settings card */}
      <section data-eos-id="src/pages/admin/create-survey.tsx#181" className="rounded-md bg-white border border-neutral-100 shadow-sm p-5 mb-6">
        <h2 data-eos-id="src/pages/admin/create-survey.tsx#182" className="text-sm font-semibold text-neutral-900 mb-4">Details</h2>

        <div data-eos-id="src/pages/admin/create-survey.tsx#183" className="space-y-4">
          <Input data-eos-id="src/pages/admin/create-survey.tsx#184"
            label="Survey Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="e.g. Post-Event Feedback"
          />

          <Input data-eos-id="src/pages/admin/create-survey.tsx#185"
            label="Description (optional)"
            type="textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description shown to respondents before they start the survey"
            rows={2}
          />

          {/* Survey purpose selector */}
          <div data-eos-id="src/pages/admin/create-survey.tsx#186">
            <label data-eos-id="src/pages/admin/create-survey.tsx#187" className="block text-xs font-medium text-neutral-500 mb-2">Survey Purpose</label>
            <div data-eos-id="src/pages/admin/create-survey.tsx#188" className="space-y-2">
              {/* General survey */}
              <button data-eos-id="src/pages/admin/create-survey.tsx#189"
                type="button"
                onClick={() => { setAutoSendAfterEvent(false); setIsImpactForm(false) }}
                className={cn(
                  'w-full flex items-start gap-3 px-4 py-3.5 rounded-sm border text-left transition-colors cursor-pointer',
                  !autoSendAfterEvent && !isImpactForm
                    ? 'border-primary-400 bg-primary-50'
                    : 'border-neutral-100 bg-neutral-50/30 hover:bg-neutral-50',
                )}
              >
                <span data-eos-id="src/pages/admin/create-survey.tsx#190" className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-sm shrink-0 mt-0.5',
                  !autoSendAfterEvent && !isImpactForm ? 'bg-primary-100 text-primary-600' : 'bg-neutral-100 text-neutral-400',
                )}>
                  <ClipboardList data-eos-id="src/pages/admin/create-survey.tsx#191" size={16} />
                </span>
                <div data-eos-id="src/pages/admin/create-survey.tsx#192">
                  <p data-eos-id="src/pages/admin/create-survey.tsx#193" className="text-sm font-semibold text-neutral-900">General Survey</p>
                  <p data-eos-id="src/pages/admin/create-survey.tsx#194" className="text-[11px] text-neutral-400 mt-0.5">Standalone survey - share manually or attach to a task</p>
                </div>
              </button>

              {/* Attendee feedback */}
              <button data-eos-id="src/pages/admin/create-survey.tsx#195"
                type="button"
                onClick={() => { setAutoSendAfterEvent(true); setIsImpactForm(false) }}
                className={cn(
                  'w-full flex items-start gap-3 px-4 py-3.5 rounded-sm border text-left transition-colors cursor-pointer',
                  autoSendAfterEvent && !isImpactForm
                    ? 'border-plum-400 bg-plum-50'
                    : 'border-neutral-100 bg-neutral-50/30 hover:bg-neutral-50',
                )}
              >
                <span data-eos-id="src/pages/admin/create-survey.tsx#196" className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-sm shrink-0 mt-0.5',
                  autoSendAfterEvent && !isImpactForm ? 'bg-plum-100 text-plum-600' : 'bg-neutral-100 text-neutral-400',
                )}>
                  <Send data-eos-id="src/pages/admin/create-survey.tsx#197" size={16} />
                </span>
                <div data-eos-id="src/pages/admin/create-survey.tsx#198">
                  <p data-eos-id="src/pages/admin/create-survey.tsx#199" className="text-sm font-semibold text-neutral-900">Attendee Feedback</p>
                  <p data-eos-id="src/pages/admin/create-survey.tsx#200" className="text-[11px] text-neutral-400 mt-0.5">Auto-sent to checked-in attendees after each event</p>
                </div>
              </button>

              {/* Leader impact form */}
              <button data-eos-id="src/pages/admin/create-survey.tsx#201"
                type="button"
                onClick={() => { setIsImpactForm(true); setAutoSendAfterEvent(false) }}
                className={cn(
                  'w-full flex items-start gap-3 px-4 py-3.5 rounded-sm border text-left transition-colors cursor-pointer',
                  isImpactForm
                    ? 'border-moss-400 bg-moss-50'
                    : 'border-neutral-100 bg-neutral-50/30 hover:bg-neutral-50',
                )}
              >
                <span data-eos-id="src/pages/admin/create-survey.tsx#202" className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-sm shrink-0 mt-0.5',
                  isImpactForm ? 'bg-moss-100 text-moss-600' : 'bg-neutral-100 text-neutral-400',
                )}>
                  <BarChart3 data-eos-id="src/pages/admin/create-survey.tsx#203" size={16} />
                </span>
                <div data-eos-id="src/pages/admin/create-survey.tsx#204">
                  <p data-eos-id="src/pages/admin/create-survey.tsx#205" className="text-sm font-semibold text-neutral-900">Leader Impact Form</p>
                  <p data-eos-id="src/pages/admin/create-survey.tsx#206" className="text-[11px] text-neutral-400 mt-0.5">
                    Sent to collective leaders as a shared task after events. Answers linked to impact metrics
                    flow into the impact dashboard. One leader fills it out on behalf of the group.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Activity type - shown for both attendee feedback and impact forms */}
          {(autoSendAfterEvent || isImpactForm) && (
            <div data-eos-id="src/pages/admin/create-survey.tsx#207">
              <Dropdown data-eos-id="src/pages/admin/create-survey.tsx#208"
                label="Activity Type"
                options={[
                  ...(!isImpactForm ? [{ value: '', label: 'All activity types' }] : []),
                  ...ACTIVITY_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
                ]}
                value={activityType}
                onChange={setActivityType}
              />
              {isImpactForm && !activityType && (
                <p data-eos-id="src/pages/admin/create-survey.tsx#209" className="text-[11px] text-warning-600 mt-1.5 flex items-center gap-1">
                  <AlertCircle data-eos-id="src/pages/admin/create-survey.tsx#210" size={11} />
                  Impact forms must be linked to an activity type
                </p>
              )}
            </div>
          )}

          {/* Impact form guidance */}
          {isImpactForm && (
            <div data-eos-id="src/pages/admin/create-survey.tsx#211" className="rounded-sm bg-moss-50 border border-moss-100 px-3.5 py-3">
              <p data-eos-id="src/pages/admin/create-survey.tsx#212" className="text-[11px] text-moss-700 leading-relaxed">
                <strong data-eos-id="src/pages/admin/create-survey.tsx#213">How it works:</strong> When an event of this type is completed, a shared task is
                automatically created for the collective&apos;s leaders. Any leader, co-leader, or assist-leader
                can fill it out - only one submission is needed. Number questions linked to impact metrics will
                update the event&apos;s impact stats automatically.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Questions section */}
      <section data-eos-id="src/pages/admin/create-survey.tsx#214" className="mb-6">
        <div data-eos-id="src/pages/admin/create-survey.tsx#215" className="flex items-center justify-between mb-4">
          <h2 data-eos-id="src/pages/admin/create-survey.tsx#216" className="text-sm font-semibold text-neutral-900">
            Questions{questions.length > 0 && ` (${questions.length})`}
          </h2>
        </div>

        {questions.length === 0 ? (
          <div data-eos-id="src/pages/admin/create-survey.tsx#217" className="flex flex-col items-center justify-center py-10 px-4 rounded-md border-2 border-dashed border-neutral-200 bg-neutral-50/30">
            <div data-eos-id="src/pages/admin/create-survey.tsx#218" className="flex items-center justify-center w-12 h-12 rounded-sm bg-neutral-100 mb-3">
              <ClipboardList data-eos-id="src/pages/admin/create-survey.tsx#219" size={24} className="text-neutral-400" />
            </div>
            <p data-eos-id="src/pages/admin/create-survey.tsx#220" className="text-sm font-medium text-neutral-500 text-center">
              No questions yet
            </p>
            <p data-eos-id="src/pages/admin/create-survey.tsx#221" className="text-xs text-neutral-400 text-center mt-1">
              Add your first question below
            </p>
          </div>
        ) : (
          <div data-eos-id="src/pages/admin/create-survey.tsx#222" className="space-y-2.5">
            <AnimatePresence data-eos-id="src/pages/admin/create-survey.tsx#223" mode="popLayout">
              {questions.map((q, i) => (
                <QuestionEditor data-eos-id="src/pages/admin/create-survey.tsx#224"
                  key={q.id}
                  question={q}
                  index={i}
                  onChange={(updated) => updateQuestion(q.id, updated)}
                  onRemove={() => removeQuestion(q.id)}
                  onMoveUp={() => moveQuestion(i, -1)}
                  onMoveDown={() => moveQuestion(i, 1)}
                  isFirst={i === 0}
                  isLast={i === questions.length - 1}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* Add question buttons */}
      <section data-eos-id="src/pages/admin/create-survey.tsx#225" className="rounded-md border border-neutral-200 bg-neutral-50 overflow-hidden shadow-sm mb-6">
        <div data-eos-id="src/pages/admin/create-survey.tsx#226" className="flex items-center gap-2.5 px-5 py-3.5 border-b border-neutral-100 bg-neutral-50/50">
          <div data-eos-id="src/pages/admin/create-survey.tsx#227" className="flex items-center justify-center w-7 h-7 rounded-sm bg-primary-500 text-white">
            <Plus data-eos-id="src/pages/admin/create-survey.tsx#228" size={15} />
          </div>
          <h3 data-eos-id="src/pages/admin/create-survey.tsx#229" className="text-sm font-semibold text-neutral-900">Add Question</h3>
        </div>

        <div data-eos-id="src/pages/admin/create-survey.tsx#230" className="p-3 sm:p-4">
          {/* Mobile: compact 3-col icon grid with label below */}
          <div data-eos-id="src/pages/admin/create-survey.tsx#231" className="grid grid-cols-3 gap-2 sm:hidden">
            {QUESTION_TYPES.map((qt) => (
              <button data-eos-id="src/pages/admin/create-survey.tsx#232"
                key={qt.value}
                type="button"
                onClick={() => addQuestion(qt.value)}
                className={cn(
                  'flex flex-col items-center gap-1.5 px-2 py-3 rounded-sm text-center',
                  'bg-white border border-neutral-100/60',
                  'active:bg-neutral-100 active:scale-[0.98]',
                  'transition-[colors,transform] duration-150 cursor-pointer group select-none',
                )}
              >
                <span data-eos-id="src/pages/admin/create-survey.tsx#233" data-eos-var="qt.icon" data-eos-var-label="Icon" data-eos-var-scope="item" className="flex items-center justify-center w-9 h-9 rounded-sm bg-primary-50 text-neutral-500 group-active:bg-primary-100 transition-colors">
                  {qt.icon}
                </span>
                <p data-eos-id="src/pages/admin/create-survey.tsx#234" data-eos-var="qt.label" data-eos-var-label="Label" data-eos-var-scope="item" data-eos-var-src="literal" className="text-[11px] font-medium text-neutral-700 leading-tight">{qt.label}</p>
              </button>
            ))}
          </div>

          {/* Desktop: 4-col with icon + label + description */}
          <div data-eos-id="src/pages/admin/create-survey.tsx#235" className="hidden sm:grid sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {QUESTION_TYPES.map((qt) => (
              <button data-eos-id="src/pages/admin/create-survey.tsx#236"
                key={qt.value}
                type="button"
                onClick={() => addQuestion(qt.value)}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-left',
                  'bg-white border border-neutral-100/60 hover:border-primary-200 hover:bg-neutral-50/50',
                  'active:bg-neutral-100 active:scale-[0.98]',
                  'transition-[colors,transform] duration-150 cursor-pointer group select-none',
                )}
              >
                <span data-eos-id="src/pages/admin/create-survey.tsx#237" data-eos-var="qt.icon" data-eos-var-label="Icon" data-eos-var-scope="item" className="flex items-center justify-center w-7 h-7 rounded-sm bg-primary-50 text-neutral-500 group-hover:bg-primary-100 transition-colors shrink-0">
                  {qt.icon}
                </span>
                <div data-eos-id="src/pages/admin/create-survey.tsx#238">
                  <p data-eos-id="src/pages/admin/create-survey.tsx#239" data-eos-var="qt.label" data-eos-var-label="Label" data-eos-var-scope="item" data-eos-var-src="literal" className="text-xs font-medium text-neutral-700">{qt.label}</p>
                  <p data-eos-id="src/pages/admin/create-survey.tsx#240" data-eos-var="qt.description" data-eos-var-label="Description" data-eos-var-scope="item" data-eos-var-src="literal" className="text-[10px] text-neutral-400">{qt.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Validation errors */}
      <AnimatePresence data-eos-id="src/pages/admin/create-survey.tsx#241">
        {validationErrors.length > 0 && (
          <motion.section data-eos-id="src/pages/admin/create-survey.tsx#242"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="rounded-sm bg-error-50 border border-error-200 p-4 mb-6"
          >
            <div data-eos-id="src/pages/admin/create-survey.tsx#243" className="flex items-start gap-2">
              <AlertCircle data-eos-id="src/pages/admin/create-survey.tsx#244" size={16} className="text-error-500 mt-0.5 shrink-0" />
              <div data-eos-id="src/pages/admin/create-survey.tsx#245">
                <p data-eos-id="src/pages/admin/create-survey.tsx#246" className="text-sm font-medium text-error-700 mb-1">Please fix the following:</p>
                <ul data-eos-id="src/pages/admin/create-survey.tsx#247" className="space-y-0.5">
                  {validationErrors.map((err) => (
                    <li data-eos-id="src/pages/admin/create-survey.tsx#248" key={err} className="text-xs text-error-600">{err}</li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Submit bar - fixed above bottom tab bar */}
      <div data-eos-id="src/pages/admin/create-survey.tsx#249" className="fixed bottom-[calc(56px+var(--safe-bottom)+0.75rem)] sm:bottom-4 inset-x-0 z-30 pointer-events-none px-4 sm:px-6">
        <div data-eos-id="src/pages/admin/create-survey.tsx#250" className="max-w-4xl mx-auto pointer-events-auto">
          <div data-eos-id="src/pages/admin/create-survey.tsx#251" className="rounded-md bg-white/95 backdrop-blur-sm border border-neutral-100 shadow-sm px-4 py-3">
            {/* Status line - mobile only */}
            <div data-eos-id="src/pages/admin/create-survey.tsx#252" className="mb-2 sm:hidden">
              {questions.length === 0 ? (
                <p data-eos-id="src/pages/admin/create-survey.tsx#253" className="text-xs text-neutral-400">Add at least one question</p>
              ) : !title.trim() ? (
                <p data-eos-id="src/pages/admin/create-survey.tsx#254" className="text-xs text-neutral-400">Add a survey title</p>
              ) : (
                <p data-eos-id="src/pages/admin/create-survey.tsx#255" className="text-xs text-neutral-500 font-medium">
                  {questions.length} question{questions.length !== 1 ? 's' : ''} ready
                  {questions.filter((q) => q.required).length > 0 && (
                    <span data-eos-id="src/pages/admin/create-survey.tsx#256" data-eos-var="q.required" data-eos-var-label="Required" data-eos-var-scope="prop" className="text-neutral-400">
                      {' '}({questions.filter((q) => q.required).length} required)
                    </span>
                  )}
                </p>
              )}
            </div>

            <div data-eos-id="src/pages/admin/create-survey.tsx#257" className="flex items-center gap-3">
              {/* Desktop status */}
              <div data-eos-id="src/pages/admin/create-survey.tsx#258" className="flex-1 min-w-0 hidden sm:block">
                {questions.length === 0 ? (
                  <p data-eos-id="src/pages/admin/create-survey.tsx#259" className="text-xs text-neutral-400">Add at least one question</p>
                ) : !title.trim() ? (
                  <p data-eos-id="src/pages/admin/create-survey.tsx#260" className="text-xs text-neutral-400">Add a survey title</p>
                ) : (
                  <p data-eos-id="src/pages/admin/create-survey.tsx#261" className="text-xs text-neutral-500 font-medium">
                    {questions.length} question{questions.length !== 1 ? 's' : ''} ready
                    {questions.filter((q) => q.required).length > 0 && (
                      <span data-eos-id="src/pages/admin/create-survey.tsx#262" data-eos-var="q.required" data-eos-var-label="Required" data-eos-var-scope="prop" className="text-neutral-400">
                        {' '}({questions.filter((q) => q.required).length} required)
                      </span>
                    )}
                  </p>
                )}
              </div>
              <Button data-eos-id="src/pages/admin/create-survey.tsx#263"
                variant="ghost"
                size="sm"
                onClick={() => navigate('/admin/surveys')}
                className="flex-1 sm:flex-none"
              >
                Cancel
              </Button>
              <Button data-eos-id="src/pages/admin/create-survey.tsx#264"
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                loading={saveMutation.isPending}
                disabled={!title.trim() || questions.length === 0}
                icon={isEdit ? <Pencil data-eos-id="src/pages/admin/create-survey.tsx#265" size={15} /> : <Check data-eos-id="src/pages/admin/create-survey.tsx#266" size={15} />}
                className="flex-1 sm:flex-none"
              >
                {isEdit ? 'Save Changes' : 'Create Survey'}
              </Button>
            </div>
          </div>
        </div>
      </div>
      {/* Spacer so content isn't hidden behind fixed bar */}
      <div data-eos-id="src/pages/admin/create-survey.tsx#267" className="h-24 sm:h-20" />
    </div>
  )
}
