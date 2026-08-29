// select-in-chunks.ts - make a large PostgREST `.in()` filter survivable, and
// stop an errored filter from silently reading as an empty result.
//
// THE DEFECT THIS EXISTS TO KILL (probed live 2026-08-30, Sentry COEXIST-1D).
//
// PostgREST echoes the ENTIRE request filter back to the caller in a
// `content-location` RESPONSE header. So a query like
//
//     .from('collective_members').select('user_id')
//       .in('user_id', everyCoMemberUuid)          // ~400 UUIDs
//
// returns a single response header of 15.6KB and ~16.5KB of response headers in
// total. Deno's fetch (hyper) caps response headers at 16KiB, so the call does
// not return a 4xx that anyone could read - it THROWS, and supabase-js converts
// the throw into `{ data: null, error }`.
//
// Every call site in send-push destructured only `data`, so a thrown query read
// as "the database returned nothing", and each of the four had a different
// silent failure waiting behind that:
//   - the authorization check decided every recipient was unreachable and
//     answered the sender 403 "Forbidden: targets outside your collectives"
//   - the user_blocks filter decided nobody had blocked the sender
//   - the push_tokens lookup decided nobody had a device and returned sent:0
//   - the profiles lookup decided nobody had quiet hours or push preferences
//
// Measured on Deno 2.9.5 against the live project, same query, one arm per
// collective, and the small collectives are the control that proves the
// discriminator is real rather than a probe that fails everywhere:
//
//   Melbourne City  659 ids  24551-byte URL  -> TypeError: fetch failed
//   Perth           397 ids  14857-byte URL  -> TypeError: fetch failed
//   Brisbane        351 ids  13155-byte URL  -> OK, 351 rows
//   Sydney          181 ids   6865-byte URL  -> OK, 181 rows
//
// Chat push had therefore been dead for Co-Exist's two largest collectives, and
// Brisbane sat about 1.7KB of header from joining them on its next few signups.
//
// The fix is two things together, and neither alone is enough: chunk the filter
// so the echoed header can never approach the cap, and RETURN the error so a
// caller can fail loudly instead of inferring emptiness from a failure.

/** UUIDs per `.in()` request. 100 ids weigh ~3.7KB in the echoed filter, under
 *  a third of the ~14.5KB an id list may safely occupy, which leaves the other
 *  filters and the unrelated response headers a wide margin.
 *  Deliberately far below the measured 351-OK / 397-THROW boundary rather than
 *  just under it: the boundary moves with UUID count, filter text and the size
 *  of unrelated headers like set-cookie. */
export const IN_CHUNK_SIZE = 100

/** The response-header budget the chunk size is chosen against (Deno/hyper
 *  default). Exceeding it is what makes the fetch throw. */
export const RESPONSE_HEADER_CAP_BYTES = 16 * 1024

/** Bytes of that budget NOT available to the echoed id list, measured on the
 *  live Perth request 2026-08-30: 881 bytes of other response headers (date,
 *  set-cookie, cf-ray, sb-*, alt-svc) plus 932 bytes of `content-location`
 *  that are the path, `select=`, `status=eq.active` and `collective_id=in.()`
 *  rather than the ids. */
export const HEADER_OVERHEAD_BYTES = 1813

/** What an `in.()` id list may actually weigh before the response headers blow
 *  the cap. This model reproduces the measured boundary: Brisbane at 351 ids
 *  lands under it and succeeded, Perth at 397 lands over it and threw. */
export const SAFE_FILTER_BYTES = RESPONSE_HEADER_CAP_BYTES - HEADER_OVERHEAD_BYTES

/** Split `values` into chunks of at most `size`. An empty input yields no
 *  chunks, so a caller never issues a pointless `in.()` request. */
export function chunkValues<T>(values: readonly T[], size: number = IN_CHUNK_SIZE): T[][] {
  if (size < 1) throw new RangeError('chunk size must be >= 1')
  const out: T[][] = []
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size))
  return out
}

/** Bytes PostgREST will echo back for an `in.(...)` list of these values, which
 *  is what actually has to fit under the header cap. Parentheses url-encode to
 *  three bytes each and commas to one. Used by the tests to assert the chosen
 *  chunk size stays inside budget, and available to a caller sizing its own. */
export function projectedFilterBytes(values: readonly string[]): number {
  if (values.length === 0) return 0
  const joined = values.reduce((n, v) => n + encodeURIComponent(v).length, 0)
  return joined + (values.length - 1) + '%28%29'.length
}

export interface ChunkedResult<Row> {
  /** Rows from every chunk that succeeded, concatenated. */
  rows: Row[]
  /** The first error encountered, or null. NEVER ignore this: an empty `rows`
   *  with a non-null `error` means the question was not answered, which is not
   *  the same as the answer being "none". */
  error: unknown
}

/**
 * Run `query` once per chunk of `values` and concatenate the rows.
 *
 * `query` receives one chunk and must return the supabase-js builder for it, so
 * the call site keeps its own table, columns and extra filters:
 *
 *     const { rows, error } = await selectInChunks(ids, (batch) =>
 *       admin.from('push_tokens').select('token, platform, user_id').in('user_id', batch))
 *     if (error) { ...fail loudly... }
 *
 * Stops at the first failing chunk and reports it, rather than returning a
 * partial set a caller would read as complete - a half-answered membership
 * check is exactly the input that produced the 403 above.
 */
export async function selectInChunks<Row>(
  values: readonly string[],
  query: (chunk: string[]) => PromiseLike<{ data: Row[] | null; error: unknown }>,
  size: number = IN_CHUNK_SIZE,
): Promise<ChunkedResult<Row>> {
  const rows: Row[] = []
  for (const batch of chunkValues(values, size)) {
    let data: Row[] | null = null
    let error: unknown = null
    try {
      ;({ data, error } = await query(batch))
    } catch (err) {
      // supabase-js normally converts a transport throw into `error`, but a
      // throw from the fetch itself can still surface here. Either way it is an
      // unanswered question and must not be mistaken for an empty answer.
      error = err
    }
    if (error) return { rows, error }
    if (data) rows.push(...data)
  }
  return { rows, error: null }
}
