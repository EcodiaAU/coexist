/**
 * use-event-carpools
 *
 * Worker 3 (fork_motgygqh_0531ff) deliverable for Co-Exist carpool widgets.
 *
 * Fetches the carpool offers for an event, for the event detail page's
 * "Coordination" subsection. Returns BOTH:
 *   - carpools that already have a breakout chat (join to tap into), and
 *   - open offers with seats but no breakout yet (a "Save me a seat" entry).
 *
 * The second case is the fix for backlog F2 "Carpool with open seats invisible
 * until someone joins": a breakout chat is only spawned on the first passenger
 * (carpool-save-seat), so a freshly-posted "3 seats" offer had no breakout and
 * was dropped entirely. It now surfaces so a passenger can claim the first seat.
 *
 * Excludes archived/deleted breakouts and archived widgets.
 */
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'

export interface EventCarpoolBreakout {
  carpool_id: string
  /** null until a breakout chat exists (i.e. until the first seat is taken). */
  channel_id: string | null
  channel_name: string | null
  driver_id: string
  driver_name: string | null
  departure_point_text: string
  departure_time: string
  seats_total: number
  seats_taken: number
  status: string
  /** True when the current viewer is the driver of this offer. */
  viewer_is_driver: boolean
}

export function useEventCarpools(eventId: string | undefined) {
  const { user } = useAuth()
  const viewerId = user?.id ?? null

  return useQuery({
    queryKey: ['event-carpools', eventId, viewerId],
    queryFn: async (): Promise<EventCarpoolBreakout[]> => {
      if (!eventId) return []

      // Pull active offers for this event. We pivot off carpool_widgets
      // because carpool_breakout_chats has no event_id of its own.
      const { data: widgets, error: widgetsErr } = await supabase
        .from('carpool_widgets')
        .select(
          'id, driver_id, departure_point_text, departure_time, seats_total, status, driver:profiles!carpool_widgets_driver_id_fkey(display_name)',
        )
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
        driver: { display_name: string | null } | { display_name: string | null }[] | null
      }>) {
        // Include the offer whether or not a breakout chat exists yet. When it
        // does, we deep-link into the chat; when it does not, we surface a
        // "Save me a seat" entry (the breakout is spawned on first seat).
        const breakout = breakoutByCarpool.get(w.id)
        const driver = Array.isArray(w.driver) ? w.driver[0] : w.driver
        out.push({
          carpool_id: w.id,
          channel_id: breakout?.channel_id ?? null,
          channel_name: breakout?.channel_name ?? null,
          driver_id: w.driver_id,
          driver_name: driver?.display_name ?? null,
          departure_point_text: w.departure_point_text,
          departure_time: w.departure_time,
          seats_total: w.seats_total,
          seats_taken: seatCountByCarpool.get(w.id) ?? 0,
          status: w.status,
          viewer_is_driver: !!viewerId && w.driver_id === viewerId,
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
