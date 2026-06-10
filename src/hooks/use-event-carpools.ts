/**
 * use-event-carpools
 *
 * Worker 3 (fork_motgygqh_0531ff) deliverable for Co-Exist carpool widgets.
 *
 * Fetches the carpool breakout chats associated with an event. Used by the
 * event detail page's "Coordination" subsection to surface tappable links
 * into each active breakout chat. Does NOT include archived/deleted breakouts.
 *
 * Join shape: carpool_breakout_chats.carpool_id → carpool_widgets.id;
 * filter on carpool_widgets.event_id = current event.
 *
 * Worker 1 owns the underlying tables; this hook is contract-only against
 * the canonical schema in SHARED-SPEC.md.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface EventCarpoolBreakout {
  carpool_id: string
  channel_id: string
  channel_name: string
  driver_id: string
  departure_point_text: string
  departure_time: string
  seats_total: number
  seats_taken: number
  status: string
}

export function useEventCarpools(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-carpools', eventId],
    queryFn: async (): Promise<EventCarpoolBreakout[]> => {
      if (!eventId) return []

      // Pull active breakouts for this event. We pivot off carpool_widgets
      // because carpool_breakout_chats has no event_id of its own.
      const { data: widgets, error: widgetsErr } = await supabase
        .from('carpool_widgets')
        .select('id, driver_id, departure_point_text, departure_time, seats_total, status')
        .eq('event_id', eventId)
        .neq('status', 'archived')

      if (widgetsErr) {
        // Tables may not exist yet (Worker 1 lands the migration separately).
        // Treat as empty state, not a hard error, so event detail page renders.
        if ((widgetsErr as { code?: string }).code === '42P01') return []
        throw widgetsErr
      }

      const widgetIds = (widgets ?? []).map((w: { id: string }) => w.id)
      if (widgetIds.length === 0) return []

      const [breakoutsRes, seatsRes] = await Promise.all([
        supabase
          .from('carpool_breakout_chats')
          .select('carpool_id, channel_id, archived_at, deleted_at, chat_channels(name)')
          .in('carpool_id', widgetIds)
          .is('deleted_at', null),
        supabase
          .from('carpool_seats')
          .select('carpool_id, status')
          .in('carpool_id', widgetIds)
          .eq('status', 'confirmed'),
      ])

      if (breakoutsRes.error) {
        if ((breakoutsRes.error as { code?: string }).code === '42P01') return []
        throw breakoutsRes.error
      }
      if (seatsRes.error) {
        if ((seatsRes.error as { code?: string }).code === '42P01') return []
        throw seatsRes.error
      }

      const seatCountByCarpool = new Map<string, number>()
      for (const s of (seatsRes.data ?? []) as { carpool_id: string }[]) {
        seatCountByCarpool.set(s.carpool_id, (seatCountByCarpool.get(s.carpool_id) ?? 0) + 1)
      }

      const breakoutByCarpool = new Map<
        string,
        { channel_id: string; channel_name: string }
      >()
      for (const b of (breakoutsRes.data ?? []) as Array<{
        carpool_id: string
        channel_id: string
        chat_channels: { name: string } | { name: string }[] | null
      }>) {
        const ch = Array.isArray(b.chat_channels) ? b.chat_channels[0] : b.chat_channels
        breakoutByCarpool.set(b.carpool_id, {
          channel_id: b.channel_id,
          channel_name: ch?.name ?? 'Carpool',
        })
      }

      const out: EventCarpoolBreakout[] = []
      for (const w of (widgets ?? []) as Array<{
        id: string
        driver_id: string
        departure_point_text: string
        departure_time: string
        seats_total: number
        status: string
      }>) {
        const breakout = breakoutByCarpool.get(w.id)
        if (!breakout) continue // No breakout chat yet (no seats taken)
        out.push({
          carpool_id: w.id,
          channel_id: breakout.channel_id,
          channel_name: breakout.channel_name,
          driver_id: w.driver_id,
          departure_point_text: w.departure_point_text,
          departure_time: w.departure_time,
          seats_total: w.seats_total,
          seats_taken: seatCountByCarpool.get(w.id) ?? 0,
          status: w.status,
        })
      }

      // Soonest departure first
      out.sort(
        (a, b) =>
          new Date(a.departure_time).getTime() - new Date(b.departure_time).getTime(),
      )
      return out
    },
    enabled: !!eventId,
    staleTime: 30 * 1000,
  })
}
