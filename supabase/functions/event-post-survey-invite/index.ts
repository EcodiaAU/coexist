// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'

/**
 * event-post-survey-invite
 *
 * pg_cron-driven hourly sweep. For every event whose effective end
 * (date_end ?? date_start) fell between SETTLE_HOURS and CATCH_UP_HOURS ago and
 * does not yet have an `event_survey` widget in its chat, drops the widget so
 * the post-event feedback prompt surfaces alongside the album, and (only for
 * events that ended within the last PUSH_RECENT_HOURS) pushes the crew a
 * "How was the event?" nudge.
 *
 * Target chat:
 *   - Campout events (an event-linked chat_channels row) get the widget in that
 *     campout group chat (channel_id set, collective_id null), and their push
 *     reaches the campout channel members - ticket-buyers who are NOT collective
 *     members and would otherwise never see the prompt or get the nudge.
 *   - Every other event gets it in its collective's group chat (collective_id
 *     set, channel_id null), push to the `attended` registrations.
 *
 * Self-healing: the widget insert is idempotent (keyed on event_survey_event_id,
 * regardless of where it landed), and the CATCH_UP_HOURS window is far wider
 * than the hourly cadence, so a missed cron run (host asleep, transient
 * failure) is recovered on the next fire instead of losing that hour's events
 * permanently. The push side is coupled to the fire that first posts the widget,
 * so the widget-existence check is also the push idempotency key - a recovered
 * event never re-pushes an audience that already got the nudge.
 *
 * Fixed 2026-08-10 (D9): the previous candidate query filtered events on
 * `date_start` within an ~8h window but decided eligibility on effective END, so
 * every multi-hour event or campout that STARTED more than 8h before it ENDED
 * (tree plantings, Merri Mornings, multi-day campouts) had a `date_start`
 * outside the window and was silently dropped before the loop. It also acted
 * only in an exact 1-hour slice [now-4h, now-3h] with no catch-up (a single
 * missed/late cron lost every event whose end fell in that hour, forever), and
 * only ever targeted `collective_id` - never the per-campout channel - so
 * campout attendees got no widget and no push. All three are fixed here, and the
 * send-push result is now checked so a 5xx no longer counts as delivered. This
 * mirrors the sibling event-post-photo-invite (fixed 2026-08-09).
 *
 * Auth: service-role bearer. Cron passes it via the plpgsql wrapper.
 */

const CATCH_UP_HOURS = 48       // recover a missed/late cron for up to two days
const SETTLE_HOURS = 3          // wait until the event has been over a few hours before asking for feedback
const PUSH_RECENT_HOURS = 8     // push only for recently-ended events; older catch-up posts the widget silently
const LEADER_ROLES = ['leader', 'co_leader', 'assist_leader']

