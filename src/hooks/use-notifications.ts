import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CalendarClock,
  TicketCheck,
  ArrowUp,
  CalendarX,
  RefreshCw,
  Star,
  Sprout,
  MailPlus,
  Megaphone,
  Flame,
  AtSign,
  MessageCircle,
  Reply,
  Camera,
  BarChart3,
  ClipboardList,
  Bell,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { subscribeWithReconnect } from '@/lib/realtime'
import { useAuth } from '@/hooks/use-auth'
import { useOffline } from '@/hooks/use-offline'
import { queueOfflineAction } from '@/lib/offline-sync'
import type { Tables } from '@/types/database.types'

type Notification = Tables<'notifications'>

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type NotificationType =
  | 'event_reminder'
  | 'registration_confirmed'
  | 'waitlist_promotion'
  | 'event_cancelled'
  | 'event_updated'
  | 'points_earned'
  | 'new_event_in_collective'
  | 'event_invite'
  | 'global_announcement'
  | 'challenge_update'
  | 'chat_mention'
  | 'chat_messages'
  | 'chat_reply'
  | 'chat_image'
  | 'chat_poll'
  | 'chat_announcement'
  | 'survey_request'

export interface NotificationPreferences {
  event_reminder: boolean
  registration_confirmed: boolean
  waitlist_promotion: boolean
  event_cancelled: boolean
  event_updated: boolean
  points_earned: boolean
  new_event_in_collective: boolean
  event_invite: boolean
  global_announcement: boolean
  challenge_update: boolean
  chat_mention: boolean
  chat_messages: boolean
  chat_reply: boolean
  chat_image: boolean
  chat_poll: boolean
  chat_announcement: boolean
  survey_request: boolean
  /**
   * Master switch for transactional notification emails (event confirmations,
   * reminders, cancellations, invites, waitlist promotions). When false the
   * send-email edge function skips those types. Receipts, password resets and
   * payment-failure emails are operational and always send; marketing emails
   * are governed separately by profiles.marketing_opt_in.
   */
  email_enabled: boolean
  quiet_hours_enabled: boolean
  quiet_hours_start: string // "22:00"
  quiet_hours_end: string   // "07:00"
  timezone: string           // IANA timezone e.g. "Australia/Sydney"
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  event_reminder: true,
  registration_confirmed: true,
  waitlist_promotion: true,
  event_cancelled: true,
  event_updated: true,
  points_earned: true,
  new_event_in_collective: true,
  event_invite: true,
  global_announcement: true,
  challenge_update: true,
  chat_mention: true,
  chat_messages: true,
  chat_reply: true,
  chat_image: true,
  chat_poll: true,
  chat_announcement: true,
  survey_request: true,
  email_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
}

export interface GroupedNotifications {
  label: string
  date: string
  notifications: Notification[]
}

/* ------------------------------------------------------------------ */
/*  Deep link map                                                      */
/* ------------------------------------------------------------------ */

/**
 * Resolve deep link route from notification type + data.
 * Single source of truth - also used by use-push.ts for tap routing.
 *
 * Precedence:
 *   1. data.route - explicit caller-supplied route (highest precedence). Lets
 *      any caller deep-link to an arbitrary path without modifying this resolver.
 *      Validated as same-origin path-only (must start with '/' and contain no
 *      '//' or scheme) to prevent navigation hijack via push payload.
 *   2. type-based - canonical type-to-route map below. Used by core in-app types
 *      (events, chat, surveys etc) so the in-app notification feed and push tap
 *      route to the same place even when the sender doesn't supply data.route.
 *   3. fallback '/' - unknown type and no explicit route.
 */
