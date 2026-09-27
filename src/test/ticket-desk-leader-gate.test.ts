import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { canManageEventTickets, TICKET_DESK_REFUSAL } from '../../supabase/functions/_shared/can-manage-tickets'

/**
 * Leader ticket-desk powers (Tate, urgent, 2026-09-27): a campout LEADER
 * (an active collective_members row, role leader/co_leader/assist_leader, on
 * a collective that hosts the event) can issue a free ticket, hold a spot,
 * and remove/refund a holder, instead of every action routing to an admin.
 *
 * Backed by public.can_manage_event_tickets(p_uid, p_event_id) (migration
 * 20260927120000), called identically from:
 *   - the three ticket-desk edge functions (grant/reserve/revoke-event-ticket),
 *     via the shared _shared/can-manage-tickets.ts helper, so the SERVER gate
 *     and this repo's helper cannot drift, and
 *   - src/pages/events/event-detail.tsx's TicketSalesSection, via the same
 *     rpc name and argument shape, so the UI buttons this test locks can
 *     never disagree with what the edge functions actually allow.
 *
 * transfer-event-ticket is DELIBERATELY untouched (still manager/admin only):
 * moving a ticket between events is a cross-event, cross-collective op this
 * task scoped out, and a widened button in front of an unwidened function
 * would just be a 403 the leader could not explain.
 */

const repo = (rel: string) => path.resolve(__dirname, '../..', rel)
const read = (rel: string) => readFileSync(repo(rel), 'utf-8')

const stripComments = (body: string) =>
  body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const MIGRATION = 'supabase/migrations/20260927120000_can_manage_event_tickets.sql'
const GRANT_FN = 'supabase/functions/grant-event-ticket/index.ts'
const RESERVE_FN = 'supabase/functions/reserve-event-spot/index.ts'
const REVOKE_FN = 'supabase/functions/revoke-event-ticket/index.ts'
const TRANSFER_FN = 'supabase/functions/transfer-event-ticket/index.ts'
const HELPER = 'supabase/functions/_shared/can-manage-tickets.ts'
const EVENT_DETAIL = 'src/pages/events/event-detail.tsx'

const TICKET_DESK_SITES = [GRANT_FN, RESERVE_FN, REVOKE_FN] as const

/* ------------------------------------------------------------------ */
/*  can_manage_event_tickets: the migration                            */
/* ------------------------------------------------------------------ */

describe('can_manage_event_tickets migration', () => {
  const sql = read(MIGRATION)

  it('defines a STABLE SECURITY DEFINER function with the pinned search_path', () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.can_manage_event_tickets\(p_uid uuid, p_event_id uuid\)/,
    )
    expect(sql).toMatch(/RETURNS boolean/)
    expect(sql).toMatch(/STABLE SECURITY DEFINER/)
    expect(sql).toMatch(/SET search_path TO 'public'/)
  })

  it('guards the identity argument like is_collective_staff: null id, or the caller/trusted-backend check', () => {
    expect(sql).toMatch(/WHEN p_uid IS NULL THEN false/)
    expect(sql).toMatch(
      /WHEN p_uid IS NOT DISTINCT FROM auth\.uid\(\) OR public\.is_trusted_backend_caller\(\) THEN/,
    )
    // ELSE false: every branch is strictly boolean, never an implicit NULL that
    // would itself be an oracle (patterns/a-null-comparison-is-the-whole-guard...).
    expect(sql).toMatch(/ELSE false/)
  })

  it('is true for a global manager/admin (profiles.role), same as the functions it replaces', () => {
    expect(sql).toMatch(/FROM profiles\s*\n\s*WHERE id = p_uid AND role::text IN \('manager', 'admin'\)/)
  })

  it('is true for an active leader/co_leader/assist_leader of ANY collective hosting the event', () => {
    expect(sql).toMatch(/FROM collective_members cm/)
    expect(sql).toMatch(/cm\.status = 'active'/)
    expect(sql).toMatch(/cm\.role IN \('leader', 'co_leader', 'assist_leader'\)/)
    // Every host, not just the primary: event_hosts unions the primary
    // collective_id with accepted collective_event_collaborators rows.
    expect(sql).toMatch(/SELECT eh\.collective_id FROM event_hosts eh WHERE eh\.event_id = p_event_id/)
  })

  it('locks down execution: no public/anon, authenticated + service_role only', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.can_manage_event_tickets\(uuid, uuid\) FROM public, anon/,
    )
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.can_manage_event_tickets\(uuid, uuid\) TO authenticated, service_role/,
    )
  })
})

/* ------------------------------------------------------------------ */
/*  The shared helper: fails closed, never opens on a broken check     */
/* ------------------------------------------------------------------ */

