import { describe, expect, it } from 'vitest'
import type { Event } from '@sentry/capacitor'
import { isInjectedThirdPartyBridgeError } from './sentry'

/*
 * Fixture is the real production event COEXIST-H (Sentry issue 7609288753,
 * 2026-07-14): Instagram 437.2.0 in-app browser on iOS 26.5.2 hitting
 * https://app.coexistaus.org/campouts/outback. Meta's injected bridge script
 * reads window.webkit.messageHandlers without feature-detecting it and throws.
 */
const instagramInjectedEvent: Event = {
  exception: {
    values: [
      {
        type: 'TypeError',
        value: "undefined is not an object (evaluating 'window.webkit.messageHandlers')",
        mechanism: { type: 'auto.browser.global_handlers.onerror', handled: false },
        stacktrace: {
          frames: [
            { function: 'None', filename: '/campouts', lineno: 1, colno: 6257 },
            { function: 'sendPageHideMessage', filename: '/campouts', lineno: 1, colno: 4139 },
            { function: 'sendDataToNative', filename: '/campouts', lineno: 1, colno: 1325 },
          ],
        },
      },
    ],
  },
}

describe('isInjectedThirdPartyBridgeError', () => {
  it('drops the Instagram in-app browser injected bridge error', () => {
    expect(isInjectedThirdPartyBridgeError(instagramInjectedEvent)).toBe(true)
  })

  it('drops Meta autofill callback handler noise', () => {
    const event: Event = {
      exception: {
        values: [
          {
            type: 'TypeError',
            value: "undefined is not an object (evaluating 'window.webkit.messageHandlers')",
            stacktrace: { frames: [{ function: '_AutofillCallbackHandler' }] },
          },
        ],
      },
    }
    expect(isInjectedThirdPartyBridgeError(event)).toBe(true)
  })

  /* Negative controls. These MUST survive the filter, or the fix has traded
   * recurring noise for silent blindness to real regressions. */
  it('keeps a genuine Co-Exist application error', () => {
    const event: Event = {
      exception: {
        values: [
          {
            type: 'TypeError',
            value: "Cannot read properties of undefined (reading 'campoutId')",
            stacktrace: {
              frames: [
                { function: 'CampoutDetail', filename: '/assets/index-DfNlx-rA.js' },
                { function: 'renderWithHooks', filename: '/assets/vendor-DC60YV6q.js' },
              ],
            },
          },
        ],
      },
    }
    expect(isInjectedThirdPartyBridgeError(event)).toBe(false)
  })

  it('keeps a real Capacitor bridge failure inside our own native shell', () => {
    // Same message as the injected noise, but raised from OUR frames. Inside
    // our native WKWebView the bridge must exist, so this is a real defect and
    // must never be swallowed by a message-based filter.
    const event: Event = {
      exception: {
        values: [
          {
            type: 'TypeError',
            value: "undefined is not an object (evaluating 'window.webkit.messageHandlers')",
            stacktrace: {
              frames: [{ function: 'nativeBridgeCall', filename: '/assets/index-DfNlx-rA.js' }],
            },
          },
        ],
      },
    }
    expect(isInjectedThirdPartyBridgeError(event)).toBe(false)
  })

  it('keeps an event that carries no stack frames', () => {
    expect(isInjectedThirdPartyBridgeError({ message: 'boom' })).toBe(false)
  })
})
