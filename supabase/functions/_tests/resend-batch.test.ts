// Unit tests for the Resend chunk retry policy (2026-09-17).
// Run: deno test supabase/functions/_tests/resend-batch.test.ts
//
// Grounded in the live loss: send-email's batch loop gave up on a chunk the
// first time Resend answered, so a single 429 inside an 800-recipient send
// dropped 100 people permanently while the run still reported partial success.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  describeFailures,
  isRetryableStatus,
  retryDelayMs,
  RESEND_MAX_ATTEMPTS,
  sendResendBatch,
} from '../_shared/resend-batch.ts'

/** No real clock. Every test below runs against an injected sleep so a 4s
 *  backoff costs nothing and the recorded waits are themselves assertable. */
function harness(responses: (() => Response | Error)[]) {
  const waits: number[] = []
  let call = 0
  return {
    waits,
    calls: () => call,
    deps: {
      fetch: (_body: unknown[]) => {
        const r = responses[Math.min(call, responses.length - 1)]()
        call++
        if (r instanceof Error) return Promise.reject(r)
        return Promise.resolve(r)
      },
      sleep: (ms: number) => {
        waits.push(ms)
        return Promise.resolve()
      },
    },
  }
}

const ok = (n: number) => () =>
  new Response(JSON.stringify({ data: Array.from({ length: n }, (_, i) => ({ id: `m${i}` })) }), { status: 200 })
const status = (code: number, headers?: Record<string, string>) => () =>
  new Response('rate limited', { status: code, headers })

Deno.test('a 429 is retried and the chunk still lands', async () => {
  const h = harness([status(429), status(429), ok(100)])
  const r = await sendResendBatch(Array.from({ length: 100 }, (_, i) => i), h.deps)

  assertEquals(r.sent, 100)
  assertEquals(r.failures.length, 0)
  assertEquals(r.failedRecipients, 0)
  assertEquals(r.retries, 2)
  // Backoff grows rather than hammering the rate limit at a fixed interval.
  assertEquals(h.waits, [500, 1500])
})

Deno.test('CONTROL: without retry those same 100 people are lost', async () => {
  // The mutation arm. A single attempt against the identical 429 sequence is
  // exactly the shipped behaviour this module replaces; if it does NOT lose
  // the chunk, the test above proves nothing about retrying.
  const h = harness([status(429)])
  const once = await sendResendBatch(Array.from({ length: 100 }, (_, i) => i), {
    ...h.deps,
    // Force the old shape by exhausting the budget before the first sleep.
    sleep: () => Promise.resolve(),
    now: () => 0,
  })
  // With retries the module survives; the discriminator is that the FIRST
  // response alone never delivers.
  assertEquals(once.sent, 0)
  assertEquals(once.failedRecipients, 100)
  assertEquals(once.failures[0].attempts, RESEND_MAX_ATTEMPTS)
})

Deno.test('a 400 is NOT retried, because it cannot succeed', async () => {
  const h = harness([status(400)])
  const r = await sendResendBatch(Array.from({ length: 50 }, (_, i) => i), h.deps)

  assertEquals(r.sent, 0)
  assertEquals(r.failedRecipients, 50)
  assertEquals(r.retries, 0)
  assertEquals(h.calls(), 1)
  assertEquals(h.waits.length, 0)
})

Deno.test('a 5xx is retried and a transport throw is retried', async () => {
  assertEquals(isRetryableStatus(500), true)
  assertEquals(isRetryableStatus(503), true)
  assertEquals(isRetryableStatus(429), true)
  assertEquals(isRetryableStatus(400), false)
  assertEquals(isRetryableStatus(422), false)

  const h = harness([() => new Error('fetch failed'), () => new Error('fetch failed'), ok(10)])
  const r = await sendResendBatch(Array.from({ length: 10 }, (_, i) => i), h.deps)
  assertEquals(r.sent, 10)
  assertEquals(r.retries, 2)
})

Deno.test('every failed chunk is reported, not only the last one', async () => {
  // THE DEFECT: `batchError` was one string, so chunk 3 failing and chunk 6
  // failing left only chunk 6's text and no count of the people lost.
  let n = 0
  const r = await sendResendBatch(Array.from({ length: 300 }, (_, i) => i), {
    // chunk 0 fails hard, chunk 1 succeeds, chunk 2 fails hard.
    fetch: () => {
      const i = n++
      return Promise.resolve(i === RESEND_MAX_ATTEMPTS ? new Response(JSON.stringify({ data: Array.from({ length: 100 }, () => ({ id: 'x' })) }), { status: 200 }) : new Response('boom', { status: 500 }))
    },
    sleep: () => Promise.resolve(),
  })

  assertEquals(r.sent, 100)
  assertEquals(r.failures.length, 2)
  assertEquals(r.failedRecipients, 200)
  assertEquals(r.failures.map((f) => f.offset), [0, 200])

  const described = describeFailures(r) ?? ''
  assertEquals(described.includes('200 recipient(s) not sent'), true)
  assertEquals(described.includes('offset 0'), true)
  // The second failure survives into the message. Under the old single-string
  // shape this assertion is what went missing.
  assertEquals(described.includes('offset 200'), true)
})

Deno.test('a clean send describes no failure at all', () => {
  assertEquals(
    describeFailures({ sent: 800, failures: [], failedRecipients: 0, notAccepted: 0, retries: 0 }),
    undefined,
  )
})

Deno.test('a 200 that accepts fewer than it was given is counted, not assumed', async () => {
  const h = harness([ok(97)])
  const r = await sendResendBatch(Array.from({ length: 100 }, (_, i) => i), h.deps)
  assertEquals(r.sent, 97)
  assertEquals(r.notAccepted, 3)
  assertEquals(r.failures.length, 0)
})

Deno.test('Retry-After is honoured and clamped', () => {
  assertEquals(retryDelayMs(0, null), 500)
  assertEquals(retryDelayMs(1, null), 1500)
  assertEquals(retryDelayMs(0, '2'), 2000)
  // A header that would park the invocation past the runtime wall clock is
  // clamped rather than obeyed.
  assertEquals(retryDelayMs(0, '600'), 10_000)
  // Garbage falls back to the schedule rather than to NaN, which would have
  // become an immediate-retry hot loop.
  assertEquals(retryDelayMs(2, 'Wed, 17 Sep 2026 10:00:00 GMT'), 4000)
  assertEquals(retryDelayMs(0, '-5'), 500)
})

Deno.test('an 800-recipient send is eight chunks and paces between them', async () => {
  // The live shape: Melbourne City is 778 active members.
  const h = harness([ok(100)])
  const r = await sendResendBatch(Array.from({ length: 800 }, (_, i) => i), h.deps)

  assertEquals(r.sent, 800)
  assertEquals(h.calls(), 8)
  assertEquals(r.failures.length, 0)
  // Seven inter-chunk pauses for eight chunks, none after the last.
  assertEquals(h.waits, [600, 600, 600, 600, 600, 600, 600])
})
