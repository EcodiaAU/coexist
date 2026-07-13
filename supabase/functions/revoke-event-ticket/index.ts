/**
 * revoke-event-ticket - Supabase Edge Function (authed; managers + admins only)
 *
 * Lets a manager or admin remove someone's ticket. Two paths:
 *   - Paid ticket: issue a Stripe refund against the original payment intent.
 *     The existing `charge.refunded` webhook then sets status='refunded',
 *     cancels the registration, removes them from the campout chat (via the
 *     sync_campout_chat_membership trigger, unless they hold another active
 *     ticket), and emails a refund confirmation.
 *   - Free/comp ticket (no payment intent): set status='cancelled' directly;
 *     the same chat-membership trigger removes them if no other live ticket
 *     remains, and the reconciler cancels the registration.
 *
 * NOTE (2026-07-13): this function used to blind-write
 * event_registrations.status = 'cancelled' after the ticket update. That ran
 * AFTER trg_reconcile_event_ticket_state had already reconciled, so on a person
 * holding a second live ticket for the same event (a re-buy, a dupe) it
 * clobbered a correct 'registered' row back to 'cancelled' and stranded them:
 * confirmed ticket, cancelled registration, invisible in the roster. Both blind
 * writes are now calls to reconcile_ticket_membership(), which DERIVES the
 * registration + chat state from the count of still-valid tickets.
 *
 * Input:  { ticket_id }
 * Auth:   caller JWT; caller's role must be manager|admin.
 * Returns:{ ok, action: 'refunded'|'cancelled'|'already', ticket_id }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { withSentry } from '../_shared/sentry.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' })
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(withSentry('revoke-event-ticket', async (req: Request) => {
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
      .select('role')
      .eq('id', caller.id)
      .single()
    if (callerProfile?.role !== 'manager' && callerProfile?.role !== 'admin') {
      return json({ error: 'Only managers and admins can remove tickets' }, 403)
    }

    // ---- Validate input ----
    const body = await req.json()
    if (typeof body.ticket_id !== 'string' || !UUID_RE.test(body.ticket_id)) {
      return json({ error: 'Invalid ticket' }, 400)
    }

    // ---- Load the ticket ----
    const { data: ticket } = await supabase
      .from('event_tickets')
      .select('id, status, price_cents, stripe_payment_intent_id, event_id, user_id')
      .eq('id', body.ticket_id)
      .single()
    if (!ticket) return json({ error: 'Ticket not found' }, 404)

    if (ticket.status === 'cancelled' || ticket.status === 'refunded') {
      return json({ ok: true, action: 'already', ticket_id: ticket.id })
    }

    const isPaid = !!ticket.stripe_payment_intent_id && (ticket.price_cents ?? 0) > 0

    if (isPaid) {
      // ---- Stripe refund; webhook finalises status + chat + email ----
      try {
        await stripe.refunds.create({ payment_intent: ticket.stripe_payment_intent_id! })
      } catch (err) {
        const msg = (err as Error).message
        // If Stripe says it's already refunded, fall through to mark it locally.
        if (!/already been refunded|already refunded/i.test(msg)) {
          console.error('[revoke] stripe refund failed:', msg)
          return json({ error: 'Refund failed at Stripe. Ticket left unchanged.' }, 502)
        }
      }
      // Defensive local finalise (idempotent with the webhook): mark refunded
      // so the UI updates immediately. Registration + chat state is then
      // DERIVED by reconcile_ticket_membership, never set blindly here.
      await supabase.from('event_tickets')
        .update({ status: 'refunded', updated_at: new Date().toISOString() })
        .eq('id', ticket.id)
        .in('status', ['confirmed', 'checked_in', 'pending'])
      await supabase.rpc('reconcile_ticket_membership', { p_event: ticket.event_id, p_user: ticket.user_id })
      return json({ ok: true, action: 'refunded', ticket_id: ticket.id })
    }

    // ---- Free/comp ticket: cancel directly (reconciler handles chat removal) ----
    await supabase.from('event_tickets')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', ticket.id)
    await supabase.rpc('reconcile_ticket_membership', { p_event: ticket.event_id, p_user: ticket.user_id })
    return json({ ok: true, action: 'cancelled', ticket_id: ticket.id })
  } catch (err) {
    console.error('[revoke] error:', (err as Error).message)
    return json({ error: 'Something went wrong' }, 500)
  }
}))
