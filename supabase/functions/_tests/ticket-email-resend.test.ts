// Unit tests for the operator resend path (2026-08-26).
// Run: deno test supabase/functions/_tests/ticket-email-resend.test.ts
//
// Grounded in the live case this tool exists for: event_tickets
// 45e658d2-bb40-4747-9bc6-9ef88eb430ab went status='refunded' at
// 2026-08-20T22:44:33Z for $80.00 against pi_3TsHNOCNw9X8EsOR0bJwSkYM on the
// "Wild Mountains Conservation Campout". stripe-webhook answered Stripe 200
// while its send-email call answered 401, and the caller swallowed it. Probed
// 2026-08-26: the holder has exactly ONE resend_events row in all time
// (2026-08-19T23:23:04Z email.delivered, her original ticket) and none on the
// refund day, and event_tickets.updated_at is still 22:44:33.459+00.
//
// Three properties are pinned here, and each of them is a way this went wrong
// once already:
//   1. Running the tool twice sends once. Two guards, tested separately,
//      because they defend against two different actors.
//   2. A non-2xx from send-email THROWS and leaves a row behind. The root
//      cause of the incident is a 401 that nothing recorded and nothing
//      retried, so a quiet return here would rebuild the bug.
//   3. A 200 carrying success:false is NOT a send. send-email answers 200 for
//      a deliberate suppression, so "res.ok" as the predicate would certify a
//      delivery that never happened.
import { assertEquals, assertRejects, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  ResendFailure,
  resendTicketEmail,
  type ResendClient,
  type ResendDeps,
  type SendResponse,
} from '../_shared/ticket-email-resend.ts'

const TICKET_ID = '45e658d2-bb40-4747-9bc6-9ef88eb430ab'
const EVENT_ID = '02947960-dd03-4e93-bd1d-371aaa026b1a'
const USER_ID = '128fb96d-616a-44fc-b649-0610b93a063a'
const EVENT_TITLE = 'Wild Mountains Conservation Campout'
const PROBE = 'code+probe@ecodia.au'

interface TicketRow {
  id: string
  status: string
  event_id: string
  user_id: string
  ticket_code: string | null
  price_cents: number
  refund_notified_at: string | null
}

interface AuditRow {
  id: string
  user_id: string | null
  action: string
  target_type: string | null
  target_id: string | null
  details: Record<string, unknown>
}

/**
 * Minimal PostgREST stand-in over the three tables the module touches. It
 * implements exactly the chains the module uses, including the conditional
 * `.update(...).eq('id', x).is('refund_notified_at', null).select('id')`
 * claim, so the guard is proven in its real query shape.
 */
class FakeDb implements ResendClient {
  tickets = new Map<string, TicketRow>()
  events = new Map<string, Record<string, unknown>>()
  audit: AuditRow[] = []
  /** Every conditional claim attempt, as [ticketId, rowsClaimed]. */
  claimAttempts: Array<[string, number]> = []
  /** Set to make the claim UPDATE error, standing in for a missing column. */
  claimError: unknown = null

  from(table: string) {
    const self = this
    return {
      update(values: Record<string, unknown>) {
        return {
          eq(column: string, value: unknown) {
            const apply = (nullColumn?: string) => {
              if (nullColumn && self.claimError) {
                self.claimAttempts.push([String(value), -1])
                return { data: null, error: self.claimError }
              }
              const touched: Array<{ id: string }> = []
              for (const row of self.rows(table)) {
                const r = row as Record<string, unknown>
                if (r[column] !== value) continue
                if (nullColumn && r[nullColumn] !== null) continue
                Object.assign(row, values)
                touched.push({ id: r.id as string })
              }
              if (nullColumn) self.claimAttempts.push([String(value), touched.length])
              return { data: touched, error: null }
            }
            return {
              select(_columns: string) {
                return Promise.resolve(apply())
              },
              is(nullColumn: string, _null: null) {
                return {
                  select(_columns: string) {
                    return Promise.resolve(apply(nullColumn))
                  },
                }
              },
            }
          },
        }
      },
      insert(values: Record<string, unknown>) {
        if (table !== 'audit_log') throw new Error(`FakeDb cannot insert into ${table}`)
        self.audit.push({
          id: `audit-${self.audit.length + 1}`,
          user_id: (values.user_id as string | null) ?? null,
          action: values.action as string,
          target_type: (values.target_type as string | null) ?? null,
          target_id: (values.target_id as string | null) ?? null,
          details: (values.details ?? {}) as Record<string, unknown>,
        })
        return Promise.resolve({ error: null })
      },
      select(_columns: string) {
        return {
          eq(column: string, value: unknown) {
            const first = self.rows(table).filter(
              (row) => (row as Record<string, unknown>)[column] === value,
            )
            return {
              eq(column2: string, value2: unknown) {
                const both = first.filter(
                  (row) => (row as Record<string, unknown>)[column2] === value2,
                )
                return {
                  limit(n: number) {
                    return Promise.resolve({ data: both.slice(0, n), error: null })
                  },
                }
              },
              maybeSingle() {
                return Promise.resolve({
                  data: (first[0] ?? null) as Record<string, unknown> | null,
                  error: null,
                })
              },
            }
          },
        }
      },
    }
  }

