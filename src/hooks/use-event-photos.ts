/**
 * Event Photos hooks
 *
 * Shared photo albums attached to events. Anyone in the event's collective
 * can view; only confirmed attendees + leaders can upload. Photos persist
 * indefinitely so the memory stays accessible long after the event closes.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Database } from '@/types/database.types'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { useImageUpload } from '@/hooks/use-image-upload'

export interface EventPhoto {
  id: string
  event_id: string
  uploaded_by: string
  storage_path: string
  thumbnail_path: string | null
  caption: string | null
  width: number | null
  height: number | null
  bytes: number | null
  created_at: string
  archived_at: string | null
  uploader?: {
    id: string
    display_name: string | null
    avatar_url: string | null
  } | null
  url?: string
}

const BUCKET = 'event-photos'

/**
 * Max bytes per album upload. Mirrors the event-photos storage bucket's
 * file_size_limit, raised 50MB -> 200MB on 2026-08-09 so real phone videos
 * fit (a typical 1080p clip over ~30s exceeds 50MB). Kept in sync here so the
 * client can reject an oversize file with a friendly message before wasting an
 * upload round-trip instead of surfacing a raw storage 413.
 */
export const MAX_ALBUM_UPLOAD_MB = 200
export const MAX_ALBUM_UPLOAD_BYTES = MAX_ALBUM_UPLOAD_MB * 1024 * 1024

const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v)$/i

function publicUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/* ------------------------------------------------------------------ */
/*  Fetch photos for an event                                          */
/* ------------------------------------------------------------------ */
export function useEventPhotos(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-photos', eventId],
    queryFn: async () => {
      if (!eventId) return []
      const { data, error } = await supabase
        .from('event_photos')
        .select(`
          *,
          uploader:profiles!event_photos_uploaded_by_fkey(id, display_name, avatar_url)
        `)
        .eq('event_id', eventId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []).map((p) => ({
        ...(p as EventPhoto),
        url: publicUrl((p as EventPhoto).storage_path),
      })) as EventPhoto[]
    },
    enabled: !!eventId,
    staleTime: 30 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Upload a single photo                                              */
/* ------------------------------------------------------------------ */
export function useUploadEventPhoto(eventId: string | undefined) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { upload } = useImageUpload({
    bucket: BUCKET,
    pathPrefix: eventId ? `${eventId}` : 'misc',
  })

  return useMutation({
    mutationFn: async ({ blob, caption }: { blob: Blob; caption?: string }) => {
      if (!user || !eventId) throw new Error('Not authenticated or event missing')
      // Detect a video by MIME, falling back to the filename extension for the
      // rare picked file that reports an empty MIME type (seen with some
      // Android content-URI picks) so it isn't misrouted into image compression.
      const name = blob instanceof File ? blob.name : ''
      const isVideo = blob.type.startsWith('video/') || VIDEO_EXT_RE.test(name)

      // Reject an oversize file up front with a precise, friendly message
      // rather than letting the storage layer return a bare 413.
      if (blob.size > MAX_ALBUM_UPLOAD_BYTES) {
        const mb = Math.round(blob.size / (1024 * 1024))
        throw new Error(
          `This ${isVideo ? 'video' : 'file'} is ${mb}MB. The album limit is ${MAX_ALBUM_UPLOAD_MB}MB${isVideo ? ' - try trimming it to a shorter clip.' : '.'}`,
        )
      }

      let storedPath: string

      if (isVideo) {
        // Skip image compression for videos - just stream the raw blob to storage.
        // Path mirrors useImageUpload's layout: <eventId>/<userId>/<rand>.<ext>.
        // Derive the extension + content-type from the filename first so an
        // empty-MIME .mov is stored + served correctly (not mislabelled mp4).
        const nameExt = name.match(VIDEO_EXT_RE)?.[1]?.toLowerCase()
        const ext = nameExt
          ?? (blob.type.includes('quicktime') ? 'mov'
          : blob.type.includes('webm') ? 'webm'
          : 'mp4')
        const contentType = blob.type
          || (ext === 'mov' ? 'video/quicktime' : ext === 'webm' ? 'video/webm' : 'video/mp4')
        const rand = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        const path = `${eventId}/${user.id}/${rand}.${ext}`
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
          contentType,
          upsert: false,
        })
        if (upErr) throw upErr
        storedPath = path
      } else {
        const uploaded = await upload(blob)
        if (!uploaded?.path) throw new Error('Upload failed')
        storedPath = uploaded.path
      }

      const { data, error } = await supabase
        .from('event_photos')
        .insert({
          event_id: eventId,
          uploaded_by: user.id,
          storage_path: storedPath,
          caption: caption ?? null,
          bytes: blob.size,
        })
        .select(`
          *,
          uploader:profiles!event_photos_uploaded_by_fkey(id, display_name, avatar_url)
        `)
        .single()
      if (error) throw error
      return { ...(data as EventPhoto), url: publicUrl((data as EventPhoto).storage_path) } as EventPhoto
    },
    onSuccess: () => {
      if (eventId) {
        queryClient.invalidateQueries({ queryKey: ['event-photos', eventId] })
        // Auto-mirror this event's media to the correct OneDrive folder
        // (Photos/<Collective>/<Event date>), fire-and-forget so it never
        // blocks the UI. The onedrive-mirror function is idempotent and a sweep
        // cron backstops anything missed (offline sync, transient failure).
        // Origin: Tate 2026-07-27 - "upload in the app, auto-upload to OneDrive".
        supabase.functions.invoke('onedrive-mirror', { body: { event_id: eventId } }).catch(() => {})
      }
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Delete a photo (uploader OR leader/admin)                          */
/* ------------------------------------------------------------------ */
export function useDeleteEventPhoto(eventId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ photoId, storagePath }: { photoId: string; storagePath: string }) => {
      // Best-effort: remove storage object first, then the row
      await supabase.storage.from(BUCKET).remove([storagePath])
      const { error } = await supabase
        .from('event_photos')
        .delete()
        .eq('id', photoId)
      if (error) throw error
    },
    onSuccess: () => {
      if (eventId) {
        queryClient.invalidateQueries({ queryKey: ['event-photos', eventId] })
      }
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Campout channel membership                                         */
/*                                                                     */
/*  Campouts are national events with a dedicated group-chat channel    */
/*  (chat_channels.event_id). Members of that channel can view + add     */
/*  to the event's album even when they don't belong to the event's     */
/*  own collective and were never marked `attended` - the RLS grants     */
/*  it (migration 20260809000000) and this predicate mirrors it so the   */
/*  UI shows the album + upload CTA to the whole crew.                   */
/* ------------------------------------------------------------------ */
export function useIsCampoutChannelMember(eventId: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['event-campout-membership', eventId, user?.id],
    queryFn: async () => {
      if (!eventId || !user) return false
      const { data: channels } = await supabase
        .from('chat_channels')
        .select('id')
        .eq('event_id', eventId)
      const channelIds = (channels ?? []).map((c) => c.id)
      if (channelIds.length === 0) return false
      const { count } = await supabase
        .from('chat_channel_members')
        .select('*', { count: 'exact', head: true })
        .in('channel_id', channelIds)
        .eq('user_id', user.id)
      return (count ?? 0) > 0
    },
    enabled: !!eventId && !!user,
    staleTime: 5 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Admin: filtered photo browser                                      */
/* ------------------------------------------------------------------ */
export interface AdminPhotoFilters {
  collectiveId?: string | null
  fromDate?: string | null
  toDate?: string | null
  activityType?: string | null
  uploaderUserId?: string | null
  attendedByUserId?: string | null
  limit?: number
}

export interface AdminEventPhoto extends EventPhoto {
  event_title: string
  event_date_start: string
  event_date_end: string | null
  event_activity_type: string | null
  collective_id: string
  collective_name: string
  collective_state: string | null
  collective_region: string | null
  uploader_display_name: string | null
  uploader_avatar_url: string | null
}

export function useAdminEventPhotos(filters: AdminPhotoFilters) {
  return useQuery({
    queryKey: ['admin-event-photos', filters],
    queryFn: async () => {
      // "Attended by user" goes via the RPC for an explicit join + admin auth.
      if (filters.attendedByUserId) {
        const { data, error } = await supabase.rpc('admin_photos_by_attendee', {
          p_user_id: filters.attendedByUserId,
          p_limit: filters.limit ?? 200,
        })
        if (error) throw error
        return ((data ?? []) as unknown as AdminEventPhoto[]).map((p) => ({ ...p, url: publicUrl(p.storage_path) }))
      }

      let q = supabase
        .from('admin_event_photos_view')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(filters.limit ?? 200)

      if (filters.collectiveId) q = q.eq('collective_id', filters.collectiveId)
      if (filters.activityType) q = q.eq('event_activity_type', filters.activityType as Database['public']['Enums']['activity_type'])
      if (filters.uploaderUserId) q = q.eq('uploaded_by', filters.uploaderUserId)
      if (filters.fromDate) q = q.gte('event_date_start', filters.fromDate)
      if (filters.toDate) q = q.lte('event_date_start', filters.toDate)

      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((p) => ({ ...(p as AdminEventPhoto), url: publicUrl((p as AdminEventPhoto).storage_path) })) as AdminEventPhoto[]
    },
    staleTime: 30 * 1000,
  })
}
