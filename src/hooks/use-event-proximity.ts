import { useEffect, useRef, useCallback, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import { parseLocationPoint } from '@/lib/geo'

interface RegistrationEvent {
  id: string
  title: string
  activity_type: string
  date_start: string
  date_end: string | null
  location_point: unknown
  status: string
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface NearbyEvent {
  id: string
  title: string
  activity_type: string
  date_start: string
  date_end: string | null
  distance_m: number
}

interface UseEventProximityReturn {
  nearbyEvent: NearbyEvent | null
  isChecking: boolean
  lastCheck: Date | null
  /** If geolocation failed, describes why (permission denied, unavailable, etc.) */
  locationError: string | null
  checkNow: () => Promise<void>
}

/* ------------------------------------------------------------------ */
/*  Haversine distance (meters)                                        */
/* ------------------------------------------------------------------ */

function haversineM(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Radius in meters to consider "at the event" */
const PROXIMITY_RADIUS_M = 500

/** How often to re-check location (ms) */
const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

/** How far ahead/behind to look for events (ms) - max 30 min before start */
const TIME_WINDOW_MS = 30 * 60 * 1000 // 30 minutes before start, during event

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useEventProximity(): UseEventProximityReturn {
  const { user } = useAuth()
  const [nearbyEvent, setNearbyEvent] = useState<NearbyEvent | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [lastCheck, setLastCheck] = useState<Date | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dismissedRef = useRef<Set<string>>(new Set())

  const checkProximity = useCallback(async () => {
    if (!user) return
    setIsChecking(true)

    try {
      // Get current position - use Capacitor plugin on native, web API as fallback
      let position: GeolocationPosition
      if (Capacitor.isNativePlatform()) {
        const { Geolocation } = await import('@capacitor/geolocation')

        // Check permission first so we can give a specific error
        const permStatus = await Geolocation.checkPermissions()
        if (permStatus.location === 'denied') {
          setLocationError('Location access denied. Enable location in your device settings to get check-in prompts.')
          setNearbyEvent(null)
          return
        }

        if (permStatus.location === 'prompt' || permStatus.location === 'prompt-with-rationale') {
          const requested = await Geolocation.requestPermissions({ permissions: ['location'] })
          if (requested.location === 'denied') {
            setLocationError('Location access denied. Enable location in your device settings to get check-in prompts.')
            setNearbyEvent(null)
            return
          }
        }

        // Two-phase approach: fast coarse fix first, then optional high-accuracy refinement
        try {
          // Phase 1: fast cell/wifi positioning
          const coarseCoords = await Geolocation.getCurrentPosition({
            enableHighAccuracy: false,
            timeout: 8000,
          })
          position = coarseCoords as GeolocationPosition

          // Phase 2 (warm the GPS for next interval): if coarse accuracy is
          // poor, kick off a high-accuracy fetch in the background. We don't
          // await it or use the result here - it primes the OS location cache
          // so the next CHECK_INTERVAL_MS tick has a recent precise fix to
          // work with via maximumAge. Dropped silently on failure.
          if (coarseCoords.coords.accuracy > 500) {
            Geolocation.getCurrentPosition({
              enableHighAccuracy: true,
              timeout: 30000,
            }).catch(() => {})
          }
        } catch {
          // Coarse fix failed - try high-accuracy as last resort with longer timeout
          try {
            const fallbackCoords = await Geolocation.getCurrentPosition({
              enableHighAccuracy: true,
              timeout: 30000,
            })
            position = fallbackCoords as GeolocationPosition
          } catch {
            setLocationError("Couldn't get your location - check GPS settings are enabled.")
            setNearbyEvent(null)
            return
          }
        }
      } else {
        // Check if geolocation API exists
        if (!navigator.geolocation) {
          setLocationError('Location is not supported by your browser.')
          setNearbyEvent(null)
          return
        }

        // Two-phase: try coarse first, then refine
        try {
          position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 8000,
              maximumAge: 60000,
            })
          })

          // If coarse accuracy is poor, try high-accuracy with longer timeout
          if (position.coords.accuracy > 500) {
            try {
              const precise = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                  enableHighAccuracy: true,
                  timeout: 30000,
                  maximumAge: 0,
                })
              })
              position = precise
            } catch {
              // Use the coarse position - it's better than nothing
            }
          }
        } catch {
          // Coarse failed - try high-accuracy as last resort
          position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 30000,
              maximumAge: 60000,
            })
          })
        }
      }

      // Clear any previous location error on success
      setLocationError(null)

      const userLat = position.coords.latitude
      const userLng = position.coords.longitude
      const now = new Date()

      // Find events the user is registered for, happening now or very soon
      const { data: registrations } = await supabase
        .from('event_registrations')
        .select(`
          event_id,
          status,
          checked_in_at,
          events!inner(
            id, title, activity_type, date_start, date_end,
            location_point, status
          )
        `)
        .eq('user_id', user.id)
        .in('status', ['registered', 'invited'])
        .is('checked_in_at', null)

      if (!registrations?.length) {
        setNearbyEvent(null)
        return
      }

      // Filter by time window and proximity
      let closest: NearbyEvent | null = null
      let closestDist = Infinity

      for (const reg of registrations) {
        const event = (reg as unknown as { events: RegistrationEvent | null }).events
        if (!event || event.status !== 'published') continue
        if (dismissedRef.current.has(event.id)) continue

        const eventStart = new Date(event.date_start)
        const eventEnd = event.date_end ? new Date(event.date_end) : new Date(eventStart.getTime() + 3 * 60 * 60 * 1000)

        // Check time window: from 1h before start to end
        const earlyStart = new Date(eventStart.getTime() - TIME_WINDOW_MS)
        if (now < earlyStart || now > eventEnd) continue

        // Check location proximity
        const loc = parseLocationPoint(event.location_point)
        if (!loc) continue

        const dist = haversineM(userLat, userLng, loc.lat, loc.lng)
        if (dist <= PROXIMITY_RADIUS_M && dist < closestDist) {
          closestDist = dist
          closest = {
            id: event.id,
            title: event.title,
            activity_type: event.activity_type,
            date_start: event.date_start,
            date_end: event.date_end,
            distance_m: Math.round(dist),
          }
        }
      }

      setNearbyEvent(closest)
    } catch (err) {
      console.warn('[proximity] Geolocation check failed:', err)
      // Surface actionable error messages
      const e = err as { code?: number; message?: string }
      if (e?.code === 1) {
        // GeolocationPositionError.PERMISSION_DENIED
        setLocationError('Location access denied. Enable location in your device settings to get check-in prompts.')
      } else if (e?.code === 2) {
        // POSITION_UNAVAILABLE
        setLocationError('Location unavailable. Check that location services are enabled.')
      } else if (e?.code === 3) {
        // TIMEOUT
        setLocationError("Couldn't get your location - check GPS settings are enabled.")
      } else {
        setLocationError(null) // transient/unknown - don't persist
      }
      setNearbyEvent(null)
    } finally {
      setIsChecking(false)
      setLastCheck(new Date())
    }
  }, [user])

  // Auto-check on interval
  useEffect(() => {
    if (!user) return

    // Initial check after a short delay
    const timeout = setTimeout(checkProximity, 3000)

    // Periodic re-checks
    intervalRef.current = setInterval(checkProximity, CHECK_INTERVAL_MS)

    return () => {
      clearTimeout(timeout)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [user, checkProximity])

  return { nearbyEvent, isChecking, lastCheck, locationError, checkNow: checkProximity }
}

/* ------------------------------------------------------------------ */
/*  Send proximity-based push notification (for Edge Function use)     */
/* ------------------------------------------------------------------ */

/**
 * Trigger a proximity check-in notification for all registered attendees
 * of an event. Called from the event-day-notify Edge Function.
 *
 * This is the client-side counterpart - it checks if the current user
 * is near an event and shows a local notification prompt.
 */
export async function sendLocalCheckInPrompt(eventTitle: string, eventId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Math.random() * 100000),
          title: 'You\'re at the event!',
          body: `Tap to check in to ${eventTitle}`,
          extra: { type: 'event_check_in', eventId },
          schedule: { at: new Date() },
          smallIcon: 'ic_notification',
        },
      ],
    })
  } catch {
    // Local notifications not available
  }
}
