// Unit tests for the event-ticket refund notification (2026-08-26).
// Run: deno test supabase/functions/_tests/ticket-refund-notify.test.ts
//
// Grounded in a live case: event_tickets 45e658d2-bb40-4747-9bc6-9ef88eb430ab
// went status='refunded' at 2026-08-20T22:44:33Z for $80.00 against
// pi_3TsHNOCNw9X8EsOR0bJwSkYM on the "Wild Mountains Conservation Campout"
// (events 02947960-dd03-4e93-bd1d-371aaa026b1a). The holder was never told.
//
// Two defects are pinned here:
//   1. The refund email named an "order #45e658d2" and never named the event,
//      the amount in context, or where the money goes. A ticket is not an order.
//   2. charge.refunded carried NO idempotence marker, so every Stripe retry of
//      the same event re-sent the email. Stripe retries on any non-2xx and on
//      its own schedule, so this is a live four-emails-to-one-member risk.
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  notifyTicketRefund,
  type RefundEmail,
  type RefundNotifyClient,
} from '../_shared/ticket-refund-notify.ts'

const TICKET_ID = '45e658d2-bb40-4747-9bc6-9ef88eb430ab'
const EVENT_ID = '02947960-dd03-4e93-bd1d-371aaa026b1a'
const USER_ID = '128fb96d-616a-44fc-b649-0610b93a063a'
const EVENT_TITLE = 'Wild Mountains Conservation Campout'

interface TicketRow {
  id: string
  status: string
  updated_at: string | null
  refund_notified_at: string | null
}

/**
 * Minimal PostgREST stand-in over two in-memory tables. It implements exactly
 * the chains the module uses, including the conditional
 * `.update(...).eq('id', x).is('refund_notified_at', null).select('id')`
 * claim, so the idempotence guard is proven in its real query shape rather
 * than in a paraphrase of it.
 */
class FakeDb implements RefundNotifyClient {
  tickets = new Map<string, TicketRow>()
  events = new Map<string, Record<string, unknown>>()
  /** Every conditional claim attempt, as [ticketId, rowsClaimed]. */
  claimAttempts: Array<[string, number]> = []

