import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { captureException } from '@/lib/sentry'
import { useAuth } from '@/hooks/use-auth'
import { useOffline } from '@/hooks/use-offline'
import { queueOfflineAction } from '@/lib/offline-sync'
import { DIETARY_GATE_QUERY_KEY } from '@/lib/dietary'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TicketType {
  id: string
  event_id: string
  name: string
  description: string | null
  price_cents: number
  capacity: number | null
  sale_start: string | null
  sale_end: string | null
  is_active: boolean
  sort_order: number
  /** Computed: remaining tickets (null = unlimited) */
  remaining: number | null
}

export interface EventTicket {
  id: string
  event_id: string
  ticket_type_id: string
  user_id: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'refunded' | 'checked_in'
  price_cents: number
  quantity: number
  ticket_code: string | null
  stripe_checkout_session_id: string | null
  checked_in_at: string | null
  created_at: string
  /** Joined */
  ticket_type_name?: string
  event_title?: string
  event_date?: string
  event_address?: string
  event_cover_image?: string | null
}

/* ------------------------------------------------------------------ */
/*  Ticket types for an event (with remaining capacity)                */
/* ------------------------------------------------------------------ */

export function useEventTicketTypes(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-ticket-types', eventId],
    queryFn: async () => {
      if (!eventId) return []

      const { data: types, error } = await supabase
        .from('event_ticket_types')
        .select('*')
        .eq('event_id', eventId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (error) throw error
      if (!types?.length) return []

      // Count sold tickets per type (pending + confirmed + checked_in)
      const typeIds = types.map((t) => t.id)
      const { data: soldData } = await supabase
        .from('event_tickets')
        .select('ticket_type_id, quantity')
        .in('ticket_type_id', typeIds)
        .in('status', ['pending', 'confirmed', 'checked_in'])

      const soldByType = new Map<string, number>()
      for (const row of soldData ?? []) {
        soldByType.set(
          row.ticket_type_id,
          (soldByType.get(row.ticket_type_id) ?? 0) + (row.quantity ?? 1),
        )
      }

      return types.map((t) => ({
        ...t,
        remaining: t.capacity != null ? Math.max(0, t.capacity - (soldByType.get(t.id) ?? 0)) : null,
      })) as TicketType[]
    },
    enabled: !!eventId,
    staleTime: 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  User's ticket for a specific event                                 */
/* ------------------------------------------------------------------ */

export function useMyEventTicket(eventId: string | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['my-event-ticket', eventId, user?.id],
    queryFn: async () => {
      if (!eventId || !user) return null

      const { data, error } = await supabase
        .from('event_tickets')
        .select('*, event_ticket_types(name)')
        .eq('event_id', eventId)
        .eq('user_id', user.id)
        .in('status', ['pending', 'confirmed', 'checked_in'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      if (!data) return null

      return {
        ...data,
        ticket_type_name: (data.event_ticket_types as unknown as { name: string } | null)?.name ?? null,
      } as EventTicket
    },
    enabled: !!eventId && !!user,
    staleTime: 30 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  All user tickets (my tickets page)                                 */
/* ------------------------------------------------------------------ */

export function useMyTickets() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['my-tickets', user?.id],
    queryFn: async () => {
      if (!user) return []

      const { data, error } = await supabase
        .from('event_tickets')
        .select('*, event_ticket_types(name), events(title, date_start, address, cover_image_url)')
        .eq('user_id', user.id)
        .in('status', ['confirmed', 'checked_in'])
        .order('created_at', { ascending: false })

      if (error) throw error

      return (data ?? []).map((t) => ({
        ...t,
        ticket_type_name: (t.event_ticket_types as unknown as { name: string } | null)?.name ?? null,
        event_title: (t.events as unknown as { title: string } | null)?.title ?? null,
        event_date: (t.events as unknown as { date_start: string } | null)?.date_start ?? null,
        event_address: (t.events as unknown as { address: string } | null)?.address ?? null,
        event_cover_image: (t.events as unknown as { cover_image_url: string | null } | null)?.cover_image_url ?? null,
      })) as EventTicket[]
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Create ticket checkout (calls Edge Function)                       */
/* ------------------------------------------------------------------ */

export function useCreateTicketCheckout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      eventId,
      ticketTypeId,
      quantity = 1,
      answers,
    }: {
      eventId: string
      ticketTypeId: string
      quantity?: number
      answers?: Record<string, string | string[] | boolean | number>
    }) => {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {
          type: 'event_ticket',
          event_id: eventId,
          ticket_type_id: ticketTypeId,
          quantity,
          answers: answers ?? null,
        },
      })

      if (error) {
        // QA P3-5: surfacing the raw FunctionsHttpError ("Edge Function
        // returned a non-2xx status code") to the toast is meaningless to
        // members. Log the raw error for diagnosis, throw a human message.
        // No charge has occurred at this point - the Stripe session was
        // never created/returned.
        console.error('[create-ticket-checkout] edge function error:', error)
        captureException(error, { extra: { eventId, ticketTypeId, quantity } })
        throw new Error(
          'Payment could not start. Nothing was charged - try again or contact us.',
        )
      }

      const result = data as { session_id: string; url: string; error?: string }
      // result.error carries app-authored messages from the edge function
      // (e.g. "Sold out") - those are already human-readable.
      if (result.error) throw new Error(result.error)

      return result
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['event-ticket-types', variables.eventId] })
      queryClient.invalidateQueries({ queryKey: ['my-event-ticket', variables.eventId] })
      queryClient.invalidateQueries({ queryKey: ['my-tickets'] })
      // A new ticket (even pending) can make the dietary gate eligible.
      queryClient.invalidateQueries({ queryKey: DIETARY_GATE_QUERY_KEY })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Admin: all tickets for an event                                    */
/* ------------------------------------------------------------------ */

export function useEventTickets(eventId: string | undefined) {
  return useQuery({
    queryKey: ['admin-event-tickets', eventId],
    queryFn: async () => {
      if (!eventId) return []

      const { data, error } = await supabase
        .from('event_tickets')
        .select('*, event_ticket_types(name), profiles:user_id(display_name, first_name, last_name, avatar_url, email)')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data ?? []
    },
    enabled: !!eventId,
    staleTime: 30 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Cancel a pending ticket (user abandoned checkout)                   */
/* ------------------------------------------------------------------ */

export function useCancelPendingTicket() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ ticketId, eventId }: { ticketId: string; eventId: string }) => {
      const { error } = await supabase
        .from('event_tickets')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', ticketId)
        .eq('status', 'pending')
      if (error) throw error
    },
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['my-event-ticket', eventId] })
      queryClient.invalidateQueries({ queryKey: ['event-ticket-types', eventId] })
      queryClient.invalidateQueries({ queryKey: ['my-tickets'] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Ticket check-in (scan QR code → check in)                         */
/* ------------------------------------------------------------------ */

/**
 * Check in a ticket by its code. Updates both the ticket status
 * and the event_registration to maintain compatibility with the
 * existing attendee/impact flow.
 */
export function useTicketCheckIn() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ ticketCode, eventId }: { ticketCode: string; eventId: string }) => {
      // Look up the ticket by code
      const { data: ticket, error: lookupErr } = await supabase
        .from('event_tickets')
        .select('id, event_id, user_id, status')
        .eq('ticket_code', ticketCode.toUpperCase().trim())
        .maybeSingle()

      if (lookupErr) throw lookupErr
      if (!ticket) throw new Error('Ticket not found. Check the code and try again.')
      if (ticket.event_id !== eventId) throw new Error('This ticket is for a different event.')
      if (ticket.status === 'checked_in') throw new Error('Already checked in.')
      if (ticket.status !== 'confirmed') throw new Error(`Ticket status is "${ticket.status}" - cannot check in.`)

      // Update ticket status
      const { error: updateErr } = await supabase
        .from('event_tickets')
        .update({
          status: 'checked_in',
          checked_in_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', ticket.id)
        .eq('status', 'confirmed')

      if (updateErr) throw updateErr

      // Update event_registration to 'attended' (for impact/attendee flow)
      await supabase
        .from('event_registrations')
        .update({
          status: 'attended',
          checked_in_at: new Date().toISOString(),
        })
        .eq('event_id', ticket.event_id)
        .eq('user_id', ticket.user_id)
        .in('status', ['registered', 'invited'])

      return { ticketId: ticket.id, userId: ticket.user_id }
    },
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-event-tickets', eventId] })
      queryClient.invalidateQueries({ queryKey: ['ticket-sales-summary', eventId] })
      queryClient.invalidateQueries({ queryKey: ['event-attendees', eventId] })
      queryClient.invalidateQueries({ queryKey: ['event', eventId] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  3-digit code check-in (replaces QR scanning)                       */
/* ------------------------------------------------------------------ */

/**
 * Check in a user by the event's 3-digit check_in_code.
 * Flow: user enters code -> look up event by check_in_code -> check in user.
 */
export function useCodeCheckIn() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { isOffline } = useOffline()

  return useMutation({
    mutationFn: async ({ checkInCode }: { checkInCode: string }) => {
      if (!user) throw new Error('Not authenticated')

      const code = checkInCode.trim()

      // ── OFFLINE PATH ──
      // If offline, resolve eventId from the persisted query cache (event
      // detail rows hold the check_in_code). If found, queue a check-in
      // action - queueOfflineAction auto-stamps client_action_id so server
      // replay is idempotent. Optimistic UI flip in onSuccess below shows
      // the participant their CTA card flip to "checked in" without a
      // network round-trip.
      // Origin: 1.8.6 feature 4 (Tate verbatim event-day SMS, 10 May 2026).
      if (isOffline) {
        const cached = queryClient
          .getQueriesData<unknown>({ queryKey: ['event'] })
          .map(([, data]) => data)
          .filter(
            (d): d is { id: string; check_in_code?: string | null; status?: string } =>
              !!d &&
              typeof d === 'object' &&
              'id' in (d as Record<string, unknown>) &&
              'check_in_code' in (d as Record<string, unknown>),
          )
          .find((d) => (d.check_in_code ?? '').toString().trim() === code)

        if (!cached) {
          throw new Error("You're offline and we can't verify the code right now. Reconnect to check in.")
        }
        if (cached.status === 'cancelled') throw new Error('This event has been cancelled.')
        if (cached.status === 'draft') throw new Error('This event is not active yet.')

        queueOfflineAction('check-in', {
          eventId: cached.id,
          userId: user.id,
          // 3-digit code check-in is always a self path; flag it so the
          // offline replay handler upserts a row when none exists yet
          // (walk-up that registered + signed in on the day with no wifi).
          isSelf: true,
          timestamp: new Date().toISOString(),
        })
        return { eventId: cached.id, userId: user.id }
      }

      // ── ONLINE PATH ──
      const { data: event, error: lookupErr } = await supabase
        .from('events')
        .select('id, title, status')
        .eq('check_in_code', code)
        .maybeSingle()

      if (lookupErr) throw lookupErr
      if (!event) throw new Error('No event found with that code. Check the code and try again.')

      if (event.status === 'cancelled') throw new Error('This event has been cancelled.')
      if (event.status === 'draft') throw new Error('This event is not active yet.')

      const { data: registration, error: regErr } = await supabase
        .from('event_registrations')
        .select('status, checked_in_at')
        .eq('event_id', event.id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (regErr) throw regErr

      if (registration?.status === 'attended' && registration.checked_in_at) {
        throw new Error('Already checked in.')
      }

      // UPSERT instead of UPDATE: a walk-up who never tapped Register
      // gets registered + checked in atomically. The BE day-of trigger
      // (enforce_event_day_check_in_window) is BEFORE UPDATE, so INSERTs
      // bypass it - which is what we want for day-of walk-ups. UPDATEs
      // (existing registered / waitlisted / cancelled rows being flipped
      // to attended) still hit the trigger and are rejected on the wrong
      // day. Per Tate 2026-05-23 Co-Exist incident.
      const nowIso = new Date().toISOString()
      const { error: upsertErr } = await supabase
        .from('event_registrations')
        .upsert(
          {
            event_id: event.id,
            user_id: user.id,
            status: 'attended',
            checked_in_at: nowIso,
            registered_at: nowIso,
          },
          { onConflict: 'event_id,user_id' },
        )

      if (upsertErr) throw upsertErr

      return { eventId: event.id, userId: user.id }
    },
    onSuccess: (result) => {
      if (result) {
        // Optimistic flip on the cached event detail row: user_registration
        // becomes 'attended' so the participant's CTA card on event-detail
        // immediately shows "You're checked in!" rather than waiting for
        // refetch (especially important when offline-queued).
        queryClient.setQueriesData<unknown>(
          { queryKey: ['event', result.eventId] },
          (old: unknown) => {
            if (!old || typeof old !== 'object') return old
            const row = old as Record<string, unknown> & {
              user_registration?: { status?: string; checked_in_at?: string | null } | null
            }
            if (!row.user_registration) return old
            return {
              ...row,
              user_registration: {
                ...row.user_registration,
                status: 'attended',
                checked_in_at: new Date().toISOString(),
              },
            }
          },
        )
        queryClient.invalidateQueries({ queryKey: ['event-attendees', result.eventId] })
        queryClient.invalidateQueries({ queryKey: ['event', result.eventId] })
        queryClient.invalidateQueries({ queryKey: ['my-events'] })
        queryClient.invalidateQueries({ queryKey: ['home', 'my-upcoming-events'] })
      }
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Admin: save ticket types (upsert existing + insert new + deactive) */
/* ------------------------------------------------------------------ */

export interface TicketTypeDraft {
  /** DB id for existing rows, temp id for new ones */
  id: string
  name: string
  description: string
  price_dollars: string
  capacity: string
  is_active: boolean
  /** True if this row already exists in the database */
  _persisted?: boolean
}

export function useSaveTicketTypes() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      eventId,
      tiers,
      removedIds,
      isTicketed,
    }: {
      eventId: string
      tiers: TicketTypeDraft[]
      removedIds: string[]
      isTicketed: boolean
    }) => {
      // Update the event's is_ticketed flag
      const { error: evtErr } = await supabase
        .from('events')
        .update({ is_ticketed: isTicketed })
        .eq('id', eventId)
      if (evtErr) throw evtErr

      // Deactivate removed tiers
      if (removedIds.length > 0) {
        const { error: delErr } = await supabase
          .from('event_ticket_types')
          .update({ is_active: false })
          .in('id', removedIds)
        if (delErr) throw delErr
      }

      // Upsert existing + insert new tiers
      const validTiers = tiers.filter((t) => t.name.trim())
      for (let idx = 0; idx < validTiers.length; idx++) {
        const t = validTiers[idx]
        const row = {
          name: t.name.trim(),
          description: t.description.trim() || null,
          price_cents: Math.round(parseFloat(t.price_dollars || '0') * 100),
          capacity: t.capacity ? parseInt(t.capacity, 10) : null,
          sort_order: idx,
          is_active: t.is_active,
        }

        if (t._persisted) {
          const { error } = await supabase
            .from('event_ticket_types')
            .update(row)
            .eq('id', t.id)
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('event_ticket_types')
            .insert({ ...row, event_id: eventId })
          if (error) throw error
        }
      }
    },
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['event-ticket-types', eventId] })
      queryClient.invalidateQueries({ queryKey: ['admin-event-tickets', eventId] })
      queryClient.invalidateQueries({ queryKey: ['ticket-sales-summary', eventId] })
      queryClient.invalidateQueries({ queryKey: ['event', eventId] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  Admin: ticket sales summary for an event                           */
/* ------------------------------------------------------------------ */

export function useTicketSalesSummary(eventId: string | undefined) {
  return useQuery({
    queryKey: ['ticket-sales-summary', eventId],
    queryFn: async () => {
      if (!eventId) return null

      const { data: tickets, error } = await supabase
        .from('event_tickets')
        .select('status, price_cents, quantity, ticket_type_id')
        .eq('event_id', eventId)

      if (error) throw error
      if (!tickets?.length) return { totalRevenue: 0, totalSold: 0, totalCheckedIn: 0, byType: {} as Record<string, { sold: number; revenue: number }> }

      let totalRevenue = 0
      let totalSold = 0
      let totalCheckedIn = 0
      const byType: Record<string, { sold: number; revenue: number }> = {}

      for (const t of tickets) {
        if (t.status === 'confirmed' || t.status === 'checked_in') {
          totalRevenue += t.price_cents
          totalSold += t.quantity
          if (t.status === 'checked_in') totalCheckedIn += t.quantity

          if (!byType[t.ticket_type_id]) byType[t.ticket_type_id] = { sold: 0, revenue: 0 }
          byType[t.ticket_type_id].sold += t.quantity
          byType[t.ticket_type_id].revenue += t.price_cents
        }
      }

      return { totalRevenue, totalSold, totalCheckedIn, byType }
    },
    enabled: !!eventId,
    staleTime: 30 * 1000,
  })
}
