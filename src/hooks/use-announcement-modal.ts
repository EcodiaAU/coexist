import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'

/**
 * Admin-authored announcement modal.
 *
 * A promotion surface separate from the Updates tab: the admin sets a single
 * active announcement and each member sees it exactly once, on the first app
 * open after it is set. When the admin edits or re-activates it, the row's
 * updated_at bumps (DB trigger) and it becomes "unseen" again, so the member
 * sees the refreshed version once more.
 *
 * Tables (public.announcement_modals + public.announcement_modal_seen) mirror
 * the proven updates / update_reads pair. RLS reuses the existing
 * send_announcements capability. See migration 20260817000000.
 *
 * The generated Database types do not yet include these two tables, so we go
 * through an untyped supabase handle and annotate the rows locally. Runtime is
 * unaffected; only the compile-time table-name union is bypassed.
 */
const db = supabase as unknown as SupabaseClient

export interface AnnouncementModal {
  id: string
  author_id: string | null
  title: string
  body: string
  image_url: string | null
  cta_label: string | null
  cta_href: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AnnouncementInput {
  id?: string
  title: string
  body: string
  image_url: string | null
  cta_label: string | null
  cta_href: string | null
  is_active: boolean
}

/* ------------------------------------------------------------------ */
/*  Member: the active announcement this user has not yet dismissed    */
/* ------------------------------------------------------------------ */

export function useActiveAnnouncement() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['announcement-modal', user?.id],
    enabled: !!user,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<AnnouncementModal | null> => {
      if (!user) return null

      // The single active announcement (most recently updated wins if two ever
      // briefly overlap; the single-active DB trigger keeps it to one).
      const { data: rows, error } = await db
        .from('announcement_modals')
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
      if (error) throw error

      const announcement = (rows?.[0] ?? null) as AnnouncementModal | null
      if (!announcement) return null

      // Has this user already dismissed THIS version?
      const { data: seenRow } = await db
        .from('announcement_modal_seen')
        .select('seen_version')
        .eq('announcement_id', announcement.id)
        .eq('user_id', user.id)
        .maybeSingle()

      const seenVersion = (seenRow as { seen_version: string } | null)?.seen_version
      const unseen =
        !seenVersion ||
        new Date(seenVersion).getTime() < new Date(announcement.updated_at).getTime()

      return unseen ? announcement : null
    },
  })
}

export function useDismissAnnouncement() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (announcement: AnnouncementModal) => {
      if (!user) return
      // seen_version pins the dismissal to this exact version, so an admin edit
      // (which bumps updated_at) makes it unseen again.
      const { error } = await db.from('announcement_modal_seen').upsert(
        {
          announcement_id: announcement.id,
          user_id: user.id,
          seen_version: announcement.updated_at,
          dismissed_at: new Date().toISOString(),
        },
        { onConflict: 'announcement_id,user_id' },
      )
      if (error) throw error
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['announcement-modal', user?.id] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Admin: manage the announcement (send_announcements capability)     */
/* ------------------------------------------------------------------ */

export function useAdminAnnouncements() {
  return useQuery({
    queryKey: ['admin-announcements'],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<AnnouncementModal[]> => {
      const { data, error } = await db
        .from('announcement_modals')
        .select('*')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as AnnouncementModal[]
    },
  })
}

export function useUpsertAnnouncement() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: AnnouncementInput): Promise<AnnouncementModal> => {
      if (!user) throw new Error('Not authenticated')

      const row = {
        title: input.title,
        body: input.body,
        image_url: input.image_url,
        cta_label: input.cta_label,
        cta_href: input.cta_href,
        is_active: input.is_active,
      }

      if (input.id) {
        // updated_at is bumped by the set_updated_at trigger, which is what
        // re-arms the "unseen" state for every member on an edit.
        const { data, error } = await db
          .from('announcement_modals')
          .update(row)
          .eq('id', input.id)
          .select()
          .single()
        if (error) throw error
        return data as AnnouncementModal
      }

      const { data, error } = await db
        .from('announcement_modals')
        .insert({ ...row, author_id: user.id })
        .select()
        .single()
      if (error) throw error
      return data as AnnouncementModal
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-announcements'] })
      queryClient.invalidateQueries({ queryKey: ['announcement-modal'] })
    },
  })
}

export function useSetAnnouncementActive() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      // Activating one deactivates the rest (single-active DB trigger).
      const { error } = await db
        .from('announcement_modals')
        .update({ is_active: active })
        .eq('id', id)
      if (error) throw error
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-announcements'] })
      queryClient.invalidateQueries({ queryKey: ['announcement-modal'] })
    },
  })
}

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      // announcement_modal_seen rows cascade on delete (FK on delete cascade).
      const { error } = await db.from('announcement_modals').delete().eq('id', id)
      if (error) throw error
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-announcements'] })
      queryClient.invalidateQueries({ queryKey: ['announcement-modal'] })
    },
  })
}
