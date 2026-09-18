/**
 * resend-batch.ts - send a batch of emails to Resend in 100-message chunks so
 * that a chunk which fails is RETRIED and, if it still fails, is COUNTED.
 *
 * THE DEFECT THIS EXISTS TO KILL (Co-Exist, 2026-09-17, Kurt Jones P1).
 *
 * send-email's batch loop was:
 *
 *     for (let i = 0; i < emails.length; i += 100) {
 *       const resp = await fetch(RESEND_BATCH_URL, ...)
 *       if (resp.ok) { sent += accepted } else { batchError = await resp.text() }
 *     }
 *
 * Three separate losses live in those four lines:
 *
 *   1. NO RETRY. Resend rate-limits at 2 requests/second and answers 429. A
 *      single 429 on chunk 3 of 8 dropped 100 people permanently, and the next
 *      chunk went out 600ms later as though nothing had happened.
 *   2. `batchError` IS ONE STRING. Chunk 3 failing and chunk 6 failing leaves
 *      only chunk 6's text, so the host is told about one failure when two
 *      happened and is never told HOW MANY people were lost.
 *   3. A PARTIAL SEND REPORTS AS A FAILED ONE. `success: !batchError` with
 *      `sent: 700` says false for a send that reached 700 of 800, and says
 *      nothing about which 100.
 *
 * The caller gets back an explicit accounting instead: how many Resend
 * accepted, and one row per chunk that did not make it after its retries.
 */

/** Resend's documented ceiling for its batch endpoint. */
export const RESEND_CHUNK_SIZE = 100

/** Attempts per chunk, the first one included. Four attempts spans roughly six
 *  seconds of backoff, which clears a 429 burst without putting the whole
 *  invocation near the edge runtime's wall clock on an 800-recipient send. */
export const RESEND_MAX_ATTEMPTS = 4

/** Backoff before attempt N+1, in ms. Overridden by a Retry-After header when
 *  Resend sends one. */
export const RESEND_BACKOFF_MS = [500, 1500, 4000]

/** Pause between two SUCCESSFUL chunks, to stay under the 2 req/s rate limit
 *  rather than discovering it as a 429. */
export const RESEND_INTER_CHUNK_MS = 600

/** Total time this whole batch may spend ASLEEP in retry backoff. A send that
 *  is being rate-limited end to end must still return an answer rather than be
 *  killed by the runtime's wall clock with nothing reported. */
export const RESEND_RETRY_BUDGET_MS = 45_000

export interface ResendChunkFailure {
  /** Index into the email array where this chunk started. */
  offset: number
  /** How many recipients were in it. All of them were lost. */
  size: number
  /** Last HTTP status seen. 0 means the fetch itself threw (no response). */
  status: number
  /** Last error text, truncated. */
  error: string
  /** How many times it was tried before being given up on. */
  attempts: number
}

export interface ResendBatchResult {
  /** Recipients Resend confirmed it accepted. */
  sent: number
  /** Chunks that never succeeded. Empty means every recipient reached Resend. */
  failures: ResendChunkFailure[]
  /** Recipients inside those failed chunks. The number of people who got nothing. */
  failedRecipients: number
  /** Recipients inside a chunk Resend answered 200 for but did not list in
   *  `data`. A silent partial accept, distinct from an outright chunk failure. */
  notAccepted: number
  /** Retries actually performed, across all chunks. Zero on a clean send. */
  retries: number
}

/** A 429 or any 5xx is transient and worth another attempt. A 4xx that is not
 *  429 is deterministic (malformed payload, bad key, unverified domain) and
 *  retrying it only burns the invocation's wall clock. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

/** Retry-After is seconds or an HTTP date. Only the seconds form is honoured;
 *  anything else falls back to the fixed backoff, and an absurd value is
 *  clamped so one header cannot park the invocation until it is killed. */
export function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  const fallback = RESEND_BACKOFF_MS[attempt] ?? RESEND_BACKOFF_MS[RESEND_BACKOFF_MS.length - 1]
  if (!retryAfterHeader) return fallback
  const seconds = Number(retryAfterHeader)
  if (!Number.isFinite(seconds) || seconds <= 0) return fallback
  return Math.min(seconds * 1000, 10_000)
}

