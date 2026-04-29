import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { useOffline } from '@/hooks/use-offline'
import { useToast } from '@/components/toast'
import { queueOfflineAction } from '@/lib/offline-sync'
import { getCurrentPeriodKey, getDueDate, type TaskTemplate, type TaskInstance } from '@/hooks/use-admin-tasks'
import { resolveAndGenerateDynamicInstances } from '@/hooks/use-timeline-rules'
import { COLLECTIVE_ROLE_RANK } from '@/lib/constants'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TaskInstanceRow extends Record<string, unknown> {
  id: string
  assigned_user_id: string | null
  task_templates: unknown
  collectives: unknown
  events: unknown
  profiles: unknown
}

export interface MyTask extends TaskInstance {
  template: TaskTemplate
  collective: { id: string; name: string }
  event?: { id: string; title: string } | null
}

export interface CollectiveTaskGroup {
  collective_id: string
  collective_name: string
  tasks: MyTask[]
  pendingCount: number
  overdueCount: number
}

/** Returns true if the user's role in a collective meets the template's minimum */
function meetsRoleRequirement(userRole: string, requiredRole: string): boolean {
  return (COLLECTIVE_ROLE_RANK[userRole] ?? -1) >= (COLLECTIVE_ROLE_RANK[requiredRole] ?? 99)
}

/* ------------------------------------------------------------------ */
/*  useMyTasks - current + recent tasks for current user               */
/* ------------------------------------------------------------------ */

