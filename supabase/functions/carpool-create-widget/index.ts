// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * carpool-create-widget
 *
 * Creates a carpool_widgets row + a chat_messages row of message_type='carpool'
 * pointing to that widget, in a single logical operation.
 *
 * Body:
 *   {
 *     collective_id: uuid,
 *     event_id: uuid,
 *     departure_point_text: string,
 *     departure_lat?: number,
 *     departure_lng?: number,
 *     departure_time: ISO timestamp,
 *     seats_total: int (>0),
 *     notes?: string
 *   }
 *
 * Auth: requires user JWT. Driver = caller. Caller must be a member of the
 * collective (RLS on carpool_widgets enforces this; we double-check here for
 * a clean 403 instead of an opaque RLS rejection).
 *
 * Geocoding (added 7 May 2026, fork_mouu2eqy_b0ba8b):
 *   If the caller does not provide both departure_lat and departure_lng, we
 *   geocode departure_point_text via OSM Nominatim (countrycodes=au, limit=1).
 *   Results are cached in carpool_geocode_cache with a 90d TTL to stay under
 *   Nominatim's 1-req/sec usage policy. On geocode failure we return 422 with
 *   { error: "couldnt_geocode", departure_point_text } rather than silently
 *   nulling lat/lng (per ~/ecodiaos/patterns/edge-function-safe-defaults.md).
 *
 * Returns:
 *   { success: true, widget_id: uuid, message_id: uuid }
 *
 * Safe-defaults rule (~/ecodiaos/patterns/edge-function-safe-defaults.md):
 *   This function is a write-only endpoint. There is no mode/direction switch.
 *   Missing body fields are validated up-front and rejected with 400 before
 *   any mutation occurs. Missing auth = 401. Geocode failure = 422.
 */

interface CreateWidgetBody {
  collective_id: string
  event_id: string
  departure_point_text: string
  departure_lat?: number | null
  departure_lng?: number | null
  departure_time: string
  seats_total: number
  notes?: string | null
}

// CORS headers - the function previously rejected OPTIONS preflight with
// 405-no-cors which surfaced in the browser as a CORS error rather than a
// useful response. Mirror the Supabase Edge Function CORS convention so the
// FE supabase.functions.invoke() path completes.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function bad(status: number, message: string) {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    { status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
  )
}

function badJson(status: number, payload: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ success: false, ...payload }),
    { status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
  )
}

const NOMINATIM_USER_AGENT = 'Ecodia Co-Exist (code@ecodia.au)'
const GEOCODE_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 days

interface GeocodeResult {
  lat: number
  lng: number
  display_name?: string | null
  source: 'cache' | 'nominatim' | 'caller'
}

/**
 * Resolve lat/lng for a departure point.
 *
 * Priority:
 *   1. Caller-supplied numeric lat+lng (skip geocoding entirely)
 *   2. carpool_geocode_cache hit within 90d TTL
 *   3. OSM Nominatim live lookup (then upsert into cache)
 *
 * Throws an Error with code 'couldnt_geocode' if 1, 2, and 3 all fail.
 */
