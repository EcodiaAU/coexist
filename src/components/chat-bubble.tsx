import { useRef } from 'react'
import { motion, useReducedMotion, useMotionValue, useTransform, type PanInfo } from 'framer-motion'
import { Reply, Megaphone, CalendarPlus, ClipboardCheck, ListChecks, MapPin, Calendar, Clock, Car, Users } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatClockTime, formatCardDate, formatCardTime } from '@/lib/date-format'
import { ROLE_COLORS } from '@/lib/constants'
import { useLongPress } from '@/hooks/use-long-press'

/**
 * Swipe-right-to-reply gesture (1.8.6 feature 1).
 * Threshold: drag the bubble row >= 60px to fire reply.
 * Visual: reply icon reveals at the row's left edge as the bubble drags right;
 *         opacity + scale ramp from 0 -> 1 across [0, 70]px of x-offset.
 * Snap: row returns to origin on release (dragSnapToOrigin) regardless of fire.
 */
const SWIPE_REPLY_FIRE_PX = 60
const SWIPE_REPLY_MAX_PX = 80

interface ReplyTo {
  message: string
  senderName: string
  /** Parent message id - when present, the reply quote becomes a tappable
   *  jump-to-parent affordance (Insta-DM thread browsing). */
  parentId?: string
}

interface ChatBubbleProps {
  message: string
  sent: boolean
  timestamp: Date
  senderName?: string
  senderAvatar?: string
  senderId?: string
  photo?: string
  replyTo?: ReplyTo
  roleBadge?: string
  className?: string
  /** Skip entrance animation (already in view, e.g. confirmed optimistic) */
  skipAnimation?: boolean
  /**
   * Same-sender grouping (1.8.5 item 9). When true, this message is a
   * continuation of the immediately-preceding message from the same sender
   * inside a tight time window. Hides avatar + sender-name row so the bubble
   * sits flush under the prior bubble (iMessage / Slack pattern). The
   * receiver-side avatar column is replaced with a 44px spacer to keep the
   * bubble horizontally aligned with the head-of-run bubble.
   */
  isContinuation?: boolean
  onAvatarTap?: (userId: string) => void
  onSenderTap?: (userId: string) => void
  onLongPress?: () => void
  /** Tap handler for the reply-quote chip. Receives the parent message id. */
  onReplyTap?: (parentId: string) => void
  /**
   * Swipe-right-to-reply (1.8.6 feature 1). When provided, the bubble row
   * becomes drag-x with a reveal-on-swipe reply icon at the left edge. Past
   * the SWIPE_REPLY_FIRE_PX threshold the callback fires once on dragEnd
   * (haptic pulse + parent sets replyTo state). Row snaps back to origin.
   */
  onSwipeReply?: () => void
  'aria-label'?: string
}

