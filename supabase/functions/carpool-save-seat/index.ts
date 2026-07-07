// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'

/**
 * carpool-save-seat
 *
 * Atomically claims a seat in a carpool, then ensures a breakout chat
 * (chat_channels.type='carpool_breakout') exists and the passenger is a
 * member. On the first claim, creates the breakout channel + adds driver.
 * On subsequent claims, adds the passenger to the existing channel.
 *
 * Body:
 *   {
 *     carpool_id: uuid,
 *     pickup_address_text: string,
 *     pickup_lat?: number,
 *     pickup_lng?: number
 *   }
 *
 * Auth: requires user JWT. Passenger = caller.
 *
 * Returns:
 *   { seat: <carpool_seats row>, breakout_channel_id: uuid }
 *
 * Atomicity: the seat-count check + insert is performed by the
 * `save_carpool_seat` SECURITY DEFINER RPC (locks the widget row with
 * SELECT FOR UPDATE). The breakout-channel side-effect runs after the
 * RPC returns; if the channel-side fails the seat row is preserved (the
 * passenger has the seat, the next save_carpool_seat call by anyone else
 * will succeed in adding them, and a sweep job is acceptable).
 *
 * Safe-defaults rule (~/ecodiaos/patterns/edge-function-safe-defaults.md):
 *   Write-only endpoint. No mode/direction switch. Missing fields → 400.
 */

interface SaveSeatBody {
  carpool_id: string
  pickup_address_text: string
  pickup_lat?: number | null
  pickup_lng?: number | null
}

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

Deno.serve(withSentry('carpool-save-seat', async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') return bad(405, 'method not allowed')

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return bad(401, 'missing Authorization header')
  }
  const userJwt = authHeader.replace('Bearer ', '')

  let body: SaveSeatBody
  try {
    body = await req.json()
  } catch {
    return bad(400, 'invalid JSON body')
  }

  const {
    carpool_id,
    pickup_address_text,
    pickup_lat = null,
    pickup_lng = null,
  } = body || ({} as SaveSeatBody)

  if (!carpool_id) return bad(400, 'carpool_id required')
  if (!pickup_address_text || !pickup_address_text.trim()) {
    return bad(400, 'pickup_address_text required')
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // User-context client: resolves caller identity AND triggers the RPC under
  // their auth so save_carpool_seat's auth.uid() returns the passenger.
  const userClient = createClient(supabaseUrl, serviceKey, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  })
  const { data: userRes, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userRes?.user) return bad(401, 'invalid JWT')
  const passengerId = userRes.user.id

  // 1. Atomic seat claim via RPC (SELECT FOR UPDATE inside)
  const { data: seat, error: seatErr } = await userClient.rpc('save_carpool_seat', {
    p_carpool_id: carpool_id,
    p_pickup_address_text: pickup_address_text.trim(),
    p_pickup_lat: pickup_lat,
    p_pickup_lng: pickup_lng,
  })

  if (seatErr) {
    console.error('[carpool-save-seat] save_carpool_seat RPC failed:', seatErr.message)
    // Map common cases to clean HTTP codes
    const msg = seatErr.message || 'seat save failed'
    if (msg.includes('no seats remaining')) return bad(409, msg)
    if (msg.includes('not accepting seats')) return bad(409, msg)
    if (msg.includes('not a member')) return bad(403, msg)
    if (msg.includes('driver cannot claim')) return bad(409, msg)
    if (msg.includes('not found')) return bad(404, msg)
    return bad(400, msg)
  }
  if (!seat) return bad(500, 'seat RPC returned no row')

  // 2. Service-role client for breakout-channel side effects
  const admin = createClient(supabaseUrl, serviceKey)

  // Look up widget + linked event for channel naming
  const { data: widget, error: widgetErr } = await admin
    .from('carpool_widgets')
    .select('id, collective_id, driver_id, event_id')
    .eq('id', carpool_id)
    .maybeSingle()
  if (widgetErr || !widget) {
    console.error('[carpool-save-seat] widget lookup failed:', widgetErr?.message)
    // Seat is saved; report partial success
    return new Response(
      JSON.stringify({
        success: true,
        seat,
        breakout_channel_id: null,
        warning: 'seat saved but breakout channel could not be resolved',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }

  const { data: eventRow } = await admin
    .from('events')
    .select('title')
    .eq('id', widget.event_id)
    .maybeSingle()
  const eventTitle = eventRow?.title || 'Event'

  // 3. Ensure breakout chat exists. carpool_breakout_chats has carpool_id PK.
  let breakoutChannelId: string | null = null

  const { data: existingLink } = await admin
    .from('carpool_breakout_chats')
    .select('channel_id, deleted_at')
    .eq('carpool_id', carpool_id)
    .maybeSingle()

  if (existingLink && !existingLink.deleted_at) {
    breakoutChannelId = existingLink.channel_id
  } else {
    // Create channel
    const { data: channel, error: chanErr } = await admin
      .from('chat_channels')
      .insert({
        type: 'carpool_breakout',
        collective_id: widget.collective_id,
        name: `🚗 Carpool: ${eventTitle}`,
        lifecycle_status: 'open',
      })
      .select('id')
      .single()
    if (chanErr || !channel) {
      console.error('[carpool-save-seat] channel insert failed:', chanErr?.message)
      return new Response(
        JSON.stringify({
          success: true,
          seat,
          breakout_channel_id: null,
          warning: `seat saved but channel creation failed: ${chanErr?.message ?? 'unknown'}`,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      )
    }
    breakoutChannelId = channel.id

    // Link
    await admin
      .from('carpool_breakout_chats')
      .upsert(
        { carpool_id, channel_id: breakoutChannelId, archived_at: null, deleted_at: null },
        { onConflict: 'carpool_id' },
      )

    // Driver as first member
    await admin
      .from('chat_channel_members')
      .upsert(
        { channel_id: breakoutChannelId, user_id: widget.driver_id },
        { onConflict: 'channel_id,user_id' },
      )
  }

  // 4. Ensure passenger is a member (idempotent upsert)
  if (breakoutChannelId) {
    await admin
      .from('chat_channel_members')
      .upsert(
        { channel_id: breakoutChannelId, user_id: passengerId },
        { onConflict: 'channel_id,user_id' },
      )
  }

  return new Response(
    JSON.stringify({
      success: true,
      seat,
      breakout_channel_id: breakoutChannelId,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
  )
}))
