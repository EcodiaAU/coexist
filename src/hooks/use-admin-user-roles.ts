import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'
import { resolveCapabilities } from '@/lib/capabilities'
import type { Database } from '@/types/database.types'

type CollectiveRole = Database['public']['Enums']['collective_role']
type UserRole = Database['public']['Enums']['user_role']

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface UserCollectiveRole {
  id: string
  collective_id: string
  role: CollectiveRole
  status: string
  joined_at: string
  collective: {
    id: string
    name: string
    slug: string
    state: string | null
    region: string | null
  }
}

/* ------------------------------------------------------------------ */
/*  useUserCollectiveRoles - all collective memberships for a user     */
/* ------------------------------------------------------------------ */

export function useUserCollectiveRoles(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin-user-collective-roles', userId],
    queryFn: async () => {
      if (!userId) return []
      const { data, error } = await supabase
        .from('collective_members')
        .select('id, collective_id, role, status, joined_at, collectives(id, name, slug, state, region)')
        .eq('user_id', userId)
        .order('role', { ascending: false })

      if (error) throw error
      return (data ?? []).map((row) => ({
        id: row.id,
        collective_id: row.collective_id,
        role: row.role as CollectiveRole,
        status: row.status,
        joined_at: row.joined_at,
        collective: row.collectives as UserCollectiveRole['collective'],
      })) as UserCollectiveRole[]
    },
    enabled: !!userId,
    staleTime: 30 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  useAdminAssignCollectiveRole - add/update user collective role     */
/* ------------------------------------------------------------------ */

export function useAdminAssignCollectiveRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      userId,
      collectiveId,
      role,
    }: {
      userId: string
      collectiveId: string
      role: CollectiveRole
    }) => {
      const { error } = await supabase
        .from('collective_members')
        .upsert(
          {
            user_id: userId,
            collective_id: collectiveId,
            role,
            status: 'active',
          },
          { onConflict: 'collective_id,user_id' },
        )
      if (error) throw error

      if (role === 'leader') {
        // Demote any existing leaders in this collective to co_leader
        const { error: demoteError } = await supabase
          .from('collective_members')
          .update({ role: 'co_leader' })
          .eq('collective_id', collectiveId)
          .eq('role', 'leader')
          .neq('user_id', userId)
        if (demoteError) throw demoteError

        const { error: leaderError } = await supabase
          .from('collectives')
          .update({ leader_id: userId })
          .eq('id', collectiveId)
        if (leaderError) throw leaderError
      }
      await logAudit({ action: 'member_role_changed', target_type: 'collective_member', target_id: userId, details: { collective_id: collectiveId, new_role: role } })
    },
    onMutate: async (variables) => {
      const key = ['admin-user-collective-roles', variables.userId]
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<UserCollectiveRole[]>(key)

      queryClient.setQueryData<UserCollectiveRole[]>(key, (old) => {
        if (!old) return old
        const idx = old.findIndex((r) => r.collective_id === variables.collectiveId)
        if (idx >= 0) {
          const updated = [...old]
          updated[idx] = { ...updated[idx], role: variables.role, status: 'active' }
          return updated
        }
        return old
      })

      return { previous }
    },
    onError: (_err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['admin-user-collective-roles', variables.userId], context.previous)
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-user-collective-roles', variables.userId] })
      queryClient.invalidateQueries({ queryKey: ['admin-collective-members'] })
      queryClient.invalidateQueries({ queryKey: ['admin-collective-detail'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  useAdminRemoveFromCollective - remove user from collective         */
/* ------------------------------------------------------------------ */

export function useAdminRemoveFromCollective() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      userId,
      collectiveId,
    }: {
      userId: string
      collectiveId: string
    }) => {
      const { error } = await supabase
        .from('collective_members')
        .update({ status: 'removed' })
        .eq('user_id', userId)
        .eq('collective_id', collectiveId)
      if (error) throw error
      await logAudit({ action: 'member_removed', target_type: 'collective_member', target_id: userId, details: { collective_id: collectiveId } })
    },
    onMutate: async (variables) => {
      const key = ['admin-user-collective-roles', variables.userId]
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<UserCollectiveRole[]>(key)

      queryClient.setQueryData<UserCollectiveRole[]>(key, (old) =>
        old?.map((r) =>
          r.collective_id === variables.collectiveId ? { ...r, status: 'removed' } : r,
        ),
      )

      return { previous }
    },
    onError: (_err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['admin-user-collective-roles', variables.userId], context.previous)
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-user-collective-roles', variables.userId] })
      queryClient.invalidateQueries({ queryKey: ['admin-collective-members'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  useAdminUpdateCapabilities - update staff_roles.permissions        */
/* ------------------------------------------------------------------ */

export function useAdminUpdateCapabilities() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      userId,
      permissions,
    }: {
      userId: string
      permissions: Record<string, boolean>
    }) => {
      const { error } = await supabase
        .from('staff_roles')
        .upsert(
          { user_id: userId, permissions },
          { onConflict: 'user_id' },
        )
      if (error) throw error
    },
    onMutate: async (variables) => {
      const key = ['admin-user-resolved-caps', variables.userId]
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData(key)

      queryClient.setQueryData(key, (old: { role: UserRole; overrides: Record<string, boolean>; capabilities: Set<string> } | undefined) => {
        if (!old) return old
        const newCaps = resolveCapabilities(old.role, variables.permissions)
        return { ...old, overrides: variables.permissions, capabilities: newCaps }
      })

      return { previous }
    },
    onError: (_err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['admin-user-resolved-caps', variables.userId], context.previous)
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-user-resolved-caps', variables.userId] })
      queryClient.invalidateQueries({ queryKey: ['staff-permissions'] })
      queryClient.invalidateQueries({ queryKey: ['admin-staff-directory'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  useUserResolvedCapabilities - fetch and resolve caps for any user  */
/* ------------------------------------------------------------------ */

export function useUserResolvedCapabilities(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin-user-resolved-caps', userId],
    queryFn: async () => {
      if (!userId) return { role: 'participant' as UserRole, overrides: {} as Record<string, boolean>, capabilities: new Set<string>() }

      const [profileRes, staffRes] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', userId).single(),
        supabase.from('staff_roles').select('permissions').eq('user_id', userId).maybeSingle(),
      ])

      const role = (profileRes.data?.role ?? 'participant') as UserRole
      const overrides = ((staffRes.data as Record<string, unknown> | null)?.permissions as Record<string, boolean>) ?? {}
      const capabilities = resolveCapabilities(role, overrides)

      return { role, overrides, capabilities }
    },
    enabled: !!userId,
    staleTime: 30 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  useUserManagedCollectives - which collectives a manager oversees   */
/* ------------------------------------------------------------------ */

export function useUserManagedCollectives(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin-user-managed-collectives', userId],
    queryFn: async () => {
      if (!userId) return [] as string[]
      const { data, error } = await supabase
        .from('staff_roles')
        .select('managed_collectives')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) return []
      return ((data as Record<string, unknown>)?.managed_collectives ?? []) as string[]
    },
    enabled: !!userId,
    staleTime: 30 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  useAdminUpdateManagedCollectives - set which collectives a manager */
/*  is responsible for                                                 */
/* ------------------------------------------------------------------ */

export function useAdminUpdateManagedCollectives() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      userId,
      collectiveIds,
    }: {
      userId: string
      collectiveIds: string[]
    }) => {
      const { error } = await supabase
        .from('staff_roles')
        .upsert(
          { user_id: userId, managed_collectives: collectiveIds } as any,
          { onConflict: 'user_id' },
        )
      if (error) throw error
      await logAudit({ action: 'role_changed', target_type: 'user', target_id: userId, details: { managed_collectives: collectiveIds } })
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-user-managed-collectives', variables.userId] })
      queryClient.invalidateQueries({ queryKey: ['staff-permissions'] })
    },
  })
}
