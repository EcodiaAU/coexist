/* eslint-disable @typescript-eslint/no-explicit-any */
// Deno Edge Function - Resend delivery-event webhook.
//
// Ingests Resend webhook events (email.sent/delivered/bounced/opened/clicked/
// complained/delivery_delayed) into public.resend_events, correlates them back
// to campaign_recipients via resend_message_id, and suppresses hard-bounced /
// complained addresses so future campaigns skip them.
//
// Deploy with --no-verify-jwt (Resend does not send a Supabase JWT); auth is the
// Svix signature instead. Set RESEND_WEBHOOK_SECRET (whsec_...) from the Resend
// dashboard when the webhook endpoint is created.
//
// Origin: 2026-08-12 investigation - email_events was dead SendGrid-era infra
// with no handler, so delivered/bounced/opened were invisible.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { refundReleaseTarget } from '../_shared/refund-bounce-release.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_SECRET = Deno.env.get('RESEND_WEBHOOK_SECRET') ?? ''

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const buf = new ArrayBuffer(bin.length)
  const arr = new Uint8Array(buf)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return buf
}
function strToBuf(s: string): ArrayBuffer {
  const u = new TextEncoder().encode(s)
  const buf = new ArrayBuffer(u.byteLength)
  new Uint8Array(buf).set(u)
  return buf
}
function abToB64(buf: ArrayBuffer): string {
  const arr = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i])
  return btoa(bin)
}

// Svix signature verification (Resend signs webhooks with Svix).
async function verifySvix(body: string, headers: Headers, secret: string): Promise<boolean> {
  const id = headers.get('svix-id')
  const ts = headers.get('svix-timestamp')
  const sigHeader = headers.get('svix-signature')
  if (!id || !ts || !sigHeader) return false
  // Reject stale timestamps (>5 min) to blunt replay.
  const now = Math.floor(Date.now() / 1000)
  if (!Number.isFinite(Number(ts)) || Math.abs(now - Number(ts)) > 300) return false
  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret
  const key = await crypto.subtle.importKey(
    'raw',
    b64ToBuf(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = `${id}.${ts}.${body}`
  const expected = abToB64(await crypto.subtle.sign('HMAC', key, strToBuf(signed)))
  // Header is a space-delimited list of "v1,<base64sig>" tokens.
  return sigHeader.split(' ').some((part) => {
    const idx = part.indexOf(',')
    return idx !== -1 && part.slice(idx + 1) === expected
  })
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const body = await req.text()

  // Fail closed: without a configured secret we cannot authenticate the sender,
  // and this endpoint writes to the DB from an external POST.
  if (!WEBHOOK_SECRET) return new Response('webhook secret not configured', { status: 503 })
  if (!(await verifySvix(body, req.headers, WEBHOOK_SECRET))) {
    return new Response('bad signature', { status: 401 })
  }

  let evt: { type?: string; data?: any }
  try {
    evt = JSON.parse(body)
  } catch {
    return new Response('bad json', { status: 400 })
  }

  const type = evt.type || 'unknown' // e.g. "email.delivered"
  const d = evt.data || {}
  const msgId: string | null = d.email_id || d.id || null
  const to: string | null = Array.isArray(d.to) ? d.to[0] : d.to || null
  const short = type.replace(/^email\./, '')
  const reason: string | null =
    d.bounce?.message || d.failed?.reason || (d.click?.link ? `click:${d.click.link}` : null)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

  await admin.from('resend_events').insert({
    resend_message_id: msgId,
    event_type: type,
    email: to,
    reason,
    payload: evt,
  })

  // A refund notification that BOUNCED must give its claim back. The claim is
  // taken before the send and Resend answers 200 on acceptance, so without this
  // a bounce leaves the member marked as told, undelivered, and unretryable.
  // Scoped by `refund_notified_at <= the bouncing send's created_at` so a late
  // bounce cannot unmark a member a later send actually reached. Releasing does
  // not resend: refund emails fire only from charge.refunded.
  // See _shared/refund-bounce-release.ts.
  const release = refundReleaseTarget(evt)
  if (release) {
    const { data: released, error: releaseErr } = await admin
      .from('event_tickets')
      .update({ refund_notified_at: null })
      .eq('id', release.ticketId)
      .not('refund_notified_at', 'is', null)
      .lte('refund_notified_at', release.sentAtIso)
      .select('id')
    if (releaseErr) {
      console.error('[resend-webhook] refund claim release failed:', release.ticketId, releaseErr.message)
    } else if (released && released.length > 0) {
      console.log('[resend-webhook] refund notification bounced, claim released:', release.ticketId)
    } else {
      // Either already released, or a newer claim from a send that did land.
      console.log('[resend-webhook] refund bounce released nothing (newer claim or already open):', release.ticketId)
    }
  }

  if (msgId) {
    const nowIso = new Date().toISOString()
    if (short === 'opened') {
      await admin.from('campaign_recipients')
        .update({ opened_at: nowIso }).eq('resend_message_id', msgId).is('opened_at', null)
    } else if (short === 'clicked') {
      await admin.from('campaign_recipients')
        .update({ clicked_at: nowIso }).eq('resend_message_id', msgId).is('clicked_at', null)
    } else if (short === 'delivered') {
      await admin.from('campaign_recipients')
        .update({ status: 'delivered' }).eq('resend_message_id', msgId)
    } else if (short === 'bounced' || short === 'complained') {
      await admin.from('campaign_recipients')
        .update({ status: short, error_message: (reason || short).slice(0, 500) })
        .eq('resend_message_id', msgId)
      // Suppress dead / complaining addresses so future campaigns skip them.
      // email_suppressions.reason CHECK allows only bounce/complaint/manual.
      const supReason = short === 'complained' ? 'complaint' : 'bounce'
      if (to) await admin.from('email_suppressions').upsert({ email: to, reason: supReason }, { onConflict: 'email' })
    }
  }

  return new Response('ok', { status: 200 })
})
