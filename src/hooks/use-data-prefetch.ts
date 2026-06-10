import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { wallClockNow } from '@/lib/date-format'

// Leader prefetch functions
import {
  prefetchLeaderDashboard,
  prefetchCollectiveFullStats,
  prefetchEngagementScores,
  prefetchPendingItems,
} from '@/hooks/use-leader-dashboard'
import {
  prefetchLeaderCollectiveEvents,
  prefetchLeaderEventStats,
} from '@/hooks/use-leader-events'

// Admin prefetch functions
import { prefetchAdminOverview, prefetchTrendData } from '@/hooks/use-admin-dashboard'
import { prefetchAdminEventsData } from '@/hooks/use-admin-events'
import { prefetchCreateSummary } from '@/hooks/use-admin-create'

/* ------------------------------------------------------------------ */
/*  Role-based DATA prefetch                                           */
/*                                                                     */
/*  Warms TanStack Query cache for the user's most-used pages so       */
/*  navigating to them renders the final state instantly - no loading   */
/*  spinners, no skeleton shimmer.                                     */
/*                                                                     */
/*  This complements the chunk prefetch (useRolePrefetch) which        */
/*  downloads JS bundles. Together they mean both CODE and DATA are     */
/*  ready before the user taps.                                        */
/* ------------------------------------------------------------------ */

const STALE_TIME = 2 * 60 * 1000

/**
 * Prefetch data for all roles: updates, my-collectives, unread-counts,
 * products, and the user's upcoming events + discover feed.
 * Leaders get dashboard + events data. Staff get admin dashboard data.
 */
