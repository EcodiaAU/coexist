import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { SmilePlus } from 'lucide-react'
import { cn } from '@/lib/cn'
import { REACTION_EMOJIS, type ReactionEmoji } from '@/lib/reactions'
import {
  useMessageReactions,
  useToggleReaction,
} from '@/hooks/use-message-reactions'

/* ------------------------------------------------------------------ */
/*  Picker popover                                                     */
/* ------------------------------------------------------------------ */

interface PickerProps {
  open: boolean
  onClose: () => void
  onPick: (emoji: ReactionEmoji) => void
  align: 'left' | 'right'
}

function ReactionPicker({ open, onClose, onPick, align }: PickerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    if (!open) return
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (!ref.current) return
      const target = e.target as Node
      if (!ref.current.contains(target)) onClose()
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    // Defer one tick so the click that opened the popover does not also close it.
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handleOutside)
      document.addEventListener('touchstart', handleOutside)
      document.addEventListener('keydown', handleEscape)
    }, 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          role="dialog"
          aria-label="Pick a reaction"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 6, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.95 }}
          transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
          className={cn(
            'absolute bottom-full mb-2 z-30',
            'flex items-center gap-1 rounded-full bg-white px-2 py-1.5',
            'shadow-lg ring-1 ring-neutral-200',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onPick(emoji)}
              aria-label={`React with ${emoji}`}
              className={cn(
                'flex items-center justify-center min-h-9 min-w-9 rounded-full',
                'text-xl leading-none',
                'hover:bg-neutral-100 active:scale-[0.9]',
                'transition-transform duration-100 cursor-pointer select-none',
              )}
            >
              {emoji}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/*  MessageReactions row                                               */
/* ------------------------------------------------------------------ */

interface MessageReactionsProps {
  messageId: string
  collectiveId: string
  /** Whether this message was sent by the current user (controls alignment). */
  sent: boolean
  /** Skip rendering when the message is optimistic and has no real id yet. */
  disabled?: boolean
}

export function MessageReactions({
  messageId,
  collectiveId,
  sent,
  disabled = false,
}: MessageReactionsProps) {
  const groups = useMessageReactions(messageId, collectiveId)
  const toggle = useToggleReaction()
  const [pickerOpen, setPickerOpen] = useState(false)

  const handleToggle = useCallback(
    (emoji: ReactionEmoji) => {
      if (disabled) return
      toggle.mutate({ messageId, collectiveId, emoji })
    },
    [toggle, messageId, collectiveId, disabled],
  )

  const handlePickerPick = useCallback(
    (emoji: ReactionEmoji) => {
      handleToggle(emoji)
      setPickerOpen(false)
    },
    [handleToggle],
  )

  if (disabled) return null

  const hasReactions = groups.length > 0

  return (
    <div
      className={cn(
        'relative mt-1 flex flex-wrap items-center gap-1.5',
        sent ? 'justify-end pr-1' : 'justify-start pl-10',
      )}
    >
      {groups.map((g) => (
        <button
          key={g.emoji}
          type="button"
          onClick={() => handleToggle(g.emoji as ReactionEmoji)}
          aria-pressed={g.userReacted}
          aria-label={`${g.emoji} ${g.count} ${g.count === 1 ? 'reaction' : 'reactions'}${g.userReacted ? ', tap to remove yours' : ', tap to add yours'}`}
          className={cn(
            'flex items-center gap-1 rounded-full px-2 py-0.5 min-h-7',
            'text-xs font-semibold tabular-nums',
            'transition-transform duration-150 active:scale-[0.94] cursor-pointer select-none',
            g.userReacted
              ? 'bg-primary-100 text-primary-700 ring-1 ring-primary-300'
              : 'bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50',
          )}
        >
          <span className="text-sm leading-none">{g.emoji}</span>
          <span>{g.count}</span>
        </button>
      ))}

      <button
        type="button"
        onClick={() => setPickerOpen((v) => !v)}
        aria-label="Add a reaction"
        aria-expanded={pickerOpen}
        className={cn(
          'flex items-center justify-center rounded-full min-h-7 min-w-7 px-1.5',
          'text-neutral-500 hover:text-neutral-700',
          hasReactions
            ? 'bg-transparent hover:bg-neutral-100'
            : 'bg-neutral-50 ring-1 ring-neutral-100 hover:bg-neutral-100',
          'transition-transform duration-150 active:scale-[0.94] cursor-pointer select-none',
        )}
      >
        <SmilePlus size={14} strokeWidth={2.25} />
      </button>

      <ReactionPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePickerPick}
        align={sent ? 'right' : 'left'}
      />
    </div>
  )
}
