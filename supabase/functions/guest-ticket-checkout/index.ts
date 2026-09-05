/**
 * guest-ticket-checkout - Supabase Edge Function (PUBLIC, no auth)
 *
 * Lets someone buy an event ticket with just an email, no account signup.
 * Flow:
 *   1. Validate the event + ticket type (published, ticketed, public, on sale).
 *   2. Resolve the buyer's account by email; if none, create a shell account
 *      (email_confirm=true, random password). The handle_new_user() trigger
 *      makes their profile. Existing members reuse their account.
 *   3. Reserve a ticket atomically via the SAME reserve_event_ticket rpc the
 *      authed flow uses (capacity-checked, 15-min pending expiry).
 *   4. Generate a single-use magic link to the ticket page and use it as the
 *      Stripe success_url, so the buyer returns already signed in.
 *   5. Create the Stripe Checkout session (metadata.guest='true' so the webhook
 *      sends a magic-link confirmation email instead of an auth-gated one).
 *
 * The webhook (stripe-webhook) then confirms the ticket, creates the
 * registration, and the sync_campout_chat_membership trigger auto-joins the
 * campout group chat. Returns { url } for the client to redirect to Stripe.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { withSentry } from '../_shared/sentry.ts'
import { routeReserveError } from '../_shared/reserve-error.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
})

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Where the app (and the ticket page) actually lives. The marketing site links
// here; magic-link redirects must land on the app origin, not the referrer.
const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.coexistaus.org'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** event_extras.sold_out === true closes native sales (claim link still works). */
function isSoldOut(extras: unknown): boolean {
  return !!extras && typeof extras === 'object' && (extras as Record<string, unknown>).sold_out === true
}