  private rows(table: string): Array<Record<string, unknown>> {
    if (table === 'event_tickets') {
      return [...this.tickets.values()] as unknown as Array<Record<string, unknown>>
    }
    if (table === 'events') return [...this.events.values()]
    if (table === 'audit_log') return this.audit as unknown as Array<Record<string, unknown>>
    throw new Error(`FakeDb has no table ${table}`)
  }
}

interface World {
  db: FakeDb
  sent: Array<Record<string, unknown>>
  deps: ResendDeps
}

function freshWorld(reply: () => SendResponse = () => ({ status: 200, body: { success: true } })): World {
  const db = new FakeDb()
  db.tickets.set(TICKET_ID, {
    id: TICKET_ID,
    status: 'refunded',
    event_id: EVENT_ID,
    user_id: USER_ID,
    ticket_code: 'KECG6FZW',
    price_cents: 8000,
    refund_notified_at: null,
  })
  db.events.set(EVENT_ID, {
    id: EVENT_ID,
    title: EVENT_TITLE,
    date_start: '2026-09-04T14:00:00+00:00',
    address: '487 Philp Mountain Road, Running Creek QLD 4287',
  })
  const sent: Array<Record<string, unknown>> = []
  const deps: ResendDeps = {
    db,
    sendEmail: (payload) => {
      sent.push(payload as unknown as Record<string, unknown>)
      return Promise.resolve(reply())
    },
  }
  return { db, sent, deps }
}

const ARGS = { ticketId: TICKET_ID, nowIso: '2026-08-26T09:40:00.000Z' }

// ---- Property 1: running it twice sends once ----

Deno.test('running the resend twice sends exactly ONE email', async () => {
  const { sent, deps } = freshWorld()

  const first = await resendTicketEmail(deps, ARGS)
  const second = await resendTicketEmail(deps, { ...ARGS, nowIso: '2026-08-26T09:41:00.000Z' })
  const third = await resendTicketEmail(deps, { ...ARGS, nowIso: '2026-08-26T10:02:00.000Z' })

  assertEquals(sent.length, 1, `expected 1 email across 3 runs, got ${sent.length}`)
  assertEquals(first.outcome, 'sent')
  assertEquals(first.sent, true)
  assertEquals(second.outcome, 'already_sent')
  assertEquals(second.sent, false)
  assertEquals(third.outcome, 'already_sent')
})

Deno.test('the guard is persisted state, so a fresh process cannot re-send', async () => {
  const { db, sent, deps } = freshWorld()
  await resendTicketEmail(deps, ARGS)

  // A second operator on a cold process, same database. An in-process flag
  // would not survive this; the claim column and the ledger row do.
  const coldDeps: ResendDeps = {
    db,
    sendEmail: (payload) => {
      sent.push(payload as unknown as Record<string, unknown>)
      return Promise.resolve({ status: 200, body: { success: true } })
    },
  }
  const retry = await resendTicketEmail(coldDeps, ARGS)

  assertEquals(retry.outcome, 'already_sent')
  assertEquals(sent.length, 1)
  assertEquals(db.tickets.get(TICKET_ID)?.refund_notified_at, ARGS.nowIso)
})

Deno.test('the claim is conditional, so this tool and a Stripe retry cannot both win', async () => {
  const { db, deps } = freshWorld()

  // Stripe's own handler got there first and stamped the column.
  db.tickets.get(TICKET_ID)!.refund_notified_at = '2026-08-26T09:00:00.000Z'
  const result = await resendTicketEmail(deps, ARGS)

  assertEquals(result.outcome, 'already_sent')
  assertEquals(db.claimAttempts, [[TICKET_ID, 0]])
  // The webhook's stamp is left alone, not overwritten by the loser.
  assertEquals(db.tickets.get(TICKET_ID)?.refund_notified_at, '2026-08-26T09:00:00.000Z')
})

