/**
 * self-service-ticket - Supabase Edge Function (authed; the TICKET HOLDER acts)
 *
 * Until now every refund and every ticket change was organiser work: a member
 * who needed out had to get a human to do it (Angelica, 2026-08-24). This gives
 * the holder the two actions that were organiser-only, without ever handing a
 * member the organiser's powers.
 *
 * Actions:
 *   refund          - refund MY confirmed ticket via Stripe (or cancel a $0 comp).
 *   transfer_start  - offer MY ticket to someone by email; they get a claim link.
 *   transfer_cancel - withdraw an offer I made.
 *   transfer_claim  - claim a ticket someone offered ME (token-gated).
 *
 * EVERY authorisation decision is made in SQL, not here: the RPCs are owner-scoped
 * (`user_id = auth.uid()`) and re-check the per-event enable flags and the refund
 * cutoff. This function holds the Stripe secret and sends mail; it is not the gate.
 *
 * Both self-service paths are OFF by default per event
 * (events.self_service_refund_enabled / self_service_transfer_enabled) because the
 * member-facing TERMS wording is still owed by Angelica + Tate. The mechanics ship
 * dark until a human turns them on with real terms in hand.
 *
 * Input:  { action, ticket_id?, to_email?, transfer_id?, token? }
 * Auth:   caller JWT. No role requirement: you may only act on your own ticket.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { withSentry } from '../_shared/sentry.ts'
import { reportInvokeError } from '../_shared/invoke-report.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' })
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.coexistaus.org'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(withSentry('self-service-ticket', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const service = createClient(supabaseUrl, supabaseServiceKey)

    // ---- Authenticate the caller ----
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Sign in required' }, 401)
    const callerJwt = authHeader.replace('Bearer ', '')
    const gotru = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${callerJwt}`, apikey: supabaseServiceKey },
    })
    if (!gotru.ok) return json({ error: 'Your session expired. Please sign in again.' }, 401)
    const caller = await gotru.json() as { id: string }

    // A client bound to the CALLER's JWT. The owner-scoped RPCs read auth.uid()
    // from it, so the database enforces ownership rather than this function
    // trusting a user_id off the request body.
    const asCaller = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: `Bearer ${callerJwt}` } },
    })

    const body = await req.json()
    const action = typeof body.action === 'string' ? body.action : ''

    /* ---------------------------------------------------------------- */
    /*  refund - the holder refunds their own ticket                     */
    /* ---------------------------------------------------------------- */
    if (action === 'refund') {
      if (typeof body.ticket_id !== 'string' || !UUID_RE.test(body.ticket_id)) {
        return json({ error: 'Invalid ticket' }, 400)
      }

      // The DB decides whether this is allowed (ownership, status, per-event
      // flag, cutoff). Never re-derive that policy here.
      const { data: policy, error: policyErr } = await asCaller.rpc('get_my_ticket_self_service', {
        p_ticket_id: body.ticket_id,
      })
      if (policyErr) return json({ error: policyErr.message }, 400)
      const p = policy as {
        found: boolean; can_refund: boolean; is_paid: boolean
        blocked_reason: string | null; refund_enabled_for_event: boolean
      }
      if (!p?.found) return json({ error: 'Ticket not found' }, 404)
      if (!p.can_refund) {
        const msg = !p.refund_enabled_for_event
          ? 'Self-service refunds are not available for this event. Contact the organiser.'
          : p.blocked_reason === 'past_refund_cutoff'
            ? 'The refund window for this event has closed. Contact the organiser.'
            : p.blocked_reason === 'checked_in'
              ? 'You have already checked in to this event.'
              : p.blocked_reason === 'event_started'
                ? 'This event has already started.'
                : 'This ticket cannot be refunded.'
        return json({ error: msg }, 403)
      }

      // Ownership is already proven by the RPC above; read the payment details.
      const { data: ticket } = await service
        .from('event_tickets')
        .select('id, status, price_cents, stripe_payment_intent_id, event_id, user_id')
        .eq('id', body.ticket_id)
        .eq('user_id', caller.id)
        .single()
      if (!ticket) return json({ error: 'Ticket not found' }, 404)

      const isPaid = !!ticket.stripe_payment_intent_id && (ticket.price_cents ?? 0) > 0

      if (isPaid) {
        try {
          await stripe.refunds.create({ payment_intent: ticket.stripe_payment_intent_id! })
        } catch (err) {
          const msg = (err as Error).message
          if (!/already been refunded|already refunded/i.test(msg)) {
            console.error('[self-service] stripe refund failed:', msg)
            return json({ error: 'Refund failed at Stripe. Your ticket is unchanged.' }, 502)
          }
        }
        // Defensive local finalise, idempotent with the charge.refunded webhook.
        // Registration + chat state is DERIVED by reconcile_ticket_membership,
        // never written blindly (see the revoke-event-ticket note, 2026-07-13).
        await service.from('event_tickets')
          .update({ status: 'refunded', updated_at: new Date().toISOString() })
          .eq('id', ticket.id)
          .in('status', ['confirmed'])
        await service.rpc('reconcile_ticket_membership', { p_event: ticket.event_id, p_user: ticket.user_id })
        return json({ ok: true, action: 'refunded', ticket_id: ticket.id })
      }

      // Free/comp ticket: cancel directly.
      await service.from('event_tickets')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', ticket.id)
        .eq('status', 'confirmed')
      await service.rpc('reconcile_ticket_membership', { p_event: ticket.event_id, p_user: ticket.user_id })
      return json({ ok: true, action: 'cancelled', ticket_id: ticket.id })
    }

    /* ---------------------------------------------------------------- */
    /*  transfer_start - offer my ticket to someone by email             */
    /* ---------------------------------------------------------------- */
    if (action === 'transfer_start') {
      if (typeof body.ticket_id !== 'string' || !UUID_RE.test(body.ticket_id)) {
        return json({ error: 'Invalid ticket' }, 400)
      }
      const toEmail = typeof body.to_email === 'string' ? body.to_email.trim().toLowerCase() : ''
      if (!EMAIL_RE.test(toEmail) || toEmail.length > 254) {
        return json({ error: 'Enter a valid email for the person taking your ticket' }, 400)
      }

      const { data: offer, error: offerErr } = await asCaller.rpc('start_my_ticket_transfer', {
        p_ticket_id: body.ticket_id,
        p_to_email: toEmail,
      })
      if (offerErr) return json({ error: offerErr.message }, 400)
      const o = offer as { transfer_id: string; token: string; event_id: string; event_title: string }

      const { data: evt } = await service
        .from('events')
        .select('title, date_start, address, cover_image_url')
        .eq('id', o.event_id)
        .single()
      const { data: fromProfile } = await service
        .from('profiles').select('display_name').eq('id', caller.id).single()

      const claimUrl = `${APP_URL}/tickets/claim-transfer/${o.token}`

      // The recipient may not have an account yet, so this cannot go through the
      // userId-keyed send-email path. Address it to the raw email instead.
      try {
        const { error: invokeErr } = await service.functions.invoke('send-email', {
          headers: { Authorization: `Bearer ${supabaseServiceKey}` },
          body: {
            type: 'ticket_transfer_offer',
            // The recipient may have no account yet, so the userId-keyed single
            // send cannot address them. The `recipients` batch form takes a raw
            // address; transactional types are not opt-out gated.
            recipients: [{
              to: toEmail,
              data: {
                name: '',
                from_name: fromProfile?.display_name ?? 'A Co-Exist member',
                event_title: evt?.title ?? 'an event',
                event_date: evt?.date_start
                  ? new Date(evt.date_start).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                  : '',
                event_location: evt?.address ?? '',
                claim_url: claimUrl,
                expires: 'in 14 days',
                cover_image_url: evt?.cover_image_url ?? '',
              },
            }],
          },
        })
        await reportInvokeError('self-service-ticket', 'send-email', invokeErr)
      } catch (err) {
        console.error('[self-service] transfer offer email failed:', (err as Error).message)
      }

      return json({ ok: true, transfer_id: o.transfer_id, to_email: toEmail })
    }

    /* ---------------------------------------------------------------- */
    /*  transfer_cancel - withdraw an offer I made                       */
    /* ---------------------------------------------------------------- */
    if (action === 'transfer_cancel') {
      if (typeof body.transfer_id !== 'string' || !UUID_RE.test(body.transfer_id)) {
        return json({ error: 'Invalid transfer' }, 400)
      }
      const { data, error } = await asCaller.rpc('cancel_my_ticket_transfer', {
        p_transfer_id: body.transfer_id,
      })
      if (error) return json({ error: error.message }, 400)
      if (data !== true) return json({ error: 'That transfer is no longer open' }, 409)
      return json({ ok: true })
    }

    /* ---------------------------------------------------------------- */
    /*  transfer_claim - claim a ticket offered to me                    */
    /* ---------------------------------------------------------------- */
    if (action === 'transfer_claim') {
      const token = typeof body.token === 'string' ? body.token.trim() : ''
      if (!token) return json({ error: 'This transfer link is not valid' }, 400)

      const { data, error } = await asCaller.rpc('claim_ticket_transfer', { p_token: token })
      if (error) return json({ error: error.message }, 400)
      const claimed = data as { ticket_id: string; event_id: string; from_user_id: string }

      // Tell the previous holder their handover landed, so a transfer never ends
      // in silence for the person who gave the ticket away.
      try {
        const { data: evt } = await service
          .from('events').select('title, date_start, address').eq('id', claimed.event_id).single()
        const { error: invokeErr } = await service.functions.invoke('send-email', {
          headers: { Authorization: `Bearer ${supabaseServiceKey}` },
          body: {
            type: 'ticket_transferred',
            userId: claimed.from_user_id,
            data: {
              name: '',
              event_title: evt?.title ?? 'the event',
              event_date: evt?.date_start
                ? new Date(evt.date_start).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                : '',
              event_location: evt?.address ?? '',
              event_url: `${APP_URL}/events/${claimed.event_id}`,
            },
          },
        })
        await reportInvokeError('self-service-ticket', 'send-email', invokeErr)
      } catch (err) {
        console.error('[self-service] handover notice failed:', (err as Error).message)
      }

      return json({ ok: true, ticket_id: claimed.ticket_id, event_id: claimed.event_id })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    console.error('[self-service] error:', (err as Error).message)
    return json({ error: 'Something went wrong' }, 500)
  }
}))
