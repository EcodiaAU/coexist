/* eslint-disable @typescript-eslint/no-explicit-any */
// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'

/**
 * event-reminders - Scheduled Supabase Edge Function
 *
 * Called by pg_cron every 30 minutes. Finds upcoming events and sends
 * reminder email + push to registered attendees:
 *   - 24 hours before event start
 *   - 2 hours before event start
 *
 * Floating-local timezone model (since 2026-05-26):
 *   `events.date_start` is stored as wall-clock-as-UTC (e.g. "10am" typed
 *   by the host is stored literally as `2026-06-06T10:00:00Z`, regardless
 *   of the host's browser tz). To fire reminders at the right wall-clock
 *   moment for the audience, we compare `date_start` against the current
 *   wall-clock in the collective's IANA tz, formatted as UTC. Comparing
 *   against real UTC `now` would fire the audience-offset hours late
 *   (10h late for AEST, 8h late for AWST, etc).
 *
 * Uses the `email_reminders_sent` table to track which reminders have
 * already been sent, preventing duplicates. (Single row = both email and
 * push delivered for that user/event/type combo.)
 */

// Widest AU UTC offset we need to cover with the SQL pre-filter: +8 (Perth)
// to +11 (Hobart in DST). Picking 12h padding leaves comfortable headroom.
const TZ_PADDING_HOURS = 12

interface EventRow {
  id: string
  title: string
  date_start: string
  address: string | null
  timezone: string | null
  collectives: { timezone: string | null; slug: string | null } | null
}

/**
 * Test / non-production events must never fire live reminder mail to real
 * members. The canonical test marker is the collective slug 'test' (the
 * inactive "Test" collective used for QA). The SQL selection already filters
 * status='published' (excluding draft/cancelled/completed) and the
 * collectives !inner join filters slug != 'test'; this guard is a null-safe
 * second line of defence so a test-collective event can never slip through
 * even if the embedded filter is later weakened.
 */
function isTestEvent(event: EventRow): boolean {
  return event.collectives?.slug === 'test'
}

/**
 * Effective audience IANA timezone for an event. The floating-local model
 * leaves `events.timezone` as NULL or 'UTC' for new events; the meaningful
 * audience clock is the collective's tz (state-derived per migration
 * 20260512100000_collective_event_timezone.sql). Fallback Brisbane is
 * Co-Exist's centre-of-mass (QLD-heavy, no DST).
 */
function audienceTzFor(event: EventRow): string {
  const eTz = event.timezone
  if (eTz && eTz !== 'UTC') return eTz
  return event.collectives?.timezone || 'Australia/Brisbane'
}

/**
 * Returns a Date whose UTC slice equals the current wall-clock time in
 * `tz`. Mirrors the floating-local `wallClockNow()` helper used in the
 * frontend, but parametrised by tz instead of relying on the runtime's
 * own offset (Deno is always UTC).
 *
 * Brisbane at 11:00 AEST → returns Date('2026-06-08T11:00:00.000Z').
 */
function wallClockNowInTz(tz: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '00'
  const hour = get('hour') === '24' ? '00' : get('hour')
  return new Date(
    `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}.000Z`,
  )
}

/** Hours between two Dates, signed: positive = b is later than a. */
function hoursBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (3600 * 1000)
}

