// Deno Edge Function
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { withSentry } from '../_shared/sentry.ts'
import { runResaleRefundSweep, type ResaleSweepResult } from '../_shared/resale-refunds.ts'

/**
 * waitlist-notify - scheduled sweep for the ticketed-event waitlist.
 *
 * Called by pg_cron every 5 minutes (`cron_waitlist_notify`). Asks
 * `waitlist_drain_candidates()` who should be told a spot opened, emails them,
 * then stamps `notified_at` through `mark_waitlist_notified`.
 *
 * WHY A SWEEP AND NOT A HOOK ON EACH FREEING PATH: a seat comes back from
 * refund-order, cancel_my_pending_ticket, expire_stale_pending_tickets,
 * expire_lapsed_ticket_holds, release_ticket_hold, transfer-event-ticket,
 * revoke-event-ticket, or an organiser simply raising capacity. Wiring eight
 * call sites guarantees the ninth is missed. A sweep covers every path that
 * exists and every path added later, and it self-heals after an outage instead
 * of losing the notifications that should have fired during it.
 *
 * THE STAMP FOLLOWS THE SEND, NEVER PRECEDES IT. If Resend fails, the person
 * stays un-notified and the next sweep retries them. Stamping first would drop
 * someone out of the queue silently, which is the failure this whole feature
 * exists to prevent.
 *
 * MANUAL MODE: POST { event_id, force: true } emails everyone still waiting on
 * one event regardless of native availability. That is the only route for an
 * event whose tickets sold out on Eventbrite (`event_extras.sold_out`), where
 * native seats never reopen and the automatic path correctly never fires.
 * Requires the service role or an event organiser.
 *
 * RELEASE-ON-RESALE REFUNDS RIDE THIS SWEEP (2026-09-27). A member who released
 * their ticket inside the refund cutoff is refunded once someone else buys a
 * paid ticket; claim_resale_refunds() pairs them and _shared/resale-refunds.ts
 * moves the money. It runs FIRST on every fire and inside its own try/catch, so
 * a Stripe or pairing failure can never stop a waitlist offer. Every response
 * carries a `resale` field, which is also how a deploy is proven: a fire whose
 * body has no `resale` key ran the old build.
 */

const APP_URL = 'https://app.coexistaus.org'
const OFFER_HOURS = 24

interface Candidate {
  waitlist_id: string
  event_id: string
  event_title: string
  date_start: string
  user_id: string | null
  email: string
  name: string | null
  quantity: number
  queue_position: number
  free_seats: number
}

/**
 * Pay out any release-on-resale refund that is now owed. Never throws: the
 * waitlist offers below matter more than this, and a refund that fails here is
 * retried by the next fire five minutes later.
 */
async function sweepResaleRefunds(supabase: SupabaseClient): Promise<ResaleSweepResult | { error: string }> {
  try {
    const key = Deno.env.get('STRIPE_SECRET_KEY')
    if (!key) return { error: 'STRIPE_SECRET_KEY not set' }
    const stripe = new Stripe(key, { apiVersion: '2024-04-10' })
    const result = await runResaleRefundSweep({
      claim: () => supabase.rpc('claim_resale_refunds', { p_event_id: null }),
      refund: (paymentIntentId) => stripe.refunds.create({ payment_intent: paymentIntentId }),
      markRefunded: (ticketId, nowIso) =>
        supabase.from('event_tickets')
          .update({ resale_refunded_at: nowIso })
          .eq('id', ticketId)
          .is('resale_refunded_at', null),
      releaseClaim: (ticketId, nowIso) =>
        supabase.from('event_tickets')
          .update({ resold_by_ticket_id: null, updated_at: nowIso })
          .eq('id', ticketId)
          .is('resale_refunded_at', null),
    })
    if (result.claimed > 0 || result.errors.length > 0) {
      console.log(`[waitlist-notify] resale refunds: ${JSON.stringify(result)}`)
    }
    return result
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err)
    console.error('[waitlist-notify] resale refund sweep threw:', msg)
    return { error: msg }
  }
}

/** Wall-clock-as-UTC, matching how the rest of the app formats event dates. */
function formatEventLong(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC',
  }).format(d)
}

