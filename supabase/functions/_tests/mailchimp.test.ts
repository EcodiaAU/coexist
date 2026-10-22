// Run: deno test supabase/functions/_tests/mailchimp.test.ts
//
// The pure half of the Mailchimp sync: identity, mapping, the re-subscribe
// guard, the tag-ownership rule, the HTTP client against a fake Mailchimp, and
// webhook parsing + signature verification. Negative cases (a forged or stale
// signature, a subscribed body that must NOT carry `status`) are the point.
import { assert, assertEquals, assertRejects, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  MailchimpApiError,
  createMailchimpClient,
  fingerprint,
  normaliseEmail,
  normaliseTags,
  parseWebhookForm,
  removedTags,
  resolveServerPrefix,
  signWebhook,
  subscriberHash,
  toDesiredMember,
  upsertBody,
  verifyWebhookSignature,
  webhookAction,
  webhookDedupeKey,
} from '../_shared/mailchimp.ts'
import { createFakeMailchimp } from './fake-mailchimp.ts'

const LIST = 'abc123def4'

Deno.test('subscriberHash is md5 of the lowercased, trimmed address (Mailchimp documented vector)', async () => {
  // md5("test@example.com")
  assertEquals(await subscriberHash('test@example.com'), '55502f40dc8b7c769880b10874abc9d0')
  assertEquals(await subscriberHash('  Test@EXAMPLE.com '), '55502f40dc8b7c769880b10874abc9d0')
})

Deno.test('normaliseEmail folds case and whitespace, tolerates null', () => {
  assertEquals(normaliseEmail('  A@B.Org '), 'a@b.org')
  assertEquals(normaliseEmail(null), '')
})

// Built at runtime: a literal in Mailchimp's key shape trips GitHub push protection.
const FAKE_KEY = ['0123456789abcdef'.repeat(2), 'us20'].join('-')

Deno.test('resolveServerPrefix reads the key suffix and refuses a mismatched prefix', () => {
  assertEquals(resolveServerPrefix(FAKE_KEY), 'us20')
  assertEquals(resolveServerPrefix(FAKE_KEY, 'us20'), 'us20')
  assertThrows(() => resolveServerPrefix(FAKE_KEY, 'us9'), Error, 'does not match')
  assertThrows(() => resolveServerPrefix('nokeysuffix'), Error, 'data-centre')
})

Deno.test('normaliseTags dedupes case-insensitively, trims, sorts, drops empties', () => {
  assertEquals(normaliseTags(['Leader', ' leader ', 'Sunshine  Coast', '', null, 'Active']), ['Active', 'Leader', 'Sunshine Coast'])
})

Deno.test('toDesiredMember omits null names so a sync never blanks a hand-typed one', () => {
  const m = toDesiredMember({ email: 'X@Y.org', profile_id: null, first_name: null, last_name: ' ', source: 'profile', status: 'subscribed', tags: ['b', 'a'] })
  assertEquals(m, { email: 'x@y.org', status: 'subscribed', merge_fields: {}, tags: ['a', 'b'] })
  const n = toDesiredMember({ email: 'x@y.org', profile_id: 'p', first_name: 'Tate', last_name: 'Donohoe', source: 'profile', status: 'unsubscribed', tags: [] })
  assertEquals(n.merge_fields, { FNAME: 'Tate', LNAME: 'Donohoe' })
  assertEquals(n.status, 'unsubscribed')
})

Deno.test('upsertBody: subscribed only sets status_if_new unless the change was consent (no silent re-subscribe)', () => {
  const sub = toDesiredMember({ email: 'a@b.org', profile_id: null, first_name: 'A', last_name: null, source: 'profile', status: 'subscribed', tags: [] })
  const plain = upsertBody(sub, false)
  assertEquals(plain.status_if_new, 'subscribed')
  assert(!('status' in plain), 'a non-consent sync must not assert subscribed on an existing member')
  assertEquals(upsertBody(sub, true).status, 'subscribed')
  const unsub = { ...sub, status: 'unsubscribed' as const }
  assertEquals(upsertBody(unsub, false).status, 'unsubscribed', 'an opt-out is always asserted')
  assert(!('status' in upsertBody(unsub, true, true)), 'a cleaned member keeps the status Mailchimp gave it')
})

