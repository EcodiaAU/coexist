import { assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1'
import {
  buildTicketConfirmation,
  classifySendResult,
  formatEventDateLong,
  isNotSendable,
  TicketNotSendableError,
  type ContentClient,
} from '../_shared/ticket-confirmation-content.ts'

/**
 * The send-result classifier is the single predicate that decides whether an
 * email is owed, done, or declined. Both ways of getting it wrong have already
 * happened live, so both are asserted here rather than just the happy path:
 *   - reading a 200 { success: false } as SENT is what let the 401 window
 *     certify healthy while seven people got nothing;
 *   - reading it as RETRY would mail an opted-out member every five minutes.
 */
Deno.test('classify: a non-2xx is retryable, never a send', () => {
  const r = classifySendResult(401, { success: false, error: 'Missing authorization' })
  assertEquals(r.outcome, 'retry')
  assertStringIncludes(r.detail, '401')
})

Deno.test('classify: 500 is retryable', () => {
  assertEquals(classifySendResult(500, { success: false, error: 'Internal error' }).outcome, 'retry')
})

Deno.test('classify: 200 with success true is the only send', () => {
  assertEquals(classifySendResult(200, { success: true }).outcome, 'sent')
})

Deno.test('classify: 200 with success false is SUPPRESSED, not a failure and not a send', () => {
  const optOut = classifySendResult(200, { success: false, skipped: true, reason: 'User disabled this notification type or the email channel' })
  assertEquals(optOut.outcome, 'suppressed')
  const dead = classifySendResult(200, { success: false, skipped: true, reason: 'Address is on the suppression list (bounce or complaint)' })
  assertEquals(dead.outcome, 'suppressed')
  const disabled = classifySendResult(200, { success: false, error: 'Template disabled by admin' })
  assertEquals(disabled.outcome, 'suppressed')
})

Deno.test('classify: a null body on a 200 is suppressed, not silently sent', () => {
  assertEquals(classifySendResult(200, null).outcome, 'suppressed')
})

// ── content builder ──

interface FakeRows {
  ticket?: Record<string, unknown> | null
  event?: Record<string, unknown> | null
}

function fakeDb(rows: FakeRows, opts: { magicLink?: string; holderEmail?: string } = {}) {
  const calls: string[] = []
  const db = {
    from(table: string) {
      calls.push(`from:${table}`)
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: () =>
                  Promise.resolve({
                    data: table === 'event_tickets' ? (rows.ticket ?? null) : (rows.event ?? null),
                    error: null,
                  }),
              }
            },
          }
        },
      }
    },
    auth: {
      admin: {
        getUserById() {
          calls.push('getUserById')
          return Promise.resolve({ data: { user: { email: opts.holderEmail ?? 'guest@example.com' } } })
        },
        generateLink() {
          calls.push('generateLink')
          return Promise.resolve({
            data: { properties: { action_link: opts.magicLink ?? 'https://magic.example/link' } },
          })
        },
      },
    },
  }
  return { db: db as unknown as ContentClient, calls }
}

const TICKET = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  status: 'confirmed',
  event_id: 'bbbbbbbb-0000-0000-0000-000000000002',
  user_id: 'cccccccc-0000-0000-0000-000000000003',
  quantity: 1,
  ticket_code: 'PBHY2KVV',
  price_cents: 7000,
}
const EVENT = {
  title: 'Murbpook Outback Campout Retreat',
  date_start: '2026-09-19T00:00:00+00:00',
  address: 'Morgan, South Australia',
}

Deno.test('build: a member gets the direct auth-gated ticket link', async () => {
  const { db, calls } = fakeDb({ ticket: TICKET, event: EVENT })
  const p = await buildTicketConfirmation(db, { ticketId: TICKET.id, guest: false })
  assertEquals(p.type, 'ticket_confirmation')
  assertEquals(p.userId, TICKET.user_id)
  assertEquals(p.ticketId, TICKET.id)
  assertEquals(
    p.data.ticket_url,
    `https://app.coexistaus.org/events/${TICKET.event_id}/ticket-confirmation?ticket_id=${TICKET.id}`,
  )
  // A member must NOT burn a magic link: it is single-use, so a forwarded or
  // re-read email would be dead on the second open.
  assertEquals(calls.includes('generateLink'), false)
})

Deno.test('build: a guest gets a fresh magic link, because the ticket page is auth-gated', async () => {
  const { db, calls } = fakeDb({ ticket: TICKET, event: EVENT }, { magicLink: 'https://magic.example/abc' })
  const p = await buildTicketConfirmation(db, { ticketId: TICKET.id, guest: true })
  assertEquals(p.data.ticket_url, 'https://magic.example/abc')
  assertEquals(calls.includes('generateLink'), true)
})

Deno.test('build: unknown guest-ness (a reconcile row) takes the magic link, which reaches both', async () => {
  // There is no persisted guest column, so a row the sweep created from paid
  // state alone cannot know. The magic link lands a guest AND a member on the
  // ticket; a direct link shows a guest a login wall.
  const { db, calls } = fakeDb({ ticket: TICKET, event: EVENT }, { magicLink: 'https://magic.example/xyz' })
  const p = await buildTicketConfirmation(db, { ticketId: TICKET.id })
  assertEquals(p.data.ticket_url, 'https://magic.example/xyz')
  assertEquals(calls.includes('generateLink'), true)
})

