/**
 * batch-lookup.ts - bound the CONCURRENCY of a per-recipient admin fan-out.
 *
 * Sibling of select-in-chunks.ts, which bounds the SIZE of one query. This file
 * exists for the other half of the same 2026-09-17 incident: a lookup that is
 * correctly small per call, issued all at once.
 *
 * send-email's batch path resolved recipient addresses with
 * `Promise.all(needLookup.map((id) => admin.auth.admin.getUserById(id)))`. For
 * Kurt Jones's Melbourne City invite that was 768 concurrent GoTrue admin
 * requests out of a single edge isolate. The symptoms were recipients logged as
 * "resolved via none" (neither auth nor profile answered) and, earlier the same
 * day, the admin database reporting no free connections. Neither reads as a
 * concurrency problem at the call site, which is why it lived through several
 * passes over this function.
 */

/**
 * Run `task` over `items` with at most `limit` in flight, preserving order.
 *
 * Order matters to the call sites here: send-email zips the results back
 * against the id list it passed in, so a completion-ordered result would
 * silently mail the wrong addresses rather than fail.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (limit < 1) throw new RangeError('concurrency limit must be >= 1')
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        const i = cursor++
        if (i >= items.length) return
        results[i] = await task(items[i], i)
      }
    },
  )
  await Promise.all(workers)
  return results
}

/** In-flight admin lookups per batch send. Low enough that a 768-member
 *  collective cannot exhaust the admin connection pool, high enough that the
 *  resolve step stays a few seconds rather than a few minutes. */
export const ADMIN_LOOKUP_CONCURRENCY = 16
