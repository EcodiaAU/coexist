import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { captureException } from '@/lib/sentry'
import { useAuth } from '@/hooks/use-auth'
import { useOffline } from '@/hooks/use-offline'
import { queueOfflineAction } from '@/lib/offline-sync'
import { DIETARY_GATE_QUERY_KEY } from '@/lib/dietary'
import { SPOT_TAKING_TICKET_STATUSES } from '@/lib/event-capacity'

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
  status: 'pending' | 'confirmed' | 'cancelled' | 'refunded' | 'checked_in' | 'reserved'
  price_cents: number
  quantity: number
  ticket_code: string | null
  stripe_checkout_session_id: string | null
  checked_in_at: string | null
  created_at: string
  /** status=reserved only: when the organiser hold lapses (null = until the event) */
  hold_expires_at?: string | null
  reserved_by?: string | null
  reserved_note?: string | null
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

      // Remaining capacity comes from a SECURITY DEFINER RPC, NOT a client-side
      // count of event_tickets. event_tickets SELECT is RLS-locked to
      // tickets_select_own (a member sees only their OWN ticket rows), so
      // counting sold from the client under-counts every other member's
      // purchase and a sold-out event renders "X left" with a live "Get Ticket"
      // CTA. get_event_ticket_availability returns aggregate sold/remaining
      // only (no PII), using the same sold definition as reserve_event_ticket
      // (confirmed + checked_in + non-stale pending), so display and the actual
      // reserve gate agree.
      const { data: avail, error: availErr } = await supabase.rpc(
        'get_event_ticket_availability',
        { p_event_id: eventId },
      )
      if (availErr) throw availErr

      const remainingByType = new Map<string, number | null>()
      for (const row of (avail as Array<{ ticket_type_id: string; remaining: number | null }> | null) ?? []) {
        remainingByType.set(row.ticket_type_id, row.remaining)
      }

      return types.map((t) => ({
        ...t,
        // RPC is authoritative when it knows the type; otherwise fall back to
        // capacity (untracked/unlimited) rather than fabricating a count.
        remaining: remainingByType.has(t.id)
          ? remainingByType.get(t.id)!
          : (t.capacity != null ? t.capacity : null),
      })) as TicketType[]
    },
    enabled: !!eventId,
    staleTime: 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  User's ticket for a specific event                                 */
/* ------------------------------------------------------------------ */

