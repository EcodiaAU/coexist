// Unit tests for the reserve_event_ticket error router (2026-09-05).
// Run: deno test supabase/functions/_tests/reserve-error.test.ts
//
// Grounded in the live incident it was written for. Co-Exist added their first
// REQUIRED event_ticket_question ("Dietary Requirements?") to the Grampians
// Campout Retreat at 2026-09-04 06:14Z. Probed against the deployed
// create-checkout the next morning, project tjutlbzekfouwsiaplbr, event
// 5e353f36 / tier c3a1032a as a signed-in member:
//   answers: null        -> HTTP 500 {"error":"Failed to reserve ticket"}
//   answers: {q:'None'}  -> HTTP 200 + cs_live_ Stripe session URL
// The 500 is what a member saw as "Edge Function returned a non-2xx status
// code", because the client hook only reads a response body for status < 500.
//
// Every RAISE string asserted below is copied from the live
// `pg_get_functiondef` output of reserve_event_ticket and
// validate_ticket_answers, not from memory.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { routeReserveError } from '../_shared/reserve-error.ts'

Deno.test('missing required answer is a 400 naming the question', () => {
  // validate_ticket_answers: RAISE EXCEPTION 'Missing required answer: %'
  //   USING ERRCODE='23514'
  const r = routeReserveError({
    message: 'Missing required answer: Dietary Requirements?',
    code: '23514',
  })
  assertEquals(r.status, 400)
  assertEquals(r.message, 'Missing required answer: Dietary Requirements?')
  assertEquals(r.unmapped, false)
})

Deno.test('SQLSTATE alone is enough when the body carries no message', () => {
  // PostgREST has not always populated `message` the same way across versions,
  // so the code path must stand on its own.
  const r = routeReserveError({ message: '', code: '23514' })
  assertEquals(r.status, 400)
  assertEquals(r.unmapped, false)
})

Deno.test('the message alone is enough when the body carries no code', () => {
  const r = routeReserveError({ message: 'Missing required answer: Consent', code: null })
  assertEquals(r.status, 400)
  assertEquals(r.message, 'Missing required answer: Consent')
})

Deno.test('sold out stays a 409 carrying its remaining count', () => {
  const r = routeReserveError({ message: 'Sold out - only 0 tickets remaining', code: 'P0001' })
  assertEquals(r.status, 409)
  assertEquals(r.message, 'Sold out - only 0 tickets remaining')
  assertEquals(r.unmapped, false)
})

Deno.test('both ends of the sale window are a 400', () => {
  // The old create-checkout test was msg.includes('not on sale'), which matches
  // the opening RAISE and MISSES the closing one, so a closed sale window 500'd
  // exactly like a missing answer did. This is the regression guard for that.
  const yet = routeReserveError({ message: 'Tickets not on sale yet', code: 'P0001' })
  assertEquals(yet.status, 400)
  assertEquals(yet.unmapped, false)

  const ended = routeReserveError({ message: 'Ticket sales have ended', code: 'P0001' })
  assertEquals(ended.status, 400)
  assertEquals(ended.message, 'Ticket sales have ended')
  assertEquals(ended.unmapped, false)
})

Deno.test('a deactivated tier is a 404, not a server fault', () => {
  const r = routeReserveError({ message: 'Ticket type not found or inactive', code: 'P0001' })
  assertEquals(r.status, 404)
  assertEquals(r.unmapped, false)
})

Deno.test('an unrecognised failure keeps its 500 and asks to be logged', () => {
  // Positive control for the residual path: it must NOT leak the raw text to a
  // member, and it MUST flag itself so the caller writes it to the edge log.
  const r = routeReserveError({ message: 'Failed to generate unique ticket code', code: 'P0001' })
  assertEquals(r.status, 500)
  assertEquals(r.unmapped, true)
  assertEquals(r.message, 'Could not reserve a ticket. Nothing was charged.')
})

Deno.test('a null or empty error still routes rather than throwing', () => {
  for (const err of [null, undefined, {}]) {
    const r = routeReserveError(err as never)
    assertEquals(r.status, 500)
    assertEquals(r.unmapped, true)
  }
})
