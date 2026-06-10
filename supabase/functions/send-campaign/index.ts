/* eslint-disable @typescript-eslint/no-explicit-any */
// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/* ------------------------------------------------------------------ */
/*  Resend bulk campaign sender                                        */
/* ------------------------------------------------------------------ */

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'hello@coexistaus.org'
const FROM_NAME = Deno.env.get('RESEND_FROM_NAME') ?? 'Co-Exist'
const BATCH_SIZE = 50 // Resend supports up to 100 recipients per batch send
const DELAY_MS = 200  // Pause between batches to respect rate limits

interface CampaignPayload {
  campaign_id: string
}

// Per-recipient auto-fill variables. Resolved at send-time so one campaign
// body can read "your next event is {{next_event_title}}" and every
// subscriber sees their own collective's upcoming event. Built for the
// 2026-06-10 "hype the next event" use case so staff no longer have to
// send a separate campaign per collective.
interface RecipientVars {
  name: string
  next_event_title: string
  next_event_date: string
  next_event_date_long: string
  next_event_collective: string
  next_event_location: string
  next_event_url: string
}

function applyRecipientVars(html: string, vars: RecipientVars): string {
  let out = html
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v)
  }
  return out
}

async function sendBatch(
  recipients: { email: string; vars: RecipientVars }[],
  subject: string,
  htmlContent: string,
  _textContent: string,
): Promise<{ success: boolean; error?: string }> {
  // Resend batch: send individual emails per recipient for personalisation.
  // Subject also gets the recipient vars so a campaign subject can read
  // "Coming up: {{next_event_title}}" and the inbox preview is personalised.
  const results = await Promise.allSettled(
    recipients.map((r) => {
      const personalised = applyRecipientVars(htmlContent, r.vars)
      const personalisedSubject = applyRecipientVars(subject, r.vars)
      return fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${FROM_NAME} <${FROM_EMAIL}>`,
          to: [r.email],
          subject: personalisedSubject,
          html: personalised,
          tags: [{ name: 'category', value: 'campaign' }],
          headers: {
            'List-Unsubscribe': `<mailto:unsubscribe@coexistaus.org?subject=Unsubscribe>, <https://app.coexistaus.org/unsubscribe>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }),
      })
    }),
  )

  const failures = results.filter(
    (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok),
  )

  if (failures.length === recipients.length) {
    console.error('[send-campaign] All emails in batch failed')
    return { success: false, error: `All ${failures.length} emails failed` }
  }
  if (failures.length > 0) {
    console.warn(`[send-campaign] ${failures.length}/${recipients.length} emails failed in batch`)
  }
  return { success: true }
}

Deno.serve(async (req: Request) => {
  try {
    // ── Auth: require admin/staff ──
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Missing authorization' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
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
        status: 401, headers: { 'Content-Type': 'application/json' },
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
        status: 403, headers: { 'Content-Type': 'application/json' },
      })
    }

    const { campaign_id } = (await req.json()) as CampaignPayload

    if (!campaign_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'campaign_id required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
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
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      )
    }

    if (campaign.status === 'sent' || campaign.status === 'sending') {
      return new Response(
        JSON.stringify({ success: false, error: `Campaign already ${campaign.status}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // 2. Mark as sending
    await supabaseAdmin
      .from('email_campaigns')
      .update({ status: 'sending' })
      .eq('id', campaign_id)

    // 3. Resolve audience
    const { data: audience, error: aErr } = await supabaseAdmin
      .rpc('resolve_campaign_audience', {
        p_target_all: campaign.target_all,
        p_tag_ids: campaign.target_tag_ids || [],
        p_collective_ids: campaign.target_collective_ids || [],
      })

    if (aErr) {
      console.error('[send-campaign] Audience error:', aErr)
      await supabaseAdmin
        .from('email_campaigns')
        .update({ status: 'draft' })
        .eq('id', campaign_id)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to resolve audience' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )
    }

    if (!audience?.length) {
      await supabaseAdmin
        .from('email_campaigns')
        .update({ status: 'draft', total_recipients: 0 })
        .eq('id', campaign_id)
      return new Response(
        JSON.stringify({ success: false, error: 'No eligible recipients' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // 4. Insert recipient records
    const recipientRows = audience.map((a: any) => ({
      campaign_id,
      profile_id: a.profile_id,
      email: a.email,
      status: 'queued',
    }))

    await supabaseAdmin.from('campaign_recipients').insert(recipientRows)

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

    function buildVars(profileId: string, _email: string): RecipientVars {
      const name = nameMap.get(profileId) || 'there'
      const evt = eventMap.get(profileId)
      if (!evt) {
        return {
          name,
          next_event_title: 'a Co-Exist event near you',
          next_event_date: 'soon',
          next_event_date_long: 'check the app for the next one near you',
          next_event_collective: 'your collective',
          next_event_location: '',
          next_event_url: `${APP_URL}/events`,
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
        next_event_collective: evt.collective_name,
        next_event_location: evt.address || '',
        next_event_url: `${APP_URL}/events/${evt.event_id}`,
      }
    }

    // 6. Send in batches
    let totalSent = 0
    let totalFailed = 0

    for (let i = 0; i < audience.length; i += BATCH_SIZE) {
      const batch = audience.slice(i, i + BATCH_SIZE)
      const recipients = batch.map((a: any) => ({
        email: a.email,
        vars: buildVars(a.profile_id, a.email),
      }))

      const result = await sendBatch(
        recipients,
        campaign.subject,
        campaign.body_html,
        campaign.body_text || '',
      )

      // Update recipient statuses
      const batchIds = batch.map((a: any) => a.profile_id)
      if (result.success) {
        totalSent += batch.length
        await supabaseAdmin
          .from('campaign_recipients')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('campaign_id', campaign_id)
          .in('profile_id', batchIds)
      } else {
        totalFailed += batch.length
        await supabaseAdmin
          .from('campaign_recipients')
          .update({ status: 'failed', error_message: result.error?.slice(0, 500) })
          .eq('campaign_id', campaign_id)
          .in('profile_id', batchIds)
      }

      // Rate limit pause
      if (i + BATCH_SIZE < audience.length) {
        await new Promise((r) => setTimeout(r, DELAY_MS))
      }
    }

    // 7. Finalise campaign
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
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[send-campaign] Error:', err)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
