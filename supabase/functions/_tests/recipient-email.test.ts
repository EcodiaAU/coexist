/**
 * Recipient resolution for transactional email.
 *
 * The grounded case: auth.users 128fb96d resolved to
 * ybdbcs47rs@privaterelay.appleid.com and profiles held
 * zaydencressman@gmail.com. The refund send went to the relay, Resend answered
 * 200, and 13 seconds later resend_events logged email.bounced. The assertion
 * that matters is that the same inputs now pick the gmail.
 */
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { isAppleRelay, resolveRecipientEmail } from '../_shared/recipient-email.ts'

Deno.test('the relay domain is recognised, case and whitespace insensitively', () => {
  assertEquals(isAppleRelay('ybdbcs47rs@privaterelay.appleid.com'), true)
  assertEquals(isAppleRelay('  K9VJ7CW596@PrivateRelay.AppleID.com '), true)
  assertEquals(isAppleRelay('zaydencressman@gmail.com'), false)
  // An @icloud.com address is a REAL Apple mailbox and delivers fine. Treating
  // it as a relay would divert 100+ working recipients for no reason.
  assertEquals(isAppleRelay('someone@icloud.com'), false)
  assertEquals(isAppleRelay(null), false)
  assertEquals(isAppleRelay(''), false)
})

Deno.test('the live Zayden case: a relay auth email yields to the real profile email', () => {
  const r = resolveRecipientEmail(
    'ybdbcs47rs@privaterelay.appleid.com',
    'zaydencressman@gmail.com',
  )
  assertEquals(r.email, 'zaydencressman@gmail.com')
  assertEquals(r.reason, 'profile_over_relay')
})

Deno.test('an ordinary auth email is untouched even when a profile email differs', () => {
  // 2273 of 2493 accounts are this case. Changing them would be the blast
  // radius that a resolver change threatens, so it is pinned.
  const r = resolveRecipientEmail('member@example.org', 'other@example.org')
  assertEquals(r.email, 'member@example.org')
  assertEquals(r.reason, 'auth')
})

Deno.test('a relay with no usable alternative still sends, so the bounce is still recorded', () => {
  // 203 of the 220 relay accounts. Returning '' here would silently drop the
  // send AND destroy the resend_events evidence that found this bug.
  for (const profile of [null, '', '   ', 'k9vj7cw596@privaterelay.appleid.com']) {
    const r = resolveRecipientEmail('abc@privaterelay.appleid.com', profile)
    assertEquals(r.email, 'abc@privaterelay.appleid.com')
    assertEquals(r.reason, 'relay_no_alternative')
  }
})

Deno.test('a junk profile email never displaces a working relay-free auth email', () => {
  for (const junk of ['not an email', '@', 'a b@c.com', 'x']) {
    assertEquals(resolveRecipientEmail('good@example.org', junk).email, 'good@example.org')
  }
})

Deno.test('a junk profile email never displaces a relay either', () => {
  const r = resolveRecipientEmail('abc@privaterelay.appleid.com', 'not an email')
  assertEquals(r.email, 'abc@privaterelay.appleid.com')
  assertEquals(r.reason, 'relay_no_alternative')
})

Deno.test('a missing auth email falls through to the profile', () => {
  const r = resolveRecipientEmail(null, 'member@example.org')
  assertEquals(r.email, 'member@example.org')
  assertEquals(r.reason, 'profile_only')
})

Deno.test('nothing usable resolves to empty so the caller can 400 rather than send to ""', () => {
  assertEquals(resolveRecipientEmail(null, null), { email: '', reason: 'none' })
  assertEquals(resolveRecipientEmail('  ', 'junk').email, '')
})
