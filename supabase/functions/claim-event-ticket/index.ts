/**
 * claim-event-ticket - Supabase Edge Function (authed)
 *
 * Grants a FREE confirmed ticket for an event to the signed-in user, for
 * migrating people who already paid via Eventbrite onto the app. Gated by a
 * per-event claim token (events.event_extras.claim_token) so only people with
 * the shared link can claim. Bypasses capacity (they pre-paid elsewhere).
 *
 * On a confirmed ticket the sync_campout_chat_membership trigger adds them to
 * the campout group chat; we also create the event_registration. Idempotent:
 * if the user already holds a live ticket for the event, returns it.
 *
 * Input: { event_id, token }. Auth: caller's JWT in Authorization.
 * Returns: { ticket_id, already }.
 */

import { withSentry } from "../_shared/sentry.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function code(): string {
  // 8-char A-Z2-9 ticket code (no ambiguous chars).
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => alpha[b % alpha.length]).join('')
}

Deno.serve(withSentry("claim-event-ticket", async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ---- Authenticate the caller ----
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Sign in to claim your ticket' }, 401)
    const token = authHeader.replace('Bearer ', '')
    const gotru = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseServiceKey },
    })
    if (!gotru.ok) return json({ error: 'Your session expired. Please sign in again.' }, 401)
    const caller = await gotru.json() as { id: string }

    const body = await req.json()
    if (typeof body.event_id !== 'string' || !UUID_RE.test(body.event_id)) return json({ error: 'Invalid event' }, 400)
    const claimToken = typeof body.token === 'string' ? body.token : ''

    // ---- Verify the event + claim token ----
    const { data: evt } = await supabase
      .from('events')
      .select('id, is_ticketed, status, activity_type, event_extras')
      .eq('id', body.event_id)
      .single()
    if (!evt) return json({ error: 'Event not found' }, 404)
    const expected = (evt.event_extras as { claim_token?: string } | null)?.claim_token
    if (!expected || claimToken !== expected) return json({ error: 'This claim link is not valid' }, 403)

    // ---- Idempotency: reuse an existing live ticket ----
    const { data: existing } = await supabase
      .from('event_tickets')
      .select('id, status')
      .eq('event_id', body.event_id)
      .eq('user_id', caller.id)
      .in('status', ['pending', 'confirmed', 'checked_in'])
      .maybeSingle()
    if (existing) {
      // Make sure a pending one is confirmed (so chat + registration apply).
      if (existing.status === 'pending') {
        await supabase.from('event_tickets').update({ status: 'confirmed', price_cents: 0, updated_at: new Date().toISOString() }).eq('id', existing.id)
      }
      await supabase.from('event_registrations').upsert({ event_id: body.event_id, user_id: caller.id, status: 'registered' }, { onConflict: 'event_id,user_id' })
      return json({ ticket_id: existing.id, already: true })
    }

    // ---- An active ticket type to attach the comp to ----
    const { data: tt } = await supabase
      .from('event_ticket_types')
      .select('id')
      .eq('event_id', body.event_id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!tt) return json({ error: 'This event has no ticket type' }, 400)

    // ---- Insert a free confirmed ticket (bypasses capacity; pre-paid elsewhere) ----
    let ticketId: string | null = null
    for (let attempt = 0; attempt < 4 && !ticketId; attempt++) {
      const { data: inserted, error: insErr } = await supabase
        .from('event_tickets')
        .insert({
          event_id: body.event_id,
          ticket_type_id: tt.id,
          user_id: caller.id,
          status: 'confirmed',
          price_cents: 0,
          quantity: 1,
          ticket_code: code(),
        })
        .select('id')
        .single()
      if (!insErr && inserted) { ticketId = inserted.id; break }
      if (insErr && !String(insErr.message).includes('ticket_code')) {
        console.error('[claim] insert failed:', insErr.message)
        return json({ error: 'Could not create your ticket' }, 500)
      }
    }
    if (!ticketId) return json({ error: 'Could not create your ticket' }, 500)

    // event_registration so they appear as attending (the chat join is handled
    // by the sync_campout_chat_membership trigger on the confirmed ticket).
    await supabase.from('event_registrations').upsert({ event_id: body.event_id, user_id: caller.id, status: 'registered' }, { onConflict: 'event_id,user_id' })

    return json({ ticket_id: ticketId, already: false })
  } catch (err) {
    console.error('[claim] error:', (err as Error).message)
    return json({ error: 'Something went wrong' }, 500)
  }
}))