Deno.serve(withSentry('guest-ticket-checkout', async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const body = await req.json()
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ---- Validate input ----
    if (typeof body.event_id !== 'string' || !UUID_RE.test(body.event_id)) {
      return json({ error: 'Invalid event_id' }, 400)
    }
    if (typeof body.ticket_type_id !== 'string' || !UUID_RE.test(body.ticket_type_id)) {
      return json({ error: 'Invalid ticket_type_id' }, 400)
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return json({ error: 'A valid email is required' }, 400)
    }
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : ''
    const qty = typeof body.quantity === 'number' ? Math.max(1, Math.min(10, Math.floor(body.quantity))) : 1
    // Safety info collected on the public booking form (optional in the
    // request shape; hard-enforced below for every ticketed event).
    const dietaryIn = typeof body.dietary === 'string' ? body.dietary.trim().slice(0, 500) : ''
    const medicalIn = typeof body.medical === 'string' ? body.medical.trim().slice(0, 500) : ''
    // Emergency contact. Kurt 2026-08-25: "half of the people don't have their
    // emergency contacts on there so I'm having to email many people
    // individually". Dietary + medical were already gated here; the emergency
    // contact was the one piece of the retreat safety set nobody was asked for.
    const emergencyNameIn = typeof body.emergency_name === 'string' ? body.emergency_name.trim().slice(0, 120) : ''
    const emergencyPhoneIn = typeof body.emergency_phone === 'string' ? body.emergency_phone.trim().slice(0, 40) : ''
    const emergencyRelIn = typeof body.emergency_relationship === 'string' ? body.emergency_relationship.trim().slice(0, 80) : ''

    // ---- Verify event ----
    const { data: evt, error: evtErr } = await supabase
      .from('events')
      .select('id, title, is_ticketed, is_public, status, cover_image_url, event_extras, activity_type')
      .eq('id', body.event_id)
      .single()
    if (evtErr || !evt) return json({ error: 'Event not found' }, 404)
    if (!evt.is_ticketed) return json({ error: 'This event does not require tickets' }, 400)
    if (!evt.is_public) return json({ error: 'This event is not open to the public' }, 400)
    if (evt.status !== 'published') return json({ error: 'Event is not open for registration' }, 400)
    // Sold out on an external platform (e.g. Eventbrite): native sales are
    // closed. The per-event claim link bypasses checkout entirely, so blocking
    // here cannot lock out a legitimate invitee. This is the server-side choke
    // point that stops EVERY buy surface (campout pages, public event page),
    // not just the ones with a UI gate.
    if (isSoldOut(evt.event_extras)) {
      return json({ error: 'This campout is sold out. If the organisers sent you a claim link, open it to grab your ticket.' }, 409)
    }

    // ---- Verify ticket type + sale window ----
    const { data: tt, error: ttErr } = await supabase
      .from('event_ticket_types')
      .select('id, name, price_cents, sale_start, sale_end, is_active')
      .eq('id', body.ticket_type_id)
      .eq('event_id', body.event_id)
      .single()
    if (ttErr || !tt) return json({ error: 'Ticket type not found' }, 404)
    if (!tt.is_active) return json({ error: 'This ticket type is no longer available' }, 400)
    const now = new Date()
    if (tt.sale_start && now < new Date(tt.sale_start)) return json({ error: 'Tickets are not on sale yet' }, 400)
    if (tt.sale_end && now > new Date(tt.sale_end)) return json({ error: 'Ticket sales have ended' }, 400)

    // ---- Resolve or provision the buyer's account ----
    // Direct auth.users lookup via a service-role-only RPC. The old
    // listUsers({perPage:200}) only saw the first page, so an existing account
    // beyond it was missed and createUser then 500'd on a duplicate email - the
    // exact "email already linked" failure an authed person hits buying as a guest.
    let userId: string | null = null
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
      } else {
        // Defensive: a race (or an account the RPC somehow missed) makes
        // createUser fail on a duplicate. Re-resolve and reuse rather than 500.
        const { data: retryId } = await supabase.rpc('get_auth_user_id_by_email', { p_email: email })
        if (retryId) {
          userId = retryId as string
        } else {
          console.error('[guest-checkout] createUser failed:', createErr?.message)
          return json({ error: 'Could not start checkout. Please try again.' }, 500)
        }
      }
    }

    // ---- Ticket safety gate (server-side choke-point) ----
    // Dietary + medical/allergy info + emergency contact are a hard
    // pre-checkout requirement for
    // EVERY ticketed event (Angelica, 2026-07-08 for camp-outs; broadened to
    // all ticketed events 2026-08-12 so leaders always hold safety + catering
    // data for every ticket holder). The authed flow gates on it via
    // CampoutRequirementsModal; enforce here too so NO buy surface can bypass
    // it, and persist onto the (just-provisioned or existing) profile. Every
    // request that reaches here is already for an is_ticketed event (guarded
    // above). Fill missing fields ONLY: never overwrite a returning member's
    // existing safety data with a hurried public answer.
    {
      const { data: prof } = await supabase
        .from('profiles')
        .select('dietary_requirements, medical_requirements, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship')
        .eq('id', userId)
        .maybeSingle()
      const needDietary = !(prof?.dietary_requirements ?? '').trim()
      const needMedical = !(prof?.medical_requirements ?? '').trim()
      // An emergency contact is only useful if we can actually reach them, so
      // name AND phone are both required; relationship is a nice-to-have.
      const needEmergency = !(prof?.emergency_contact_name ?? '').trim()
        || !(prof?.emergency_contact_phone ?? '').trim()
      if ((needDietary && !dietaryIn) || (needMedical && !medicalIn)) {
        return json({ error: 'We need your dietary and medical/allergy info before you can book.' }, 400)
      }
      if (needEmergency && (!emergencyNameIn || !emergencyPhoneIn)) {
        return json({ error: 'We need an emergency contact name and phone before you can book.' }, 400)
      }
      const profUpdates: {
        dietary_requirements?: string
        medical_requirements?: string
        emergency_contact_name?: string
        emergency_contact_phone?: string
        emergency_contact_relationship?: string
      } = {}
      if (needDietary && dietaryIn) profUpdates.dietary_requirements = dietaryIn
      if (needMedical && medicalIn) profUpdates.medical_requirements = medicalIn
      if (needEmergency && emergencyNameIn) profUpdates.emergency_contact_name = emergencyNameIn
      if (needEmergency && emergencyPhoneIn) profUpdates.emergency_contact_phone = emergencyPhoneIn
      if (needEmergency && emergencyRelIn) profUpdates.emergency_contact_relationship = emergencyRelIn
      if (Object.keys(profUpdates).length > 0) {
        const { error: profErr } = await supabase.from('profiles').update(profUpdates).eq('id', userId)
        if (profErr) {
          console.error('[guest-checkout] profile safety update failed:', profErr.message)
          return json({ error: 'Could not save your details. Please try again.' }, 500)
        }
      }
    }

    // ---- Lightweight abuse guard: cap recent reservations per buyer ----
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: recentCount } = await supabase
      .from('event_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', oneHourAgo)
    if ((recentCount ?? 0) >= 8) {
      return json({ error: 'Too many checkout attempts. Please try again later.' }, 429)
    }

    // ---- Block a second live ticket for the same person (duplicate guard) ----
    const { data: dupTicket } = await supabase
      .from('event_tickets')
      .select('id')
      .eq('event_id', body.event_id)
      .eq('user_id', userId)
      .in('status', ['confirmed', 'checked_in'])
      .maybeSingle()
    if (dupTicket) return json({ error: 'You already have a ticket for this event' }, 409)

    // ---- Reserve the ticket (same atomic rpc the authed flow uses) ----
    const { data: ticketId, error: reserveErr } = await supabase.rpc('reserve_event_ticket', {
      p_event_id: body.event_id,
      p_ticket_type_id: body.ticket_type_id,
      p_user_id: userId,
      p_quantity: qty,
      p_answers: (body.answers && typeof body.answers === 'object') ? body.answers : null,
    })
    if (reserveErr) {
      const route = routeReserveError(reserveErr)
      if (route.unmapped) {
        console.error('[guest-checkout] reserve_event_ticket failed:', reserveErr.code, reserveErr.message)
      }
      return json({ error: route.message }, route.status)
    }

    // ---- Single-use magic link to the ticket page = instant login on return ----
    const ticketPath = `/events/${body.event_id}/ticket-confirmation?ticket_id=${ticketId}`
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${APP_URL}${ticketPath}` },
    })
    if (linkErr || !linkData?.properties?.action_link) {
      console.error('[guest-checkout] generateLink failed:', linkErr?.message)
      return json({ error: 'Could not start checkout. Please try again.' }, 500)
    }
    const successUrl = linkData.properties.action_link

    // ---- Stripe Checkout session ----
    // Promo codes are enabled only on event-ticket sessions (tickets only,
    // never donations/merch). A 100%-off code makes amount_total 0; Stripe
    // still completes the session and the webhook confirms it.
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      allow_promotion_codes: true,
      line_items: [
        {
          price_data: {
            currency: 'aud',
            product_data: {
              name: `${evt.title} - ${tt.name}`,
              ...(evt.cover_image_url ? { images: [evt.cover_image_url] } : {}),
            },
            unit_amount: tt.price_cents,
          },
          quantity: qty,
        },
      ],
      success_url: successUrl,
      cancel_url: `${APP_URL}/event/${body.event_id}`,
      metadata: {
        type: 'event_ticket',
        ticket_id: String(ticketId),
        event_id: body.event_id,
        ticket_type_id: body.ticket_type_id,
        user_id: userId,
        quantity: String(qty),
        guest: 'true',
      },
    })

    // Persist the session id for webhook traceability + refund lookups.
    await supabase
      .from('event_tickets')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', ticketId)

    return json({ url: session.url })
  } catch (err) {
    console.error('[guest-checkout] error:', (err as Error).message)
    return json({ error: 'Checkout failed' }, 500)
  }
}))
