/**
 * auth-link-error.ts
 *
 * Reads the failure Supabase hands back when an emailed auth link is spent.
 *
 * Measured origin (2026-09-15): Chelsea Gray bought a $180 Wild Mountains
 * camp-out seat on 31 Aug and opened her "View your ticket" link on 12 Sep.
 * Supabase answered the verify endpoint with a 303 to
 *
 *   /events/<id>/ticket-confirmation?ticket_id=<id>
 *     #error=access_denied&error_code=otp_expired
 *     &error_description=Email+link+is+invalid+or+has+expired
 *
 * and NOT to /auth/callback, because the confirmation email sets `redirect_to`
 * straight at the deep link. That route sits behind RequireAuth, so with no
 * session the guard bounced her to /login with `to="/login"`, a string that
 * carries no hash, and the whole diagnosis above was discarded on the way.
 * She saw a bare sign-in form. From her side the ticket was broken, so that is
 * what she reported: "I can't access my ticket."
 *
 * The link dying is correct and not worth fixing: a magic link is one-shot and
 * short-lived on purpose. What was wrong is that the app threw away the reason
 * and the destination, which is the difference between "your link aged out,
 * here is a fresh one" and a paying attendee concluding their ticket is gone.
 * Roughly 55 confirmation emails for upcoming camp-outs are already in inboxes
 * with links that age out the same way, so this has to be recoverable in the
 * app; editing the template only helps the next send.
 *
 * Supabase puts these in the URL FRAGMENT for implicit-flow redirects and in
 * the QUERY STRING for a few PKCE/server paths, so both are read. The fragment
 * is checked first because that is where the live probe above put it.
 */

/** Parsed shape of a failed emailed auth link. */
export interface AuthLinkError {
  /** Supabase `error_code`, e.g. `otp_expired`. Empty when only `error` was sent. */
  code: string
  /** Supabase `error`, e.g. `access_denied`. */
  kind: string
  /** Raw `error_description`, already percent/plus-decoded. */
  description: string
  /** True when the link was valid once and has aged out or been used. */
  isExpired: boolean
  /** Copy to show the member. Never the raw vendor string. */
  message: string
}

/**
 * Codes that mean "this link was real, it is simply spent". These get the
 * reassuring copy plus a resend, because nothing is wrong with the account.
 * `access_denied` is included: Supabase pairs it with `otp_expired` on an aged
 * link, and sends it alone when the token has already been redeemed once,
 * which is the same situation from the member's side.
 */
const SPENT_LINK_CODES = new Set([
  'otp_expired',
  'access_denied',
  'expired_token',
  'token_expired',
  'flow_state_expired',
  'flow_state_not_found',
])

function decode(params: URLSearchParams, key: string): string {
  // URLSearchParams already turns `+` into a space and undoes percent-encoding,
  // which is what the live payload needs ("Email+link+is+invalid+or+has+expired").
  return (params.get(key) ?? '').trim()
}

function parseOne(raw: string): AuthLinkError | null {
  if (!raw) return null
  // Accept a leading `#` or `?` so callers can pass location.hash / .search verbatim.
  const params = new URLSearchParams(raw.replace(/^[#?]/, ''))
  const kind = decode(params, 'error')
  const code = decode(params, 'error_code')
  if (!kind && !code) return null

  const description = decode(params, 'error_description')
  const isExpired = SPENT_LINK_CODES.has(code) || SPENT_LINK_CODES.has(kind)

  return {
    code,
    kind,
    description,
    isExpired,
    message: isExpired
      ? 'That link has expired. Email links are single use and only last a short while, so we need to send you a fresh one.'
      : description || 'That link could not be used. Try signing in below.',
  }
}

/**
 * Read an auth-link failure out of a URL. Pass the hash and search of the
 * landing location; either may be empty.
 */
export function readAuthLinkError(hash: string, search: string): AuthLinkError | null {
  return parseOne(hash) ?? parseOne(search)
}

/** Convenience wrapper over the live `window.location`. Safe under SSR/tests. */
export function readAuthLinkErrorFromWindow(): AuthLinkError | null {
  if (typeof window === 'undefined') return null
  return readAuthLinkError(window.location.hash, window.location.search)
}

/**
 * Drop the error fragment from the address bar once it has been read into
 * state, so a refresh does not re-trigger the notice on a page the member has
 * already recovered from. History is replaced, never pushed, so Back still
 * goes where the member expects.
 */
export function stripAuthLinkError(): void {
  if (typeof window === 'undefined') return
  if (!window.location.hash && !window.location.search) return
  if (!readAuthLinkErrorFromWindow()) return
  const url = new URL(window.location.href)
  url.hash = ''
  for (const key of ['error', 'error_code', 'error_description']) url.searchParams.delete(key)
  window.history.replaceState(window.history.state, '', url.toString())
}

/**
 * Where the member was trying to get to when the link failed. The ticket link
 * points at a real in-app destination, so holding onto it is what makes the
 * resend land them on their ticket instead of the home feed.
 *
 * Only same-origin app paths are returned. An absolute URL or a protocol
 * relative `//evil.host` is refused, because this value rides in a `next`
 * query param on the resend and would otherwise be an open redirect.
 */
export function safeNextPath(candidate: string | null | undefined): string | null {
  if (!candidate) return null
  if (!candidate.startsWith('/')) return null
  if (candidate.startsWith('//')) return null
  return candidate
}
