/**
 * The batch consent gate, tested against the single-send behaviour it mirrors.
 *
 * The regression this pins: commit a2951132 routed cancelEvent and inviteAll
 * from the single-send path onto the batch path. Both types are `transactional`
 * and both carry a TYPE_TO_PREF_KEY entry, and the batch path only ran its
 * consent lookup for MARKETING types, so a member who had switched off
 * event-cancellation mail, or switched off the email channel outright, would
 * have been emailed anyway.
 *
 * Each RED case below is paired with the GREEN case that differs only in the
 * field the gate is supposed to read.
 */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { suppressedRecipientIds } from '../_shared/recipient-suppression.ts'

const ids = ['u1', 'u2', 'u3']

Deno.test('a transactional type honours the per-type toggle (the regression)', () => {
  const out = suppressedRecipientIds({
    ids,
    profiles: [
      { id: 'u1', marketing_opt_in: true, notification_preferences: { event_cancelled: false } },
      { id: 'u2', marketing_opt_in: true, notification_preferences: { event_cancelled: true } },
      { id: 'u3', marketing_opt_in: true, notification_preferences: {} },
    ],
    isMarketing: false,
    prefKey: 'event_cancelled',
  })
  assertEquals([...out], ['u1'])
})

Deno.test('a transactional type honours the email_enabled channel master', () => {
  const out = suppressedRecipientIds({
    ids: ['u1', 'u2'],
    profiles: [
      { id: 'u1', notification_preferences: { email_enabled: false } },
      { id: 'u2', notification_preferences: { email_enabled: true } },
    ],
    isMarketing: false,
    prefKey: 'event_invite',
  })
  assertEquals([...out], ['u1'])
})

Deno.test('opt-OUT model: only an explicit false suppresses', () => {
  const out = suppressedRecipientIds({
    ids: ['u1', 'u2', 'u3'],
    profiles: [
      { id: 'u1', notification_preferences: null },
      { id: 'u2', notification_preferences: { event_cancelled: 0 } },
      { id: 'u3', notification_preferences: { event_cancelled: 'false' } },
    ],
    isMarketing: false,
    prefKey: 'event_cancelled',
  })
  assertEquals([...out], [])
})

Deno.test('marketing still honours marketing_opt_in', () => {
  const out = suppressedRecipientIds({
    ids: ['u1', 'u2'],
    profiles: [
      { id: 'u1', marketing_opt_in: false, notification_preferences: {} },
      { id: 'u2', marketing_opt_in: true, notification_preferences: {} },
    ],
    isMarketing: true,
    prefKey: 'newsletter',
  })
  assertEquals([...out], ['u1'])
})

Deno.test('a missing profile suppresses a MARKETING send and not a transactional one', () => {
  const marketing = suppressedRecipientIds({
    ids: ['u1', 'ghost'],
    profiles: [{ id: 'u1', marketing_opt_in: true, notification_preferences: {} }],
    isMarketing: true,
    prefKey: 'newsletter',
  })
  assertEquals([...marketing], ['ghost'])

  // The single path has no `!profile` arm for a transactional send, and
  // dropping a cancellation notice over a missing row would be worse than
  // sending it.
  const transactional = suppressedRecipientIds({
    ids: ['u1', 'ghost'],
    profiles: [{ id: 'u1', notification_preferences: {} }],
    isMarketing: false,
    prefKey: 'event_cancelled',
  })
  assertEquals([...transactional], [])
})

Deno.test('a type mapping to no preference key suppresses nobody', () => {
  const out = suppressedRecipientIds({
    ids,
    profiles: [
      { id: 'u1', notification_preferences: { email_enabled: false } },
      { id: 'u2', notification_preferences: { anything: false } },
      { id: 'u3', notification_preferences: {} },
    ],
    isMarketing: false,
    prefKey: undefined,
  })
  assertEquals([...out], [])
})

Deno.test('an empty recipient list is not a lookup', () => {
  assertEquals(
    [...suppressedRecipientIds({ ids: [], profiles: [], isMarketing: true, prefKey: 'newsletter' })],
    [],
  )
})