Deno.test('removedTags removes only tags Co-Exist pushed before, never a Mailchimp-native one', () => {
  assertEquals(removedTags(['Leader', 'Brisbane'], ['leader']), ['Brisbane'])
  assertEquals(removedTags([], ['Leader']), [])
  assertEquals(removedTags(null, []), [])
})

Deno.test('fingerprint is stable across tag order and changes when status or a name changes', async () => {
  const base = { email: 'a@b.org', profile_id: null, first_name: 'A', last_name: null, source: 'profile', status: 'subscribed' as const, tags: ['x', 'y'] }
  const a = await fingerprint(toDesiredMember(base))
  assertEquals(a, await fingerprint(toDesiredMember({ ...base, tags: ['y', 'x'] })))
  assert(a !== await fingerprint(toDesiredMember({ ...base, status: 'unsubscribed' })))
  assert(a !== await fingerprint(toDesiredMember({ ...base, first_name: 'B' })))
})

Deno.test('client: POST adds with tags; a second add falls back to PUT on 400 Member Exists', async () => {
  const fake = createFakeMailchimp({ listId: LIST, apiKey: 'k-us9' })
  const client = createMailchimpClient({ apiKey: 'k-us9', serverPrefix: 'us9', fetchImpl: fake.fetchImpl, sleep: async () => {} })
  const m = toDesiredMember({ email: 'New@Member.org', profile_id: null, first_name: 'New', last_name: null, source: 'profile', status: 'subscribed', tags: ['Leader'] })
  const first = await client.addOrUpsert(LIST, m)
  assertEquals(first.path, 'created')
  assertEquals((await fake.member('new@member.org'))?.tags, ['Leader'])
  const second = await client.addOrUpsert(LIST, m)
  assertEquals(second.path, 'updated')
  const methods = fake.calls.map((c) => c.method)
  assertEquals(methods, ['POST', 'POST', 'PUT'])
})

Deno.test('client: the Member Exists fallback never re-subscribes someone Mailchimp holds unsubscribed', async () => {
  const fake = createFakeMailchimp({ listId: LIST })
  await fake.seed({ email_address: 'left@x.org', status: 'unsubscribed', merge_fields: {}, tags: [] })
  const client = createMailchimpClient({ apiKey: 'k-us9', serverPrefix: 'us9', fetchImpl: fake.fetchImpl, sleep: async () => {} })
  const m = toDesiredMember({ email: 'left@x.org', profile_id: null, first_name: 'L', last_name: null, source: 'profile', status: 'subscribed', tags: [] })
  await client.addOrUpsert(LIST, m)
  assertEquals((await fake.member('left@x.org'))?.status, 'unsubscribed')
  assertEquals((await fake.member('left@x.org'))?.merge_fields.FNAME, 'L')
})

Deno.test('client: retries 429 then succeeds; a 4xx is thrown at once as MailchimpApiError', async () => {
  const fake = createFakeMailchimp({ listId: LIST })
  const client = createMailchimpClient({ apiKey: 'k-us9', serverPrefix: 'us9', fetchImpl: fake.fetchImpl, sleep: async () => {} })
  fake.throttle(2)
  assertEquals((await client.ping())?.health_status, "Everything's Chimpy!")
  assertEquals(fake.calls.length, 3)
  fake.failOnce(400, 'Invalid Resource')
  const err = await assertRejects(() => client.ping(), MailchimpApiError)
  assertEquals((err as MailchimpApiError).status, 400)
})