Deno.test('the ledger guard holds for a template with no claim column of its own', async () => {
  const { db, sent, deps } = freshWorld()
  db.tickets.get(TICKET_ID)!.status = 'confirmed'

  const first = await resendTicketEmail(deps, ARGS)
  const second = await resendTicketEmail(deps, { ...ARGS, nowIso: '2026-08-26T09:45:00.000Z' })

  assertEquals(first.template, 'ticket_confirmation')
  assertEquals(first.outcome, 'sent')
  assertEquals(second.outcome, 'already_sent')
  assertEquals(sent.length, 1)
  // No claim column for this template, so the guard must be the audit ledger.
  assertEquals(db.claimAttempts, [])
})

// ---- Property 2: a non-2xx fails loudly ----

Deno.test('a 401 from send-email THROWS and writes a row', async () => {
  const { db, deps } = freshWorld(() => ({ status: 401, body: { success: false, error: 'Missing authorization' } }))

  const err = await assertRejects(
    () => resendTicketEmail(deps, ARGS),
    ResendFailure,
  )
  assertEquals((err as ResendFailure).stage, 'http')
  assertStringIncludes(err.message, '401')

  // The failure is durable, not just a console line. This is the whole point:
  // the original incident's 401 left nothing behind to find.
  const failures = db.audit.filter((r) => r.action === 'ticket_email_resend_failed')
  assertEquals(failures.length, 1)
  assertEquals(failures[0].target_id, TICKET_ID)
  assertEquals(failures[0].details.status, 401)
  // And no success row was written.
  assertEquals(db.audit.filter((r) => r.action === 'ticket_email_resent').length, 0)
})

Deno.test('a failed send releases the claim so a later attempt can still reach the member', async () => {
  const { db, deps } = freshWorld(() => ({ status: 500, body: { success: false, error: 'Resend error' } }))

  await assertRejects(() => resendTicketEmail(deps, ARGS), ResendFailure)

  // Consuming the notification on a transient failure would cost the member
  // their only telling, which is the outcome this tool exists to undo.
  assertEquals(db.tickets.get(TICKET_ID)?.refund_notified_at, null)
})

Deno.test('after a failure the next run does send, because nothing was consumed', async () => {
  const db = new FakeDb()
  db.tickets.set(TICKET_ID, {
    id: TICKET_ID,
    status: 'refunded',
    event_id: EVENT_ID,
    user_id: USER_ID,
    ticket_code: 'KECG6FZW',
    price_cents: 8000,
    refund_notified_at: null,
  })
  db.events.set(EVENT_ID, { id: EVENT_ID, title: EVENT_TITLE, date_start: null, address: '' })

  const sent: Array<Record<string, unknown>> = []
  let attempt = 0
  const deps: ResendDeps = {
    db,
    sendEmail: (payload) => {
      attempt += 1
      if (attempt === 1) return Promise.resolve({ status: 401, body: { success: false } })
      sent.push(payload as unknown as Record<string, unknown>)
      return Promise.resolve({ status: 200, body: { success: true } })
    },
  }

  await assertRejects(() => resendTicketEmail(deps, ARGS), ResendFailure)
  const recovered = await resendTicketEmail(deps, { ...ARGS, nowIso: '2026-08-26T09:50:00.000Z' })

  assertEquals(recovered.outcome, 'sent')
  assertEquals(sent.length, 1)
})

Deno.test('a claim error THROWS rather than sending unguarded', async () => {
  const { db, deps } = freshWorld()
  // Stands in for the live shape: migration 20260826090000 is not applied, so
  // refund_notified_at does not exist and the conditional UPDATE errors.
  db.claimError = { code: '42703', message: 'column "refund_notified_at" does not exist' }

  const err = await assertRejects(() => resendTicketEmail(deps, ARGS), ResendFailure)
  assertEquals((err as ResendFailure).stage, 'claim')
  assertStringIncludes(err.message, '20260826090000')
  assertEquals(db.audit.filter((r) => r.action === 'ticket_email_resend_failed').length, 1)
})

Deno.test('an unknown ticket THROWS instead of quietly doing nothing', async () => {
  const { deps } = freshWorld()
  const err = await assertRejects(
    () => resendTicketEmail(deps, { ...ARGS, ticketId: '00000000-0000-0000-0000-000000000000' }),
    ResendFailure,
  )
  assertEquals((err as ResendFailure).stage, 'read_ticket')
})

