import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { useAuth } from '@/hooks/use-auth'

/**
 * Map of custom-scheme paths → in-app routes.
 * Handles both universal links (https://coexist.app/...) and
 * custom scheme links (coexist://...).
 *
 * Supported deep links:
 *   coexist://events/{id}              → /events/{id}
 *   coexist://events/{id}/{sub}        → /events/{id}/{sub} (day, impact, survey, profile-survey, ticket-confirmation, check-in, edit)
 *   coexist://collectives/{id}         → /collectives/{id}
 *   coexist://collectives/{id}/{sub}   → /collectives/{id}/{sub} (manage)
 *   coexist://member/{id}              → /profile/{id}
 *   coexist://share/impact             → /profile (impact tab)
 *   coexist://share/event/{id}         → /events/{id}
 */
export function resolveDeepLinkPath(rawPath: string): string {
  // Normalise: strip leading/trailing slashes, lowercase
  const segments = rawPath.replace(/^\/+|\/+$/g, '').split('/')

  const [first, second, third] = segments

  switch (first) {
    case 'events':
      if (!second) return '/events/'
      return third ? `/events/${second}/${third}` : `/events/${second}`
    case 'collectives':
      if (!second) return '/collectives/'
      return third ? `/collectives/${second}/${third}` : `/collectives/${second}`
    case 'member':
      return `/profile/${second || ''}`
    case 'share':
      if (second === 'impact') return '/profile'
      if (second === 'event' && third) return `/events/${third}`
      return '/'
    default:
      return `/${rawPath}`
  }
}

/**
 * Resolve a native appUrlOpen URL (custom scheme OR universal link) to an
 * in-app route, or null to ignore it.
 *
 * new URL() does NOT throw on a custom scheme like `coexist://events/abc`:
 * it parses `events` as the host and leaves pathname `/abc`, so feeding
 * url.pathname to the resolver produces a bare, unmatched route (`/abc`) that
 * renders the 404. Custom schemes are therefore scheme-stripped
 * (coexist://events/abc -> events/abc); only http(s) universal links use
 * url.pathname (https://app.coexistaus.org/events/abc -> /events/abc).
 */
export function resolveAppUrl(rawUrl: string | undefined | null): string | null {
  const raw = (rawUrl ?? '').trim()
  if (!raw) return null

  let resolved: string
  if (/^https?:\/\//i.test(raw)) {
    try {
      resolved = resolveDeepLinkPath(new URL(raw).pathname)
    } catch {
      return null
    }
  } else {
    resolved = resolveDeepLinkPath(raw.replace(/^[^:]+:\/\/+/, ''))
  }

  if (!resolved || resolved === '/') return null
  return resolved
}

export function useDeepLink() {
  const navigate = useNavigate()
  const { user, isLoading } = useAuth()
  const pendingRoute = useRef<string | null>(null)

  // When auth finishes loading and we have a queued deep link, navigate now
  useEffect(() => {
    if (!isLoading && pendingRoute.current) {
      const route = pendingRoute.current
      pendingRoute.current = null
      navigate(route)
    }
  }, [isLoading, user, navigate])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let cleanup: (() => void) | undefined

    async function setup() {
      try {
        const { App } = await import('@capacitor/app')

        const listener = await App.addListener('appUrlOpen', (event) => {
          const resolved = resolveAppUrl(event.url)
          if (!resolved) return

          // If auth is still loading (cold start), queue the route
          // so RequireAuth doesn't redirect to /login before session resolves
          if (isLoading) {
            pendingRoute.current = resolved
          } else {
            navigate(resolved)
          }
        })

        cleanup = () => listener.remove()
      } catch {
        // @capacitor/app not available - skip deep link setup
      }
    }

    setup()
    return () => cleanup?.()
  }, [navigate, isLoading])
}
