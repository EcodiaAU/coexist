// Deno Edge Function
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * event-day-notify - Scheduled Supabase Edge Function
 *
 * Called by pg_cron every 15 minutes. Finds events starting within the next
 * 30 minutes and sends push notifications to all registered attendees
 * who haven't checked in yet.
 *
 * Two notification types:
 *   1. "Event starting soon" - 30 minutes before event start
 *   2. "Event is happening now" - at event start time
 *
 * Floating-local timezone model (since 2026-05-26):
 *   `events.date_start` is wall-clock-as-UTC. The "30 min before" and
 *   "happening now" windows must be evaluated against the audience's
 *   wall-clock now (collective IANA tz), not real UTC, or pushes fire the
 *   audience-offset hours late (10h late AEST, 8h late AWST, etc). See
 *   event-reminders for the same fix.
 *
 * Uses `event_day_notifications_sent` tracking table to prevent duplicates.
 */

// Widest AU UTC offset we cover with the SQL pre-filter padding.
const TZ_PADDING_HOURS = 12

interface EventRow {
  id: string
  title: string
  date_start: string
  date_end?: string | null
  address: string | null
  activity_type: string
  collective_id: string
  timezone: string | null
  collectives: { timezone: string | null } | null
}

function audienceTzFor(event: EventRow): string {
  const eTz = event.timezone
  if (eTz && eTz !== 'UTC') return eTz
  return event.collectives?.timezone || 'Australia/Brisbane'
}

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

function minutesBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (60 * 1000)
}

Deno.serve(async (req: Request) => {
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
    const results = { starting_soon: 0, happening_now: 0, errors: 0, candidates_soon: 0, candidates_now: 0 }

    // ── "Starting soon" (audience wall-clock: 15-35 min before start) ──
    // SQL window widened by TZ_PADDING_HOURS each side; exact window
    // enforced per-event using audience-tz wall-clock now.
    const soonWindowStart = new Date(now.getTime() + (15 * 60 - TZ_PADDING_HOURS * 3600) * 1000)
    const soonWindowEnd = new Date(now.getTime() + (35 * 60 + TZ_PADDING_HOURS * 3600) * 1000)

    const { data: soonEvents } = await supabase
      .from('events')
      .select('id, title, date_start, address, activity_type, collective_id, timezone, collectives(timezone)')
      .eq('status', 'published')
      .gte('date_start', soonWindowStart.toISOString())
      .lte('date_start', soonWindowEnd.toISOString())

    if (soonEvents?.length) {
      results.candidates_soon = soonEvents.length
      for (const event of (soonEvents as unknown) as EventRow[]) {
        const wallClockNow = wallClockNowInTz(audienceTzFor(event))
        const diffMinutes = minutesBetween(wallClockNow, new Date(event.date_start))
        if (diffMinutes < 15 || diffMinutes > 35) continue

        const sent = await notifyAttendees(
          supabase,
          event,
          'starting_soon',
          `${event.title} starts soon!`,
          `Your event starts in about 30 minutes. Tap to view details and get directions.`,
        )
        results.starting_soon += sent.sent
        results.errors += sent.errors
      }
    }

    // ── "Happening now" (audience wall-clock: started 0-15 min ago) ──
    const nowWindowStart = new Date(now.getTime() - (15 * 60 + TZ_PADDING_HOURS * 3600) * 1000)
    const nowWindowEnd = new Date(now.getTime() + TZ_PADDING_HOURS * 3600 * 1000)

    const { data: nowEvents } = await supabase
      .from('events')
      .select('id, title, date_start, date_end, address, activity_type, collective_id, timezone, collectives(timezone)')
      .eq('status', 'published')
      .gte('date_start', nowWindowStart.toISOString())
      .lte('date_start', nowWindowEnd.toISOString())

    if (nowEvents?.length) {
      results.candidates_now = nowEvents.length
      for (const event of (nowEvents as unknown) as EventRow[]) {
        const wallClockNow = wallClockNowInTz(audienceTzFor(event))
        const diffMinutes = minutesBetween(wallClockNow, new Date(event.date_start))
        // event started in last 15 min: date_start <= wallClockNow and (wallClockNow - date_start) <= 15min
        // diffMinutes = wallClockNow -> date_start, so diffMinutes in [-15, 0]
        if (diffMinutes > 0 || diffMinutes < -15) continue

        const sent = await notifyAttendees(
          supabase,
          event,
          'happening_now',
          `${event.title} is happening now!`,
          `The event has started. Tap to check in and earn your points!`,
        )
        results.happening_now += sent.sent
        results.errors += sent.errors
      }
    }

    console.log('[event-day-notify]', JSON.stringify(results))

    return new Response(JSON.stringify({ success: true, ...results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[event-day-notify] Error:', err)
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})

// ── Notify all registered attendees for a single event ──

async function notifyAttendees(
  supabase: ReturnType<typeof createClient>,
  event: EventRow,
  notifType: 'starting_soon' | 'happening_now',
  title: string,
  body: string,
): Promise<{ sent: number; errors: number }> {
  let sent = 0
  let errors = 0

  // Check which notifications have already been sent
  const { data: alreadySent } = await supabase
    .from('event_day_notifications_sent')
    .select('user_id')
    .eq('event_id', event.id)
    .eq('notification_type', notifType)

  const alreadySentIds = new Set((alreadySent ?? []).map((r: { user_id: string }) => r.user_id))

  // Get registered attendees who haven't checked in
  const { data: registrations } = await supabase
    .from('event_registrations')
    .select('user_id')
    .eq('event_id', event.id)
    .in('status', ['registered', 'invited'])
    .is('checked_in_at', null)

  if (!registrations?.length) return { sent: 0, errors: 0 }

  // Filter out already-notified users
  const toNotify = registrations
    .map((r: { user_id: string }) => r.user_id)
    .filter((id: string) => !alreadySentIds.has(id))

  if (!toNotify.length) return { sent: 0, errors: 0 }

  try {
    // Send push notification to all target users via the send-push function
    const pushType = notifType === 'starting_soon' ? 'event_reminder' : 'event_updated'
    await supabase.functions.invoke('send-push', {
      body: {
        userIds: toNotify,
        title,
        body,
        data: {
          type: pushType,
          event_id: event.id,
        },
      },
    })

    // Also create in-app notifications
    // Note: read_at defaults to null in the DB schema - do NOT pass a `read` column
    const notifications = toNotify.map((userId: string) => ({
      user_id: userId,
      type: pushType,
      title,
      body,
      data: { event_id: event.id },
    }))

    await supabase.from('notifications').insert(notifications)

    // Track sent notifications to prevent duplicates
    const tracking = toNotify.map((userId: string) => ({
      event_id: event.id,
      user_id: userId,
      notification_type: notifType,
    }))

    await supabase.from('event_day_notifications_sent').insert(tracking)

    sent = toNotify.length
  } catch (err) {
    console.error(`[event-day-notify] Failed for event ${event.id}:`, (err as Error).message)
    errors = toNotify.length
  }

  return { sent, errors }
}
