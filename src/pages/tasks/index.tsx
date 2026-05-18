import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
    CheckCircle,
    Circle,
    Clock,
    AlertTriangle,
    ChevronDown,
    ChevronRight,
    Calendar,
    SkipForward,
    Users,
    ClipboardList,
} from 'lucide-react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { TaskSurveyModal } from '@/components/task-survey-modal'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { useOffline } from '@/hooks/use-offline'
import { queueOfflineAction } from '@/lib/offline-sync'
import {
    useMyTasks,
    useCompleteTask,
    useSkipTask,
    useGenerateTaskInstances,
    useGroupedTasks,
    type MyTask,
} from '@/hooks/use-tasks'
import { CATEGORY_COLORS } from '@/hooks/use-admin-tasks'

/* ------------------------------------------------------------------ */
/*  Task card                                                          */
/* ------------------------------------------------------------------ */

function TaskCard({ task }: { task: MyTask }) {
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState('')
  const [showSurvey, setShowSurvey] = useState(false)
  const { toast } = useToast()
  const { user } = useAuth()
  const { isOffline } = useOffline()
  const completeMutation = useCompleteTask()
  const skipMutation = useSkipTask()
  const shouldReduceMotion = useReducedMotion()

  const hasSurvey = !!task.template?.survey_id

  const surveySubmitMutation = useMutation({
    mutationFn: async (answers: Record<string, unknown>) => {
      if (!user || !task.template?.survey_id) return

      if (isOffline) {
        // Queue survey response
        queueOfflineAction('survey-response', {
          surveyId: task.template.survey_id,
          userId: user.id,
          answers,
        })
        // Queue task completion (useCompleteTask already handles offline)
        await completeMutation.mutateAsync({
          instanceId: task.id,
          notes: notes || undefined,
        })
        return
      }

      // Save survey response
      const { error } = await supabase.from('survey_responses').insert({
        survey_id: task.template.survey_id,
        user_id: user.id,
        answers: answers as unknown as import('@/types/database.types').Json,
      })
      if (error) throw error
      // Complete the task
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

  return (
    <motion.div
      layout={!shouldReduceMotion}
      className={cn(
        'rounded-xl overflow-hidden transition-colors duration-150',
        isCompleted ? 'bg-white border border-neutral-100 shadow-sm' : isSkipped ? 'bg-white border border-neutral-100 shadow-sm' : 'bg-white border border-neutral-100 shadow-sm',
        isOverdue && 'bg-white border border-error-200 shadow-sm',
      )}
    >
      <button
        type="button"
        onClick={() => !isCompleted && !isSkipped && setExpanded(!expanded)}
        className={cn(
          'w-full flex items-start gap-3 p-3.5 text-left cursor-pointer active:scale-[0.99] transition-transform duration-150',
          (isCompleted || isSkipped) && 'opacity-60',
        )}
      >
        {/* Status icon */}
        <div className="mt-0.5 shrink-0">
          {isCompleted ? (
            <CheckCircle size={18} className="text-success-500" />
          ) : isSkipped ? (
            <SkipForward size={14} className="text-neutral-400" />
          ) : isOverdue ? (
            <AlertTriangle size={18} className="text-error-500" />
          ) : (
            <Circle size={18} className="text-neutral-300" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className={cn(
              'text-[13px] sm:text-sm font-medium line-clamp-2 leading-snug',
              isCompleted || isSkipped ? 'text-neutral-400 line-through' : 'text-neutral-900',
            )}>
              {task.template?.title ?? 'Task'}
            </p>
            {task.template?.category && (
              <span className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0', CATEGORY_COLORS[task.template.category])}>
                {task.template.category.replace('_', ' ')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-neutral-500 flex-wrap">
            <span className={cn('flex items-center gap-1', isOverdue && 'text-error-500 font-medium')}>
              <Clock size={11} />
              {formattedDue}
              {!isCompleted && !isSkipped && (
                isOverdue
                  ? ` (${Math.abs(daysUntil)}d overdue)`
                  : daysUntil <= 2
                    ? ` (${daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `${daysUntil}d`})`
                    : ''
              )}
            </span>
            {task.event && (
              <>
                <span className="text-neutral-300">·</span>
                <span className="flex items-center gap-1">
                  <Calendar size={11} />
                  {task.event.title}
                </span>
              </>
            )}
            {isCompleted && task.completer?.display_name && (
              <>
                <span className="text-neutral-300">·</span>
                <span className="flex items-center gap-1 text-success-600">
                  <CheckCircle size={10} />
                  {task.completer.display_name}
                </span>
              </>
            )}
            {!isCompleted && !isSkipped && (task.template?.assignment_mode ?? 'collective') === 'collective' && !task.assigned_user_id && (
              <>
                <span className="text-neutral-300">·</span>
                <span className="flex items-center gap-1 text-neutral-400">
                  <Users size={10} />
                  Team task
                </span>
              </>
            )}
          </div>

          {task.template?.description && !isCompleted && !isSkipped && (
            <p className="text-[11px] text-neutral-500 mt-1 line-clamp-1">{task.template.description}</p>
          )}
        </div>

        {/* Expand chevron */}
        {!isCompleted && !isSkipped && (
          <div className="shrink-0 mt-0.5">
            {expanded ? (
              <ChevronDown size={16} className="text-neutral-400" />
            ) : (
              <ChevronRight size={16} className="text-neutral-300" />
            )}
          </div>
        )}
      </button>

      {/* Expanded actions */}
      <AnimatePresence>
        {expanded && !isCompleted && !isSkipped && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-3.5 space-y-2">
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
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  icon={hasSurvey ? <ClipboardList size={14} /> : <CheckCircle size={14} />}
                  loading={completeMutation.isPending}
                  onClick={() => {
                    if (hasSurvey) {
                      setShowSurvey(true)
                    } else {
                      completeMutation.mutate(
                        { instanceId: task.id, notes: notes || undefined },
                        {
                          onSuccess: () => {
                            toast.success('Task completed!')
                            setExpanded(false)
                            setNotes('')
                          },
                          onError: () => toast.error('Failed to complete task'),
                        },
                      )
                    }
                  }}
                >
                  {hasSurvey ? 'Complete & Fill Survey' : 'Complete'}
                </Button>
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
  const [collapsed, setCollapsed] = useState(false)

  const pending = tasks.filter((t) => t.status === 'pending')
  const completed = tasks.filter((t) => t.status === 'completed' || t.status === 'skipped')

  return (
    <motion.div layout="position" className="space-y-1.5">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full min-h-11 cursor-pointer active:scale-[0.98] transition-transform duration-150"
      >
        {collapsed ? (
          <ChevronRight size={16} className="text-neutral-400" />
        ) : (
          <ChevronDown size={16} className="text-neutral-400" />
        )}
        <p className="text-sm font-semibold text-neutral-900">{name}</p>
        {pendingCount > 0 && (
          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600">
            {pendingCount}
          </span>
        )}
        {overdueCount > 0 && (
          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-error-100 text-error-700">
            {overdueCount} overdue
          </span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden space-y-1.5"
          >
            {pending.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
            {completed.length > 0 && (
              <details className="group">
                <summary className="text-[11px] text-neutral-500 cursor-pointer py-1 select-none">
                  {completed.length} completed
                </summary>
                <div className="space-y-1 mt-1">
                  {completed.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              </details>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function TasksPage() {
  const queryClient = useQueryClient()
  const { data: tasks, isLoading } = useMyTasks()
  const showLoading = useDelayedLoading(isLoading)
  const generateMutation = useGenerateTaskInstances()
  const groups = useGroupedTasks(tasks)

  // Lazy-generate task instances on mount
  useEffect(() => {
    generateMutation.mutate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRefresh = useCallback(async () => {
    await generateMutation.mutateAsync()
    await queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
  }, [generateMutation, queryClient])

  const totalPending = groups.reduce((sum, g) => sum + g.pendingCount, 0)
  const totalOverdue = groups.reduce((sum, g) => sum + g.overdueCount, 0)

  if (showLoading) {
    return (
      <Page swipeBack header={<Header title="" back />}>
        <div className="py-4">
          <Skeleton variant="list-item" count={6} />
        </div>
      </Page>
    )
  }
  if (!groups.length) {
    return (
      <Page swipeBack header={<Header title="" back />}>
        <EmptyState
          illustration="empty"
          title="All caught up!"
          description="No tasks assigned to your collectives right now"
        />
      </Page>
    )
  }

  return (
    <Page swipeBack header={<Header title="" back />}>
        <div className="py-4 space-y-6">
          {/* Summary bar */}
          {(totalPending > 0 || totalOverdue > 0) && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-neutral-600 font-medium">
                {totalPending} pending
              </span>
              {totalOverdue > 0 && (
                <span className="text-error-600 font-medium">
                  {totalOverdue} overdue
                </span>
              )}
            </div>
          )}

          {/* Grouped task list */}
          {groups.map((group) => (
            <CollectiveGroup
              key={group.collective_id}
              name={group.collective_name}
              tasks={group.tasks}
              pendingCount={group.pendingCount}
              overdueCount={group.overdueCount}
            />
          ))}
        </div>
    </Page>
  )
}
