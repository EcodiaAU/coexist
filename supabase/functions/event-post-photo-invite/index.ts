// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'

/**
 * event-post-photo-invite
 *
 * pg_cron-driven hourly sweep. For each event that ended between ~50 and ~80
 * minutes ago, sends a push notification to every confirmed attendee inviting
 * them to upload photos to the shared album. Window is tight enough that the
 * cron-once-per-hour scheduling delivers exactly one invite per event.
 *
 * Auth: service-role bearer. Cron passes it via the plpgsql wrapper.
 */

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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey,
    )

    const now = Date.now()
    const windowStart = new Date(now - 80 * 60 * 1000).toISOString()
    const windowEnd   = new Date(now - 50 * 60 * 1000).toISOString()

    const results = { events: 0, invited: 0, errors: 0 }

    // Find events whose effective end (date_end ?? date_start) falls in window.
    // We pull a slightly wider candidate set then filter in code.
    const candidateWindow = new Date(now - 90 * 60 * 1000).toISOString()
    const { data: events, error: evErr } = await supabase
      .from('events')
      .select('id, title, date_start, date_end, collective_id')
      .gte('date_start', candidateWindow)
      .lte('date_start', windowEnd)

    if (evErr) {
      console.error('[event-post-photo-invite] events query failed:', evErr.message)
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

      // Get confirmed attendees
      const { data: regs, error: regErr } = await supabase
        .from('event_registrations')
        .select('user_id')
        .eq('event_id', e.id)
        .eq('status', 'attended')

      if (regErr) {
        console.error(`[event-post-photo-invite] regs query failed for ${e.id}:`, regErr.message)
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
              title: 'Share your photos',
              body: `Add the moments you captured from ${e.title} to the album.`,
              data: {
                type: 'event_updated',
                event_id: e.id,
                collective_id: e.collective_id,
                route: `/events/${e.id}?tab=photos`,
              },
            }),
          },
        )
        results.events++
        results.invited += userIds.length
      } catch (err) {
        console.error(`[event-post-photo-invite] push failed for ${e.id}:`, (err as Error).message)
        results.errors++
      }

      // Drop a Photos widget into the collective chat so the album surfaces
      // alongside the push. Idempotent: check we haven't posted one yet.
      try {
        const { data: existing } = await supabase
          .from('chat_messages')
          .select('id')
          .eq('collective_id', e.collective_id)
          .eq('event_photos_event_id', e.id)
          .limit(1)
          .maybeSingle()
        if (!existing) {
          // Need a user_id (NOT NULL FK). Pick a leader of the collective as
          // sender so the widget reads naturally. Fall back to event creator.
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
                message_type: 'event_photos',
                content: `Photos from ${e.title}`,
                event_photos_event_id: e.id,
              })
          }
        }
      } catch (err) {
        console.error(`[event-post-photo-invite] chat widget insert failed for ${e.id}:`, (err as Error).message)
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
