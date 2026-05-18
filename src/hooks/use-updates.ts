import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { subscribeWithReconnect } from '@/lib/realtime'
import { useAuth } from '@/hooks/use-auth'
import type {
  Tables,
  Enums,
} from '@/types/database.types'

export type Update = Tables<'updates'>
type Profile = Tables<'profiles'>

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface UpdateWithAuthor extends Update {
  author: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'role'> | null
  is_read: boolean
}

/* ------------------------------------------------------------------ */
/*  Audience filter helper                                             */
/*                                                                     */
/*  Applies target_audience filtering client-side based on the         */
/*  current user's role and collective memberships.                    */
/* ------------------------------------------------------------------ */

function filterByAudience(
  announcements: UpdateWithAuthor[],
  userRole: string | null | undefined,
  collectiveIds: string[],
): UpdateWithAuthor[] {
  const isLeaderRole = ['leader', 'co_leader', 'assist_leader'].includes(
    userRole ?? '',
  )
  const isStaffOrAdmin = ['leader', 'national_leader', 'manager', 'admin'].includes(
    userRole ?? '',
  )

  return announcements.filter((a) => {
    // Staff/admins always see everything
    if (isStaffOrAdmin) return true

    switch (a.target_audience) {
      case 'all':
        return true
      case 'leaders':
        return isLeaderRole
      case 'collective_specific':
        return a.target_collective_id
          ? collectiveIds.includes(a.target_collective_id)
          : true
      default:
        return true
    }
  })
}

/* ------------------------------------------------------------------ */
/*  Fetch updates (with read status for current user)                  */
/* ------------------------------------------------------------------ */

