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
 * if the user already holds a LIVE ticket for the event (including an unpaid
 * organiser hold), it is reused and settled rather than duplicated.
 *
 * Input: { event_id, token }. Auth: caller's JWT in Authorization.
 * Returns: { ticket_id, already }.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'
import {
  LIVE_TICKET_STATUSES,
  UNSETTLED_TICKET_STATUSES,
  isUnsettledTicketStatus,
  pickTicketToReuse,
} from '../_shared/ticket-status.ts'

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

Deno.serve(withSentry('claim-event-ticket', async (req: Request) => {
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

    // ---- Verify the event exists ----
    const { data: evt } = await supabase
      .from('events')
      .select('id, is_ticketed, status, activity_type')
      .eq('id', body.event_id)
      .single()
    if (!evt) return json({ error: 'Event not found' }, 404)

    // ---- Verify the claim token ----
    // The token is stored PRIVATELY in event_claim_tokens (readable only by
    // service_role), not in the world-readable events.event_extras. Before
    // migration 20260810140000 it lived in event_extras, which anon +
    // authenticated can SELECT via events_select_public_anon, so any signed-in
    // user could read the token off the public event and self-grant a free
    // ticket. The token still travels in the shared claim URL (/claim/:id/:token);
    // only its validation source moved server-side.
    const { data: tokRow } = await supabase
      .from('event_claim_tokens')
      .select('token')
      .eq('event_id', body.event_id)
      .maybeSingle()
    const expected = tokRow?.token
    if (!expected || claimToken !== expected) return json({ error: 'This claim link is not valid' }, 403)

    // ---- Idempotency: reuse an existing LIVE ticket ----
    // LIVE, not the inline `['pending', 'confirmed', 'checked_in']` this
    // replaces. That list predates `reserved`, so a member already holding an
    // organiser hold did not match, was treated as having no ticket, and got a
    // SECOND comp row inserted. Both rows are spot-taking, so that person
    // occupied two seats and the hold was never cleared.
    //
    // No `.maybeSingle()`: it returns an ERROR rather than a row when two match,
    // this call site dropped that error, and the fall-through was to INSERT,
    // which would add a third seat to anyone the bug above already doubled.
    // Choosing deterministically heals the duplicate instead of compounding it.
    const { data: liveTickets } = await supabase
      .from('event_tickets')
      .select('id, status')
      .eq('event_id', body.event_id)
      .eq('user_id', caller.id)
      .in('status', LIVE_TICKET_STATUSES)
    const existing = pickTicketToReuse(liveTickets)
    if (existing) {
      // Settle an UNSETTLED seat, which is `pending` (mid-checkout) and
      // `reserved` (an organiser hold) alike. Following a claim link is an
      // explicit decision to hand this person a free ticket, so leaving a hold
      // in place would keep My Tickets demanding payment for a seat that has
      // just been comped, and would keep them outside the campout chat, since
      // sync_campout_chat_membership fires on `confirmed`.
      //
      // The `.in()` on the UPDATE is an optimistic lock, and it is load-bearing:
      // without it, a Stripe webhook confirming this row between the select and
      // the update would be overwritten to price_cents 0, destroying the record
      // of a payment the member actually made.
      if (isUnsettledTicketStatus(existing.status)) {
        await supabase.from('event_tickets')
          .update({ status: 'confirmed', price_cents: 0, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .in('status', UNSETTLED_TICKET_STATUSES)
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
    // COMP / MIGRATION EXEMPTION (D6, backlog:478): unlike reserve_event_ticket,
    // claim does NOT run validate_ticket_answers. This is deliberate. The claim
    // link is the low-friction Eventbrite-migration path (pre-paid link-holders,
    // no answer UI); hard-enforcing an event's required custom questions here
    // would break that migration for exactly the campout shape it serves (Wild
    // Mountains carried a required consent question + a claim token). The genuine
    // safety data (dietary + medical) is NOT an event_ticket_question - it lives
    // on the profile and is enforced app-wide by the path-agnostic DietaryGate,
    // which fires for ANY live-ticket holder on an upcoming ticketed event
    // regardless of how the ticket was obtained. So a claimed attendee is still
    // caught for dietary/medical; the exempted custom questions are logistics/
    // consent. Answers passed in body.answers are still stored verbatim.
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
          custom_answers: (body.answers && typeof body.answers === 'object') ? body.answers : {},
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