export interface ResendBatchDeps {
  /** Performs one chunk request. Injected so the retry policy is testable
   *  without a network, and so the URL and key stay at the call site. */
  fetch: (body: unknown[]) => Promise<Response>
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  log?: (...args: unknown[]) => void
}

/**
 * Send `emails` in chunks, retrying a chunk that fails transiently.
 *
 * Never throws: a transport error is an outcome to report, not a reason to
 * lose the accounting for the chunks that did go out.
 */
export async function sendResendBatch(
  emails: readonly unknown[],
  deps: ResendBatchDeps,
): Promise<ResendBatchResult> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const now = deps.now ?? (() => Date.now())
  const log = deps.log ?? (() => {})

  const result: ResendBatchResult = {
    sent: 0,
    failures: [],
    failedRecipients: 0,
    notAccepted: 0,
    retries: 0,
  }
  let sleptMs = 0
  const started = now()

  for (let offset = 0; offset < emails.length; offset += RESEND_CHUNK_SIZE) {
    const chunk = emails.slice(offset, offset + RESEND_CHUNK_SIZE)
    let delivered = false
    let lastStatus = 0
    let lastError = ''
    let attempts = 0

    for (let attempt = 0; attempt < RESEND_MAX_ATTEMPTS; attempt++) {
      attempts = attempt + 1
      let resp: Response | null = null
      try {
        resp = await deps.fetch(chunk as unknown[])
      } catch (e) {
        // A throw here is the connection-level failure that an oversized
        // request or a dropped socket produces. Transient by nature.
        lastStatus = 0
        lastError = e instanceof Error ? e.message : String(e)
      }

      if (resp && resp.ok) {
        let accepted = chunk.length
        try {
          const body = await resp.json()
          if (Array.isArray(body?.data)) accepted = body.data.length
        } catch {
          // A 200 with an unreadable body still accepted the chunk.
        }
        if (accepted !== chunk.length) {
          result.notAccepted += chunk.length - accepted
          log('[resend-batch] chunk partially accepted:', accepted, 'of', chunk.length, 'at offset', offset)
        }
        result.sent += accepted
        delivered = true
        break
      }

      if (resp) {
        lastStatus = resp.status
        try {
          lastError = (await resp.text()).slice(0, 300)
        } catch {
          lastError = `HTTP ${resp.status}`
        }
        if (!isRetryableStatus(resp.status)) {
          log('[resend-batch] chunk at offset', offset, 'failed permanently:', resp.status, lastError)
          break
        }
      }

      if (attempt === RESEND_MAX_ATTEMPTS - 1) break

      const wait = retryDelayMs(attempt, resp?.headers?.get('retry-after') ?? null)
      if (sleptMs + wait > RESEND_RETRY_BUDGET_MS) {
        log('[resend-batch] retry budget exhausted after', now() - started, 'ms; giving up on offset', offset)
        break
      }
      result.retries++
      log('[resend-batch] chunk at offset', offset, 'got', lastStatus || 'a transport error', 'so retrying in', wait, 'ms')
      await sleep(wait)
      sleptMs += wait
    }

    if (!delivered) {
      result.failures.push({ offset, size: chunk.length, status: lastStatus, error: lastError, attempts })
      result.failedRecipients += chunk.length
    }

    if (offset + RESEND_CHUNK_SIZE < emails.length) await sleep(RESEND_INTER_CHUNK_MS)
  }

  return result
}

/** One line a human can read in the function log or an error field, naming how
 *  many people were lost rather than echoing one chunk's response body. */
export function describeFailures(result: ResendBatchResult): string | undefined {
  if (result.failures.length === 0) return undefined
  const detail = result.failures
    .map((f) =>
      `offset ${f.offset} (${f.size} recipients, HTTP ${f.status || 'transport'}, ${f.attempts} attempt(s)): ${f.error}`
    )
    .join(' | ')
  return `${result.failures.length} chunk(s) failed after retries, ${result.failedRecipients} recipient(s) not sent. ${detail}`
}