export function useUpdates() {
  const { user, profile, collectiveRoles } = useAuth()
  const queryClient = useQueryClient()

  const collectiveIds = collectiveRoles.map((m) => m.collective_id)
  const highestCollectiveRole = collectiveRoles.length > 0
    ? collectiveRoles.reduce((best, m) => {
        const rank: Record<string, number> = { member: 0, assist_leader: 1, co_leader: 2, leader: 3 }
        return (rank[m.role] ?? 0) > (rank[best.role] ?? 0) ? m : best
      }, collectiveRoles[0]).role
    : null

  const query = useQuery({
    queryKey: ['updates', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('updates')
        .select(`
          *,
          author:profiles!updates_author_id_fkey(id, display_name, avatar_url, role)
        `)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error

      // Fetch read status for current user
      let readIds = new Set<string>()
      if (user) {
        const { data: reads } = await supabase
          .from('update_reads')
          .select('update_id')
          .eq('user_id', user.id)

        readIds = new Set((reads ?? []).map((r) => r.update_id))
      }

      return (data ?? []).map((a) => ({
        ...a,
        is_read: readIds.has(a.id),
      })) as UpdateWithAuthor[]
    },
    staleTime: 2 * 60 * 1000,
  })

  // Realtime for new, updated, and deleted announcements
  useEffect(() => {
    const channel = supabase
      .channel('updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'updates',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['updates'] })
          queryClient.invalidateQueries({ queryKey: ['updates-unread'] })
          queryClient.invalidateQueries({ queryKey: ['home', 'latest-update'] })
          queryClient.invalidateQueries({ queryKey: ['home', 'recent-updates'] })
        },
      )


    const cleanup = subscribeWithReconnect(channel)

    return () => {
      cleanup()
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  // Apply audience filtering, then split pinned + regular
  const effectiveRole = profile?.role ?? highestCollectiveRole
  const filtered = filterByAudience(query.data ?? [], effectiveRole, collectiveIds)
  const pinned = filtered.filter((a) => a.is_pinned)
  const regular = filtered.filter((a) => !a.is_pinned)

  return { ...query, pinned, regular, all: filtered }
}

/* ------------------------------------------------------------------ */
/*  Unread update count                                                */
/* ------------------------------------------------------------------ */

export function useUnreadUpdateCount() {
  const { user, profile, collectiveRoles } = useAuth()

  const collectiveIds = collectiveRoles.map((m) => m.collective_id)
  const highestCollectiveRole = collectiveRoles.length > 0
    ? collectiveRoles.reduce((best, m) => {
        const rank: Record<string, number> = { member: 0, assist_leader: 1, co_leader: 2, leader: 3 }
        return (rank[m.role] ?? 0) > (rank[best.role] ?? 0) ? m : best
      }, collectiveRoles[0]).role
    : null

  return useQuery({
    queryKey: ['updates-unread', user?.id],
    queryFn: async () => {
      if (!user) return 0

      // Fetch all announcement IDs (lightweight - id + audience fields only)
      const { data: announcements } = await supabase
        .from('updates')
        .select('id, target_audience, target_collective_id')

      if (!announcements || announcements.length === 0) return 0

      // Apply audience filtering
      const effectiveRole = profile?.role ?? highestCollectiveRole
      const isLeaderRole = ['leader', 'co_leader', 'assist_leader'].includes(effectiveRole ?? '')
      const isStaffOrAdmin = ['leader', 'national_leader', 'manager', 'admin'].includes(effectiveRole ?? '')

      const visibleIds = new Set(
        announcements
          .filter((a) => {
            if (isStaffOrAdmin) return true
            switch (a.target_audience) {
              case 'all': return true
              case 'leaders': return isLeaderRole
              case 'collective_specific':
                return a.target_collective_id ? collectiveIds.includes(a.target_collective_id) : true
              default: return true
            }
          })
          .map((a) => a.id),
      )

      // Fetch user's reads
      const { data: reads } = await supabase
        .from('update_reads')
        .select('update_id')
        .eq('user_id', user.id)

      const readIds = new Set((reads ?? []).map((r) => r.update_id))

      // Count visible announcements that haven't been read
      // Also ignore reads for deleted announcements (readId not in visibleIds)
      let unread = 0
      for (const id of visibleIds) {
        if (!readIds.has(id)) unread++
      }

      return unread
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Mark update as read                                                */
/* ------------------------------------------------------------------ */

/**
 * Bulk-mark every passed update_id as read for the current user.
 * Used when the user visits the /updates page so the side-sheet badge
 * clears immediately without needing them to tap each card.
 */
export function useMarkAllUpdatesRead() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (updateIds: string[]) => {
      if (!user || updateIds.length === 0) return
      const rows = updateIds.map((id) => ({ update_id: id, user_id: user.id }))
      const { error } = await supabase
        .from('update_reads')
        .upsert(rows, { onConflict: 'update_id,user_id' })
      if (error) throw error
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
      queryClient.invalidateQueries({ queryKey: ['updates-unread'] })
    },
  })
}

export function useMarkUpdateRead() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (updateId: string) => {
      if (!user) return

      const { error } = await supabase
        .from('update_reads')
        .upsert(
          { update_id: updateId, user_id: user.id },
          { onConflict: 'update_id,user_id' },
        )

      if (error) throw error
    },
    onMutate: async (updateId) => {
      await queryClient.cancelQueries({ queryKey: ['updates'] })
      await queryClient.cancelQueries({ queryKey: ['updates-unread'] })
      const previous = queryClient.getQueryData<UpdateWithAuthor[]>(['updates', user?.id])

      queryClient.setQueryData<UpdateWithAuthor[]>(['updates', user?.id], (old) => {
        if (!old) return old
        return old.map(a => a.id === updateId ? { ...a, is_read: true } : a)
      })

      // Optimistically decrement unread count
      queryClient.setQueryData<number>(['updates-unread', user?.id], (old) =>
        old != null && old > 0 ? old - 1 : 0,
      )

      return { previous }
    },
    onError: (_err, _, context) => {
      if (context?.previous) queryClient.setQueryData(['updates', user?.id], context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
      queryClient.invalidateQueries({ queryKey: ['updates-unread'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Create update (staff/admin)                                        */
/* ------------------------------------------------------------------ */

interface CreateUpdateParams {
  title: string
  content: string
  imageUrls?: string[]
  priority: Enums<'update_priority'>
  targetAudience: Enums<'update_target'>
  targetCollectiveId?: string
  isPinned?: boolean
}

export function useCreateUpdate() {
  const { user, profile } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: CreateUpdateParams) => {
      if (!user) throw new Error('Not authenticated')

      const urls = params.imageUrls ?? []
      const { data, error } = await supabase
        .from('updates')
        .insert({
          author_id: user.id,
          title: params.title,
          content: params.content,
          image_url: urls[0] ?? null,
          image_urls: urls,
          priority: params.priority,
          target_audience: params.targetAudience,
          target_collective_id: params.targetCollectiveId ?? null,
          is_pinned: params.isPinned ?? false,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: ['updates'] })
      const previous = queryClient.getQueryData<UpdateWithAuthor[]>(['updates', user?.id])

      const urls = params.imageUrls ?? []
      const optimistic: UpdateWithAuthor = {
        id: `optimistic-${Date.now()}`,
        author_id: user!.id,
        title: params.title,
        content: params.content,
        image_url: urls[0] ?? null,
        image_urls: urls,
        priority: params.priority,
        target_audience: params.targetAudience,
        target_collective_id: params.targetCollectiveId ?? null,
        is_pinned: params.isPinned ?? false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        author: { id: user!.id, display_name: profile?.display_name ?? null, avatar_url: profile?.avatar_url ?? null, role: profile?.role ?? null },
        is_read: true,
      } as UpdateWithAuthor

      // Insert optimistic entry respecting pinned sort order
      queryClient.setQueryData<UpdateWithAuthor[]>(['updates', user?.id], (old) => {
        if (!old) return [optimistic]
        if (optimistic.is_pinned) {
          // Prepend to the list (pinned items come first)
          return [optimistic, ...old]
        }
        // Insert after all pinned items
        const firstNonPinnedIdx = old.findIndex((a) => !a.is_pinned)
        if (firstNonPinnedIdx === -1) return [...old, optimistic]
        return [
          ...old.slice(0, firstNonPinnedIdx),
          optimistic,
          ...old.slice(firstNonPinnedIdx),
        ]
      })
      return { previous }
    },
    onError: (_err, _, context) => {
      if (context?.previous) queryClient.setQueryData(['updates', user?.id], context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
      queryClient.invalidateQueries({ queryKey: ['updates-unread'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'latest-update'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'recent-updates'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Admin: list all updates (no audience filter, includes collective)  */
/* ------------------------------------------------------------------ */

export interface AdminUpdate extends Update {
  author: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'role'> | null
  collective: { id: string; name: string } | null
  read_count: number
}

export function useAdminUpdates() {
  return useQuery({
    queryKey: ['admin-updates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('updates')
        .select(`
          *,
          author:profiles!updates_author_id_fkey(id, display_name, avatar_url, role),
          collective:collectives!updates_target_collective_id_fkey(id, name)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Fetch read counts scoped to the updates we actually fetched
      const updateIds = (data ?? []).map((u) => u.id)
      const readCounts: { update_id: string }[] = []
      if (updateIds.length > 0) {
        const { data: reads } = await supabase
          .from('update_reads')
          .select('update_id')
          .in('update_id', updateIds)
        if (reads) readCounts.push(...reads)
      }

      const countMap = new Map<string, number>()
      for (const r of readCounts) {
        countMap.set(r.update_id, (countMap.get(r.update_id) ?? 0) + 1)
      }

      return (data ?? []).map((u) => ({
        ...u,
        read_count: countMap.get(u.id) ?? 0,
      })) as AdminUpdate[]
    },
    staleTime: 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Update an existing update (admin)                                  */
/* ------------------------------------------------------------------ */

interface UpdateUpdateParams {
  id: string
  title?: string
  content?: string
  imageUrls?: string[]
  priority?: Enums<'update_priority'>
  targetAudience?: Enums<'update_target'>
  targetCollectiveId?: string | null
  isPinned?: boolean
}

export function useUpdateUpdate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: UpdateUpdateParams) => {
      const { id, ...rest } = params
      const payload: Record<string, unknown> = {}
      if (rest.title !== undefined) payload.title = rest.title
      if (rest.content !== undefined) payload.content = rest.content
      if (rest.imageUrls !== undefined) {
        payload.image_urls = rest.imageUrls
        payload.image_url = rest.imageUrls[0] ?? null
      }
      if (rest.priority !== undefined) payload.priority = rest.priority
      if (rest.targetAudience !== undefined) payload.target_audience = rest.targetAudience
      if (rest.targetCollectiveId !== undefined) payload.target_collective_id = rest.targetCollectiveId
      if (rest.isPinned !== undefined) payload.is_pinned = rest.isPinned
      payload.updated_at = new Date().toISOString()

      const { data, error } = await supabase
        .from('updates')
        .update(payload)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
      queryClient.invalidateQueries({ queryKey: ['admin-updates'] })
      queryClient.invalidateQueries({ queryKey: ['updates-unread'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'latest-update'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'recent-updates'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Delete an update (admin)                                           */
/* ------------------------------------------------------------------ */

export function useDeleteUpdate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      // Delete read records first (FK constraint)
      const { error: readError } = await supabase.from('update_reads').delete().eq('update_id', id)
      if (readError) throw readError

      const { error } = await supabase
        .from('updates')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['admin-updates'] })
      const previous = queryClient.getQueryData<AdminUpdate[]>(['admin-updates'])
      queryClient.setQueryData<AdminUpdate[]>(['admin-updates'], (old) =>
        old ? old.filter((u) => u.id !== id) : old,
      )
      return { previous }
    },
    onError: (_err, _, context) => {
      if (context?.previous) queryClient.setQueryData(['admin-updates'], context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['updates'] })
      queryClient.invalidateQueries({ queryKey: ['admin-updates'] })
      queryClient.invalidateQueries({ queryKey: ['updates-unread'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'latest-update'] })
      queryClient.invalidateQueries({ queryKey: ['home', 'recent-updates'] })
    },
  })
}
