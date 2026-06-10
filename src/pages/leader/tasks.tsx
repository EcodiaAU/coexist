import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
    CheckCircle, Clock,
    AlertTriangle, ChevronRight, ChevronLeft,
    Calendar as CalendarIcon, FileText,
    SkipForward, Flame, Sparkles, Users,
    ClipboardList, BarChart3,
    Plus, Pencil, Eye, Trash2, List,
    Circle, CheckCircle2, GripVertical, Flag,
} from 'lucide-react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useLeaderHeader } from '@/components/leader-layout'
import { Header } from '@/components/header'
import { SegmentedControl } from '@/components/segmented-control'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { BottomSheet } from '@/components/bottom-sheet'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { TaskSurveyModal } from '@/components/task-survey-modal'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { useOffline } from '@/hooks/use-offline'
import { queueOfflineAction } from '@/lib/offline-sync'
import {
    useMyTasks,
    useCompleteTask,
    useUpdateTaskNotes,
    useUndoCompleteTask,
    useSkipTask,
    useGenerateTaskInstances,
    useGroupedTasks,
    type MyTask,
} from '@/hooks/use-tasks'
import {
    usePendingImpactFormTasks,
    type ImpactFormTask,
} from '@/hooks/use-impact-form-tasks'
import { CATEGORY_COLORS } from '@/hooks/use-admin-tasks'
import {
    useLeaderTodos,
    useCreateTodo,
    useUpdateTodo,
    useToggleTodo,
    useDeleteTodo,
    PRIORITY_CONFIG,
    type LeaderTodo,
    type TodoPriority,
} from '@/hooks/use-leader-todos'

/* ------------------------------------------------------------------ */
/*  Shared constants                                                   */
/* ------------------------------------------------------------------ */

type ActiveTab = 'tasks' | 'todos'

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']


/* ------------------------------------------------------------------ */
/*  Todo helpers                                                       */
/* ------------------------------------------------------------------ */

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000)

  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'

  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return m > 0 ? `${h12}:${String(m).padStart(2, '0')}${ampm}` : `${h12}${ampm}`
}

function isTodoOverdue(todo: LeaderTodo): boolean {
  if (todo.status !== 'pending' || !todo.due_date) return false
  const due = new Date(todo.due_date + 'T' + (todo.due_time ?? '23:59') + ':00')
  return due < new Date()
}

function isTodoDueToday(todo: LeaderTodo): boolean {
  if (!todo.due_date) return false
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return todo.due_date === today
}

