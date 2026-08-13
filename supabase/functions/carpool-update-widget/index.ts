// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'

/**
 * carpool-update-widget
 *
 * Lets the DRIVER edit their own carpool after posting it: adjust the seat
 * count (e.g. a neighbour jumps in, or someone drops out), move the departure
 * point/time, or update the notes. This is the write path behind the "Edit
 * seats or details" affordance on the driver's carpool card.
 *
 * Body (all edit fields optional - send only what changed):
 *   {
 *     carpool_id: uuid,            // required
 *     seats_total?: number,        // 1..8, never below confirmed passengers
 *     departure_point_text?: string,
 *     departure_time?: string,     // ISO
 *     notes?: string | null
 *   }
 *
 * Auth: requires user JWT. Only the widget's driver may edit (else 403).
 *
 * Guards:
 *   - seats_total cannot drop below the confirmed-passenger count (those seats
 *     are committed). Range 1..8 to match the create stepper.
 *   - status is recomputed to keep 'full'/'open' honest against the new
 *     capacity: raising seats on a full carpool reopens it; filling it closes
 *     it. cancelled/archived carpools are not editable.
 *
 * Safe-defaults rule: write-only endpoint, no mode switch, missing carpool_id
 * or nothing-to-update => 400.
 */

interface UpdateBody {
  carpool_id: string
  seats_total?: number
  departure_point_text?: string
  departure_time?: string
  notes?: string | null
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

Deno.serve(withSentry('carpool-update-widget', async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') return bad(405, 'method not allowed')

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return bad(401, 'missing Authorization header')
  }
  const userJwt = authHeader.replace('Bearer ', '')

  let body: UpdateBody
  try {
    body = await req.json()
  } catch {
    return bad(400, 'invalid JSON body')
  }

  const { carpool_id } = body || ({} as UpdateBody)
  if (!carpool_id) return bad(400, 'carpool_id required')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Resolve caller identity under their JWT.
  const userClient = createClient(supabaseUrl, serviceKey, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  })
  const { data: userRes, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userRes?.user) return bad(401, 'invalid JWT')
  const callerId = userRes.user.id

  const admin = createClient(supabaseUrl, serviceKey)

  // Load the widget + verify ownership.
  const { data: widget, error: widgetErr } = await admin
    .from('carpool_widgets')
    .select('id, driver_id, status, seats_total')
    .eq('id', carpool_id)
    .maybeSingle()
  if (widgetErr) return bad(500, `widget lookup failed: ${widgetErr.message}`)
  if (!widget) return bad(404, 'carpool not found')
  if (widget.driver_id !== callerId) return bad(403, 'only the driver can edit this carpool')
  if (widget.status === 'cancelled' || widget.status === 'archived') {
    return bad(409, 'this carpool is closed and cannot be edited')
  }

  // How many seats are already committed?
  const { count: confirmedCount, error: countErr } = await admin
    .from('carpool_seats')
    .select('id', { count: 'exact', head: true })
    .eq('carpool_id', carpool_id)
    .eq('status', 'confirmed')
  if (countErr) return bad(500, `seat count failed: ${countErr.message}`)
  const confirmed = confirmedCount ?? 0

  // Build the patch from provided fields only.
  const patch: Record<string, unknown> = {}

  if (body.seats_total !== undefined) {
    const n = body.seats_total
    if (!Number.isInteger(n) || n < 1 || n > 8) {
      return bad(400, 'seats_total must be a whole number between 1 and 8')
    }
    if (n < confirmed) {
      return bad(409, `can't set seats below ${confirmed} - that many passengers are already confirmed`)
    }
    patch.seats_total = n
  }

  if (body.departure_point_text !== undefined) {
    const t = String(body.departure_point_text).trim()
    if (!t) return bad(400, 'departure_point_text cannot be empty')
    patch.departure_point_text = t
  }

  if (body.departure_time !== undefined) {
    const dt = String(body.departure_time).trim()
    if (!dt || Number.isNaN(new Date(dt).getTime())) {
      return bad(400, 'departure_time must be a valid ISO datetime')
    }
    patch.departure_time = dt
  }

  if (body.notes !== undefined) {
    patch.notes = body.notes === null ? null : String(body.notes).trim() || null
  }

  if (Object.keys(patch).length === 0) return bad(400, 'no fields to update')

  // Recompute status against the effective capacity so full/open stays honest.
  const newSeatsTotal = (patch.seats_total as number | undefined) ?? widget.seats_total
  patch.status = confirmed >= newSeatsTotal ? 'full' : 'open'

  const { data: updated, error: updErr } = await admin
    .from('carpool_widgets')
    .update(patch)
    .eq('id', carpool_id)
    .select('id, seats_total, status')
    .single()
  if (updErr || !updated) return bad(500, `update failed: ${updErr?.message ?? 'unknown'}`)

  return new Response(
    JSON.stringify({ success: true, ...updated }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
  )
}))
