// Unit tests for the chunked PostgREST `.in()` helper (2026-08-30).
// Run: deno test supabase/functions/_tests/select-in-chunks.test.ts
//
// Grounded in the live probe that found Sentry COEXIST-1D: PostgREST echoes the
// whole request filter back in a `content-location` response header, so a 397-id
// `.in()` produced 16.5KB of response headers, past Deno's 16KiB cap, and the
// fetch threw. Measured on Deno 2.9.5 against project tjutlbzekfouwsiaplbr:
//   Melbourne City 659 ids -> fetch failed | Perth 397 -> fetch failed
//   Brisbane       351 ids -> OK 351 rows  | Sydney 181 -> OK 181 rows
import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  IN_CHUNK_SIZE,
  SAFE_FILTER_BYTES,
  chunkValues,
  projectedFilterBytes,
  selectInChunks,
} from '../_shared/select-in-chunks.ts'

const uuid = (n: number) => `0000${String(n).padStart(4, '0')}-0000-4000-8000-000000000000`.slice(-36)
const ids = (n: number) => Array.from({ length: n }, (_, i) => uuid(i))

Deno.test('chunkValues splits to the requested size and loses nothing', () => {
  assertEquals(chunkValues(ids(250), 100).map((c) => c.length), [100, 100, 50])
  assertEquals(chunkValues(ids(250), 100).flat().length, 250)
  assertEquals(chunkValues(ids(100), 100).map((c) => c.length), [100])
})

Deno.test('an empty input issues no request at all', async () => {
  let calls = 0
  const { rows, error } = await selectInChunks<{ id: string }>([], (batch) => {
    calls++
    return Promise.resolve({ data: batch.map((id) => ({ id })), error: null })
  })
  assertEquals(calls, 0)
  assertEquals(rows, [])
  assertEquals(error, null)
})

// THE MODEL CHECK. Before asserting anything about the fix, prove the byte
// model reproduces the four arms actually measured on Deno against the live
// project, including the two that SUCCEEDED. A model that called everything
// too big would "pass" this file while explaining nothing.
Deno.test('the byte model reproduces the measured pass/fail boundary', () => {
  const overBudget = (n: number) => projectedFilterBytes(ids(n)) > SAFE_FILTER_BYTES
  assertEquals(overBudget(659), true)  // Melbourne City -> fetch failed
  assertEquals(overBudget(397), true)  // Perth          -> fetch failed
  assertEquals(overBudget(351), false) // Brisbane       -> OK, 351 rows
  assertEquals(overBudget(181), false) // Sydney         -> OK, 181 rows
})

// THE REGRESSION TEST. The real Perth payload is 397 recipients; before the fix
// that was one request whose echoed filter blew the header cap. This assertion
// is what fails if anyone reverts to an unchunked `.in()`.
Deno.test('the Perth payload that broke production now fits the budget', () => {
  const perth = ids(397)
  assertEquals(projectedFilterBytes(perth) > SAFE_FILTER_BYTES, true)
  for (const batch of chunkValues(perth, IN_CHUNK_SIZE)) {
    // Every chunk sits at or under a third of the budget, a 3x margin that
    // leaves headroom for the other filters and for unrelated response
    // headers (set-cookie, cf-ray) that also count against the cap.
    assertEquals(projectedFilterBytes(batch) <= SAFE_FILTER_BYTES / 3, true)
  }
})

Deno.test('Melbourne City, the largest collective, also fits once chunked', () => {
  assertEquals(projectedFilterBytes(ids(659)) > SAFE_FILTER_BYTES, true)
  for (const batch of chunkValues(ids(659), IN_CHUNK_SIZE)) {
    assertEquals(projectedFilterBytes(batch) <= SAFE_FILTER_BYTES / 3, true)
  }
})

Deno.test('every chunk is requested and the rows are concatenated', async () => {
  const seen: number[] = []
  const { rows, error } = await selectInChunks<{ id: string }>(ids(250), (batch) => {
    seen.push(batch.length)
    return Promise.resolve({ data: batch.map((id) => ({ id })), error: null })
  })
  assertEquals(seen, [100, 100, 50])
  assertEquals(rows.length, 250)
  assertEquals(error, null)
})

// The half of the bug that chunking alone does not fix: a failed query must not
// read as an empty answer. This is the exact shape that answered the sender 403.
Deno.test('a failing chunk surfaces the error instead of an empty answer', async () => {
  const { rows, error } = await selectInChunks<{ id: string }>(ids(250), (batch) =>
    Promise.resolve(
      batch[0] === uuid(100)
        ? { data: null, error: new TypeError('fetch failed') }
        : { data: batch.map((id) => ({ id })), error: null },
    ))
  assertEquals(error instanceof TypeError, true)
  // Stops at the failure rather than handing back a partial set that a caller
  // would read as complete.
  assertEquals(rows.length, 100)
})

Deno.test('a thrown fetch is reported, not swallowed', async () => {
  const { error } = await selectInChunks<{ id: string }>(ids(10), () => {
    throw new TypeError('fetch failed')
  })
  assertEquals(error instanceof TypeError, true)
})

Deno.test('a nonsense chunk size is rejected rather than looping forever', () => {
  assertRejects(() => Promise.resolve().then(() => chunkValues(ids(5), 0)), RangeError)
})
