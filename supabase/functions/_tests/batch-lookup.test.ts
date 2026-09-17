// Unit tests for the bounded admin fan-out (2026-09-17).
// Run: deno test supabase/functions/_tests/batch-lookup.test.ts
//
// Grounded in the live failure: send-email's batch path opened one GoTrue
// admin request per recipient with Promise.all, which for Kurt Jones's 768-
// member Melbourne City invite was 768 in flight from a single isolate.
import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { ADMIN_LOOKUP_CONCURRENCY, mapWithConcurrency } from '../_shared/batch-lookup.ts'

Deno.test('never exceeds the limit, and the control proves the meter can see a breach', async () => {
  let inFlight = 0
  let peak = 0
  const run = (limit: number) =>
    mapWithConcurrency(Array.from({ length: 200 }, (_, i) => i), limit, async (n) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 1))
      inFlight--
      return n
    })

  await run(8)
  assertEquals(peak <= 8, true, `peak ${peak} exceeded the limit of 8`)

  // CONTROL. Without this arm a meter that always reads 1 would pass the
  // assertion above while measuring nothing: this is the same shape as the
  // unrun Promise.all, and it must read high.
  inFlight = 0
  peak = 0
  await Promise.all(Array.from({ length: 200 }, async () => {
    inFlight++
    peak = Math.max(peak, inFlight)
    await new Promise((r) => setTimeout(r, 1))
    inFlight--
  }))
  assertEquals(peak > 8, true, `unbounded peak was ${peak}; the meter is not measuring concurrency`)
})

Deno.test('results stay in input order, not completion order', async () => {
  // send-email zips this result back against the id list it passed in, so a
  // completion-ordered result would mail people at each other's addresses.
  const delays = [40, 1, 30, 2, 20, 3]
  const out = await mapWithConcurrency(delays, 4, async (ms, i) => {
    await new Promise((r) => setTimeout(r, ms))
    return i
  })
  assertEquals(out, [0, 1, 2, 3, 4, 5])
})

Deno.test('runs every item exactly once', async () => {
  const seen = new Set<number>()
  let calls = 0
  const items = Array.from({ length: 137 }, (_, i) => i)
  await mapWithConcurrency(items, ADMIN_LOOKUP_CONCURRENCY, async (n) => {
    calls++
    seen.add(n)
    return n
  })
  assertEquals(calls, 137)
  assertEquals(seen.size, 137)
})

Deno.test('an empty list starts no workers, and a short list starts no more than it needs', async () => {
  let calls = 0
  assertEquals(await mapWithConcurrency([], 16, async () => { calls++; return 1 }), [])
  assertEquals(calls, 0)
  assertEquals(await mapWithConcurrency([1, 2], 16, async (n) => n * 2), [2, 4])
})

Deno.test('a rejecting task propagates rather than resolving to a hole', async () => {
  await assertRejects(
    () => mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('lookup failed')
      return n
    }),
    Error,
    'lookup failed',
  )
})

Deno.test('a zero or negative limit is refused rather than hanging forever', async () => {
  // The function is async, so the guard surfaces as a rejection rather than a
  // synchronous throw. Asserting the wrong one leaves a dangling rejection that
  // fails the whole module, which is how this test first ran.
  await assertRejects(() => mapWithConcurrency([1], 0, async (n) => n), RangeError)
  await assertRejects(() => mapWithConcurrency([1], -5, async (n) => n), RangeError)
})
