/**
 * onedrive-mirror - Supabase Edge Function
 *
 * Auto-mirrors event album media (the `event_photos` table, bucket
 * `event-photos`, which already accepts photos AND videos) to Co-Exist's
 * OneDrive, into a per-event folder that matches the existing hand-made
 * convention:  Photos / <Collective name> / <Event title> <DD.MM.YYYY>  on
 * ceo@coexistaus.org's OneDrive.
 *
 * So a leader just adds photos/videos to the event in the app and they land in
 * the right OneDrive folder automatically - no manual upload, no per-event link
 * to paste. The per-event folder URL is stored back on events.onedrive_folder_url
 * so the survey can deep-link to exactly the right place.
 *
 * Invoke (authed, Bearer required):
 *   POST /onedrive-mirror  { "event_id": "<uuid>" }        mirror all unmirrored photos of one event
 *   POST /onedrive-mirror  { "event_photo_id": "<uuid>" }  mirror one photo (trigger/webhook path)
 *   POST /onedrive-mirror  { "sweep": true, "limit": 50 }  reconciliation: mirror oldest unmirrored
 *
 * Idempotent: only rows with onedrive_mirrored_at IS NULL are processed, so
 * re-invoking is safe. Per-row failures are recorded in onedrive_mirror_error
 * and do not abort the batch.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'
import { getGraphToken, graph, ensureFolderPath, uploadFile, createShareLink, type DriveItem } from '../_shared/graph.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// The OneDrive that hosts the org's event media library ("Photos" folder).
const MEDIA_DRIVE_USER = 'ceo@coexistaus.org'
const MEDIA_BASE_FOLDER = 'Photos'
const MEDIA_BUCKET = 'event-photos'

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v',
}
const extOf = (p: string) => (p.split('.').pop() ?? '').toLowerCase()
const baseName = (p: string) => p.split('/').pop() ?? p
/** ISO timestamp -> DD.MM.YYYY (date portion only; avoids timezone drift). */
function ddmmyyyy(iso: string): string {
  const d = (iso || '').slice(0, 10) // YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : d
}

interface PhotoRow { id: string; event_id: string; storage_path: string; onedrive_mirrored_at: string | null }

Deno.serve(withSentry('onedrive-mirror', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('COEXIST_SERVICE_ROLE_KEY') ?? '',
  )

  try {
    const body = await req.json().catch(() => ({})) as { event_id?: string; event_photo_id?: string; sweep?: boolean; limit?: number }

    // 1) Resolve the set of unmirrored photo rows to process.
    let rows: PhotoRow[] = []
    if (body.event_photo_id) {
      const { data } = await supabase.from('event_photos')
        .select('id,event_id,storage_path,onedrive_mirrored_at')
        .eq('id', body.event_photo_id).is('archived_at', null).limit(1)
      rows = (data ?? []) as PhotoRow[]
    } else if (body.event_id) {
      const { data } = await supabase.from('event_photos')
        .select('id,event_id,storage_path,onedrive_mirrored_at')
        .eq('event_id', body.event_id).is('archived_at', null).is('onedrive_mirrored_at', null)
      rows = (data ?? []) as PhotoRow[]
    } else if (body.sweep) {
      const { data } = await supabase.from('event_photos')
        .select('id,event_id,storage_path,onedrive_mirrored_at')
        .is('archived_at', null).is('onedrive_mirrored_at', null)
        .order('created_at', { ascending: true }).limit(Math.min(body.limit ?? 50, 200))
      rows = (data ?? []) as PhotoRow[]
    } else {
      return new Response(JSON.stringify({ error: 'event_id, event_photo_id, or sweep required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    rows = rows.filter((r) => !r.onedrive_mirrored_at)
    if (rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, mirrored: 0, note: 'nothing to mirror' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = await getGraphToken()
    // Resolve the media OneDrive id once.
    const drv = await graph(token, 'GET', `/users/${encodeURIComponent(MEDIA_DRIVE_USER)}/drive?$select=id`)
    const driveId = drv.json?.id as string | undefined
    if (!driveId) throw new Error(`could not resolve media drive (${drv.status}): ${drv.text.slice(0, 160)}`)

    // 2) Group rows by event so we resolve/create each event folder once.
    const byEvent = new Map<string, PhotoRow[]>()
    for (const r of rows) { (byEvent.get(r.event_id) ?? byEvent.set(r.event_id, []).get(r.event_id)!).push(r) }

    const folderCache = new Map<string, DriveItem>()
    let mirrored = 0
    const errors: Array<{ id: string; error: string }> = []

    for (const [eventId, evRows] of byEvent) {
      // Event + collective for the folder path.
      const { data: ev } = await supabase.from('events')
        .select('id,title,date_start,collective_id,onedrive_folder_id')
        .eq('id', eventId).limit(1).maybeSingle()
      if (!ev) { evRows.forEach((r) => errors.push({ id: r.id, error: 'event not found' })); continue }
      let collectiveName = 'Uncategorised'
      if (ev.collective_id) {
        const { data: col } = await supabase.from('collectives').select('name').eq('id', ev.collective_id).maybeSingle()
        if (col?.name) collectiveName = col.name
      }
      const eventFolderName = `${ev.title ?? 'Event'} ${ddmmyyyy(ev.date_start ?? '')}`.trim()

      let folder = folderCache.get(eventId)
      if (!folder) {
        folder = await ensureFolderPath(token, driveId, MEDIA_BASE_FOLDER, [collectiveName, eventFolderName])
        folderCache.set(eventId, folder)
        // Store the per-event folder back on the event for the survey deep-link.
        // Prefer an anonymous view link (leaders may not have an M365 login, and
        // Co-Exist already shares the parent Photos folder anonymously); fall
        // back to an org link, then the raw webUrl.
        let folderLink = folder.webUrl
        try {
          const anon = await createShareLink(token, driveId, folder.id, 'view', 'anonymous')
          const org = anon ? null : await createShareLink(token, driveId, folder.id, 'view', 'organization')
          folderLink = anon ?? org ?? folder.webUrl
        } catch { /* keep webUrl */ }
        await supabase.from('events').update({
          onedrive_folder_id: folder.id,
          onedrive_folder_url: folderLink,
        }).eq('id', eventId)
      }

      // 3) Mirror each file: download from storage -> upload to OneDrive.
      for (const r of evRows) {
        try {
          const { data: blob, error: dlErr } = await supabase.storage.from(MEDIA_BUCKET).download(r.storage_path)
          if (dlErr || !blob) throw new Error(`storage download failed: ${dlErr?.message ?? 'no blob'}`)
          const bytes = new Uint8Array(await blob.arrayBuffer())
          const fname = baseName(r.storage_path)
          const ctype = CONTENT_TYPES[extOf(fname)] ?? blob.type ?? 'application/octet-stream'
          const item = await uploadFile(token, driveId, folder.id, fname, bytes, ctype)
          await supabase.from('event_photos').update({
            onedrive_item_id: item.id,
            onedrive_mirrored_at: new Date().toISOString(),
            onedrive_mirror_error: null,
          }).eq('id', r.id)
          mirrored++
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          await supabase.from('event_photos').update({ onedrive_mirror_error: msg.slice(0, 500) }).eq('id', r.id)
          errors.push({ id: r.id, error: msg })
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, mirrored, errors, events: byEvent.size }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
}))
