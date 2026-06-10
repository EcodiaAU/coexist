import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, escapeIlike } from '@/lib/supabase'
import type { Tables, Database } from '@/types/database.types'

type ActivityType = Database['public']['Enums']['activity_type']

type Event = Tables<'events'>
type Collective = Tables<'collectives'>
type Profile = Tables<'profiles'>

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SearchResults {
  events: EventSearchResult[]
  collectives: CollectiveSearchResult[]
  people: ProfileSearchResult[]
}

export type EventSearchResult = Pick<
  Event,
  'id' | 'title' | 'activity_type' | 'date_start' | 'address' | 'cover_image_url'
>

export type CollectiveSearchResult = Pick<
  Collective,
  'id' | 'name' | 'slug' | 'region' | 'state' | 'cover_image_url' | 'member_count'
>

export type ProfileSearchResult = Pick<
  Profile,
  'id' | 'display_name' | 'avatar_url'
>

export interface SearchFilters {
  activityTypes: ActivityType[]
  dateFrom: string | null
  dateTo: string | null
  distanceKm: number
  state: string | null
}

const STORAGE_KEY = 'coexist-recent-searches'
const MAX_RECENT = 8

/* ------------------------------------------------------------------ */
/*  Recent searches (persisted to localStorage)                        */
/* ------------------------------------------------------------------ */

function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function saveRecentSearches(searches: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(searches.slice(0, MAX_RECENT)))
}

/* ------------------------------------------------------------------ */
/*  Debounce hook                                                      */
/* ------------------------------------------------------------------ */

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

/* ------------------------------------------------------------------ */
/*  Main search hook                                                   */
/* ------------------------------------------------------------------ */

export function useSearch(filters?: SearchFilters) {
  const [query, setQuery] = useState('')
  const [recentSearches, setRecentSearches] = useState(loadRecentSearches)
  const debouncedQuery = useDebouncedValue(query.trim(), 300)
  const lastCommittedRef = useRef('')

  const commitSearch = useCallback((term: string) => {
    const trimmed = term.trim()
    if (!trimmed || trimmed === lastCommittedRef.current) return
    lastCommittedRef.current = trimmed

    setRecentSearches((prev) => {
      const next = [trimmed, ...prev.filter((s) => s !== trimmed)].slice(0, MAX_RECENT)
      saveRecentSearches(next)
      return next
    })
  }, [])

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([])
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  const removeRecentSearch = useCallback((term: string) => {
    setRecentSearches((prev) => {
      const next = prev.filter((s) => s !== term)
      saveRecentSearches(next)
      return next
    })
  }, [])

  const results = useQuery({
    queryKey: ['search', debouncedQuery, filters],
    queryFn: async (): Promise<SearchResults> => {
      if (!debouncedQuery) return { events: [], collectives: [], people: [] }

      const escaped = debouncedQuery.replace(/[%_\\]/g, '\\$&')
      const pattern = `%${escaped}%`

      // Build events query
      let eventsQuery = supabase
        .from('events')
        .select('id, title, activity_type, date_start, address, cover_image_url')
        .eq('status', 'published')
        .ilike('title', pattern)

      if (filters?.activityTypes?.length) {
        eventsQuery = eventsQuery.in('activity_type', filters.activityTypes)
      }
      if (filters?.dateFrom) {
        eventsQuery = eventsQuery.gte('date_start', filters.dateFrom)
      }
      if (filters?.dateTo) {
        eventsQuery = eventsQuery.lte('date_start', filters.dateTo)
      }
      if (filters?.state) {
        eventsQuery = eventsQuery.ilike('address', `%${escapeIlike(filters.state)}%`)
      }

      const [eventsRes, collectivesRes, peopleRes] = await Promise.all([
        eventsQuery.order('date_start', { ascending: true }).limit(15),
        supabase
          .from('collectives')
          .select('id, name, slug, region, state, cover_image_url, member_count')
          .eq('is_active', true)
          .or('is_national.is.null,is_national.eq.false')
          .ilike('name', pattern)
          .order('member_count', { ascending: false })
          .limit(10),
        supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .ilike('display_name', pattern)
          .limit(10),
      ])

      if (eventsRes.error) throw eventsRes.error
      if (collectivesRes.error) throw collectivesRes.error
      if (peopleRes.error) throw peopleRes.error

      return {
        events: (eventsRes.data ?? []) as EventSearchResult[],
        collectives: (collectivesRes.data ?? []) as CollectiveSearchResult[],
        people: (peopleRes.data ?? []) as ProfileSearchResult[],
      }
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 2 * 60 * 1000,
  })

  const totalResults =
    (results.data?.events.length ?? 0) +
    (results.data?.collectives.length ?? 0) +
    (results.data?.people.length ?? 0)

  return {
    query,
    setQuery,
    debouncedQuery,
    results,
    totalResults,
    recentSearches,
    commitSearch,
    clearRecentSearches,
    removeRecentSearch,
    hasQuery: debouncedQuery.length >= 2,
  }
}

/* ------------------------------------------------------------------ */
/*  Search suggestions                                                 */
/* ------------------------------------------------------------------ */

export const SEARCH_SUGGESTIONS = [
  'Tree planting',
  'Beach cleanup',
  'Nature walk',
  'Byron Bay',
  'Sydney',
  'Melbourne',
  'Wildlife survey',
  'Community garden',
]
