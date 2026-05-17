import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import {
    QueryClient,
    QueryClientProvider,
    dehydrate,
    hydrate,
} from '@tanstack/react-query'
import { HelmetProvider } from 'react-helmet-async'
import { AuthProvider } from '@/components/auth-provider'
import { ToastProvider } from '@/components/toast'
import {
    attachOfflineSyncListener,
    restoreQueryCache,
    persistQueryCache,
} from '@/lib/offline-sync'
import { CookieConsentBanner } from '@/components/cookie-consent'
import { initSentry, SentryErrorBoundary } from '@/lib/sentry'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { clearChunkReloadGuard } from '@/lib/lazy-with-retry'
import App from './App'
import './styles/globals.css'

// If we got here, the entry bundle (which lazily imports App + every page
// chunk reference) loaded successfully. That proves we're on a fresh build,
// so it's safe to release the chunk-reload guard now - before any lazy
// import runs and before App.tsx mounts. Doing it inside App's useEffect
// (the previous behaviour) was too late: a failed lazy import on a deep
// route would prevent App from ever mounting, leaving the guard latched
// and turning every subsequent refresh into a permanent white screen.
clearChunkReloadGuard()

// Dismiss the Capacitor SplashScreen plugin overlay immediately on native.
// The system splash (Android 12+ Theme.SplashScreen / iOS LaunchScreen) covers
// the launch gap; the React `SplashPage` component handles the in-app splash.
// The plugin's WebView overlay would otherwise flash a stretched/cropped image
// between the system splash and the React splash.
if (Capacitor.isNativePlatform()) {
  SplashScreen.hide({ fadeOutDuration: 0 }).catch(() => { /* plugin not present */ })

  // Force the status bar to fully overlay the WebView with a transparent
  // background. Without this Android can render an opaque (or scrimmed) bar
  // in the notch area which breaks our full-bleed pages.
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {})
    StatusBar.setStyle({ style: Style.Light }).catch(() => {})
    if (Capacitor.getPlatform() === 'android') {
      // setBackgroundColor only applies on Android. Transparent so the WebView
      // shows through behind the camera notch / status icons.
      StatusBar.setBackgroundColor({ color: '#00000000' }).catch(() => {})
    }
  }).catch(() => { /* plugin not present */ })
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 2,
      retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
      networkMode: 'offlineFirst' as const,
      refetchOnWindowFocus: false,
    },
  },
})

// Restore cached query data from localStorage on startup
const savedCache = restoreQueryCache()
if (savedCache) {
  try {
    hydrate(queryClient, savedCache)
  } catch {
    // Corrupted cache - ignore
  }
}

// Persist critical query cache to localStorage periodically + on visibility change.
// Event-day prefixes (event, event-attendees, event-impact, event-waitlist) added
// 9 May 2026 for 1.8.5 mid-event resilience: leaders refresh the day-of dashboard
// over patchy mobile networks; without persisted cache, a refresh wipes the
// attendee list and requires the network to come back before the leader can
// keep checking people in. Origin: Tate verbatim 17:11 AEST 9 May 2026.
const CRITICAL_QUERY_PREFIXES = [
  'profile',
  'profile-collectives',
  'profile-stats',
  'my-events',
  'chat-messages',
  'event',
  'event-attendees',
  'event-impact',
  'event-waitlist',
  'home',
]

function persistCriticalCache() {
  const state = dehydrate(queryClient, {
    shouldDehydrateQuery: (query) => {
      const key = query.queryKey[0] as string
      return CRITICAL_QUERY_PREFIXES.includes(key)
    },
  })
  persistQueryCache(state)
}

// Save cache every 30 seconds
setInterval(persistCriticalCache, 30_000)

// Save cache when user navigates away or tabs out
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    persistCriticalCache()
  }
})

// Auto-sync offline check-ins when connectivity is restored
attachOfflineSyncListener()

// Attach the push-notification tap listener as early as possible so cold-launch
// taps route correctly. Capacitor delivers pushNotificationActionPerformed at
// app boot when the user opened the app by tapping a notification; if no
// listener is attached at that moment, the action is dropped and the user
// lands on '/'. usePushRegistration inside AppShell is gated on auth-resolve
// so it attaches too late. The early listener buffers the resolved route
// until AppShell wires a consumer (which calls react-router navigate).
if (Capacitor.isNativePlatform()) {
  import('@/hooks/use-push').then(({ attachEarlyTapListener }) => {
    attachEarlyTapListener().catch((err) => console.warn('[push] early tap listener attach failed:', err))
  })
}

// Initialize Sentry error reporting (no-op if VITE_SENTRY_DSN is not set)
initSentry()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              <SentryErrorBoundary>
                <App />
              </SentryErrorBoundary>
              <CookieConsentBanner />
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </HelmetProvider>
  </StrictMode>,
)

// Register service worker - detect updates and prompt reload
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Check for updates periodically (every 30 min)
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000)

      // When a new SW is waiting, tell it to activate and reload
      function onNewSW() {
        const waiting = reg.waiting
        if (!waiting) return
        waiting.postMessage({ type: 'SKIP_WAITING' })
        waiting.addEventListener('statechange', () => {
          if (waiting.state === 'activated') {
            window.location.reload()
          }
        })
      }

      // SW already waiting (e.g. user revisits after deploy)
      if (reg.waiting) onNewSW()

      // New SW installed while page is open
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing
        if (!installing) return
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            onNewSW()
          }
        })
      })
    }).catch(() => {
      // Service worker registration failed - silent fallback
    })
  })
}
