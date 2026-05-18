import { useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion, type PanInfo, type Variants } from 'framer-motion'
import { CheckCheck, Bell } from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { EmptyState } from '@/components/empty-state'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import {
    useNotifications,
    useMarkRead,
    useMarkAllRead,
    getNotificationDeepLink,
    getNotificationMeta,
} from '@/hooks/use-notifications'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import type { Tables } from '@/types/database.types'

type Notification = Tables<'notifications'>

/* ------------------------------------------------------------------ */
/*  Animations                                                         */
/* ------------------------------------------------------------------ */

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } },
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
}

/* ------------------------------------------------------------------ */
/*  Time helpers                                                       */
/* ------------------------------------------------------------------ */

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'just now'
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)

  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

/* ------------------------------------------------------------------ */
/*  Swipeable notification row                                         */
/* ------------------------------------------------------------------ */

function NotificationRow({
  notification,
  onTap,
  onSwipeRead,
  index,
}: {
  notification: Notification
  onTap: () => void
  onSwipeRead: () => void
  index: number
}) {
  const shouldReduceMotion = useReducedMotion()
  const meta = getNotificationMeta(notification.type)
  const isUnread = !notification.read_at
  const dragRef = useRef(false)

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -80 && isUnread) {
      onSwipeRead()
    }
  }

  const handleTap = () => {
    if (!dragRef.current) onTap()
  }

  return (
    <motion.div
      className="relative overflow-hidden rounded-2xl"
      initial={shouldReduceMotion ? false : { opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.2), duration: 0.25, ease: 'easeOut' }}
    >
      {/* Swipe background */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-end pr-4 rounded-r-2xl bg-primary-500"
        aria-hidden="true"
        style={{ width: '120px' }}
      >
        <span className="text-xs font-semibold text-white">Mark read</span>
      </div>

      {/* Notification card */}
      <motion.button
        type="button"
        onClick={handleTap}
        drag="x"
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.1}
        onDragStart={() => { dragRef.current = true }}
        onDragEnd={(e, info) => {
          handleDragEnd(e, info)
          setTimeout(() => { dragRef.current = false }, 50)
        }}
        className={cn(
          'relative flex items-start gap-3.5 w-full px-4 py-4 text-left rounded-2xl',
          'cursor-pointer select-none',
          'transition-colors duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-inset',
          isUnread
            ? 'bg-white shadow-sm border border-neutral-100'
            : 'bg-white shadow-sm border border-neutral-100 opacity-75',
        )}
        aria-label={`${notification.title}. ${notification.body ?? ''}`}
      >
        {/* Icon with tinted circle */}
        <div
          className={cn(
            'flex items-center justify-center shrink-0 w-11 h-11 rounded-xl text-lg shadow-sm',
            isUnread ? 'bg-neutral-100' : 'bg-neutral-100',
            meta.color,
          )}
          aria-hidden="true"
        >
          {meta.emoji}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              'text-sm leading-snug',
              isUnread
                ? 'font-bold text-neutral-900'
                : 'font-medium text-neutral-600',
            )}
          >
            {notification.title}
          </p>
          {notification.body && (
            <p className={cn(
              'text-[13px] mt-0.5 line-clamp-2',
              isUnread ? 'text-neutral-600' : 'text-neutral-400',
            )}>
              {notification.body}
            </p>
          )}
          <span className={cn(
            'text-xs mt-1.5 block font-medium',
            isUnread ? 'text-neutral-500' : 'text-neutral-400',
          )}>
            {timeAgo(notification.created_at)}
          </span>
        </div>

        {/* Unread indicator */}
        {isUnread && (
          <span
            className="shrink-0 w-2.5 h-2.5 rounded-full bg-primary-500 mt-2"
            aria-label="Unread"
          />
        )}
      </motion.button>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  All caught up celebration                                          */
/* ------------------------------------------------------------------ */

function AllCaughtUp() {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 0.1, type: 'spring', stiffness: 200, damping: 22 }}
      className="flex flex-col items-center justify-center px-6 py-14 text-center"
    >
      {/* Illustrated circle */}
      <div className="relative mb-6">
        <div className="w-28 h-28 rounded-full bg-neutral-100 flex items-center justify-center">
          <svg
            width="64"
            height="64"
            viewBox="0 0 120 120"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M60 28 C50 40 40 52 40 64 C40 76 48 86 60 86 C72 86 80 76 80 64 C80 52 70 40 60 28Z"
              className="fill-neutral-300"
            />
            <path
              d="M60 50 V76"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="text-neutral-400"
            />
            <path
              d="M60 58 L50 50"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="text-neutral-300"
            />
            <path
              d="M60 64 L72 56"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="text-neutral-300"
            />
          </svg>
        </div>
      </div>

      <h3 className="font-heading text-lg font-bold text-neutral-800">
        All caught up!
      </h3>
      <p className="mt-2 text-sm text-neutral-500 max-w-xs leading-relaxed">
        No new notifications. Enjoy the peace - or go plant a tree.
      </p>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Notification group                                                 */
