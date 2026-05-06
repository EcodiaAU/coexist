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
 * Returns:
 *   { widget_id: uuid, message_id: uuid }
 *
 * Safe-defaults rule (~/ecodiaos/patterns/edge-function-safe-defaults.md):
 *   This function is a write-only endpoint. There is no mode/direction switch.
 *   Missing body fields are validated up-front and rejected with 400 before
 *   any mutation occurs. Missing auth = 401.
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

function bad(status: number, message: string) {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    { status, headers: { 'Content-Type': 'application/json' } },
  )
}

Deno.serve(async (req: Request) => {
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

  // 1. Insert carpool_widgets
  const { data: widget, error: widgetErr } = await admin
    .from('carpool_widgets')
    .insert({
      collective_id,
      event_id,
      driver_id: driverId,
      departure_point_text: departure_point_text.trim(),
      departure_lat,
      departure_lng,
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
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
