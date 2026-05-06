import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { useOffline } from '@/hooks/use-offline'
import { useToast } from '@/components/toast'
import { queueOfflineAction } from '@/lib/offline-sync'

const blocks = () => supabase.from('user_blocks')

interface UserBlock {
  blocked_id: string
  created_at: string
}

export function useBlockedUsers() {
  const { user } = useAuth()

  return useQuery<UserBlock[]>({
    queryKey: ['blocked-users', user?.id],
    queryFn: async () => {
      if (!user) return []

      const { data, error } = await blocks()
        .select('blocked_id, created_at')
        .eq('blocker_id', user.id)

      if (error) throw error
      return (data ?? []) as UserBlock[]
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  })
}

export function useIsBlocked(userId: string | undefined) {
  const { data: blockedUsers } = useBlockedUsers()
  if (!userId || !blockedUsers) return false
  return blockedUsers.some((b) => b.blocked_id === userId)
}

export function useBlockUser() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { isOffline } = useOffline()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({ blockedId, reason }: { blockedId: string; reason?: string }) => {
      if (!user) throw new Error('Not authenticated')

      if (isOffline) {
        queueOfflineAction('block-user', {
          blockerId: user.id,
          blockedId,
          reason,
        })
        return
      }

      // Block the user
      const { error: blockError } = await blocks()
        .insert({
          blocker_id: user.id,
          blocked_id: blockedId,
          reason: reason ?? null,
        })

      if (blockError) throw blockError

      // Also create a content report to notify admins about the blocked user
      const reportReason = reason
        ? `User blocked: ${reason}`
        : 'User blocked by another member'

      const { data: reportData, error: reportError } = await supabase
        .from('content_reports')
        .insert({
          content_id: blockedId,
          content_type: 'profile',
          reason: reportReason,
          reporter_id: user.id,
          status: 'pending',
        })
        .select('id')
        .single()

      // Don't fail the block if the report fails
      if (reportError) {
        console.error('Failed to create report for block:', reportError)
      } else {
        // Notify admins via edge function (best-effort)
        try {
          await supabase.functions.invoke('notify-report', {
            body: {
              record: {
                id: reportData.id,
                content_id: blockedId,
                content_type: 'profile',
                reason: reportReason,
                reporter_id: user.id,
              },
            },
          })
        } catch (notifyErr) {
          console.error('Failed to notify admins:', notifyErr)
        }
      }
    },
    onMutate: async ({ blockedId }) => {
      // Optimistically add to blocked list
      await queryClient.cancelQueries({ queryKey: ['blocked-users', user?.id] })
      const previous = queryClient.getQueryData<UserBlock[]>(['blocked-users', user?.id])
      queryClient.setQueryData<UserBlock[]>(['blocked-users', user?.id], (old) => [
        ...(old ?? []),
        { blocked_id: blockedId, created_at: new Date().toISOString() },
      ])
      return { previous }
    },
    onError: (_err, _, context) => {
      if (!isOffline && context?.previous) {
        queryClient.setQueryData(['blocked-users', user?.id], context.previous)
      }
    },
    onSuccess: () => {
      if (isOffline) {
        toast.info('User blocked offline - will sync when back online')
        return
      }
      queryClient.invalidateQueries({ queryKey: ['blocked-users'] })
      queryClient.invalidateQueries({ queryKey: ['chat'] })
      queryClient.invalidateQueries({ queryKey: ['moderation-queue'] })
    },
  })
}

export function useUnblockUser() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { isOffline } = useOffline()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (blockedId: string) => {
      if (!user) throw new Error('Not authenticated')

      if (isOffline) {
        queueOfflineAction('unblock-user', {
          blockerId: user.id,
          blockedId,
        })
        return
      }

      const { error } = await blocks()
        .delete()
        .eq('blocker_id', user.id)
        .eq('blocked_id', blockedId)

      if (error) throw error
    },
    onMutate: async (blockedId) => {
      await queryClient.cancelQueries({ queryKey: ['blocked-users', user?.id] })
      const previous = queryClient.getQueryData<UserBlock[]>(['blocked-users', user?.id])
      queryClient.setQueryData<UserBlock[]>(['blocked-users', user?.id], (old) =>
        old?.filter((b) => b.blocked_id !== blockedId),
      )
      return { previous }
    },
    onError: (_err, _, context) => {
      if (!isOffline && context?.previous) {
        queryClient.setQueryData(['blocked-users', user?.id], context.previous)
      }
    },
    onSuccess: () => {
      if (isOffline) {
        toast.info('User unblocked offline - will sync when back online')
        return
      }
      queryClient.invalidateQueries({ queryKey: ['blocked-users'] })
      queryClient.invalidateQueries({ queryKey: ['chat'] })
    },
  })
}
