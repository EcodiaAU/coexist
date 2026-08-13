/* eslint-disable @typescript-eslint/no-explicit-any */
// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'

/* ------------------------------------------------------------------ */
/*  Resend bulk campaign sender                                        */
/* ------------------------------------------------------------------ */

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'hello@coexistaus.org'
const FROM_NAME = Deno.env.get('RESEND_FROM_NAME') ?? 'Co-Exist'
// Resend's /emails/batch takes up to 100 personalised emails per HTTP request.
// One request per 100 recipients keeps us far under the account's 10 req/s
// limit. The old path fired 50 concurrent single POSTs, so ~41 of every 50 got
// 429'd and were silently counted as delivered (2026-08-12 investigation).
const CHUNK_SIZE = 100
const DELAY_MS = 600  // Pause between chunks (mirrors send-email)

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' }

interface CampaignPayload {
  campaign_id: string
  /**
   * If set, bypass the audience resolver and send ONE email to this
   * address only. Used by the Quick Send "Send test to me" flow so the
   * admin gets a real preview in their own inbox with their own name
   * and their own collective's next event resolved. The campaign row
   * is still recorded so the History tab shows the test send.
   */
  test_recipient_email?: string
}

// Per-recipient auto-fill variables. Resolved at send-time so one campaign
// body can read "your next event is {{next_event_title}}" and every
// subscriber sees their own collective's upcoming event. Built for the
// 2026-06-10 "hype the next event" use case so staff no longer have to
// send a separate campaign per collective.
interface RecipientVars {
  name: string
  unsubscribe_url: string
  next_event_title: string
  next_event_date: string
  next_event_date_long: string
  next_event_collective: string
  next_event_location: string
  next_event_url: string
  // Also referenced via the interface key but not destructured here:
  // unsubscribe_url is set in buildVars.
}

function applyRecipientVars(html: string, vars: RecipientVars): string {
  let out = html
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v)
  }
  return out
}

type PreparedEmail = Record<string, unknown>

// POST one chunk (<=100 emails) to Resend's batch endpoint, retrying on 429 /
// 5xx with backoff that honours Retry-After. Returns a per-recipient message-id
// array in input order (null where Resend returned no id), so the caller can
// record real per-recipient status instead of an optimistic batch guess.
async function sendChunk(
  emails: PreparedEmail[],
): Promise<{ ids: (string | null)[]; error?: string }> {
  let lastErr = ''
  for (let attempt = 0; attempt < 5; attempt++) {
    let resp: Response
    try {
      resp = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emails),
      })
    } catch (e) {
      lastErr = `fetch: ${(e as Error).message}`
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
      continue
    }
    if (resp.ok) {
      const body = (await resp.json()) as { data?: { id: string }[] }
      const data = body.data || []
      return { ids: emails.map((_, i) => data[i]?.id ?? null) }
    }
    if (resp.status === 429 || resp.status >= 500) {
      const ra = Number(resp.headers.get('retry-after') || '1')
      lastErr = `${resp.status}: ${(await resp.text()).slice(0, 200)}`
      await new Promise((r) =>
        setTimeout(r, Math.min(6000, (ra || 1) * 1000) + attempt * 300),
      )
      continue
    }
    // 4xx (validation) - retrying won't help.
    return {
      ids: emails.map(() => null),
      error: `${resp.status}: ${(await resp.text()).slice(0, 300)}`,
    }
  }
  return { ids: emails.map(() => null), error: lastErr || 'exhausted retries' }
}

