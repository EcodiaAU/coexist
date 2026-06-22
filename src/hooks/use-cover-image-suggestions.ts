/**
 * Cover image suggestions
 *
 * Surfaces real photos from past events so an organiser can pick a cover
 * without digging through their downloads or falling back on the generic
 * per-activity default images. Suggestions are drawn from the shared
 * event-photos library (admin_event_photos_view, which is security_invoker
 * so RLS limits rows to collectives the user is an active member of) and
 * filtered by the collective(s) and/or activity type already chosen on the
 * form. The same photo never appears twice, and a single photo-heavy event
 * cannot crowd out the rest.
 */

import { useQuery } from '@tanstack/react-query'
import type { Database } from '@/types/database.types'
import { supabase } from '@/lib/supabase'

const BUCKET = 'event-photos'

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
/** Rows pulled before client-side dedup/cap. */
const FETCH_LIMIT = 80

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
      let q = supabase
        .from('admin_event_photos_view')
        .select('storage_path, thumbnail_path, event_id, event_title, event_date_start, created_at')
        .is('archived_at', null)
        .not('storage_path', 'is', null)
        .order('event_date_start', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(FETCH_LIMIT)

      if (hasCollective) q = q.in('collective_id', collectiveIds)
      if (hasActivity) {
        q = q.eq('event_activity_type', activityType as Database['public']['Enums']['activity_type'])
      }

      const { data, error } = await q
      if (error) throw error

      const seenPaths = new Set<string>()
      const perEvent = new Map<string, number>()
      const out: CoverImageSuggestion[] = []

      for (const row of data ?? []) {
        const path = row.storage_path
        if (!path || seenPaths.has(path)) continue

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
