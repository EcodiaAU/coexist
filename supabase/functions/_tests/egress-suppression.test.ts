/**
 * egress-suppression.test.ts
 *
 * The gate this covers is the LAST thing between an address and Resend, and its
 * failure mode is silent: a suppressed address that slips through looks exactly
 * like a normal send until the bounce arrives. So the assertions here are about
 * the ways a matcher quietly stops matching (case, whitespace, an empty batch,
 * a lookup that errors) rather than about the happy path.
 *
 * Measured origin: on 2026-08-28, three "Reminder: <event> is coming up" sends
 * reached b5ckwrn7y9@, 49j58nyp2j@ and 9ddb68k56p@privaterelay.appleid.com while
 * all three sat in email_suppressions. Five of Co-Exist's six Resend egress
 * points had no check at all.
 */

import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  isEmailSuppressed,
  makeSuppressionFetcher,
  normaliseEmail,
  suppressedEmailSet,
  type SuppressionFetcher,
  type SuppressionQueryable,
} from '../_shared/egress-suppression.ts'

/** A fetcher over a fixed suppression table, matching the way Postgres would. */
function tableOf(rows: string[]): SuppressionFetcher {
  return (candidates: string[]) => {
    const wanted = new Set(candidates.map((c) => c.toLowerCase()))
    return Promise.resolve(rows.filter((r) => wanted.has(r.toLowerCase())))
  }
}

Deno.test('a suppressed address is refused', async () => {
  const out = await suppressedEmailSet(tableOf(['dead@example.org']), ['dead@example.org'])
  assertEquals([...out], ['dead@example.org'])
})

Deno.test('an address that is not suppressed passes', async () => {
  const out = await suppressedEmailSet(tableOf(['dead@example.org']), ['live@example.org'])
  assertEquals([...out], [])
})

Deno.test('case and surrounding whitespace do not let a suppressed address through', async () => {
  // resolve_campaign_audience compares exactly and resend-webhook stores `to`
  // as Resend reported it, so an uppercased send address against a lowercase
  // stored row is the realistic way this gate goes quiet.
  const gate = tableOf(['dead@example.org'])
  assert((await suppressedEmailSet(gate, ['DEAD@Example.ORG'])).has('dead@example.org'))
  assert((await suppressedEmailSet(gate, ['  dead@example.org '])).has('dead@example.org'))
})

Deno.test('a stored row in mixed case still matches a lowercase send', async () => {
  const out = await suppressedEmailSet(tableOf(['Dead@Example.org']), ['dead@example.org'])
  assertEquals([...out], ['dead@example.org'])
})

Deno.test('a batch drops only the suppressed members', async () => {
  const out = await suppressedEmailSet(
    tableOf(['b@example.org', 'd@example.org']),
    ['a@example.org', 'b@example.org', 'c@example.org', 'd@example.org'],
  )
  assertEquals([...out].sort(), ['b@example.org', 'd@example.org'])
})

Deno.test('an empty or all-blank candidate list never touches the database', async () => {
  let called = false
  const spy: SuppressionFetcher = () => { called = true; return Promise.resolve([]) }
  assertEquals([...(await suppressedEmailSet(spy, []))], [])
  assertEquals([...(await suppressedEmailSet(spy, [null, undefined, '', '   ']))], [])
  assertEquals(called, false)
})

Deno.test('the gate FAILS CLOSED: a lookup error propagates and does not read as clean', async () => {
  // The tempting shape is to swallow the error so a database blip cannot stop
  // the mail. That would turn every blip into an unchecked send, which is the
  // exact state this gate was written to end.
  const broken: SuppressionFetcher = () => Promise.reject(new Error('connection refused'))
  await assertRejects(() => suppressedEmailSet(broken, ['someone@example.org']), Error, 'connection refused')
  await assertRejects(() => isEmailSuppressed(broken, 'someone@example.org'), Error, 'connection refused')
})

Deno.test('isEmailSuppressed answers the single-send path', async () => {
  const gate = tableOf(['dead@example.org'])
  assertEquals(await isEmailSuppressed(gate, 'dead@example.org'), true)
  assertEquals(await isEmailSuppressed(gate, 'live@example.org'), false)
  assertEquals(await isEmailSuppressed(gate, null), false)
})

Deno.test('normaliseEmail tolerates the junk a caller can pass', () => {
  assertEquals(normaliseEmail('  A@B.COM '), 'a@b.com')
  assertEquals(normaliseEmail(null), '')
  assertEquals(normaliseEmail(undefined), '')
})

Deno.test('the fetcher queries email_suppressions on both the raw and lowered form', async () => {
  let table = ''
  let column = ''
  let queried: string[] = []
  const fake: SuppressionQueryable = {
    from(t: string) {
      table = t
      return {
        select() {
          return {
            in(col: string, values: string[]) {
              column = col
              queried = values
              return Promise.resolve({ data: [{ email: 'dead@example.org' }], error: null })
            },
          }
        },
      }
    },
  }
  const rows = await makeSuppressionFetcher(fake)(['DEAD@Example.org'])
  assertEquals(table, 'email_suppressions')
  assertEquals(column, 'email')
  assertEquals(queried.sort(), ['DEAD@Example.org', 'dead@example.org'])
  assertEquals(rows, ['dead@example.org'])
})

Deno.test('a fetcher error surfaces rather than answering "nothing is suppressed"', async () => {
  const failing: SuppressionQueryable = {
    from() {
      return { select() { return { in() { return Promise.resolve({ data: null, error: new Error('permission denied') }) } } } }
    },
  }
  await assertRejects(() => makeSuppressionFetcher(failing)(['x@example.org']))
})

Deno.test('an empty candidate list short-circuits the fetcher before it builds a query', async () => {
  let touched = false
  const spy: SuppressionQueryable = {
    from() { touched = true; return { select() { return { in() { return Promise.resolve({ data: [], error: null }) } } } } },
  }
  assertEquals(await makeSuppressionFetcher(spy)([]), [])
  assertEquals(touched, false)
})
