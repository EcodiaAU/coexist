import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion, AnimatePresence, type Variants } from 'framer-motion'
import { ArrowLeft, Pin, Megaphone, AlertTriangle, Image as ImageIcon, ChevronRight, Bell } from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Avatar } from '@/components/avatar'
import { EmptyState } from '@/components/empty-state'
import { SearchBar } from '@/components/search-bar'
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
    useMarkAllRead,
    useUnreadCount,
    getNotificationDeepLink,
    getNotificationMeta,
} from '@/hooks/use-notifications'
import type { Tables } from '@/types/database.types'

type AppNotification = Tables<'notifications'>

/* ------------------------------------------------------------------ */
/*  Animations                                                         */
/* ------------------------------------------------------------------ */

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
}
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } },
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
/*  Get all images for an update                                 */
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
// Source + flags only; a fresh RegExp is built per call so global-flag
// state is never shared across renders (react-hooks/immutability bans
// the previous LINK_PATTERN.lastIndex = 0 mutation pattern).
const LINK_PATTERN_SOURCE = String.raw`\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)`

function RichContent({ text, className }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  const linkPattern = new RegExp(LINK_PATTERN_SOURCE, 'g')

  while ((match = linkPattern.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    if (match[1] && match[2]) {
      // Markdown link [label](url)
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
      // Bare URL
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
/*  Role label                                                         */
/* ------------------------------------------------------------------ */


function _roleLabel(role: string | undefined) {
  switch (role) {
    case 'admin': return 'Admin'
    case 'manager': return 'Manager'
    case 'leader':
    case 'national_leader': return 'Leader'
    default: return ''
  }
}

/* ------------------------------------------------------------------ */
/*  Compact image thumbnail for cards                                  */
/* ------------------------------------------------------------------ */

function CardThumbnail({ images }: { images: string[] }) {
  if (images.length === 0) return null

  if (images.length === 1) {
    return (
      <div className="w-24 h-24 rounded-sm overflow-hidden shrink-0 ring-1 ring-black/[0.04]">
        <img src={images[0]} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
      </div>
    )
  }

  // 2x2 mini grid for multiple images
  return (
    <div className="w-24 h-24 rounded-sm overflow-hidden shrink-0 grid grid-cols-2 gap-0.5 bg-primary-100 ring-1 ring-black/[0.04]">
      {images.slice(0, 4).map((src, i) => (
        <div key={i} className="relative overflow-hidden">
          <img src={src} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
          {i === 3 && images.length > 4 && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">+{images.length - 4}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Inline update detail view (replaces list, no overlay)              */
/* ------------------------------------------------------------------ */

function UpdateDetailView({
  update,
}: {
  update: UpdateWithAuthor
}) {
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
          {/* Gradient fade into content area */}
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
/*  Update card - compact white card                                   */
/* ------------------------------------------------------------------ */

function UpdateCard({
  update,
  onRead,
  onOpen,
}: {
  update: UpdateWithAuthor
  onRead: () => void
  onOpen: () => void
}) {
  const isUrgent = update.priority === 'urgent'
  const isUnread = !update.is_read
  const images = getImages(update)

  const handleTap = () => {
    if (isUnread) onRead()
    onOpen()
  }

  return (
    <motion.article
      variants={fadeUp}
      onClick={handleTap}
      className={cn(
        'group rounded-md overflow-hidden cursor-pointer',
        'transition-transform duration-200 active:scale-[0.985]',
        'bg-bark-50',
        isUrgent && 'border-l-[3px] border-l-warning-500',
        isUnread && !isUrgent && 'border-l-[3px] border-l-primary-500',
      )}
      role="article"
      aria-label={update.title}
    >
      <div className="flex gap-3.5 p-3.5">
        {/* Left: Content */}
        <div className="flex-1 min-w-0">
          {/* Badges row */}
          {(update.is_pinned || isUrgent || isUnread) && (
            <div className="flex items-center gap-1.5 mb-1.5">
              {isUnread && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0" aria-hidden="true" />
              )}
              {update.is_pinned && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-neutral-500">
                  <Pin size={9} aria-hidden="true" />
                  Pinned
                </span>
              )}
              {isUrgent && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-warning-600">
                  <AlertTriangle size={9} aria-hidden="true" />
                  Urgent
                </span>
              )}
            </div>
          )}

          {/* Title */}
          <h3 className="font-heading font-bold text-sm leading-snug text-neutral-900 line-clamp-2 group-hover:text-neutral-700 transition-colors">
            {update.title}
          </h3>

          {/* Content preview */}
          <p className="mt-1 text-xs leading-relaxed text-neutral-500 line-clamp-2">
            {update.content}
          </p>

          {/* Footer: author + time */}
          <div className="flex items-center gap-2 mt-2.5">
            <Avatar
              src={update.author?.avatar_url}
              name={update.author?.display_name ?? 'Staff'}
              size="xs"
            />
            <span className="text-[11px] font-semibold text-neutral-700 truncate">
              {update.author?.display_name ?? 'Co-Exist Team'}
            </span>
            <span className="text-[10px] text-neutral-400 shrink-0">
              {formatDate(update.created_at ?? '')}
            </span>
            {images.length > 1 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-neutral-400 shrink-0 ml-auto">
                <ImageIcon size={10} />
                {images.length}
              </span>
            )}
          </div>
        </div>

        {/* Right: Thumbnail */}
        <CardThumbnail images={images} />
      </div>
    </motion.article>
  )
}

/* ------------------------------------------------------------------ */
/*  Updates page                                                        */
/* ------------------------------------------------------------------ */

export default function UpdatesPage() {
  const shouldReduceMotion = useReducedMotion()
  const navigate = useNavigate()
  const { pinned, regular, all, isLoading, isError, refetch } = useUpdates()
  const showLoading = useDelayedLoading(isLoading)
  const markRead = useMarkUpdateRead()
  const markAllRead = useMarkAllUpdatesRead()
  const { data: notifications } = useNotifications()
  const { data: unreadCount = 0 } = useUnreadCount()
  const markNotifRead = useMarkRead()
  const markAllNotifRead = useMarkAllRead()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUpdateId, setSelectedUpdateId] = useState<string | null>(null)

  // Show up to 5 most-recent notifications inline as an inbox preview.
  // Tapping one marks-read + deep-links via the same route resolver used by
  // the dedicated /notifications page and push tap handler.
  const recentNotifications = useMemo(() => (notifications ?? []).slice(0, 5), [notifications])
  const hasMoreNotifications = (notifications ?? []).length > recentNotifications.length

  const handleNotificationTap = useCallback((n: AppNotification) => {
    if (!n.read_at) markNotifRead.mutate(n.id)
    const route = getNotificationDeepLink(n)
    navigate(route)
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

  // Bulk-mark every visible update as read once the page loads.
  // This clears the side-sheet "Updates" badge without requiring the user
  // to tap each card. Runs once per (all-ids fingerprint) so it doesn't
  // refire on every re-render. Tate spec 2026-05-18.
  useEffect(() => {
    if (isLoading) return
    const unreadIds = (all ?? []).filter((a) => !a.is_read).map((a) => a.id)
    if (unreadIds.length === 0) return
    markAllRead.mutate(unreadIds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, all])

  // Also flush unread *notifications* (bell-icon items) so the combined
  // side-sheet badge clears. Same trigger window as updates.
  useEffect(() => {
    if (!notifications) return
    const hasUnread = notifications.some((n) => !n.read_at)
    if (!hasUnread) return
    markAllNotifRead.mutate(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications])

  const isEmpty = !isLoading && pinned.length === 0 && regular.length === 0 && recentNotifications.length === 0

  const handleRefresh = useCallback(async () => {
    await refetch()
  }, [refetch])

  const filteredPinned = searchQuery
    ? pinned.filter(
        (a) =>
          a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.content.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : pinned

  const filteredRegular = searchQuery
    ? regular.filter(
        (a) =>
          a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.content.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : regular

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
      <div className="px-4 lg:px-6 pb-6 space-y-4">
          {/* Title */}
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="flex items-center gap-2.5"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-sm bg-primary-50 text-primary-600">
              <Megaphone size={14} />
            </div>
            <h1 className="font-heading text-xl font-bold text-neutral-900 tracking-tight">
              Updates
            </h1>
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary-500 text-white text-[10px] font-bold">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </motion.div>

          {/* Notifications inbox preview - recent personal notifications */}
          {recentNotifications.length > 0 && (
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 }}
              className="space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-neutral-500">
                  <Bell size={11} />
                  Your notifications
                </div>
                {hasMoreNotifications && (
                  <button
                    type="button"
                    onClick={() => navigate('/notifications')}
                    className="text-xs font-semibold text-primary-600 hover:text-primary-700 inline-flex items-center gap-0.5"
                  >
                    See all
                    <ChevronRight size={12} />
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {recentNotifications.map((n) => {
                  const meta = getNotificationMeta(n.type)
                  const isUnread = !n.read_at
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleNotificationTap(n)}
                      className={cn(
                        'flex items-start gap-3 w-full text-left rounded-md px-3.5 py-3',
                        'bg-white border border-neutral-100 shadow-sm',
                        'transition-transform active:scale-[0.985]',
                        !isUnread && 'opacity-70',
                      )}
                      aria-label={`${n.title}. ${n.body ?? ''}`}
                    >
                      <div
                        className={cn(
                          'flex items-center justify-center shrink-0 w-9 h-9 rounded-sm text-base',
                          'bg-neutral-100',
                          meta.color,
                        )}
                        aria-hidden="true"
                      >
                        {meta.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm leading-snug truncate', isUnread ? 'font-bold text-neutral-900' : 'font-medium text-neutral-600')}>
                          {n.title}
                        </p>
                        {n.body && (
                          <p className={cn('text-[12px] mt-0.5 line-clamp-2', isUnread ? 'text-neutral-600' : 'text-neutral-400')}>
                            {n.body}
                          </p>
                        )}
                      </div>
                      {isUnread && (
                        <span className="shrink-0 w-2 h-2 rounded-full bg-primary-500 mt-1.5" aria-label="Unread" />
                      )}
                    </button>
                  )
                })}
              </div>
            </motion.div>
          )}

          {/* Search */}
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.05 }}
          >
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search updates..."
              compact
              aria-label="Search updates"
            />
          </motion.div>

          {showLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[88px] rounded-md bg-bark-50 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
              ))}
            </div>
          ) : isError ? (
            <EmptyState
              illustration="error"
              title="Something went wrong"
              description="We couldn't load updates. Pull down to try again."
            />
          ) : isEmpty ? (
            <EmptyState
              illustration="empty"
              title="No updates yet"
              description="Check back later for updates from the Co-Exist team"
              action={{ label: 'Go Home', to: '/' }}
            />
          ) : (
            <motion.div
                variants={shouldReduceMotion ? undefined : stagger}
                initial="hidden"
                animate="visible"
                className="space-y-2.5"
              >
                {/* Pinned section */}
                {filteredPinned.length > 0 && (
                  <div className="space-y-2">
                    {filteredPinned.map((a) => (
                      <UpdateCard
                        key={a.id}
                        update={a}
                        onRead={() => markRead.mutate(a.id)}
                        onOpen={() => setSelectedUpdateId(a.id)}
                      />
                    ))}
                  </div>
                )}

                {/* Divider */}
                {filteredPinned.length > 0 && filteredRegular.length > 0 && (
                  <motion.div variants={fadeUp} className="flex items-center gap-3 py-1.5">
                    <div className="h-px flex-1 bg-neutral-100" />
                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-[0.15em]">
                      Recent
                    </span>
                    <div className="h-px flex-1 bg-neutral-100" />
                  </motion.div>
                )}

                {/* Regular */}
                {filteredRegular.length > 0 && (
                  <div className="space-y-2">
                    {filteredRegular.map((a) => (
                      <UpdateCard
                        key={a.id}
                        update={a}
                        onRead={() => markRead.mutate(a.id)}
                        onOpen={() => setSelectedUpdateId(a.id)}
                      />
                    ))}
                  </div>
                )}

                {searchQuery && filteredPinned.length === 0 && filteredRegular.length === 0 && (
                  <EmptyState
                    illustration="search"
                    title="No results"
                    description={`No updates matching "${searchQuery}"`}
                  />
                )}
              </motion.div>
          )}
      </div>
    </Page>
  )
}