export function useDataPrefetch() {
  const queryClient = useQueryClient()
  const { user, profile, collectiveRoles, isStaff } = useAuth()
  const didPrefetch = useRef(false)

  const isLeader = collectiveRoles.some((m) =>
    ['leader', 'co_leader', 'assist_leader'].includes(m.role),
  )

  useEffect(() => {
    if (!user || !profile || didPrefetch.current) return
    didPrefetch.current = true

    const userId = user.id

    // ── Common queries (all roles) ──

    // /updates page data
    queryClient.prefetchQuery({
      queryKey: ['updates', userId],
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

        const { data: reads } = await supabase
          .from('update_reads')
          .select('update_id')
          .eq('user_id', userId)
        const readIds = new Set((reads ?? []).map((r) => r.update_id))

        return (data ?? []).map((a) => ({
          ...a,
          is_read: readIds.has(a.id),
        }))
      },
      staleTime: STALE_TIME,
    })

    // /chat page - my collectives list
    queryClient.prefetchQuery({
      queryKey: ['my-collectives', userId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('collective_members')
          .select('collective_id, role, joined_at, collectives(id, name, slug, cover_image_url, region, state, member_count)')
          .eq('user_id', userId)
          .eq('status', 'active')
        if (error) throw error
        return data
      },
      staleTime: 5 * 60 * 1000,
    })

    // /chat page - unread counts (batched in chunks of 5 to limit burst)
    queryClient.prefetchQuery({
      queryKey: ['unread-counts', userId],
      queryFn: async () => {
        const { data: memberships } = await supabase
          .from('collective_members')
          .select('collective_id')
          .eq('user_id', userId)
          .eq('status', 'active')
        if (!memberships?.length) return {}

        const { data: receipts } = await supabase
          .from('chat_read_receipts')
          .select('collective_id, last_read_at')
          .eq('user_id', userId)
        const receiptMap = new Map(receipts?.map((r) => [r.collective_id, r.last_read_at]) ?? [])
        const counts: Record<string, number> = {}

        const BATCH_SIZE = 5
        for (let i = 0; i < memberships.length; i += BATCH_SIZE) {
          const batch = memberships.slice(i, i + BATCH_SIZE)
          const results = await Promise.all(
            batch.map(async (m) => {
              const lastRead = receiptMap.get(m.collective_id)
              let query = supabase
                .from('chat_messages')
                .select('id', { count: 'exact', head: true })
                .eq('collective_id', m.collective_id)
                .eq('is_deleted', false)
                .neq('user_id', userId)
              if (lastRead) query = query.gt('created_at', lastRead)
              const { count } = await query
              return { collective_id: m.collective_id, count }
            }),
          )
          for (const r of results) {
            if (r.count && r.count > 0) counts[r.collective_id] = r.count
          }
        }
        return counts
      },
      staleTime: 5 * 60 * 1000,
    })

    // ── Participant-specific ──

    if (!isStaff && !isLeader) {
      // /events page - upcoming registrations
      queryClient.prefetchQuery({
        queryKey: ['my-events', 'upcoming', userId],
        queryFn: async () => {
          // Floating-local: compare against viewer wall-clock-now.
          const now = wallClockNow().getTime()
          const { data, error } = await supabase
            .from('event_registrations')
            .select('*, events(*, collectives(id, name))')
            .eq('user_id', userId)
            .in('status', ['registered', 'waitlisted'])
            .order('registered_at', { ascending: true })
          if (error) throw error
          return (data ?? [])
            .filter((r) => {
              if (!r.events) return false
              const evt = r.events as { date_start: string; date_end: string | null }
              const endMs = new Date(evt.date_end ?? evt.date_start).getTime()
              const startMs = new Date(evt.date_start).getTime()
              return startMs >= now || endMs >= now
            })
            .map((r) => ({ ...(r.events as Record<string, unknown>), registration_status: r.status }))
        },
        staleTime: STALE_TIME,
      })

      // /events page - discover feed
      queryClient.prefetchQuery({
        queryKey: ['discover-events', undefined, undefined],
        queryFn: async () => {
          const now = wallClockNow().toISOString()
          const { data, error } = await supabase
            .from('events')
            .select('*, collectives(id, name)')
            .eq('status', 'published')
            .or(`date_start.gte.${now},date_end.gte.${now}`)
            .order('date_start', { ascending: true })
            .limit(50)
          if (error) throw error
          return data ?? []
        },
        staleTime: 5 * 60 * 1000,
      })

      // /shop page - products
      queryClient.prefetchQuery({
        queryKey: ['products'],
        queryFn: async () => {
          const { data, error } = await supabase
            .from('merch_products')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
          if (error) throw error
          return data
        },
        staleTime: 5 * 60 * 1000,
      })
    }

    // ── Leader-specific ──

    if (isLeader) {
      const leaderMembership = collectiveRoles.find((m) =>
        ['leader', 'co_leader', 'assist_leader'].includes(m.role),
      )
      const collectiveId = leaderMembership?.collective_id

      if (collectiveId) {
        // /leader - dashboard overview, stats, engagement, pending items
        prefetchLeaderDashboard(queryClient, collectiveId)
        prefetchCollectiveFullStats(queryClient, collectiveId)
        prefetchEngagementScores(queryClient, collectiveId)
        prefetchPendingItems(queryClient, collectiveId)

        // /leader/events - events list + stats
        prefetchLeaderCollectiveEvents(queryClient, collectiveId)
        prefetchLeaderEventStats(queryClient, collectiveId)
      }

      // /leader/tasks - task instances
      const staffCollectiveIds = collectiveRoles
        .filter((m) => ['leader', 'co_leader', 'assist_leader'].includes(m.role))
        .map((m) => m.collective_id)

      if (staffCollectiveIds.length > 0) {
        queryClient.prefetchQuery({
          queryKey: ['my-tasks', userId, staffCollectiveIds],
          queryFn: async () => {
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
              .order('due_date', { ascending: true })
            if (error) throw error
            return data ?? []
          },
          staleTime: STALE_TIME,
        })
      }
    }

    // ── Staff/admin-specific ──

    if (isStaff) {
      // /admin - overview (default "all" range) + trends
      prefetchAdminOverview(queryClient)
      prefetchTrendData(queryClient)

      // /admin/events - full events dashboard
      prefetchAdminEventsData(queryClient)

      // /admin/create - summary stats
      prefetchCreateSummary(queryClient)

      // /admin/collectives - uses useAdminCollectives from shared hook
      // (already in hooks/use-admin-collectives.ts, fetched on mount)
    }
  }, [user, profile, collectiveRoles, isStaff, isLeader, queryClient])
}