export function resolveNotificationRoute(
  type: string,
  data?: Record<string, string> | null,
): string {
  // 1. Explicit route wins. Validate to a safe in-app path before trusting it.
  const explicit = data?.route
  if (
    typeof explicit === 'string' &&
    explicit.length > 0 &&
    explicit.length < 512 &&
    explicit.startsWith('/') &&
    !explicit.startsWith('//') &&
    !explicit.includes('://')
  ) {
    return explicit
  }

  // 2. Canonical type-based resolution.
  switch (type as NotificationType) {
    case 'event_reminder':
    case 'event_cancelled':
    case 'event_updated':
    case 'registration_confirmed':
    case 'waitlist_promotion':
    case 'new_event_in_collective':
    case 'event_invite':
      return data?.event_id ? `/events/${data.event_id}` : '/events'
    case 'points_earned':
      return '/'
    case 'global_announcement':
      return '/updates'
    case 'challenge_update':
      // No participant /challenges surface exists (feature unbuilt - see F6);
      // a challenge announcement lives in the Updates feed, so route there
      // rather than dumping the user on the home screen.
      return '/updates'
    case 'chat_mention':
    case 'chat_messages':
    case 'chat_reply':
    case 'chat_image':
    case 'chat_poll':
    case 'chat_announcement':
      // A campout/staff channel push carries channel_id (and, for a campout,
      // also its parent collective_id). Route to the channel room first;
      // otherwise the collective's own channel_id would open the WRONG chat
      // (the collective main thread, or - for a staff channel with no
      // collective_id - the bare chat list). Falls back to the collective
      // main chat for ordinary collective messages that carry no channel_id.
      if (data?.channel_id) return `/chat/channel/${data.channel_id}`
      return data?.collective_id ? `/chat/${data.collective_id}` : '/chat'
    case 'survey_request':
      return data?.event_id ? `/events/${data.event_id}/survey` : '/events'
    default:
      return '/'
  }
}

export function getNotificationDeepLink(notification: Notification): string {
  const data = notification.data as Record<string, string> | null
  return resolveNotificationRoute(notification.type, data)
}

/* ------------------------------------------------------------------ */
/*  Icon + tint per type                                               */
/*                                                                     */
/*  Line-art lucide icons, not emoji. Co-Exist dropped emoji from the  */
/*  notification surfaces (Tate 2026-08-13): a clean icon in a neutral  */
/*  circle with a colour-coded stroke reads as considered UI rather     */
/*  than a chat sticker. `tint` is a text colour applied to the icon.   */
/* ------------------------------------------------------------------ */

export function getNotificationIcon(type: string): { Icon: LucideIcon; tint: string } {
  switch (type as NotificationType) {
    case 'event_reminder':
      return { Icon: CalendarClock, tint: 'text-info-600' }
    case 'registration_confirmed':
      return { Icon: TicketCheck, tint: 'text-success-600' }
    case 'waitlist_promotion':
      return { Icon: ArrowUp, tint: 'text-accent-600' }
    case 'event_cancelled':
      return { Icon: CalendarX, tint: 'text-error-600' }
    case 'event_updated':
      return { Icon: RefreshCw, tint: 'text-warning-600' }
    case 'points_earned':
      return { Icon: Star, tint: 'text-warning-600' }
    case 'new_event_in_collective':
      return { Icon: Sprout, tint: 'text-primary-600' }
    case 'event_invite':
      return { Icon: MailPlus, tint: 'text-primary-600' }
    case 'global_announcement':
      return { Icon: Megaphone, tint: 'text-accent-600' }
    case 'challenge_update':
      return { Icon: Flame, tint: 'text-secondary-600' }
    case 'chat_mention':
      return { Icon: AtSign, tint: 'text-info-600' }
    case 'chat_messages':
      return { Icon: MessageCircle, tint: 'text-neutral-500' }
    case 'chat_reply':
      return { Icon: Reply, tint: 'text-info-600' }
    case 'chat_image':
      return { Icon: Camera, tint: 'text-accent-600' }
    case 'chat_poll':
      return { Icon: BarChart3, tint: 'text-primary-600' }
    case 'chat_announcement':
      return { Icon: Megaphone, tint: 'text-warning-600' }
    case 'survey_request':
      return { Icon: ClipboardList, tint: 'text-primary-600' }
    default:
      return { Icon: Bell, tint: 'text-neutral-500' }
  }
}

