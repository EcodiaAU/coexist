import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
      return '/'
    case 'chat_mention':
    case 'chat_messages':
    case 'chat_reply':
    case 'chat_image':
    case 'chat_poll':
    case 'chat_announcement':
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
/*  Icon + color per type                                              */
/* ------------------------------------------------------------------ */

export function getNotificationMeta(type: string): { emoji: string; color: string } {
  switch (type as NotificationType) {
    case 'event_reminder':
      return { emoji: '\u{1F4C5}', color: 'bg-info-100' }
    case 'registration_confirmed':
      return { emoji: '\u{2705}', color: 'bg-success-100' }
    case 'waitlist_promotion':
      return { emoji: '\u{1F389}', color: 'bg-accent-100' }
    case 'event_cancelled':
      return { emoji: '\u{274C}', color: 'bg-error-100' }
    case 'event_updated':
      return { emoji: '\u{1F504}', color: 'bg-warning-100' }
    case 'points_earned':
      return { emoji: '\u{2B50}', color: 'bg-warning-100' }
    case 'new_event_in_collective':
      return { emoji: '\u{1F331}', color: 'bg-primary-100' }
    case 'event_invite':
      return { emoji: '\u{1F4E9}', color: 'bg-primary-100' }
    case 'global_announcement':
      return { emoji: '\u{1F4E2}', color: 'bg-accent-100' }
    case 'challenge_update':
      return { emoji: '\u{1F525}', color: 'bg-secondary-100' }
    case 'chat_mention':
      return { emoji: '\u{1F4AC}', color: 'bg-info-100' }
    case 'chat_messages':
      return { emoji: '\u{1F4AC}', color: 'bg-neutral-100' }
    case 'chat_reply':
      return { emoji: '\u{21A9}\u{FE0F}', color: 'bg-info-100' }
    case 'chat_image':
      return { emoji: '\u{1F4F7}', color: 'bg-accent-100' }
    case 'chat_poll':
      return { emoji: '\u{1F4CA}', color: 'bg-primary-100' }
    case 'chat_announcement':
      return { emoji: '\u{1F4E3}', color: 'bg-warning-100' }
    case 'survey_request':
      return { emoji: '\u{1F4CB}', color: 'bg-primary-100' }
    default:
      return { emoji: '\u{1F514}', color: 'bg-neutral-100' }
  }
}

/* ------------------------------------------------------------------ */
/*  Grouping helper                                                    */
/* ------------------------------------------------------------------ */

function groupByDay(notifications: Notification[]): GroupedNotifications[] {
  const groups: Record<string, Notification[]> = {}

  for (const n of notifications) {
    const date = new Date(n.created_at ?? Date.now())
    const key = date.toISOString().slice(0, 10) // YYYY-MM-DD

    if (!groups[key]) groups[key] = []
    groups[key].push(n)
  }

  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({
      date,
      label:
        date === today
          ? 'Today'
          : date === yesterday
            ? 'Yesterday'
            : new Date(date).toLocaleDateString('en-AU', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              }),
      notifications: items,
    }))
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
        .order('created_at', { ascending: false })
        .limit(100)

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
              return [payload.new as Notification, ...old].slice(0, 100)
            },
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

      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('read_at', null)

      if (error) throw error
      return count ?? 0
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
