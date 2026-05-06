// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

Deno.serve(async (req: Request) => {
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
    const archiveCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000) // 24h ago
    const deleteCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) // 7d ago

    const results = { archived: 0, deleted: 0, errors: 0 }

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

    // ── (2) Hard-delete breakout channels archived >7d ago ──
    const { data: deletables, error: delQueryErr } = await supabase
      .from('carpool_breakout_chats')
      .select('carpool_id, channel_id, archived_at')
      .not('archived_at', 'is', null)
      .is('deleted_at', null)
      .lte('archived_at', deleteCutoff.toISOString())

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
})