/* ------------------------------------------------------------------ */
/*  Grouping helper                                                    */
/* ------------------------------------------------------------------ */

/** Max notifications loaded into the feed. The unread badge is aligned to this
 *  same window so it never counts rows the user cannot reach or clear. */
export const NOTIFICATIONS_WINDOW = 100

/**
 * Personal notifications are ephemeral activity, not an archive. A reminder for
 * an event that already happened, or a chat ping from a week ago, is pure noise
 * once it is stale. We hide anything older than this window from the feed AND
 * the unread badge (applied as a `created_at >=` cutoff at query time), so last
 * week's event reminders drop off on their own instead of lingering forever.
 * Tate 2026-08-13: "still seeing notifications from events last week ... they
 * should be gone." Announcements (the `updates` table) are unaffected - those
 * are curated and live on their own surface.
 */
export const NOTIFICATION_FRESHNESS_DAYS = 7

/** ISO timestamp of the oldest notification still shown. Computed per call so it
 *  tracks wall-clock as the query re-runs (staleTime keeps it cheap). */
export function notificationFreshnessCutoff(now: number = Date.now()): string {
  return new Date(now - NOTIFICATION_FRESHNESS_DAYS * 86_400_000).toISOString()
}

/**
 * Local-timezone calendar-day key (YYYY-MM-DD). Built from local date parts,
 * NOT toISOString() (which is UTC): for an AEST user the local morning
 * (midnight-10am) falls in the previous UTC day, so a UTC key mislabels
 * this-morning notifications as "Yesterday". Exported for unit tests.
 */
export function localDayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function groupByDay(
  notifications: Notification[],
  now: Date = new Date(),
): GroupedNotifications[] {
  const groups: Record<string, Notification[]> = {}

  for (const n of notifications) {
    const key = localDayKey(new Date(n.created_at ?? now))
    if (!groups[key]) groups[key] = []
    groups[key].push(n)
  }

  const today = localDayKey(now)
  const yesterday = localDayKey(new Date(now.getTime() - 86400000))

  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => {
      const [y, m, d] = date.split('-').map(Number)
      // Reconstruct at local midnight so the label formats in the same local
      // frame the key was computed in (never re-parsed as a UTC instant).
      const localDate = new Date(y, m - 1, d)
      return {
        date,
        label:
          date === today
            ? 'Today'
            : date === yesterday
              ? 'Yesterday'
              : localDate.toLocaleDateString('en-AU', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                }),
        notifications: items,
      }
    })
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

/** Fetch all notifications for the user */
export function useNotifications() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      if (!user) return []

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', notificationFreshnessCutoff())
        .order('created_at', { ascending: false })
        .limit(NOTIFICATIONS_WINDOW)

      if (error) throw error
      return data ?? []
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  })

  // Realtime subscription
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          queryClient.setQueryData<Notification[]>(
            ['notifications', user.id],
            (old) => {
              if (!old) return [payload.new as Notification]
              return [payload.new as Notification, ...old].slice(0, NOTIFICATIONS_WINDOW)
            },
          )
          queryClient.invalidateQueries({ queryKey: ['notifications-unread', user.id] })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          // Patch read_at (and any other field) into the cache so a read on
          // another device syncs here without waiting for an unrelated
          // invalidation. Without this the channel only heard INSERT/DELETE and
          // read-state drifted across devices.
          const updated = payload.new as Notification
          if (!updated?.id) return
          queryClient.setQueryData<Notification[]>(
            ['notifications', user.id],
            (old) => old?.map((n) => (n.id === updated.id ? { ...n, ...updated } : n)),
          )
          queryClient.invalidateQueries({ queryKey: ['notifications-unread', user.id] })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id?: string })?.id
          if (!deletedId) return
          queryClient.setQueryData<Notification[]>(
            ['notifications', user.id],
            (old) => old?.filter(n => n.id !== deletedId),
          )
          queryClient.invalidateQueries({ queryKey: ['notifications-unread', user.id] })
        },
      )

    const cleanup = subscribeWithReconnect(channel)

    return () => {
      cleanup()
      supabase.removeChannel(channel)
    }
  }, [user, queryClient])

  const grouped = query.data ? groupByDay(query.data) : []

  return { ...query, grouped }
}

