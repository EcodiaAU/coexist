/* eslint-disable react-refresh/only-export-components */
/* ------------------------------------------------------------------ */
/*  Sentry Error Logging                                               */
/*                                                                     */
/*  Setup:                                                             */
/*  1. npm install @sentry/react                                       */
/*  2. Set VITE_SENTRY_DSN in .env                                     */
/*  3. Call initSentry() in main.tsx before React renders              */
/*  4. Wrap <App /> with <SentryErrorBoundary>                         */
/* ------------------------------------------------------------------ */

import { type ReactNode, Component, type ErrorInfo } from 'react'
import { Capacitor } from '@capacitor/core'
// @sentry/capacitor wraps the JS SDK and drives the NATIVE crash reporters
// (sentry-cocoa on iOS, sentry-android on Android) so signal-level / plugin /
// unhandled-native crashes are captured, not only JS-in-WebView. Sentry.init's
// SECOND arg is the sibling web init (@sentry/react) - Capacitor initialises the
// native layer and delegates the JS layer to it, both reporting into the ONE
// Co-Exist project, separated by dist:native vs dist:web. The @sentry/react
// peer is pinned EXACTLY to @sentry/capacitor's core version (10.60.0) so both
// layers share a single @sentry/core hub (a version split breaks reporting).
import * as Sentry from '@sentry/capacitor'
import * as SentryReact from '@sentry/react'
import { Button } from '@/components/button'

/* ------------------------------------------------------------------ */
/*  Sentry initialisation                                              */
/* ------------------------------------------------------------------ */

// Public Sentry client DSN (send-only key, safe to embed - it is baked into
// the shipped client bundle either way). Hardcoded as a fallback so a build
// that lacks VITE_SENTRY_DSN in the gitignored .env.production still reports.
const FALLBACK_SENTRY_DSN = 'https://32866cc8070a5ea80672ed8df6c9bfe4@o4511685869305856.ingest.us.sentry.io/4511685879201792'

// Function names belonging to the native bridge script that Meta injects into
// its in-app browser (Instagram / Facebook iOS WKWebView). The injected script
// reaches for window.webkit.messageHandlers without feature-detecting it, so it
// throws on every page it wraps, and our global onerror handler reports it as a
// Co-Exist production error. Confirmed 2026-07-14: zero occurrences of these
// symbols in Co-Exist source or in any bundle app.coexistaus.org actually
// serves, so an event whose frames carry these names did not come from our code.
// Matching on FRAME NAME rather than on the message keeps real Capacitor bridge
// failures inside our own native shell (where messageHandlers must exist)
// visible, since those never carry these frames.
const INJECTED_BRIDGE_FRAMES = new Set([
  'sendDataToNative',
  'sendPageHideMessage',
  '_AutofillCallbackHandler',
])

export function isInjectedThirdPartyBridgeError(event: Sentry.Event): boolean {
  const frames = event.exception?.values?.flatMap(
    (value) => value.stacktrace?.frames ?? [],
  )
  if (!frames?.length) return false
  return frames.some(
    (frame) => frame.function && INJECTED_BRIDGE_FRAMES.has(frame.function),
  )
}

let initialised = false

