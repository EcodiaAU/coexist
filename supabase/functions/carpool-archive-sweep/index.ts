// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'

/**
 * carpool-archive-sweep
 *
 * Hourly pg_cron-driven sweep that:
 *
 * (1) Archives carpool widgets whose linked event ended >24h ago:
 *     - carpool_widgets.status -> 'archived'
 *     - carpool_breakout_chats.archived_at -> now()
 *     - chat_channels.lifecycle_status -> 'archived'
 *
 * (2) Hard-deletes archived breakout channels older than 7 days:
 *     - DELETE chat_channels (cascades to chat_messages, members)
 *     - carpool_breakout_chats.deleted_at -> now()
 *
 * Auth: requires service-role bearer (cron passes it). NEVER accept user
 * JWT here; this is a privileged sweep.
 *
 * No body. Returns counts: { archived: N, deleted: M, errors: K }
 *
 * Safe-defaults rule (~/ecodiaos/patterns/edge-function-safe-defaults.md):
 *   No mode/direction switch. The function does the same idempotent sweep
 *   on every invocation. Bare `curl <url>` with service-role key is the
 *   correct invocation; pg_cron passes it via the `cron_carpool_archive_sweep`
 *   plpgsql wrapper. Missing service-role key -> 401/403, no mutation.
 *
 *   This is intentionally write-only because there is no reasonable read
 *   path - the caller is always the cron, which wants to apply the sweep.
 */

