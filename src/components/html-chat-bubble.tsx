import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, useReducedMotion, useMotionValue, useTransform, type PanInfo } from 'framer-motion'
import { Reply, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatTime } from '@/lib/date-format'
import { ROLE_COLORS } from '@/lib/constants'
import { useLongPress } from '@/hooks/use-long-press'

/** See chat-bubble.tsx for the swipe-reply doctrine - this mirrors it. */
const SWIPE_REPLY_FIRE_PX = 60
const SWIPE_REPLY_MAX_PX = 80

interface HtmlChatBubbleProps {
  /** Full HTML document string to render inside a sandboxed iframe */
  htmlContent: string
  sent: boolean
  timestamp: Date
  senderName?: string
  senderAvatar?: string
  senderId?: string
  roleBadge?: string
  className?: string
  skipAnimation?: boolean
  /**
   * Same-sender grouping (1.8.5 item 9). Mirrors `isContinuation` on the
   * standard ChatBubble. Hides avatar + sender-name row so the iframe
   * card stacks flush under the prior bubble in the same run.
   */
  isContinuation?: boolean
  onAvatarTap?: (userId: string) => void
  onSenderTap?: (userId: string) => void
  onLongPress?: () => void
  /** Swipe-right-to-reply (1.8.6 feature 1). See ChatBubble for the contract. */
  onSwipeReply?: () => void
}

/**
 * Strip <script> tags from HTML string as a basic safety measure.
 * The sandboxed iframe already blocks script execution, but this
 * provides defence-in-depth.
 */
function stripScripts(html: string): string {
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
}

/**
 * Chat bubble that renders a full HTML document inside a sandboxed iframe.
 * This preserves the document's own CSS, layout, fonts  everything renders
 * exactly as the original file. Scripts are stripped and the iframe sandbox
 * blocks execution as defence-in-depth.
 */
