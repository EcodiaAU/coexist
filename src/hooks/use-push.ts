import { useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { resolveNotificationRoute } from '@/hooks/use-notifications'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PushNotificationToken {
  value: string
}

interface PushNotificationActionPerformed {
  actionId: string
  notification: {
    data?: Record<string, string>
    title?: string
    body?: string
  }
}

/* ------------------------------------------------------------------ */
/*  Capacitor Push Notifications - dynamic import                      */
/* ------------------------------------------------------------------ */

let PushNotifications: {
  checkPermissions: () => Promise<{ receive: string }>
  requestPermissions: () => Promise<{ receive: string }>
  register: () => Promise<void>
  getDeliveredNotifications: () => Promise<{ notifications: unknown[] }>
  removeAllDeliveredNotifications: () => Promise<void>
  addListener: (event: string, handler: (...args: unknown[]) => void) => Promise<{ remove: () => void }>
} | null = null

async function loadPushPlugin() {
  if (!Capacitor.isNativePlatform()) return null
  if (PushNotifications) return PushNotifications
  try {
    const mod = await import('@capacitor/push-notifications')
    PushNotifications = mod.PushNotifications as unknown as typeof PushNotifications
    return PushNotifications
  } catch {
    console.warn('[push] @capacitor/push-notifications not available')
    return null
  }
}

/* ------------------------------------------------------------------ */
/*  Token storage (module-level, shared by both hooks)                 */
/* ------------------------------------------------------------------ */

/** Current device's token - kept in memory so logout can remove just this one */
let currentDeviceToken: string | null = null

function getDeviceInfo(): Record<string, string> {
  return {
    platform: Capacitor.getPlatform(),
    os_version: (navigator as { userAgent?: string }).userAgent ?? 'unknown',
  }
}

async function storeToken(userId: string, token: string, platform: string) {
  console.info('[push] storing token for user', userId.slice(0, 8), '…', 'platform:', platform, 'token:', token.slice(0, 12) + '…')
  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      {
        user_id: userId,
        token,
        platform,
        device_info: getDeviceInfo(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,token' },
    )

  if (error) {
    console.error('[push] Failed to store token:', error)
    return false
  }
  console.info('[push] token stored successfully')
  currentDeviceToken = token
  return true
}

async function removeToken(userId: string, token: string) {
  const { error } = await supabase
    .from('push_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('token', token)
  if (error) console.error('[push] Failed to remove token:', error)
}

async function removeAllTokensForUser(userId: string) {
  const { error } = await supabase
    .from('push_tokens')
    .delete()
    .eq('user_id', userId)
  if (error) console.error('[push] Failed to remove all tokens for user:', error)
}

async function clearBadgeCount() {
  if (!Capacitor.isNativePlatform()) return
  try {
    const plugin = await loadPushPlugin()
    await plugin?.removeAllDeliveredNotifications()
  } catch {
    // badge API may not be available
  }
}

/** Guard against concurrent registration calls (rapid resume, mount + resume overlap) */
let registrationInFlight = false

/**
 * Attempt to get push permission and register with FCM/APNs.
 * Returns true if registration was triggered (token will arrive via listener).
 * Deduplicated - concurrent calls are no-ops.
 */
async function requestAndRegister(plugin: NonNullable<typeof PushNotifications>): Promise<boolean> {
  if (registrationInFlight) {
    console.info('[push] registration already in flight - skipping')
    return false
  }
  registrationInFlight = true

  try {
    return await _doRequestAndRegister(plugin)
  } finally {
    registrationInFlight = false
  }
}

async function _doRequestAndRegister(plugin: NonNullable<typeof PushNotifications>): Promise<boolean> {
  // Check current permission state first
  let permState: string
  try {
    const check = await plugin.checkPermissions()
    permState = check.receive
  } catch {
    permState = 'prompt'
  }

  // If denied, we can't do anything - user must enable in system settings
  if (permState === 'denied') {
    console.warn('[push] permission denied - user must enable in system settings')
    return false
  }

  // If not yet granted, request permission (shows OS prompt on 'prompt')
  if (permState !== 'granted') {
    try {
      const result = await plugin.requestPermissions()
      permState = result.receive
      console.info('[push] permission request result:', permState)
    } catch {
      console.warn('[push] permission request failed')
      return false
    }
  }

  if (permState !== 'granted') {
    console.warn('[push] permission not granted:', permState)
    return false
  }

  // Permission granted - register with FCM/APNs to get a token
  try {
    await plugin.register()
    console.info('[push] register() called - waiting for token via listener')
    return true
  } catch (err) {
    console.error('[push] register() failed:', err)
    return false
  }
}

/* ------------------------------------------------------------------ */
/*  Early tap-listener - attaches BEFORE auth so cold-launch tap routes */
/*                                                                     */
/*  Capacitor delivers pushNotificationActionPerformed at app boot on  */
/*  cold-launch via push tap. If no listener is attached at that       */
/*  moment, the action is dropped. usePushRegistration ran inside      */
/*  AppShell gated on user-auth - listener attached ~1-3s too late.    */
/*  attachEarlyTapListener resolves a route and buffers it until       */
/*  AppShell wires the consumer (which calls react-router navigate).   */
/* ------------------------------------------------------------------ */

let pendingTapRoute: string | null = null
let tapConsumer: ((route: string) => void) | null = null
let earlyListenerAttached = false

// Persistent tap log so diagnostic page can show whether the listener fired
// across app kills/relaunches. Capped at last 10 entries.
async function persistTapEvent(source: 'early' | 'auth-gated', route: string, data: Record<string, string>): Promise<void> {
  try {
    const existing = await Preferences.get({ key: 'pushTapLog' })
    let arr: unknown[] = []
    if (existing?.value) {
      try { arr = JSON.parse(existing.value) as unknown[] } catch { arr = [] }
    }
    arr.push({ at: new Date().toISOString(), source, route, data })
    if (arr.length > 10) arr = arr.slice(-10)
    await Preferences.set({ key: 'pushTapLog', value: JSON.stringify(arr) })
  } catch {
    // best-effort - never throw out of a listener
  }
}

export async function attachEarlyTapListener(): Promise<void> {
  if (earlyListenerAttached) return
  if (!Capacitor.isNativePlatform()) return
  const plugin = await loadPushPlugin()
  if (!plugin) return
  earlyListenerAttached = true
  await plugin.addListener('pushNotificationActionPerformed', (action: unknown) => {
    const a = action as PushNotificationActionPerformed
    const data = a.notification?.data ?? {}
    const route = resolveNotificationRoute(data.type ?? '', data)
    console.info('[push] tap action - route=', route, 'data=', JSON.stringify(data))
    void persistTapEvent('early', route, data)
    if (tapConsumer) {
      tapConsumer(route)
    } else {
      pendingTapRoute = route
      console.info('[push] tap action buffered - no consumer yet')
    }
  })
  console.info('[push] early tap listener attached')
}

export function registerTapConsumer(consumer: (route: string) => void): () => void {
  tapConsumer = consumer
  if (pendingTapRoute) {
    const r = pendingTapRoute
    pendingTapRoute = null
    console.info('[push] draining buffered tap route=', r)
    consumer(r)
  }
  return () => {
    if (tapConsumer === consumer) tapConsumer = null
  }
}

/* ------------------------------------------------------------------ */
/*  usePushRegistration - mount ONCE at app root (AppShell)            */
/*                                                                     */
/*  Handles:                                                           */
/* - Requesting permission + registering with FCM/APNs              */
/* - Listening for token refresh and persisting to push_tokens      */
/* - Deep-link routing when user taps a notification                */
/* - Re-registering on app resume (handles token rotation)          */
/* - Clearing badge count on foreground                             */
/* - Retry on transient failures                                    */
/* ------------------------------------------------------------------ */

export function usePushRegistration() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const tokenRef = useRef<string | null>(null)
  const listenersRef = useRef<Array<{ remove: () => void }>>([])
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    if (!user) return

    let mounted = true

    async function setup() {
      const plugin = await loadPushPlugin()
      if (!plugin || !mounted) return

      const platform = Capacitor.getPlatform() // 'ios' | 'android'

      // Token received (initial registration or refresh).
      // On iOS this is the APNs device token. AppDelegate forwards it to Firebase via
      // Messaging.messaging().apnsToken, Firebase mints a corresponding FCM token, and
      // MessagingDelegate.didReceiveRegistrationToken stores it to UserDefaults under
      // key 'fcmToken' (which @capacitor/preferences v8 reads from by default). We poll
      // Preferences for that FCM token after 'registration' fires, and upsert it over
      // the APNs token so the send-push edge function (FCM HTTP v1) has a real FCM
      // registration token to target. On Android the plugin already gives us the FCM
      // token directly, so the upsert poll is a no-op there.
      const regListener = await plugin.addListener(
        'registration',
        async (token: unknown) => {
          const t = token as PushNotificationToken
          console.info('[push] token received:', t.value.slice(0, 12) + '…')

          // Skip if we already stored this exact token (rapid resume dedup)
          if (tokenRef.current === t.value) {
            console.info('[push] token unchanged - skipping store')
            return
          }
          tokenRef.current = t.value

          const stored = await storeToken(user!.id, t.value, platform)
          if (!stored && mounted) {
            // Retry once after a short delay on storage failure
            const retryTimer = setTimeout(async () => {
              if (mounted) {
                console.info('[push] retrying token storage…')
                await storeToken(user!.id, t.value, platform)
              }
            }, 3000)
            timersRef.current.push(retryTimer)
          }

          // iOS-only: poll for the FCM token written by AppDelegate.MessagingDelegate.
          // Firebase needs apnsToken set first then makes a network round-trip to mint
          // the FCM token, so it usually arrives 1-5s after this 'registration' event.
          if (platform === 'ios') {
            try {
              const apnsToken = t.value
              const startedAt = Date.now()
              const pollIntervalMs = 1000
              const totalBudgetMs = 30000
              const poll = async () => {
                if (!mounted) return
                const got = await Preferences.get({ key: 'fcmToken' })
                if (got?.value && got.value !== apnsToken) {
                  console.info('[push] fcm token resolved:', got.value.slice(0, 12) + '…')
                  // Replace the APNs row in push_tokens with the FCM row, then drop the
                  // stale APNs row so the edge function only sees the FCM token.
                  tokenRef.current = got.value
                  await storeToken(user!.id, got.value, platform)
                  await removeToken(user!.id, apnsToken)
                  return
                }
                if (Date.now() - startedAt < totalBudgetMs && mounted) {
                  const tNext = setTimeout(poll, pollIntervalMs)
                  timersRef.current.push(tNext)
                } else if (mounted) {
                  console.warn('[push] FCM token did not arrive within budget; APNs token stays in push_tokens (degraded)')
                }
              }
              const t1 = setTimeout(poll, pollIntervalMs)
              timersRef.current.push(t1)
            } catch (err) {
              console.warn('[push] FCM bridge poll setup failed:', err)
            }
          }
        },
      )

      // Registration error
      const errListener = await plugin.addListener(
        'registrationError',
        (err: unknown) => {
          console.error('[push] registration error:', err)
          // Retry registration after a delay
          if (mounted) {
            const retryTimer = setTimeout(async () => {
              if (mounted) {
                console.info('[push] retrying registration after error…')
                await requestAndRegister(plugin)
              }
            }, 5000)
            timersRef.current.push(retryTimer)
          }
        },
      )

      // Notification received while app is open (foreground)
      // Invalidate relevant queries so UI reflects the new data
      const receivedListener = await plugin.addListener(
        'pushNotificationReceived',
        (notification: unknown) => {
          const n = notification as { data?: Record<string, string> }
          const notifType = n.data?.type ?? ''

          // Refresh chat-related queries when a chat push arrives
          if (notifType.startsWith('chat_')) {
            const collectiveId = n.data?.collective_id
            if (collectiveId) {
              queryClient.invalidateQueries({ queryKey: ['chat-messages', collectiveId] })
            }
            queryClient.invalidateQueries({ queryKey: ['unread-counts'] })
            queryClient.invalidateQueries({ queryKey: ['channel-unread'] })
          }

          // Always refresh notification counts
          queryClient.invalidateQueries({ queryKey: ['notifications-unread', user!.id] })
        },
      )

      // Notification tapped - mark in-app notification read.
      // Navigation is handled by the early tap listener (attachEarlyTapListener
      // in main.tsx) so cold-launch taps route correctly. This second listener
      // is auth-gated and only handles the side effects that need the user row.
      const actionListener = await plugin.addListener(
        'pushNotificationActionPerformed',
        async (action: unknown) => {
          const a = action as PushNotificationActionPerformed
          const notifData = a.notification.data ?? {}
          // Diagnostic: persist tap event from this listener too. If the early
          // listener missed it but this one fires, we know the early-attach
          // timing failed. If neither fires, the plugin isn't delivering taps.
          const diagRoute = resolveNotificationRoute(notifData.type ?? '', notifData)
          void persistTapEvent('auth-gated', diagRoute, notifData)
          // Mark the matching in-app notification as read so the feed stays in sync.
          // Match on type + recent timestamp since push doesn't carry the notification row ID.
          try {
            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
            const { data: matching } = await supabase
              .from('notifications')
              .select('id')
              .eq('user_id', user!.id)
              .eq('type', notifData.type ?? '')
              .is('read_at', null)
              .gte('created_at', fiveMinAgo)
              .order('created_at', { ascending: false })
              .limit(1)

            if (matching?.[0]) {
              await supabase
                .from('notifications')
                .update({ read_at: new Date().toISOString() })
                .eq('id', matching[0].id)
              queryClient.invalidateQueries({ queryKey: ['notifications', user!.id] })
              queryClient.invalidateQueries({ queryKey: ['notifications-unread', user!.id] })
            }
          } catch {
            // Best-effort - don't block navigation on mark-read failure
          }
        },
      )

      // Wire the navigate consumer for the early listener. Drains any
      // tap-route buffered during the auth-load window.
      const unregisterConsumer = registerTapConsumer((route) => navigate(route))

      // Native-direct fallback: AppDelegate.didReceive writes `pendingPushRoute`
      // to Preferences on tap (1.8.7(13)+). We drain it here on mount AND poll
      // for the first 3s after mount because on cold-launch iOS may deliver
      // the tap response to AppDelegate AFTER React has already mounted + run
      // the initial drain, so a single-shot drain is empty and the late write
      // would otherwise strand in Preferences.
      const drainPendingPushRoute = async (): Promise<boolean> => {
        try {
          const got = await Preferences.get({ key: 'pendingPushRoute' })
          const route = got?.value
          if (route && route.startsWith('/') && !route.includes('://')) {
            console.info('[push] draining pendingPushRoute from native:', route)
            await Preferences.remove({ key: 'pendingPushRoute' })
            await Preferences.remove({ key: 'pendingPushRouteAt' })
            navigate(route)
            return true
          }
        } catch (err) {
          console.warn('[push] drainPendingPushRoute failed:', err)
        }
        return false
      }
      // Initial drain, then poll for 3s at 200ms intervals to catch the
      // cold-launch race where AppDelegate writes pendingPushRoute slightly
      // after React mount.
      void (async () => {
        if (await drainPendingPushRoute()) return
        let pollCount = 0
        const pollTimer = setInterval(async () => {
          pollCount++
          if (!mounted || pollCount > 15) {
            clearInterval(pollTimer)
            return
          }
          if (await drainPendingPushRoute()) {
            clearInterval(pollTimer)
          }
        }, 200)
        timersRef.current.push(pollTimer as unknown as ReturnType<typeof setTimeout>)
      })()

      listenersRef.current = [regListener, errListener, receivedListener, actionListener, { remove: unregisterConsumer }]

      // Register - listeners are already attached so the token callback will fire
      await requestAndRegister(plugin)
    }

    setup()

    // Clear badge count when app opens
    clearBadgeCount()

    // Re-register on app resume to ensure token is current
    let resumeListener: { remove: () => void } | null = null
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app').then(({ App }) => {
        if (!mounted) return
        App.addListener('appStateChange', async ({ isActive }) => {
          if (isActive && mounted) {
            clearBadgeCount()
            // Drain native-direct pending push route on every resume.
            try {
              const got = await Preferences.get({ key: 'pendingPushRoute' })
              const route = got?.value
              if (route && route.startsWith('/') && !route.includes('://') && mounted) {
                console.info('[push] resume: draining pendingPushRoute from native:', route)
                await Preferences.remove({ key: 'pendingPushRoute' })
                await Preferences.remove({ key: 'pendingPushRouteAt' })
                navigate(route)
              }
            } catch { /* best-effort */ }
            const plugin = await loadPushPlugin()
            if (plugin && mounted) {
              await requestAndRegister(plugin)
            }
          }
        }).then((l) => {
          if (mounted) {
            resumeListener = l
          } else {
            l.remove()
          }
        })
      })
    }

    return () => {
      mounted = false
      listenersRef.current.forEach((l) => l.remove())
      listenersRef.current = []
      timersRef.current.forEach((t) => clearTimeout(t))
      timersRef.current = []
      resumeListener?.remove()
    }
  }, [user, navigate, queryClient])

  return { tokenRef }
}