/* ------------------------------------------------------------------ */

function NotificationGroup({
  group,
  onTap,
  onSwipeRead,
  startIndex,
}: {
  group: { date: string; label: string; notifications: Notification[] }
  onTap: (n: Notification) => void
  onSwipeRead: (id: string) => void
  startIndex: number
}) {
  return (
    <motion.section variants={fadeUp}>
      {/* Date label */}
      <div className="flex items-center gap-2 px-1 mb-2.5">
        <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
          {group.label}
        </span>
        <div className="flex-1 h-px bg-neutral-100" />
        <span className="text-[11px] font-semibold text-neutral-400 tabular-nums">
          {group.notifications.length}
        </span>
      </div>

      {/* Notification cards */}
      <div className="space-y-2">
        <AnimatePresence>
          {group.notifications.map((n, i) => (
            <NotificationRow
              key={n.id}
              notification={n}
              onTap={() => onTap(n)}
              onSwipeRead={() => onSwipeRead(n.id)}
              index={startIndex + i}
            />
          ))}
        </AnimatePresence>
      </div>
    </motion.section>
  )
}

/* ------------------------------------------------------------------ */
/*  Notifications page                                                 */
/* ------------------------------------------------------------------ */

export default function NotificationsPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: notifications, isLoading, isError, refetch, grouped } = useNotifications()
  const showLoading = useDelayedLoading(isLoading)
  const markRead = useMarkRead()
  const markAllRead = useMarkAllRead()
  const shouldReduceMotion = useReducedMotion()

  const allRead = (notifications ?? []).every((n) => n.read_at)
  const hasNotifications = (notifications ?? []).length > 0
  const unreadCount = (notifications ?? []).filter((n) => !n.read_at).length

  const handleRefresh = useCallback(async () => {
    await refetch()
  }, [refetch])

  const handleTap = (notification: Notification) => {
    if (!notification.read_at) {
      markRead.mutate(notification.id)
    }
    const link = getNotificationDeepLink(notification)
    navigate(link)
  }

  const handleSwipeRead = (notificationId: string) => {
    markRead.mutate(notificationId)
  }

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => toast.success('All notifications marked as read'),
    })
  }

  return (
    <Page
      swipeBack
      noBackground
      className="!px-0 bg-white"
      header={
        <Header
          title="Notifications"
          back
          rightActions={
            hasNotifications && !allRead ? (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={markAllRead.isPending}
                className={cn(
                  'flex items-center justify-center w-11 h-11 rounded-full',
                  'text-neutral-500 hover:bg-neutral-50',
                  'transition-[colors,transform] duration-150 active:scale-[0.93] cursor-pointer select-none',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                )}
                aria-label="Mark all as read"
              >
                <CheckCheck size={20} />
              </button>
            ) : undefined
          }
        />
      }
    >
      <div className="px-4 lg:px-6">
          {isError ? (
              // Soft fallback - the loud "Something went wrong" panel scared
              // users who had zero notifications. Show the standard "All
              // caught up" pose plus a discreet retry tap target.
              <>
                <AllCaughtUp />
                <div className="flex justify-center pb-6">
                  <button
                    type="button"
                    onClick={() => refetch()}
                    className="text-xs font-semibold text-neutral-400 hover:text-neutral-600"
                  >
                    Tap to refresh
                  </button>
                </div>
              </>
          ) : showLoading ? (
            <div className="space-y-4 py-6">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="flex items-start gap-3.5 px-4 py-4 rounded-2xl bg-white border border-neutral-100 animate-pulse">
                  <div className="w-11 h-11 rounded-xl bg-neutral-100 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-neutral-100 rounded w-3/4" />
                    <div className="h-3 bg-neutral-100 rounded w-full" />
                    <div className="h-2.5 bg-neutral-100 rounded w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : !hasNotifications ? (
            <AllCaughtUp />
          ) : (
              <motion.div
                className="py-4 space-y-6"
                variants={shouldReduceMotion ? undefined : stagger}
                initial="hidden"
                animate="visible"
              >
                {/* Unread count banner */}
                {unreadCount > 0 && (
                  <motion.div variants={fadeUp}>
                    <div className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-sm border border-neutral-100">
                      <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary-50">
                        <Bell size={16} className="text-neutral-400" />
                      </div>
                      <p className="text-sm font-semibold text-neutral-800">
                        {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Grouped notifications */}
                {(() => {
                  let runningIndex = 0
                  return grouped.map((group) => {
                    const startIndex = runningIndex
                    runningIndex += group.notifications.length
                    return (
                      <NotificationGroup
                        key={group.date}
                        group={group}
                        onTap={handleTap}
                        onSwipeRead={handleSwipeRead}
                        startIndex={startIndex}
                      />
                    )
                  })
                })()}

                {/* All caught up footer when everything is read */}
                {allRead && <AllCaughtUp />}
              </motion.div>
          )}
      </div>
    </Page>
  )
}
