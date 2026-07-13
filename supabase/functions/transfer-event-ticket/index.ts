/**
 * transfer-event-ticket - Supabase Edge Function (authed; managers + admins only)
 *
 * Moves an existing ticket from one event to another. The ticket travels with
 * the holder: same ticket row, same price_cents, same Stripe payment intent.
 *
 *   NO refund is issued. NO repurchase happens. The money stays exactly where
 *   it is in Stripe. This function never calls the Stripe API, and it never
 *   fires refund_confirmation.
 *
 * Two modes, one code path:
 *   - Single: { ticket_id, target_event_id }
 *   - Bulk:   { source_event_id, target_event_id }  -> every live ticket on the
 *             source event is moved through the SAME transferOne() path.
 *
 * The heavy lifting is transfer_event_ticket() in Postgres (migration
 * 20260713000000): it locks the ticket, checks the target event + ticket type,
 * enforces target capacity unless override_capacity is set, moves the row, and
 * reconciles BOTH events. That last part is the trap: the reconcile trigger
 * used to fire only on a status change, so a bare event_id UPDATE left the
 * attendee sitting in the old campout group chat with a live registration on an
 * event they were no longer attending. The trigger now fires on event_id too,
 * and the RPC reconciles both sides explicitly.
 *
 * Every moved attendee is emailed a ticket_transferred notice with the new
 * event's date and location, unless notify:false.
 *
 * Input:  { ticket_id? , source_event_id?, target_event_id, target_ticket_type_id?,
 *           override_capacity?, notify? }
 * Auth:   caller JWT; caller's role must be manager|admin.
 * Returns:{ ok, moved, skipped, failed, results[] }
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
const LIVE = ['confirmed', 'checked_in']

interface TransferResult {
  ticket_id: string
  user_id?: string
  ok: boolean
  skipped?: boolean
  reason?: string
  error?: string
}

interface EventRow {
  id: string
  title: string | null
  date_start: string | null
  address: string | null
  is_ticketed: boolean | null
  status: string | null
}

function formatEventDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

Deno.serve(withSentry('transfer-event-ticket', async (req: Request) => {
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
      return json({ error: 'Only managers and admins can move tickets' }, 403)
    }

    // ---- Validate input ----
    const body = await req.json()
    const targetEventId = body.target_event_id
    if (typeof targetEventId !== 'string' || !UUID_RE.test(targetEventId)) {
      return json({ error: 'Invalid target event' }, 400)
    }
    const singleTicketId = typeof body.ticket_id === 'string' && UUID_RE.test(body.ticket_id) ? body.ticket_id : null
    const sourceEventId = typeof body.source_event_id === 'string' && UUID_RE.test(body.source_event_id) ? body.source_event_id : null
    if (!singleTicketId && !sourceEventId) {
      return json({ error: 'Pass either a ticket_id or a source_event_id' }, 400)
    }
    if (sourceEventId && sourceEventId === targetEventId) {
      return json({ error: 'Source and target events are the same' }, 400)
    }
    const targetTypeId = typeof body.target_ticket_type_id === 'string' && UUID_RE.test(body.target_ticket_type_id)
      ? body.target_ticket_type_id
      : null
    const overrideCapacity = body.override_capacity === true
    const notify = body.notify !== false // default true

    // ---- Load the target event once (also used in the email) ----
    const { data: targetEvt } = await supabase
      .from('events')
      .select('id, title, date_start, address, is_ticketed, status')
      .eq('id', targetEventId)
      .single<EventRow>()
    if (!targetEvt) return json({ error: 'Target event not found' }, 404)
    if (!targetEvt.is_ticketed) return json({ error: 'The target event does not use tickets' }, 400)
    if (targetEvt.status === 'cancelled') return json({ error: 'The target event is cancelled' }, 400)

    // ---- Build the work list ----
    let ticketIds: string[]
    if (singleTicketId) {
      ticketIds = [singleTicketId]
    } else {
      const { data: rows, error: listErr } = await supabase
        .from('event_tickets')
        .select('id')
        .eq('event_id', sourceEventId!)
        .in('status', LIVE)
        .order('created_at', { ascending: true })
      if (listErr) {
        console.error('[transfer] roster load failed:', listErr.message)
        return json({ error: 'Could not load the roster' }, 500)
      }
      ticketIds = (rows ?? []).map((r) => r.id as string)
      if (ticketIds.length === 0) {
        return json({ ok: true, moved: 0, skipped: 0, failed: 0, results: [] })
      }
    }

    // ---- The single path. Bulk is just this in a loop. ----
    async function transferOne(ticketId: string): Promise<TransferResult> {
      const { data, error } = await supabase.rpc('transfer_event_ticket', {
        p_ticket_id: ticketId,
        p_target_event_id: targetEventId,
        p_target_ticket_type_id: targetTypeId,
        p_override_capacity: overrideCapacity,
      })
      if (error) {
        console.error('[transfer] rpc failed for', ticketId, error.message)
        return { ticket_id: ticketId, ok: false, error: error.message }
      }
      const r = (data ?? {}) as {
        ok?: boolean; skipped?: boolean; reason?: string; user_id?: string
        from_event_id?: string; ticket_code?: string
      }
      if (r.skipped) {
        return { ticket_id: ticketId, user_id: r.user_id, ok: true, skipped: true, reason: r.reason }
      }

      // ---- Notify the attendee that their ticket moved ----
      if (notify && r.user_id) {
        try {
          let fromTitle = ''
          if (r.from_event_id) {
            const { data: fromEvt } = await supabase
              .from('events').select('title').eq('id', r.from_event_id).maybeSingle()
            fromTitle = (fromEvt?.title as string) ?? ''
          }
          await supabase.functions.invoke('send-email', {
            body: {
              type: 'ticket_transferred',
              userId: r.user_id,
              data: {
                name: '',
                event_title: targetEvt!.title ?? 'Event',
                event_date: formatEventDate(targetEvt!.date_start),
                event_location: targetEvt!.address ?? '',
                previous_event_title: fromTitle,
                ticket_code: r.ticket_code ?? '',
                event_url: `${APP_URL}/events/${targetEventId}`,
              },
            },
          })
        } catch (err) {
          // A failed email must not roll back a completed move.
          console.error('[transfer] send-email failed:', (err as Error).message)
        }
      }

      return { ticket_id: ticketId, user_id: r.user_id, ok: true, skipped: false }
    }

    const results: TransferResult[] = []
    for (const id of ticketIds) {
      results.push(await transferOne(id))
    }

    const moved = results.filter((r) => r.ok && !r.skipped).length
    const skipped = results.filter((r) => r.ok && r.skipped).length
    const failed = results.filter((r) => !r.ok).length

    // A single-ticket call surfaces its error to the caller; a bulk call reports
    // per-ticket outcomes and keeps going.
    if (singleTicketId && failed > 0) {
      return json({ error: results[0].error ?? 'Could not move the ticket' }, 400)
    }

    return json({ ok: true, moved, skipped, failed, results })
  } catch (err) {
    console.error('[transfer] error:', (err as Error).message)
    return json({ error: 'Something went wrong' }, 500)
  }
}))