function getMonthDays(year: number, month: number): Date[] {
  const days: Date[] = []
  const firstDay = new Date(year, month, 1)
  const startDate = new Date(firstDay)
  const dayOfWeek = startDate.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  startDate.setDate(startDate.getDate() + mondayOffset)

  for (let i = 0; i < 42; i++) {
    days.push(new Date(startDate))
    startDate.setDate(startDate.getDate() + 1)
  }
  return days
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* ================================================================== */
/*  TASKS TAB - Org-assigned task cards                                */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  Task card                                                          */
/* ------------------------------------------------------------------ */

function TaskCard({ task }: { task: MyTask }) {
  const [expanded, setExpanded] = useState(false)
  const initialNotes = (task as MyTask & { completion_notes?: string | null }).completion_notes ?? ''
  const [notes, setNotes] = useState(initialNotes)
  const [showSurvey, setShowSurvey] = useState(false)
  const { toast } = useToast()
  const { user } = useAuth()
  const { isOffline } = useOffline()
  const completeMutation = useCompleteTask()
  const updateNotesMutation = useUpdateTaskNotes()
  const undoCompleteMutation = useUndoCompleteTask()
  const skipMutation = useSkipTask()
  const shouldReduceMotion = useReducedMotion()
  const noteDirty = notes !== initialNotes

  const hasSurvey = !!task.template?.survey_id

  const surveySubmitMutation = useMutation({
    mutationFn: async (answers: Record<string, unknown>) => {
      if (!user || !task.template?.survey_id) return

      if (isOffline) {
        queueOfflineAction('survey-response', {
          surveyId: task.template.survey_id,
          userId: user.id,
          answers,
        })
        await completeMutation.mutateAsync({
          instanceId: task.id,
          notes: notes || undefined,
        })
        return
      }

      // Insert survey response FIRST and verify success. Previously the error
      // was unchecked - if RLS rejected the insert or a duplicate hit the
      // unique index, the survey response was silently lost but the task
      // was still marked complete, leaving the leader thinking they'd
      // submitted data that never reached the DB.
      const { error: respErr } = await supabase.from('survey_responses').insert({
        survey_id: task.template.survey_id,
        user_id: user.id,
        answers: answers as unknown as import('@/types/database.types').Json,
      })
      if (respErr) throw respErr
      await completeMutation.mutateAsync({
        instanceId: task.id,
        notes: notes || undefined,
      })
    },
    onSuccess: () => {
      toast.success(isOffline ? 'Survey & task saved offline - will sync when back online' : 'Survey submitted & task completed!')
      setShowSurvey(false)
      setExpanded(false)
      setNotes('')
    },
    onError: () => toast.error('Failed to submit survey'),
  })

  const now = new Date()
  const dueDate = new Date(task.due_date)
  const isOverdue = task.status === 'pending' && dueDate < now
  const isCompleted = task.status === 'completed'
  const isSkipped = task.status === 'skipped'

  const formattedDue = dueDate.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

  const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / 86400000)
  const urgency = isOverdue ? 'overdue' : daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : daysUntil <= 3 ? 'soon' : 'normal'

  const isShared = (task.template?.assignment_mode ?? 'collective') === 'collective' && !task.assigned_user_id

  const cardBg = isCompleted
    ? 'bg-neutral-50'
    : isSkipped
    ? 'bg-neutral-50'
    : urgency === 'overdue'
    ? 'bg-white border-l-4 border-l-error-400 shadow-sm'
    : urgency === 'today'
    ? 'bg-white border-l-4 border-l-warning-400 shadow-sm'
    : urgency === 'tomorrow'
    ? 'bg-white border-l-4 border-l-amber-300 shadow-sm'
    : urgency === 'soon'
    ? 'bg-white border-l-4 border-l-moss-400 shadow-sm'
    : 'bg-white shadow-sm border border-neutral-100'

  return (
    <motion.div
      layout={!shouldReduceMotion ? 'position' : false}
      className={cn(
        'rounded-2xl overflow-hidden transition-all duration-200',
        isCompleted && 'opacity-60',
        isSkipped && 'opacity-45',
        cardBg,
      )}
    >
      <div className="flex items-stretch">
        {!isCompleted && !isSkipped && (
          <div className={cn(
            'w-1.5 shrink-0 rounded-l-2xl',
            urgency === 'overdue' && 'bg-error-500',
            urgency === 'today' && 'bg-warning-500',
            urgency === 'tomorrow' && 'bg-amber-400',
            urgency === 'soon' && 'bg-moss-400',
            urgency === 'normal' && 'bg-primary-300',
          )} />
        )}

        <button
          type="button"
          onClick={() => !isCompleted && !isSkipped && setExpanded(!expanded)}
          className={cn(
            'flex-1 flex items-start gap-3 p-4 text-left cursor-pointer min-w-0 active:scale-[0.98] transition-transform duration-150',
            (isCompleted || isSkipped) && 'p-3',
          )}
        >
          <div className="mt-0.5 shrink-0">
            {isCompleted ? (
              <div className="w-6 h-6 rounded-full bg-success-500 flex items-center justify-center shadow-sm">
                <CheckCircle size={13} className="text-white" />
              </div>
            ) : isSkipped ? (
              <div className="w-6 h-6 rounded-full bg-primary-200 flex items-center justify-center">
                <SkipForward size={11} className="text-primary-400" />
              </div>
            ) : isOverdue ? (
              <div className="w-6 h-6 rounded-full bg-error-100 flex items-center justify-center animate-pulse shadow-sm">
                <AlertTriangle size={12} className="text-error-500" />
              </div>
            ) : (
              <div className={cn(
                'w-6 h-6 rounded-full border-2 transition-colors',
                urgency === 'today' ? 'border-warning-300' : urgency === 'tomorrow' ? 'border-amber-300' : urgency === 'soon' ? 'border-moss-300' : 'border-primary-200',
              )} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className={cn(
              'text-[13px] sm:text-sm font-semibold line-clamp-2 leading-snug',
              isCompleted || isSkipped ? 'text-neutral-400 line-through' : 'text-neutral-900',
            )}>
              {task.template?.title ?? 'Task'}
            </p>

            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {task.template?.category && (
                <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 uppercase tracking-wide', CATEGORY_COLORS[task.template.category])}>
                  {task.template.category.replace('_', ' ')}
                </span>
              )}

              {!isCompleted && !isSkipped && (
                isShared
                  ? <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 uppercase tracking-wide bg-neutral-100 text-neutral-500 flex items-center gap-0.5"><Users size={9} /> Shared</span>
                  : <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 uppercase tracking-wide bg-moss-100/80 text-moss-600">You</span>
              )}

              {!isCompleted && !isSkipped && (
                <span className={cn(
                  'text-[11px] font-medium flex items-center gap-1',
                  urgency === 'overdue' ? 'text-error-600 font-semibold' : urgency === 'today' ? 'text-warning-700 font-semibold' : 'text-neutral-500',
                )}>
                  <Clock size={10} />
                  {formattedDue}
                  {urgency === 'overdue' && ` · ${Math.abs(daysUntil)}d overdue`}
                  {urgency === 'today' && ' · Today'}
                  {urgency === 'tomorrow' && ' · Tomorrow'}
                </span>
              )}

              {task.event && !isCompleted && !isSkipped && (
                <span className="text-[11px] text-neutral-500 flex items-center gap-1">
                  <CalendarIcon size={10} />
                  {task.event.title}
                </span>
              )}
              {isCompleted && task.completer?.display_name && (
                <span className="text-[11px] text-success-600 flex items-center gap-1">
                  <CheckCircle size={10} />
                  {task.completer.display_name}
                </span>
              )}
            </div>
          </div>

          {!isCompleted && !isSkipped && (
            <div className="shrink-0 mt-1">
              <motion.div
                animate={{ rotate: expanded ? 90 : 0 }}
                transition={{ duration: 0.15 }}
              >
                <ChevronRight size={16} className={cn(
                  urgency === 'overdue' ? 'text-error-400' : urgency === 'today' ? 'text-warning-400' : 'text-primary-300',
                )} />
              </motion.div>
            </div>
          )}
        </button>
      </div>

      <AnimatePresence>
        {expanded && !isCompleted && !isSkipped && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pl-12 space-y-3">
              {task.template?.description && (
                <p className="text-xs text-neutral-500 leading-relaxed">{task.template.description}</p>
              )}
              {task.template?.attachment_url && (
                <a
                  href={task.template.attachment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-neutral-50 border border-neutral-100 hover:bg-neutral-100 transition-colors"
                >
                  <FileText size={18} className="text-primary-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-neutral-900 truncate">
                      {task.template.attachment_label || 'View Attachment'}
                    </p>
                    <p className="text-[11px] text-neutral-400">Tap to open</p>
                  </div>
                </a>
              )}
              <Input
                placeholder="Add a note (optional)..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                compact
              />
              {hasSurvey && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-plum-50 border border-plum-100 mb-1">
                  <ClipboardList size={14} className="text-plum-500 shrink-0" />
                  <p className="text-[11px] text-plum-600">
                    This task includes a survey that must be completed
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  icon={hasSurvey ? <ClipboardList size={14} /> : <CheckCircle size={14} />}
                  loading={completeMutation.isPending}
                  onClick={() => {
                    if (hasSurvey) {
                      setShowSurvey(true)
                    } else {
                      const noteAtCompletion = notes
                      completeMutation.mutate(
                        { instanceId: task.id, notes: notes || undefined },
                        {
                          onSuccess: () => {
                            toast.success('Task marked complete', {
                              action: {
                                label: 'Undo',
                                onClick: () => {
                                  undoCompleteMutation.mutate(task.id, {
                                    onSuccess: () => {
                                      // Restore the note the leader had typed
                                      setNotes(noteAtCompletion)
                                      setExpanded(true)
                                      toast.info('Restored - task is pending again')
                                    },
                                    onError: () => toast.error('Could not undo'),
                                  })
                                },
                              },
                              duration: 8000,
                            })
                            setExpanded(false)
                          },
                          onError: () => toast.error('Failed to complete task'),
                        },
                      )
                    }
                  }}
                >
                  {hasSurvey ? 'Complete & Fill Survey' : 'Mark complete'}
                </Button>
                {!hasSurvey && noteDirty && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<FileText size={14} />}
                    loading={updateNotesMutation.isPending}
                    onClick={() => {
                      updateNotesMutation.mutate(
                        { instanceId: task.id, notes },
                        {
                          onSuccess: () => {
                            toast.success('Note saved')
                          },
                          onError: () => toast.error('Failed to save note'),
                        },
                      )
                    }}
                  >
                    Save note
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<SkipForward size={14} />}
                  loading={skipMutation.isPending}
                  onClick={() => {
                    skipMutation.mutate(task.id, {
                      onSuccess: () => {
                        toast.success('Task skipped')
                        setExpanded(false)
                      },
                      onError: () => toast.error('Failed to skip task'),
                    })
                  }}
                >
                  Skip
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Survey modal */}
      {showSurvey && task.template?.survey_id && (
        <TaskSurveyModal
          open={showSurvey}
          onClose={() => setShowSurvey(false)}
          surveyId={task.template.survey_id}
          collectiveId={task.collective_id}
          onSubmit={(answers) => surveySubmitMutation.mutate(answers)}
          submitting={surveySubmitMutation.isPending}
        />
      )}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Collective group                                                   */
/* ------------------------------------------------------------------ */

function CollectiveGroup({
  name,
  tasks,
  pendingCount,
  overdueCount,
}: {
  name: string
  tasks: MyTask[]
  pendingCount: number
  overdueCount: number
}) {
  const [showCompleted, setShowCompleted] = useState(false)

  const pending = tasks.filter((t) => t.status === 'pending')
  const completed = tasks.filter((t) => t.status === 'completed' || t.status === 'skipped')

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <p className="text-xs font-bold text-neutral-900 uppercase tracking-wider">{name}</p>
        <div className="flex-1 h-px bg-neutral-100" />
        {overdueCount > 0 && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-error-50 text-error-600 flex items-center gap-1">
            <Flame size={10} /> {overdueCount}
          </span>
        )}
        {pendingCount > 0 && overdueCount === 0 && (
          <span className="text-[11px] font-semibold text-neutral-500">{pendingCount} to do</span>
        )}
      </div>

      <div className="space-y-1.5">
        {pending.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>

      {completed.length > 0 && (
        <button
          type="button"
          onClick={() => setShowCompleted(!showCompleted)}
          className="flex items-center gap-1.5 text-[11px] text-neutral-500 cursor-pointer select-none py-1 px-1 hover:text-neutral-700 active:scale-[0.97] transition-[colors,transform] duration-150"
        >
          <motion.div animate={{ rotate: showCompleted ? 90 : 0 }} transition={{ duration: 0.15 }}>
            <ChevronRight size={12} />
          </motion.div>
          {completed.length} completed
        </button>
      )}
      <AnimatePresence>
        {showCompleted && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-1 overflow-hidden"
          >
            {completed.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Impact Form Card                                                   */
/* ------------------------------------------------------------------ */

function ImpactFormCard({ task }: { task: ImpactFormTask }) {
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()

  const now = new Date()
  const dueDate = new Date(task.due_date)
  const eventEnd = new Date(task.date_end)
  const isOverdue = task.status === 'pending' && dueDate < now
  const isCompleted = task.status === 'completed'

  const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / 86400000)
  const urgency = isOverdue ? 'overdue' : daysUntilDue === 0 ? 'today' : daysUntilDue === 1 ? 'tomorrow' : 'normal'

  const formattedDue = dueDate.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

  const formattedEventDate = eventEnd.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    // Floating local time: stored wall-clock is the wall-clock.
    timeZone: 'UTC',
  })

  if (isCompleted) {
    return (
      <motion.div
        layout={!shouldReduceMotion ? 'position' : false}
        className="rounded-2xl bg-neutral-50 overflow-hidden opacity-60"
      >
        <div className="flex items-center gap-3 p-3">
          <div className="w-6 h-6 rounded-full bg-success-500 flex items-center justify-center shadow-sm shrink-0">
            <CheckCircle size={13} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] sm:text-sm font-semibold text-neutral-400 line-through line-clamp-2 leading-snug">{task.event_title}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[11px] text-success-600 flex items-center gap-1">
                <CheckCircle size={10} />
                {task.completed_by_name ? `Logged by ${task.completed_by_name}` : 'Impact logged'}
              </span>
              {task.completed_at && (
                <span className="text-[11px] text-neutral-400">
                  {new Date(task.completed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    )
  }

  const cardBg = urgency === 'overdue'
    ? 'bg-white border-l-4 border-l-error-400 shadow-sm'
    : urgency === 'today'
    ? 'bg-white border-l-4 border-l-warning-400 shadow-sm'
    : urgency === 'tomorrow'
    ? 'bg-white border-l-4 border-l-amber-300 shadow-sm'
    : 'bg-white border-l-4 border-l-moss-400 shadow-sm'

  return (
    <motion.div
      layout={!shouldReduceMotion ? 'position' : false}
      className={cn('rounded-2xl overflow-hidden transition-all duration-200', cardBg)}
    >
      <div className="flex items-stretch">
        <div className={cn(
          'w-1.5 shrink-0 rounded-l-2xl',
          urgency === 'overdue' && 'bg-error-500',
          urgency === 'today' && 'bg-warning-500',
          urgency === 'tomorrow' && 'bg-amber-400',
          urgency === 'normal' && 'bg-moss-400',
        )} />

        <button
          type="button"
          onClick={() => navigate(`/events/${task.event_id}/impact`)}
          className="flex-1 flex items-start gap-3 p-4 text-left cursor-pointer min-w-0 active:scale-[0.98] transition-transform duration-150"
        >
          <div className="mt-0.5 shrink-0">
            <div className={cn(
              'w-8 h-8 rounded-xl flex items-center justify-center',
              urgency === 'overdue' ? 'bg-error-100' : 'bg-moss-100',
            )}>
              <BarChart3 size={16} className={cn(
                urgency === 'overdue' ? 'text-error-500' : 'text-moss-600',
              )} />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[13px] sm:text-sm font-semibold text-neutral-900 line-clamp-2 leading-snug">{task.event_title}</p>

            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 uppercase tracking-wide bg-moss-100/80 text-moss-700">
                Log Impact
              </span>

              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 uppercase tracking-wide bg-neutral-100 text-neutral-500 flex items-center gap-0.5">
                <Users size={9} /> Shared
              </span>

              <span className={cn(
                'text-[11px] font-medium flex items-center gap-1',
                urgency === 'overdue' ? 'text-error-600 font-semibold' : urgency === 'today' ? 'text-warning-700 font-semibold' : 'text-neutral-500',
              )}>
                <Clock size={10} />
                Due {formattedDue}
                {urgency === 'overdue' && ` · ${Math.abs(daysUntilDue)}d overdue`}
                {urgency === 'today' && ' · Today'}
              </span>
            </div>

            {task.collective_name && (
              <p className="text-[11px] text-neutral-500 mt-1">
                {task.collective_name} · {formattedEventDate}
              </p>
            )}
          </div>

          <div className="shrink-0 mt-1">
            <ChevronRight size={16} className={cn(
              urgency === 'overdue' ? 'text-error-400' : 'text-moss-400',
            )} />
          </div>
        </button>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Tasks tab content                                                  */
/* ------------------------------------------------------------------ */

function TasksTabContent({ rm }: { rm: boolean }) {
  const queryClient = useQueryClient()
  const { data: tasks, isLoading, isError } = useMyTasks()
  const { data: impactFormTasks } = usePendingImpactFormTasks()
  const showLoading = useDelayedLoading(isLoading)
  const generateMutation = useGenerateTaskInstances()
  const groups = useGroupedTasks(tasks)

  useEffect(() => {
    generateMutation.mutate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRefresh = useCallback(async () => {
    await generateMutation.mutateAsync()
    await queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
    await queryClient.invalidateQueries({ queryKey: ['pending-impact-form-tasks'] })
  }, [generateMutation, queryClient])

  const [showCompletedImpact, setShowCompletedImpact] = useState(false)
  const pendingImpactForms = (impactFormTasks ?? []).filter((t) => t.status === 'pending')
  const completedImpactForms = (impactFormTasks ?? []).filter((t) => t.status === 'completed')
  const impactFormOverdue = pendingImpactForms.filter((t) => new Date(t.due_date) < new Date()).length

  const totalPending = groups.reduce((sum, g) => sum + g.pendingCount, 0) + pendingImpactForms.length
  const totalOverdue = groups.reduce((sum, g) => sum + g.overdueCount, 0) + impactFormOverdue
  const totalCompleted = groups.reduce((sum, g) => g.tasks.filter((t) => t.status === 'completed').length + sum, 0) + completedImpactForms.length

  if (showLoading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
        <Skeleton variant="list-item" count={5} />
      </div>
    )
  }

  if (isError) {
    return (
      <EmptyState
        illustration="error"
        title="Couldn't load tasks"
        description="Something went wrong loading your tasks. Try refreshing."
        action={{ label: 'Retry', onClick: handleRefresh }}
      />
    )
  }

  const hasAnyTasks = groups.length > 0 || pendingImpactForms.length > 0 || completedImpactForms.length > 0

  if (!hasAnyTasks) {
    return (
      <div className="flex flex-col items-center justify-center py-8 sm:py-12">
        <motion.div
          initial={rm ? undefined : { scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25, mass: 0.8 }}
          className="w-20 h-20 rounded-3xl bg-moss-50 flex items-center justify-center mb-5"
        >
          <Sparkles size={36} className="text-moss-500" />
        </motion.div>
        <p className="font-heading text-xl font-bold text-neutral-900 mb-1">All caught up!</p>
        <p className="text-sm text-neutral-500">No tasks right now. Enjoy the moment.</p>
      </div>
    )
  }

  const total = totalPending + totalCompleted
  const progressPct = total > 0 ? Math.round((totalCompleted / total) * 100) : 0

  return (
    <div className="space-y-5">
      {/* Momentum dashboard */}
      <motion.div
        variants={rm ? undefined : { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } } }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        <div className="rounded-2xl bg-white border border-neutral-100 p-4 flex flex-col items-center justify-center text-center">
          <div className="relative w-12 h-12 mb-2">
            <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-moss-200/60" />
              <motion.circle
                cx="18" cy="18" r="15" fill="none" strokeWidth="3" strokeLinecap="round"
                className="text-moss-500"
                strokeDasharray={`${progressPct * 0.942} 100`}
                initial={{ strokeDasharray: '0 100' }}
                animate={{ strokeDasharray: `${progressPct * 0.942} 100` }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-moss-700">
              {progressPct}%
            </span>
          </div>
          <p className="text-[11px] font-semibold text-moss-500 uppercase tracking-wider">Done</p>
        </div>

        <div className={cn(
          'rounded-2xl p-4 flex flex-col items-center justify-center text-center',
          totalOverdue > 0
            ? 'bg-white border-l-4 border-l-error-400'
            : 'bg-white border border-neutral-100',
        )}>
          <p className={cn(
            'font-heading text-2xl font-extrabold tabular-nums leading-none',
            totalOverdue > 0 ? 'text-error-600' : 'text-neutral-400',
          )}>
            {totalOverdue}
          </p>
          <p className={cn(
            'text-[11px] font-semibold uppercase tracking-wider mt-1.5',
            totalOverdue > 0 ? 'text-error-400' : 'text-neutral-400',
          )}>Overdue</p>
        </div>
      </motion.div>

      {/* Impact form tasks + regular task groups */}
        <div className="space-y-6">
          {/* Impact form tasks - shown above regular tasks with high priority */}
          {(pendingImpactForms.length > 0 || completedImpactForms.length > 0) && (
            <motion.div
              variants={rm ? undefined : { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } } }}
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <BarChart3 size={12} className="text-moss-500" />
                  <p className="text-xs font-bold text-moss-700 uppercase tracking-wider">Log Impact</p>
                  <div className="flex-1 h-px bg-moss-200/60" />
                  {impactFormOverdue > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-error-50 text-error-600 flex items-center gap-1">
                      <Flame size={10} /> {impactFormOverdue}
                    </span>
                  )}
                  {pendingImpactForms.length > 0 && impactFormOverdue === 0 && (
                    <span className="text-[11px] font-semibold text-moss-500">{pendingImpactForms.length} to log</span>
                  )}
                </div>

                {pendingImpactForms.map((task) => (
                  <ImpactFormCard key={task.id} task={task} />
                ))}

                {completedImpactForms.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowCompletedImpact(!showCompletedImpact)}
                    className="flex items-center gap-1.5 text-[11px] text-neutral-500 cursor-pointer select-none py-1 px-1 hover:text-neutral-700 active:scale-[0.97] transition-[colors,transform] duration-150"
                  >
                    <motion.div animate={{ rotate: showCompletedImpact ? 90 : 0 }} transition={{ duration: 0.15 }}>
                      <ChevronRight size={12} />
                    </motion.div>
                    {completedImpactForms.length} logged
                  </button>
                )}
                <AnimatePresence>
                  {showCompletedImpact && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-1 overflow-hidden"
                    >
                      {completedImpactForms.map((task) => (
                        <ImpactFormCard key={task.id} task={task} />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* Regular task groups */}
          {groups.map((group) => (
            <motion.div
              key={group.collective_id}
              variants={rm ? undefined : { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } } }}
            >
              <CollectiveGroup
                name={group.collective_name}
                tasks={group.tasks}
                pendingCount={group.pendingCount}
                overdueCount={group.overdueCount}
              />
            </motion.div>
          ))}
        </div>
    </div>
  )
}

/* ================================================================== */
/*  TODOS TAB - Personal to-do items                                   */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  Create / Edit Modal                                                */
/* ------------------------------------------------------------------ */

function TodoModal({
  open,
  onClose,
  todo,
}: {
  open: boolean
  onClose: () => void
  todo?: LeaderTodo | null
}) {
  const { toast } = useToast()
  const createMutation = useCreateTodo()
  const updateMutation = useUpdateTodo()

  const [title, setTitle] = useState(todo?.title ?? '')
  const [description, setDescription] = useState(todo?.description ?? '')
  const [dueDate, setDueDate] = useState(todo?.due_date ?? '')
  const [dueTime, setDueTime] = useState(todo?.due_time?.slice(0, 5) ?? '')
  const [priority, setPriority] = useState<TodoPriority>(todo?.priority ?? 'medium')

  const isEdit = !!todo

  const handleSave = () => {
    const input = {
      title: title.trim(),
      description: description.trim() || undefined,
      due_date: dueDate || null,
      due_time: dueTime ? dueTime + ':00' : null,
      priority,
    }

    if (isEdit) {
      updateMutation.mutate(
        { id: todo.id, ...input },
        {
          onSuccess: () => { toast.success('Updated'); onClose() },
          onError: () => toast.error('Failed to update'),
        },
      )
    } else {
      createMutation.mutate(
        input,
        {
          onSuccess: () => { toast.success('Added to your list'); onClose() },
          onError: () => toast.error('Failed to create'),
        },
      )
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      {/*
        Layout note (Issue 2 fix, 2026-04-29): the Save action lives at the
        BOTTOM of the BottomSheet's scroll container. On Android the soft
        keyboard often hides the action button - users see "no Save button
        anywhere" (Brendan, Samsung leader). We pin the action bar with
        sticky bottom-0 so it stays visible above keyboard insets even when
        keyboardHeight reporting from Capacitor lags or fails.
      */}
      <div className="pt-2 pb-2 space-y-4">
        <h2 className="font-heading text-lg font-bold text-neutral-900">{isEdit ? 'Edit To-Do' : 'New To-Do'}</h2>
        <Input
          label="What do you need to do?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Finalise event volunteer list"
          required
        />
        <Input
          label="Notes"
          type="textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Any extra details..."
        />
        <div className="grid grid-cols-2 gap-3 min-w-0">
          <Input
            label="Due date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <Input
            label="Time"
            type="time"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
          />
        </div>

        {/* Priority selector */}
        <div>
          <p className="text-sm font-medium text-neutral-900 mb-2">Priority</p>
          <div className="flex gap-1.5">
            {PRIORITY_OPTIONS.map((opt) => {
              const cfg = PRIORITY_CONFIG[opt.value as TodoPriority]
              const active = priority === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPriority(opt.value as TodoPriority)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl text-sm cursor-pointer transition-all duration-150',
                    active
                      ? 'bg-neutral-100 border border-neutral-200 font-medium shadow-sm'
                      : 'bg-white border border-neutral-100 hover:bg-neutral-50 text-neutral-500',
                  )}
                >
                  <div className={cn('w-2 h-2 rounded-full', cfg.dot)} />
                  <span className={active ? cfg.color : undefined}>{opt.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/*
        Sticky action bar - lives inside the BottomSheet scroll container so
        it pins to the bottom of the visible area even when the keyboard is
        up. White background + top border so it reads as a separate band.
      */}
      <div
        className="sticky bottom-0 left-0 right-0 -mx-5 px-5 py-3 bg-surface-0 border-t border-neutral-100"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.75rem)' }}
      >
        <Button
          variant="primary"
          fullWidth
          onClick={handleSave}
          loading={createMutation.isPending || updateMutation.isPending}
          disabled={!title.trim()}
        >
          {isEdit ? 'Save Changes' : 'Add To-Do'}
        </Button>
      </div>
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Todo Item Card                                                     */
/* ------------------------------------------------------------------ */

function TodoItem({
  todo,
  editMode,
  onEdit,
  onDelete,
}: {
  todo: LeaderTodo
  editMode: boolean
  onEdit: (todo: LeaderTodo) => void
  onDelete: (id: string) => void
}) {
  const toggleMutation = useToggleTodo()
  const { toast } = useToast()
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const completed = todo.status === 'completed'
  const overdue = isTodoOverdue(todo)
  const today = isTodoDueToday(todo)
  const cfg = PRIORITY_CONFIG[todo.priority]

  return (
    <motion.div
      layout={!rm}
      initial={rm ? undefined : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={rm ? undefined : { opacity: 0, x: -20, transition: { duration: 0.15 } }}
      className={cn(
        'group relative flex items-start gap-3 px-4 py-3.5 rounded-2xl transition-colors duration-150',
        completed
          ? 'bg-neutral-50'
          : overdue
            ? 'bg-white border-l-4 border-l-error-400 shadow-sm'
            : today
              ? 'bg-white border-l-4 border-l-warning-400 shadow-sm'
              : 'bg-white shadow-sm',
      )}
    >
      {/* Edit mode grip */}
      {editMode && (
        <div className="flex items-center self-center text-neutral-400 cursor-grab">
          <GripVertical size={16} />
        </div>
      )}

      {/* Checkbox */}
      <button
        type="button"
        onClick={() => {
          toggleMutation.mutate(
            { id: todo.id, completed: !completed },
            {
              onError: () => toast.error('Failed to update'),
            },
          )
        }}
        className={cn(
          'mt-0.5 shrink-0 cursor-pointer transition-all duration-200',
          completed ? 'text-moss-500' : overdue ? 'text-error-400 hover:text-error-500' : 'text-neutral-400 hover:text-neutral-600',
        )}
      >
        {completed ? (
          <CheckCircle2 size={22} strokeWidth={2} />
        ) : (
          <Circle size={22} strokeWidth={1.5} />
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm font-medium leading-snug transition-all duration-200',
          completed ? 'text-neutral-400 line-through' : 'text-neutral-900',
        )}>
          {todo.title}
        </p>
        {todo.description && !completed && (
          <p className="text-xs text-neutral-500 line-clamp-2 mt-0.5">{todo.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {/* Priority indicator */}
          {todo.priority !== 'medium' && (
            <span className={cn('flex items-center gap-1 text-[11px] font-medium', cfg.color)}>
              <Flag size={10} />
              {cfg.label}
            </span>
          )}
          {/* Due info */}
          {todo.due_date && !completed && (
            <span className={cn(
              'flex items-center gap-1 text-[11px] font-medium',
              overdue ? 'text-error-600' : today ? 'text-warning-600' : 'text-neutral-500',
            )}>
              {overdue ? <Flame size={10} /> : <Clock size={10} />}
              {formatDate(todo.due_date)}
              {todo.due_time && ` at ${formatTime(todo.due_time)}`}
            </span>
          )}
          {todo.source_template_id && (
            <span className="text-[11px] text-neutral-400 italic">from task</span>
          )}
        </div>
      </div>

      {/* Actions */}
      {editMode && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => onEdit(todo)}
            className="p-2 rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 cursor-pointer transition-colors"
            title="Edit"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(todo.id)}
            className="p-2 rounded-xl text-neutral-400 hover:bg-error-50 hover:text-error-600 cursor-pointer transition-colors"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Calendar View                                                      */
/* ------------------------------------------------------------------ */

function CalendarView({
  todos,
  editMode,
  onEdit,
  onDelete,
  onDateClick,
}: {
  todos: LeaderTodo[]
  editMode: boolean
  onEdit: (todo: LeaderTodo) => void
  onDelete: (id: string) => void
  onDateClick: (date: string) => void
}) {
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth())
  const [calYear, setCalYear] = useState(() => new Date().getFullYear())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion

  const days = useMemo(() => getMonthDays(calYear, calMonth), [calYear, calMonth])
  const todayKey = toDateKey(new Date())

  const todosByDate = useMemo(() => {
    const map = new Map<string, LeaderTodo[]>()
    for (const todo of todos) {
      if (!todo.due_date) continue
      const key = todo.due_date
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(todo)
    }
    return map
  }, [todos])

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1) }
    else setCalMonth(calMonth - 1)
  }

  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1) }
    else setCalMonth(calMonth + 1)
  }

  const selectedTodos = selectedDate ? (todosByDate.get(selectedDate) ?? []) : []

  return (
    <div className="space-y-4">
      {/* Month header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={prevMonth}
          className="p-2 rounded-xl hover:bg-neutral-100 cursor-pointer transition-colors text-neutral-500"
        >
          <ChevronLeft size={18} />
        </button>
        <h3 className="text-sm font-bold text-neutral-900">
          {MONTHS[calMonth]} {calYear}
        </h3>
        <button
          type="button"
          onClick={nextMonth}
          className="p-2 rounded-xl hover:bg-neutral-100 cursor-pointer transition-colors text-neutral-500"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-px">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-[11px] font-semibold text-neutral-400 uppercase tracking-wider py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          const key = toDateKey(day)
          const isCurrentMonth = day.getMonth() === calMonth
          const isToday = key === todayKey
          const isSelected = key === selectedDate
          const dayTodos = todosByDate.get(key) ?? []
          const hasTodos = dayTodos.length > 0
          const hasOverdue = dayTodos.some(isTodoOverdue)
          const allDone = hasTodos && dayTodos.every((t) => t.status === 'completed')

          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                setSelectedDate(isSelected ? null : key)
                if (!isSelected) onDateClick(key)
              }}
              className={cn(
                'relative flex flex-col items-center justify-center py-2 rounded-xl cursor-pointer transition-all duration-150',
                !isCurrentMonth && 'opacity-30',
                isSelected
                  ? 'bg-primary-700 text-white shadow-md'
                  : isToday
                    ? 'bg-primary-100 text-primary-800 font-bold'
                    : 'hover:bg-neutral-50 text-neutral-700',
              )}
            >
              <span className={cn('text-sm tabular-nums', isSelected ? 'font-bold' : 'font-medium')}>
                {day.getDate()}
              </span>
              {hasTodos && (
                <div className="flex gap-0.5 mt-0.5">
                  {hasOverdue && !isSelected ? (
                    <div className="w-1.5 h-1.5 rounded-full bg-error-500" />
                  ) : allDone && !isSelected ? (
                    <div className="w-1.5 h-1.5 rounded-full bg-moss-500" />
                  ) : (
                    <div className={cn('w-1.5 h-1.5 rounded-full', isSelected ? 'bg-white/70' : 'bg-primary-400')} />
                  )}
                  {dayTodos.length > 1 && (
                    <div className={cn('w-1.5 h-1.5 rounded-full', isSelected ? 'bg-white/50' : 'bg-primary-300')} />
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Selected date todos */}
      <AnimatePresence mode="wait">
        {selectedDate && (
          <motion.div
            key={selectedDate}
            initial={rm ? undefined : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={rm ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="space-y-2"
          >
            <div className="flex items-center gap-2 px-1 pt-2">
              <p className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                {formatDate(selectedDate)}
              </p>
              <div className="flex-1 h-px bg-neutral-100" />
              <span className="text-[11px] text-neutral-500">{selectedTodos.length} item{selectedTodos.length !== 1 ? 's' : ''}</span>
            </div>

            {selectedTodos.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-neutral-500">Nothing scheduled</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {selectedTodos.map((todo) => (
                  <TodoItem key={todo.id} todo={todo} editMode={editMode} onEdit={onEdit} onDelete={onDelete} />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Todos tab content                                                  */
/* ------------------------------------------------------------------ */

interface TodosTabContentProps {
  rm: boolean
  /** Lifted to page level so the Add button is reachable from the Tasks tab too. */
  showCreate: boolean
  setShowCreate: (open: boolean) => void
}

function TodosTabContent({ rm, showCreate, setShowCreate }: TodosTabContentProps) {
  const { toast } = useToast()

  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [editMode, setEditMode] = useState(false)
  const [editTodo, setEditTodo] = useState<LeaderTodo | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)

  const { data: todos, isLoading } = useLeaderTodos()
  const showLoading = useDelayedLoading(isLoading)
  const deleteMutation = useDeleteTodo()

  const pendingTodos = useMemo(
    () => (todos ?? []).filter((t) => t.status === 'pending').sort((a, b) => {
      const aOverdue = isTodoOverdue(a)
      const bOverdue = isTodoOverdue(b)
      if (aOverdue && !bOverdue) return -1
      if (!aOverdue && bOverdue) return 1

      const priorityRank: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date) || (priorityRank[a.priority] - priorityRank[b.priority])
      if (a.due_date && !b.due_date) return -1
      if (!a.due_date && b.due_date) return 1
      return priorityRank[a.priority] - priorityRank[b.priority]
    }),
    [todos],
  )

  const completedTodos = useMemo(
    () => (todos ?? []).filter((t) => t.status === 'completed').sort((a, b) => {
      if (!a.completed_at || !b.completed_at) return 0
      return b.completed_at.localeCompare(a.completed_at)
    }),
    [todos],
  )

  const overdueCount = useMemo(() => pendingTodos.filter(isTodoOverdue).length, [pendingTodos])

  const handleDateClick = useCallback((date: string) => {
    void date
  }, [])

  if (showLoading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
        <Skeleton variant="list-item" count={5} />
      </div>
    )
  }

  return (
    <>
      {/* Quick stats */}
      <motion.div
        variants={rm ? undefined : { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } } }}
        className="grid grid-cols-3 gap-2"
      >
        <div className="rounded-2xl bg-white/80 backdrop-blur-sm p-3 text-center shadow-sm">
          <p className="font-heading text-xl font-extrabold text-neutral-900 tabular-nums">{pendingTodos.length}</p>
          <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">To do</p>
        </div>
        <div className={cn(
          'rounded-2xl p-3 text-center shadow-sm',
          overdueCount > 0 ? 'bg-error-50/80' : 'bg-white/80 backdrop-blur-sm',
        )}>
          <p className={cn(
            'font-heading text-xl font-extrabold tabular-nums',
            overdueCount > 0 ? 'text-error-600' : 'text-neutral-400',
          )}>{overdueCount}</p>
          <p className={cn(
            'text-[11px] font-semibold uppercase tracking-wider',
            overdueCount > 0 ? 'text-error-400' : 'text-neutral-400',
          )}>Overdue</p>
        </div>
        <div className="rounded-2xl bg-neutral-50 p-3 text-center shadow-sm">
          <p className="font-heading text-xl font-extrabold text-moss-600 tabular-nums">{completedTodos.length}</p>
          <p className="text-[11px] font-semibold text-moss-500 uppercase tracking-wider">Done</p>
        </div>
      </motion.div>

      {/* Toolbar: View toggle + Edit/View mode + Add */}
      <motion.div
        variants={rm ? undefined : { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } } }}
        className="flex items-center gap-2"
      >
        {/* View toggle */}
        <div className="flex bg-neutral-100 rounded-xl p-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setView('list')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150',
              view === 'list'
                ? 'bg-white text-primary-800 shadow-sm'
                : 'text-primary-500 hover:text-primary-700',
            )}
          >
            <List size={14} />
            List
          </button>
          <button
            type="button"
            onClick={() => setView('calendar')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150',
              view === 'calendar'
                ? 'bg-white text-primary-800 shadow-sm'
                : 'text-primary-500 hover:text-primary-700',
            )}
          >
            <CalendarIcon size={14} />
            Calendar
          </button>
        </div>

        <div className="flex-1" />

        {/* Edit/View mode toggle */}
        <button
          type="button"
          onClick={() => setEditMode(!editMode)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-all duration-150',
            editMode
              ? 'bg-primary-700 text-white shadow-sm'
              : 'bg-white text-primary-600 shadow-sm hover:bg-neutral-50',
          )}
        >
          {editMode ? <Eye size={14} /> : <Pencil size={14} />}
          {editMode ? 'View' : 'Edit'}
        </button>

        {/* Add button */}
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary-700 text-white shadow-md hover:bg-primary-800 cursor-pointer transition-colors"
        >
          <Plus size={18} />
        </button>
      </motion.div>

      {/* Content */}
      <motion.div
        variants={rm ? undefined : { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } } }}
      >
        {view === 'list' ? (
          <div className="space-y-4">
            {/* Empty state */}
            {pendingTodos.length === 0 && completedTodos.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 sm:py-12">
                <motion.div
                  initial={rm ? undefined : { scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 25, mass: 0.8 }}
                  className="w-20 h-20 rounded-3xl bg-sky-50 flex items-center justify-center mb-5"
                >
                  <Sparkles size={36} className="text-sky-500" />
                </motion.div>
                <p className="font-heading text-xl font-bold text-neutral-900 mb-1">Fresh start</p>
                <p className="text-sm text-neutral-500 mb-4">Add your first to-do to stay organised</p>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Plus size={14} />}
                  onClick={() => setShowCreate(true)}
                >
                  Add To-Do
                </Button>
              </div>
            )}

            {/* Pending todos */}
            {pendingTodos.length > 0 && (
              <div className="space-y-1.5">
                <AnimatePresence mode="popLayout">
                  {pendingTodos.map((todo) => (
                    <TodoItem
                      key={todo.id}
                      todo={todo}
                      editMode={editMode}
                      onEdit={setEditTodo}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Completed section */}
            {completedTodos.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowCompleted(!showCompleted)}
                  className="flex items-center gap-1.5 text-[11px] text-neutral-500 cursor-pointer select-none py-1 px-1 hover:text-neutral-700 active:scale-[0.97] transition-[colors,transform] duration-150"
                >
                  <motion.div animate={{ rotate: showCompleted ? 90 : 0 }} transition={{ duration: 0.15 }}>
                    <ChevronRight size={12} />
                  </motion.div>
                  {completedTodos.length} completed
                </button>
                <AnimatePresence>
                  {showCompleted && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-1.5 overflow-hidden mt-1.5"
                    >
                      {completedTodos.map((todo) => (
                        <TodoItem
                          key={todo.id}
                          todo={todo}
                          editMode={editMode}
                          onEdit={setEditTodo}
                          onDelete={setDeleteTarget}
                        />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        ) : (
          <CalendarView
            todos={todos ?? []}
            editMode={editMode}
            onEdit={setEditTodo}
            onDelete={setDeleteTarget}
            onDateClick={handleDateClick}
          />
        )}
      </motion.div>

      {/* Create modal */}
      {showCreate && (
        <TodoModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Edit modal */}
      {editTodo && (
        <TodoModal
          open={!!editTodo}
          onClose={() => setEditTodo(null)}
          todo={editTodo}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmationSheet
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget, {
              onSuccess: () => { toast.success('Removed'); setDeleteTarget(null) },
              onError: () => toast.error('Failed to delete'),
            })
          }
        }}
        title="Delete To-Do"
        description="This will permanently remove this item from your list."
        confirmLabel="Delete"
        variant="danger"
      />
    </>
  )
}

/* ================================================================== */
/*  UNIFIED PAGE                                                       */
/* ================================================================== */

export default function LeaderTasksPage() {
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const [activeTab, setActiveTab] = useState<ActiveTab>('tasks')
  /**
   * `showCreate` lifted to page level (was previously local to TodosTabContent).
   * Reasons:
   *  - Issue 2: leaders reported they "can't make tasks for myself". The
   *    create-todo affordance was only visible when the Todos tab was active
   *    AND scrolled to the toolbar row. Surfacing the Add button at page level
   *    means it's reachable from either tab.
   *  - Lifts the modal state out of the tab subtree so it survives tab toggles.
   */
  const [showCreate, setShowCreate] = useState(false)

  useLeaderHeader('Tasks', { fullBleed: true })

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      {/* Background - blends both page palettes */}
      <div className="absolute inset-0 bg-gradient-to-b from-amber-50/50 via-white to-moss-50/15" />
      <Header title="Tasks" back transparent className="absolute left-0 right-0 z-30" />


      <motion.div
        className="relative z-10 px-4 sm:px-6 lg:px-8 pt-14 space-y-5 pb-20"
        variants={rm ? undefined : { hidden: {}, visible: { transition: { staggerChildren: 0.08, delayChildren: 0.12 } } }}
        initial="hidden"
        animate="visible"
      >
        {/* Title */}
        <motion.div
          className="text-center pb-1"
          variants={rm ? undefined : { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } } }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-500/80 mb-1">Stay on track</p>
          <h1 className="font-heading text-2xl font-extrabold text-primary-900">Tasks & To-Dos</h1>
        </motion.div>

        {/* ── Segmented toggle + page-level Add button ── */}
        <motion.div
          className="flex items-center justify-center gap-3"
          variants={rm ? undefined : { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } } }}
        >
          <SegmentedControl
            segments={[
              { id: 'tasks' as const, label: 'Tasks', icon: <ClipboardList size={15} /> },
              { id: 'todos' as const, label: 'My Todos', icon: <CheckCircle2 size={15} /> },
            ]}
            value={activeTab}
            onChange={setActiveTab}
            aria-label="View tasks or personal todos"
          />
          <button
            type="button"
            onClick={() => {
              // Personal items live on the Todos tab. Switch the user there
              // before opening the modal so when the save completes they
              // land on the tab where the new todo will appear.
              setActiveTab('todos')
              setShowCreate(true)
            }}
            aria-label="Add a personal to-do for yourself"
            className="shrink-0 flex items-center justify-center w-11 h-11 rounded-xl bg-primary-700 text-white shadow-md hover:bg-primary-800 active:scale-[0.97] cursor-pointer transition-[colors,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1"
          >
            <Plus size={18} />
          </button>
        </motion.div>

        {/*
          ── Tab content ──
          Issue 1 (Samsung blank-screen on tab toggle): we previously used
          AnimatePresence mode="wait" to crossfade tabs. On Samsung WebView
          / mid-tier Android, rapid toggling could leave AnimatePresence
          waiting for an exit animation that never resolved, mounting nothing
          for the new tab. Result: blank screen until full page reload.

          Fix: render BOTH tabs always; just hide the inactive one with `hidden`
          + aria-hidden. No unmount, no exit animation, no race. Tabs preserve
          internal state (scroll position, edit mode, expanded cards) across
          toggles, which leaders consistently want anyway.
        */}
        <div>
          <div hidden={activeTab !== 'tasks'} aria-hidden={activeTab !== 'tasks'}>
            <TasksTabContent rm={rm} />
          </div>
          <div hidden={activeTab !== 'todos'} aria-hidden={activeTab !== 'todos'} className="space-y-5">
            <TodosTabContent rm={rm} showCreate={showCreate} setShowCreate={setShowCreate} />
          </div>
        </div>
      </motion.div>
    </div>
  )
}
