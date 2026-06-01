import {
  forwardRef,
  useState,
  useCallback,
  useRef,
  useEffect,
  type KeyboardEvent,
} from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Search, X, Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useImeSafeOnChange } from '@/hooks/use-ime-safe-on-change'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  onSubmit?: (value: string) => void
  onClear?: () => void
  onFocus?: () => void
  onBlur?: () => void
  placeholder?: string
  /** Show a subtle sparkle icon when empty - hints at AI/smart search */
  showSparkle?: boolean
  /** Compact variant for tighter spaces (chat overlay, admin) */
  compact?: boolean
  /** Auto-focus on mount */
  autoFocus?: boolean
  className?: string
  'aria-label'?: string
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  function SearchBar(
    {
      value,
      onChange,
      onSubmit,
      onClear,
      onFocus,
      onBlur,
      placeholder = 'Search...',
      showSparkle = false,
      compact = false,
      autoFocus = false,
      className,
      'aria-label': ariaLabel,
    },
    ref,
  ) {
    const shouldReduceMotion = useReducedMotion()
    const [focused, setFocused] = useState(false)
    const internalRef = useRef<HTMLInputElement | null>(null)
    const imeProps = useImeSafeOnChange<HTMLInputElement>(onChange)

    const setRef = useCallback(
      (node: HTMLInputElement | null) => {
        internalRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref)
          (ref as React.MutableRefObject<HTMLInputElement | null>).current =
            node
      },
      [ref],
    )

    useEffect(() => {
      if (autoFocus) internalRef.current?.focus()
    }, [autoFocus])

    const handleFocus = useCallback(() => {
      setFocused(true)
      onFocus?.()
    }, [onFocus])

    const handleBlur = useCallback(() => {
      setFocused(false)
      onBlur?.()
    }, [onBlur])

    const handleClear = useCallback(() => {
      onChange('')
      onClear?.()
      internalRef.current?.focus()
    }, [onChange, onClear])

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') onSubmit?.(value)
        if (e.key === 'Escape') {
          if (value) {
            handleClear()
          } else {
            internalRef.current?.blur()
          }
        }
      },
      [onSubmit, value, handleClear],
    )

    const h = compact ? 'h-11' : 'h-12'

    return (
      <div className={cn('relative group', className)}>
        {/* Animated gradient glow behind - visible on focus */}
        <motion.div
          className="absolute -inset-[1px] rounded-full opacity-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(135deg, var(--color-primary-300), var(--color-accent-400), var(--color-primary-300))',
            backgroundSize: '200% 200%',
          }}
          animate={{
            opacity: focused ? 0.6 : 0,
            backgroundPosition: focused ? ['0% 50%', '100% 50%'] : '0% 50%',
          }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : {
                  opacity: { duration: 0.2 },
                  backgroundPosition: {
                    duration: 3,
                    repeat: Infinity,
                    repeatType: 'reverse',
                    ease: 'linear',
                  },
                }
          }
        />

        {/* Main input container */}
        <motion.div
          className={cn(
            'relative flex items-center gap-2',
            h,
            'rounded-full',
            'bg-surface-3',
            'shadow-sm',
            'transition-shadow duration-200',
            focused && 'shadow-sm ring-1 ring-primary-300',
          )}
          animate={{
            scale: focused ? 1.01 : 1,
          }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { type: 'spring', stiffness: 500, damping: 30 }
          }
        >
          {/* Search icon - morphs on focus */}
          <motion.div
            className={cn(
              'flex items-center justify-center shrink-0',
              compact ? 'ml-3' : 'ml-3.5',
            )}
            animate={{
              scale: focused ? 1.1 : 1,
              rotate: focused ? -8 : 0,
            }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 400, damping: 20 }
            }
          >
            <Search
              size={compact ? 16 : 18}
              className={cn(
                'transition-colors duration-200',
                focused ? 'text-primary-500' : 'text-neutral-400',
              )}
            />
          </motion.div>

          {/* Input */}
          <input
            ref={setRef}
            type="text"
            value={value}
            {...imeProps}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoFocus={autoFocus}
            aria-label={ariaLabel ?? placeholder}
            className={cn(
              'flex-1 bg-transparent outline-none ring-0 border-none',
              'focus:outline-none focus:ring-0 focus:border-none',
              'appearance-none [&::-webkit-search-cancel-button]:hidden',
              'text-neutral-900 placeholder:text-neutral-500',
              'caret-primary-500',
              // 16px on mobile prevents iOS zoom, smaller on desktop
              'text-[16px] sm:text-sm',
            )}
          />

          {/* Right side: sparkle hint or clear button */}
          <AnimatePresence mode="wait">
            {value ? (
              <motion.button
                key="clear"
                type="button"
                onClick={handleClear}
                aria-label="Clear search"
                className={cn(
                  'flex items-center justify-center shrink-0 rounded-full',
                  'text-neutral-400 hover:text-neutral-600',
                  'hover:bg-neutral-100 active:bg-neutral-200',
                  'transition-colors duration-150',
                  compact ? 'w-11 h-11 mr-0.5' : 'w-11 h-11 mr-0.5',
                )}
                initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.5, rotate: -90 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.5, rotate: 90 }}
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 500, damping: 25 }
                }
              >
                <X size={compact ? 14 : 16} />
              </motion.button>
            ) : showSparkle && !focused ? (
              <motion.div
                key="sparkle"
                className={cn(
                  'flex items-center justify-center shrink-0',
                  compact ? 'mr-2.5' : 'mr-3',
                )}
                initial={shouldReduceMotion ? false : { opacity: 0, scale: 0 }}
                animate={{ opacity: 0.5, scale: 1 }}
                exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0 }}
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }
                }
              >
                <Sparkles size={compact ? 14 : 16} className="text-neutral-400/50" />
              </motion.div>
            ) : (
              /* Spacer so input padding stays consistent */
              <div className={compact ? 'w-2.5 shrink-0' : 'w-3 shrink-0'} />
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    )
  },
)
