// _shared/reserve-error.ts - route a reserve_event_ticket failure to the right
// HTTP status instead of collapsing it into an opaque 500.
//
// WHY THIS EXISTS. `reserve_event_ticket` RAISEs for six distinct reasons, and
// every caller used to pattern-match two of them ('Sold out', 'not on sale')
// and turn the other four into `500 {"error":"Failed to reserve ticket"}` with
// no logging at all. A 500 is the one status the client hook deliberately does
// NOT read a body from (use-event-tickets.ts only parses status < 500), so the
// member is shown the bare FunctionsHttpError string, "Edge Function returned a
// non-2xx status code", and nothing anywhere records why.
//
// That fired for real on 2026-09-04. Co-Exist added their first REQUIRED
// event_ticket_question ("Dietary Requirements?") to the Grampians Campout
// Retreat at 06:14Z. `validate_ticket_answers`, which runs inside the reserve
// RPC, RAISEs SQLSTATE 23514 when a required question has no answer. Any client
// posting `answers: null` - an app bundle predating the questions modal - hit
// that raise, got a 500, and saw the raw string. Three attempts at 13:39-13:41Z
// produced three 500s in the edge log and not one line saying what went wrong.
//
// Two rules come out of it, and they are what this module encodes:
//   1. A business-rule RAISE is a 4xx carrying its own message. The RPC already
//      writes member-readable text ("Missing required answer: Dietary
//      Requirements?"); throwing it away and substituting "Failed to reserve
//      ticket" is the whole defect.
//   2. A residual 500 must be LOGGED. An unmapped failure that says nothing to
//      the member must at least say something to us.
//
// Note the sale-window gap this also closes: 'Ticket sales have ended' does not
// contain the substring 'not on sale', so create-checkout's old test missed it
// and a closed sale window 500'd exactly like a missing answer did.

/** The RAISEs `reserve_event_ticket` can produce, mapped to their status. */
export interface ReserveErrorRoute {
  /** HTTP status to return to the client. */
  status: number
  /** Message safe to show a member. The RPC's own text when it is one we know. */
  message: string
  /** True when the cause is unrecognised and the caller should log the raw error. */
  unmapped: boolean
}

/** Shape of the error supabase-js hands back from `.rpc()`. */
export interface RpcError {
  message?: string | null
  code?: string | null
}

const GENERIC = 'Could not reserve a ticket. Nothing was charged.'

/**
 * Classify a reserve_event_ticket error.
 *
 * Matches on SQLSTATE first where the RPC sets one (23514 for a missing
 * required answer) and falls back to the RAISE text, because a PostgREST error
 * body has carried `code` inconsistently across versions and the text is the
 * contract the RPC actually guarantees.
 */
export function routeReserveError(err: RpcError | null | undefined): ReserveErrorRoute {
  const message = (err?.message ?? '').trim()
  const code = (err?.code ?? '').trim()
  const lower = message.toLowerCase()

  // Missing required custom answer. check_violation raised by
  // validate_ticket_answers, which names the question in the message.
  if (code === '23514' || lower.startsWith('missing required answer')) {
    return { status: 400, message: message || 'A required question has not been answered.', unmapped: false }
  }

  // Capacity. 'Sold out - only N tickets remaining'.
  if (lower.includes('sold out')) {
    return { status: 409, message, unmapped: false }
  }

  // Sale window, both ends. 'Tickets not on sale yet' / 'Ticket sales have ended'.
  if (lower.includes('not on sale') || lower.includes('sales have ended')) {
    return { status: 400, message, unmapped: false }
  }

  // Tier vanished or was deactivated between page load and checkout.
  if (lower.includes('not found or inactive')) {
    return { status: 404, message, unmapped: false }
  }

  // Anything else is a genuine fault: a generic message to the member, and the
  // caller logs the raw error so the next one is diagnosable from the edge log.
  return { status: 500, message: GENERIC, unmapped: true }
}