export function ChatBubble({
  message,
  sent,
  timestamp,
  senderName,
  senderAvatar,
  senderId,
  photo,
  replyTo,
  roleBadge,
  className,
  skipAnimation = false,
  isContinuation = false,
  onAvatarTap,
  onSenderTap,
  onLongPress,
  onReplyTap,
  onSwipeReply,
  'aria-label': ariaLabel,
}: ChatBubbleProps) {
  const shouldReduceMotion = useReducedMotion()
  const { onTouchStart: handleTouchStart, onTouchEnd: handleTouchEnd, onTouchCancel: handleTouchCancel } = useLongPress(onLongPress)

  /* ── Swipe-right-to-reply (1.8.6 feature 1) ────────────────────── */
  const x = useMotionValue(0)
  const swipeIconOpacity = useTransform(x, [0, 30, 70], [0, 0.6, 1])
  const swipeIconScale = useTransform(x, [0, 30, 70], [0.55, 0.8, 1])
  const swipeFiredRef = useRef(false)
  const dragEnabled = !!onSwipeReply

  const handleDragStart = () => {
    handleTouchEnd()
    swipeFiredRef.current = false
  }
  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (!onSwipeReply || swipeFiredRef.current) return
    if (info.offset.x >= SWIPE_REPLY_FIRE_PX) {
      swipeFiredRef.current = true
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(15)
      }
      onSwipeReply()
    }
  }

  const label =
    ariaLabel ??
    `${sent ? 'Sent' : 'Received'} message${senderName ? ` from ${senderName}` : ''}: ${message}`

  const roleStyle = roleBadge ? ROLE_COLORS[roleBadge] ?? { bg: 'bg-primary-100', text: 'text-primary-600' } : null

  return (
    <div className="relative">
      {dragEnabled && (
        <motion.div
          aria-hidden="true"
          style={{ opacity: swipeIconOpacity, scale: swipeIconScale }}
          className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 z-0 flex h-9 w-9 items-center justify-center rounded-full bg-primary-500 text-white shadow-md"
        >
          <Reply size={16} strokeWidth={2.5} />
        </motion.div>
      )}
    <motion.div
      role="listitem"
      aria-label={label}
      initial={shouldReduceMotion || skipAnimation ? false : { opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      style={dragEnabled ? { x } : undefined}
      drag={dragEnabled ? 'x' : false}
      dragDirectionLock
      dragConstraints={{ left: 0, right: SWIPE_REPLY_MAX_PX }}
      dragElastic={{ left: 0, right: 0.35 }}
      dragSnapToOrigin={dragEnabled}
      dragMomentum={false}
      onDragStart={dragEnabled ? handleDragStart : undefined}
      onDragEnd={dragEnabled ? handleDragEnd : undefined}
      className={cn(
        // 1.8.5 item 9: gap-2.5 → gap-2 (10→8px) tightens avatar↔bubble.
        'flex gap-2 min-w-0',
        sent ? 'flex-row-reverse' : 'flex-row',
        'w-full',
        dragEnabled && 'relative z-10 touch-pan-y',
        className,
      )}
    >
      {/* Avatar (received only). Same-sender grouping (1.8.5 item 9):
          on continuation messages the avatar is replaced by a 44px spacer
          so the bubble stays horizontally aligned with the head-of-run
          bubble; the avatar+touch-target only appears once per run. */}
      {!sent && (
        isContinuation ? (
          <div className="flex-shrink-0 w-11" aria-hidden="true" />
        ) : (
          <button
            type="button"
            className="flex-shrink-0 self-end flex items-center justify-center min-h-11 min-w-11 rounded-full cursor-pointer select-none active:scale-[0.98] transition-transform duration-150"
            onClick={() => senderId && onAvatarTap?.(senderId)}
            aria-label={senderName ? `View ${senderName}'s profile` : 'View profile'}
          >
            {senderAvatar ? (
              <img
                src={senderAvatar}
                alt=""
                loading="lazy"
                className="h-10 w-10 rounded-full object-cover ring-[2.5px] ring-white shadow-sm"
              />
            ) : (
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-200 text-xs font-extrabold text-white ring-[2.5px] ring-white shadow-sm"
                aria-hidden="true"
              >
                {senderName?.charAt(0)?.toUpperCase() ?? '?'}
              </div>
            )}
          </button>
        )
      )}

      {/* Bubble content */}
      <div
        className={cn(
          'flex min-w-0 max-w-[82%] flex-col gap-0',
          sent ? 'items-end' : 'items-start',
        )}
      >
        {/* Sender name + role badge (received only, head-of-run only).
            1.8.5 item 9: dropped min-h-11 (44px touch-target) on the name
            button - the avatar above is the primary tap-affordance and
            already meets the 44px target. The 44px-tall name row was the
            single biggest contributor to the "messages are far apart"
            complaint. Tap stays functional via py-0.5 + active:scale. */}
        {!sent && senderName && !isContinuation && (
          <div className="flex items-center gap-2 px-1 mb-0.5">
            <button
              type="button"
              className="text-[12px] font-semibold text-neutral-500 hover:text-neutral-700 py-0.5 cursor-pointer select-none active:scale-[0.97] transition-transform duration-150"
              onClick={() => senderId && onSenderTap?.(senderId)}
            >
              {senderName}
            </button>
            {roleBadge && roleStyle && (
              <span className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-extrabold leading-tight shadow-sm',
                roleStyle.bg,
                roleStyle.text,
              )}>
                {roleBadge}
              </span>
            )}
          </div>
        )}

        {/* Bubble. 1.8.5 item 9: continuation messages flatten the corner
            facing the prior bubble in the run (top-left for received,
            top-right for sent), giving a clean stacked-tile feel without
            redrawing the chat tail. */}
        <div
          className={cn(
            'min-w-0 max-w-full rounded-md px-4 py-2.5',
            sent
              ? cn('bg-primary-200 text-neutral-900', isContinuation ? 'rounded-br-md rounded-tr-md' : 'rounded-br-md')
              : cn('bg-neutral-200 text-neutral-900', isContinuation ? 'rounded-bl-md rounded-tl-md' : 'rounded-bl-md'),
          )}
        >
          {/* Reply quote - tappable when parentId + onReplyTap provided */}
          {replyTo && (() => {
            const tappable = !!replyTo.parentId && !!onReplyTap
            const inner = (
              <>
                <p
                  className={cn(
                    'text-[11px] font-extrabold',
                    sent ? 'text-neutral-700' : 'text-neutral-700',
                  )}
                >
                  {replyTo.senderName}
                </p>
                <p
                  className={cn(
                    'line-clamp-2 text-xs mt-0.5',
                    sent ? 'text-neutral-500' : 'text-neutral-500',
                  )}
                >
                  {replyTo.message}
                </p>
              </>
            )
            const wrapperClass = cn(
              'mb-2.5 rounded-sm border-l-[3px] px-3 py-2 w-full text-left',
              sent
                ? 'border-neutral-200 bg-neutral-50'
                : 'border-neutral-300 bg-white',
              tappable && 'transition-transform duration-150 active:scale-[0.985] cursor-pointer hover:brightness-95',
            )
            if (tappable) {
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onReplyTap!(replyTo.parentId!)
                  }}
                  aria-label={`Jump to message from ${replyTo.senderName}`}
                  className={wrapperClass}
                >
                  {inner}
                </button>
              )
            }
            return <div className={wrapperClass}>{inner}</div>
          })()}

          {/* Photo */}
          {photo && (
            <img
              src={photo}
              alt="Shared image"
              loading="lazy"
              className="mb-2.5 max-w-full rounded-sm shadow-sm"
            />
          )}

          {/* Message text */}
          {message && (
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[14px] leading-[1.45]">
              {message}
            </p>
          )}

          {/* Timestamp */}
          <p
            className={cn(
              'mt-1 text-[10px] font-medium tabular-nums text-neutral-500/80',
              sent ? 'text-right' : 'text-left',
            )}
          >
            <time dateTime={timestamp.toISOString()}>
              {formatClockTime(timestamp)}
            </time>
          </p>
        </div>
      </div>
    </motion.div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Poll Card (rendered inline in chat)                                */