export function useMyEventTicket(eventId: string | undefined, opts?: { poll?: boolean }) {
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
        // 'reserved' included: an invitee must be able to SEE the spot held for
        // them and the pay-to-confirm CTA, not just a confirmed ticket.
        .in('status', ['pending', 'confirmed', 'checked_in', 'reserved'])
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
    // On the Stripe-redirect confirmation page the buyer can return before the
    // payment webhook has written/confirmed the ticket row. Poll every 3s while
    // the row is missing or still pending so the page self-resolves instead of
    // dead-ending on "Ticket not found" / a stuck "Payment processing" banner.
    // The caller bounds the window (see ticket-confirmation.tsx) so this stops.
    refetchInterval: opts?.poll
      ? (query) => {
          const d = query.state.data as EventTicket | null | undefined
          return !d || d.status === 'pending' ? 3000 : false
        }
      : false,
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
        // A held (reserved) spot belongs on My Tickets: it is the surface where
        // the invitee finds it and pays for it.
        .in('status', ['confirmed', 'checked_in', 'reserved'])
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
      promoCode,
    }: {
      eventId: string
      ticketTypeId: string
      quantity?: number
      answers?: Record<string, string | string[] | boolean | number>
      promoCode?: string
    }) => {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {
          type: 'event_ticket',
          event_id: eventId,
          ticket_type_id: ticketTypeId,
          quantity,
          answers: answers ?? null,
          promo_code: promoCode?.trim() || undefined,
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
        // supabase.functions.invoke maps ANY non-2xx to `error`
        // (FunctionsHttpError) with null data, so the edge function's own
        // human messages ("This campout is sold out", "You already have a
        // ticket for this event", "That code is invalid") never reach the
        // result.error path below and members only ever saw the generic
        // "Payment could not start" banner. Read the real message off the
        // response body for business-rule failures (status < 500); keep the
        // generic line only for a genuine server fault or a bodyless failure.
        let serverMsg: string | undefined
        const ctx = (error as { context?: Response }).context
        if (ctx && typeof ctx.status === 'number' && ctx.status < 500 && typeof ctx.json === 'function') {
          try {
            const body = await ctx.clone().json() as { error?: string }
            if (typeof body?.error === 'string' && body.error.trim()) serverMsg = body.error.trim()
          } catch {
            /* body was not JSON - fall through to the generic message */
          }
        }
        throw new Error(
          serverMsg || 'Payment could not start. Nothing was charged - try again or contact us.',
        )
      }

      const result = data as { session_id?: string; url?: string; error?: string; comped?: boolean; ticket_id?: string; event_id?: string }
      // result.error carries app-authored messages from the edge function
      // (e.g. "Sold out", "That code is invalid") - those are already human-readable.
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
    mutationFn: async ({ ticketId }: { ticketId: string; eventId: string }) => {
      // event_tickets has SELECT-only RLS (no UPDATE policy), so a client
      // UPDATE here matched zero rows and reported a false success while the
      // ticket stayed pending. Cancellation goes through an owner-scoped
      // SECURITY DEFINER RPC that flips ONLY the caller's own pending ticket
      // and returns whether a row actually changed.
      const { data, error } = await supabase.rpc('cancel_my_pending_ticket', {
        p_ticket_id: ticketId,
      })
      if (error) throw error
      if (data !== true) {
        throw new Error('That ticket could not be cancelled - it may have already expired or been confirmed.')
      }
    },
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['my-event-ticket', eventId] })
      queryClient.invalidateQueries({ queryKey: ['event-ticket-types', eventId] })
      queryClient.invalidateQueries({ queryKey: ['my-tickets'] })
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
          .find(
            (d) =>
              (d.check_in_code ?? '').toString().trim() === code &&
              d.status !== 'completed' &&
              d.status !== 'cancelled',
          )

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
      // 3-char codes are REUSED: generate_event_check_in_code only guarantees a
      // code is unique among NON-terminal events (status NOT IN completed,
      // cancelled), and prevent_check_in_code_change stops an old event's code
      // ever being cleared - so a completed event keeps its code forever and a
      // new live event can be handed the same one. The lookup must therefore be
      // scoped to that SAME non-terminal set, or a stale completed event shadows
      // the live one. It previously used .maybeSingle() over ALL statuses, which
      // ERRORS on >1 match and took down a whole event's check-in (Corso Park
      // National Tree Day, code 887 collided with a Jan-2025 completed hike,
      // 2026-07-26). Never rely on .maybeSingle() here.
      const { data: matches, error: lookupErr } = await supabase
        .from('events')
        .select('id, title, status, date_start')
        .eq('check_in_code', code)
        .not('status', 'in', '(completed,cancelled)')

      if (lookupErr) throw lookupErr
      if (!matches || matches.length === 0) {
        throw new Error('No event found with that code. Check the code and try again.')
      }

      // Belt-and-braces: if two live events ever share a code, check in to the
      // one happening closest to now (check-in is always day-of).
      const nowMs = Date.now()
      const event = matches.reduce((best, e) =>
        Math.abs(new Date(e.date_start).getTime() - nowMs) <
        Math.abs(new Date(best.date_start).getTime() - nowMs)
          ? e
          : best,
      )

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

      // A fully-blank row the leader added and never filled is ignored; a row
      // with ANY content must be complete. This replaces the old silent
      // name-filter that dropped half-filled tiers on save while toasting
      // success, and blocks the $0 tier that dead-ends guest checkout (Stripe
      // rejects unit_amount 0). Ticketed tiers must be >= A$0.50.
      const isBlankRow = (t: typeof tiers[number]) =>
        !t.name.trim() && !(t.price_dollars || '').trim() && !(t.capacity || '').trim() && !(t.description || '').trim()
      const validTiers = tiers.filter((t) => !isBlankRow(t))
      for (const t of validTiers) {
        if (!t.name.trim()) {
          throw new Error('Give every ticket tier a name, or clear the empty row before saving.')
        }
        const cents = Math.round(parseFloat(t.price_dollars || '0') * 100)
        if (!Number.isFinite(cents) || cents < 50) {
          throw new Error(`"${t.name.trim()}" needs a price of at least $0.50 (free tiers use the claim/invite flow).`)
        }
      }
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

      // "Sold" = seats a valid ticket occupies (confirmed + checked_in), the
      // canonical spot-taking set from @/lib/event-capacity. The event banner
      // renders the same count (event.spots_taken via the event_spots_taken
      // RPC) for a ticketed event, so this panel and the banner cannot diverge.
      const spotTaking = new Set<string>(SPOT_TAKING_TICKET_STATUSES)
      for (const t of tickets) {
        if (spotTaking.has(t.status)) {
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

/* ------------------------------------------------------------------ */
/*  Member self-service: what can I do with MY ticket?                 */
/* ------------------------------------------------------------------ */

export interface TicketSelfService {
  found: boolean
  ticket_id?: string
  status?: string
  price_cents?: number
  is_paid?: boolean
  hold_expires_at?: string | null
  can_refund?: boolean
  can_transfer?: boolean
  refund_cutoff_at?: string | null
  refund_enabled_for_event?: boolean
  transfer_enabled_for_event?: boolean
  blocked_reason?: string | null
}

/**
 * The server decides what a holder may do with their ticket (ownership, status,
 * the per-event enable flags, the refund cutoff). The UI asks; it never derives
 * the policy itself, so the button and the edge function can never disagree.
 */
export function useTicketSelfService(ticketId: string | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['ticket-self-service', ticketId, user?.id],
    queryFn: async (): Promise<TicketSelfService> => {
      if (!ticketId) return { found: false }
      const { data, error } = await supabase.rpc('get_my_ticket_self_service', {
        p_ticket_id: ticketId,
      })
      if (error) throw error
      return (data ?? { found: false }) as TicketSelfService
    },
    enabled: !!ticketId && !!user,
    staleTime: 30 * 1000,
  })
}

