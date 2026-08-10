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
  // Enriched from public_profiles so the Blocked Users list shows a real
  // person, not a raw UUID (B6). Null when the blocked profile can't be read.
  display_name: string | null
  avatar_url: string | null
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
      const rows = (data ?? []) as { blocked_id: string; created_at: string }[]
      if (rows.length === 0) return []

      // Resolve names/avatars in one query against public_profiles (the safe
      // public projection). user_blocks has no FK to it, so we can't embed -
      // fetch by id and map. A blocked profile that can't be read degrades to
      // a neutral placeholder rather than a UUID.
      const ids = rows.map((r) => r.blocked_id)
      const { data: profs } = await supabase
        .from('public_profiles')
        .select('id, display_name, avatar_url')
        .in('id', ids)

      const byId = new Map(
        (profs ?? []).map((p) => [
          (p as { id: string }).id,
          p as { display_name: string | null; avatar_url: string | null },
        ]),
      )

      return rows.map((r) => ({
        blocked_id: r.blocked_id,
        created_at: r.created_at,
        display_name: byId.get(r.blocked_id)?.display_name ?? null,
        avatar_url: byId.get(r.blocked_id)?.avatar_url ?? null,
      }))
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
