import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { supabase, escapeIlike } from '@/lib/supabase'
import { sumMetricWeighted } from '@/lib/impact-metrics'
import { fetchImpactRows } from '@/lib/impact-query'
import { logAudit } from '@/lib/audit'
import { countByField, STATUS_FILTERS } from '@/lib/query-builders'
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

export interface AdminCollective extends Collective {
  memberCount: number
  eventCount: number
  health: 'healthy' | 'moderate' | 'needs-attention'
  leaderName: string | null
}

export interface AdminCollectiveMember extends CollectiveMember {
  profiles: Pick<
    Profile,
    'id' | 'display_name' | 'avatar_url' | 'instagram_handle' | 'pronouns' | 'location' | 'membership_level'
  > | null
}

export interface AdminCollectiveEvent {
  id: string
  title: string
  activity_type: string
  date_start: string
  date_end: string | null
  status: string
  address: string | null
  capacity: number | null
  cover_image_url: string | null
  registrationCount: number
}

export interface AdminCollectiveDetail extends Collective {
  profiles: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null
}

/* ------------------------------------------------------------------ */
/*  Collectives list (admin view - includes archived)                  */
/* ------------------------------------------------------------------ */

export function useAdminCollectives(filters: {
  search: string
  status: 'all' | 'active' | 'archived'
}) {
  return useQuery({
    queryKey: ['admin-collectives', filters],
    queryFn: async () => {
      let query = supabase
        .from('collectives')
        .select('*, profiles!collectives_leader_id_fkey(id, display_name, avatar_url)')
        .neq('is_national', true)
        .order('name')

      if (filters.search) {
        query = query.ilike('name', `%${escapeIlike(filters.search)}%`)
      }

      if (filters.status === 'active') {
        query = query.eq('is_active', true)
      } else if (filters.status === 'archived') {
        query = query.eq('is_active', false)
      }

      const { data, error } = await query
      if (error) throw error

      const collectives = data ?? []
      if (collectives.length === 0) return []

      const ids = collectives.map((c) => c.id)

      // Batch-fetch member and event counts in two queries instead of 2N
      const [membersRes, eventsRes] = await Promise.all([
        supabase
          .from('collective_members')
          .select('collective_id')
          .in('collective_id', ids)
          .eq('status', 'active'),
        supabase
          .from('events')
          .select('collective_id')
          .in('collective_id', ids),
      ])

      const memberCounts = countByField(
        (membersRes.data ?? []) as { collective_id: string }[],
        'collective_id',
      )
      const eventCounts = countByField(
        (eventsRes.data ?? []) as { collective_id: string }[],
        'collective_id',
      )

      return collectives.map((c) => {
        const memberCount = memberCounts.get(c.id) ?? 0
        const eventCount = eventCounts.get(c.id) ?? 0
        const health =
          memberCount >= 10 && eventCount >= 3
            ? 'healthy'
            : memberCount >= 5
              ? 'moderate'
              : 'needs-attention'

        return {
          ...c,
          memberCount,
          eventCount,
          health,
          leaderName: (c.profiles as { display_name: string } | null)?.display_name ?? null,
        } as AdminCollective
      })
    },
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

/* ------------------------------------------------------------------ */
/*  Single collective detail                                           */
/* ------------------------------------------------------------------ */

export function useAdminCollectiveDetail(collectiveId: string | undefined) {
  return useQuery({
    queryKey: ['admin-collective-detail', collectiveId],
    queryFn: async () => {
      if (!collectiveId) throw new Error('No collective ID')
      const { data, error } = await supabase
        .from('collectives')
        .select('*, profiles!collectives_leader_id_fkey(id, display_name, avatar_url)')
        .eq('id', collectiveId)
        .single()
      if (error) throw error
      return data as AdminCollectiveDetail
    },
    enabled: !!collectiveId,
    staleTime: 2 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Members list (admin - includes ALL statuses)                       */
/* ------------------------------------------------------------------ */

export function useAdminCollectiveMembers(collectiveId: string | undefined, statusFilter: 'active' | 'all' = 'active') {
  return useQuery({
    queryKey: ['admin-collective-members', collectiveId, statusFilter],
    queryFn: async () => {
      if (!collectiveId) throw new Error('No collective ID')
      let query = supabase
        .from('collective_members')
        .select('*, profiles(id, display_name, avatar_url, instagram_handle, pronouns, location, membership_level)')
        .eq('collective_id', collectiveId)
        .order('role', { ascending: false })
        .order('joined_at', { ascending: true })

      if (statusFilter === 'active') {
        query = query.eq('status', 'active')
      }

      const { data, error } = await query
      if (error) throw error
      return data as AdminCollectiveMember[]
    },
    enabled: !!collectiveId,
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

/* ------------------------------------------------------------------ */
/*  Events list for a collective (admin view)                          */
/* ------------------------------------------------------------------ */

export function useAdminCollectiveEvents(collectiveId: string | undefined) {
  return useQuery({
    queryKey: ['admin-collective-events', collectiveId],
    queryFn: async () => {
      if (!collectiveId) throw new Error('No collective ID')

      const { data: events, error } = await supabase
        .from('events')
        .select('id, title, activity_type, date_start, date_end, status, address, capacity, cover_image_url')
        .eq('collective_id', collectiveId)
        .order('date_start', { ascending: false })
        .limit(100)

      if (error) throw error

      const eventList = events ?? []
      if (eventList.length === 0) return []

      // Batch-fetch registration counts in one query instead of N
      const eventIds = eventList.map((ev) => ev.id)
      const { data: regRows } = await supabase
        .from('event_registrations')
        .select('event_id')
        .in('event_id', eventIds)
        .in('status', STATUS_FILTERS.events.REGISTRATION)

      const regCounts = new Map<string, number>()
      for (const row of (regRows ?? []) as { event_id: string }[]) {
        regCounts.set(row.event_id, (regCounts.get(row.event_id) ?? 0) + 1)
      }

      return eventList.map((ev) => ({
        ...ev,
        registrationCount: regCounts.get(ev.id) ?? 0,
      } as AdminCollectiveEvent))
    },
    enabled: !!collectiveId,
    staleTime: 2 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Collective stats (admin)                                           */
/* ------------------------------------------------------------------ */

export function useAdminCollectiveStats(collectiveId: string | undefined) {
  return useQuery({
    queryKey: ['admin-collective-stats', collectiveId],
    queryFn: async () => {
      if (!collectiveId) throw new Error('No collective ID')

      // RPC uses COALESCE(SUM(...), 0) so unmeasured metrics aggregate to 0,
      // which is the correct semantic for dashboard totals (vs null in raw rows).
      // The RPC is multi-host aware: it resolves via event_hosts and applies
      // share weighting so co-hosted events don't double-count.
      const [rpcRes, impactResult] = await Promise.all([
        supabase.rpc('get_collective_stats', { p_collective_id: collectiveId }),
        fetchImpactRows({ collectiveId, timeRange: 'all-time', includeLegacy: true }),
      ])
      if (rpcRes.error) throw rpcRes.error
      const { rows: impactRows, shareByEventId } = impactResult

      const rpcData = rpcRes.data as {
        member_count: number
        event_count: number
        trees_planted: number
        rubbish_kg: number
        coastline_cleaned_m: number
        hours_total: number
        area_restored_sqm: number
        native_plants: number
        wildlife_sightings: number
        invasive_weeds_pulled: number
      }

      // hours_total is overridden client-side because the legacy estimate
      // (attendees × duration) lives in TS, not the RPC. Weight by share so
      // co-hosted events split hours across hosts.
      return {
        ...rpcData,
        hours_total: Math.round(sumMetricWeighted(impactRows, 'hours_total', shareByEventId)),
      }
    },
    enabled: !!collectiveId,
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Create collective                                                  */
/* ------------------------------------------------------------------ */

export function useCreateCollective() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      name: string
      description?: string
      region?: string
      state?: string
      leaderId?: string
    }) => {
      let slug = input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

      // Check for slug collision and append a suffix if needed
      const { data: existing } = await supabase
        .from('collectives')
        .select('slug')
        .eq('slug', slug)
        .maybeSingle()

      if (existing) {
        slug = `${slug}-${Date.now().toString(36)}`
      }

      const { data, error } = await supabase
        .from('collectives')
        .insert({
          name: input.name,
          slug,
          description: input.description || null,
          region: input.region || null,
          state: input.state || null,
          leader_id: input.leaderId || null,
        })
        .select('id')
        .single()

      if (error) throw error

      // If a leader was assigned, also add them as a member with 'leader' role
      if (input.leaderId && data) {
        await supabase.from('collective_members').insert({
          collective_id: data.id,
          user_id: input.leaderId,
          role: 'leader',
          status: 'active',
        })
      }

      await logAudit({ action: 'collective_created', target_type: 'collective', target_id: data?.id, details: { name: input.name } })

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-collectives'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Update collective                                                  */
/* ------------------------------------------------------------------ */

export function useAdminUpdateCollective() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      collectiveId,
      updates,
    }: {
      collectiveId: string
      updates: TablesUpdate<'collectives'>
    }) => {
      const { error } = await supabase
        .from('collectives')
        .update(updates)
        .eq('id', collectiveId)
      if (error) throw error
      await logAudit({ action: 'collective_updated', target_type: 'collective', target_id: collectiveId, details: { fields: Object.keys(updates) } })
    },
    onSuccess: (_, { collectiveId }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-collective-detail', collectiveId] })
      queryClient.invalidateQueries({ queryKey: ['admin-collectives'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Archive / Restore collective                                       */
/* ------------------------------------------------------------------ */

export function useArchiveCollective() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ collectiveId, archive }: { collectiveId: string; archive: boolean }) => {
      const { error } = await supabase
        .from('collectives')
        .update({ is_active: !archive })
        .eq('id', collectiveId)
      if (error) throw error
      await logAudit({ action: archive ? 'collective_archived' : 'collective_restored', target_type: 'collective', target_id: collectiveId })
    },
    onMutate: async ({ collectiveId, archive }) => {
      await queryClient.cancelQueries({ queryKey: ['admin-collective-detail', collectiveId] })
      const previousDetail = queryClient.getQueryData<AdminCollectiveDetail>(['admin-collective-detail', collectiveId])
      if (previousDetail) {
        queryClient.setQueryData<AdminCollectiveDetail>(['admin-collective-detail', collectiveId], {
          ...previousDetail,
          is_active: !archive,
        })
      }
      return { previousDetail }
    },
    onError: (_err, { collectiveId }, ctx) => {
      if (ctx?.previousDetail) {
        queryClient.setQueryData(['admin-collective-detail', collectiveId], ctx.previousDetail)
      }
    },
    onSettled: (_, __, { collectiveId }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-collectives'] })
      queryClient.invalidateQueries({ queryKey: ['admin-collective-detail', collectiveId] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Delete collective (super admin only - hard delete)                 */
/* ------------------------------------------------------------------ */

export function useDeleteCollective() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (collectiveId: string) => {
      // Remove all members first to avoid orphaned rows if FK cascade is missing
      const { error: memberErr } = await supabase
        .from('collective_members')
        .delete()
        .eq('collective_id', collectiveId)
      if (memberErr) throw memberErr

      const { error } = await supabase
        .from('collectives')
        .delete()
        .eq('id', collectiveId)
      if (error) throw error

      // Log audit AFTER successful delete
      await logAudit({ action: 'collective_deleted', target_type: 'collective', target_id: collectiveId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-collectives'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Member mutations (admin)                                           */
/* ------------------------------------------------------------------ */

export function useAdminUpdateMemberRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      collectiveId,
      userId,
      role,
    }: {
      collectiveId: string
      userId: string
      role: CollectiveRole
    }) => {
      const { error } = await supabase
        .from('collective_members')
        .update({ role })
        .eq('collective_id', collectiveId)
        .eq('user_id', userId)
      if (error) throw error

      // If promoting to leader, demote the old leader and update collectives.leader_id
      if (role === 'leader') {
        // Demote any existing leaders in this collective to co_leader
        const { error: demoteError } = await supabase
          .from('collective_members')
          .update({ role: 'co_leader' as CollectiveRole })
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
    onSuccess: (_, { collectiveId }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-collective-members', collectiveId] })
      queryClient.invalidateQueries({ queryKey: ['admin-collective-detail', collectiveId] })
      queryClient.invalidateQueries({ queryKey: ['admin-collectives'] })
    },
  })
}

export function useAdminRemoveMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      collectiveId,
      userId,
    }: {
      collectiveId: string
      userId: string
    }) => {
      const { error } = await supabase
        .from('collective_members')
        .update({ status: 'removed' })
        .eq('collective_id', collectiveId)
        .eq('user_id', userId)
      if (error) throw error
      await logAudit({ action: 'member_removed', target_type: 'collective_member', target_id: userId, details: { collective_id: collectiveId } })
    },
    onSuccess: (_, { collectiveId }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-collective-members', collectiveId] })
      queryClient.invalidateQueries({ queryKey: ['admin-collective-detail', collectiveId] })
      queryClient.invalidateQueries({ queryKey: ['admin-collectives'] })
    },
  })
}

export function useAdminRestoreMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      collectiveId,
      userId,
    }: {
      collectiveId: string
      userId: string
    }) => {
      const { error } = await supabase
        .from('collective_members')
        .update({ status: 'active' })
        .eq('collective_id', collectiveId)
        .eq('user_id', userId)
      if (error) throw error
      await logAudit({ action: 'member_restored', target_type: 'collective_member', target_id: userId, details: { collective_id: collectiveId } })
    },
    onSuccess: (_, { collectiveId }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-collective-members', collectiveId] })
      queryClient.invalidateQueries({ queryKey: ['admin-collective-detail', collectiveId] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Add member (admin - can add any user to any collective)            */
/* ------------------------------------------------------------------ */

export function useAdminAddMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      collectiveId,
      userId,
      role = 'participant',
    }: {
      collectiveId: string
      userId: string
      role?: CollectiveRole
    }) => {
      const { error } = await supabase.from('collective_members').upsert(
        {
          collective_id: collectiveId,
          user_id: userId,
          role,
          status: 'active',
        },
        { onConflict: 'collective_id,user_id' },
      )
      if (error) throw error
    },
    onSuccess: (_, { collectiveId }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-collective-members', collectiveId] })
      queryClient.invalidateQueries({ queryKey: ['admin-collective-detail', collectiveId] })
      queryClient.invalidateQueries({ queryKey: ['admin-collectives'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Search users (for adding to collective)                            */
/* ------------------------------------------------------------------ */

export function useSearchUsers(query: string) {
  return useQuery({
    queryKey: ['admin-search-users', query],
    queryFn: async () => {
      if (!query || query.length < 2) return []
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, instagram_handle')
        .or(`display_name.ilike.%${escapeIlike(query)}%,instagram_handle.ilike.%${escapeIlike(query)}%`)
        .limit(10)
      if (error) throw error
      return data as Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'instagram_handle'>[]
    },
    enabled: query.length >= 2,
    staleTime: 30 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  CSV export helper                                                  */
/* ------------------------------------------------------------------ */

export function exportAdminMembersCSV(
  members: AdminCollectiveMember[],
  collectiveName: string,
) {
  const header = 'Name,Role,Status,Instagram,Location,Joined\n'
  const rows = members
    .map((m) => {
      const p = m.profiles
      return [
        `"${p?.display_name ?? ''}"`,
        m.role,
        m.status,
        p?.instagram_handle ?? '',
        `"${p?.location ?? ''}"`,
        new Date(m.joined_at ?? '').toLocaleDateString(),
      ].join(',')
    })
    .join('\n')

  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${collectiveName.replace(/\s+/g, '-').toLowerCase()}-members.csv`
  a.click()
  URL.revokeObjectURL(url)
}