/** My outstanding transfer offers for a ticket. */
export function useMyTicketTransfers(ticketId: string | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['ticket-transfers', ticketId, user?.id],
    queryFn: async () => {
      if (!ticketId) return []
      const { data, error } = await supabase
        .from('event_ticket_transfers')
        .select('id, to_email, status, expires_at, created_at')
        .eq('ticket_id', ticketId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!ticketId && !!user,
    staleTime: 30 * 1000,
  })
}

function invalidateTicketSurfaces(queryClient: ReturnType<typeof useQueryClient>, eventId?: string) {
  queryClient.invalidateQueries({ queryKey: ['my-tickets'] })
  queryClient.invalidateQueries({ queryKey: ['ticket-self-service'] })
  queryClient.invalidateQueries({ queryKey: ['ticket-transfers'] })
  if (eventId) {
    queryClient.invalidateQueries({ queryKey: ['my-event-ticket', eventId] })
    queryClient.invalidateQueries({ queryKey: ['event-ticket-types', eventId] })
    queryClient.invalidateQueries({ queryKey: ['event', eventId] })
  }
  queryClient.invalidateQueries({ queryKey: DIETARY_GATE_QUERY_KEY })
}

/** Read the edge function's own human message off a non-2xx response. */
async function selfServiceError(error: unknown, fallback: string): Promise<Error> {
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.status === 'number' && typeof ctx.clone === 'function') {
    try {
      const parsed = await ctx.clone().json() as { error?: string }
      if (typeof parsed?.error === 'string' && parsed.error.trim()) return new Error(parsed.error.trim())
    } catch {
      /* not JSON: fall through */
    }
  }
  return new Error(fallback)
}

/** Refund my own ticket. */
export function useSelfRefundTicket() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ ticketId }: { ticketId: string; eventId?: string }) => {
      const { data, error } = await supabase.functions.invoke('self-service-ticket', {
        body: { action: 'refund', ticket_id: ticketId },
      })
      if (error) {
        captureException(error, { extra: { ticketId, action: 'refund' } })
        throw await selfServiceError(error, 'We could not refund that ticket. Nothing has changed.')
      }
      const result = data as { ok?: boolean; action?: string; error?: string }
      if (result?.error) throw new Error(result.error)
      return result
    },
    onSuccess: (_, { eventId }) => invalidateTicketSurfaces(queryClient, eventId),
  })
}

/** Offer my ticket to someone else by email. */
export function useStartTicketTransfer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ ticketId, toEmail }: { ticketId: string; toEmail: string; eventId?: string }) => {
      const { data, error } = await supabase.functions.invoke('self-service-ticket', {
        body: { action: 'transfer_start', ticket_id: ticketId, to_email: toEmail },
      })
      if (error) {
        captureException(error, { extra: { ticketId, action: 'transfer_start' } })
        throw await selfServiceError(error, 'We could not start that transfer.')
      }
      const result = data as { ok?: boolean; error?: string }
      if (result?.error) throw new Error(result.error)
      return result
    },
    onSuccess: (_, { eventId }) => invalidateTicketSurfaces(queryClient, eventId),
  })
}

/** Withdraw a transfer offer I made. */
export function useCancelTicketTransfer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ transferId }: { transferId: string; eventId?: string }) => {
      const { data, error } = await supabase.functions.invoke('self-service-ticket', {
        body: { action: 'transfer_cancel', transfer_id: transferId },
      })
      if (error) throw await selfServiceError(error, 'We could not withdraw that transfer.')
      const result = data as { ok?: boolean; error?: string }
      if (result?.error) throw new Error(result.error)
      return result
    },
    onSuccess: (_, { eventId }) => invalidateTicketSurfaces(queryClient, eventId),
  })
}

/** Claim a ticket someone transferred to me. */
export function useClaimTicketTransfer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ token }: { token: string }) => {
      const { data, error } = await supabase.functions.invoke('self-service-ticket', {
        body: { action: 'transfer_claim', token },
      })
      if (error) throw await selfServiceError(error, 'We could not claim that ticket.')
      const result = data as { ok?: boolean; ticket_id?: string; event_id?: string; error?: string }
      if (result?.error) throw new Error(result.error)
      return result
    },
    onSuccess: (result) => invalidateTicketSurfaces(queryClient, result?.event_id),
  })
}