export function useMyTasks() {
  const { user, collectiveRoles } = useAuth()

  // Find collectives where user is assist_leader+
  const staffCollectiveIds = useMemo(
    () =>
      collectiveRoles
        .filter((m) => m.role === 'assist_leader' || m.role === 'co_leader' || m.role === 'leader')
        .map((m) => m.collective_id),
    [collectiveRoles],
  )

  return useQuery({
    queryKey: ['my-tasks', user?.id, staffCollectiveIds],
    queryFn: async () => {
      if (!user || staffCollectiveIds.length === 0) return []

      // Only fetch instances from the last 30 days to prevent unbounded growth
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 30)

      const { data, error } = await supabase
        .from('task_instances')
        .select(`
          *,
          task_templates(*),
          collectives(id, name),
          events(id, title),
          profiles!task_instances_completed_by_fkey(display_name, avatar_url)
        `)
        .in('collective_id', staffCollectiveIds)
        .gte('due_date', cutoff.toISOString())
        .order('due_date', { ascending: true })

      if (error) throw error

      // Build a role lookup per collective
      const roleMap = new Map(collectiveRoles.map((m) => [m.collective_id, m.role]))

      return (data ?? [])
        .filter((row: TaskInstanceRow) => {
          // For individual tasks, only show the current user's instances
          if (row.assigned_user_id && row.assigned_user_id !== user!.id) return false
          // Filter by assignee_role: only show tasks the user's collective role qualifies for
          const tpl = row.task_templates as Record<string, unknown> | null
          const requiredRole = (tpl?.assignee_role as string) ?? 'assist_leader'
          const userRole = roleMap.get(row.collective_id as string) ?? ''
          if (!meetsRoleRequirement(userRole, requiredRole)) return false
          return true
        })
        .map((row: TaskInstanceRow) => ({
          ...row,
          template: row.task_templates,
          collective: row.collectives,
          event: row.events,
          completer: row.profiles ?? null,
        })) as unknown as MyTask[]
    },
    enabled: !!user && staffCollectiveIds.length > 0,
    staleTime: 30 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  useCollectiveTasks - tasks for a specific collective               */
/* ------------------------------------------------------------------ */

export function useCollectiveTasks(collectiveId: string | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['collective-tasks', collectiveId],
    queryFn: async () => {
      if (!collectiveId) return []

      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 30)

      const { data, error } = await supabase
        .from('task_instances')
        .select(`
          *,
          task_templates(*),
          collectives(id, name),
          events(id, title),
          profiles!task_instances_completed_by_fkey(display_name, avatar_url)
        `)
        .eq('collective_id', collectiveId)
        .gte('due_date', cutoff.toISOString())
        .order('due_date', { ascending: true })

      if (error) throw error

      return (data ?? []).map((row: TaskInstanceRow) => ({
        ...row,
        template: row.task_templates,
        collective: row.collectives,
        event: row.events,
        completer: row.profiles ?? null,
      })) as unknown as MyTask[]
    },
    enabled: !!user && !!collectiveId,
    staleTime: 30 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  useCompleteTask - mark a task instance as completed                */
/* ------------------------------------------------------------------ */

export function useCompleteTask() {
  const queryClient = useQueryClient()
  const { user, profile } = useAuth()
  const { isOffline } = useOffline()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({
      instanceId,
      notes,
    }: {
      instanceId: string
      notes?: string
    }) => {
      if (!user) throw new Error('Not authenticated')

      if (isOffline) {
        queueOfflineAction('task-complete', {
          instanceId,
          userId: user.id,
          notes,
          timestamp: new Date().toISOString(),
        })
        return
      }

      const { error } = await supabase
        .from('task_instances')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by: user.id,
          completion_notes: notes || null,
        })
        .eq('id', instanceId)

      if (error) throw error
    },
    onMutate: async ({ instanceId, notes }) => {
      await queryClient.cancelQueries({ queryKey: ['my-tasks'] })
      await queryClient.cancelQueries({ queryKey: ['collective-tasks'] })
      const previousMyTasks = queryClient.getQueryData(['my-tasks', user?.id])
      const now = new Date().toISOString()
      const updater = (old: MyTask[] | undefined) =>
        old?.map((t) =>
          t.id === instanceId
            ? {
                ...t,
                status: 'completed' as const,
                completed_at: now,
                completed_by: user!.id,
                completion_notes: notes || null,
                completer: { display_name: profile?.display_name ?? '', avatar_url: profile?.avatar_url ?? null },
              }
            : t,
        )
      queryClient.setQueriesData<MyTask[]>({ queryKey: ['my-tasks'] }, updater)
      queryClient.setQueriesData<MyTask[]>({ queryKey: ['collective-tasks'] }, updater)
      return { previousMyTasks }
    },
    onError: (_err, _, context) => {
      if (!isOffline && context?.previousMyTasks) queryClient.setQueryData(['my-tasks', user?.id], context.previousMyTasks)
      if (!isOffline) queryClient.invalidateQueries({ queryKey: ['collective-tasks'] })
    },
    onSuccess: () => {
      if (isOffline) toast.info('Task completion saved offline - will sync when back online')
    },
    onSettled: () => {
      if (isOffline) return
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['collective-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['admin-kpi-dashboard'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  useUpdateTaskNotes - save a note WITHOUT completing the task       */
/* ------------------------------------------------------------------ */

export function useUpdateTaskNotes() {
  const queryClient = useQueryClient()
  const { isOffline } = useOffline()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({
      instanceId,
      notes,
    }: {
      instanceId: string
      notes: string
    }) => {
      if (isOffline) {
        queueOfflineAction('task-update-notes', { instanceId, notes })
        return
      }

      const { error } = await supabase
        .from('task_instances')
        .update({ completion_notes: notes || null })
        .eq('id', instanceId)

      if (error) throw error
    },
    onMutate: async ({ instanceId, notes }) => {
      await queryClient.cancelQueries({ queryKey: ['my-tasks'] })
      await queryClient.cancelQueries({ queryKey: ['collective-tasks'] })
      const updater = (old: MyTask[] | undefined) =>
        old?.map((t) =>
          t.id === instanceId ? { ...t, completion_notes: notes || null } : t,
        )
      queryClient.setQueriesData<MyTask[]>({ queryKey: ['my-tasks'] }, updater)
      queryClient.setQueriesData<MyTask[]>({ queryKey: ['collective-tasks'] }, updater)
    },
    onSuccess: () => {
      if (isOffline) toast.info('Note saved offline - will sync when back online')
    },
    onSettled: () => {
      if (isOffline) return
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['collective-tasks'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  useUndoCompleteTask - revert a task instance back to pending       */
/* ------------------------------------------------------------------ */

export function useUndoCompleteTask() {
  const queryClient = useQueryClient()
  const { isOffline } = useOffline()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (instanceId: string) => {
      if (isOffline) {
        queueOfflineAction('task-undo-complete', { instanceId })
        return
      }

      const { error } = await supabase
        .from('task_instances')
        .update({
          status: 'pending',
          completed_at: null,
          completed_by: null,
        })
        .eq('id', instanceId)

      if (error) throw error
    },
    onMutate: async (instanceId) => {
      await queryClient.cancelQueries({ queryKey: ['my-tasks'] })
      await queryClient.cancelQueries({ queryKey: ['collective-tasks'] })
      const updater = (old: MyTask[] | undefined) =>
        old?.map((t) =>
          t.id === instanceId
            ? {
                ...t,
                status: 'pending' as const,
                completed_at: null,
                completed_by: null,
                completer: null,
              }
            : t,
        )
      queryClient.setQueriesData<MyTask[]>({ queryKey: ['my-tasks'] }, updater)
      queryClient.setQueriesData<MyTask[]>({ queryKey: ['collective-tasks'] }, updater)
    },
    onSuccess: () => {
      if (isOffline) toast.info('Undo saved offline - will sync when back online')
    },
    onSettled: () => {
      if (isOffline) return
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['collective-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['admin-kpi-dashboard'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  useSkipTask - mark a task instance as skipped                      */
/* ------------------------------------------------------------------ */

export function useSkipTask() {
  const queryClient = useQueryClient()
  const { isOffline } = useOffline()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (instanceId: string) => {
      if (isOffline) {
        queueOfflineAction('task-skip', { instanceId })
        return
      }

      const { error } = await supabase
        .from('task_instances')
        .update({ status: 'skipped' })
        .eq('id', instanceId)

      if (error) throw error
    },
    onMutate: async (instanceId) => {
      await queryClient.cancelQueries({ queryKey: ['my-tasks'] })
      await queryClient.cancelQueries({ queryKey: ['collective-tasks'] })
      const updater = (old: MyTask[] | undefined) =>
        old?.map((t) => (t.id === instanceId ? { ...t, status: 'skipped' as const } : t))
      queryClient.setQueriesData<MyTask[]>({ queryKey: ['my-tasks'] }, updater)
      queryClient.setQueriesData<MyTask[]>({ queryKey: ['collective-tasks'] }, updater)
    },
    onSuccess: () => {
      if (isOffline) toast.info('Task skip saved offline - will sync when back online')
    },
    onSettled: () => {
      if (isOffline) return
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['collective-tasks'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  useGenerateTaskInstances - lazy generation for current period      */
/* ------------------------------------------------------------------ */

interface TemplateRow {
  id: string
  schedule_type: string
  assignment_mode?: string
  assigned_to_user_id?: string | null
  assignee_role?: string
  collective_id: string | null
  use_dynamic_timeline?: boolean
  event_offset_days?: number | null
  [key: string]: unknown
}

export function useGenerateTaskInstances() {
  const queryClient = useQueryClient()
  const { user, collectiveRoles } = useAuth()

  return useMutation({
    mutationFn: async () => {
      if (!user) return

      const staffRoles = collectiveRoles.filter(
        (m) => m.role === 'assist_leader' || m.role === 'co_leader' || m.role === 'leader',
      )
      const staffCollectiveIds = staffRoles.map((m) => m.collective_id)

      if (staffCollectiveIds.length === 0) return

      // Build a role lookup per collective for assignee_role filtering
      const roleMap = new Map(staffRoles.map((m) => [m.collective_id, m.role]))

      // Fetch ALL active templates (including event_relative)
      const { data: templates } = await supabase
        .from('task_templates')
        .select('*')
        .eq('is_active', true)

      if (!templates?.length) return

      const typedTemplates = templates as unknown as TemplateRow[]

      // Split templates by type
      const onceTemplates = typedTemplates.filter(
        (t) => t.schedule_type === 'once' &&
          // Skip assigned-mode once templates not meant for this user
          (t.assignment_mode !== 'assigned' || t.assigned_to_user_id === user.id),
      )
      const collectiveRecurring = typedTemplates.filter(
        (t) =>
          (t.schedule_type === 'weekly' || t.schedule_type === 'monthly') &&
          (t.assignment_mode ?? 'collective') === 'collective',
      )
      const individualRecurring = typedTemplates.filter(
        (t) =>
          (t.schedule_type === 'weekly' || t.schedule_type === 'monthly') &&
          t.assignment_mode === 'individual',
      )
      // Assigned mode: only generate for the specific assigned user
      const assignedRecurring = typedTemplates.filter(
        (t) =>
          (t.schedule_type === 'weekly' || t.schedule_type === 'monthly') &&
          t.assignment_mode === 'assigned' &&
          t.assigned_to_user_id === user.id,
      )
      // Non-dynamic event_relative templates (legacy fixed-offset)
      const legacyEventRelative = typedTemplates.filter(
        (t) => t.schedule_type === 'event_relative' && !t.use_dynamic_timeline &&
          (t.assignment_mode !== 'assigned' || t.assigned_to_user_id === user.id),
      )
      // Dynamic event_relative handled by resolveAndGenerateDynamicInstances

      /** Helper: get collectives this user qualifies for given a template's assignee_role */
      const getTargetCollectives = (template: TemplateRow): string[] => {
        const candidates = template.collective_id
          ? [template.collective_id].filter((id: string) => staffCollectiveIds.includes(id))
          : staffCollectiveIds
        const requiredRole = template.assignee_role ?? 'assist_leader'
        return candidates.filter((cId) => meetsRoleRequirement(roleMap.get(cId) ?? '', requiredRole))
      }

      // --- Handle collective recurring templates (weekly/monthly) ---
      // One instance per collective per period - any qualifying staff can complete
      // Batch all upserts to avoid N+1 sequential DB calls
      {
        const collectiveRows: Array<{
          template_id: string
          collective_id: string
          due_date: string
          period_key: string
          status: string
        }> = []

        for (const template of collectiveRecurring) {
          const periodKey = getCurrentPeriodKey(template.schedule_type)
          if (!periodKey) continue

          const targetCollectives = getTargetCollectives(template)

          for (const collectiveId of targetCollectives) {
            const dueDate = getDueDate(template as unknown as TaskTemplate, periodKey)
            collectiveRows.push({
              template_id: template.id,
              collective_id: collectiveId,
              due_date: dueDate,
              period_key: periodKey,
              status: 'pending',
            })
          }
        }

        if (collectiveRows.length > 0) {
          const { error } = await supabase
            .from('task_instances')
            .upsert(collectiveRows, { onConflict: 'template_id,collective_id,period_key', ignoreDuplicates: true })
          if (error) console.error('[tasks] collective recurring upsert error:', error.message)
        }
      }

      // --- Handle individual recurring templates (weekly/monthly) ---
      // One instance per USER per collective per period
      if (individualRecurring.length > 0) {
        const indivTemplateIds = individualRecurring.map((t) => t.id)

        const { data: existingIndiv } = await supabase
          .from('task_instances')
          .select('template_id, collective_id, period_key')
          .in('template_id', indivTemplateIds)
          .eq('assigned_user_id', user.id)

        const existingIndivKeys = new Set(
          (existingIndiv ?? []).map(
            (r: { template_id: string; collective_id: string; period_key: string }) =>
              `${r.template_id}:${r.collective_id}:${r.period_key}`,
          ),
        )

        const indivRows: Array<{
          template_id: string
          collective_id: string
          due_date: string
          period_key: string
          assigned_user_id: string
          status: string
        }> = []

        for (const template of individualRecurring) {
          const basePeriodKey = getCurrentPeriodKey(template.schedule_type)
          if (!basePeriodKey) continue

          const periodKey = `${basePeriodKey}:${user.id}`
          const targetCollectives = getTargetCollectives(template)

          for (const collectiveId of targetCollectives) {
            const key = `${template.id}:${collectiveId}:${periodKey}`
            if (existingIndivKeys.has(key)) continue

            const dueDate = getDueDate(template as unknown as TaskTemplate, basePeriodKey)
            indivRows.push({
              template_id: template.id,
              collective_id: collectiveId,
              due_date: dueDate,
              period_key: periodKey,
              assigned_user_id: user.id,
              status: 'pending',
            })
          }
        }

        if (indivRows.length > 0) {
          const { error } = await supabase.from('task_instances').insert(indivRows)
          if (error) console.error('[tasks] individual recurring insert error:', error.message)
        }
      }

      // --- Handle assigned recurring templates (weekly/monthly for a specific user) ---
      if (assignedRecurring.length > 0) {
        const assignedTemplateIds = assignedRecurring.map((t) => t.id)

        const { data: existingAssigned } = await supabase
          .from('task_instances')
          .select('template_id, collective_id, period_key')
          .in('template_id', assignedTemplateIds)
          .eq('assigned_user_id', user.id)

        const existingAssignedKeys = new Set(
          (existingAssigned ?? []).map(
            (r: { template_id: string; collective_id: string; period_key: string }) =>
              `${r.template_id}:${r.collective_id}:${r.period_key}`,
          ),
        )

        const assignedRows: Array<{
          template_id: string
          collective_id: string
          due_date: string
          period_key: string
          assigned_user_id: string
          status: string
        }> = []

        for (const template of assignedRecurring) {
          const basePeriodKey = getCurrentPeriodKey(template.schedule_type)
          if (!basePeriodKey) continue

          const periodKey = `${basePeriodKey}:assigned:${user.id}`
          const targetCollectives = getTargetCollectives(template)

          for (const collectiveId of targetCollectives) {
            const key = `${template.id}:${collectiveId}:${periodKey}`
            if (existingAssignedKeys.has(key)) continue

            const dueDate = getDueDate(template as unknown as TaskTemplate, basePeriodKey)
            assignedRows.push({
              template_id: template.id,
              collective_id: collectiveId,
              due_date: dueDate,
              period_key: periodKey,
              assigned_user_id: user.id,
              status: 'pending',
            })
          }
        }

        if (assignedRows.length > 0) {
          const { error } = await supabase.from('task_instances').insert(assignedRows)
          if (error) console.error('[tasks] assigned recurring insert error:', error.message)
        }
      }

      // --- Handle once templates (per-user, never regenerate after any status) ---
      if (onceTemplates.length > 0) {
        const onceTemplateIds = onceTemplates.map((t) => t.id)

        const { data: existingOnce } = await supabase
          .from('task_instances')
          .select('template_id, collective_id')
          .in('template_id', onceTemplateIds)
          .eq('assigned_user_id', user.id)

        const existingKeys = new Set(
          (existingOnce ?? []).map(
            (r: { template_id: string; collective_id: string }) => `${r.template_id}:${r.collective_id}`,
          ),
        )

        const onceRows: Array<{
          template_id: string
          collective_id: string
          due_date: string
          period_key: string
          assigned_user_id: string
          status: string
        }> = []

        for (const template of onceTemplates) {
          const targetCollectives = getTargetCollectives(template)

          for (const collectiveId of targetCollectives) {
            const key = `${template.id}:${collectiveId}`
            if (existingKeys.has(key)) continue

            const periodKey = `once:${user.id}`
            const dueDate = new Date()
            dueDate.setDate(dueDate.getDate() + 7)
            dueDate.setHours(23, 59, 59, 999)

            onceRows.push({
              template_id: template.id,
              collective_id: collectiveId,
              due_date: dueDate.toISOString(),
              period_key: periodKey,
              assigned_user_id: user.id,
              status: 'pending',
            })
          }
        }

        if (onceRows.length > 0) {
          const { error } = await supabase.from('task_instances').insert(onceRows)
          if (error) console.error('[tasks] once insert error:', error.message)
        }
      }

      // --- Handle legacy (non-dynamic) event_relative templates ---
      // These use a fixed event_offset_days against each collective's next upcoming event
      // Batch: fetch all next-events in parallel, then batch upsert
      if (legacyEventRelative.length > 0) {
        // Collect all unique collective IDs needed across legacy templates
        const allLegacyCollectives = new Set<string>()
        for (const template of legacyEventRelative) {
          for (const cId of getTargetCollectives(template)) allLegacyCollectives.add(cId)
        }

        // Fetch next upcoming event per collective in parallel
        const nextEventMap = new Map<string, { id: string; title: string; date_start: string }>()
        await Promise.all(
          Array.from(allLegacyCollectives).map(async (collectiveId) => {
            const { data: events } = await supabase
              .from('events')
              .select('id, title, date_start')
              .eq('collective_id', collectiveId)
              .eq('status', 'published')
              .gte('date_start', new Date().toISOString())
              .order('date_start', { ascending: true })
              .limit(1)
            if (events?.[0]) nextEventMap.set(collectiveId, events[0])
          }),
        )

        // Build upsert batch
        const legacyRows: Array<{
          template_id: string
          collective_id: string
          event_id: string
          due_date: string
          period_key: string
          status: string
        }> = []

        for (const template of legacyEventRelative) {
          const targetCollectives = getTargetCollectives(template)
          const offsetDays = template.event_offset_days ?? 0

          for (const collectiveId of targetCollectives) {
            const event = nextEventMap.get(collectiveId)
            if (!event) continue

            const eventDate = new Date(event.date_start)
            const dueDate = new Date(eventDate)
            dueDate.setDate(dueDate.getDate() + offsetDays)
            dueDate.setHours(23, 59, 59, 999)

            if (dueDate < new Date()) continue

            legacyRows.push({
              template_id: template.id,
              collective_id: collectiveId,
              event_id: event.id,
              due_date: dueDate.toISOString(),
              period_key: `event:${event.id}`,
              status: 'pending',
            })
          }
        }

        if (legacyRows.length > 0) {
          const { error } = await supabase
            .from('task_instances')
            .upsert(legacyRows, { onConflict: 'template_id,collective_id,period_key', ignoreDuplicates: true })
          if (error) console.error('[tasks] legacy event_relative upsert error:', error.message)
        }
      }

      // --- Handle dynamic timeline templates (event_relative with smart resolution) ---
      await resolveAndGenerateDynamicInstances(staffCollectiveIds)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['collective-tasks'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  useGroupedTasks - group tasks by collective for display            */
/* ------------------------------------------------------------------ */

export function useGroupedTasks(tasks: MyTask[] | undefined): CollectiveTaskGroup[] {
  return useMemo(() => {
    if (!tasks?.length) return []

    const groups = new Map<string, CollectiveTaskGroup>()
    const now = new Date()

    for (const task of tasks) {
      const cId = task.collective_id
      if (!groups.has(cId)) {
        groups.set(cId, {
          collective_id: cId,
          collective_name: task.collective?.name ?? 'Unknown',
          tasks: [],
          pendingCount: 0,
          overdueCount: 0,
        })
      }
      const group = groups.get(cId)!
      group.tasks.push(task)
      if (task.status === 'pending') {
        group.pendingCount++
        if (new Date(task.due_date) < now) group.overdueCount++
      }
    }

    // Sort groups: ones with overdue tasks first, then by name
    return Array.from(groups.values()).sort((a, b) => {
      if (a.overdueCount > 0 && b.overdueCount === 0) return -1
      if (a.overdueCount === 0 && b.overdueCount > 0) return 1
      return a.collective_name.localeCompare(b.collective_name)
    })
  }, [tasks])
}
