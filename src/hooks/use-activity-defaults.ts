import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ActivityTypeDefault {
  activity_type: string
  cover_image_url: string
  cover_image_position_x: number
  cover_image_position_y: number
}

/**
 * Default cover image (and focal point) per activity_type, so Jess and
 * the rest of the admin team don't have to upload a fresh image for
 * every tree-planting / clean-up / nature-hike etc. The event-form
 * auto-fills the cover from this map when the activity_type is chosen
 * and the user hasn't already uploaded their own image. Admins can swap
 * any entry from the future /admin/activity-defaults panel (Jess: not
 * shipping that this round - update the row in activity_type_defaults
 * via Supabase studio if you need to change one).
 */
export function useActivityTypeDefaults() {
  return useQuery({
    queryKey: ['activity-type-defaults'],
    queryFn: async (): Promise<Record<string, ActivityTypeDefault>> => {
      // Cast: activity_type_defaults was added 2026-05-18 and is not in the
      // generated database.types.ts yet. Direct from() returns `never` until
      // the codegen runs.
      const client = supabase as unknown as {
        from: (t: string) => {
          select: (cols: string) => Promise<{
            data: ActivityTypeDefault[] | null
            error: Error | null
          }>
        }
      }
      const { data, error } = await client
        .from('activity_type_defaults')
        .select('activity_type, cover_image_url, cover_image_position_x, cover_image_position_y')
      if (error) throw error
      const map: Record<string, ActivityTypeDefault> = {}
      for (const row of data ?? []) {
        map[row.activity_type] = row
      }
      return map
    },
    staleTime: 10 * 60 * 1000,
  })
}