/** Unread count */
export function useUnreadCount() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['notifications-unread', user?.id],
    queryFn: async () => {
      if (!user) return 0

      // Count unread within the SAME most-recent window the feed renders, so
      // the badge never exceeds the rows the user can actually see and clear.
      // A raw unbounded count showed e.g. "150" while the capped list held 100,
      // leaving 50 unread that could never be reached or per-item cleared.
      const { data, error } = await supabase
        .from('notifications')
        .select('read_at')
        .eq('user_id', user.id)
        .gte('created_at', notificationFreshnessCutoff())
        .order('created_at', { ascending: false })
        .limit(NOTIFICATIONS_WINDOW)

      if (error) throw error
      return (data ?? []).filter((n) => n.read_at == null).length
    },
    enabled: !!user,
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
  })
}

/** Mark single notification as read */
export function useMarkRead() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { isOffline } = useOffline()

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const now = new Date().toISOString()

      if (isOffline) {
        queueOfflineAction('mark-notification-read', {
          notificationId,
          timestamp: now,
        })
        return
      }

      const { error } = await supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('id', notificationId)
      if (error) throw error
    },
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: ['notifications', user?.id] })
      const previous = queryClient.getQueryData<Notification[]>(['notifications', user?.id])
      const previousUnread = queryClient.getQueryData<number>(['notifications-unread', user?.id])
      const wasUnread = previous?.find(n => n.id === notificationId && !n.read_at)
      queryClient.setQueryData<Notification[]>(['notifications', user?.id], (old) => {
        if (!old) return old
        return old.map(n => n.id === notificationId ? { ...n, read_at: new Date().toISOString() } : n)
      })
      if (wasUnread) {
        queryClient.setQueryData<number>(['notifications-unread', user?.id], (old) => Math.max(0, (old ?? 0) - 1))
      }
      return { previous, previousUnread }
    },
    onError: (_err, _, context) => {
      if (!isOffline) {
        if (context?.previous) queryClient.setQueryData(['notifications', user?.id], context.previous)
        if (context?.previousUnread !== undefined) queryClient.setQueryData(['notifications-unread', user?.id], context.previousUnread)
      }
    },
    onSettled: () => {
      if (isOffline) return
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread', user?.id] })
    },
  })
}

/** Mark all as read */
export function useMarkAllRead() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { isOffline } = useOffline()

  return useMutation({
    mutationFn: async () => {
      if (!user) return
      const now = new Date().toISOString()

      if (isOffline) {
        queueOfflineAction('mark-all-notifications-read', {
          userId: user.id,
          timestamp: now,
        })
        return
      }

      const { error } = await supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('user_id', user.id)
        .is('read_at', null)

      if (error) throw error
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications', user?.id] })
      const previous = queryClient.getQueryData<Notification[]>(['notifications', user?.id])
      const previousUnread = queryClient.getQueryData<number>(['notifications-unread', user?.id])
      const now = new Date().toISOString()
      queryClient.setQueryData<Notification[]>(['notifications', user?.id], (old) => {
        if (!old) return old
        return old.map(n => n.read_at ? n : { ...n, read_at: now })
      })
      queryClient.setQueryData<number>(['notifications-unread', user?.id], 0)
      return { previous, previousUnread }
    },
    onError: (_err, _, context) => {
      if (!isOffline) {
        if (context?.previous) queryClient.setQueryData(['notifications', user?.id], context.previous)
        if (context?.previousUnread !== undefined) queryClient.setQueryData(['notifications-unread', user?.id], context.previousUnread)
      }
    },
    onSettled: () => {
      if (isOffline) return
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['notifications-unread', user?.id] })
    },
  })
}
