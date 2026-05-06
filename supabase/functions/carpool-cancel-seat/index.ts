// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * carpool-cancel-seat
 *
 * Cancels a seat: marks status='cancelled', removes the passenger from the
 * breakout channel, and reverts widget.status from 'full' back to 'open' if
 * the carpool had been full.
 *
 * Auth: passenger themselves OR driver of the carpool. Anyone else → 403.
 *
 * Body: { seat_id: uuid }
 *
 * Returns: { seat: <updated row>, widget_status: 'open'|'full'|... }
 *
 * Safe-defaults rule (~/ecodiaos/patterns/edge-function-safe-defaults.md):
 *   Write-only endpoint. Missing seat_id → 400. Auth check is explicit:
 *   nothing mutates until passenger-or-driver is verified.
 */

interface CancelSeatBody {
  seat_id: string
}

function bad(status: number, message: string) {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    { status, headers: { 'Content-Type': 'application/json' } },
  )
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return bad(405, 'method not allowed')

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return bad(401, 'missing Authorization header')
  }
  const userJwt = authHeader.replace('Bearer ', '')

  let body: CancelSeatBody
  try {
    body = await req.json()
  } catch {
    return bad(400, 'invalid JSON body')
  }

  const { seat_id } = body || ({} as CancelSeatBody)
  if (!seat_id) return bad(400, 'seat_id required')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const userClient = createClient(supabaseUrl, serviceKey, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  })
  const { data: userRes, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userRes?.user) return bad(401, 'invalid JWT')
  const callerId = userRes.user.id

  const admin = createClient(supabaseUrl, serviceKey)

  // Look up the seat + widget for auth check
  const { data: seatRow, error: seatErr } = await admin
    .from('carpool_seats')
    .select('id, carpool_id, passenger_id, status')
    .eq('id', seat_id)
    .maybeSingle()
  if (seatErr) {
    console.error('[carpool-cancel-seat] seat lookup failed:', seatErr.message)
    return bad(500, 'seat lookup failed')
  }
  if (!seatRow) return bad(404, 'seat not found')

  if (seatRow.status === 'cancelled') {
    return new Response(
      JSON.stringify({ success: true, seat: seatRow, already_cancelled: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const { data: widget, error: widgetErr } = await admin
    .from('carpool_widgets')
    .select('id, driver_id, status, seats_total')
    .eq('id', seatRow.carpool_id)
    .maybeSingle()
  if (widgetErr || !widget) {
    console.error('[carpool-cancel-seat] widget lookup failed:', widgetErr?.message)
    return bad(500, 'widget lookup failed')
  }

  const isPassenger = seatRow.passenger_id === callerId
  const isDriver = widget.driver_id === callerId
  if (!isPassenger && !isDriver) {
    return bad(403, 'only the passenger or the carpool driver may cancel a seat')
  }

  // 1. Mark seat cancelled
  const { data: updatedSeat, error: updateErr } = await admin
    .from('carpool_seats')
    .update({ status: 'cancelled' })
    .eq('id', seat_id)
    .select()
    .single()
  if (updateErr || !updatedSeat) {
    console.error('[carpool-cancel-seat] seat update failed:', updateErr?.message)
    return bad(500, `seat update failed: ${updateErr?.message ?? 'unknown'}`)
  }

  // 2. Remove passenger from breakout channel (if one exists and not deleted)
  const { data: breakout } = await admin
    .from('carpool_breakout_chats')
    .select('channel_id, deleted_at')
    .eq('carpool_id', widget.id)
    .maybeSingle()

  if (breakout?.channel_id && !breakout.deleted_at) {
    await admin
      .from('chat_channel_members')
      .delete()
      .eq('channel_id', breakout.channel_id)
      .eq('user_id', seatRow.passenger_id)
  }

  // 3. Revert widget.status='full' → 'open' if applicable
  let newWidgetStatus = widget.status
  if (widget.status === 'full') {
    await admin
      .from('carpool_widgets')
      .update({ status: 'open' })
      .eq('id', widget.id)
    newWidgetStatus = 'open'
  }

  return new Response(
    JSON.stringify({
      success: true,
      seat: updatedSeat,
      widget_status: newWidgetStatus,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