Deno.serve(withSentry('event-post-survey-invite', async (req: Request) => {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401 })
    }
    const token = authHeader.replace('Bearer ', '')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!serviceRoleKey || token !== serviceRoleKey) {
      return new Response('Forbidden: service-role key required', { status: 403 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const now = Date.now()
    const settleCutoffIso = new Date(now - SETTLE_HOURS * 60 * 60 * 1000).toISOString()   // ended >= 3h ago
    const catchUpStartIso = new Date(now - CATCH_UP_HOURS * 60 * 60 * 1000).toISOString() // ended <= 48h ago
    const pushRecentStartMs = now - PUSH_RECENT_HOURS * 60 * 60 * 1000

    const results = { candidates: 0, posted: 0, invited: 0, skipped_existing: 0, skipped_no_target: 0, errors: 0 }

    // Candidate set: events whose EFFECTIVE END fell within the catch-up window
    // and are at least SETTLE_HOURS old. date_end is authoritative when set;
    // otherwise date_start is the end. Filtering on effective end (not
    // date_start) is what stops multi-hour events + campouts being dropped.
    const { data: events, error: evErr } = await supabase
      .from('events')
      .select('id, title, date_start, date_end, collective_id, created_by, status')
      .neq('status', 'cancelled')
      .or(
        `and(date_end.gte.${catchUpStartIso},date_end.lte.${settleCutoffIso}),` +
        `and(date_end.is.null,date_start.gte.${catchUpStartIso},date_start.lte.${settleCutoffIso})`,
      )

    if (evErr) {
      console.error('[event-post-survey-invite] events query failed:', evErr.message)
      return new Response(JSON.stringify({ success: false, error: evErr.message }), { status: 500 })
    }

    if (!events?.length) {
      return new Response(JSON.stringify({ success: true, ...results }), { status: 200 })
    }

    for (const e of events as Array<{
      id: string; title: string; date_start: string; date_end: string | null
      collective_id: string | null; created_by: string | null; status: string | null
    }>) {
      results.candidates++
      const endMs = new Date(e.date_end ?? e.date_start).getTime()

      // Idempotency: one survey widget per event, wherever it landed (collective
      // chat or campout channel). This existence check is also the push
      // idempotency key - the push only fires on the run that first posts.
      const { data: existing } = await supabase
        .from('chat_messages')
        .select('id')
        .eq('event_survey_event_id', e.id)
        .limit(1)
        .maybeSingle()
      if (existing) { results.skipped_existing++; continue }

      // Resolve the target chat. A campout event carries its own channel; that
      // group chat is where its crew (ticket-buyers, not collective members)
      // live, so the widget belongs there. Everything else goes to the
      // collective's main group chat.
      const { data: channel } = await supabase
        .from('chat_channels')
        .select('id')
        .eq('event_id', e.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      const channelId = (channel?.id as string | undefined) ?? null

      if (!channelId && !e.collective_id) { results.skipped_no_target++; continue }

      // Channel members up front (used for sender + push recipients on campouts).
      let channelMemberIds: string[] = []
      if (channelId) {
        const { data: cm } = await supabase
          .from('chat_channel_members')
          .select('user_id')
          .eq('channel_id', channelId)
        channelMemberIds = (cm ?? []).map((r: { user_id: string }) => r.user_id)
      }

      // Resolve a sender (chat_messages.user_id is NOT NULL). Prefer a real
      // leader so the widget reads as if a leader shared it; fall back through
      // progressively looser options so a widget always posts.
      let senderId: string | undefined
      if (e.collective_id) {
        if (channelMemberIds.length > 0) {
          const { data: lead } = await supabase
            .from('collective_members')
            .select('user_id')
            .eq('collective_id', e.collective_id)
            .eq('status', 'active')
            .in('role', LEADER_ROLES)
            .in('user_id', channelMemberIds)
            .limit(1)
            .maybeSingle()
          senderId = lead?.user_id as string | undefined
        }
        if (!senderId) {
          const { data: lead } = await supabase
            .from('collective_members')
            .select('user_id')
            .eq('collective_id', e.collective_id)
            .eq('status', 'active')
            .in('role', LEADER_ROLES)
            .limit(1)
            .maybeSingle()
          senderId = lead?.user_id as string | undefined
        }
      }
      if (!senderId) senderId = channelMemberIds[0]
      if (!senderId) senderId = e.created_by ?? undefined
      if (!senderId && e.collective_id) {
        const { data: anyMember } = await supabase
          .from('collective_members')
          .select('user_id')
          .eq('collective_id', e.collective_id)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle()
        senderId = anyMember?.user_id as string | undefined
      }
      if (!senderId) { results.skipped_no_target++; continue }

      // Post the feedback widget.
      const { error: insErr } = await supabase
        .from('chat_messages')
        .insert({
          collective_id: channelId ? null : e.collective_id,
          channel_id: channelId,
          user_id: senderId,
          message_type: 'event_survey',
          content: `Feedback for ${e.title}`,
          event_survey_event_id: e.id,
        })
      if (insErr) {
        console.error(`[event-post-survey-invite] widget insert failed for ${e.id}:`, insErr.message)
        results.errors++
        continue
      }
      results.posted++

      // Push only for genuinely-recent events (never for the deep catch-up tail).
      if (endMs < pushRecentStartMs) continue

      // Recipients: checked-in attendees + campout channel members (the campout
      // crew are not marked `attended`, so channel members is how they get the
      // nudge at all). Never push the sender their own widget.
      const recipients = new Set<string>()
      const { data: regs } = await supabase
        .from('event_registrations')
        .select('user_id')
        .eq('event_id', e.id)
        .eq('status', 'attended')
      for (const r of (regs ?? []) as Array<{ user_id: string }>) recipients.add(r.user_id)
      for (const uid of channelMemberIds) recipients.add(uid)
      recipients.delete(senderId)
      const userIds = [...recipients]
      if (userIds.length === 0) continue

      try {
        const resp = await fetch(
          `${supabaseUrl}/functions/v1/send-push`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userIds,
              title: 'How was the event?',
              body: `Share a quick bit of feedback from ${e.title} - 30 seconds.`,
              data: {
                type: 'event_reminder',
                event_id: e.id,
                collective_id: e.collective_id,
                route: `/events/${e.id}/survey`,
              },
            }),
          },
        )
        // A non-2xx from send-push is a real failure - do not count it as
        // delivered. The widget already posted (the durable artifact); the push
        // is best-effort and is not retried (re-pushing would double-nudge the
        // audience that did receive it).
        if (!resp.ok) {
          console.error(`[event-post-survey-invite] send-push returned ${resp.status} for ${e.id}`)
          results.errors++
        } else {
          results.invited += userIds.length
        }
      } catch (err) {
        console.error(`[event-post-survey-invite] push failed for ${e.id}:`, (err as Error).message)
        results.errors++
      }
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), { status: 500 })
  }
}))