// Fallback when a whole batch is rejected (Resend's /emails/batch is all-or-
// nothing on validation: a single junk `to` address 422s the entire 100-email
// chunk). Send each email individually so one bad address only fails itself.
// Small concurrency pool + pacing to stay under the 10 req/s account limit.
async function sendIndividually(emails: PreparedEmail[]): Promise<(string | null)[]> {
  const out: (string | null)[] = new Array(emails.length).fill(null)
  const POOL = 5
  for (let i = 0; i < emails.length; i += POOL) {
    const group = emails.slice(i, i + POOL)
    const res = await Promise.allSettled(
      group.map(async (em) => {
        for (let a = 0; a < 4; a++) {
          const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(em),
          })
          if (r.ok) {
            const b = (await r.json()) as { id?: string }
            return b.id ?? null
          }
          if (r.status === 429 || r.status >= 500) {
            const ra = Number(r.headers.get('retry-after') || '1')
            await new Promise((res) => setTimeout(res, (ra || 1) * 1000))
            continue
          }
          return null // validation (bad address) etc - don't retry
        }
        return null
      }),
    )
    res.forEach((r, k) => { out[i + k] = r.status === 'fulfilled' ? r.value : null })
    if (i + POOL < emails.length) await new Promise((r) => setTimeout(r, 700))
  }
  return out
}