Deno.test('build: content carries the fields the template renders', async () => {
  const { db } = fakeDb({ ticket: TICKET, event: EVENT })
  const p = await buildTicketConfirmation(db, { ticketId: TICKET.id, guest: false })
  assertEquals(p.data.event_title, 'Murbpook Outback Campout Retreat')
  assertEquals(p.data.event_location, 'Morgan, South Australia')
  assertEquals(p.data.ticket_code, 'PBHY2KVV')
  assertEquals(p.data.amount, '70.00')
  assertEquals(p.data.currency, 'AUD')
  assertEquals(p.data.quantity, 1)
})

Deno.test('build: quantity multiplies the price so a 2-ticket buyer sees what they paid', async () => {
  const { db } = fakeDb({ ticket: { ...TICKET, quantity: 2 }, event: EVENT })
  const p = await buildTicketConfirmation(db, { ticketId: TICKET.id, guest: false })
  assertEquals(p.data.amount, '140.00')
})

Deno.test('build: a missing ticket THROWS, so the row stays owed rather than sending to nobody', async () => {
  const { db } = fakeDb({ ticket: null })
  await assertRejects(() => buildTicketConfirmation(db, { ticketId: TICKET.id }), Error, 'no ticket')
})

Deno.test('build: a ticket with no holder THROWS', async () => {
  const { db } = fakeDb({ ticket: { ...TICKET, user_id: null } })
  await assertRejects(() => buildTicketConfirmation(db, { ticketId: TICKET.id }), Error, 'no holder')
})

Deno.test('build: a missing event degrades to a sendable email rather than failing', async () => {
  // The buyer's ticket code is the load-bearing content. An event row that has
  // been deleted must not cost them the email.
  const { db } = fakeDb({ ticket: TICKET, event: null })
  const p = await buildTicketConfirmation(db, { ticketId: TICKET.id, guest: false })
  assertEquals(p.data.event_title, 'Event')
  assertEquals(p.data.ticket_code, 'PBHY2KVV')
})

Deno.test('formatEventDateLong: empty in, empty out', () => {
  assertEquals(formatEventDateLong(null), '')
  assertEquals(formatEventDateLong(undefined), '')
  assertStringIncludes(formatEventDateLong('2026-09-19T00:00:00+00:00'), '2026')
})


/**
 * SEND-TIME ELIGIBILITY (added 2026-09-12 by the W2 verification pass).
 *
 * The builder derives CONTENT at send time because an event can change under a
 * queued row. Eligibility is the same argument and was missing: `status` was
 * SELECTed and never read, and no cancel, refund or revoke path touches the
 * outbox (only stripe-webhook and the drainer reference the table at all), so
 * an owed confirmation on a ticket voided before the drainer reached it still
 * sent "your ticket is confirmed". cancel-event makes that a bulk event.
 *
 * These assert BOTH directions, because getting it wrong either way is a live
 * failure: refusing a confirmed ticket costs a buyer their email, and the
 * refusal must be TERMINAL (suppressed) rather than a retry that burns six
 * attempts and lands in 'failed'.
 */
for (const voided of ['refunded', 'cancelled', 'pending', 'reserved']) {
  Deno.test(`build: a '${voided}' ticket is refused, so a voided ticket cannot be told it is confirmed`, async () => {
    const { db } = fakeDb({ ticket: { ...TICKET, status: voided }, event: EVENT })
    const err = await assertRejects(
      () => buildTicketConfirmation(db, { ticketId: TICKET.id, guest: false }),
      TicketNotSendableError,
      'not confirmed',
    )
    // TERMINAL, not retryable. Both senders read this to settle 'suppressed'.
    assertEquals(isNotSendable(err), true)
  })
}

Deno.test('build: a confirmed ticket still builds, so the guard did not just refuse everything', () => {
  // The negative control for the four above. A guard that refuses every status
  // would pass all of them and cost every buyer their email, and this is the
  // only assertion that can tell those two apart.
  const { db } = fakeDb({ ticket: TICKET, event: EVENT })
  return buildTicketConfirmation(db, { ticketId: TICKET.id, guest: false }).then((p) => {
    assertEquals(p.data.ticket_code, 'PBHY2KVV')
    assertEquals(p.type, 'ticket_confirmation')
  })
})

Deno.test('isNotSendable: an ordinary failure is NOT terminal, so it still retries', () => {
  // The other direction of the same predicate. A transient error read as
  // terminal is a buyer who never gets their email at all, which is the
  // original defect wearing the fix's clothes.
  assertEquals(isNotSendable(new Error('connection reset')), false)
  assertEquals(isNotSendable(null), false)
  assertEquals(isNotSendable(undefined), false)
  assertEquals(isNotSendable(new TicketNotSendableError('voided')), true)
})
