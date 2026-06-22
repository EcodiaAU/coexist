/**
 * Cover image suggestions
 *
 * Surfaces real photos from past events so an organiser can pick a cover
 * without digging through their downloads or falling back on the generic
 * per-activity default images. Suggestions are drawn from the shared
 * event-photos library (admin_event_photos_view, which is security_invoker
 * so RLS limits rows to collectives the user is an active member of).
 *
 * Matching is RELEVANCE-RANKED, not a strict AND: a photo that matches both
 * the chosen collective and activity type ranks highest, then collective-only,
 * then activity-only. This means a Sunshine Coast tree-planting event still
 * gets suggestions (Sunshine Coast's own photos, plus tree-planting photos
 * from elsewhere) even when no photo matches that exact combination. The same
 * photo never appears twice, and a single photo-heavy event cannot crowd out
 * the rest.
 */

import { useQuery } from '@tanstack/react-query'
import type { Database } from '@/types/database.types'
import { supabase } from '@/lib/supabase'

/**
 * Minimal shape of the admin_event_photos_view rows we read. supabase-js
 * degrades the builder's row type once a free-form `.or()` filter is in the
 * chain, so we select('*') and cast to this (matching the useAdminEventPhotos
 * pattern in use-event-photos.ts).
 */
interface PhotoRow {
  storage_path: string | null
  thumbnail_path: string | null
  event_id: string | null
  event_title: string | null
  event_date_start: string | null
  created_at: string | null
  collective_id: string | null
  event_activity_type: string | null
}

const BUCKET = 'event-photos'

/**
 * Never suggest seed / stock / placeholder imagery. Real uploads are named with
 * a millisecond timestamp prefix; mock and stock fixtures carry obvious markers
 * (e.g. "mock-nature1.jpg"). The live seed rows were archived in prod on
 * 2026-06-22, but this guards the surface so any re-seeded fixture can never
 * reappear as a cover suggestion. Tate 2026-06-22: "get rid of anything stock".
 */
const STOCK_MARKER = /mock|stock|sample|placeholder|seed|dummy|unsplash|pexels|getty|shutterstock/i

function publicUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

export interface CoverImageSuggestion {
  storagePath: string
  url: string
  thumbnailUrl: string
  eventId: string | null
  eventTitle: string | null
  eventDateStart: string | null
}

/** Max suggestions surfaced, and max per source event (for variety). */
const MAX_SUGGESTIONS = 18
const MAX_PER_EVENT = 3
/** Rows pulled before client-side rank/dedup/cap. */
const FETCH_LIMIT = 120

interface Params {
  collectiveIds: string[]
  activityType: string | null | undefined
}

export function useCoverImageSuggestions({ collectiveIds, activityType }: Params) {
  const hasCollective = collectiveIds.length > 0
  const hasActivity = !!activityType
  const enabled = hasCollective || hasActivity

  // Stable key independent of array identity.
  const collectiveKey = [...collectiveIds].sort().join(',')

  const query = useQuery({
    queryKey: ['cover-image-suggestions', collectiveKey, activityType ?? null],
    enabled,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CoverImageSuggestion[]> => {
      // Relevance net: match the collective(s) OR the activity type. We fetch
      // each axis separately (a free-form `.or()` on this wide view trips
      // supabase-js type-recursion), then merge and rank client-side so an
      // exact (collective AND activity) match floats to the top without
      // excluding the still-relevant single-axis matches.
      const base = () =>
        supabase
          .from('admin_event_photos_view')
          .select('*')
          .is('archived_at', null)
          .not('storage_path', 'is', null)
          .order('event_date_start', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(FETCH_LIMIT)

      const queries = []
      if (hasCollective) queries.push(base().in('collective_id', collectiveIds))
      if (hasActivity) {
        queries.push(
          base().eq('event_activity_type', activityType as Database['public']['Enums']['activity_type']),
        )
      }

      const results = await Promise.all(queries)
      const firstError = results.find((r) => r.error)?.error
      if (firstError) throw firstError

      const rows = results.flatMap((r) => (r.data ?? []) as unknown as PhotoRow[])
      const collectiveSet = new Set(collectiveIds)
      const scored = rows.map((row) => {
        const matchesCollective = !!row.collective_id && collectiveSet.has(row.collective_id)
        const matchesActivity = hasActivity && row.event_activity_type === activityType
        return { row, score: (matchesCollective ? 2 : 0) + (matchesActivity ? 1 : 0) }
      })
      // Higher score first; recency order within a score band is preserved
      // because Array.prototype.sort is stable.
      scored.sort((a, b) => b.score - a.score)

      const seenPaths = new Set<string>()
      const perEvent = new Map<string, number>()
      const out: CoverImageSuggestion[] = []

      for (const { row } of scored) {
        const path = row.storage_path
        if (!path || seenPaths.has(path)) continue
        if (STOCK_MARKER.test(path)) continue

        const eventId = row.event_id ?? '∅'
        const used = perEvent.get(eventId) ?? 0
        if (used >= MAX_PER_EVENT) continue

        seenPaths.add(path)
        perEvent.set(eventId, used + 1)
        out.push({
          storagePath: path,
          url: publicUrl(path),
          thumbnailUrl: publicUrl(row.thumbnail_path ?? path),
          eventId: row.event_id,
          eventTitle: row.event_title,
          eventDateStart: row.event_date_start,
        })
        if (out.length >= MAX_SUGGESTIONS) break
      }

      return out
    },
  })

  return {
    suggestions: query.data ?? [],
    isLoading: query.isLoading && enabled,
    enabled,
  }
}