Deno.test('client: getMember is null for an unknown address; archive of an absent member is not an error', async () => {
  const fake = createFakeMailchimp({ listId: LIST })
  const client = createMailchimpClient({ apiKey: 'k-us9', serverPrefix: 'us9', fetchImpl: fake.fetchImpl, sleep: async () => {} })
  assertEquals(await client.getMember(LIST, 'nobody@x.org'), null)
  assertEquals(await client.archive(LIST, 'nobody@x.org'), 'absent')
})

Deno.test('client: the webhook is registered for unsubscribe + cleaned with api source OFF (no echo loop)', async () => {
  const fake = createFakeMailchimp({ listId: LIST })
  const client = createMailchimpClient({ apiKey: 'k-us9', serverPrefix: 'us9', fetchImpl: fake.fetchImpl, sleep: async () => {} })
  await client.createWebhook(LIST, 'https://x/functions/v1/mailchimp-webhook?token=t')
  const body = fake.calls.at(-1)!.body as { events: Record<string, boolean>; sources: Record<string, boolean> }
  assertEquals(body.events.unsubscribe, true)
  assertEquals(body.events.cleaned, true)
  assertEquals(body.events.subscribe, false)
  assertEquals(body.sources.api, false)
})

const RAW = 'type=unsubscribe&fired_at=2026-10-22+04%3A30%3A00&data%5Baction%5D=unsub&data%5Breason%5D=manual' +
  '&data%5Bid%5D=8a25ff1d98&data%5Blist_id%5D=' + LIST + '&data%5Bemail%5D=Code%40Ecodia.au&data%5Bmerges%5D%5BFNAME%5D=Ecodia'

Deno.test('parseWebhookForm flattens bracket keys, including nested merges', () => {
  const ev = parseWebhookForm(RAW)
  assertEquals(ev.type, 'unsubscribe')
  assertEquals(ev.data.email, 'Code@Ecodia.au')
  assertEquals(ev.data.list_id, LIST)
  assertEquals(ev.data['merges.FNAME'], 'Ecodia')
  assertEquals(ev.fired_at, '2026-10-22 04:30:00')
})

Deno.test('webhookAction: unsubscribe and cleaned map; another audience and other types are ignored', () => {
  assertEquals(webhookAction(parseWebhookForm(RAW), LIST), { kind: 'unsubscribe', email: 'code@ecodia.au', reason: 'manual' })
  assertEquals(webhookAction(parseWebhookForm(RAW.replace('unsubscribe', 'cleaned')), LIST).kind, 'cleaned')
  assertEquals(webhookAction(parseWebhookForm(RAW), 'other'), { kind: 'ignore', why: 'other audience' })
  assertEquals(webhookAction(parseWebhookForm(RAW.replace('unsubscribe', 'profile')), LIST).kind, 'ignore')
  assertEquals(webhookAction(parseWebhookForm('type=unsubscribe'), LIST).kind, 'ignore')
})

Deno.test('verifyWebhookSignature: valid passes; tampered, stale, missing and malformed fail', async () => {
  const secret = 'whsec_test'
  const t = 1_792_000_000
  const header = await signWebhook(secret, t, RAW)
  assertEquals(await verifyWebhookSignature(RAW, header, secret, t + 10), 'valid')
  assertEquals(await verifyWebhookSignature(RAW + 'x', header, secret, t + 10), 'mismatch')
  assertEquals(await verifyWebhookSignature(RAW, header, 'other-secret', t + 10), 'mismatch')
  assertEquals(await verifyWebhookSignature(RAW, header, secret, t + 301), 'stale')
  assertEquals(await verifyWebhookSignature(RAW, null, secret, t), 'missing')
  assertEquals(await verifyWebhookSignature(RAW, 't=abc,v1=zz', secret, t), 'malformed')
})

Deno.test('webhookDedupeKey is identical for a retry of the same delivery and differs for a new one', async () => {
  const a = await webhookDedupeKey(parseWebhookForm(RAW))
  assertEquals(a, await webhookDedupeKey(parseWebhookForm(RAW)))
  assert(a !== await webhookDedupeKey(parseWebhookForm(RAW.replace('04%3A30', '04%3A31'))))
})
