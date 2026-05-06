import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { useOffline } from '@/hooks/use-offline'
import { useToast } from '@/components/toast'
import { queueOfflineAction } from '@/lib/offline-sync'
import { sumMetric } from '@/lib/impact-metrics'
import { fetchImpactRows } from '@/lib/impact-query'
import type { Database } from '@/types/database.types'

type ProfileUpdate = Database['public']['Tables']['profiles']['Update']
type ProfileBaseRow = Database['public']['Tables']['profiles']['Row']

/**
 * Tier-aware profile shape returned by useProfile().
 *
 * - Own profile: full ProfileBaseRow + visibility flags forced to true.
 * - Viewing another user: payload from get_user_profile_v1 RPC. Sensitive
 *   fields are NULL for non-staff viewers; viewer_can_see_sensitive=false
 *   tells the UI to render [redacted] placeholders.
 *
 * Security boundary: supabase/migrations/079_profile_visibility_tiering.sql
 */
export type ProfileRow = ProfileBaseRow & {
  viewer_can_see_sensitive?: boolean
  is_self?: boolean
}

export function useProfile(userId?: string) {
  const { user } = useAuth()
  const id = userId ?? user?.id
  const isOwnProfile = !!id && id === user?.id

  return useQuery({
    queryKey: ['profile', id, isOwnProfile ? 'own' : 'view'],
    queryFn: async () => {
      if (!id) throw new Error('No user ID')

      // Own profile: read the full row directly. The user is always allowed
      // to see all of their own fields (edit-profile uses this same row).
      if (isOwnProfile) {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', id)
          .single()
        if (error) throw error
        return {
          ...data,
          // Mark own-profile reads as fully-visible so consumers that
          // branch on viewer_can_see_sensitive (ProfileModal etc) treat
          // the user's own data as visible.
          viewer_can_see_sensitive: true,
          is_self: true,
        }
      }

      // Viewing another user: route through the role-tiered RPC. Non-staff
      // viewers receive null for sensitive fields; staff see everything.
      // Security boundary lives in get_user_profile_v1 (migration 079).
      // Cast: this RPC is added in migration 079 and not yet present in
      // generated database.types.ts; safe to cast since the SQL function
      // is the canonical signature.
      const rpc = supabase.rpc as unknown as (
        fn: 'get_user_profile_v1',
        args: { target_user_id: string },
      ) => Promise<{ data: ProfileRow | null; error: unknown }>
      const { data, error } = await rpc('get_user_profile_v1', { target_user_id: id })
      if (error) throw error as Error
      return data
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  })
}

export function useProfileCollectives(userId?: string) {
  const { user } = useAuth()
  const id = userId ?? user?.id

  return useQuery({
    queryKey: ['profile-collectives', id],
    queryFn: async () => {
      if (!id) throw new Error('No user ID')
      const { data, error } = await supabase
        .from('collective_members')
        .select('collective_id, role, collectives(id, name, slug, cover_image_url, region, member_count)')
        .eq('user_id', id)
        .eq('status', 'active')
      if (error) throw error
      return data
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  })
}

export function useProfileStats(userId?: string) {
  const { user } = useAuth()
  const id = userId ?? user?.id

  return useQuery({
    queryKey: ['profile-stats', id],
    queryFn: async () => {
      if (!id) throw new Error('No user ID')

      // Get events attended count + event IDs in a single query
      const [regRes, activityRes] = await Promise.all([
        supabase
          .from('event_registrations')
          .select('event_id', { count: 'exact' })
          .eq('user_id', id)
          .eq('status', 'attended'),
        // Fetch activity types of attended events for stat visibility heuristic
        supabase
          .from('event_registrations')
          .select('events(activity_type)')
          .eq('user_id', id)
          .eq('status', 'attended'),
      ])

      const { data: registrations, count: eventsAttended } = regRes
      const eventIds = registrations?.map((r) => r.event_id) ?? []

      // Count attended events by activity_type for display heuristic
      const activityTypeCounts = new Map<string, number>()
      for (const row of activityRes.data ?? []) {
        const at = (row.events as { activity_type: string } | null)?.activity_type
        if (at) activityTypeCounts.set(at, (activityTypeCounts.get(at) ?? 0) + 1)
      }

      let totalTreesPlanted = 0
      let totalHours = 0
      let totalRubbishKg = 0
      let totalAreaSqm = 0
      let totalNativePlants = 0
      let totalWildlifeSightings = 0
      let totalInvasiveWeedsPulled = 0
      let totalCoastlineM = 0

      if (eventIds.length > 0) {
        // User profile: include all rows for attended events regardless of date
        // (skipBaselineDateFilter=true - user impact is their personal record, not a national aggregate)
        const { rows: impactRows } = await fetchImpactRows({
          eventIds,
          includeLegacy: true,
          skipBaselineDateFilter: true,
        })

        totalTreesPlanted       = sumMetric(impactRows, 'trees_planted')
        totalHours              = sumMetric(impactRows, 'hours_total')
        totalRubbishKg          = sumMetric(impactRows, 'rubbish_kg')
        totalAreaSqm            = sumMetric(impactRows, 'area_restored_sqm')
        totalNativePlants       = sumMetric(impactRows, 'native_plants')
        totalWildlifeSightings  = sumMetric(impactRows, 'wildlife_sightings')
        totalInvasiveWeedsPulled = sumMetric(impactRows, 'invasive_weeds_pulled')
        totalCoastlineM         = sumMetric(impactRows, 'coastline_cleaned_m')
      }

      return {
        eventsAttended: eventsAttended ?? 0,
        treesPlanted: totalTreesPlanted,
        hoursVolunteered: totalHours,
        rubbishCollectedKg: totalRubbishKg,
        areaRestoredSqm: totalAreaSqm,
        nativePlants: totalNativePlants,
        wildlifeSightings: totalWildlifeSightings,
        invasiveWeedsPulled: totalInvasiveWeedsPulled,
        coastlineCleanedM: Math.round(totalCoastlineM),
        /** Activity types attended - used to decide which stats to show even when 0 */
        activityTypeCounts: Object.fromEntries(activityTypeCounts) as Record<string, number>,
      }
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  })
}

export function useMutualConnections(targetUserId: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['mutual-connections', user?.id, targetUserId],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated')

      // Fetch all 4 queries in parallel
      const [myCollRes, theirCollRes, myEvtRes, theirEvtRes] = await Promise.all([
        supabase.from('collective_members').select('collective_id').eq('user_id', user.id).eq('status', 'active'),
        supabase.from('collective_members').select('collective_id, collectives(name)').eq('user_id', targetUserId).eq('status', 'active'),
        supabase.from('event_registrations').select('event_id').eq('user_id', user.id).eq('status', 'attended'),
        supabase.from('event_registrations').select('event_id').eq('user_id', targetUserId).eq('status', 'attended'),
      ])

      if (myCollRes.error) throw myCollRes.error
      if (theirCollRes.error) throw theirCollRes.error
      if (myEvtRes.error) throw myEvtRes.error
      if (theirEvtRes.error) throw theirEvtRes.error

      const myIds = new Set(myCollRes.data?.map((c) => c.collective_id) ?? [])
      const sharedCollectives = theirCollRes.data?.filter((c) => myIds.has(c.collective_id)) ?? []

      const myEventIds = new Set(myEvtRes.data?.map((e) => e.event_id) ?? [])
      const sharedEventCount = theirEvtRes.data?.filter((e) => myEventIds.has(e.event_id)).length ?? 0

      return {
        sharedCollectives: sharedCollectives.map((c) => ({
          id: c.collective_id,
          name: (c.collectives as { name: string } | null)?.name ?? '',
        })),
        sharedEventCount,
      }
    },
    enabled: !!user && !!targetUserId && user.id !== targetUserId,
    staleTime: 10 * 60 * 1000,
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  const { user, refreshProfile } = useAuth()
  const { isOffline } = useOffline()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (updates: ProfileUpdate) => {
      if (!user) throw new Error('Not authenticated')

      if (isOffline) {
        queueOfflineAction('profile-update', { userId: user.id, updates })
        return
      }

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
      if (error) throw error
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ['profile', user?.id] })
      const previous = queryClient.getQueryData(['profile', user?.id])
      queryClient.setQueryData(['profile', user?.id], (old: Record<string, unknown> | undefined) => old ? { ...old, ...updates } : old)
      return { previous }
    },
    onError: (_err, _, context) => {
      if (!isOffline && context?.previous) queryClient.setQueryData(['profile', user?.id], context.previous)
    },
    onSuccess: () => {
      if (isOffline) toast.info('Profile update saved offline - will sync when back online')
    },
    onSettled: () => {
      if (isOffline) return
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] })
      refreshProfile()
    },
  })
}

export function useUploadAvatar() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error('Not authenticated')
      const ext = file.name.split('.').pop()
      const path = `${user.id}/avatar.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(path)

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id)
      if (updateError) throw updateError

      return publicUrl
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] })
    },
  })
}