Deno.serve(withSentry('send-campaign', async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  try {
    // Auth: require admin/staff.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Missing authorization' }), {
        status: 401, headers: JSON_HEADERS,
      })
    }
    const token = authHeader.replace('Bearer ', '')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const gotruRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': serviceRoleKey },
    })
    if (!gotruRes.ok) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid token' }), {
        status: 401, headers: JSON_HEADERS,
      })
    }
    const user = await gotruRes.json() as { id: string; email?: string }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // Verify caller is admin/staff
    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (!callerProfile || !['national_leader', 'manager', 'admin'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ success: false, error: 'Admin access required' }), {
        status: 403, headers: JSON_HEADERS,
      })
    }

    const { campaign_id, test_recipient_email } = (await req.json()) as CampaignPayload

    if (!campaign_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'campaign_id required' }),
        { status: 400, headers: JSON_HEADERS },
      )
    }

    // 1. Load campaign
    const { data: campaign, error: cErr } = await supabaseAdmin
      .from('email_campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single()

    if (cErr || !campaign) {
      return new Response(
        JSON.stringify({ success: false, error: 'Campaign not found' }),
        { status: 404, headers: JSON_HEADERS },
      )
    }

    if (campaign.status === 'sent' || campaign.status === 'sending') {
      return new Response(
        JSON.stringify({ success: false, error: `Campaign already ${campaign.status}` }),
        { status: 400, headers: JSON_HEADERS },
      )
    }

    // 2. Mark as sending
    await supabaseAdmin
      .from('email_campaigns')
      .update({ status: 'sending' })
      .eq('id', campaign_id)

    // 3. Resolve audience. Test sends bypass the resolver and target
    // the caller's own profile so the admin gets a real personalised
    // preview in their own inbox.
    let audience: { profile_id: string; email: string }[] | null = null
    let aErr: { message?: string } | null = null
    if (test_recipient_email) {
      const { data: callerProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, email, display_name, first_name')
        .eq('email', test_recipient_email)
        .maybeSingle()
      if (!callerProfile) {
        // Synthetic profile so the substitution still works even if the
        // test recipient is not a Co-Exist user (e.g. a staff alias).
        audience = [{ profile_id: '00000000-0000-0000-0000-000000000000', email: test_recipient_email }]
      } else {
        audience = [{ profile_id: callerProfile.id, email: callerProfile.email || test_recipient_email }]
      }
    } else {
      // Paginate the RPC. PostgREST caps a single response at 1000 rows, which
      // silently truncated a 2036-person target_all send to 1000 (2026-08-13).
      const page = 1000
      const all: { profile_id: string; email: string }[] = []
      for (let from = 0; ; from += page) {
        const res = await supabaseAdmin
          .rpc('resolve_campaign_audience', {
            p_target_all: campaign.target_all,
            p_tag_ids: campaign.target_tag_ids || [],
            p_collective_ids: campaign.target_collective_ids || [],
          })
          .range(from, from + page - 1)
        if (res.error) { aErr = res.error; break }
        const rows = (res.data as { profile_id: string; email: string }[]) || []
        all.push(...rows)
        if (rows.length < page) break
      }
      audience = aErr ? null : all
    }

    if (aErr) {
      console.error('[send-campaign] Audience error:', aErr)
      await supabaseAdmin
        .from('email_campaigns')
        .update({ status: 'draft' })
        .eq('id', campaign_id)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to resolve audience' }),
        { status: 500, headers: JSON_HEADERS },
      )
    }

    if (!audience?.length) {
      await supabaseAdmin
        .from('email_campaigns')
        .update({ status: 'draft', total_recipients: 0 })
        .eq('id', campaign_id)
      return new Response(
        JSON.stringify({ success: false, error: 'No eligible recipients' }),
        { status: 200, headers: JSON_HEADERS },
      )
    }

    // 4. Per-recipient rows are upserted per chunk after each batch send (step
    //    6), carrying the real Resend message id and real status. The previous
    //    unchecked bulk insert of the whole audience was removed: its failure
    //    was silently swallowed, leaving 0 rows while the campaign still
    //    reported "1678 delivered" (2026-08-12 investigation).

    // 5. Load names for personalisation
    const profileIds = audience.map((a: any) => a.profile_id)
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name, first_name')
      .in('id', profileIds)

    const nameMap = new Map<string, string>()
    for (const p of profiles || []) {
      nameMap.set(p.id, p.display_name || p.first_name || '')
    }

    // 5b. Per-recipient next-event lookup. Only fire if the body or
    // subject mentions {{next_event_*}}, so the unconditional one-query
    // cost stays off campaigns that do not personalise on event data.
    const APP_URL = Deno.env.get('APP_URL') || 'https://app.coexistaus.org'
    const needsNextEvent =
      /\{\{next_event_/.test(campaign.body_html || '') ||
      /\{\{next_event_/.test(campaign.subject || '')

    const eventMap = new Map<
      string,
      { title: string; date_start: string; address: string | null; collective_name: string; event_id: string }
    >()
    if (needsNextEvent && profileIds.length > 0) {
      // DISTINCT ON (cm.user_id) ordered by event date gives each user
      // their earliest upcoming published event across all of their
      // active collective memberships in one round trip.
      const { data: nextEvents, error: neErr } = await supabaseAdmin.rpc(
        'recipient_next_events',
        { p_user_ids: profileIds },
      )
      if (neErr) {
        console.warn('[send-campaign] recipient_next_events failed:', neErr.message)
      } else {
        for (const row of (nextEvents as any[]) || []) {
          eventMap.set(row.user_id, {
            title: row.title,
            date_start: row.date_start,
            address: row.address,
            collective_name: row.collective_name,
            event_id: row.event_id,
          })
        }
      }
    }

    // Collective naming: Tate's preferred form is "Co-Exist <region>"
    // ("Co-Exist Sunshine Coast"), not "<region> Collective"
    // ("Sunshine Coast Collective"). The collectives table stores the
    // bare region name, so we prefix here at substitution time. If the
    // record already starts with "Co-Exist" leave it alone.
    function brandCollective(name: string): string {
      if (!name) return 'your local crew'
      const trimmed = name.replace(/\s+collective\s*$/i, '').trim()
      if (/^co-?exist\s/i.test(trimmed)) return trimmed
      return `Co-Exist ${trimmed}`
    }

    function buildVars(profileId: string, email: string): RecipientVars {
      const name = nameMap.get(profileId) || 'there'
      const unsubscribe_url = `${APP_URL}/unsubscribe?email=${encodeURIComponent(email)}`
      const evt = eventMap.get(profileId)
      if (!evt) {
        return {
          name,
          next_event_title: 'a Co-Exist event near you',
          next_event_date: 'soon',
          next_event_date_long: 'check the app for the next one near you',
          next_event_collective: 'your Co-Exist crew',
          next_event_location: '',
          next_event_url: `${APP_URL}/events`,
          unsubscribe_url,
        }
      }
      // Floating-local: stored wall-clock-as-UTC, format directly without TZ shift.
      const d = new Date(evt.date_start)
      const dateShort = d.toLocaleDateString('en-AU', {
        weekday: 'short', day: 'numeric', month: 'short',
      })
      const dateLong = d.toLocaleDateString('en-AU', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
      return {
        name,
        next_event_title: evt.title,
        next_event_date: dateShort,
        next_event_date_long: dateLong,
        next_event_collective: brandCollective(evt.collective_name),
        next_event_location: evt.address || '',
        next_event_url: `${APP_URL}/events/${evt.event_id}`,
        unsubscribe_url,
      }
    }

    // 6. Send via Resend's batch endpoint, chunked, with real per-recipient
    //    tracking. total_delivered now counts recipients Resend actually
    //    ACCEPTED (returned a message id for), not an optimistic batch guess.
    //    True delivered/bounced/opened land later via the resend-webhook.
    const ZERO_UUID = '00000000-0000-0000-0000-000000000000'
    let totalSent = 0
    let totalFailed = 0

    for (let i = 0; i < audience.length; i += CHUNK_SIZE) {
      const slice = audience.slice(i, i + CHUNK_SIZE)
      const emails: PreparedEmail[] = slice.map((a: any) => {
        const vars = buildVars(a.profile_id, a.email)
        return {
          from: `${FROM_NAME} <${FROM_EMAIL}>`,
          to: [a.email],
          subject: applyRecipientVars(campaign.subject, vars),
          html: applyRecipientVars(campaign.body_html, vars),
          tags: [{ name: 'category', value: 'campaign' }],
          headers: {
            'List-Unsubscribe': `<mailto:unsubscribe@coexistaus.org?subject=Unsubscribe>, <${APP_URL}/unsubscribe?email=${encodeURIComponent(a.email)}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }
      })

      const chunk = await sendChunk(emails)
      let ids = chunk.ids
      const chunkErr = chunk.error
      if (chunkErr) {
        // A batch rejection is usually one bad address poisoning the chunk.
        // Retry each email individually so the rest still send.
        console.warn(`[send-campaign] chunk ${i}-${i + slice.length} batch error, retrying individually: ${chunkErr}`)
        ids = await sendIndividually(emails)
      }

      const nowIso = new Date().toISOString()
      const rows = slice
        .map((a: any, k: number) => ({
          campaign_id,
          profile_id: a.profile_id,
          email: a.email,
          status: ids[k] ? 'sent' : 'failed',
          sent_at: ids[k] ? nowIso : null,
          resend_message_id: ids[k],
          error_message: ids[k] ? null : (chunkErr?.slice(0, 500) ?? 'no id returned'),
        }))
        // Skip the synthetic test profile (all-zero uuid) which FK-violates.
        .filter((r) => r.profile_id && r.profile_id !== ZERO_UUID)

      if (rows.length) {
        const { error: upErr } = await supabaseAdmin
          .from('campaign_recipients')
          .upsert(rows, { onConflict: 'campaign_id,profile_id' })
        if (upErr) console.error('[send-campaign] recipient upsert failed:', upErr.message)
      }

      totalSent += ids.filter(Boolean).length
      totalFailed += ids.filter((x) => !x).length

      // Rate limit pause between chunks.
      if (i + CHUNK_SIZE < audience.length) {
        await new Promise((r) => setTimeout(r, DELAY_MS))
      }
    }

    // 7. Finalise campaign with REAL counts (accepted vs not-accepted by Resend).
    await supabaseAdmin
      .from('email_campaigns')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        total_recipients: audience.length,
        total_delivered: totalSent,
        total_bounced: totalFailed,
      })
      .eq('id', campaign_id)

    return new Response(
      JSON.stringify({
        success: true,
        total: audience.length,
        sent: totalSent,
        failed: totalFailed,
      }),
      { status: 200, headers: JSON_HEADERS },
    )
  } catch (err) {
    console.error('[send-campaign] Error:', err)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal error' }),
      { status: 500, headers: JSON_HEADERS },
    )
  }
}))
