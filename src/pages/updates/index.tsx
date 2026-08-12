import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { Pin, Megaphone, AlertTriangle, ChevronRight, Images } from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Avatar } from '@/components/avatar'
import { EmptyState } from '@/components/empty-state'
import { OptimizedImage } from '@/components/optimized-image'
import { cn } from '@/lib/cn'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import {
    useUpdates,
    useMarkUpdateRead,
    useMarkAllUpdatesRead,
    type UpdateWithAuthor,
} from '@/hooks/use-updates'
import {
    useNotifications,
    useMarkRead,
    getNotificationDeepLink,
    getNotificationIcon,
} from '@/hooks/use-notifications'
import type { Tables } from '@/types/database.types'

type AppNotification = Tables<'notifications'>

/* ------------------------------------------------------------------ */
/*  Animations                                                         */
/* ------------------------------------------------------------------ */

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
}
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] } },
}

/* ------------------------------------------------------------------ */
/*  Time helper                                                        */
/* ------------------------------------------------------------------ */

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = Date.now()
  const diff = Math.floor((now - date.getTime()) / 1000)

  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: diff > 31536000 ? 'numeric' : undefined,
  })
}

/* ------------------------------------------------------------------ */
/*  Get all images for an update                                       */
/* ------------------------------------------------------------------ */

function getImages(update: UpdateWithAuthor): string[] {
  const urls = (update as unknown as { image_urls?: string[] }).image_urls
  if (urls && urls.length > 0) return urls
  if (update.image_url) return [update.image_url]
  return []
}

/* ------------------------------------------------------------------ */
/*  Render content with clickable links                                */
/* ------------------------------------------------------------------ */

// Fresh regex per call. A module-level /g pattern would retain `lastIndex`
// across invocations, so later renders would resume from the previous text's
// offset and silently skip matches near the start of a new string.
const LINK_PATTERN_SOURCE = String.raw`\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)`

