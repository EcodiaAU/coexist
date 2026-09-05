import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'

/**
 * The ticketed-event waitlist (2026-09-05, Jess: "with tickets being sold out
 * does it generate a waitlist?").
 *
 * Distinct from the FREE-event waitlist in use-events.ts, which lives on
 * event_registrations.status = 'waitlisted' and is promoted by an organiser
 * into a confirmed seat. On a ticketed event nobody can be seated by promotion:
 * a spot frees, the person at the front is emailed a buy link, and the ticket
 * is theirs only once checkout completes. Two different mechanics, deliberately
 * two different tables, so classifyAttendance's roster rules stay intact.
 *
 * Every call goes through a SECURITY DEFINER RPC rather than table access:
 * the queue holds names and email addresses, the logged-out public event page
 * has to be able to join it, and the sold-out gate has to be enforced
 * server-side or the queue fills up behind an open door.
 */

export interface WaitlistState {
  waiting: boolean
  id?: string
  /** 1-based place in the queue. */
  position?: number
  quantity?: number
  notified_at?: string | null
  /** NULL means the event is unbounded and can never sell out. */
  free_seats: number | null
}

export interface WaitlistSummary {
  waiting: number
  notified: number
  converted: number
  removed: number
  /** Total seats wanted by everyone still waiting, not the head count. */
  demand: number
  free_seats: number | null
}

/* ------------------------------------------------------------------ */
/*  My own standing                                                    */
/* ------------------------------------------------------------------ */

/**
 * Where the caller sits on this event's waitlist. Works logged out: pass the
 * email they joined with (the public page keeps it in local state after a
 * join) and the RPC returns only that person's own row, never the queue.
 */
export function useMyWaitlistState(eventId: string | undefined, email?: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['waitlist-state', eventId, user?.id ?? email ?? 'anon'],
    queryFn: async (): Promise<WaitlistState> => {
      const { data, error } = await supabase.rpc('my_event_waitlist_state', {
        p_event_id: eventId!,
        p_email: email ?? undefined,
      })
      if (error) throw error
      // The RPC returns jsonb, which the generated types widen to Json.
      return (data ?? { waiting: false, free_seats: null }) as unknown as WaitlistState
    },
    enabled: !!eventId && (!!user || !!email),
    staleTime: 30 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Joining and leaving                                                */
/* ------------------------------------------------------------------ */

export interface JoinWaitlistInput {
  eventId: string
  email: string
  name?: string | null
  quantity?: number
  ticketTypeId?: string | null
  source?: 'app' | 'public'
}

export function useJoinWaitlist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: JoinWaitlistInput) => {
      const { data, error } = await supabase.rpc('join_event_waitlist', {
        p_event_id: input.eventId,
        p_email: input.email.trim().toLowerCase(),
        p_name: input.name ?? undefined,
        p_quantity: input.quantity ?? 1,
        p_ticket_type_id: input.ticketTypeId ?? undefined,
        p_source: input.source ?? 'app',
      })
      if (error) throw error
      return data as unknown as { id: string; position: number; already_waiting: boolean }
    },
    onSuccess: (_res, input) => {
      queryClient.invalidateQueries({ queryKey: ['waitlist-state', input.eventId] })
      queryClient.invalidateQueries({ queryKey: ['event-waitlist-summary', input.eventId] })
    },
  })
}

export function useLeaveWaitlist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ eventId, email }: { eventId: string; email?: string | null }) => {
      const { data, error } = await supabase.rpc('leave_event_waitlist', {
        p_event_id: eventId,
        p_email: email ?? undefined,
      })
      if (error) throw error
      return data as boolean
    },
    onSuccess: (_res, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['waitlist-state', eventId] })
      queryClient.invalidateQueries({ queryKey: ['event-waitlist-summary', eventId] })
    },
  })
}

/* ------------------------------------------------------------------ */
/*  The organiser's view                                               */
/* ------------------------------------------------------------------ */

/** Counts only. The RPC raises for anyone who is not staff on the event. */
export function useWaitlistSummary(eventId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['event-waitlist-summary', eventId],
    queryFn: async (): Promise<WaitlistSummary | null> => {
      const { data, error } = await supabase.rpc('event_waitlist_summary', { p_event_id: eventId! })
      if (error) {
        // Not staff on this event. A null summary hides the panel rather than
        // surfacing a permission error to someone who was never meant to see it.
        if (error.message?.includes('Not authorised')) return null
        throw error
      }
      return data as unknown as WaitlistSummary
    },
    enabled: !!eventId && enabled,
    staleTime: 60 * 1000,
  })
}

/** The named people waiting, oldest first. Staff-only via RLS on the table. */
export interface WaitlistPerson {
  id: string
  user_id: string | null
  email: string
  name: string | null
  quantity: number
  created_at: string
  notified_at: string | null
  source: string
}

export function useWaitlistPeople(eventId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['event-waitlist-people', eventId],
    queryFn: async (): Promise<WaitlistPerson[]> => {
      const { data, error } = await supabase
        .from('event_waitlist')
        .select('id, user_id, email, name, quantity, created_at, notified_at, source')
        .eq('event_id', eventId!)
        .is('removed_at', null)
        .is('converted_at', null)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as WaitlistPerson[]
    },
    enabled: !!eventId && enabled,
    staleTime: 30 * 1000,
  })
}

/**
 * Remove someone from the queue as an organiser. Soft: the row keeps its
 * demand signal, it just stops being offered spots.
 */
export function useRemoveFromWaitlist() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async ({ id }: { id: string; eventId: string }) => {
      const { error } = await supabase
        .from('event_waitlist')
        .update({ removed_at: new Date().toISOString(), removed_by: user?.id ?? null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_r, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['event-waitlist-people', eventId] })
      queryClient.invalidateQueries({ queryKey: ['event-waitlist-summary', eventId] })
    },
  })
}

/**
 * Email everyone still waiting, regardless of native availability.
 *
 * The only route for an event that sold out on Eventbrite: `event_extras
 * .sold_out` pins native free seats at zero forever, so the automatic sweep
 * correctly never fires and the organiser is the one who knows a spot came
 * back on the other platform.
 */
export function useNotifyWaitlist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ eventId }: { eventId: string }) => {
      const { data, error } = await supabase.functions.invoke('waitlist-notify', {
        body: { event_id: eventId, force: true },
      })
      if (error) throw error
      return data as { ok: boolean; notified: number }
    },
    onSuccess: (_r, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['event-waitlist-people', eventId] })
      queryClient.invalidateQueries({ queryKey: ['event-waitlist-summary', eventId] })
    },
  })
}
