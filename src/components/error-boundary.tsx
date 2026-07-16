import { Component, type ReactNode } from 'react'
import { EmptyState } from './empty-state'

interface Props {
  children: ReactNode
  /** Optional fallback to render instead of the default error UI */
  fallback?: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * Catches render errors in child components and shows a friendly fallback.
 * Wrap around route-level pages so a single broken page doesn't blank the app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    // If Sentry is loaded, it captures via its own ErrorBoundary or global handler.
    // This is a safety net for the UI only.
    console.error('[ErrorBoundary]', error)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <EmptyState data-eos-id="src/components/error-boundary.tsx#0" data-eos-v="2"
          illustration="error"
          title="Something went wrong"
          description="This page ran into an issue. Reload to try again."
          // Must be a full reload, not a Link. Navigating via Link only changes
          // the URL - the errored boundary still has hasError=true and keeps
          // showing the fallback, so the UI looks stuck. Reload resets the
          // React tree entirely.
          action={{ label: 'Reload', onClick: () => window.location.assign('/') }}
        />
      )
    }
    return this.props.children
  }
}