/* ------------------------------------------------------------------ */

interface PollOption {
  id: string
  text: string
}

interface PollCardProps {
  question: string
  options: PollOption[]
  voteCounts: Record<string, number>
  totalVotes: number
  userVotes: string[]
  isClosed: boolean
  allowMultiple: boolean
  anonymous: boolean
  creatorName?: string
  closesAt?: string | null
  onVote: (optionId: string) => void
  onRemoveVote: (optionId: string) => void
  sent: boolean
}

export function PollCard({
  question,
  options,
  voteCounts,
  totalVotes,
  userVotes,
  isClosed,
  allowMultiple: _allowMultiple,
  anonymous,
  creatorName,
  closesAt,
  onVote,
  onRemoveVote,
  sent,
}: PollCardProps) {
  const hasVoted = userVotes.length > 0
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        'w-full max-w-[85%] rounded-md p-5',
        'bg-white border border-neutral-100 shadow-sm',
        sent ? 'ml-auto' : 'mr-auto',
      )}
    >
      {/* Poll icon + question */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-600">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="1" y="8" width="3" height="6" rx="1" fill="currentColor" opacity="0.6" />
            <rect x="6" y="4" width="3" height="10" rx="1" fill="currentColor" opacity="0.8" />
            <rect x="11" y="2" width="3" height="12" rx="1" fill="currentColor" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-extrabold text-neutral-900 leading-snug">{question}</p>
          {creatorName && (
            <p className="text-[11px] font-medium text-neutral-500 mt-0.5">by {creatorName}</p>
          )}
        </div>
      </div>

      {/* Options */}
      <div className="space-y-2">
        {options.map((opt) => {
          const count = voteCounts[opt.id] ?? 0
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
          const isSelected = userVotes.includes(opt.id)

          return (
            <button
              key={opt.id}
              type="button"
              disabled={isClosed}
              onClick={() => {
                if (isSelected) {
                  onRemoveVote(opt.id)
                } else {
                  onVote(opt.id)
                }
              }}
              className={cn(
                'relative w-full overflow-hidden rounded-sm px-3.5 py-3 text-left transition-transform duration-200',
                'min-h-11 cursor-pointer select-none',
                isSelected
                  ? 'bg-primary-50 ring-2 ring-primary-400/40'
                  : 'bg-neutral-50 hover:bg-white',
                isClosed && 'cursor-default opacity-80',
                'active:scale-[0.97]',
              )}
            >
              {/* Progress bar background */}
              {hasVoted && (
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className={cn(
                    'absolute inset-y-0 left-0 rounded-sm',
                    isSelected ? 'bg-primary-100' : 'bg-neutral-100',
                  )}
                />
              )}

              <div className="relative flex items-center justify-between gap-2">
                <span className={cn(
                  'text-sm',
                  isSelected ? 'font-semibold text-neutral-900' : 'text-neutral-700',
                )}>
                  {opt.text}
                </span>
                {hasVoted && (
                  <span className="text-xs font-semibold text-neutral-500 tabular-nums shrink-0">
                    {pct}%
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between">
        <p className="text-[11px] text-neutral-500">
          {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
          {anonymous ? ' (anonymous)' : ''}
        </p>
        {isClosed ? (
          <span className="text-[11px] font-semibold text-neutral-500">Poll closed</span>
        ) : closesAt ? (
          <span className="text-[11px] text-neutral-500">
            Closes {new Date(closesAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
          </span>
        ) : null}
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Announcement Card (rendered inline in chat)                        */
/* ------------------------------------------------------------------ */

export interface EventDetailsForCard {
  coverImageUrl?: string | null
  dateStart: string
  dateEnd?: string | null
  address?: string | null
  activityType?: string | null
  collectiveName?: string | null
}

interface AnnouncementCardProps {
  type: 'announcement' | 'event_invite' | 'rsvp' | 'checklist'
  title: string
  body?: string | null
  creatorName?: string
  metadata?: Record<string, unknown>
  responses?: {
    response: string
    user_id: string
    profiles?: {
      id?: string
      display_name?: string | null
      avatar_url?: string | null
    } | null
  }[]
  userResponse?: string | null
  isActive: boolean
  sent: boolean
  onRespond?: (response: string) => void
  onViewEvent?: (eventId: string) => void
  /** Rich event details shown as a preview card for event invites */
  eventDetails?: EventDetailsForCard | null
}

const TYPE_META: Record<string, { icon: typeof Megaphone; label: string; iconBg: string; iconColor: string; labelColor: string }> = {
  announcement: { icon: Megaphone, label: 'Announcement', iconBg: 'bg-accent-50', iconColor: 'text-accent-600', labelColor: 'text-accent-600' },
  event_invite: { icon: CalendarPlus, label: 'Event Invite', iconBg: 'bg-info-50', iconColor: 'text-info-600', labelColor: 'text-info-600' },
  rsvp: { icon: ClipboardCheck, label: 'RSVP', iconBg: 'bg-success-50', iconColor: 'text-success-600', labelColor: 'text-success-600' },
  checklist: { icon: ListChecks, label: 'Checklist', iconBg: 'bg-warning-50', iconColor: 'text-warning-600', labelColor: 'text-warning-600' },
}

const ACTIVITY_LABELS: Record<string, string> = {
  clean_up: 'Clean Up',
  tree_planting: 'Tree Planting',
  ecosystem_restoration: 'Ecosystem Restoration',
  nature_hike: 'Nature Hike',
  camp_out: 'Camp Out',
  spotlighting: 'Spotlighting',
  other: 'Other',
}

export function AnnouncementCard({
  type,
  title,
  body,
  creatorName,
  metadata,
  responses = [],
  userResponse,
  isActive,
  sent,
  onRespond,
  onViewEvent,
  eventDetails,
}: AnnouncementCardProps) {
  const shouldReduceMotion = useReducedMotion()
  const typeInfo = TYPE_META[type] ?? TYPE_META.announcement
  const IconComponent = typeInfo.icon

  const rsvpOptions = type === 'rsvp' || type === 'event_invite'
    ? ['going', 'maybe', 'not_going']
    : []

  const responseCounts: Record<string, number> = {}
  for (const r of responses) {
    responseCounts[r.response] = (responseCounts[r.response] ?? 0) + 1
  }

  const hasEventImage = eventDetails?.coverImageUrl

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        // 1.8.4 item 10: explicit min-w-0 + max-w + overflow-hidden chain
        // ensures cover-image badge + RSVP scroll-strip clip at the card
        // boundary on narrow phones rather than bleeding into the chat list.
        'w-full max-w-[88%] min-w-0 rounded-md overflow-hidden',
        // Slightly off-white so the widget visually separates from the chat
        // bg-white. Same border + shadow keeps it elevated.
        'bg-neutral-50 border border-neutral-200 shadow-sm',
        sent ? 'ml-auto' : 'mr-auto',
      )}
    >
      {/* Event cover image */}
      {hasEventImage && (
        <div className="relative w-full h-32 overflow-hidden">
          <img
            src={eventDetails.coverImageUrl!}
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          {eventDetails.activityType && (
            <span className="absolute bottom-2 left-3 max-w-[calc(100%-1.5rem)] truncate text-[10px] font-bold uppercase tracking-wider text-white/90 bg-black/30 px-2 py-0.5 rounded-full">
              {ACTIVITY_LABELS[eventDetails.activityType] ?? eventDetails.activityType}
            </span>
          )}
        </div>
      )}

      <div className="p-5 min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3 min-w-0">
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md', typeInfo.iconBg, typeInfo.iconColor)}>
            <IconComponent size={20} strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn('text-[11px] font-extrabold uppercase tracking-wider truncate', typeInfo.labelColor)}>{typeInfo.label}</p>
            {creatorName && (
              <p className="text-[11px] font-medium text-neutral-500 truncate">from {creatorName}</p>
            )}
          </div>
        </div>

        {/* Content */}
        <h4 className="text-[15px] font-extrabold text-neutral-900 mb-1.5 break-words">{title}</h4>
        {body && (
          <p className="text-sm text-neutral-600 leading-relaxed mb-2 break-words">{body}</p>
        )}

        {/* Event details summary */}
        {eventDetails && (
          <div className="rounded-sm bg-neutral-50 p-3 mb-3 space-y-1.5 min-w-0 overflow-hidden">
            <div className="flex items-center gap-2 min-w-0">
              <Calendar size={13} className="text-neutral-400 shrink-0" />
              <span className="text-xs font-semibold text-neutral-700 truncate">
                {formatCardDate(eventDetails.dateStart)}
              </span>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <Clock size={13} className="text-neutral-400 shrink-0" />
              <span className="text-xs text-neutral-500 truncate">
                {formatCardTime(eventDetails.dateStart)}
                {eventDetails.dateEnd && ` - ${formatCardTime(eventDetails.dateEnd)}`}
              </span>
            </div>
            {eventDetails.address && (
              <div className="flex items-center gap-2 min-w-0">
                <MapPin size={13} className="text-neutral-400 shrink-0" />
                <span className="text-xs text-neutral-500 truncate min-w-0 flex-1">{eventDetails.address}</span>
              </div>
            )}
            {eventDetails.collectiveName && !hasEventImage && (
              <p className="text-[11px] text-neutral-400 mt-0.5 truncate">
                Hosted by {eventDetails.collectiveName}
              </p>
            )}
          </div>
        )}

        {/* Event invite CTA */}
        {type === 'event_invite' && !!metadata?.event_id && onViewEvent && (
          <button
            type="button"
            onClick={() => onViewEvent(metadata.event_id as string)}
            className="w-full rounded-sm bg-primary-600 py-2.5 text-center text-sm font-semibold text-white mb-2 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none min-h-11"
          >
            View Event Details
          </button>
        )}

        {/*
          RSVP buttons - 1.8.4 item 10 (fork_motzkqf5_016150).
          Was a 3-flex-1 row that clipped "Can't Make It" + count on narrow
          phones. Now a horizontal scroll window with snap so labels render
          full-width and the user can pan smoothly without text breaking.
          `min-w-[8.5rem]` keeps each chip touch-target wide; snap-x +
          scroll-smooth handles the smoothness; -mx-1 px-1 + hide-scrollbar
          gives clean boundary clipping at the card edge.
        */}
        {rsvpOptions.length > 0 && isActive && onRespond && (() => {
          // Layout: 'Going' full-width on top, 'Maybe' + 'Can't make it' as
          // two half-buttons below. Replaces the horizontal-scroll strip
          // where the third option was hidden offscreen.
          const renderBtn = (opt: string, fullWidth: boolean) => {
            const isSelected = userResponse === opt
            const label = opt === 'going' ? 'Going' : opt === 'maybe' ? 'Maybe' : "Can't make it"
            const count = responseCounts[opt] ?? 0
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onRespond(opt)}
                className={cn(
                  'rounded-sm py-2.5 px-3 text-center text-xs font-semibold transition-transform duration-150 min-h-11',
                  'active:scale-[0.97] cursor-pointer select-none',
                  fullWidth ? 'w-full' : 'flex-1 min-w-0',
                  isSelected
                    ? opt === 'going'
                      ? 'bg-success-600 text-white shadow-sm'
                      : 'bg-primary-500 text-white shadow-sm'
                    : 'bg-neutral-50 text-neutral-700 hover:bg-neutral-100',
                )}
              >
                <span className="whitespace-nowrap">{label}</span>
                {count > 0 && (
                  <span className={cn(
                    'ml-1 text-[11px]',
                    isSelected ? 'text-white/80' : 'text-neutral-400',
                  )}>
                    ({count})
                  </span>
                )}
              </button>
            )
          }
          const opts = new Set(rsvpOptions)
          return (
            <div className="mb-2 space-y-2">
              {opts.has('going') && renderBtn('going', true)}
              <div className="flex gap-2">
                {opts.has('maybe') && renderBtn('maybe', false)}
                {opts.has('not_going') && renderBtn('not_going', false)}
              </div>
            </div>
          )
        })()}

        {/*
          Response summary - 1.8.4 item 10 (fork_motzkqf5_016150).
          When responses have profiles attached (joined by useAnnouncementDetail),
          render a horizontal-scroll snap strip of avatars + display names.
          Falls back to the plain count text when profiles haven't loaded yet.
          Uses scroll-smooth + snap-x to fix the broken-scroll bug.
        */}
        {responses.length > 0 && (() => {
          const withProfiles = responses.filter((r) => r.profiles?.id)
          if (withProfiles.length === 0) {
            return (
              <p className="text-[11px] text-neutral-500">
                {responses.length} response{responses.length !== 1 ? 's' : ''}
              </p>
            )
          }
          return (
            <div className="mt-1 -mx-2 px-2">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-500 mb-1.5">
                {responses.length} response{responses.length !== 1 ? 's' : ''}
              </p>
              <div
                className="flex gap-2 overflow-x-auto overscroll-x-contain snap-x snap-mandatory scroll-smooth hide-scrollbar pb-1"
                role="list"
                aria-label="Responses"
              >
                {withProfiles.slice(0, 24).map((r) => {
                  const name = r.profiles?.display_name ?? 'Member'
                  const initials = name.charAt(0).toUpperCase()
                  return (
                    <div
                      key={`${r.user_id}-${r.response}`}
                      role="listitem"
                      className="snap-start shrink-0 flex flex-col items-center gap-1 min-w-[3.5rem]"
                    >
                      {r.profiles?.avatar_url ? (
                        <img
                          src={r.profiles.avatar_url}
                          alt=""
                          loading="lazy"
                          className="h-9 w-9 rounded-full object-cover ring-2 ring-white shadow-sm"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-neutral-200 ring-2 ring-white shadow-sm flex items-center justify-center text-[11px] font-extrabold text-white" aria-hidden="true">
                          {initials}
                        </div>
                      )}
                      <span className="text-[10px] font-semibold text-neutral-600 truncate max-w-[3.5rem] text-center leading-tight">
                        {name}
                      </span>
                    </div>
                  )
                })}
                {withProfiles.length > 24 && (
                  <div className="snap-start shrink-0 flex flex-col items-center gap-1 min-w-[3.5rem]">
                    <div className="h-9 w-9 rounded-full bg-neutral-100 flex items-center justify-center text-[10px] font-extrabold text-neutral-500">
                      +{withProfiles.length - 24}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })()}
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Carpool Card (rendered inline in chat)                             */
/* ------------------------------------------------------------------ */

export interface CarpoolCardPassenger {
  id: string
  passenger_id: string
  display_name: string | null
  avatar_url: string | null
}

export type CarpoolCardStatus = 'open' | 'full' | 'cancelled' | 'archived'

interface CarpoolCardProps {
  status: CarpoolCardStatus
  creatorName?: string
  /** Driver's free-text departure point (visible to all collective members). */
  departurePointText: string
  departureTime: string
  seatsTotal: number
  /** Passengers with status='confirmed'. Pickup addresses are NEVER passed in. */
  confirmedPassengers: CarpoolCardPassenger[]
  notes?: string | null
  /** Event preview details (pulled by parent via useEventDetail). */
  eventDetails?: EventDetailsForCard | null
  eventTitle?: string | null
  /** Whether the current viewer has already taken a seat (and seat is confirmed). */
  viewerHasSeat: boolean
  /** Whether the current viewer is the driver. */
  viewerIsDriver: boolean
  sent: boolean
  onSaveSeat?: () => void
  onCancelSeat?: () => void
  onViewEvent?: (eventId: string) => void
  eventId?: string | null
  /** Channel id of the breakout group chat for this carpool (or null if not yet spawned). */
  breakoutChannelId?: string | null
  onOpenChat?: () => void
}

export function CarpoolCard({
  status,
  creatorName,
  departurePointText,
  departureTime,
  seatsTotal,
  confirmedPassengers,
  notes,
  eventDetails,
  eventTitle,
  viewerHasSeat,
  viewerIsDriver,
  sent,
  onSaveSeat,
  onCancelSeat,
  onViewEvent,
  eventId,
  breakoutChannelId,
  onOpenChat,
}: CarpoolCardProps) {
  const shouldReduceMotion = useReducedMotion()
  const confirmedCount = confirmedPassengers.length
  const seatsRemaining = Math.max(0, seatsTotal - confirmedCount)
  const isOpen = status === 'open'
  const isFull = status === 'full' || (isOpen && seatsRemaining === 0)
  const isCancelled = status === 'cancelled'
  const isArchived = status === 'archived'
  const isMuted = isCancelled || isArchived

  const hasEventImage = eventDetails?.coverImageUrl

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        'w-full max-w-[85%] min-w-0 rounded-md overflow-hidden',
        'bg-white border border-neutral-100 shadow-sm',
        sent ? 'ml-auto' : 'mr-auto',
        isMuted && 'opacity-70',
      )}
    >
      {/* Event cover image */}
      {hasEventImage && (
        <div className="relative w-full h-32">
          <img
            src={eventDetails.coverImageUrl!}
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          {eventDetails.activityType && (
            <span className="absolute bottom-2 left-3 text-[10px] font-bold uppercase tracking-wider text-white/90 bg-black/30 px-2 py-0.5 rounded-full">
              {ACTIVITY_LABELS[eventDetails.activityType] ?? eventDetails.activityType}
            </span>
          )}
        </div>
      )}

      <div className="p-5 min-w-0 overflow-hidden">
        {/* Header chip */}
        <div className="flex items-center gap-3 mb-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-success-50 text-success-600">
            <Car size={20} strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-wider truncate text-success-600">
              Carpool
            </p>
            {creatorName && (
              <p className="text-[11px] font-medium text-neutral-500 truncate">
                from {creatorName}
              </p>
            )}
          </div>
        </div>

        {/* Linked event preview */}
        {(eventTitle || eventDetails) && (
          <div className="rounded-sm bg-neutral-50 p-3 mb-3 space-y-1.5 min-w-0 overflow-hidden">
            {eventTitle && (
              <p className="text-[13px] font-bold text-neutral-900 truncate">{eventTitle}</p>
            )}
            {eventDetails && (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <Calendar size={13} className="text-neutral-400 shrink-0" />
                  <span className="text-xs font-semibold text-neutral-700 truncate">
                    {formatCardDate(eventDetails.dateStart)}
                  </span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <Clock size={13} className="text-neutral-400 shrink-0" />
                  <span className="text-xs text-neutral-500 truncate">
                    {formatCardTime(eventDetails.dateStart)}
                    {eventDetails.dateEnd && ` - ${formatCardTime(eventDetails.dateEnd)}`}
                  </span>
                </div>
                {eventDetails.address && (
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin size={13} className="text-neutral-400 shrink-0" />
                    <span className="text-xs text-neutral-500 truncate min-w-0 flex-1">
                      {eventDetails.address}
                    </span>
                  </div>
                )}
              </>
            )}
            {eventId && onViewEvent && (
              <button
                type="button"
                onClick={() => onViewEvent(eventId)}
                className="text-[11px] font-semibold text-primary-600 hover:text-primary-700 active:scale-[0.98] transition-transform duration-150 cursor-pointer select-none"
              >
                View Event Details
              </button>
            )}
          </div>
        )}

        {/* Trip details - structured rows in a tinted panel so the widget
            reads as a single unit rather than loose text lines. */}
        <div className="mb-3 rounded-sm bg-success-50/60 ring-1 ring-success-100 divide-y divide-success-100/70 overflow-hidden">
          <div className="flex items-center gap-2.5 px-3 py-2 min-w-0">
            <MapPin size={14} className="text-success-700 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-success-700/80">Departing from</p>
              <p className="text-[13px] font-semibold text-neutral-900 truncate">{departurePointText}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-2 min-w-0">
            <Clock size={14} className="text-success-700 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-success-700/80">Departure</p>
              <p className="text-[13px] font-semibold text-neutral-900 truncate">
                {formatCardDate(departureTime)} · {formatCardTime(departureTime)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-2 min-w-0">
            <Users size={14} className="text-success-700 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-success-700/80">Seats</p>
              <p className="text-[13px] font-semibold text-neutral-900">
                {seatsRemaining} of {seatsTotal} remaining
              </p>
            </div>
          </div>
        </div>

        {notes && (
          <p className="text-xs text-neutral-600 leading-relaxed mb-3 break-words bg-neutral-50 rounded-sm px-3 py-2 ring-1 ring-neutral-100">
            "{notes}"
          </p>
        )}

        {/* Live passenger list (display_name only - pickup addresses NEVER shown here) */}
        {confirmedPassengers.length > 0 && (
          <div className="mb-3">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-500 mb-1.5">
              Passengers
            </p>
            <ul className="space-y-1">
              {confirmedPassengers.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 text-xs text-neutral-700"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-success-500 shrink-0" aria-hidden="true" />
                  <span className="truncate">{p.display_name ?? 'Passenger'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Status / CTA */}
        {isCancelled ? (
          <p className="text-xs font-semibold text-neutral-500 italic">
            Carpool cancelled
          </p>
        ) : isArchived ? (
          <p className="text-xs font-semibold text-neutral-500 italic">
            Carpool archived
          </p>
        ) : viewerIsDriver ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-success-700 bg-success-50 rounded-sm px-3 py-2 text-center">
              You're driving
            </p>
            {breakoutChannelId && onOpenChat && (
              <button
                type="button"
                onClick={onOpenChat}
                className="w-full rounded-sm bg-primary-600 py-2.5 text-center text-sm font-semibold text-white active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none min-h-11 hover:bg-primary-700 shadow-sm"
              >
                Open carpool chat
              </button>
            )}
          </div>
        ) : viewerHasSeat ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-success-700 bg-success-50 rounded-sm px-3 py-2 text-center">
              You're on this carpool
            </p>
            {breakoutChannelId && onOpenChat && (
              <button
                type="button"
                onClick={onOpenChat}
                className="w-full rounded-sm bg-primary-600 py-2.5 text-center text-sm font-semibold text-white active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none min-h-11 hover:bg-primary-700 shadow-sm"
              >
                Open carpool chat
              </button>
            )}
            {onCancelSeat && (
              <button
                type="button"
                onClick={onCancelSeat}
                className="w-full rounded-sm bg-neutral-50 ring-1 ring-neutral-200 py-2.5 text-center text-sm font-semibold text-neutral-700 active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none min-h-11 hover:bg-neutral-100"
              >
                Cancel my seat
              </button>
            )}
          </div>
        ) : isFull ? (
          <button
            type="button"
            disabled
            className="w-full rounded-sm bg-neutral-100 py-2.5 text-center text-sm font-semibold text-neutral-400 cursor-not-allowed select-none min-h-11"
          >
            Carpool full
          </button>
        ) : (
          onSaveSeat && (
            <button
              type="button"
              onClick={onSaveSeat}
              className="w-full rounded-sm bg-success-600 py-2.5 text-center text-sm font-semibold text-white active:scale-[0.97] transition-transform duration-150 cursor-pointer select-none min-h-11 hover:bg-success-700 shadow-sm"
            >
              Save me a seat
            </button>
          )
        )}
      </div>
    </motion.div>
  )
}
