import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/components/toast'
import { useCarpoolRealtime } from '@/hooks/use-carpool-realtime'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/*  TODO: regen types after migration applied - these mirror           */
/*  carpool_widgets / carpool_seats from                               */
/*  20260506010000_carpool_widgets.sql (Worker 1 spec).                */
/* ------------------------------------------------------------------ */

export type CarpoolStatus = 'open' | 'full' | 'cancelled' | 'archived'
export type CarpoolSeatStatus = 'confirmed' | 'cancelled'

export interface CarpoolDriverProfile {
  id: string
  display_name: string | null
  avatar_url: string | null
}

export interface CarpoolWidget {
  id: string
  collective_id: string
  event_id: string
  driver_id: string
  message_id: string | null
  departure_point_text: string
  departure_lat: number | null
  departure_lng: number | null
  departure_time: string
  seats_total: number
  notes: string | null
  status: CarpoolStatus
  created_at: string
  expires_at: string | null
  driver?: CarpoolDriverProfile | null
}

export interface CarpoolSeat {
  id: string
  carpool_id: string
  passenger_id: string
  /** May be null when RLS hides this column for non-driver / non-passenger viewers */
  pickup_address_text: string | null
  pickup_lat: number | null
  pickup_lng: number | null
  status: CarpoolSeatStatus
  created_at: string
  passenger?: CarpoolDriverProfile | null
}

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

export function useCarpool(carpoolId: string | undefined) {
  // Worker 3 (fork_motgygqh_0531ff): subscribe to realtime so seat/widget
  // changes invalidate this query + ['carpool-seats', carpoolId]. See
  // src/hooks/use-carpool-realtime.ts.
  useCarpoolRealtime(carpoolId)

  return useQuery({
    queryKey: ['carpool', carpoolId],
    queryFn: async () => {
      if (!carpoolId) return null

      // TODO: regen types after migration applied - `carpool_widgets`
      // is not yet present in database.types.ts.
      const { data, error } = await (supabase as unknown as {
        from: (table: string) => {
          select: (cols: string) => {
            eq: (col: string, val: string) => {
              maybeSingle: () => Promise<{ data: unknown; error: unknown }>
            }
          }
        }
      })
        .from('carpool_widgets')
        .select(
          '*, driver:profiles!carpool_widgets_driver_id_fkey(id, display_name, avatar_url)',
        )
        .eq('id', carpoolId)
        .maybeSingle()

      if (error) throw error as Error
      return (data as CarpoolWidget | null) ?? null
    },
    enabled: !!carpoolId,
    staleTime: 30 * 1000,
  })
}

export function useCarpoolSeats(carpoolId: string | undefined) {
  return useQuery({
    queryKey: ['carpool-seats', carpoolId],
    queryFn: async () => {
      if (!carpoolId) return []

      // TODO: regen types after migration applied - `carpool_seats`
      // is not yet present in database.types.ts.
      const { data, error } = await (supabase as unknown as {
        from: (table: string) => {
          select: (cols: string) => {
            eq: (col: string, val: string) => {
              order: (col: string, opts: { ascending: boolean }) => Promise<{
                data: unknown
                error: unknown
              }>
            }
          }
        }
      })
        .from('carpool_seats')
        .select(
          '*, passenger:profiles!carpool_seats_passenger_id_fkey(id, display_name, avatar_url)',
        )
        .eq('carpool_id', carpoolId)
        .order('created_at', { ascending: true })

      if (error) throw error as Error
      return (data as CarpoolSeat[] | null) ?? []
    },
    enabled: !!carpoolId,
    staleTime: 15 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Breakout channel for a single carpool                              */
/*                                                                     */
/*  Returns the channel_id for the carpool's breakout group chat       */
/*  (auto-spawned by carpool-save-seat when the first passenger joins).*/
/*  Returns null while no seats taken / channel not yet created.       */
/* ------------------------------------------------------------------ */
export function useCarpoolBreakout(carpoolId: string | undefined) {
  return useQuery({
    queryKey: ['carpool-breakout', carpoolId],
    queryFn: async () => {
      if (!carpoolId) return null
      const { data, error } = await supabase
        .from('carpool_breakout_chats')
        .select('channel_id, archived_at, deleted_at')
        .eq('carpool_id', carpoolId)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) {
        if ((error as { code?: string }).code === '42P01') return null
        if ((error as { code?: string }).code === 'PGRST116') return null
        throw error
      }
      if (!data) return null
      return { channel_id: data.channel_id as string, archived: !!data.archived_at }
    },
    enabled: !!carpoolId,
    staleTime: 15 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Mutations                                                          */
/* ------------------------------------------------------------------ */

export interface CreateCarpoolInput {
  collective_id: string
  event_id: string
  departure_point_text: string
  departure_lat?: number | null
  departure_lng?: number | null
  departure_time: string
  seats_total: number
  notes?: string | null
}

export function useCreateCarpool() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (input: CreateCarpoolInput) => {
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase.functions.invoke(
        'carpool-create-widget',
        {
          body: {
            collective_id: input.collective_id,
            event_id: input.event_id,
            departure_point_text: input.departure_point_text,
            departure_lat: input.departure_lat ?? null,
            departure_lng: input.departure_lng ?? null,
            departure_time: input.departure_time,
            seats_total: input.seats_total,
            notes: input.notes ?? null,
          },
        },
      )

      if (error) throw error
      return data as { id: string; message_id: string | null }
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', input.collective_id] })
      queryClient.invalidateQueries({ queryKey: ['carpools', input.collective_id] })
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Failed to create carpool'
      toast.error(msg)
    },
  })
}

export interface SaveSeatInput {
  carpool_id: string
  pickup_address_text: string
  pickup_lat?: number | null
  pickup_lng?: number | null
}

export function useSaveSeat() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (input: SaveSeatInput) => {
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase.functions.invoke(
        'carpool-save-seat',
        {
          body: {
            carpool_id: input.carpool_id,
            pickup_address_text: input.pickup_address_text,
            pickup_lat: input.pickup_lat ?? null,
            pickup_lng: input.pickup_lng ?? null,
          },
        },
      )

      if (error) throw error
      return data as { id: string; carpool_id: string }
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ['carpool', input.carpool_id] })
      queryClient.invalidateQueries({ queryKey: ['carpool-seats', input.carpool_id] })
      queryClient.invalidateQueries({ queryKey: ['carpool-breakout', input.carpool_id] })
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Failed to save seat'
      toast.error(msg)
    },
  })
}

export interface CancelSeatInput {
  seat_id: string
  /** Used to invalidate the right query keys after the server confirms */
  carpool_id: string
}

export function useCancelSeat() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (input: CancelSeatInput) => {
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase.functions.invoke(
        'carpool-cancel-seat',
        {
          body: { seat_id: input.seat_id },
        },
      )

      if (error) throw error
      return data as { id: string; status: CarpoolSeatStatus }
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ['carpool', input.carpool_id] })
      queryClient.invalidateQueries({ queryKey: ['carpool-seats', input.carpool_id] })
      queryClient.invalidateQueries({ queryKey: ['carpool-breakout', input.carpool_id] })
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Failed to cancel seat'
      toast.error(msg)
    },
  })
}
