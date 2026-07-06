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
import { Button } from '@/components/button'

/* ------------------------------------------------------------------ */
/*  Sentry initialisation                                              */
/* ------------------------------------------------------------------ */

let Sentry: {
  init: (opts: Record<string, unknown>) => void
  captureException: (error: unknown, context?: Record<string, unknown>) => void
  captureMessage: (message: string, level?: unknown) => void
  setUser: (user: { id: string; email?: string } | null) => void
  setTag: (key: string, value: string) => void
  addBreadcrumb: (breadcrumb: Record<string, unknown>) => void
} | null = null

// Public Sentry client DSN (send-only key, safe to embed - it is baked into
// the shipped client bundle either way). Hardcoded as a fallback so a build
// that lacks VITE_SENTRY_DSN in the gitignored .env.production still reports.
const FALLBACK_SENTRY_DSN = 'https://32866cc8070a5ea80672ed8df6c9bfe4@o4511685869305856.ingest.us.sentry.io/4511685879201792'

export async function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN || FALLBACK_SENTRY_DSN
  if (!dsn) {
    console.warn('[sentry] No DSN configured - error reporting disabled')
    return
  }

  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - optional dependency, may not be installed
    const mod = await import('@sentry/react')
    Sentry = mod as typeof Sentry

    mod.init({
      dsn,
      environment: import.meta.env.MODE,
      release: `coexist@${import.meta.env.VITE_APP_VERSION || '1.0.0'}`,
      tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: import.meta.env.PROD ? 0.5 : 0,
      integrations: [],
      beforeSend(event) {
        // Strip PII from breadcrumbs if needed
        return event
      },
    })

    // Tag platform
    mod.setTag('platform', Capacitor.getPlatform())
    mod.setTag('is_native', String(Capacitor.isNativePlatform()))
  } catch {
    console.warn('[sentry] @sentry/react not installed - error reporting disabled')
  }
}

/* ------------------------------------------------------------------ */
/*  Public API (safe to call even if Sentry not loaded)                */
/* ------------------------------------------------------------------ */

export function captureException(error: unknown, context?: Record<string, unknown>) {
  console.error('[error]', error)
  Sentry?.captureException(error, context)
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  Sentry?.captureMessage(message, level)
}

export function setUser(user: { id: string; email?: string } | null) {
  Sentry?.setUser(user)
}

export function addBreadcrumb(breadcrumb: {
  category?: string
  message: string
  level?: 'info' | 'warning' | 'error'
  data?: Record<string, unknown>
}) {
  Sentry?.addBreadcrumb(breadcrumb)
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
        <div className="flex flex-col items-center justify-center min-h-dvh p-6 text-center bg-white">
          <div className="w-16 h-16 mb-4 rounded-md bg-error-100 flex items-center justify-center">
            <svg
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
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="font-heading text-xl font-bold text-neutral-900 mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-neutral-500 mb-6 max-w-xs leading-relaxed">
            We&apos;ve been notified and are looking into it.
            Try refreshing or going back.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={this.handleRetry}>
              Try Again
            </Button>
            <Button variant="primary" onClick={this.handleReload}>
              Refresh App
            </Button>
          </div>
          {import.meta.env.DEV && this.state.error && (
            <pre className="mt-6 text-left text-xs text-error-600 bg-error-50 p-3 rounded-sm max-w-sm overflow-auto max-h-40">
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
