// Deno Edge Function
import { withSentry } from "../_shared/sentry.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * event-post-survey-invite
 *
 * pg_cron-driven hourly sweep. For each event that ended between ~3h and ~4h
 * ago, sends a push notification to every confirmed attendee inviting them to
 * share feedback via the post-event survey, and drops an `event_survey` widget
 * into the collective chat so the prompt surfaces alongside the album.
 *
 * Window is 60min wide and cron fires hourly, so each event end-time falls in
 * exactly one window. Idempotency on the chat widget is via existence check
 * keyed on (collective_id, event_survey_event_id). The push side is naturally
 * idempotent because the window only matches once per event.
 *
 * Sibling to event-post-photo-invite (which fires at 50-80min after end for
 * the photos prompt + album widget).
 *
 * Auth: service-role bearer. Cron passes it via the plpgsql wrapper.
 */

Deno.serve(withSentry("event-post-survey-invite", async (req: Request) => {
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey,
    )

    const now = Date.now()
    const windowStart = new Date(now - 4 * 60 * 60 * 1000).toISOString() // 4h ago
    const windowEnd = new Date(now - 3 * 60 * 60 * 1000).toISOString()   // 3h ago

    const results = { events: 0, invited: 0, errors: 0 }

    // Pull a slightly wider candidate set on date_start, then filter on effective
    // end (date_end ?? date_start) in code. Matches event-post-photo-invite shape.
    const candidateWindow = new Date(now - 8 * 60 * 60 * 1000).toISOString()
    const { data: events, error: evErr } = await supabase
      .from('events')
      .select('id, title, date_start, date_end, collective_id')
      .gte('date_start', candidateWindow)
      .lte('date_start', windowEnd)

    if (evErr) {
      console.error('[event-post-survey-invite] events query failed:', evErr.message)
      return new Response(JSON.stringify({ success: false, error: evErr.message }), { status: 500 })
    }

    if (!events?.length) {
      return new Response(JSON.stringify({ success: true, ...results }), { status: 200 })
    }

    for (const e of events as Array<{ id: string; title: string; date_start: string; date_end: string | null; collective_id: string }>) {
      const endIso = e.date_end ?? e.date_start
      const endMs = new Date(endIso).getTime()
      if (endMs < new Date(windowStart).getTime() || endMs > new Date(windowEnd).getTime()) {
        continue
      }

      // Confirmed attendees only - 'attended' means they actually checked in.
      const { data: regs, error: regErr } = await supabase
        .from('event_registrations')
        .select('user_id')
        .eq('event_id', e.id)
        .eq('status', 'attended')

      if (regErr) {
        console.error(`[event-post-survey-invite] regs query failed for ${e.id}:`, regErr.message)
        results.errors++
        continue
      }

      const userIds = (regs ?? []).map((r: { user_id: string }) => r.user_id)
      if (userIds.length === 0) continue

      try {
        await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`,
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
        results.events++
        results.invited += userIds.length
      } catch (err) {
        console.error(`[event-post-survey-invite] push failed for ${e.id}:`, (err as Error).message)
        results.errors++
      }

      // Drop a Feedback widget into the collective chat. Idempotent: check we
      // haven't posted one yet via (collective_id, event_survey_event_id).
      try {
        const { data: existing } = await supabase
          .from('chat_messages')
          .select('id')
          .eq('collective_id', e.collective_id)
          .eq('event_survey_event_id', e.id)
          .limit(1)
          .maybeSingle()
        if (!existing) {
          const { data: leader } = await supabase
            .from('collective_members')
            .select('user_id')
            .eq('collective_id', e.collective_id)
            .eq('status', 'active')
            .in('role', ['leader', 'co_leader'])
            .limit(1)
            .maybeSingle()
          const senderId = (leader?.user_id as string | undefined) ?? userIds[0]
          if (senderId) {
            await supabase
              .from('chat_messages')
              .insert({
                collective_id: e.collective_id,
                user_id: senderId,
                message_type: 'event_survey',
                content: `Feedback for ${e.title}`,
                event_survey_event_id: e.id,
              })
          }
        }
      } catch (err) {
        console.error(`[event-post-survey-invite] chat widget insert failed for ${e.id}:`, (err as Error).message)
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
