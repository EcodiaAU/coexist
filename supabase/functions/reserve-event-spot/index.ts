/**
 * reserve-event-spot - Supabase Edge Function (authed; managers + admins only)
 *
 * The missing half of the comp story. `grant-event-ticket` gives someone a FREE
 * confirmed ticket; this HOLDS a spot for someone who is still expected to pay.
 *
 * Angelica hit the gap twice in one week (her own Wild Mountains ticket once the
 * event filled, and comping Max Sonderman): once an event is at capacity the only
 * lever was a full freebie. This reserves the seat anyway, over capacity, and
 * emails the recipient a pay-to-confirm link.
 *
 * The hold is a real seat: `reserved` counts in event_spots_taken and in the
 * availability RPC, so nobody else can buy it out from under them. It is NOT a
 * confirmed attendance: the recipient stays out of the campout chat and sits at
 * registration status 'invited' until the payment lands.
 *
 * Input:  { event_id, user_id? | email?, name?, hold_expires_at?, note?,
 *           ticket_type_id?, notify? }
 * Auth:   caller JWT; caller's role must be manager|admin (same gate as grant).
 * Returns:{ ok, ticket_id, already, status, user_id, price_cents, created_account }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.coexistaus.org'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(withSentry('reserve-event-spot', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ---- Authenticate the caller ----
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Sign in required' }, 401)
    const callerJwt = authHeader.replace('Bearer ', '')
    const gotru = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${callerJwt}`, apikey: supabaseServiceKey },
    })
    if (!gotru.ok) return json({ error: 'Your session expired. Please sign in again.' }, 401)
    const caller = await gotru.json() as { id: string }

    // ---- Authorize: managers + admins only ----
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role, display_name')
      .eq('id', caller.id)
      .single()
    const callerRole = callerProfile?.role
    if (callerRole !== 'manager' && callerRole !== 'admin') {
      return json({ error: 'Only managers and admins can hold a spot' }, 403)
    }

    // ---- Validate input ----
    const body = await req.json()
    if (typeof body.event_id !== 'string' || !UUID_RE.test(body.event_id)) {
      return json({ error: 'Invalid event' }, 400)
    }
    const givenUserId = typeof body.user_id === 'string' && UUID_RE.test(body.user_id) ? body.user_id : null
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : ''
    const notify = body.notify !== false
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : null
    const ticketTypeId = typeof body.ticket_type_id === 'string' && UUID_RE.test(body.ticket_type_id)
      ? body.ticket_type_id
      : null

    let holdExpiresAt: string | null = null
    if (typeof body.hold_expires_at === 'string' && body.hold_expires_at) {
      const d = new Date(body.hold_expires_at)
      if (Number.isNaN(d.getTime())) return json({ error: 'Invalid hold expiry date' }, 400)
      holdExpiresAt = d.toISOString()
    }

    if (!givenUserId && (!EMAIL_RE.test(email) || email.length > 254)) {
      return json({ error: 'A valid email or an existing user is required' }, 400)
    }

    // ---- Event must be a live ticketed event ----
    const { data: evt } = await supabase
      .from('events')
      .select('id, title, date_start, address, is_ticketed, status, cover_image_url')
      .eq('id', body.event_id)
      .single()
    if (!evt) return json({ error: 'Event not found' }, 404)
    if (!evt.is_ticketed) return json({ error: 'This event does not use tickets' }, 400)

    // ---- Resolve or provision the recipient (same shape as grant) ----
    let userId = givenUserId
    let createdAccount = false
    if (!userId) {
      const { data: existingId } = await supabase.rpc('get_auth_user_id_by_email', { p_email: email })
      if (existingId) {
        userId = existingId as string
      } else {
        const randomPw = crypto.randomUUID() + crypto.randomUUID()
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email,
          password: randomPw,
          email_confirm: true,
          user_metadata: name ? { display_name: name, full_name: name } : {},
        })
        if (created?.user) {
          userId = created.user.id
          createdAccount = true
        } else {
          const { data: retryId } = await supabase.rpc('get_auth_user_id_by_email', { p_email: email })
          if (retryId) {
            userId = retryId as string
          } else {
            console.error('[reserve-spot] createUser failed:', createErr?.message)
            return json({ error: 'Could not create the recipient account' }, 500)
          }
        }
      }
    }
    if (!userId) return json({ error: 'Could not resolve the recipient' }, 500)

    // ---- Hold the spot. Deliberately bypasses capacity (that is the feature) ----
    const { data: held, error: holdErr } = await supabase.rpc('reserve_spot_for_user', {
      p_event_id: body.event_id,
      p_user_id: userId,
      p_reserved_by: caller.id,
      p_hold_expires_at: holdExpiresAt,
      p_note: note,
      p_ticket_type_id: ticketTypeId,
    })
    if (holdErr) {
      console.error('[reserve-spot] rpc failed:', holdErr.message)
      return json({ error: holdErr.message || 'Could not hold the spot' }, 400)
    }

    const result = held as {
      ok: boolean; already: boolean; status: string
      ticket_id: string; price_cents: number; ticket_code: string
    }

    // ---- Notify: pay-to-confirm link (magic link for a brand-new account) ----
    if (notify && result.status === 'reserved') {
      const payPath = `/events/${body.event_id}?pay_ticket=${result.ticket_id}`
      let payUrl = `${APP_URL}${payPath}`
      if (createdAccount) {
        const { data: u } = await supabase.auth.admin.getUserById(userId)
        const recipientEmail = u?.user?.email
        if (recipientEmail) {
          const { data: magic } = await supabase.auth.admin.generateLink({
            type: 'magiclink',
            email: recipientEmail,
            options: { redirectTo: `${APP_URL}${payPath}` },
          })
          if (magic?.properties?.action_link) payUrl = magic.properties.action_link
        }
      }
      try {
        await supabase.functions.invoke('send-email', {
          body: {
            type: 'ticket_spot_held',
            userId,
            data: {
              name: '',
              event_title: evt.title ?? 'Event',
              event_date: evt.date_start
                ? new Date(evt.date_start).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                : '',
              event_location: evt.address ?? '',
              amount: ((result.price_cents ?? 0) / 100).toFixed(2),
              currency: 'AUD',
              hold_expires: holdExpiresAt
                ? new Date(holdExpiresAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
                : '',
              reserved_by_name: callerProfile?.display_name ?? '',
              pay_url: payUrl,
              cover_image_url: evt.cover_image_url ?? '',
            },
          },
        })
      } catch (err) {
        console.error('[reserve-spot] send-email failed:', (err as Error).message)
      }
    }

    return json({ ...result, user_id: userId, created_account: createdAccount })
  } catch (err) {
    console.error('[reserve-spot] error:', (err as Error).message)
    return json({ error: 'Something went wrong' }, 500)
  }
}))