Deno.serve(withSentry('carpool-archive-sweep', async (req: Request) => {
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

    const now = new Date()
    // Tate's call (17 May 2026): breakouts close the day after the event so
    // people don't see stale chats. We POST a warning system message at
    // event_end + 22h ("This chat closes in ~2 hours"), then ARCHIVE +
    // HARD-DELETE at event_end + 24h. archiveCutoff and deleteCutoff are
    // now the same window; we keep a tiny safety margin between them so the
    // archive marker is visible at deletion time for telemetry.
    const warnCutoff    = new Date(now.getTime() - 22 * 60 * 60 * 1000) // 22h ago
    const archiveCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000) // 24h ago
    const deleteCutoff  = new Date(now.getTime() - 24 * 60 * 60 * 1000) // 24h ago

    const results = { archived: 0, deleted: 0, warned: 0, errors: 0 }

    // ── (0) Warn breakouts that close in ~2h (event_end + 22h..24h) ──
    // Post a system message in each breakout that hasn't been warned yet
    // and whose linked event ended between 22h and 24h ago. Marks
    // warning_posted_at to keep this idempotent across cron runs.
    const { data: warnableBreakouts } = await supabase
      .from('carpool_breakout_chats')
      .select('carpool_id, channel_id, warning_posted_at, archived_at, deleted_at')
      .is('warning_posted_at', null)
      .is('deleted_at', null)

    if (warnableBreakouts?.length) {
      // Need event_end for each breakout via the carpool widget
      const breakoutCarpoolIds = warnableBreakouts.map((b: { carpool_id: string }) => b.carpool_id)
      const { data: widgetsForWarning } = await supabase
        .from('carpool_widgets')
        .select('id, event_id')
        .in('id', breakoutCarpoolIds)

      if (widgetsForWarning?.length) {
        const eventIds = [...new Set(widgetsForWarning.map((w: { event_id: string }) => w.event_id))]
        const { data: warnEvents } = await supabase
          .from('events')
          .select('id, title, date_start, date_end')
          .in('id', eventIds)

        const eventById = new Map<string, { title: string; date_start: string; date_end: string | null }>()
        for (const e of (warnEvents ?? []) as Array<{ id: string; title: string; date_start: string; date_end: string | null }>) {
          eventById.set(e.id, e)
        }

        const carpoolIdToEvent = new Map<string, { title: string; date_start: string; date_end: string | null }>()
        for (const w of widgetsForWarning as Array<{ id: string; event_id: string }>) {
          const ev = eventById.get(w.event_id)
          if (ev) carpoolIdToEvent.set(w.id, ev)
        }

        for (const b of warnableBreakouts as Array<{ carpool_id: string; channel_id: string }>) {
          const ev = carpoolIdToEvent.get(b.carpool_id)
          if (!ev) continue
          const endIso = ev.date_end ?? ev.date_start
          const endMs = new Date(endIso).getTime()
          const ageMs = now.getTime() - endMs
          // Window: ended at least 22h ago but less than 24h ago.
          if (ageMs >= 22 * 60 * 60 * 1000 && ageMs < 24 * 60 * 60 * 1000) {
            // Push notification path (chat_messages.user_id is NOT NULL so a
            // synthetic system message would need a bot user; pushes don't).
            // Send to every channel member - they get a banner and can open
            // the chat to grab photos/contacts before close.
            const { data: members } = await supabase
              .from('chat_channel_members')
              .select('user_id')
              .eq('channel_id', b.channel_id)

            const userIds = (members ?? []).map((m: { user_id: string }) => m.user_id)
            if (userIds.length > 0) {
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
                      title: 'Carpool chat closes soon',
                      body: `Your carpool for ${ev.title} closes in about 2 hours. Save any photos or contacts you want to keep.`,
                      data: {
                        type: 'chat_announcement',
                        channel_id: b.channel_id,
                        route: `/chat/channel/${b.channel_id}`,
                      },
                    }),
                  },
                )
              } catch (e) {
                console.error('[carpool-archive-sweep] warning push failed:', (e as Error).message)
                results.errors++
                continue
              }
            }
            await supabase
              .from('carpool_breakout_chats')
              .update({ warning_posted_at: now.toISOString() })
              .eq('carpool_id', b.carpool_id)
            results.warned++
          }
        }
      }
    }

    // ── (1) Archive widgets for events that ended >24h ago ──
    //
    // We need carpool_widgets rows joined to events where event.date_end
    // (or date_start if date_end IS NULL) + 24h < now() AND status NOT IN
    // ('archived','cancelled').
    //
    // PostgREST join filtering is awkward; pull the event ids we care about
    // first, then update widgets in a single statement.
    const { data: pastEvents, error: eventsErr } = await supabase
      .from('events')
      .select('id, date_start, date_end')
      .lte('date_start', archiveCutoff.toISOString())

    if (eventsErr) {
      console.error('[carpool-archive-sweep] events query failed:', eventsErr.message)
      results.errors++
    }

    if (pastEvents?.length) {
      // Filter in code: event qualifies if (date_end ?? date_start) + 24h < now
      const qualifyingIds = pastEvents
        .filter((e: { id: string; date_start: string; date_end: string | null }) => {
          const endIso = e.date_end ?? e.date_start
          return new Date(endIso).getTime() + 24 * 60 * 60 * 1000 < now.getTime()
        })
        .map((e: { id: string }) => e.id)

      if (qualifyingIds.length) {
        // Find the carpool_widgets to archive (open or full only)
        const { data: widgetsToArchive, error: widgetsErr } = await supabase
          .from('carpool_widgets')
          .select('id')
          .in('event_id', qualifyingIds)
          .in('status', ['open', 'full'])

        if (widgetsErr) {
          console.error('[carpool-archive-sweep] widget query failed:', widgetsErr.message)
          results.errors++
        }

        if (widgetsToArchive?.length) {
          const widgetIds = widgetsToArchive.map((w: { id: string }) => w.id)

          // Archive widgets
          const { error: updWidgetsErr } = await supabase
            .from('carpool_widgets')
            .update({ status: 'archived' })
            .in('id', widgetIds)
          if (updWidgetsErr) {
            console.error('[carpool-archive-sweep] widget archive failed:', updWidgetsErr.message)
            results.errors++
          } else {
            results.archived += widgetIds.length
          }

          // Mark breakout chats archived
          const { data: breakouts } = await supabase
            .from('carpool_breakout_chats')
            .select('carpool_id, channel_id, archived_at, deleted_at')
            .in('carpool_id', widgetIds)

          if (breakouts?.length) {
            const breakoutCarpoolIds = breakouts
              .filter((b: { archived_at: string | null; deleted_at: string | null }) =>
                b.archived_at === null && b.deleted_at === null,
              )
              .map((b: { carpool_id: string }) => b.carpool_id)

            if (breakoutCarpoolIds.length) {
              const { error: archChatsErr } = await supabase
                .from('carpool_breakout_chats')
                .update({ archived_at: now.toISOString() })
                .in('carpool_id', breakoutCarpoolIds)
              if (archChatsErr) {
                console.error('[carpool-archive-sweep] breakout archive failed:', archChatsErr.message)
                results.errors++
              }
            }

            const channelIds = breakouts
              .filter((b: { archived_at: string | null; deleted_at: string | null }) =>
                b.deleted_at === null,
              )
              .map((b: { channel_id: string }) => b.channel_id)

            if (channelIds.length) {
              const { error: chanArchErr } = await supabase
                .from('chat_channels')
                .update({ lifecycle_status: 'archived' })
                .in('id', channelIds)
              if (chanArchErr) {
                console.error('[carpool-archive-sweep] channel archive failed:', chanArchErr.message)
                results.errors++
              }
            }
          }
        }
      }
    }

    // ── (2) Hard-delete archived breakout channels ──
    // Per Tate's 17 May 2026 call: breakouts close the day after the event.
    // Archive already fired at event_end + 24h above. We hard-delete on the
    // same cycle so the chat disappears at +24h rather than lingering 7d.
    // deleteCutoff is the SAME as archiveCutoff (24h ago); referenced here so
    // the variable stays used.
    void deleteCutoff
    const { data: deletables, error: delQueryErr } = await supabase
      .from('carpool_breakout_chats')
      .select('carpool_id, channel_id, archived_at')
      .not('archived_at', 'is', null)
      .is('deleted_at', null)

    if (delQueryErr) {
      console.error('[carpool-archive-sweep] delete-query failed:', delQueryErr.message)
      results.errors++
    }

    if (deletables?.length) {
      for (const row of deletables) {
        const { carpool_id, channel_id } = row as {
          carpool_id: string
          channel_id: string
        }
        const { error: deleteChanErr } = await supabase
          .from('chat_channels')
          .delete()
          .eq('id', channel_id)
        if (deleteChanErr) {
          console.error(
            `[carpool-archive-sweep] channel delete failed for ${channel_id}:`,
            deleteChanErr.message,
          )
          results.errors++
          continue
        }

        // Mark breakout row deleted (channel_id FK has ON DELETE CASCADE on
        // carpool_breakout_chats; the row may already be gone. UPDATE is
        // best-effort.)
        await supabase
          .from('carpool_breakout_chats')
          .update({ deleted_at: now.toISOString() })
          .eq('carpool_id', carpool_id)

        results.deleted++
      }
    }

    console.log('[carpool-archive-sweep]', JSON.stringify(results))

    return new Response(JSON.stringify({ success: true, ...results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[carpool-archive-sweep] uncaught:', (err as Error).message)
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}))
