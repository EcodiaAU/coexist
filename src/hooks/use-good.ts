/**
 * Feel Good + Do Good data hooks.
 *
 * Two small public CMS surfaces (Kurt Jones framing, 2026-08-27):
 *   FEEL GOOD -> support_resources      mental-health and crisis lines
 *   DO GOOD   -> do_good_organisations  other orgs whose opportunities members
 *                                       can go and take up
 *
 * Both tables are RLS-gated to published rows for anon, so no client-side
 * is_published filter is needed. They are ordered in SQL and returned as-is.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface CategoryImage {
  surface: 'feel_good' | 'do_good'
  category: string
  image_url: string
}

export interface SupportResource {
  id: string
  name: string
  tagline: string | null
  phone: string | null
  phone_note: string | null
  sms_number: string | null
  url: string | null
  hours: string | null
  category: string
  is_crisis: boolean
  sort_order: number
  image_url: string | null
  image_position_x: number | null
  image_position_y: number | null
  /** Row cover if set, else the category backdrop. Resolved client-side so a
      row added by staff without a photo still renders a full-bleed card. */
  cover: string | null
}

export interface DoGoodOrganisation {
  id: string
  name: string
  blurb: string | null
  logo_url: string | null
  url: string | null
  opportunity: string | null
  category: string
  location: string | null
  sort_order: number
  image_url: string | null
  image_position_x: number | null
  image_position_y: number | null
  cover: string | null
}

/** Category backdrops for both surfaces, keyed "<surface>:<category>". */
export function useCategoryImages() {
  return useQuery({
    queryKey: ['good-category-images'],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from('good_category_images')
        .select('surface, category, image_url')
      if (error) throw error
      const map: Record<string, string> = {}
      for (const r of (data ?? []) as CategoryImage[]) map[`${r.surface}:${r.category}`] = r.image_url
      return map
    },
    staleTime: 30 * 60 * 1000,
  })
}

export function useSupportResources() {
  const { data: covers } = useCategoryImages()
  return useQuery({
    queryKey: ['support-resources', !!covers],
    queryFn: async (): Promise<SupportResource[]> => {
      const { data, error } = await supabase
        .from('support_resources')
        .select('id, name, tagline, phone, phone_note, sms_number, url, hours, category, is_crisis, sort_order, image_url, image_position_x, image_position_y')
        .order('is_crisis', { ascending: false })
        .order('sort_order')
      if (error) throw error
      return ((data ?? []) as SupportResource[]).map((r) => ({
        ...r,
        cover: r.image_url ?? covers?.[`feel_good:${r.category}`] ?? covers?.['feel_good:general'] ?? null,
      }))
    },
    enabled: covers !== undefined,
    staleTime: 10 * 60 * 1000,
  })
}

export function useDoGoodOrganisations() {
  const { data: covers } = useCategoryImages()
  return useQuery({
    queryKey: ['do-good-organisations', !!covers],
    queryFn: async (): Promise<DoGoodOrganisation[]> => {
      const { data, error } = await supabase
        .from('do_good_organisations')
        .select('id, name, blurb, logo_url, url, opportunity, category, location, sort_order, image_url, image_position_x, image_position_y')
        .order('sort_order')
      if (error) throw error
      return ((data ?? []) as DoGoodOrganisation[]).map((r) => ({
        ...r,
        cover: r.image_url ?? covers?.[`do_good:${r.category}`] ?? covers?.['do_good:conservation'] ?? null,
      }))
    },
    enabled: covers !== undefined,
    staleTime: 10 * 60 * 1000,
  })
}

/** A stored number is human-readable ("13 11 14"); the dial string strips the
 *  spaces. One source, two renderings, so the shown and dialled number cannot
 *  drift apart the way two hand-maintained columns would. */
export function dialString(phone: string): string {
  return phone.replace(/[^\d+]/g, '')
}

/** Prepend https:// when a stored link has no scheme, so a bare "example.org"
 *  opens the external site instead of routing inside the app. */
export function externalUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}
