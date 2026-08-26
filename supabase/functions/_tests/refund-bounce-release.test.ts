/**
 * A bounced refund notification must give its claim back, and nothing else may.
 *
 * Grounded case: ticket 45e658d2-bb40-4747-9bc6-9ef88eb430ab, sent 09:59:22
 * with refund_notified_at stamped, bounced 09:59:35. The member was marked
 * notified, nothing was delivered, and the consumed claim blocked the retry.
 */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { refundReleaseTarget } from '../_shared/refund-bounce-release.ts'

const TICKET = '45e658d2-bb40-4747-9bc6-9ef88eb430ab'
const SENT = '2026-08-26T09:59:22.000Z'

const bounce = (tags: unknown, type = 'email.bounced', created_at: unknown = SENT) =>
  ({ type, data: { created_at, tags } }) as never

Deno.test('the grounded case releases: a ticket_refunded bounce carrying a ticket_id', () => {
  assertEquals(
    refundReleaseTarget(bounce({ type: 'ticket_refunded', category: 'transactional', ticket_id: TICKET })),
    { ticketId: TICKET, sentAtIso: SENT },
  )
})

Deno.test('tags as the send-side array shape are read too', () => {
  assertEquals(
    refundReleaseTarget(bounce([
      { name: 'category', value: 'transactional' },
      { name: 'type', value: 'ticket_refunded' },
      { name: 'ticket_id', value: TICKET },
    ]))?.ticketId,
    TICKET,
  )
})

Deno.test('a DELIVERED refund releases nothing', () => {
  // The whole point of the claim is that a delivered notification keeps it.
  assertEquals(
    refundReleaseTarget(bounce({ type: 'ticket_refunded', ticket_id: TICKET }, 'email.delivered')),
    null,
  )
})

Deno.test('a COMPLAINT releases nothing: it arrived, the member marked it spam', () => {
  assertEquals(
    refundReleaseTarget(bounce({ type: 'ticket_refunded', ticket_id: TICKET }, 'email.complained')),
    null,
  )
})

Deno.test('a bounce of some OTHER template releases nothing', () => {
  // 66 of the 68 relay bounces measured on 2026-08-26 were event_invite and
  // event_confirmation. None of them may touch a refund claim.
  for (const t of ['event_invite', 'event_confirmation', 'ticket_confirmation', undefined]) {
    assertEquals(refundReleaseTarget(bounce({ type: t, ticket_id: TICKET })), null)
  }
})

Deno.test('a bounce with no ticket_id releases nothing', () => {
  assertEquals(refundReleaseTarget(bounce({ type: 'ticket_refunded' })), null)
  assertEquals(refundReleaseTarget(bounce(undefined)), null)
})

Deno.test('a non-UUID ticket_id is refused rather than fed to a query', () => {
  for (const junk of ['', 'all', "' or 1=1--", '45e658d2', TICKET + 'x']) {
    assertEquals(refundReleaseTarget(bounce({ type: 'ticket_refunded', ticket_id: junk })), null)
  }
})

Deno.test('a missing or unparseable send time fails CLOSED', () => {
  // Without a send time the "do not clobber a newer claim" guard cannot be
  // expressed, and an unscoped release could unmark a member a later send
  // actually reached.
  // Built literally rather than through bounce(): passing `undefined` to a
  // defaulted parameter reinstates the default, which is how the first version
  // of this test asserted nothing.
  const tags = { type: 'ticket_refunded', ticket_id: TICKET }
  assertEquals(refundReleaseTarget({ type: 'email.bounced', data: { tags } } as never), null)
  for (const ts of [null, '', 'yesterday', 12345, {}]) {
    assertEquals(
      refundReleaseTarget({ type: 'email.bounced', data: { created_at: ts, tags } } as never),
      null,
    )
  }
})

Deno.test('junk input never throws', () => {
  assertEquals(refundReleaseTarget(null), null)
  assertEquals(refundReleaseTarget(undefined), null)
  assertEquals(refundReleaseTarget({} as never), null)
  assertEquals(refundReleaseTarget({ type: 'email.bounced' } as never), null)
})
