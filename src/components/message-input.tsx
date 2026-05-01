import {
    useState,
    useRef,
    useCallback,
    useEffect,
} from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
    SendHorizontal,
    Paperclip,
    Plus,
    BarChart3,
    Megaphone,
    Bell,
    X,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { containsProfanity } from '@/lib/profanity'

interface MessageInputProps {
  onSend: (message: string) => void
  onAttach?: () => void
  onTyping?: () => void
  placeholder?: string
  disabled?: boolean
  className?: string
  'aria-label'?: string
  initialValue?: string
  onValueChange?: (value: string) => void
  maxLength?: number
  padForTabBar?: boolean
  /** Show leader action buttons (poll, announce, invite, broadcast) */
  isLeader?: boolean
  onCreatePoll?: () => void
  onCreateAnnouncement?: () => void
  onCreateEventInvite?: () => void
  onBroadcastNotification?: () => void
}

export function MessageInput({
  onSend,
  onAttach,
  onTyping,
  placeholder = 'Type a message...',
  disabled = false,
  className,
  'aria-label': ariaLabel = 'Message input',
  initialValue = '',
  onValueChange,
  maxLength = 4000,
  padForTabBar = false,
  isLeader = false,
  onCreatePoll,
  onCreateAnnouncement,
  onBroadcastNotification,
}: MessageInputProps) {
  const shouldReduceMotion = useReducedMotion()
  const [value, setValue] = useState(initialValue)
  const [showLeaderActions, setShowLeaderActions] = useState(false)
  const [profanityWarning, setProfanityWarning] = useState(false)
  // Sync when initialValue changes (e.g. entering edit mode)
  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const hasText = value.trim().length > 0

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const lineHeight = 24
    const maxHeight = lineHeight * 4
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [value, adjustHeight])

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return

    if (containsProfanity(trimmed)) {
      setProfanityWarning(true)
      setTimeout(() => setProfanityWarning(false), 4000)
      return
    }

    onSend(trimmed)
    setValue('')
    setProfanityWarning(false)
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    })
  }, [value, disabled, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newVal = maxLength ? e.target.value.slice(0, maxLength) : e.target.value
      setValue(newVal)
      onValueChange?.(newVal)
      onTyping?.()
    },
    [maxLength, onValueChange, onTyping],
  )

  const leaderActions = [
    { icon: BarChart3, label: 'Poll', onClick: onCreatePoll, color: 'text-white bg-primary-600 shadow-sm' },
    { icon: Megaphone, label: 'Announce', onClick: onCreateAnnouncement, color: 'text-white bg-accent-600 shadow-sm' },
    { icon: Bell, label: 'Push Alert', onClick: onBroadcastNotification, color: 'text-white bg-warning-600 shadow-sm' },
  ]

  return (
    <div
      className={cn(
        'z-10 bg-white shadow-none border-t border-neutral-100',
        className,
      )}
      style={{
        paddingBottom: padForTabBar
          ? 'calc(3.5rem + var(--safe-bottom, 0px) + 0.75rem + var(--kb-height, 0px))'
          : 'calc(var(--safe-bottom, 0px) + 0.75rem + var(--kb-height, 0px))',
      }}
    >
      {/* Leader actions panel */}
      <AnimatePresence>
        {showLeaderActions && isLeader && (
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="bg-neutral-50 px-3 py-3"
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-500 flex-1">
                Leader Actions
              </p>
              <button
                type="button"
                onClick={() => setShowLeaderActions(false)}
                className="flex items-center justify-center min-h-11 min-w-11 rounded-full text-neutral-400 hover:bg-neutral-100 active:scale-[0.95] transition-transform duration-150 cursor-pointer select-none"
                aria-label="Close actions"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex gap-2">
              {leaderActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => {
                    action.onClick?.()
                    setShowLeaderActions(false)
                  }}
                  disabled={!action.onClick}
                  className={cn(
                    'flex flex-1 flex-col items-center gap-1 rounded-xl py-2.5 px-1',
                    'transition-transform duration-150 active:scale-[0.95] cursor-pointer select-none min-h-11',
                    action.color,
                    'hover:shadow-sm',
                    !action.onClick && 'opacity-40 cursor-default',
                  )}
                >
                  <action.icon size={18} />
                  <span className="text-[11px] font-semibold leading-tight text-center">
                    {action.label}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profanity warning */}
      <AnimatePresence>
        {profanityWarning && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="px-3 pt-2"
          >
            <div className="flex items-center gap-2 rounded-xl bg-warning-100 px-3.5 py-2.5 border border-warning-200/60">
              <p className="text-xs font-semibold text-warning-800">
                Please keep it friendly! Your message contains language that isn't allowed. Try rephrasing it.
              </p>
              <button
                type="button"
                onClick={() => setProfanityWarning(false)}
                className="flex items-center justify-center min-h-11 min-w-11 rounded-full text-warning-500 hover:bg-warning-200 active:scale-[0.93] transition-[colors,transform] duration-150 shrink-0 cursor-pointer"
                aria-label="Dismiss warning"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input bar */}
      <div className="px-3 pt-2">
        <div
          role="toolbar"
          aria-label={ariaLabel}
          className={cn(
            'flex items-end gap-2 rounded-2xl bg-surface-3 px-3.5 py-2.5',
            'transition-[background-color,box-shadow] duration-200',
            'focus-within:bg-white focus-within:shadow-sm focus-within:ring-2 focus-within:ring-primary-400/70',
            disabled && 'opacity-50',
          )}
        >
          {/* Leader plus button */}
          {isLeader && (
            <button
              type="button"
              onClick={() => setShowLeaderActions(!showLeaderActions)}
              disabled={disabled}
              aria-label="Leader actions"
              className={cn(
                'flex-shrink-0 rounded-full min-w-11 min-h-11 flex items-center justify-center',
                'transition-transform duration-200 active:scale-[0.93]',
                showLeaderActions
                  ? 'bg-primary-600 text-white rotate-45'
                  : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                'disabled:pointer-events-none',
              )}
            >
              <Plus size={20} aria-hidden="true" />
            </button>
          )}

          {/* Attachment button */}
          {onAttach && (
            <button
              type="button"
              onClick={onAttach}
              disabled={disabled}
              aria-label="Attach photo"
              className={cn(
                'flex-shrink-0 rounded-full min-w-11 min-h-11 flex items-center justify-center text-neutral-400',
                'transition-[colors,transform] duration-150 active:scale-[0.93]',
                'hover:bg-neutral-100 hover:text-neutral-600',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                'disabled:pointer-events-none',
              )}
            >
              <Paperclip size={20} aria-hidden="true" />
            </button>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            maxLength={maxLength}
            aria-label="Message text"
            className={cn(
              'flex-1 resize-none bg-transparent text-[14px] font-medium text-neutral-900',
              'placeholder:text-neutral-400 placeholder:font-normal',
              'outline-none',
              'disabled:cursor-not-allowed',
              'leading-6 min-h-11 py-2.5',
            )}
            style={{ maxHeight: 24 * 4 }}
          />

          {/* Send button */}
          <AnimatePresence>
            {hasText && (
              <motion.button
                type="button"
                onClick={handleSend}
                disabled={disabled}
                aria-label="Send message"
                initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className={cn(
                  'flex-shrink-0 rounded-full bg-primary-500 min-w-11 min-h-11 flex items-center justify-center text-white',
                  'transition-colors duration-150',
                  'hover:bg-primary-600',
                  'shadow-sm',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1',
                  'disabled:pointer-events-none disabled:opacity-50',
                )}
              >
                <SendHorizontal size={19} strokeWidth={2.5} aria-hidden="true" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  )
}
