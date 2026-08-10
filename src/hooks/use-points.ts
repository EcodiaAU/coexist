import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'

export type LeaderboardPeriod = 'all_time' | 'month' | 'year'

/* ------------------------------------------------------------------ */
/*  Points total                                                       */
/* ------------------------------------------------------------------ */

/**
 * The user's lifetime points total. Points are credited server-side by
 * award_points into points_ledger (donations / merch / tickets / check-ins /
 * badges); get_user_points_total is a SECURITY DEFINER aggregate that sums the
 * whole ledger server-side, so it is not capped at PostgREST's 1000-row limit
 * and cannot leak another user's total (self-scoped, admins excepted).
 */
export function usePoints(userId?: string) {
  const { user } = useAuth()
  const id = userId ?? user?.id
  return useQuery({
    queryKey: ['points-total', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        'get_user_points_total',
        userId ? { p_user_id: userId } : {},
      )
      if (error) throw error
      return (data as number | null) ?? 0
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Member leaderboard (within a collective)                           */
/* ------------------------------------------------------------------ */

export interface LeaderboardMember {
  user_id: string
  display_name: string | null
  avatar_url: string | null
  total_points: number
  events_attended: number
}

/** Members ranked by points within one collective (get_leaderboard RPC). */
export function useCollectiveMemberLeaderboard(
  collectiveId: string | undefined,
  period: LeaderboardPeriod = 'all_time',
) {
  return useQuery({
    queryKey: ['leaderboard', 'members', collectiveId, period],
    queryFn: async () => {
      if (!collectiveId) return []
      const { data, error } = await supabase.rpc('get_leaderboard', {
        p_collective_id: collectiveId,
        p_period: period,
      })
      if (error) throw error
      return (data ?? []) as LeaderboardMember[]
    },
    enabled: !!collectiveId,
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Collective leaderboard (collectives ranked nationally)             */
/* ------------------------------------------------------------------ */

export interface LeaderboardCollective {
  collective_id: string
  collective_name: string | null
  cover_image_url: string | null
  total_events: number
  total_trees: number
  total_rubbish_kg: number
  total_hours: number
}

/** Collectives ranked nationally by trees planted (get_collective_leaderboard). */
export function useNationalCollectiveLeaderboard(
  period: LeaderboardPeriod = 'all_time',
) {
  return useQuery({
    queryKey: ['leaderboard', 'collectives', period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_collective_leaderboard', {
        p_period: period,
      })
      if (error) throw error
      return (data ?? []) as LeaderboardCollective[]
    },
    staleTime: 5 * 60 * 1000,
  })
}