export function HtmlChatBubble({
  htmlContent,
  sent,
  timestamp,
  senderName,
  senderAvatar,
  senderId,
  roleBadge,
  className,
  skipAnimation = false,
  isContinuation = false,
  onAvatarTap,
  onSenderTap,
  onLongPress,
  onSwipeReply,
}: HtmlChatBubbleProps) {
  const shouldReduceMotion = useReducedMotion()
  const [isExpanded, setIsExpanded] = useState(false)
  const [iframeHeight, setIframeHeight] = useState(300)
  const inlineIframeRef = useRef<HTMLIFrameElement>(null)
  const { onTouchStart: handleTouchStart, onTouchEnd: handleTouchEnd, onTouchCancel: handleTouchCancel } = useLongPress(onLongPress)

  /* Swipe-right-to-reply (1.8.6 feature 1). Mirrors ChatBubble. */
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

  const roleStyle = roleBadge
    ? ROLE_COLORS[roleBadge] ?? { bg: 'bg-primary-100', text: 'text-primary-600' }
    : null

  // Strip scripts  iframe sandbox already blocks them but defence-in-depth
  const safeHtml = stripScripts(htmlContent)

  const toggleExpand = useCallback(() => {
    setIsExpanded((v) => !v)
  }, [])

  // Auto-size the inline iframe to fit its content
  useEffect(() => {
    const iframe = inlineIframeRef.current
    if (!iframe) return

    const handleLoad = () => {
      try {
        const doc = iframe.contentDocument
        if (doc?.body) {
          // Give it a moment to render
          requestAnimationFrame(() => {
            const height = doc.documentElement.scrollHeight || doc.body.scrollHeight
            // Clamp between 120px and 500px for inline view
            setIframeHeight(Math.max(120, Math.min(height, 500)))
          })
        }
      } catch {
        // Cross-origin  fall back to default height
      }
    }

    iframe.addEventListener('load', handleLoad)
    return () => iframe.removeEventListener('load', handleLoad)
  }, [safeHtml])

  const label = `${sent ? 'Sent' : 'Received'} HTML message${senderName ? ` from ${senderName}` : ''}`

  /* ─── Fullscreen overlay ────────────────────────────────────────── */
  if (isExpanded) {
    return (
      <motion.div
        className="fixed inset-0 z-50 flex flex-col bg-white"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 bg-white/95 backdrop-blur-sm safe-top">
          <div className="flex items-center gap-2">
            {senderName && (
              <span className="text-sm font-bold text-neutral-700">{senderName}</span>
            )}
            <span className="text-xs text-neutral-400">HTML Content</span>
          </div>
          <button
            type="button"
            onClick={toggleExpand}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600 active:bg-neutral-200 transition-colors"
            aria-label="Exit fullscreen"
          >
            <Minimize2 size={20} />
          </button>
        </div>

        {/* Full-viewport iframe  user can pinch-zoom natively */}
        <iframe
          srcDoc={safeHtml}
          sandbox="allow-same-origin"
          title="HTML content (fullscreen)"
          className="flex-1 w-full border-none"
          style={{ background: 'white' }}
        />
      </motion.div>
    )
  }

  /* ─── Inline bubble ────────────────────────────────────────────── */
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
        // 1.8.5 item 9: gap-2.5 → gap-2 tightens avatar↔card.
        'flex gap-2 min-w-0',
        sent ? 'flex-row-reverse' : 'flex-row',
        'w-full',
        dragEnabled && 'relative z-10 touch-pan-y',
        className,
      )}
    >
      {/* Avatar (received only). 1.8.5 item 9: continuation messages render
          a 44px spacer in place of the avatar so the card stays aligned. */}
      {!sent && (
        isContinuation ? (
          <div className="flex-shrink-0 w-11" aria-hidden="true" />
        ) : (
          <button
            type="button"
            className="flex-shrink-0 self-end flex items-center justify-center min-h-11 min-w-11 rounded-full cursor-pointer select-none active:scale-[0.93] transition-transform duration-150"
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
          'flex min-w-0 flex-col gap-0',
          'w-full max-w-[92%] sm:max-w-[85%]',
          sent ? 'items-end' : 'items-start',
        )}
      >
        {/* Sender name + role badge (received only, head-of-run only).
            1.8.5 item 9: dropped 44px touch-target on the name button (the
            avatar above already meets the touch target) and hide entire row
            on continuation messages. */}
        {!sent && senderName && !isContinuation && (
          <div className="flex items-center gap-2 px-1 mb-1">
            <button
              type="button"
              className="text-[13px] font-bold text-neutral-700 hover:text-neutral-900 py-0.5 cursor-pointer select-none active:scale-[0.97] transition-transform duration-150"
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

        {/* HTML bubble */}
        <div
          className={cn(
            'w-full rounded-2xl overflow-hidden transition-colors duration-150',
            sent
              ? 'rounded-br-md bg-white shadow-sm ring-1 ring-neutral-100'
              : 'rounded-bl-md bg-white shadow-sm ring-1 ring-neutral-100',
          )}
        >
          {/* Expand button bar */}
          <div className={cn(
            'flex items-center justify-between px-3 py-2 border-b border-neutral-100',
            'bg-neutral-50',
          )}>
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Rich Content
            </span>
            <button
              type="button"
              onClick={toggleExpand}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 active:bg-neutral-100 transition-colors cursor-pointer"
              aria-label="Expand to fullscreen"
            >
              <Maximize2 size={15} />
            </button>
          </div>

          {/* Sandboxed iframe  renders the full HTML document faithfully */}
          <iframe
            ref={inlineIframeRef}
            srcDoc={safeHtml}
            sandbox="allow-same-origin"
            title="HTML content"
            className="w-full border-none"
            style={{
              height: iframeHeight,
              background: 'white',
              display: 'block',
            }}
          />

          {/* Timestamp */}
          <div className={cn(
            'px-3 pb-2 pt-1',
            sent ? 'text-right' : 'text-left',
          )}>
            <time
              dateTime={timestamp.toISOString()}
              className="text-[11px] font-medium tabular-nums text-neutral-400"
            >
              {formatTime(timestamp)}
            </time>
          </div>
        </div>
      </div>
    </motion.div>
    </div>
  )
}