describe('canManageEventTickets: the shared edge-function helper', () => {
  function fakeSupabase(rpcResult: { data: unknown; error: { message: string } | null }) {
    return { rpc: vi.fn().mockResolvedValue(rpcResult) }
  }

  it('passes p_uid and p_event_id to the can_manage_event_tickets rpc', async () => {
    const supabase = fakeSupabase({ data: true, error: null })
    await canManageEventTickets(supabase, 'caller-1', 'event-1')
    expect(supabase.rpc).toHaveBeenCalledWith('can_manage_event_tickets', {
      p_uid: 'caller-1',
      p_event_id: 'event-1',
    })
  })

  it('returns true only when the rpc answers true', async () => {
    expect(await canManageEventTickets(fakeSupabase({ data: true, error: null }), 'u', 'e')).toBe(true)
  })

  it('returns false when the rpc answers false', async () => {
    expect(await canManageEventTickets(fakeSupabase({ data: false, error: null }), 'u', 'e')).toBe(false)
  })

  it('FAILS CLOSED on an rpc error: never true because a check broke', async () => {
    expect(
      await canManageEventTickets(fakeSupabase({ data: null, error: { message: 'network blip' } }), 'u', 'e'),
    ).toBe(false)
  })

  it('treats anything other than a strict boolean true as false (no truthy-string laundering)', async () => {
    expect(await canManageEventTickets(fakeSupabase({ data: 'true', error: null }), 'u', 'e')).toBe(false)
    expect(await canManageEventTickets(fakeSupabase({ data: 1, error: null }), 'u', 'e')).toBe(false)
    expect(await canManageEventTickets(fakeSupabase({ data: null, error: null }), 'u', 'e')).toBe(false)
  })

  it('the refusal message names who CAN act, not just who was refused', () => {
    expect(TICKET_DESK_REFUSAL).toMatch(/leaders/)
    expect(TICKET_DESK_REFUSAL).toMatch(/admins/)
  })
})

/* ------------------------------------------------------------------ */
/*  The three ticket-desk edge functions: shared gate, correct order    */
/* ------------------------------------------------------------------ */