async function resolveCoords(
  admin: ReturnType<typeof createClient>,
  text: string,
  callerLat: number | null | undefined,
  callerLng: number | null | undefined,
): Promise<GeocodeResult> {
  // 1. Caller-supplied
  if (
    typeof callerLat === 'number' && Number.isFinite(callerLat) &&
    typeof callerLng === 'number' && Number.isFinite(callerLng)
  ) {
    return { lat: callerLat, lng: callerLng, source: 'caller' }
  }

  const cacheKey = text.trim().toLowerCase()

  // 2. Cache lookup
  const { data: cached, error: cacheErr } = await admin
    .from('carpool_geocode_cache')
    .select('lat, lng, display_name, cached_at')
    .eq('text_normalized', cacheKey)
    .maybeSingle()
  if (cacheErr) {
    console.error('[carpool-create-widget] cache lookup error:', cacheErr.message)
    // fall through to Nominatim
  }
  if (cached) {
    const ageMs = Date.now() - new Date(cached.cached_at as string).getTime()
    if (ageMs < GEOCODE_CACHE_TTL_MS) {
      return {
        lat: Number(cached.lat),
        lng: Number(cached.lng),
        display_name: (cached.display_name as string | null) ?? null,
        source: 'cache',
      }
    }
  }

  // 3. Nominatim
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&limit=1&countrycodes=au`
  let arr: Array<{ lat: string; lon: string; display_name?: string }>
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': NOMINATIM_USER_AGENT, 'Accept': 'application/json' },
    })
    if (!resp.ok) {
      console.error(`[carpool-create-widget] nominatim http ${resp.status} for "${text}"`)
      const e = new Error('couldnt_geocode')
      ;(e as Error & { code?: string }).code = 'couldnt_geocode'
      throw e
    }
    arr = await resp.json()
  } catch (e) {
    const err = e as Error & { code?: string }
    if (err.code !== 'couldnt_geocode') {
      console.error(`[carpool-create-widget] nominatim fetch error for "${text}":`, err.message)
    }
    const out = new Error('couldnt_geocode')
    ;(out as Error & { code?: string }).code = 'couldnt_geocode'
    throw out
  }

  if (!Array.isArray(arr) || arr.length === 0) {
    const e = new Error('couldnt_geocode')
    ;(e as Error & { code?: string }).code = 'couldnt_geocode'
    throw e
  }

  const lat = parseFloat(arr[0].lat)
  const lng = parseFloat(arr[0].lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const e = new Error('couldnt_geocode')
    ;(e as Error & { code?: string }).code = 'couldnt_geocode'
    throw e
  }
  const display_name = arr[0].display_name ?? null

  // Upsert into cache (best-effort, don't fail the request if the cache write fails)
  try {
    const { error: upsertErr } = await admin
      .from('carpool_geocode_cache')
      .upsert(
        { text_normalized: cacheKey, lat, lng, display_name, cached_at: new Date().toISOString() },
        { onConflict: 'text_normalized' },
      )
    if (upsertErr) {
      console.error('[carpool-create-widget] cache upsert error:', upsertErr.message)
    }
  } catch (e) {
    console.error('[carpool-create-widget] cache upsert threw:', (e as Error).message)
  }

  return { lat, lng, display_name, source: 'nominatim' }
}

Deno.serve(async (req: Request) => {
  // CORS preflight - must respond with CORS headers BEFORE the method-check
  // 405 path, otherwise browsers see "CORS error" instead of any useful info.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return bad(405, 'method not allowed')
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return bad(401, 'missing Authorization header')
  }
  const userJwt = authHeader.replace('Bearer ', '')

  let body: CreateWidgetBody
  try {
    body = await req.json()
  } catch {
    return bad(400, 'invalid JSON body')
  }

  const {
    collective_id, event_id, departure_point_text,
    departure_lat = null, departure_lng = null,
    departure_time, seats_total, notes = null,
  } = body || ({} as CreateWidgetBody)

  // Validation - explicit field checks (no silent defaults that mutate)
  if (!collective_id) return bad(400, 'collective_id required')
  if (!event_id) return bad(400, 'event_id required')
  if (!departure_point_text || !departure_point_text.trim()) {
    return bad(400, 'departure_point_text required')
  }
  if (!departure_time) return bad(400, 'departure_time required')
  if (!Number.isInteger(seats_total) || seats_total <= 0) {
    return bad(400, 'seats_total must be a positive integer')
  }

  const trimmedDeparturePoint = departure_point_text.trim()

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // User-context client to resolve auth.uid() (driver)
  const userClient = createClient(supabaseUrl, serviceKey, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  })
  const { data: userRes, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userRes?.user) {
    return bad(401, 'invalid JWT')
  }
  const driverId = userRes.user.id

  // Service-role client for transactional writes
  const admin = createClient(supabaseUrl, serviceKey)

  // Membership check (caller must belong to the collective)
  const { data: memberRow, error: memberErr } = await admin
    .from('collective_members')
    .select('id, status')
    .eq('user_id', driverId)
    .eq('collective_id', collective_id)
    .eq('status', 'active')
    .maybeSingle()
  if (memberErr) {
    console.error('[carpool-create-widget] membership query failed:', memberErr.message)
    return bad(500, 'membership lookup failed')
  }
  if (!memberRow) return bad(403, 'driver not a member of this collective')

  // Event must exist and belong to the same collective
  const { data: eventRow, error: eventErr } = await admin
    .from('events')
    .select('id, collective_id, title')
    .eq('id', event_id)
    .maybeSingle()
  if (eventErr) {
    console.error('[carpool-create-widget] event lookup failed:', eventErr.message)
    return bad(500, 'event lookup failed')
  }
  if (!eventRow) return bad(404, 'event not found')
  if (eventRow.collective_id !== collective_id) {
    return bad(400, 'event does not belong to this collective')
  }

  // Resolve coords (caller -> cache -> nominatim). 422 on geocode failure
  // rather than silently nulling lat/lng.
  let resolvedLat: number
  let resolvedLng: number
  try {
    const coords = await resolveCoords(admin, trimmedDeparturePoint, departure_lat, departure_lng)
    resolvedLat = coords.lat
    resolvedLng = coords.lng
  } catch (e) {
    const err = e as Error & { code?: string }
    if (err.code === 'couldnt_geocode') {
      return badJson(422, {
        error: 'couldnt_geocode',
        departure_point_text: trimmedDeparturePoint,
        hint: 'Try a more specific or well-known location (suburb, landmark, or street + suburb).',
      })
    }
    console.error('[carpool-create-widget] resolveCoords unexpected error:', err.message)
    return bad(500, 'geocode lookup failed')
  }

  // 1. Insert carpool_widgets
  const { data: widget, error: widgetErr } = await admin
    .from('carpool_widgets')
    .insert({
      collective_id,
      event_id,
      driver_id: driverId,
      departure_point_text: trimmedDeparturePoint,
      departure_lat: resolvedLat,
      departure_lng: resolvedLng,
      departure_time,
      seats_total,
      notes,
      status: 'open',
    })
    .select()
    .single()
  if (widgetErr || !widget) {
    console.error('[carpool-create-widget] insert widget failed:', widgetErr?.message)
    return bad(500, `widget insert failed: ${widgetErr?.message ?? 'unknown'}`)
  }

  // 2. Insert chat_messages (the in-stream renderable bubble)
  const { data: msg, error: msgErr } = await admin
    .from('chat_messages')
    .insert({
      collective_id,
      user_id: driverId,
      message_type: 'carpool',
      carpool_id: widget.id,
      content: `🚗 Carpool to ${eventRow.title}`,
    })
    .select()
    .single()
  if (msgErr || !msg) {
    // Roll back the widget so we don't orphan it
    await admin.from('carpool_widgets').delete().eq('id', widget.id)
    console.error('[carpool-create-widget] insert message failed:', msgErr?.message)
    return bad(500, `message insert failed: ${msgErr?.message ?? 'unknown'}`)
  }

  // 3. Backfill widget.message_id
  await admin
    .from('carpool_widgets')
    .update({ message_id: msg.id })
    .eq('id', widget.id)

  return new Response(
    JSON.stringify({
      success: true,
      widget_id: widget.id,
      message_id: msg.id,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
  )
})
