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
 * Uses `event_day_notifications_sent` tracking table to prevent duplicates.
 */

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
    const results = { starting_soon: 0, happening_now: 0, errors: 0 }

    // ── "Starting soon" (event starts in 15-35 minutes) ──
    const soonStart = new Date(now.getTime() + 15 * 60 * 1000)
    const soonEnd = new Date(now.getTime() + 35 * 60 * 1000)

    const { data: soonEvents } = await supabase
      .from('events')
      .select('id, title, date_start, address, activity_type, collective_id')
      .eq('status', 'published')
      .gte('date_start', soonStart.toISOString())
      .lte('date_start', soonEnd.toISOString())

    if (soonEvents?.length) {
      for (const event of soonEvents) {
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

    // ── "Happening now" (event started in the last 15 minutes) ──
    const nowStart = new Date(now.getTime() - 15 * 60 * 1000)

    const { data: nowEvents } = await supabase
      .from('events')
      .select('id, title, date_start, date_end, address, activity_type, collective_id')
      .eq('status', 'published')
      .gte('date_start', nowStart.toISOString())
      .lte('date_start', now.toISOString())

    if (nowEvents?.length) {
      for (const event of nowEvents) {
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

interface EventRow {
  id: string
  title: string
  date_start: string
  date_end?: string | null
  address: string | null
  activity_type: string
  collective_id: string
}

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
