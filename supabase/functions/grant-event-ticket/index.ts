/**
 * grant-event-ticket - Supabase Edge Function (authed; managers + admins only)
 *
 * Lets a manager or admin issue a FREE confirmed ticket to someone ahead of
 * time - like a day-of walk-in, but before the event. The recipient is
 * resolved by an existing user_id (picked from search) or provisioned by email
 * (a shell account, same as guest checkout). We insert a $0 confirmed ticket
 * (bypassing capacity, like the claim flow), create the event_registration, and
 * the sync_campout_chat_membership trigger auto-joins them to the campout group
 * chat. If notify is set we email them a ticket confirmation (a single-use
 * magic link when we just created their account, so they can actually get in).
 *
 * Input:  { event_id, email?, name?, user_id?, notify? }
 * Auth:   caller's JWT in Authorization; caller's role must be manager|admin.
 * Returns:{ ticket_id, already, user_id, created_account }
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
const APP_URL = Deno.env.get('APP_URL') ?? 'https://app.coexistaus.org'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function ticketCode(): string {
  // 8-char A-Z2-9 ticket code (no ambiguous chars), matching the claim flow.
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => alpha[b % alpha.length]).join('')
}

Deno.serve(withSentry('grant-event-ticket', async (req: Request) => {
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
    const callerRole = callerProfile?.role
    if (callerRole !== 'manager' && callerRole !== 'admin') {
      return json({ error: 'Only managers and admins can issue tickets' }, 403)
    }

    // ---- Validate input ----
    const body = await req.json()
    if (typeof body.event_id !== 'string' || !UUID_RE.test(body.event_id)) return json({ error: 'Invalid event' }, 400)
    const givenUserId = typeof body.user_id === 'string' && UUID_RE.test(body.user_id) ? body.user_id : null
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : ''
    const notify = body.notify !== false // default true
    if (!givenUserId && (!EMAIL_RE.test(email) || email.length > 254)) {
      return json({ error: 'A valid email or an existing user is required' }, 400)
    }

    // ---- Verify the event is ticketed ----
    const { data: evt } = await supabase
      .from('events')
      .select('id, title, date_start, address, is_ticketed, status')
      .eq('id', body.event_id)
      .single()
    if (!evt) return json({ error: 'Event not found' }, 404)
    if (!evt.is_ticketed) return json({ error: 'This event does not use tickets' }, 400)

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

    // ---- Resolve or provision the recipient ----
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
            console.error('[grant] createUser failed:', createErr?.message)
            return json({ error: 'Could not create the recipient account' }, 500)
          }
        }
      }
    }
    if (!userId) return json({ error: 'Could not resolve the recipient' }, 500)

    // ---- Idempotency: reuse an existing LIVE ticket ----
    // LIVE, not the inline `['pending', 'confirmed', 'checked_in']` this
    // replaces. That list predates `reserved`, so comping someone who already
    // held an organiser hold did not match, and a SECOND row was inserted.
    // Both rows are spot-taking, so the recipient occupied two seats on an
    // event the hold existed to keep them a single seat on.
    //
    // No `.maybeSingle()`: it errors rather than returning a row when two match,
    // the error was dropped here, and the fall-through was to INSERT, adding a
    // third seat to anyone the bug above already doubled.
    const { data: liveTickets } = await supabase
      .from('event_tickets')
      .select('id, status, ticket_code')
      .eq('event_id', body.event_id)
      .eq('user_id', userId)
      .in('status', LIVE_TICKET_STATUSES)
    const existing = pickTicketToReuse(liveTickets)

    let ticketId: string | null = null
    let ticketCodeValue: string | null = null
    let already = false

    if (existing) {
      already = true
      ticketId = existing.id
      ticketCodeValue = existing.ticket_code
      // Settle an UNSETTLED seat: `pending` (mid-checkout) and `reserved` (an
      // organiser hold) alike. A staff comp is an unambiguous decision to give
      // this person a free seat, so leaving the hold would keep them owing the
      // full price on a ticket the organiser believes they have just been given.
      //
      // The `.in()` on the UPDATE is an optimistic lock, and it is load-bearing:
      // without it, a Stripe webhook confirming this row between the select and
      // the update would be overwritten to price_cents 0, erasing the record of
      // a payment the recipient actually made.
      //
      // DELIBERATE NON-CHANGE: `notify` still fires only when a ticket was
      // newly created (`notify && !already`), so promoting a hold sends no
      // email. Emailing on promotion is arguably right (their outstanding
      // balance just vanished) but that is an outbound-comms product decision,
      // not part of this double-seat fix, and it would mail real members on the
      // first deploy. Recorded as a follow-up rather than smuggled in here.
      if (isUnsettledTicketStatus(existing.status)) {
        await supabase.from('event_tickets')
          .update({ status: 'confirmed', price_cents: 0, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .in('status', UNSETTLED_TICKET_STATUSES)
      }
    } else {
      // ---- Insert a free confirmed ticket (bypasses capacity, like the claim flow) ----
      // COMP EXEMPTION (D6, backlog:478): grant deliberately does NOT run
      // validate_ticket_answers. This is a staff-initiated comp with no answer
      // UI in the issue sheet; the genuine safety data (dietary + medical) is a
      // profile field enforced app-wide by the path-agnostic DietaryGate for any
      // live-ticket holder, NOT an event_ticket_question, so the comped recipient
      // is still caught for dietary/medical. The exempted required questions are
      // logistics/consent. Answers passed in body.answers are stored verbatim.
      for (let attempt = 0; attempt < 4 && !ticketId; attempt++) {
        const codeVal = ticketCode()
        const { data: inserted, error: insErr } = await supabase
          .from('event_tickets')
          .insert({
            event_id: body.event_id,
            ticket_type_id: tt.id,
            user_id: userId,
            status: 'confirmed',
            price_cents: 0,
            quantity: 1,
            ticket_code: codeVal,
            custom_answers: (body.answers && typeof body.answers === 'object') ? body.answers : {},
          })
          .select('id')
          .single()
        if (!insErr && inserted) { ticketId = inserted.id; ticketCodeValue = codeVal; break }
        if (insErr && !String(insErr.message).includes('ticket_code')) {
          console.error('[grant] insert failed:', insErr.message)
          return json({ error: 'Could not create the ticket' }, 500)
        }
      }
      if (!ticketId) return json({ error: 'Could not create the ticket' }, 500)
    }

    // event_registration so they appear as attending (chat join is handled by
    // the sync_campout_chat_membership trigger on the confirmed ticket).
    await supabase.from('event_registrations')
      .upsert({ event_id: body.event_id, user_id: userId, status: 'registered' }, { onConflict: 'event_id,user_id' })

    // ---- Notify the recipient (magic link when the account is brand new) ----
    if (notify && !already) {
      const ticketPath = `/events/${body.event_id}/ticket-confirmation?ticket_id=${ticketId}`
      let ticketUrl = `${APP_URL}${ticketPath}`
      if (createdAccount) {
        const { data: u } = await supabase.auth.admin.getUserById(userId)
        const recipientEmail = u?.user?.email
        if (recipientEmail) {
          const { data: magic } = await supabase.auth.admin.generateLink({
            type: 'magiclink',
            email: recipientEmail,
            options: { redirectTo: `${APP_URL}${ticketPath}` },
          })
          if (magic?.properties?.action_link) ticketUrl = magic.properties.action_link
        }
      }
      try {
        await supabase.functions.invoke('send-email', {
          headers: { Authorization: `Bearer ${supabaseServiceKey}` },
          body: {
            type: 'ticket_confirmation',
            userId,
            data: {
              name: '',
              event_title: evt.title ?? 'Event',
              event_date: evt.date_start
                ? new Date(evt.date_start).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                : '',
              event_location: evt.address ?? '',
              ticket_code: ticketCodeValue ?? '',
              quantity: 1,
              amount: '0.00',
              currency: 'AUD',
              ticket_url: ticketUrl,
            },
          },
        })
      } catch (err) {
        console.error('[grant] send-email failed:', (err as Error).message)
      }
    }

    return json({ ticket_id: ticketId, already, user_id: userId, created_account: createdAccount })
  } catch (err) {
    console.error('[grant] error:', (err as Error).message)
    return json({ error: 'Something went wrong' }, 500)
  }
}))