Deno.serve(withSentry('waitlist-notify', async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Refunds owed on released tickets first. Isolated: it cannot throw.
  const resale = await sweepResaleRefunds(supabase)

  let eventId: string | null = null
  let force = false
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      eventId = typeof body?.event_id === 'string' ? body.event_id : null
      force = body?.force === true
    } catch {
      // A pg_cron call posts an empty body. Not an error.
    }
  }

  // Forcing a blast is an organiser decision, not something the queue does on
  // its own, so it must name one event. A force with no event_id would email
  // every waiting person on every sold-out event at once.
  if (force && !eventId) {
    return json({ error: 'force requires an event_id', resale }, 400)
  }

  const { data, error } = await supabase.rpc('waitlist_drain_candidates', {
    p_event_id: eventId,
    p_force: force,
  })
  if (error) {
    console.error('[waitlist-notify] drain query failed:', error.message)
    return json({ error: error.message, resale }, 500)
  }

  const candidates = (data ?? []) as Candidate[]
  if (candidates.length === 0) {
    return json({ ok: true, notified: 0, reason: 'nobody to notify', resale })
  }

  // One batch send per event: N recipients cost ceil(N/100) Resend calls, the
  // same path the host reminder uses, never a fan-out of N invocations.
  const byEvent = new Map<string, Candidate[]>()
  for (const c of candidates) {
    const list = byEvent.get(c.event_id) ?? []
    list.push(c)
    byEvent.set(c.event_id, list)
  }

  let notified = 0
  const failures: string[] = []

  for (const [evId, group] of byEvent) {
    const eventUrl = `${APP_URL}/events/${evId}`
    const recipients = group.map((c) => ({
      // Present only for a member who joined signed in. A guest has no account
      // yet (one is minted at checkout, not at interest), so the send is
      // addressed by email alone and skips the preference lookup, which is
      // correct: they asked for exactly this message.
      ...(c.user_id ? { userId: c.user_id } : {}),
      to: c.email,
      data: {
        name: c.name || 'there',
        event_title: c.event_title,
        event_date: formatEventLong(c.date_start),
        event_url: eventUrl,
        hours_to_claim: OFFER_HOURS,
      },
    }))

    // The Authorization header is EXPLICIT and load-bearing. A client built
    // with the service-role key does not put that key on an invoke() call by
    // itself: it forwards whatever session token it holds, which here is none,
    // and send-email's own bearer check then rejects the request. Every proven
    // sweep in this project (event-reminders) passes the header for exactly
    // this reason. Measured on the first live fire, 2026-09-05: the sweep
    // found its candidate, the send returned an error, nobody was notified.
    const { data: sendResult, error: sendErr } = await supabase.functions.invoke('send-email', {
      headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}` },
      body: { type: 'waitlist_spot_open', recipients },
    })

    if (sendErr) {
      console.error(`[waitlist-notify] send failed for event ${evId}:`, sendErr.message)
      // Carry the reason out to the caller. A sweep that reports "failed" with
      // no cause makes the operator re-derive it from function logs that are
      // not always reachable.
      failures.push(`${evId}: send ${sendErr.message}`)
      continue  // leave them un-notified so the next sweep retries
    }

    const { error: markErr } = await supabase.rpc('mark_waitlist_notified', {
      p_waitlist_ids: group.map((c) => c.waitlist_id),
    })
    if (markErr) {
      // The email went out but the stamp did not. Say so loudly: the next
      // sweep will email them again, which is a duplicate, not a silent drop.
      console.error(`[waitlist-notify] STAMP FAILED after sending for event ${evId}:`, markErr.message)
      failures.push(`${evId}: stamp ${markErr.message}`)
      continue
    }

    notified += group.length
    console.log(`[waitlist-notify] event ${evId}: notified ${group.length}, sendResult=${JSON.stringify(sendResult ?? {})}`)

    // Push rides with the email for anyone who has an account, the same way
    // the host reminder does. Best effort: a push failure never blocks the
    // email that already landed.
    const pushUserIds = group.map((c) => c.user_id).filter((u): u is string => !!u)
    if (pushUserIds.length > 0) {
      const title = group[0].event_title
      await supabase.functions.invoke('send-push', {
        headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}` },
        body: {
          userIds: pushUserIds,
          title: 'A spot opened up',
          body: `A ticket came back for ${title}. First in, best dressed.`,
          data: { type: 'waitlist_spot_open', event_id: evId, url: `/events/${evId}` },
        },
      }).catch((e: Error) => console.error('[waitlist-notify] push failed:', e.message))

      await supabase.from('notifications').insert(
        pushUserIds.map((uid) => ({
          user_id: uid,
          type: 'event_reminder',
          title: 'A spot opened up',
          body: `A ticket came back for ${title}.`,
          data: { event_id: evId, kind: 'waitlist_spot_open' },
          // `read` is NOT a column on this table: unread is read_at IS NULL,
          // which is the default. Naming it here makes PostgREST reject the
          // whole batch with PGRST204 (paid for on 2026-09-05, commit e2532ba7).
        })),
      )
    }
  }

  return json({ ok: failures.length === 0, notified, events: byEvent.size, failures, resale })
}))
