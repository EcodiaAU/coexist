// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'

/**
 * event-post-photo-invite
 *
 * pg_cron-driven hourly sweep. For every event whose effective end
 * (date_end ?? date_start) fell within the last CATCH_UP_HOURS and does not
 * yet have a photo-album card in its chat, posts an `event_photos` card so
 * everyone who was there can open the album and add their photos. A push
 * ("Share your photos") goes to the crew only for events that ended within the
 * last PUSH_RECENT_HOURS, so the wider catch-up window never re-pushes an
 * older event.
 *
 * Target chat:
 *   - Campout events (an event-linked chat_channels row) get the card in that
 *     campout group chat (channel_id set, collective_id null).
 *   - Every other event gets it in its collective's group chat (collective_id
 *     set, channel_id null).
 *
 * Self-healing: the card insert is idempotent (keyed on event_photos_event_id),
 * and the 48h window is far wider than the hourly cadence, so a missed cron
 * run (host asleep, transient failure) is recovered on the next fire. The card
 * posts regardless of whether anyone was marked `attended`, because the card is
 * for the whole collective / campout crew, not just checked-in attendees.
 *
 * Fixed 2026-08-09: the previous candidate query filtered events on
 * `date_start` within ~90 min but decided eligibility on effective END. Every
 * event with an explicit `date_end` (i.e. every multi-hour event: tree
 * plantings, Merri Mornings, campouts) had a `date_start` hours outside that
 * window and was silently skipped before the loop, so almost no cards ever
 * posted. It also only ever targeted `collective_id`, never the per-campout
 * channel. Both are fixed here.
 *
 * Auth: service-role bearer. Cron passes it via the plpgsql wrapper.
 */

const CATCH_UP_HOURS = 48
const PUSH_RECENT_HOURS = 3
const LEADER_ROLES = ['leader', 'co_leader', 'assist_leader']

Deno.serve(withSentry('event-post-photo-invite', async (req: Request) => {
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
    const nowIso = new Date(now).toISOString()
    const catchUpStartIso = new Date(now - CATCH_UP_HOURS * 60 * 60 * 1000).toISOString()
    const pushRecentStartMs = now - PUSH_RECENT_HOURS * 60 * 60 * 1000

    const results = { candidates: 0, posted: 0, pushed: 0, skipped_existing: 0, skipped_no_target: 0, errors: 0 }

    // Candidate set: events whose EFFECTIVE END fell within the catch-up window.
    // date_end is authoritative when set; otherwise date_start is the end.
    const { data: events, error: evErr } = await supabase
      .from('events')
      .select('id, title, date_start, date_end, collective_id, created_by, status')
      .neq('status', 'cancelled')
      .or(
        `and(date_end.gte.${catchUpStartIso},date_end.lte.${nowIso}),` +
        `and(date_end.is.null,date_start.gte.${catchUpStartIso},date_start.lte.${nowIso})`,
      )

    if (evErr) {
      console.error('[event-post-photo-invite] events query failed:', evErr.message)
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

      // Idempotency: one card per event, wherever it landed.
      const { data: existing } = await supabase
        .from('chat_messages')
        .select('id')
        .eq('event_photos_event_id', e.id)
        .limit(1)
        .maybeSingle()
      if (existing) { results.skipped_existing++; continue }

      // Resolve the target chat. A campout event carries its own channel; that
      // group chat is where its crew live, so the card belongs there. Everything
      // else goes to the collective's main group chat.
      const { data: channel } = await supabase
        .from('chat_channels')
        .select('id')
        .eq('event_id', e.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      const channelId = (channel?.id as string | undefined) ?? null

      if (!channelId && !e.collective_id) { results.skipped_no_target++; continue }

      // Gather the channel members up front (used for sender + push).
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
      // progressively looser options so a card always posts.
      let senderId: string | undefined
      if (e.collective_id) {
        // A leader who is also in the channel reads most naturally for campouts.
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

      // Post the album card.
      const { error: insErr } = await supabase
        .from('chat_messages')
        .insert({
          collective_id: channelId ? null : e.collective_id,
          channel_id: channelId,
          user_id: senderId,
          message_type: 'event_photos',
          content: `Photos from ${e.title}`,
          event_photos_event_id: e.id,
        })
      if (insErr) {
        console.error(`[event-post-photo-invite] card insert failed for ${e.id}:`, insErr.message)
        results.errors++
        continue
      }
      results.posted++

      // Push only for genuinely-recent events (never for the 48h backfill tail).
      if (endMs < pushRecentStartMs) continue

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
        await fetch(`${supabaseUrl}/functions/v1/send-push`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userIds,
            title: 'Share your photos',
            body: `Add the moments you captured from ${e.title} to the album.`,
            data: {
              type: 'event_updated',
              event_id: e.id,
              collective_id: e.collective_id,
              route: `/events/${e.id}?tab=photos`,
            },
          }),
        })
        results.pushed += userIds.length
      } catch (err) {
        console.error(`[event-post-photo-invite] push failed for ${e.id}:`, (err as Error).message)
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
