// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'
import { chunkValues, selectInChunks } from '../_shared/select-in-chunks.ts'

/**
 * carpool-archive-sweep
 *
 * Hourly pg_cron-driven sweep that:
 *
 * (1) Archives carpool widgets whose linked event ended >=24h ago:
 *     - carpool_widgets.status -> 'archived'
 *     - carpool_breakout_chats.archived_at -> now()
 *     - chat_channels.lifecycle_status -> 'archived'
 *
 * (2) Hard-deletes a breakout channel ONLY after its members were warned
 *     ("closes in ~2 hours") AND a 2h grace has elapsed since that warning:
 *     - DELETE chat_channels (cascades to chat_messages, members)
 *     - carpool_breakout_chats.deleted_at -> now()
 *   A channel is never deleted in the same run it first becomes eligible, so a
 *   breakout that only surfaces after event_end+24h (cron downtime, a late
 *   breakout) still gets its warning + grace window before deletion.
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

/** Run a write once per chunk of ids and return the first error, or null.
 *  An unbounded `.in()` on a write fails the same way a read does (the filter
 *  is echoed back in a response header), so writes are chunked too. */
async function updateInChunks(
  ids: readonly string[],
  write: (chunk: string[]) => PromiseLike<{ error: unknown }>,
): Promise<unknown> {
  for (const batch of chunkValues(ids)) {
    try {
      const { error } = await write(batch)
      if (error) return error
    } catch (err) {
      return err
    }
  }
  return null
}

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
    // people don't see stale chats. Lifecycle:
    //   event_end + 24h  -> ARCHIVE (widget + breakout + channel)
    //   warned + ~2h     -> HARD-DELETE the channel (cascades chat_messages)
    // The channel is warned ("closes in ~2 hours") once, then hard-deleted ONLY
    // after a 2h grace since that warning. This guarantees members always get
    // the heads-up + time to save photos/contacts, even when a breakout first
    // becomes eligible AFTER event_end + 24h (pg_cron downtime spanning the
    // 22-24h window, a Supabase maintenance gap, or a late-created breakout) -
    // the previous "delete every archived_at IS NOT NULL on the same run"
    // logic silently deleted those with no warning.
    const archiveCutoff   = new Date(now.getTime() - 24 * 60 * 60 * 1000) // 24h ago (archive)
    const warnGraceMs     = 2 * 60 * 60 * 1000                            // 2h grace between warn and delete
    const warnGraceCutoff = new Date(now.getTime() - warnGraceMs)         // delete only if warned before this

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
      const { rows: widgetsForWarning, error: warnWidgetsErr } = await selectInChunks<{ id: string; event_id: string }>(
        breakoutCarpoolIds,
        (batch) => supabase.from('carpool_widgets').select('id, event_id').in('id', batch),
      )
      if (warnWidgetsErr) {
        console.error('[carpool-archive-sweep] warning widget query failed:', (warnWidgetsErr as Error).message)
        results.errors++
      }

      if (widgetsForWarning.length) {
        const eventIds = [...new Set(widgetsForWarning.map((w: { event_id: string }) => w.event_id))]
        const { rows: warnEvents, error: warnEventsErr } = await selectInChunks<{ id: string; title: string; date_start: string; date_end: string | null }>(
          eventIds,
          (batch) => supabase.from('events').select('id, title, date_start, date_end').in('id', batch),
        )
        if (warnEventsErr) {
          console.error('[carpool-archive-sweep] warning events query failed:', (warnEventsErr as Error).message)
          results.errors++
        }

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
          // Warn any not-yet-warned breakout whose event ended at least 22h ago
          // (no upper bound). The `is('warning_posted_at', null)` filter above
          // keeps this one-shot, and dropping the old `< 24h` ceiling means a
          // breakout that only surfaces after +24h still gets its warning
          // before the delete gate (which now requires warning_posted_at + 2h).
          if (ageMs >= 22 * 60 * 60 * 1000) {
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
                const resp = await fetch(
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
                // A non-2xx (fetch does not throw on it) must NOT mark the
                // warning posted: warning_posted_at is what opens the +2h delete
                // gate below, so recording an unsent warning as sent would delete
                // the carpool chat without ever warning its members. Skip the
                // marker so the next cron fire re-sends the warning.
                if (!resp.ok) {
                  console.error(`[carpool-archive-sweep] warning send-push returned ${resp.status} for channel ${b.channel_id}`)
                  results.errors++
                  continue
                }
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
    // A widget qualifies when it is still open or full and its event's
    // (date_end ?? date_start) is before archiveCutoff.
    //
    // WIDGET-FIRST, and that is the fix (board d994a891, 2026-11-22). This used
    // to pull EVERY event older than the cutoff and pass all of their ids to one
    // .in('event_id', ...). That list only grows (523 events on 2026-11-22),
    // PostgREST echoes the whole filter back in a content-location response
    // header, and once the header passed Deno's 16KiB cap the fetch threw on
    // every hourly run: nothing archived after events ending about 27 Jun 2026
    // while pg_cron kept reporting "succeeded" (it only enqueues the request).
    // Live open/full widgets are few, and this sweep is what keeps them few, so
    // every id list below is bounded by the live widget count, not by history.
    // The lists are still chunked and their errors read, so a failure is
    // counted instead of reading as "nothing to archive".
    const { data: liveWidgets, error: liveWidgetsErr } = await supabase
      .from('carpool_widgets')
      .select('id, event_id')
      .in('status', ['open', 'full'])

    if (liveWidgetsErr) {
      console.error('[carpool-archive-sweep] widget query failed:', liveWidgetsErr.message)
      results.errors++
    }

    if (liveWidgets?.length) {
      const liveEventIds = [...new Set(
        (liveWidgets as Array<{ id: string; event_id: string | null }>)
          .map((w) => w.event_id)
          .filter((id): id is string => !!id),
      )]
      const { rows: liveEvents, error: liveEventsErr } = await selectInChunks<{ id: string; date_start: string; date_end: string | null }>(
        liveEventIds,
        (batch) => supabase.from('events').select('id, date_start, date_end').in('id', batch),
      )
      if (liveEventsErr) {
        console.error('[carpool-archive-sweep] events query failed:', (liveEventsErr as Error).message)
        results.errors++
      }

      const endedEventIds = new Set(
        liveEvents
          .filter((e) => new Date(e.date_end ?? e.date_start).getTime() < archiveCutoff.getTime())
          .map((e) => e.id),
      )
      const widgetIds = (liveWidgets as Array<{ id: string; event_id: string | null }>)
        .filter((w) => !!w.event_id && endedEventIds.has(w.event_id))
        .map((w) => w.id)

      if (widgetIds.length) {
        // Archive widgets
        const updWidgetsErr = await updateInChunks(widgetIds, (batch) =>
          supabase.from('carpool_widgets').update({ status: 'archived' }).in('id', batch))
        if (updWidgetsErr) {
          console.error('[carpool-archive-sweep] widget archive failed:', (updWidgetsErr as Error).message)
          results.errors++
        } else {
          results.archived += widgetIds.length
        }

        // Mark breakout chats archived
        const { rows: breakouts, error: breakoutsErr } = await selectInChunks<{ carpool_id: string; channel_id: string; archived_at: string | null; deleted_at: string | null }>(
          widgetIds,
          (batch) => supabase
            .from('carpool_breakout_chats')
            .select('carpool_id, channel_id, archived_at, deleted_at')
            .in('carpool_id', batch),
        )
        if (breakoutsErr) {
          console.error('[carpool-archive-sweep] breakout query failed:', (breakoutsErr as Error).message)
          results.errors++
        }

        if (breakouts.length) {
          const breakoutCarpoolIds = breakouts
            .filter((b) => b.archived_at === null && b.deleted_at === null)
            .map((b) => b.carpool_id)

          if (breakoutCarpoolIds.length) {
            const archChatsErr = await updateInChunks(breakoutCarpoolIds, (batch) =>
              supabase.from('carpool_breakout_chats').update({ archived_at: now.toISOString() }).in('carpool_id', batch))
            if (archChatsErr) {
              console.error('[carpool-archive-sweep] breakout archive failed:', (archChatsErr as Error).message)
              results.errors++
            }
          }

          const channelIds = breakouts
            .filter((b) => b.deleted_at === null)
            .map((b) => b.channel_id)

          if (channelIds.length) {
            const chanArchErr = await updateInChunks(channelIds, (batch) =>
              supabase.from('chat_channels').update({ lifecycle_status: 'archived' }).in('id', batch))
            if (chanArchErr) {
              console.error('[carpool-archive-sweep] channel archive failed:', (chanArchErr as Error).message)
              results.errors++
            }
          }
        }
      }
    }

    // ── (2) Hard-delete archived breakout channels that were WARNED ──
    // A channel is deleted only once it is archived AND its members were warned
    // AND at least a 2h grace has passed since that warning. Gating on
    // warning_posted_at (not just archived_at) closes the silent-loss hole: a
    // breakout first eligible after event_end+24h used to be archived AND
    // deleted on the same run with no notice. Now every deletion is preceded by
    // a warning push + a 2h window for members to save photos/contacts.
    const { data: deletables, error: delQueryErr } = await supabase
      .from('carpool_breakout_chats')
      .select('carpool_id, channel_id, archived_at, warning_posted_at')
      .not('archived_at', 'is', null)
      .not('warning_posted_at', 'is', null)
      .lte('warning_posted_at', warnGraceCutoff.toISOString())
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
