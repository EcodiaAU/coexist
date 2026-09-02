import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/* Event capacity is enforced in Postgres, so the invariant cannot be exercised
   from a vitest process. What CAN be pinned here is the shape of the migration
   that carries it, because every one of these clauses is load-bearing and the
   defect they fix was silent: an over-capacity registration succeeded, returned
   no error, and showed the member a confirmation.

   The behavioural proof is supabase/tests/event-capacity-enforcement.sql, which
   runs against a real database and scored 6/11 before this migration and 11/11
   after. This file is the drift guard, not the proof. */

const MIGRATION = resolve(
  __dirname,
  '../../supabase/migrations/20260902000000_event_capacity_hard_enforce.sql',
)
const sql = readFileSync(MIGRATION, 'utf8')

describe('event capacity enforcement migration', () => {
  /* The whole defect in one line. handle_event_registration was wired BEFORE
     INSERT only, so every UPDATE into 'registered' skipped it: the RSVP RPC's
     update branch, an accepted invite, a re-registration after cancelling, and
     a bare PostgREST PATCH (the RLS update policy has no WITH CHECK). */
  it('wires the trigger to UPDATE as well as INSERT', () => {
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE ON public\.event_registrations/)
    // and it must be the same single trigger, not a second one racing the first
    expect(sql).toContain('DROP TRIGGER IF EXISTS on_event_registration')
    expect(sql.match(/CREATE TRIGGER on_event_registration/g)).toHaveLength(1)
  })

  /* Without this guard the 149 members already registered on a capacity-100
     event would be demoted to the waitlist the next time any column on their
     row was touched. Existing seats are never re-litigated; only a row ENTERING
     the registered set is. */
  it('never re-checks a row that already holds its seat', () => {
    expect(sql).toContain("IF TG_OP = 'UPDATE' AND OLD.status = 'registered' THEN")
    expect(sql).toMatch(/IF NEW\.status IS DISTINCT FROM 'registered' THEN\s+RETURN NEW;/)
  })

  /* An unlocked SELECT COUNT(*) lets two concurrent claims on the last seat
     both read the same stale number. The lock is per event so an organiser
     editing the event does not block sign-ups. */
  it('serialises seat claims per event', () => {
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain('hashtextextended(NEW.event_id::text, 0)')
  })

  /* Must agree with GOING_REGISTRATION_STATUSES in src/lib/event-capacity.ts.
     Counting only 'registered' would let checked-in attendees free up seats
     they are standing in. */
  it('counts the same going set the rest of the app counts', () => {
    expect(sql).toContain("status IN ('registered', 'attended')")
  })

  /* Ticketed events price and cap their seats through event_ticket_types; the
     ticket gate owns capacity there and auto-waitlisting would strand a paid
     ticket-holder off the roster. */
  it('leaves ticketed events to the ticket gate', () => {
    expect(sql).toContain('IF v_is_ticketed IS TRUE THEN')
  })

  /* The promotion is an UPDATE, so it now passes through the capacity trigger
     and is demoted straight back when the event is still over capacity. Sending
     the notification unconditionally would tell someone they were in while
     their row stayed waitlisted. */
  it('only notifies a promoted member if the promotion actually landed', () => {
    expect(sql).toContain("IF promoted_status = 'registered' THEN")
    const notifyAt = sql.indexOf("'waitlist_promoted'")
    const guardAt = sql.indexOf("IF promoted_status = 'registered' THEN")
    expect(guardAt).toBeGreaterThan(-1)
    expect(notifyAt).toBeGreaterThan(guardAt)
  })

  /* handle_announcement_rsvp used to return action='registered' unconditionally.
     After the trigger change that is a lie whenever the event is full. */
  it('makes the RSVP rpc report the status that was actually written', () => {
    expect(sql).toMatch(/SELECT status INTO v_status/)
    expect(sql).toContain("CASE WHEN v_status = 'waitlisted' THEN 'waitlisted' ELSE 'registered' END")
  })
})