  from(table: string) {
    const self = this
    return {
      update(values: Record<string, unknown>) {
        return {
          eq(column: string, value: unknown) {
            const apply = (nullColumn?: string) => {
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
      select(_columns: string) {
        return {
          eq(column: string, value: unknown) {
            return {
              maybeSingle() {
                const hit = self.rows(table).find(
                  (row) => (row as Record<string, unknown>)[column] === value,
                )
                return Promise.resolve({
                  data: (hit ?? null) as Record<string, unknown> | null,
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
    if (table === 'event_tickets') return [...this.tickets.values()] as unknown as Array<Record<string, unknown>>
    if (table === 'events') return [...this.events.values()]
    throw new Error(`FakeDb has no table ${table}`)
  }
}

function freshWorld() {
  const db = new FakeDb()
  db.tickets.set(TICKET_ID, {
    id: TICKET_ID,
    status: 'confirmed',
    updated_at: null,
    refund_notified_at: null,
  })
  db.events.set(EVENT_ID, {
    id: EVENT_ID,
    title: EVENT_TITLE,
    date_start: '2026-09-04T14:00:00+00:00',
    address: '487 Philp Mountain Road, Running Creek QLD 4287',
  })
  const sent: RefundEmail[] = []
  const deps = {
    db,
    sendEmail: (email: RefundEmail) => {
      sent.push(email)
      return Promise.resolve({ ok: true, suppressed: false })
    },
  }
  return { db, sent, deps }
}

const ARGS = {
  ticketId: TICKET_ID,
  eventId: EVENT_ID,
  userId: USER_ID,
  ticketCode: 'CE-WM-0042',
  amountRefundedCents: 8000,
  nowIso: '2026-08-20T22:44:33.459Z',
}

// ---- Defect 2: Stripe replays charge.refunded; the member must get ONE email ----

Deno.test('replaying the same charge.refunded sends exactly ONE email', async () => {
  const { sent, deps } = freshWorld()

  const first = await notifyTicketRefund(deps, ARGS)
  const second = await notifyTicketRefund(deps, { ...ARGS, nowIso: '2026-08-20T22:45:10.000Z' })
  const third = await notifyTicketRefund(deps, { ...ARGS, nowIso: '2026-08-20T22:51:02.000Z' })

  assertEquals(sent.length, 1, `expected 1 email across 3 deliveries, got ${sent.length}`)
  assertEquals(first.sent, true)
  assertEquals(second.sent, false)
  assertEquals(second.outcome, 'already_notified')
  assertEquals(third.outcome, 'already_notified')
})

Deno.test('the idempotence guard is a persisted marker, not an in-memory flag', async () => {
  const { db, sent, deps } = freshWorld()

  await notifyTicketRefund(deps, ARGS)
  // A retry that lands on a COLD instance (new deps object, same database) must
  // still be suppressed. An in-memory flag would not survive this.
  const coldDeps = {
    db,
    sendEmail: (email: RefundEmail) => {
      sent.push(email)
      return Promise.resolve({ ok: true, suppressed: false })
    },
  }
  const retry = await notifyTicketRefund(coldDeps, ARGS)

  assertEquals(retry.outcome, 'already_notified')
  assertEquals(sent.length, 1)
  assertEquals(db.tickets.get(TICKET_ID)?.refund_notified_at, ARGS.nowIso)
})

Deno.test('the claim is a conditional write, so concurrent deliveries cannot both win', async () => {
  const { db, deps } = freshWorld()

  await notifyTicketRefund(deps, ARGS)
  await notifyTicketRefund(deps, ARGS)

  // Two attempts, and only the first one claimed a row.
  assertEquals(db.claimAttempts, [[TICKET_ID, 1], [TICKET_ID, 0]])
})

// ---- Defect 1: the email must be about a ticket to an event, not an "order" ----

Deno.test('the email names the event, the amount, and where the money goes', async () => {
  const { sent, deps } = freshWorld()
  await notifyTicketRefund(deps, ARGS)

  assertEquals(sent.length, 1)
  const email = sent[0]
  assertEquals(email.type, 'ticket_refunded')
  assertEquals(email.userId, USER_ID)
  assertEquals(email.data.event_title, EVENT_TITLE)
  assertEquals(email.data.refund_amount, '80.00')
  assertEquals(email.data.currency, 'AUD')
  assertEquals(email.data.ticket_code, 'CE-WM-0042')
  assertStringIncludes(String(email.data.event_date), '2026')
})

Deno.test('the ticket row is finalised to refunded on the first delivery', async () => {
  const { db, deps } = freshWorld()
  await notifyTicketRefund(deps, ARGS)

  const row = db.tickets.get(TICKET_ID)
  assertEquals(row?.status, 'refunded')
  assertEquals(row?.updated_at, ARGS.nowIso)
})

// ---- A failed send must not consume the one notification ----

Deno.test('a failed send releases the claim so the next Stripe retry can send', async () => {
  const { db } = freshWorld()
  let attempts = 0
  const flakyDeps = {
    db,
    sendEmail: () => {
      attempts += 1
      return Promise.resolve({ ok: false, suppressed: false })
    },
  }

  const failed = await notifyTicketRefund(flakyDeps, ARGS)
  assertEquals(failed.sent, false)
  assertEquals(failed.outcome, 'send_failed')
  assertEquals(db.tickets.get(TICKET_ID)?.refund_notified_at, null)

  const retry = await notifyTicketRefund(flakyDeps, ARGS)
  assertEquals(retry.outcome, 'send_failed')
  assertEquals(attempts, 2)
})

Deno.test('a deliberately suppressed send KEEPS the claim (no retry storm)', async () => {
  const { db } = freshWorld()
  let attempts = 0
  const suppressedDeps = {
    db,
    sendEmail: () => {
      attempts += 1
      return Promise.resolve({ ok: false, suppressed: true })
    },
  }

  const first = await notifyTicketRefund(suppressedDeps, ARGS)
  assertEquals(first.outcome, 'suppressed')
  assertEquals(db.tickets.get(TICKET_ID)?.refund_notified_at, ARGS.nowIso)

  const retry = await notifyTicketRefund(suppressedDeps, ARGS)
  assertEquals(retry.outcome, 'already_notified')
  assertEquals(attempts, 1)
})

Deno.test('a database error on the claim NEVER sends (unguarded send is the bug)', async () => {
  const { db, deps } = freshWorld()
  const brokenDb: RefundNotifyClient = {
    from(table: string) {
      const real = db.from(table)
      return {
        ...real,
        update(values: Record<string, unknown>) {
          const realUpdate = real.update(values)
          return {
            eq(column: string, value: unknown) {
              const realEq = realUpdate.eq(column, value)
              return {
                select: realEq.select,
                is(_col: string, _null: null) {
                  return {
                    select(_columns: string) {
                      return Promise.resolve({
                        data: null,
                        error: { message: 'connection reset by peer' },
                      })
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
  }

  let attempts = 0
  const result = await notifyTicketRefund(
    { db: brokenDb, sendEmail: () => { attempts += 1; return Promise.resolve({ ok: true, suppressed: false }) } },
    ARGS,
  )

  assertEquals(result.sent, false)
  assertEquals(result.outcome, 'claim_failed')
  assertEquals(attempts, 0)
  assertEquals(db.tickets.get(TICKET_ID)?.refund_notified_at, null)
})
