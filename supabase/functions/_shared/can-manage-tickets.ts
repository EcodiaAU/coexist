/**
 * canManageEventTickets - shared ticket-desk authorisation for the three
 * ticket-management edge functions (grant-event-ticket, reserve-event-spot,
 * revoke-event-ticket).
 *
 * Delegates to public.can_manage_event_tickets(p_uid, p_event_id) (migration
 * 20260927120000_can_manage_event_tickets.sql): true for a global
 * manager/admin, OR an active leader/co_leader/assist_leader of any
 * collective that hosts the event (event_hosts: the primary collective plus
 * any accepted collective_event_collaborators row). Replaces the old
 * `profiles.role in ('manager','admin')` inline check that these three
 * functions each carried, which routed every campout leader's ticket action
 * (issue a free ticket, hold a spot, remove/refund a holder) to an admin even
 * on events their own collective hosts.
 *
 * The caller here is always the SERVICE-ROLE client (these functions never
 * forward the member's own JWT to Postgres), so `is_trusted_backend_caller()`
 * is true inside the RPC and it answers truthfully about the id passed as
 * p_uid - the AUTHENTICATED CALLER's own id in every call site, never a
 * third party's.
 *
 * FAILS CLOSED: an RPC error (network blip, unexpected shape) returns false,
 * never true. A ticket action silently permitted because the authorisation
 * check itself broke is a worse failure than a manager getting a spurious
 * 403 and retrying.
 */
// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any

export async function canManageEventTickets(
  supabase: AnySupabaseClient,
  callerId: string,
  eventId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('can_manage_event_tickets', {
    p_uid: callerId,
    p_event_id: eventId,
  })
  if (error) {
    console.error('[can-manage-tickets] rpc failed:', error.message)
    return false
  }
  return data === true
}

/** Member-readable refusal, consistent across all three ticket-desk functions. */
export const TICKET_DESK_REFUSAL =
  "Only this event's leaders and Co-Exist admins can manage its tickets"