export function initSentry() {
  if (initialised) return
  const dsn = import.meta.env.VITE_SENTRY_DSN || FALLBACK_SENTRY_DSN
  if (!dsn) {
    console.warn('[sentry] No DSN configured - error reporting disabled')
    return
  }

  const isNative = Capacitor.isNativePlatform()

  Sentry.init(
    {
      dsn,
      environment: import.meta.env.MODE,
      release: `coexist@${import.meta.env.VITE_APP_VERSION || '1.0.0'}`,
      // dist distinguishes the native binary crash surface (dist:native) from
      // the web bundle (dist:web) so native crashes are filterable in the one
      // project. On native, @sentry/capacitor stamps this on native events too.
      dist: isNative ? 'native' : 'web',
      tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
      // Session Replay is not wired (no replayIntegration in integrations), so
      // the replay*SampleRate options were dead config and are not part of
      // @sentry/capacitor's option type. Removed to keep tsc clean; add them
      // back alongside Sentry.replayIntegration() if replay is ever enabled.
      integrations: [],
      beforeSend(event) {
        // Drop errors thrown by scripts a third-party in-app browser injected
        // into our page. They are not Co-Exist defects and they degrade the
        // alerting channel by burying real regressions in recurring noise.
        if (isInjectedThirdPartyBridgeError(event)) return null
        // Strip PII from breadcrumbs if needed
        return event
      },
    },
    // Sibling JS init - Capacitor wires the native SDK around it.
    SentryReact.init,
  )

  // Tag platform (applies to JS events; native events already carry dist).
  Sentry.setTag('platform', Capacitor.getPlatform())
  Sentry.setTag('is_native', String(isNative))
  initialised = true

  // NATIVE-crash trigger for the native-capture verify gate and the standing
  // Sentry silent-death canary (worker 6). Native only, and gated OFF unless
  // either the dev server is running (import.meta.env.DEV) or the build was
  // stamped with VITE_SENTRY_CANARY=1. A normal production `vite build` omits
  // it entirely, so it never ships to end users.
  if (isNative && (import.meta.env.DEV || import.meta.env.VITE_SENTRY_CANARY === '1')) {
    ;(window as unknown as { __eosNativeCrash?: () => void }).__eosNativeCrash =
      () => {
        Sentry.setTag('canary', 'native')
        // Synchronous hard native crash (SIGABRT). The crash is persisted by
        // the native reporter and uploaded on the NEXT app launch.
        Sentry.nativeCrash()
      }
  }
}

/* ------------------------------------------------------------------ */
/*  Public API (safe to call even if Sentry not loaded)                */
/* ------------------------------------------------------------------ */

export function captureException(error: unknown, context?: Record<string, unknown>) {
  console.error('[error]', error)
  Sentry.captureException(error, context)
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  Sentry.captureMessage(message, level)
}

export function setUser(user: { id: string; email?: string } | null) {
  Sentry.setUser(user)
}

export function addBreadcrumb(breadcrumb: {
  category?: string
  message: string
  level?: 'info' | 'warning' | 'error'
  data?: Record<string, unknown>
}) {
  Sentry.addBreadcrumb(breadcrumb)
}

/* ------------------------------------------------------------------ */
/*  Error Boundary with branded error screen                           */
/* ------------------------------------------------------------------ */

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class SentryErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    captureException(error, {
      extra: { componentStack: errorInfo.componentStack },
    })
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div data-eos-id="src/lib/sentry.tsx#0" className="flex flex-col items-center justify-center min-h-dvh p-6 text-center bg-white">
          <div data-eos-id="src/lib/sentry.tsx#1" className="w-16 h-16 mb-4 rounded-md bg-error-100 flex items-center justify-center">
            <svg data-eos-id="src/lib/sentry.tsx#2"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-error-600"
            >
              <circle data-eos-id="src/lib/sentry.tsx#3" cx="12" cy="12" r="10" />
              <line data-eos-id="src/lib/sentry.tsx#4" x1="12" y1="8" x2="12" y2="12" />
              <line data-eos-id="src/lib/sentry.tsx#5" x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 data-eos-id="src/lib/sentry.tsx#6" className="font-heading text-xl font-bold text-neutral-900 mb-2">
            Something went wrong
          </h2>
          <p data-eos-id="src/lib/sentry.tsx#7" className="text-sm text-neutral-500 mb-6 max-w-xs leading-relaxed">
            We&apos;ve been notified and are looking into it.
            Try refreshing or going back.
          </p>
          <div data-eos-id="src/lib/sentry.tsx#8" className="flex gap-2">
            <Button data-eos-id="src/lib/sentry.tsx#9" variant="secondary" onClick={this.handleRetry}>
              Try Again
            </Button>
            <Button data-eos-id="src/lib/sentry.tsx#10" variant="primary" onClick={this.handleReload}>
              Refresh App
            </Button>
          </div>
          {import.meta.env.DEV && this.state.error && (
            <pre data-eos-id="src/lib/sentry.tsx#11" className="mt-6 text-left text-xs text-error-600 bg-error-50 p-3 rounded-sm max-w-sm overflow-auto max-h-40">
              {this.state.error.message}
              {'\n'}
              {this.state.error.stack}
            </pre>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
