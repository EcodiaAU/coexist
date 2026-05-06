import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import type {
  Database,
  Tables,
} from '@/types/database.types'

type ActivityType = Database['public']['Enums']['activity_type']

type Event = Tables<'events'>
type Collective = Tables<'collectives'>
type Update = Tables<'updates'>
type Challenge = Tables<'challenges'>
type Profile = Tables<'profiles'>

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ImpactStats {
  events_attended: number
  trees_planted: number
  hours_volunteered: number
  rubbish_kg: number
  area_restored_sqm: number
  native_plants: number
  wildlife_sightings: number
  invasive_weeds_pulled: number
  coastline_cleaned_m: number
}

export interface CollectiveWithNextEvent extends Collective {
  next_event: Event | null
  events_this_month: number
}

export interface ActiveChallenge extends Challenge {
  user_progress: number
  total_progress: number
}

interface EventWithCollective extends Event {
  collectives: Pick<Collective, 'id' | 'name'> | null
}

export interface MyUpcomingEvent extends Event {
  collectives: Pick<Collective, 'id' | 'name'> | null
  registration_status: string
}

/* ------------------------------------------------------------------ */
/*  Greeting                                                           */
/* ------------------------------------------------------------------ */

export function getGreeting(firstName: string | undefined): string {
  const hour = new Date().getHours()
  const name = firstName ?? 'there'

  if (hour < 12) return `Good morning, ${name}`
  if (hour < 17) return `Good afternoon, ${name}`
  if (hour < 21) return `Good evening, ${name}`
  return `Good night, ${name}`
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

/** Pinned or urgent updates */
export function useLatestUpdate() {
  return useQuery({
    queryKey: ['home', 'latest-update'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('updates')
        .select('id, title, body, priority, is_pinned, created_at, cover_image_url, cta_label, cta_url')
        .or('is_pinned.eq.true,priority.eq.urgent')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as Update | null
    },
    staleTime: 2 * 60 * 1000,
  })
}

/** Featured events for hero carousel */
export function useFeaturedEvents() {
  return useQuery({
    queryKey: ['home', 'featured-events'],
    queryFn: async () => {
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('events')
        .select('*, collectives(id, name)')
        .eq('status', 'published')
        .eq('is_public', true)
        .or(`date_start.gte.${now},date_end.gte.${now}`)
        .order('date_start', { ascending: true })
        .limit(5)
      if (error) throw error
      return (data ?? []) as EventWithCollective[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

/** Upcoming events near user (all if no location) */
export function useUpcomingNearby() {
  return useQuery({
    queryKey: ['home', 'upcoming-nearby'],
    queryFn: async () => {
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('events')
        .select('*, collectives(id, name)')
        .eq('status', 'published')
        .or(`date_start.gte.${now},date_end.gte.${now}`)
        .order('date_start', { ascending: true })
        .limit(10)
      if (error) throw error
      return (data ?? []) as EventWithCollective[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * National events - org-wide retreats, campouts, cross-collective activities.
 * Suggested to users whose collective is within 500km of the event.
 */
export function useNationalEvents(userLocation?: { lat: number; lng: number } | null) {
  return useQuery({
    queryKey: ['home', 'national-events', userLocation?.lat, userLocation?.lng],
    queryFn: async () => {
      const now = new Date().toISOString()

      // If user has a location, use PostGIS distance filter (500km)
      if (userLocation?.lat && userLocation?.lng) {
        const { data, error } = await supabase.rpc('get_events_within_radius', {
          p_lat: userLocation.lat,
          p_lng: userLocation.lng,
          p_radius_km: 500,
          p_limit: 10,
        })
        if (error) throw error
        // Filter to only national collective events from the RPC results
        if (!data?.length) return [] as EventWithCollective[]
        const eventIds = (data as Event[]).map((e) => e.id)
        const { data: withCollectives } = await supabase
          .from('events')
          .select('*, collectives!inner(id, name, is_national)')
          .in('id', eventIds)
          .eq('collectives.is_national', true)
        return (withCollectives ?? []) as EventWithCollective[]
      }

      // No location - show all upcoming national events
      const { data, error } = await supabase
        .from('events')
        .select('*, collectives!inner(id, name, is_national)')
        .eq('status', 'published')
        .eq('collectives.is_national', true)
        .or(`date_start.gte.${now},date_end.gte.${now}`)
        .order('date_start', { ascending: true })
        .limit(10)
      if (error) throw error
      return (data ?? []) as EventWithCollective[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

/** User's primary collective with next event + stats */
export function useMyCollective() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['home', 'my-collective', user?.id],
    queryFn: async () => {
      if (!user) return null

      // Get user's collective membership
      const { data: membership, error: membershipError } = await supabase
        .from('collective_members')
        .select('collective_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      if (membershipError) throw membershipError

      if (!membership) return null

      // Fetch collective
      const { data: collective, error } = await supabase
        .from('collectives')
        .select('id, name, slug, cover_image_url, region, member_count, is_active, description')
        .eq('id', membership.collective_id)
        .single()
      if (error) throw error

      // Next event (include currently-happening events)
      const nowStr = new Date().toISOString()
      const { data: nextEvent, error: nextEventError } = await supabase
        .from('events')
        .select('id, title, date_start, date_end, address, cover_image_url, cover_image_position_x, cover_image_position_y, collective_id, status')
        .eq('collective_id', collective.id)
        .eq('status', 'published')
        .or(`date_start.gte.${nowStr},date_end.gte.${nowStr}`)
        .order('date_start', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (nextEventError) throw nextEventError

      // Events this month
      const monthStart = new Date()
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)
      const { count, error: countError } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('collective_id', collective.id)
        .gte('date_start', monthStart.toISOString())
      if (countError) throw countError

      return {
        ...collective,
        next_event: nextEvent ?? null,
        events_this_month: count ?? 0,
      } as CollectiveWithNextEvent
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  })
}

/** All collectives the user belongs to (for impact scope dropdown) */
export interface MyCollectiveSummary {
  id: string
  name: string
}

export function useMyCollectives() {
  const { user, isStaff } = useAuth()

  return useQuery({
    queryKey: ['home', 'my-collectives', user?.id, isStaff],
    queryFn: async (): Promise<MyCollectiveSummary[]> => {
      if (!user) return []

      // Staff/manager/admin can scope by any collective
      if (isStaff) {
        const { data, error } = await supabase
          .from('collectives')
          .select('id, name')
          .eq('is_active', true)
          .order('name')
        if (error) throw error
        return (data ?? []).map((c) => ({ id: c.id, name: c.name }))
      }

      const { data, error } = await supabase
        .from('collective_members')
        .select('collective_id, collectives(id, name)')
        .eq('user_id', user.id)
        .eq('status', 'active')
      if (error) throw error
      return (data ?? [])
        .map((m) => {
          const c = m.collectives as { id: string; name: string } | null
          return c ? { id: c.id, name: c.name } : null
        })
        .filter((c): c is MyCollectiveSummary => c !== null)
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  })
}

/** Impact stats from RPC */
export function useImpactStats() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['home', 'impact-stats', user?.id],
    queryFn: async () => {
      if (!user) return null
      // RPC uses COALESCE(SUM(...), 0) so unmeasured metrics aggregate to 0,
      // which is the correct semantic for dashboard totals (vs null in raw rows).
      const { data, error } = await supabase.rpc('get_user_impact_stats', {
        p_user_id: user.id,
      })
      if (error) throw error
      return (data ?? {
        events_attended: 0,
        trees_planted: 0,
        hours_volunteered: 0,
        rubbish_kg: 0,
        area_restored_sqm: 0,
        native_plants: 0,
        wildlife_sightings: 0,
        invasive_weeds_pulled: 0,
        coastline_cleaned_m: 0,
      }) as unknown as ImpactStats
    },
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
  })
}

/** Active national challenge */
export function useActiveChallenge() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['home', 'active-challenge', user?.id],
    queryFn: async () => {
      const { data: challenge, error } = await supabase
        .from('challenges')
        .select('id, title, description, goal_type, goal_value, start_date, end_date, is_active, cover_image_url, status')
        .eq('is_active', true)
        .lte('start_date', new Date().toISOString())
        .gte('end_date', new Date().toISOString())
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (!challenge) return null

      // Get aggregated progress
      const { data: participants } = await supabase
        .from('challenge_participants')
        .select('progress')
        .eq('challenge_id', challenge.id)

      const totalProgress = (participants ?? []).reduce(
        (sum, p) => sum + (p.progress ?? 0),
        0,
      )

      // User's individual progress
      let userProgress = 0
      if (user) {
        const { data: myParticipation } = await supabase
          .from('challenge_participants')
          .select('progress')
          .eq('challenge_id', challenge.id)
          .eq('user_id', user.id)
          .maybeSingle()
        userProgress = myParticipation?.progress ?? 0
      }

      return {
        ...challenge,
        user_progress: userProgress,
        total_progress: totalProgress,
      } as ActiveChallenge
    },
    staleTime: 5 * 60 * 1000,
  })
}

/** Trending collectives (for users not in one) */
export function useTrendingCollectives() {
  return useQuery({
    queryKey: ['home', 'trending-collectives'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collectives')
        .select('id, name, slug, cover_image_url, region, member_count, description')
        .eq('is_active', true)
        .or('is_national.is.null,is_national.eq.false')
        .order('member_count', { ascending: false })
        .limit(8)
      if (error) throw error
      return (data ?? []) as Collective[]
    },
    staleTime: 10 * 60 * 1000,
  })
}

/** Events the user has registered for, coming up soon */
export function useMyUpcomingEvents() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['home', 'my-upcoming-events', user?.id],
    queryFn: async () => {
      if (!user) return []

      const now = new Date().toISOString()

      const { data, error } = await supabase
        .from('event_registrations')
        .select('status, events!inner(*, collectives(id, name))')
        .eq('user_id', user.id)
        .in('status', ['registered', 'waitlisted'])
        .or(`date_start.gte.${now},date_end.gte.${now}`, { referencedTable: 'events' })
        .order('date_start', { referencedTable: 'events', ascending: true })
        .limit(5)

      if (error) throw error

      const nowMs = Date.now()
      return (data ?? [])
        .filter((r) => r.events !== null)
        .map((r) => ({
          ...(r.events as EventWithCollective),
          registration_status: r.status,
        }))
        .sort((a, b) => {
          // Happening-now events always come first
          const aStart = new Date(a.date_start).getTime()
          const aEnd = a.date_end ? new Date(a.date_end).getTime() : aStart + 4 * 60 * 60 * 1000
          const bStart = new Date(b.date_start).getTime()
          const bEnd = b.date_end ? new Date(b.date_end).getTime() : bStart + 4 * 60 * 60 * 1000
          const aHappening = nowMs >= aStart && nowMs <= aEnd
          const bHappening = nowMs >= bStart && nowMs <= bEnd
          if (aHappening !== bHappening) return aHappening ? -1 : 1
          return aStart - bStart
        }) as MyUpcomingEvent[]
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  })
}

/** Upcoming events from all of the user's collectives (for home carousel) */
export function useCollectiveUpcomingEvents() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['home', 'collective-upcoming-events', user?.id],
    queryFn: async () => {
      if (!user) return []

      // Get all collective memberships
      const { data: memberships } = await supabase
        .from('collective_members')
        .select('collective_id')
        .eq('user_id', user.id)
        .eq('status', 'active')

      const collectiveIds = (memberships ?? []).map((m) => m.collective_id)
      if (collectiveIds.length === 0) return []

      const nowIso = new Date().toISOString()
      const { data, error } = await supabase
        .from('events')
        .select('*, collectives(id, name)')
        .in('collective_id', collectiveIds)
        .eq('status', 'published')
        .or(`date_start.gte.${nowIso},date_end.gte.${nowIso}`)
        .order('date_start', { ascending: true })
        .limit(10)

      if (error) throw error
      return (data ?? []) as EventWithCollective[]
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  })
}

/** Recent updates for the home updates section */
export function useRecentUpdates() {
  return useQuery({
    queryKey: ['home', 'recent-updates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('updates')
        .select(`
          *,
          author:profiles!updates_author_id_fkey(id, display_name, avatar_url, role)
        `)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error
      return (data ?? []) as (Update & {
        author: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'role'> | null
      })[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

/** Activity type labels for chips */
export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  shore_cleanup: 'Shore Cleanup',
  clean_up: 'Clean Up',
  tree_planting: 'Tree Planting',
  land_regeneration: 'Land Regeneration',
  ecosystem_restoration: 'Ecosystem Restoration',
  marine_restoration: 'Marine Restoration',
  nature_walk: 'Nature Walk',
  nature_hike: 'Nature Hike',
  camp_out: 'Camp Out',
  retreat: 'Retreat',
  spotlighting: 'Spotlighting',
  workshop: 'Workshop',
  film_screening: 'Film Screening',
  other: 'Other',
}
