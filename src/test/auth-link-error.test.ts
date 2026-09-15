import { describe, it, expect } from 'vitest'
import { readAuthLinkError, safeNextPath } from '@/lib/auth-link-error'

/**
 * The fixture is the REAL redirect, captured by curling Chelsea Gray's actual
 * "View your ticket" link on 2026-09-15. Hand-writing this payload is how the
 * plus-encoding and the fragment-vs-query split get guessed wrong, so it is
 * pasted verbatim from the `location:` response header.
 */
const LIVE_EXPIRED_HASH =
  '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb='

describe('readAuthLinkError', () => {
  it('reads the live expired-ticket-link payload out of the fragment', () => {
    const err = readAuthLinkError(LIVE_EXPIRED_HASH, '')
    expect(err).not.toBeNull()
    expect(err!.code).toBe('otp_expired')
    expect(err!.kind).toBe('access_denied')
    expect(err!.isExpired).toBe(true)
  })

  it('decodes plus-encoded spaces rather than leaving them as plus signs', () => {
    const err = readAuthLinkError(LIVE_EXPIRED_HASH, '')
    expect(err!.description).toBe('Email link is invalid or has expired')
    expect(err!.description).not.toContain('+')
  })

  it('gives the member reassuring copy, never the raw vendor string', () => {
    const err = readAuthLinkError(LIVE_EXPIRED_HASH, '')
    expect(err!.message).toMatch(/expired/i)
    expect(err!.message).not.toBe(err!.description)
  })

  it('also reads the query string, which some PKCE paths use instead', () => {
    const err = readAuthLinkError('', '?error=access_denied&error_code=otp_expired')
    expect(err!.isExpired).toBe(true)
  })

  it('tolerates a fragment passed without its leading hash', () => {
    const err = readAuthLinkError('error=access_denied&error_code=otp_expired', '')
    expect(err!.isExpired).toBe(true)
  })

  /* --- The controls. Without these the parser could return an error for every
     URL and every assertion above would still pass. --- */

  it('returns null for a clean URL, so a healthy login shows no notice', () => {
    expect(readAuthLinkError('', '')).toBeNull()
    expect(readAuthLinkError('#access_token=abc&type=magiclink', '?ticket_id=123')).toBeNull()
  })

  it('does not call a non-expiry failure expired', () => {
    const err = readAuthLinkError('#error=server_error&error_code=unexpected_failure', '')
    expect(err).not.toBeNull()
    expect(err!.isExpired).toBe(false)
  })
})

describe('safeNextPath', () => {
  it('keeps a same-origin app path, including its query', () => {
    expect(safeNextPath('/events/810cf846/ticket-confirmation?ticket_id=78eccd14')).toBe(
      '/events/810cf846/ticket-confirmation?ticket_id=78eccd14',
    )
  })

  it('refuses an absolute URL and a protocol-relative host, which would be an open redirect', () => {
    expect(safeNextPath('https://evil.host/steal')).toBeNull()
    expect(safeNextPath('//evil.host/steal')).toBeNull()
  })

  it('refuses empty and missing values', () => {
    expect(safeNextPath(null)).toBeNull()
    expect(safeNextPath(undefined)).toBeNull()
    expect(safeNextPath('')).toBeNull()
  })
})
