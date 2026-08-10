/**
 * cancel-event - Supabase Edge Function (authed; event leaders + staff)
 *
 * Cancels an event AND makes the ticket-holders whole. Before this existed,
 * cancelling an event only flipped events.status='cancelled' and emailed
 * registered/invited attendees (useCancelEvent) - it never touched paid tickets,
 * so holders kept a confirmed ticket, the money stayed in Stripe, and there was
 * no in-app notice. This function closes that gap server-side (service role):
 *
 *   1. Authorize the caller the same way the UI gates the Cancel button
 *      (isLeaderOrAbove): global admin/staff OR collective staff of the event's
 *      collective.
 *   2. Flip events.status -> 'cancelled' (idempotent).
 *   3. For every live ticket on the event:
 *        - paid (has a payment intent, price>0, confirmed/checked_in):
 *          issue a Stripe refund. The existing charge.refunded webhook then sets
 *          status='refunded', reconciles registration + campout chat, and emails
 *          a refund confirmation. We also defensively mark it refunded + reconcile.
 *        - free / comp / pending: mark 'cancelled' and reconcile.
 *   The per-attendee "event cancelled" email is still sent by the caller
 *   (useCancelEvent) so registered attendees who never held a ticket are told too.
 *
 * Input:  { event_id }
 * Auth:   caller JWT; caller must be admin/staff or collective staff of the event.
 * Returns:{ ok, refunded, cancelled, failed }
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

Deno.serve(withSentry('cancel-event', async (req: Request) => {
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

    // ---- Validate input + load the event ----
    const body = await req.json()
    if (typeof body.event_id !== 'string' || !UUID_RE.test(body.event_id)) {
      return json({ error: 'Invalid event' }, 400)
    }
    const { data: evt } = await supabase
      .from('events')
      .select('id, status, collective_id')
      .eq('id', body.event_id)
      .single()
    if (!evt) return json({ error: 'Event not found' }, 404)

    // ---- Authorize: admin/staff OR collective staff of this event ----
    // Mirrors the UI gate (isLeaderOrAbove). The DB helpers are SECURITY DEFINER
    // and take the uid explicitly, so they authorize correctly under service role.
    const [{ data: isStaff }, { data: isCollStaff }] = await Promise.all([
      supabase.rpc('is_admin_or_staff', { uid: caller.id }),
      evt.collective_id
        ? supabase.rpc('is_collective_staff', { uid: caller.id, cid: evt.collective_id })
        : Promise.resolve({ data: false }),
    ])
    if (isStaff !== true && isCollStaff !== true) {
      return json({ error: 'Only event leaders and staff can cancel this event' }, 403)
    }

    // ---- Flip status (idempotent) ----
    if (evt.status !== 'cancelled') {
      const { error: updErr } = await supabase
        .from('events')
        .update({ status: 'cancelled' })
        .eq('id', evt.id)
      if (updErr) {
        console.error('[cancel-event] status flip failed:', updErr.message)
        return json({ error: 'Could not cancel the event' }, 500)
      }
    }

    // ---- Refund paid / cancel free for every live ticket ----
    const { data: tickets } = await supabase
      .from('event_tickets')
      .select('id, status, price_cents, stripe_payment_intent_id, user_id')
      .eq('event_id', evt.id)
      .in('status', ['pending', 'confirmed', 'checked_in'])

    let refunded = 0
    let cancelled = 0
    let failed = 0

    for (const t of tickets ?? []) {
      const isPaid = !!t.stripe_payment_intent_id && (t.price_cents ?? 0) > 0 &&
        (t.status === 'confirmed' || t.status === 'checked_in')
      try {
        if (isPaid) {
          try {
            await stripe.refunds.create({ payment_intent: t.stripe_payment_intent_id! })
          } catch (err) {
            const msg = (err as Error).message
            if (!/already been refunded|already refunded/i.test(msg)) throw err
          }
          await supabase.from('event_tickets')
            .update({ status: 'refunded', updated_at: new Date().toISOString() })
            .eq('id', t.id)
            .in('status', ['confirmed', 'checked_in', 'pending'])
          await supabase.rpc('reconcile_ticket_membership', { p_event: evt.id, p_user: t.user_id })
          refunded++
        } else {
          await supabase.from('event_tickets')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', t.id)
            .in('status', ['pending', 'confirmed', 'checked_in'])
          await supabase.rpc('reconcile_ticket_membership', { p_event: evt.id, p_user: t.user_id })
          cancelled++
        }
      } catch (err) {
        failed++
        console.error(`[cancel-event] ticket ${t.id} failed:`, (err as Error).message)
      }
    }

    // Surface a partial-failure so the caller does not report a clean success
    // when a Stripe refund did not go through (the event IS cancelled either way).
    return json({ ok: failed === 0, refunded, cancelled, failed })
  } catch (err) {
    console.error('[cancel-event] error:', (err as Error).message)
    return json({ error: 'Something went wrong' }, 500)
  }
}))
