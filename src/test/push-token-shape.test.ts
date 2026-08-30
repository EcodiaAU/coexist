import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { isApnsShapedToken, shouldReplaceStoredToken } from '@/lib/push-token'

/**
 * Guards the class that made a fifth of the iOS fleet silently unreachable:
 * push_tokens held raw APNs device tokens where send-push needs FCM
 * registration tokens, and FCM's rejection looked exactly like success
 * (HTTP 200, sent:0, row purged, no error anywhere).
 *
 * Live sample taken 2026-08-30 off tjutlbzekfouwsiaplbr: 64-hex on iOS is
 * always an APNs token (217 rows), and every real FCM token was 142 characters
 * and not pure hex (803 iOS + 481 Android rows).
 */

const APNS = 'a1b2c3d4'.repeat(8) // 64 hex, the shape iOS hands the Capacitor plugin
const FCM =
  'dTVISbKRIU15Yk9wZXJhdGlvbjpub3RhcmVhbHRva2VuOmp1c3RhZml4dHVyZWZvcnRlc3Rpbmc6MTIzNDU2Nzg5MGFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6QUJDREVGRw'

describe('isApnsShapedToken', () => {
  it('identifies a 64-hex APNs device token', () => {
    expect(isApnsShapedToken(APNS)).toBe(true)
    expect(isApnsShapedToken(APNS.toUpperCase())).toBe(true)
  })

  it('does not misread a real FCM registration token as APNs', () => {
    expect(isApnsShapedToken(FCM)).toBe(false)
    expect(FCM.length).toBeGreaterThan(100)
  })

  it('is exact about length, so a 63- or 65-hex string is not APNs-shaped', () => {
    expect(isApnsShapedToken('a'.repeat(63))).toBe(false)
    expect(isApnsShapedToken('a'.repeat(65))).toBe(false)
  })

  it('rejects a 64-char string that is not hex', () => {
    expect(isApnsShapedToken('g'.repeat(64))).toBe(false)
  })

  it('handles the absent cases without throwing', () => {
    expect(isApnsShapedToken(null)).toBe(false)
    expect(isApnsShapedToken(undefined)).toBe(false)
    expect(isApnsShapedToken('')).toBe(false)
  })
})

describe('shouldReplaceStoredToken', () => {
  it('replaces an APNs row once the real FCM token exists (the heal case)', () => {
    expect(shouldReplaceStoredToken(APNS, FCM)).toBe(true)
  })

  it('claims the FCM token when nothing is stored yet', () => {
    expect(shouldReplaceStoredToken(null, FCM)).toBe(true)
  })

  it('is idempotent: no write when the FCM token is already the stored one', () => {
    expect(shouldReplaceStoredToken(FCM, FCM)).toBe(false)
  })

  it('never replaces a good token with an APNs-shaped one', () => {
    expect(shouldReplaceStoredToken(FCM, APNS)).toBe(false)
    expect(shouldReplaceStoredToken(APNS, APNS)).toBe(false)
  })

  it('does nothing when no FCM token has been minted', () => {
    expect(shouldReplaceStoredToken(APNS, null)).toBe(false)
    expect(shouldReplaceStoredToken(APNS, '')).toBe(false)
  })
})

/**
 * Drift guards on the two surfaces, because this bug was never a wrong rule.
 * It was a correct rule with no retry on the client and no report on the server.
 */
describe('the surfaces that carry the rule', () => {
  const usePush = readFileSync('src/hooks/use-push.ts', 'utf8')
  const sendPush = readFileSync('supabase/functions/send-push/index.ts', 'utf8')

  it('heals on mount AND on resume, not once per registration event', () => {
    const calls = usePush.match(/healIosPushToken\(/g) ?? []
    // definition + mount + resume + unchanged-token path + poll = at least 5
    expect(calls.length).toBeGreaterThanOrEqual(5)
    expect(usePush).toContain('await healIosPushToken(user!.id)')
  })

  it('does not return early from the registration listener without reconciling', () => {
    expect(usePush).toContain("skipping store, still reconciling FCM")
  })

  it('send-push refuses to spend an FCM call on an APNs-shaped iOS token', () => {
    expect(sendPush).toContain('isApnsShapedToken')
    expect(sendPush).toContain('deliverableTokens')
  })

  it('send-push REPORTS the unreachable count instead of hiding it inside total', () => {
    expect(sendPush).toContain('undeliverable_apns_shape')
  })
})