/* ------------------------------------------------------------------ */
/*  usePush - imperative actions (settings page, logout, dev tools)    */
/*                                                                     */
/*  NOT responsible for registration side-effects - that's             */
/*  usePushRegistration above. This hook is for explicit user actions. */
/* ------------------------------------------------------------------ */

export function usePush() {
  const { user } = useAuth()

  /** Prompt for permission (call at a strategic moment, e.g. after onboarding) */
  const requestPermission = useCallback(async () => {
    const plugin = await loadPushPlugin()
    if (!plugin) return false

    return requestAndRegister(plugin)
  }, [])

  /** Remove this device's token on logout (preserves other devices) */
  const unregister = useCallback(async () => {
    if (!user) return
    if (currentDeviceToken) {
      // Only remove this device's token - other devices keep theirs
      await removeToken(user.id, currentDeviceToken)
      currentDeviceToken = null
    } else {
      // Fallback: if we don't know the current token, remove all
      // (shouldn't happen in normal flow, but safer than leaving stale tokens)
      await removeAllTokensForUser(user.id)
    }
  }, [user])

  /** Clear badge/notification tray */
  const clearBadge = useCallback(async () => {
    await clearBadgeCount()
  }, [])

  return {
    requestPermission,
    unregister,
    clearBadgeCount: clearBadge,
  }
}
