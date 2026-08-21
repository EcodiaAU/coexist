import { describe, it, expect } from 'vitest'
import {
  isBenignNavigatorLockAbort,
  isInjectedThirdPartyBridgeError,
} from '@/lib/sentry'
import type { Event } from '@sentry/capacitor'

// F1 remediation (COEXIST-J/R): the beforeSend noise filter must drop benign
// @supabase/auth-js Navigator LockManager abort/steal rejections WITHOUT
// suppressing unrelated AbortErrors (a real fetch abort we might want to see).
const ev = (values: unknown[]): Event => ({ exception: { values } } as unknown as Event)

describe('isBenignNavigatorLockAbort', () => {
  it('drops a raw DOMException AbortError that references the navigator lock in its message', () => {
    expect(
      isBenignNavigatorLockAbort(
        ev([{ type: 'AbortError', value: 'The operation was aborted. Navigator LockManager lock "lock:coexist-auth"' }]),
      ),
    ).toBe(true)
  })

  it('drops an AbortError whose stack frame references the auth-js lock path', () => {
    expect(
      isBenignNavigatorLockAbort(
        ev([{ type: 'AbortError', value: 'The operation was aborted.', stacktrace: { frames: [{ function: 'navigatorLock', filename: 'vendor.js' }] } }]),
      ),
    ).toBe(true)
  })

  it('drops the typed NavigatorLockAcquireTimeoutError (lock stolen path)', () => {
    expect(
      isBenignNavigatorLockAbort(
        ev([{ type: 'NavigatorLockAcquireTimeoutError', value: 'Lock "lock:coexist-auth" was released because another request stole it' }]),
      ),
    ).toBe(true)
  })

  // COEXIST-J live wording (Chrome >=142, no stack frames): when auth-js steals a
  // held lock with {steal:true}, the displaced holder's AbortSignal rejects with
  // this exact DOMException message. Frameless unhandledrejection, so only the
  // message string can classify it. Sentry issue 7616268242: 3 events, 0 users.
  it("drops the frameless Chrome steal-abort 'Lock broken by another request with the steal option'", () => {
    expect(
      isBenignNavigatorLockAbort(
        ev([{ type: 'AbortError', value: "Lock broken by another request with the 'steal' option." }]),
      ),
    ).toBe(true)
  })

  it('drops an error flagged via isAcquireTimeout signature in the message', () => {
    expect(
      isBenignNavigatorLockAbort(
        ev([{ type: 'Error', value: 'Acquiring an exclusive Navigator LockManager lock "x" immediately failed' }]),
      ),
    ).toBe(true)
  })

  it('KEEPS a bare AbortError with no lock reference (real fetch abort)', () => {
    expect(
      isBenignNavigatorLockAbort(
        ev([{ type: 'AbortError', value: 'The user aborted a request.', stacktrace: { frames: [{ function: 'fetchEvents', filename: 'use-events.ts' }] } }]),
      ),
    ).toBe(false)
  })

  it('KEEPS an unrelated TypeError', () => {
    expect(
      isBenignNavigatorLockAbort(ev([{ type: 'TypeError', value: "undefined is not an object (evaluating 'e.lat')" }])),
    ).toBe(false)
  })

  it('returns false when there is no exception', () => {
    expect(isBenignNavigatorLockAbort({} as Event)).toBe(false)
  })
})

describe('isInjectedThirdPartyBridgeError (regression - existing filter still works)', () => {
  it('drops an event whose frame is an injected Meta bridge symbol', () => {
    expect(
      isInjectedThirdPartyBridgeError(
        ev([{ type: 'TypeError', value: 'x', stacktrace: { frames: [{ function: 'sendDataToNative' }] } }]),
      ),
    ).toBe(true)
  })

  it('keeps a normal app error', () => {
    expect(
      isInjectedThirdPartyBridgeError(
        ev([{ type: 'TypeError', value: 'x', stacktrace: { frames: [{ function: 'handleCheckIn' }] } }]),
      ),
    ).toBe(false)
  })
})
