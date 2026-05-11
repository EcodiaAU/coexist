import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, escapeIlike } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { COLLECTIVE_ROLE_RANK } from '@/lib/constants'
import type {
  Database,
  Tables,
  TablesUpdate,
} from '@/types/database.types'

type Collective = Tables<'collectives'>
type CollectiveMember = Tables<'collective_members'>
type Profile = Tables<'profiles'>

type CollectiveRole = Database['public']['Enums']['collective_role']

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CollectiveWithLeader extends Collective {
  profiles: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null
}

export interface CollectiveMemberWithProfile extends CollectiveMember {
  profiles: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'instagram_handle' | 'pronouns' | 'location' | 'membership_level' | 'email'> | null
}

export interface CollectiveStats {
  totalEvents: number
  totalTreesPlanted: number
  totalRubbishKg: number
  totalHours: number
  totalAreaRestored: number
  totalNativePlants: number
  totalWildlifeSightings: number
  activeMembers: number
  /** Attendance rate: checked-in / registered (0-1) */
  attendanceRate: number
}

/* ------------------------------------------------------------------ */
/*  Collective detail                                                  */
/* ------------------------------------------------------------------ */

export function useCollective(idOrSlug: string | undefined) {
  // Detect whether the param is a UUID or a slug
  const isUuid = !!idOrSlug && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug)

  return useQuery({
    queryKey: ['collective', idOrSlug],
    queryFn: async () => {
      if (!idOrSlug) throw new Error('No collective ID or slug')
      const { data, error } = await supabase
        .from('collectives')
        .select('*, profiles!collectives_leader_id_fkey(id, display_name, avatar_url)')
        .eq(isUuid ? 'id' : 'slug', idOrSlug)
        .single()
      if (error) throw error
      return data as CollectiveWithLeader
    },
    enabled: !!idOrSlug,
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  All collectives (for discovery)                                    */
/* ------------------------------------------------------------------ */

export function useCollectives(filters?: { state?: string; search?: string; includeNational?: boolean }) {
  return useQuery({
    queryKey: ['collectives', filters],
    queryFn: async () => {
      let query = supabase
        .from('collectives')
        .select('*, profiles!collectives_leader_id_fkey(id, display_name, avatar_url)')
        .eq('is_active', true)
        .order('name')

      if (!filters?.includeNational) {
        query = query.or('is_national.is.null,is_national.eq.false')
      }

      if (filters?.state) {
        query = query.eq('state', filters.state)
      }
      if (filters?.search) {
        query = query.ilike('name', `%${escapeIlike(filters.search)}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return data as CollectiveWithLeader[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  My collectives                                                     */
/* ------------------------------------------------------------------ */

export function useMyCollectives() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['my-collectives', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase
        .from('collective_members')
        .select('collective_id, role, joined_at, collectives(id, name, slug, cover_image_url, region, state, member_count)')
        .eq('user_id', user.id)
        .eq('status', 'active')
      if (error) throw error
      return data
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Members list                                                       */
/* ------------------------------------------------------------------ */

export function useCollectiveMembers(collectiveId: string | undefined) {
  return useQuery({
    queryKey: ['collective-members', collectiveId],
    queryFn: async () => {
      if (!collectiveId) throw new Error('No collective ID')
      const { data, error } = await supabase
        .from('collective_members')
        .select('*, profiles(id, display_name, avatar_url, instagram_handle, pronouns, location, membership_level, email)')
        .eq('collective_id', collectiveId)
        .eq('status', 'active')
        .order('role', { ascending: false })
      if (error) throw error
      return data as CollectiveMemberWithProfile[]
    },
    enabled: !!collectiveId,
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Leaders (leader + co_leader + assist_leader)                       */
/* ------------------------------------------------------------------ */

export function useCollectiveLeaders(collectiveId: string | undefined) {
  return useQuery({
    queryKey: ['collective-leaders', collectiveId],
    queryFn: async () => {
      if (!collectiveId) throw new Error('No collective ID')
      const { data, error } = await supabase
        .from('collective_members')
        .select('*, profiles(id, display_name, avatar_url, instagram_handle)')
        .eq('collective_id', collectiveId)
        .eq('status', 'active')
        .in('role', ['leader', 'co_leader', 'assist_leader'])
        .order('role', { ascending: false })
      if (error) throw error
      return data as CollectiveMemberWithProfile[]
    },
    enabled: !!collectiveId,
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Collective events                                                  */
/* ------------------------------------------------------------------ */

export function useCollectiveEvents(collectiveId: string | undefined, type: 'upcoming' | 'past') {
  return useQuery({
    queryKey: ['collective-events', collectiveId, type],
    queryFn: async () => {
      if (!collectiveId) throw new Error('No collective ID')
      const now = new Date().toISOString()

      let query = supabase
        .from('events')
        .select('*')
        .eq('collective_id', collectiveId)

      if (type === 'upcoming') {
        query = query
          .eq('status', 'published')
          .or(`date_start.gte.${now},date_end.gte.${now}`)
          .order('date_start', { ascending: true })
      } else {
        // Past events: both 'completed' and 'published' events whose end date has passed
        query = query
          .in('status', ['published', 'completed'])
          .lt('date_end', now)
          .order('date_start', { ascending: false })
      }

      const { data, error } = await query.limit(20)
      if (error) throw error
      return data
    },
    enabled: !!collectiveId,
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Collective stats                                                   */
/* ------------------------------------------------------------------ */

export function useCollectiveStats(collectiveId: string | undefined) {
  return useQuery({
    queryKey: ['collective-stats', collectiveId],
    queryFn: async () => {
      if (!collectiveId) throw new Error('No collective ID')

      // Delegate entirely to the canonical multi-host-aware RPC. It applies per-host
      // share weighting so co-hosted events don't inflate national totals, and it
      // now also returns leaders_current + leaders_lifetime (migration 20260511000000).
      const { data, error } = await supabase.rpc('get_collective_stats', {
        p_collective_id: collectiveId,
      })
      if (error) throw error

      const d = (data ?? {}) as Record<string, number>
      return {
        totalEvents:            d.event_count        ?? 0,
        totalTreesPlanted:      d.trees_planted       ?? 0,
        totalRubbishKg:         d.rubbish_kg          ?? 0,
        totalHours:             d.hours_total         ?? 0,
        totalAreaRestored:      d.area_restored_sqm   ?? 0,
        totalNativePlants:      d.native_plants       ?? 0,
        totalWildlifeSightings: d.wildlife_sightings  ?? 0,
        activeMembers:          d.member_count        ?? 0,
        attendanceRate:         d.attendance_rate     ?? 0,
      } satisfies CollectiveStats
    },
    enabled: !!collectiveId,
    staleTime: 10 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Membership status                                                  */
/* ------------------------------------------------------------------ */

export function useCollectiveMembership(collectiveId: string | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['collective-membership', collectiveId, user?.id],
    queryFn: async () => {
      if (!user || !collectiveId) return null
      const { data, error } = await supabase
        .from('collective_members')
        .select('id, role, status, joined_at')
        .eq('collective_id', collectiveId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!user && !!collectiveId,
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Join collective                                                    */
/* ------------------------------------------------------------------ */

export function useJoinCollective() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (collectiveId: string) => {
      if (!user) throw new Error('Not authenticated')
      // Use upsert to handle re-joining after leaving or being removed.
      // The table has UNIQUE(collective_id, user_id), so a plain insert
      // would fail for users who previously left/were removed.
      const { error } = await supabase
        .from('collective_members')
        .upsert(
          {
            collective_id: collectiveId,
            user_id: user.id,
            role: 'participant',
            status: 'active',
          },
          { onConflict: 'collective_id,user_id' },
        )
      if (error) throw error
    },
    onMutate: async (collectiveId) => {
      await queryClient.cancelQueries({ queryKey: ['collective-membership', collectiveId] })
      const previous = queryClient.getQueryData(['collective-membership', collectiveId, user?.id])
      queryClient.setQueryData(['collective-membership', collectiveId, user?.id], {
        id: `temp-${Date.now()}`,
        role: 'participant',
        status: 'active',
        joined_at: new Date().toISOString(),
      })
      return { previous }
    },
    onError: (_err, collectiveId, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(['collective-membership', collectiveId, user?.id], context.previous)
    },
    onSettled: (_, __, collectiveId) => {
      queryClient.invalidateQueries({ queryKey: ['collective-membership', collectiveId] })
      queryClient.invalidateQueries({ queryKey: ['collective-members', collectiveId] })
      queryClient.invalidateQueries({ queryKey: ['collective', collectiveId] })
      queryClient.invalidateQueries({ queryKey: ['my-collectives'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Leave collective                                                   */
/* ------------------------------------------------------------------ */

export function useLeaveCollective() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (collectiveId: string) => {
      if (!user) throw new Error('Not authenticated')

      // Prevent leaders from leaving - they must transfer leadership first
      const { data: membership } = await supabase
        .from('collective_members')
        .select('role')
        .eq('collective_id', collectiveId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single()

      if (membership?.role === 'leader') {
        throw new Error('Leaders must transfer leadership before leaving. Promote another member to leader first.')
      }

      const { error } = await supabase
        .from('collective_members')
        .update({ status: 'left' })
        .eq('collective_id', collectiveId)
        .eq('user_id', user.id)
      if (error) throw error
    },
    onMutate: async (collectiveId) => {
      await queryClient.cancelQueries({ queryKey: ['collective-membership', collectiveId] })
      const previous = queryClient.getQueryData(['collective-membership', collectiveId, user?.id])
      queryClient.setQueryData(['collective-membership', collectiveId, user?.id], null)
      return { previous }
    },
    onError: (_err, collectiveId, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(['collective-membership', collectiveId, user?.id], context.previous)
    },
    onSettled: (_, __, collectiveId) => {
      queryClient.invalidateQueries({ queryKey: ['collective-membership', collectiveId] })
      queryClient.invalidateQueries({ queryKey: ['collective-members', collectiveId] })
      queryClient.invalidateQueries({ queryKey: ['collective', collectiveId] })
      queryClient.invalidateQueries({ queryKey: ['my-collectives'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Update collective (leader)                                         */
/* ------------------------------------------------------------------ */

export function useUpdateCollective() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ collectiveId, updates }: { collectiveId: string; updates: TablesUpdate<'collectives'> }) => {
      const { error } = await supabase
        .from('collectives')
        .update(updates)
        .eq('id', collectiveId)
      if (error) throw error
    },
    onMutate: async ({ collectiveId, updates }) => {
      await queryClient.cancelQueries({ queryKey: ['collective', collectiveId] })
      const previous = queryClient.getQueryData<CollectiveWithLeader>(['collective', collectiveId])
      queryClient.setQueryData<CollectiveWithLeader>(['collective', collectiveId], (old) =>
        old ? { ...old, ...updates } : old,
      )
      return { previous }
    },
    onError: (_err, { collectiveId }, context) => {
      if (context?.previous) queryClient.setQueryData(['collective', collectiveId], context.previous)
    },
    onSettled: (_, __, { collectiveId }) => {
      queryClient.invalidateQueries({ queryKey: ['collective', collectiveId] })
      queryClient.invalidateQueries({ queryKey: ['collectives'] })
      queryClient.invalidateQueries({ queryKey: ['my-collectives'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Remove member (leader)                                             */
/* ------------------------------------------------------------------ */

export function useRemoveMember() {
  const queryClient = useQueryClient()
  const { user, isStaff, isAdmin, isSuperAdmin } = useAuth()

  const isGlobalStaff = isStaff || isAdmin || isSuperAdmin

  return useMutation({
    mutationFn: async ({ collectiveId, userId }: { collectiveId: string; userId: string }) => {
      if (!user) throw new Error('Not authenticated')

      // Enforce hierarchy: can only remove members ranked strictly below you
      // Global staff/admin can remove anyone
      const [{ data: actorRow }, { data: targetRow }] = await Promise.all([
        supabase
          .from('collective_members')
          .select('role')
          .eq('collective_id', collectiveId)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle(),
        supabase
          .from('collective_members')
          .select('role')
          .eq('collective_id', collectiveId)
          .eq('user_id', userId)
          .eq('status', 'active')
          .single(),
      ])

      const actorRank = isGlobalStaff ? 99 : (actorRow ? ROLE_RANK[actorRow.role as CollectiveRole] : -1)
      const targetRank = targetRow ? ROLE_RANK[targetRow.role as CollectiveRole] : -1

      if (targetRank >= actorRank) {
        throw new Error('Cannot remove a member at or above your rank')
      }

      const { error } = await supabase
        .from('collective_members')
        .update({ status: 'removed' })
        .eq('collective_id', collectiveId)
        .eq('user_id', userId)
      if (error) throw error
    },
    onMutate: async ({ collectiveId, userId }) => {
      await queryClient.cancelQueries({ queryKey: ['collective-members', collectiveId] })
      const previous = queryClient.getQueryData<CollectiveMemberWithProfile[]>(['collective-members', collectiveId])
      queryClient.setQueryData<CollectiveMemberWithProfile[]>(['collective-members', collectiveId], (old) => old?.filter(m => m.user_id !== userId))
      return { previous }
    },
    onError: (_err, { collectiveId }, context) => {
      if (context?.previous) queryClient.setQueryData(['collective-members', collectiveId], context.previous)
    },
    onSettled: (_, __, { collectiveId }) => {
      queryClient.invalidateQueries({ queryKey: ['collective-members', collectiveId] })
      queryClient.invalidateQueries({ queryKey: ['collective', collectiveId] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Update member role (leader)                                        */
/* ------------------------------------------------------------------ */

const ROLE_RANK = COLLECTIVE_ROLE_RANK as Record<CollectiveRole, number>

export function useUpdateMemberRole() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({ collectiveId, userId, role }: { collectiveId: string; userId: string; role: CollectiveRole }) => {
      if (!user) throw new Error('Not authenticated')

      // Fetch both the actor's and target's current roles to enforce hierarchy
      const [{ data: actorRow }, { data: targetRow }] = await Promise.all([
        supabase
          .from('collective_members')
          .select('role')
          .eq('collective_id', collectiveId)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .single(),
        supabase
          .from('collective_members')
          .select('role')
          .eq('collective_id', collectiveId)
          .eq('user_id', userId)
          .eq('status', 'active')
          .single(),
      ])

      const actorRank = actorRow ? ROLE_RANK[actorRow.role as CollectiveRole] : -1
      const targetRank = targetRow ? ROLE_RANK[targetRow.role as CollectiveRole] : -1

      const isLeader = actorRank === ROLE_RANK.leader
      // Leaders can manage co-leaders and below; others only strictly below their rank
      const maxManageableRank = isLeader ? ROLE_RANK.co_leader : actorRank - 1
      if (targetRank > maxManageableRank) {
        throw new Error('Cannot change the role of a member at or above your rank')
      }
      // Leaders can assign up to co_leader; others only strictly below their rank
      const maxAssignableRank = isLeader ? ROLE_RANK.co_leader : actorRank - 1
      if (ROLE_RANK[role] > maxAssignableRank) {
        throw new Error('Cannot promote a member to that role')
      }

      const { error } = await supabase
        .from('collective_members')
        .update({ role })
        .eq('collective_id', collectiveId)
        .eq('user_id', userId)
      if (error) throw error
    },
    onMutate: async ({ collectiveId, userId, role }) => {
      await queryClient.cancelQueries({ queryKey: ['collective-members', collectiveId] })
      const previous = queryClient.getQueryData<CollectiveMemberWithProfile[]>(['collective-members', collectiveId])
      queryClient.setQueryData<CollectiveMemberWithProfile[]>(['collective-members', collectiveId], (old) => {
        if (!old) return old
        return old.map(m => m.user_id === userId ? { ...m, role } : m)
      })
      return { previous }
    },
    onError: (_err, { collectiveId }, context) => {
      if (context?.previous) queryClient.setQueryData(['collective-members', collectiveId], context.previous)
    },
    onSettled: (_, __, { collectiveId }) => {
      queryClient.invalidateQueries({ queryKey: ['collective-members', collectiveId] })
      queryClient.invalidateQueries({ queryKey: ['collective-leaders', collectiveId] })
      queryClient.invalidateQueries({ queryKey: ['collective-role', collectiveId] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Export members CSV                                                  */
/* ------------------------------------------------------------------ */

export function exportMembersCSV(members: CollectiveMemberWithProfile[]) {
  const header = 'Name,Role,Instagram,Location,Joined\n'
  const rows = members.map((m) => {
    const p = m.profiles
    return [
      `"${p?.display_name ?? ''}"`,
      m.role,
      p?.instagram_handle ?? '',
      `"${p?.location ?? ''}"`,
      new Date(m.joined_at!).toLocaleDateString(),
    ].join(',')
  }).join('\n')

  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'collective-members.csv'
  a.click()
  URL.revokeObjectURL(url)
}
