import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import type { DevModule, DevSection } from '@/hooks/use-admin-development'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MemberProgress {
  user_id: string
  display_name: string
  avatar_url: string | null
  modules_completed: number
  modules_total: number
  avg_quiz_score: number | null
  last_activity: string | null
}

/* ------------------------------------------------------------------ */
/*  Query keys                                                         */
/* ------------------------------------------------------------------ */

const keys = {
  myContent: (userId: string) => ['dev-my-content', userId] as const,
  collectiveProgress: (collectiveId: string) => ['dev-collective-progress', collectiveId] as const,
}

/* ------------------------------------------------------------------ */
/*  My content - modules/sections targeted at my roles                 */
/* ------------------------------------------------------------------ */

export function useMyTargetedContent() {
  const { user, role, collectiveRoles } = useAuth()

  // Compute user's effective roles for targeting
  // Collective roles: leader, co_leader, assist_leader, member
  // Global roles mapped: national_leader, manager, admin → 'national_leader'
  const effectiveRoles = useMemo(() => {
    const roles = new Set<string>()
    for (const cm of collectiveRoles) {
      roles.add(cm.role)
    }
    // Any staff-level global role counts as 'leader' for dev content targeting
    if (role === 'leader' || role === 'manager' || role === 'admin') {
      roles.add('leader')
      roles.add('national_leader') // legacy compat for existing dev content
    }
    return Array.from(roles)
  }, [collectiveRoles, role])

  return useQuery({
    // Include roles in the key so the query re-runs when roles load
    queryKey: ['dev-my-content', user?.id ?? '', effectiveRoles],
    queryFn: async () => {
      const uid = user?.id ?? ''
      const roleSet = new Set(effectiveRoles)

      // Get all published modules
      const { data: modules, error: modErr } = await supabase
        .from('dev_modules')
        .select('*')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
      if (modErr) throw modErr

      // Get all published sections
      const { data: sections, error: secErr } = await supabase
        .from('dev_sections')
        .select('*')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
      if (secErr) throw secErr

      // Show content where:
      // - target_roles overlaps with user's effective roles, OR
      // - target_user_ids includes user's ID, OR
      // - no targeting set (empty arrays = visible to all)
      const filteredModules = (modules as DevModule[]).filter((m) => {
        if (m.target_roles.length === 0 && m.target_user_ids.length === 0) return true
        if (m.target_user_ids.includes(uid)) return true
        return m.target_roles.some((r) => roleSet.has(r))
      })

      const filteredSections = (sections as DevSection[]).filter((s) => {
        if (s.target_roles.length === 0 && s.target_user_ids.length === 0) return true
        if (s.target_user_ids.includes(uid)) return true
        return s.target_roles.some((r) => roleSet.has(r))
      })

      return { modules: filteredModules, sections: filteredSections }
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Collective member progress (admin/leader dashboard)                */
/* ------------------------------------------------------------------ */

export function useCollectiveProgress(collectiveId: string | undefined) {
  return useQuery({
    queryKey: keys.collectiveProgress(collectiveId!),
    queryFn: async () => {
      const { data: members, error: membersError } = await supabase
        .from('collective_members')
        .select('user_id, profile:profiles(display_name, avatar_url)')
        .eq('collective_id', collectiveId!)
        .eq('status', 'active')
      if (membersError) throw membersError

      const memberIds = (members as Record<string, unknown>[]).map((m) => m.user_id as string)
      if (memberIds.length === 0) return []

      const [progressRes, attemptsRes] = await Promise.all([
        supabase
          .from('dev_user_module_progress')
          .select('*')
          .in('user_id', memberIds),
        supabase
          .from('dev_quiz_attempts')
          .select('*')
          .in('user_id', memberIds),
      ])

      const progress = (progressRes.data ?? []) as Record<string, unknown>[]
      const attempts = (attemptsRes.data ?? []) as Record<string, unknown>[]

      return (members as Record<string, unknown>[]).map((m): MemberProgress => {
        const memberProgress = progress.filter((p) => p.user_id === m.user_id)
        const memberAttempts = attempts.filter((a) => a.user_id === m.user_id)
        const profile = m.profile as { display_name: string; avatar_url: string | null } | null

        return {
          user_id: m.user_id as string,
          display_name: profile?.display_name ?? 'Unknown',
          avatar_url: profile?.avatar_url ?? null,
          modules_completed: memberProgress.filter((p) => p.status === 'completed').length,
          modules_total: memberProgress.length,
          avg_quiz_score:
            memberAttempts.length > 0
              ? Math.round(memberAttempts.reduce((sum: number, a) => sum + (a.score_pct as number), 0) / memberAttempts.length)
              : null,
          last_activity:
            memberProgress.length > 0
              ? memberProgress.sort((a, b) => (b.updated_at as string).localeCompare(a.updated_at as string))[0].updated_at as string
              : null,
        }
      })
    },
    enabled: !!collectiveId,
    staleTime: 60 * 1000,
  })
}