describe('the ticket-desk edge functions call the shared leader gate', () => {
  for (const site of TICKET_DESK_SITES) {
    it(`${site} imports canManageEventTickets from the shared helper`, () => {
      const body = stripComments(read(site))
      expect(body).toMatch(/from '\.\.\/_shared\/can-manage-tickets\.ts'/)
      expect(body).toMatch(/canManageEventTickets/)
      expect(body).toMatch(/TICKET_DESK_REFUSAL/)
    })

    it(`${site} no longer authorises inline off profiles.role alone`, () => {
      const body = stripComments(read(site))
      // The OLD gate this class replaces: `callerRole !== 'manager' && ... !==
      // 'admin'` (or the equivalent inlined on callerProfile?.role). A leader
      // would never pass that check no matter what the DB says.
      expect(body).not.toMatch(/role\s*!==\s*'manager'\s*&&/)
      expect(body).not.toMatch(/Only managers and admins can/)
    })

    it(`${site} authorizes with the RPC, not by re-deriving role logic locally`, () => {
      const body = stripComments(read(site))
      expect(body).toMatch(/canManageEventTickets\(supabase, caller\.id, /)
      expect(body).toMatch(/if \(!authorized\) return json\(\{ error: TICKET_DESK_REFUSAL \}, 403\)/)
    })
  }

  it('grant-event-ticket and reserve-event-spot authorize against body.event_id, validated first', () => {
    for (const site of [GRANT_FN, RESERVE_FN]) {
      const body = stripComments(read(site))
      const eventIdCheck = body.indexOf("UUID_RE.test(body.event_id)")
      const authCall = body.indexOf('canManageEventTickets(supabase, caller.id, body.event_id)')
      expect(eventIdCheck, `${site} must validate body.event_id`).toBeGreaterThan(-1)
      expect(authCall, `${site} must authorize against body.event_id`).toBeGreaterThan(-1)
      expect(eventIdCheck, `${site} must validate the event id BEFORE authorizing against it`)
        .toBeLessThan(authCall)
    }
  })

  it('revoke-event-ticket loads the ticket FIRST, then authorizes against ticket.event_id (it only knows ticket_id)', () => {
    const body = stripComments(read(REVOKE_FN))
    const loadTicket = body.indexOf("from('event_tickets')")
    const notFound = body.indexOf("if (!ticket) return json({ error: 'Ticket not found' }, 404)")
    const authCall = body.indexOf('canManageEventTickets(supabase, caller.id, ticket.event_id)')
    expect(loadTicket, 'must load the ticket').toBeGreaterThan(-1)
    expect(notFound, 'must 404 a missing ticket before authorizing on it').toBeGreaterThan(-1)
    expect(authCall, 'must authorize against ticket.event_id, not body.event_id').toBeGreaterThan(-1)
    expect(loadTicket, 'load must precede the 404 check').toBeLessThan(notFound)
    expect(notFound, '404 check must precede authorization').toBeLessThan(authCall)
    // Never falls back to authorizing against something the caller supplied
    // directly - the whole point is the event comes from the LOADED ticket.
    expect(body).not.toMatch(/canManageEventTickets\(supabase, caller\.id, body\./)
  })

  it('each site fails closed: the authorization check happens before any mutating action', () => {
    const mutatingMarkers: Record<string, RegExp> = {
      [GRANT_FN]: /auth\.admin\.createUser/,
      [RESERVE_FN]: /rpc\('reserve_spot_for_user'/,
      [REVOKE_FN]: /stripe\.refunds\.create/,
    }
    for (const site of TICKET_DESK_SITES) {
      const body = stripComments(read(site))
      const authCall = body.search(/if \(!authorized\) return json/)
      const mutate = body.search(mutatingMarkers[site])
      expect(authCall, `${site} must call the gate`).toBeGreaterThan(-1)
      expect(mutate, `${site} must contain its mutating action`).toBeGreaterThan(-1)
      expect(authCall, `${site} authorizes before it mutates anything`).toBeLessThan(mutate)
    }
  })

  it('every successful action writes an audit_log row naming the caller and the event', () => {
    const actionNames: Record<string, string> = {
      [GRANT_FN]: 'event_ticket_granted',
      [RESERVE_FN]: 'event_ticket_reserved',
      [REVOKE_FN]: 'event_ticket_revoked',
    }
    for (const site of TICKET_DESK_SITES) {
      const body = stripComments(read(site))
      expect(body).toMatch(/from\('audit_log'\)\.insert\(/)
      expect(body).toMatch(new RegExp(`action: '${actionNames[site]}'`))
      expect(body).toMatch(/user_id: caller\.id/)
      expect(body).toMatch(/target_type: 'event_ticket'/)
    }
  })
})

/* ------------------------------------------------------------------ */
/*  transfer-event-ticket: deliberately untouched                      */
/* ------------------------------------------------------------------ */

describe('transfer-event-ticket is deliberately left manager/admin only', () => {
  it('still gates on profiles.role, never on the new leader rpc', () => {
    const body = stripComments(read(TRANSFER_FN))
    expect(body).toMatch(/callerProfile\?\.role !== 'manager' && callerProfile\?\.role !== 'admin'/)
    expect(body).not.toMatch(/can-manage-tickets/)
    expect(body).not.toMatch(/canManageEventTickets/)
  })
})

/* ------------------------------------------------------------------ */
/*  event-detail.tsx: the UI gate matches the server gate exactly      */
/* ------------------------------------------------------------------ */

describe('TicketSalesSection: the leader-widened gate and the untouched transfer gate', () => {
  const body = stripComments(read(EVENT_DETAIL))

  it('queries the SAME rpc, with the SAME argument names, as the edge functions authorize against', () => {
    expect(body).toMatch(/supabase\.rpc\('can_manage_event_tickets', \{/)
    expect(body).toMatch(/p_uid: user\.id/)
    expect(body).toMatch(/p_event_id: eventId/)
  })

  it('widens canManageTickets to isManager || isAdmin || the leader rpc result', () => {
    expect(body).toMatch(
      /const canManageTickets = isManager \|\| isAdmin \|\| isEventLeader === true/,
    )
  })

  it('does NOT widen canTransferTickets: transfer stays manager/admin only', () => {
    expect(body).toMatch(/const canTransferTickets = isManager \|\| isAdmin(?!\s*\|\|)/)
  })

  it('skips the rpc call entirely for a global manager/admin (no redundant network round trip)', () => {
    expect(body).toMatch(/enabled: !isManager && !isAdmin && !!user && !!eventId/)
  })

  it('gates Issue ticket, the remove/refund button, and IssueTicketSheet on the WIDENED flag', () => {
    expect(body).toMatch(/canManageTickets && \(\s*<button[\s\S]{0,80}onClick=\{\(\) => setIssueOpen\(true\)\}/)
    expect(body).toMatch(/canManageTickets && isLive && \(/)
    expect(body).toMatch(/canManageTickets && \(\s*<IssueTicketSheet/)
  })

  it('gates Move all, the per-ticket transfer button, and TransferTicketSheet on the UNWIDENED flag', () => {
    expect(body).toMatch(/canTransferTickets && movableCount > 0 && \(/)
    expect(body).toMatch(
      /canTransferTickets && \(t\.status === 'confirmed' \|\| t\.status === 'checked_in'\) && \(/,
    )
    expect(body).toMatch(/canTransferTickets && transfer && \(\s*<TransferTicketSheet/)
  })
})