// ---- Property 3: 2xx is not success ----

Deno.test('a 200 carrying success:false is a suppression, not a delivery', async () => {
  const { db, deps } = freshWorld(() => ({
    status: 200,
    body: { success: false, error: 'Template disabled by admin' },
  }))

  const err = await assertRejects(() => resendTicketEmail(deps, ARGS), ResendFailure)
  // A predicate of res.ok alone would have called this a send.
  assertEquals((err as ResendFailure).stage, 'suppressed')
  assertStringIncludes(err.message, 'did not send')
  assertEquals(db.audit.filter((r) => r.action === 'ticket_email_resent').length, 0)
  assertEquals(db.tickets.get(TICKET_ID)?.refund_notified_at, null)
})

Deno.test('a 200 with skipped:true is not a delivery either', async () => {
  const { deps } = freshWorld(() => ({
    status: 200,
    body: { success: false, skipped: true, reason: 'User disabled this notification type' },
  }))
  const err = await assertRejects(() => resendTicketEmail(deps, ARGS), ResendFailure)
  assertEquals((err as ResendFailure).stage, 'suppressed')
})

// ---- The probe send must not disarm the real one ----

Deno.test('a test send exercises the transport without consuming the member notification', async () => {
  const { db, sent, deps } = freshWorld()

  const probe = await resendTicketEmail(deps, { ...ARGS, toOverride: PROBE })

  assertEquals(probe.outcome, 'test_sent')
  assertEquals(probe.recipientOverride, PROBE)
  assertEquals(sent[0].to, PROBE)
  assertEquals(sent[0].userId, undefined, 'a test send must not address the member')
  // Nothing was claimed, so the real send is still available.
  assertEquals(db.tickets.get(TICKET_ID)?.refund_notified_at, null)
  assertEquals(db.claimAttempts, [])

  const real = await resendTicketEmail(deps, { ...ARGS, nowIso: '2026-08-26T09:55:00.000Z' })
  assertEquals(real.outcome, 'sent')
  assertEquals(sent.length, 2)
  assertEquals(sent[1].userId, USER_ID)
})

// ---- The migration backfill, and getting past it deliberately ----

Deno.test('a ticket the migration backfill stamped is blocked until the claim is released', async () => {
  const { db, sent, deps } = freshWorld()
  // This is the live shape as at 2026-08-26T09:50Z: migration 20260826090000
  // ran and set refund_notified_at = updated_at on all 5 refunded tickets,
  // this one included, so the tool correctly refuses by default.
  db.tickets.get(TICKET_ID)!.refund_notified_at = '2026-08-20T22:44:33.459Z'

  const blocked = await resendTicketEmail(deps, ARGS)
  assertEquals(blocked.outcome, 'already_sent')
  assertEquals(sent.length, 0)

  const released = await resendTicketEmail(deps, { ...ARGS, releaseClaim: true })
  assertEquals(released.outcome, 'sent')
  assertEquals(sent.length, 1)
  // The deliberate override is on the record, not just in someone's memory.
  const releases = db.audit.filter((r) => r.action === 'ticket_email_resend_claim_released')
  assertEquals(releases.length, 1)
  assertEquals(releases[0].target_id, TICKET_ID)
})

Deno.test('releasing the claim does NOT get past a genuine prior send', async () => {
  const { sent, deps } = freshWorld()

  const first = await resendTicketEmail(deps, ARGS)
  assertEquals(first.outcome, 'sent')

  // The ledger is the backstop, so the release flag cannot become a
  // one-flag double-send.
  const second = await resendTicketEmail(deps, {
    ...ARGS,
    releaseClaim: true,
    nowIso: '2026-08-26T10:10:00.000Z',
  })
  assertEquals(second.outcome, 'already_sent')
  assertEquals(sent.length, 1)
})

// ---- The email itself ----

Deno.test('the resent email names the event, the amount and the ticket', async () => {
  const { sent, deps } = freshWorld()
  await resendTicketEmail(deps, ARGS)

  assertEquals(sent.length, 1)
  assertEquals(sent[0].type, 'ticket_refunded')
  const data = sent[0].data as Record<string, unknown>
  assertEquals(data.event_title, EVENT_TITLE)
  assertEquals(data.refund_amount, '80.00')
  assertEquals(data.currency, 'AUD')
  assertEquals(data.ticket_code, 'KECG6FZW')
  assertStringIncludes(String(data.event_date), '2026')
})