function RichContent({ text, className }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  const linkPattern = new RegExp(LINK_PATTERN_SOURCE, 'g')

  while ((match = linkPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    if (match[1] && match[2]) {
      parts.push(
        <a
          key={key++}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-600 font-semibold underline underline-offset-2 decoration-primary-300 hover:decoration-primary-500 hover:text-primary-700 transition-colors"
        >
          {match[1]}
        </a>,
      )
    } else if (match[3]) {
      parts.push(
        <a
          key={key++}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-600 font-semibold underline underline-offset-2 decoration-primary-300 hover:decoration-primary-500 hover:text-primary-700 transition-colors break-all"
        >
          {match[3]}
        </a>,
      )
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return <div className={className}>{parts}</div>
}

/* ------------------------------------------------------------------ */
/*  Inline update detail view (replaces list, no overlay)              */
/* ------------------------------------------------------------------ */

function UpdateDetailView({ update }: { update: UpdateWithAuthor }) {
  const images = getImages(update)
  const isUrgent = update.priority === 'urgent'
  const splashImage = images[0] ?? null
  const extraImages = images.slice(1)

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Splash / hero image - full bleed */}
      {splashImage && (
        <div className="relative -mx-4 lg:-mx-6">
          <img
            src={splashImage}
            alt=""
            className="w-full aspect-[16/9] lg:aspect-[21/9] object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent" />
        </div>
      )}

      <div className={cn(
        'max-w-3xl mx-auto pb-12',
        splashImage ? '-mt-8 relative z-10 px-1' : 'pt-2 px-1',
      )}>
        {/* Badges */}
        {(update.is_pinned || isUrgent) && (
          <div className="flex items-center gap-2 mb-3">
            {update.is_pinned && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                <Pin size={10} aria-hidden="true" />
                Pinned
              </span>
            )}
            {isUrgent && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-warning-700 bg-warning-50 px-2 py-0.5 rounded-full">
                <AlertTriangle size={10} aria-hidden="true" />
                Urgent
              </span>
            )}
          </div>
        )}

        {/* Title */}
        <h1 className="font-heading text-2xl lg:text-3xl font-bold text-neutral-900 leading-tight mb-4">
          {update.title}
        </h1>

        {/* Author + time */}
        <div className="flex items-center gap-3 mb-6 pb-5 border-b border-neutral-100">
          <Avatar
            src={update.author?.avatar_url}
            name={update.author?.display_name ?? 'Staff'}
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-neutral-800">
              {update.author?.display_name ?? 'Co-Exist Team'}
            </span>
            <p className="text-xs text-neutral-400 mt-0.5">
              {formatDate(update.created_at ?? '')}
            </p>
          </div>
        </div>

        {/* Content */}
        <RichContent
          text={update.content}
          className="text-[15px] lg:text-base text-neutral-600 leading-[1.8] whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
        />

        {/* Additional images (after content, below the splash) */}
        {extraImages.length > 0 && (
          <div className="mt-6 space-y-3">
            {extraImages.map((src, i) => (
              <div key={i} className="rounded-md overflow-hidden ring-1 ring-black/[0.04]">
                <img src={src} alt="" loading="lazy" decoding="async" className="w-full object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Announcement tile - full-bleed imagery-first card                  */
/*                                                                     */
/*  Same composition as the chat list + homepage event cards: cover    */
/*  image (or a nature gradient + leaf-mark for image-less posts)      */
/*  fills the tile, a dark bottom-up gradient keeps the overlaid title  */
/*  and author legible. Reads as a magazine, not a notification list.   */
/* ------------------------------------------------------------------ */

function AnnouncementTile({
  update,
  onOpen,
}: {
  update: UpdateWithAuthor
  onOpen: () => void
}) {
  const shouldReduceMotion = useReducedMotion()
  const images = getImages(update)
  const cover = images[0] ?? null
  const isUrgent = update.priority === 'urgent'
  const isUnread = !update.is_read

  return (
    <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={update.title}
        className={cn(
          'group relative block w-full overflow-hidden rounded-lg shadow-sm text-left',
          'aspect-[16/10] sm:aspect-[2/1] transition-transform duration-200 active:scale-[0.985]',
          isUnread && 'ring-2 ring-primary-400',
        )}
      >
        {cover ? (
          <OptimizedImage
            src={cover}
            alt=""
            aspectRatio="16/10"
            wrapperClassName="absolute inset-0"
            sizes="(min-width: 1024px) 66vw, 100vw"
            className="absolute inset-0"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary-600 to-moss-700" aria-hidden="true">
            <div className="absolute -right-6 -top-6 text-white/10 pointer-events-none">
              <Megaphone size={148} strokeWidth={1} />
            </div>
          </div>
        )}

        {/* Legibility gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" aria-hidden="true" />

        {/* Top-right status pills */}
        {(update.is_pinned || isUrgent || images.length > 1) && (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
            {update.is_pinned && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/20 backdrop-blur-sm px-2 py-0.5 text-[11px] font-semibold text-white">
                <Pin size={11} strokeWidth={2} />
                Pinned
              </span>
            )}
            {isUrgent && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-500/90 backdrop-blur-sm px-2 py-0.5 text-[11px] font-semibold text-white">
                <AlertTriangle size={11} strokeWidth={2} />
                Urgent
              </span>
            )}
            {images.length > 1 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/35 backdrop-blur-sm px-2 py-0.5 text-[11px] font-semibold text-white">
                <Images size={11} strokeWidth={2} />
                {images.length}
              </span>
            )}
          </div>
        )}

        {/* Bottom overlay content */}
        <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-5">
          <h3 className="font-heading text-lg sm:text-xl font-bold text-white leading-tight drop-shadow-sm line-clamp-2">
            {update.title}
          </h3>
          <p className="mt-1 text-[13px] text-white/80 leading-snug line-clamp-2 drop-shadow-sm">
            {update.content}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <Avatar
              src={update.author?.avatar_url}
              name={update.author?.display_name ?? 'Staff'}
              size="xs"
            />
            <span className="text-xs font-semibold text-white/90 truncate">
              {update.author?.display_name ?? 'Co-Exist Team'}
            </span>
            <span className="text-[11px] text-white/60 shrink-0">
              {formatDate(update.created_at ?? '')}
            </span>
          </div>
        </div>
      </button>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Section label - hairline divider                                   */
/* ------------------------------------------------------------------ */

function SectionLabel({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-1 mb-3">
      <p className="text-[11px] uppercase tracking-[0.15em] font-bold text-neutral-400">
        {label}
      </p>
      <div className="h-px flex-1 bg-neutral-100" />
      {action}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Notification row - icon-led, de-chromed                            */
/* ------------------------------------------------------------------ */

function NotificationRow({ n, onTap }: { n: AppNotification; onTap: () => void }) {
  const { Icon, tint } = getNotificationIcon(n.type)
  const isUnread = !n.read_at

  return (
    <button
      type="button"
      onClick={onTap}
      className="flex items-center gap-3 w-full text-left rounded-md px-2 py-2.5 transition-colors hover:bg-neutral-50 active:bg-neutral-100"
      aria-label={`${n.title}. ${n.body ?? ''}`}
    >
      <div
        className="flex items-center justify-center shrink-0 w-10 h-10 rounded-full bg-neutral-100"
        aria-hidden="true"
      >
        <Icon size={17} strokeWidth={2} className={tint} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm leading-snug truncate', isUnread ? 'font-bold text-neutral-900' : 'font-medium text-neutral-500')}>
          {n.title}
        </p>
        {n.body && (
          <p className={cn('text-[12px] mt-0.5 line-clamp-1', isUnread ? 'text-neutral-500' : 'text-neutral-400')}>
            {n.body}
          </p>
        )}
      </div>
      <span className="text-[11px] text-neutral-400 shrink-0">
        {formatDate(n.created_at ?? '')}
      </span>
      {isUnread && (
        <span className="shrink-0 w-2 h-2 rounded-full bg-primary-500" aria-label="Unread" />
      )}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Updates page                                                        */
/* ------------------------------------------------------------------ */

export default function UpdatesPage() {
  const shouldReduceMotion = useReducedMotion()
  const navigate = useNavigate()
  const { pinned, regular, all, isLoading, isError } = useUpdates()
  const showLoading = useDelayedLoading(isLoading)
  const markRead = useMarkUpdateRead()
  const markAllRead = useMarkAllUpdatesRead()
  const { data: notifications } = useNotifications()
  const markNotifRead = useMarkRead()
  const [selectedUpdateId, setSelectedUpdateId] = useState<string | null>(null)

  // Show up to 5 most-recent personal notifications inline as an inbox preview.
  // Stale ones (older than the freshness window) never reach here - they are
  // filtered at the query level in useNotifications.
  const recentNotifications = useMemo(() => (notifications ?? []).slice(0, 5), [notifications])

  const handleNotificationTap = useCallback((n: AppNotification) => {
    if (!n.read_at) markNotifRead.mutate(n.id)
    navigate(getNotificationDeepLink(n))
  }, [markNotifRead, navigate])

  // Derive selected update from live cache so it stays in sync after mark-as-read
  const selectedUpdate = useMemo(
    () => (selectedUpdateId ? (all ?? []).find((a) => a.id === selectedUpdateId) ?? null : null),
    [selectedUpdateId, all],
  )

  // Scroll to top when opening a detail view
  useEffect(() => {
    if (selectedUpdateId) {
      document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [selectedUpdateId])

  // Bulk-mark every visible ANNOUNCEMENT as read once the page loads, clearing
  // the announcements badge without tapping each card. Personal notifications
  // are deliberately NOT bulk-marked (that wiped unread items on a mere visit);
  // they clear only when actually opened. Tate spec 2026-05-18.
  useEffect(() => {
    if (isLoading) return
    const unreadIds = (all ?? []).filter((a) => !a.is_read).map((a) => a.id)
    if (unreadIds.length === 0) return
    markAllRead.mutate(unreadIds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, all])

  const isEmpty = !isLoading && pinned.length === 0 && regular.length === 0 && recentNotifications.length === 0

  // --- Detail view (inline, not an overlay) ---
  if (selectedUpdate) {
    return (
      <Page
        noBackground
        className="!px-0 bg-white"
        header={<Header title="Updates" back onBack={() => setSelectedUpdateId(null)} />}
      >
        <div className="px-4 lg:px-6">
          <UpdateDetailView update={selectedUpdate} />
        </div>
      </Page>
    )
  }

  // --- List view ---
  return (
    <Page swipeBack noBackground className="!px-0 bg-white" header={<Header title="Updates" back />}>
      <div className="px-4 lg:px-6 pb-8">
        {showLoading ? (
          <div className="pt-4 space-y-6">
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="aspect-[16/10] sm:aspect-[2/1] rounded-lg bg-neutral-100 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
              ))}
            </div>
          </div>
        ) : isError ? (
          <div className="pt-6">
            <EmptyState
              illustration="error"
              title="Something went wrong"
              description="We couldn't load updates. Pull down to try again."
            />
          </div>
        ) : isEmpty ? (
          <div className="pt-6">
            <EmptyState
              illustration="empty"
              title="No updates yet"
              description="Check back later for updates from the Co-Exist team"
              action={{ label: 'Go Home', to: '/' }}
            />
          </div>
        ) : (
          <motion.div
            variants={shouldReduceMotion ? undefined : stagger}
            initial="hidden"
            animate="visible"
            className="pt-4 space-y-7"
          >
            {/* Announcements - imagery-first full-bleed tiles */}
            {(pinned.length > 0 || regular.length > 0) && (
              <div className="space-y-3">
                {pinned.map((a) => (
                  <AnnouncementTile
                    key={a.id}
                    update={a}
                    onOpen={() => { if (!a.is_read) markRead.mutate(a.id); setSelectedUpdateId(a.id) }}
                  />
                ))}
                {regular.map((a) => (
                  <AnnouncementTile
                    key={a.id}
                    update={a}
                    onOpen={() => { if (!a.is_read) markRead.mutate(a.id); setSelectedUpdateId(a.id) }}
                  />
                ))}
              </div>
            )}

            {/* Personal notifications - quiet icon-led list */}
            {recentNotifications.length > 0 && (
              <motion.div variants={shouldReduceMotion ? undefined : fadeUp}>
                <SectionLabel
                  label="Notifications"
                  action={
                    <button
                      type="button"
                      onClick={() => navigate('/notifications')}
                      className="text-xs font-semibold text-primary-600 hover:text-primary-700 inline-flex items-center gap-0.5"
                    >
                      See all
                      <ChevronRight size={12} />
                    </button>
                  }
                />
                <div className="space-y-0.5">
                  {recentNotifications.map((n) => (
                    <NotificationRow key={n.id} n={n} onTap={() => handleNotificationTap(n)} />
                  ))}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
    </Page>
  )
}
