import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { useOffline } from '@/hooks/use-offline'
import { useToast } from '@/components/toast'
import { queueOfflineAction } from '@/lib/offline-sync'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface LeaderTodo {
  id: string
  user_id: string
  title: string
  description: string | null
  due_date: string | null
  due_time: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'pending' | 'completed'
  completed_at: string | null
  source_template_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export type TodoPriority = LeaderTodo['priority']

export const PRIORITY_CONFIG: Record<TodoPriority, { label: string; color: string; dot: string }> = {
  low: { label: 'Low', color: 'text-primary-400', dot: 'bg-primary-300' },
  medium: { label: 'Medium', color: 'text-info-600', dot: 'bg-info-400' },
  high: { label: 'High', color: 'text-warning-600', dot: 'bg-warning-400' },
  urgent: { label: 'Urgent', color: 'text-error-600', dot: 'bg-error-500' },
}

/* ------------------------------------------------------------------ */
/*  Fetch todos                                                        */
/* ------------------------------------------------------------------ */

export function useLeaderTodos(filters?: {
  status?: 'pending' | 'completed' | 'all'
  priority?: TodoPriority
  dateFrom?: string
  dateTo?: string
}) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['leader-todos', user?.id, filters],
    queryFn: async () => {
      if (!user) return []

      let query = supabase.from('leader_todos')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order')
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }

      if (filters?.priority) {
        query = query.eq('priority', filters.priority)
      }

      if (filters?.dateFrom) {
        query = query.gte('due_date', filters.dateFrom)
      }

      if (filters?.dateTo) {
        query = query.lte('due_date', filters.dateTo)
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as LeaderTodo[]
    },
    enabled: !!user,
    staleTime: 15 * 1000,
    placeholderData: keepPreviousData,
  })
}

/* ------------------------------------------------------------------ */
/*  Create todo                                                        */
/* ------------------------------------------------------------------ */

export function useCreateTodo() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { isOffline } = useOffline()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (input: {
      title: string
      description?: string
      due_date?: string | null
      due_time?: string | null
      priority?: TodoPriority
      source_template_id?: string | null
    }) => {
      if (!user) throw new Error('Not authenticated')

      if (isOffline) {
        queueOfflineAction('todo-create', {
          userId: user.id,
          title: input.title,
          description: input.description,
          due_date: input.due_date,
          due_time: input.due_time,
          priority: input.priority,
          source_template_id: input.source_template_id,
        })
        // Return an optimistic todo for the UI
        return {
          id: `offline-${Date.now()}`,
          user_id: user.id,
          title: input.title,
          description: input.description || null,
          due_date: input.due_date || null,
          due_time: input.due_time || null,
          priority: input.priority ?? 'medium',
          status: 'pending',
          completed_at: null,
          source_template_id: input.source_template_id || null,
          sort_order: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as LeaderTodo
      }

      const { data, error } = await supabase.from('leader_todos')
        .insert({
          user_id: user.id,
          title: input.title,
          description: input.description || null,
          due_date: input.due_date || null,
          due_time: input.due_time || null,
          priority: input.priority ?? 'medium',
          source_template_id: input.source_template_id || null,
        })
        .select()
        .single()

      if (error) throw error
      return data as LeaderTodo
    },
    onSuccess: () => {
      if (isOffline) {
        toast.info('Todo saved offline - will sync when back online')
      }
      queryClient.invalidateQueries({ queryKey: ['leader-todos'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Update todo                                                        */
/* ------------------------------------------------------------------ */

export function useUpdateTodo() {
  const queryClient = useQueryClient()
  const { isOffline } = useOffline()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<LeaderTodo> & { id: string }) => {
      if (isOffline) {
        queueOfflineAction('todo-update', { id, ...updates })
        return { id, ...updates } as LeaderTodo
      }

      const { data, error } = await supabase.from('leader_todos')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as LeaderTodo
    },
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey: ['leader-todos'] })
      queryClient.setQueriesData<LeaderTodo[]>(
        { queryKey: ['leader-todos'] },
        (old) => old?.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      )
    },
    onSuccess: () => {
      if (isOffline) toast.info('Todo update saved offline - will sync when back online')
    },
    onSettled: () => {
      if (isOffline) return
      queryClient.invalidateQueries({ queryKey: ['leader-todos'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Toggle todo completion                                             */
/* ------------------------------------------------------------------ */

export function useToggleTodo() {
  const queryClient = useQueryClient()
  const { isOffline } = useOffline()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      if (isOffline) {
        queueOfflineAction('todo-toggle', {
          id,
          completed,
          timestamp: new Date().toISOString(),
        })
        return
      }

      const { error } = await supabase.from('leader_todos')
        .update({
          status: completed ? 'completed' : 'pending',
          completed_at: completed ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (error) throw error
    },
    onMutate: async ({ id, completed }) => {
      await queryClient.cancelQueries({ queryKey: ['leader-todos'] })
      queryClient.setQueriesData<LeaderTodo[]>(
        { queryKey: ['leader-todos'] },
        (old) =>
          old?.map((t) =>
            t.id === id
              ? {
                  ...t,
                  status: completed ? ('completed' as const) : ('pending' as const),
                  completed_at: completed ? new Date().toISOString() : null,
                }
              : t,
          ),
      )
    },
    onSuccess: () => {
      if (isOffline) toast.info('Todo saved offline - will sync when back online')
    },
    onSettled: () => {
      if (isOffline) return
      queryClient.invalidateQueries({ queryKey: ['leader-todos'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Delete todo                                                        */
/* ------------------------------------------------------------------ */

export function useDeleteTodo() {
  const queryClient = useQueryClient()
  const { isOffline } = useOffline()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (id: string) => {
      if (isOffline) {
        queueOfflineAction('todo-delete', { id })
        return
      }

      const { error } = await supabase.from('leader_todos')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['leader-todos'] })
      queryClient.setQueriesData<LeaderTodo[]>(
        { queryKey: ['leader-todos'] },
        (old) => old?.filter((t) => t.id !== id),
      )
    },
    onSuccess: () => {
      if (isOffline) toast.info('Todo deleted offline - will sync when back online')
    },
    onSettled: () => {
      if (isOffline) return
      queryClient.invalidateQueries({ queryKey: ['leader-todos'] })
    },
  })
}
