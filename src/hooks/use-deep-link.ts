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
function resolveDeepLinkPath(rawPath: string): string {
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
      return '/home'
    default:
      return `/${rawPath}`
  }
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
          let resolved: string | null = null
          try {
            // Universal link: https://coexist.app/events/abc → /events/abc
            const url = new URL(event.url)
            resolved = resolveDeepLinkPath(url.pathname)
          } catch {
            // Custom scheme: coexist://events/abc → /events/abc
            const slug = event.url.replace(/^[^:]+:\/\//, '')
            resolved = resolveDeepLinkPath(slug)
          }

          if (!resolved || resolved === '/') return

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