Deno.serve(withSentry('event-reminders', async (req: Request) => {
  try {
    // Verify caller is using the service-role key (cron invocations)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401 })
    }
    const token = authHeader.replace('Bearer ', '')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (token !== serviceRoleKey) {
      return new Response('Forbidden: service-role key required', { status: 403 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const now = new Date()
    const results = { reminders_24h: 0, reminders_2h: 0, errors: 0, candidates_24h: 0, candidates_2h: 0 }

    // ── 24-hour reminders ──
    // Pre-filter SQL window is widened by TZ_PADDING_HOURS in both
    // directions so floating wall-clock events from any AU tz are still
    // captured. The exact 23.5–24.5h diff is enforced per-event below
    // using audience-tz wall-clock now.
    const h24WindowStart = new Date(now.getTime() + (23.5 - TZ_PADDING_HOURS) * 3600 * 1000)
    const h24WindowEnd = new Date(now.getTime() + (24.5 + TZ_PADDING_HOURS) * 3600 * 1000)

    const { data: events24h } = await supabase
      .from('events')
      .select('id, title, date_start, address, timezone, collectives!inner(timezone, slug)')
      .eq('status', 'published')
      .neq('collectives.slug', 'test')
      .gte('date_start', h24WindowStart.toISOString())
      .lte('date_start', h24WindowEnd.toISOString())

    if (events24h?.length) {
      results.candidates_24h = events24h.length
      for (const event of (events24h as unknown) as EventRow[]) {
        if (isTestEvent(event)) continue
        const wallClockNow = wallClockNowInTz(audienceTzFor(event))
        const diffHours = hoursBetween(wallClockNow, new Date(event.date_start))
        if (diffHours < 23.5 || diffHours > 24.5) continue

        const sent = await sendReminders(supabase, event, '24h', 'tomorrow', {
          pushTitle: `${event.title} is tomorrow`,
          pushBody: 'See you there - tap to view details and get directions.',
        })
        results.reminders_24h += sent.sent
        results.errors += sent.errors
      }
    }

    // ── 2-hour reminders ──
    const h2WindowStart = new Date(now.getTime() + (1.5 - TZ_PADDING_HOURS) * 3600 * 1000)
    const h2WindowEnd = new Date(now.getTime() + (2.5 + TZ_PADDING_HOURS) * 3600 * 1000)

    const { data: events2h } = await supabase
      .from('events')
      .select('id, title, date_start, address, timezone, collectives!inner(timezone, slug)')
      .eq('status', 'published')
      .neq('collectives.slug', 'test')
      .gte('date_start', h2WindowStart.toISOString())
      .lte('date_start', h2WindowEnd.toISOString())

    if (events2h?.length) {
      results.candidates_2h = events2h.length
      for (const event of (events2h as unknown) as EventRow[]) {
        if (isTestEvent(event)) continue
        const wallClockNow = wallClockNowInTz(audienceTzFor(event))
        const diffHours = hoursBetween(wallClockNow, new Date(event.date_start))
        if (diffHours < 1.5 || diffHours > 2.5) continue

        const sent = await sendReminders(supabase, event, '2h', 'in 2 hours', {
          pushTitle: `${event.title} starts in 2 hours`,
          pushBody: 'Time to get ready - tap to view details and get directions.',
        })
        results.reminders_2h += sent.sent
        results.errors += sent.errors
      }
    }

    console.log('[event-reminders]', JSON.stringify(results))

    return new Response(JSON.stringify({ success: true, ...results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[event-reminders] Error:', err)
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}))

// ── Send reminders for a single event ──

async function sendReminders(
  supabase: ReturnType<typeof createClient>,
  event: EventRow,
  reminderType: '24h' | '2h',
  timeUntil: string,
  push: { pushTitle: string; pushBody: string },
): Promise<{ sent: number; errors: number }> {
  let sent = 0
  let errors = 0

  // Check which reminders have already been sent for this event + type.
  // A single row covers both email and push delivery for the user/event/type.
  const { data: alreadySent } = await supabase
    .from('email_reminders_sent')
    .select('user_id')
    .eq('event_id', event.id)
    .eq('reminder_type', reminderType)

  const alreadySentIds = new Set((alreadySent ?? []).map((r) => r.user_id))

  // Get all registered attendees (includes 'registered' and 'invited' for reminders;
  // 'attended' / 'cancelled' / 'waitlisted' are excluded - they don't need a heads-up).
  const { data: registrations } = await supabase
    .from('event_registrations')
    .select('user_id, profiles!inner(display_name)')
    .eq('event_id', event.id)
    .in('status', ['registered', 'invited'])

  if (!registrations?.length) return { sent: 0, errors: 0 }

  const eventDate = new Date(event.date_start).toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  // Build the set of pending user IDs (not already sent) for a single batched push call.
  const pendingUserIds: string[] = []
  for (const reg of registrations) {
    if (!alreadySentIds.has(reg.user_id)) pendingUserIds.push(reg.user_id)
  }
  if (pendingUserIds.length === 0) return { sent: 0, errors: 0 }

  // Fire one batched push for the whole event - send-push fans out per token +
  // honours per-user notification prefs (event_reminder toggle, quiet hours).
  // functions.invoke returns { error } on a non-2xx rather than throwing, so the
  // result must be inspected.
  const { error: pushError } = await supabase.functions.invoke('send-push', {
    headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}` },
    // supabase-js >= 2.112.2 drops the Authorization header when the project
    // key is new-format (sb_secret_), so send-push answers a silent 401. Set it
    // explicitly. patterns/unpinned-cdn-import-plus-key-format-migration-is-a-two-input-latent-bug-2026-08-26.md
    headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}` },
    body: {
      userIds: pendingUserIds,
      title: push.pushTitle,
      body: push.pushBody,
      data: {
        type: 'event_reminder',
        event_id: event.id,
        route: `/events/${event.id}`,
      },
    },
  })

  if (pushError) {
    // Leave the tracking rows unwritten and send no email this fire, so the next
    // in-window cron fire cleanly retries the whole unit. Writing a partial state
    // here (email row present, push never recorded) is exactly what produced the
    // duplicate-push storm: the email row does not gate the push, so every later
    // fire re-pushed the user while send-email was down.
    console.error(`[event-reminders] batched push failed for event ${event.id}:`, pushError.message)
    return { sent: 0, errors: pendingUserIds.length }
  }

  // Record push delivery NOW, independently of email. This row is the push
  // idempotency marker - once a user has it they are never re-pushed, even if
  // their reminder email later fails. Email is best-effort from here (a failed
  // email is logged, not retried; retrying would need an absent row, which would
  // re-push). onConflict/ignoreDuplicates makes the write race-safe.
  const { error: markErr } = await supabase
    .from('email_reminders_sent')
    .upsert(
      pendingUserIds.map((user_id) => ({ event_id: event.id, user_id, reminder_type: reminderType })),
      { onConflict: 'event_id,user_id,reminder_type', ignoreDuplicates: true },
    )
  if (markErr) {
    // Could not persist the marker - do not send email (which would leave the
    // push unrecorded and re-push next fire). Retry the whole unit next fire.
    console.error(`[event-reminders] marker write failed for event ${event.id}:`, markErr.message)
    return { sent: 0, errors: pendingUserIds.length }
  }

  // Every pending user has now been pushed + recorded.
  sent = pendingUserIds.length

  // Best-effort reminder email per pushed user (push already delivered).
  for (const reg of registrations) {
    if (alreadySentIds.has(reg.user_id)) continue

    const displayName = (reg as any).profiles?.display_name ?? 'there'
    const { error: emailErr } = await supabase.functions.invoke('send-email', {
      headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}` },
      body: {
        type: 'event_reminder',
        userId: reg.user_id,
        data: {
          name: displayName,
          event_title: event.title,
          event_date: eventDate,
          event_location: event.address ?? '',
          event_url: `https://app.coexistaus.org/events/${event.id}`,
          time_until: timeUntil,
        },
      },
    })
    if (emailErr) {
      console.error(`[event-reminders] reminder email failed for user ${reg.user_id}:`, emailErr.message)
      errors++
    }
  }

  return { sent, errors }
}
