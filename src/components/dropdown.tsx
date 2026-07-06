import {
    type ReactNode,
    useState,
    useRef,
    useEffect,
    useCallback,
    useId,
    useLayoutEffect,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { BottomSheet } from './bottom-sheet'

interface DropdownOption {
  value: string
  label: string
  icon?: ReactNode
}

interface DropdownProps {
  options: DropdownOption[]
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  error?: string
  disabled?: boolean
  /** Renders the red asterisk next to the label (same convention as Input) */
  required?: boolean
  className?: string
  triggerClassName?: string
  /** Use 'dark' when rendered on a dark/hero background */
  tone?: 'default' | 'dark'
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia('(max-width: 639px)').matches,
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return isMobile
}

export function Dropdown({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  label,
  error,
  disabled = false,
  required = false,
  className,
  triggerClassName,
  tone = 'default',
}: DropdownProps) {
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const shouldReduceMotion = useReducedMotion()
  const id = useId()
  const labelId = `${id}-label`
  const errorId = `${id}-error`
  const listboxId = `${id}-listbox`

  const selectedOption = options.find((o) => o.value === value)

  // Track trigger position for fixed-position popover (escapes overflow clipping).
  // Recalculates on scroll/resize so the popover follows the trigger inside modals.
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({})

  useLayoutEffect(() => {
    if (!open || isMobile || !triggerRef.current) return

    let rafId = 0
    const updatePosition = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        if (!triggerRef.current) return
        const rect = triggerRef.current.getBoundingClientRect()
        setPopoverStyle({
          position: 'fixed',
          top: rect.bottom + 4,
          left: rect.left,
          minWidth: rect.width, width: 'max-content', maxWidth: 'calc(100vw - ' + (rect.left + 8) + 'px)',
        })
      })
    }

    // Initial position (synchronous to avoid flash)
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setPopoverStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        minWidth: rect.width, width: 'max-content', maxWidth: 'calc(100vw - ' + (rect.left + 8) + 'px)',
      })
    }

    // Listen on all scrollable ancestors + window resize so the popover
    // repositions when a modal or parent container scrolls.
    const scrollParents: (HTMLElement | Window)[] = [window]
    let el: HTMLElement | null = triggerRef.current.parentElement
    while (el) {
      const style = getComputedStyle(el)
      if (/(auto|scroll)/.test(style.overflow + style.overflowY + style.overflowX)) {
        scrollParents.push(el)
      }
      el = el.parentElement
    }

    for (const parent of scrollParents) {
      parent.addEventListener('scroll', updatePosition, { passive: true })
    }
    window.addEventListener('resize', updatePosition, { passive: true })

    return () => {
      cancelAnimationFrame(rafId)
      for (const parent of scrollParents) {
        parent.removeEventListener('scroll', updatePosition)
      }
      window.removeEventListener('resize', updatePosition)
    }
  }, [open, isMobile])

  const handleSelect = useCallback(
    (optionValue: string) => {
      onChange(optionValue)
      setOpen(false)
      requestAnimationFrame(() => triggerRef.current?.focus())
    },
    [onChange],
  )

  // Close popover on outside click (desktop)
  useEffect(() => {
    if (!open || isMobile) return

    const handleClick = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !popoverRef.current?.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, isMobile])

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      id={id}
      disabled={disabled}
      onClick={() => setOpen((prev) => !prev)}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-labelledby={label ? labelId : undefined}
      aria-describedby={error ? errorId : undefined}
      aria-label={!label ? placeholder : undefined}
      className={cn(
        'flex items-center justify-between w-full h-11 rounded-full px-4',
        tone === 'dark'
          ? 'bg-white/20 backdrop-blur-md border border-white/20'
          : 'bg-surface-3',
        'text-[16px] sm:text-sm leading-normal text-left',
        'cursor-pointer select-none',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        error
          ? 'ring-2 ring-error'
          : open
            ? tone === 'dark' ? 'ring-2 ring-white/40' : 'ring-2 ring-primary-500'
            : '',
        triggerClassName,
      )}
    >
      <span
        className={cn(
          'truncate min-w-0',
          tone === 'dark'
            ? selectedOption ? 'text-white' : 'text-white/70'
            : selectedOption ? 'text-neutral-900' : 'text-neutral-500',
        )}
      >
        {selectedOption ? (
          selectedOption.icon ? (
            <span className="flex items-center gap-2 min-w-0">
              <span className="shrink-0" aria-hidden="true">
                {selectedOption.icon}
              </span>
              <span className="truncate">{selectedOption.label}</span>
            </span>
          ) : (
            selectedOption.label
          )
        ) : (
          placeholder
        )}
      </span>
      <ChevronDown
        size={18}
        className={cn(
          'shrink-0 ml-2 transition-transform duration-150',
          tone === 'dark' ? 'text-white/70' : 'text-neutral-400',
          open && 'rotate-180',
        )}
        aria-hidden="true"
      />
    </button>
  )

  const optionsList = (
    <ul
      id={listboxId}
      role="listbox"
      aria-labelledby={label ? labelId : undefined}
      className={cn(isMobile ? 'px-2 pb-2' : '')}
    >
      {options.map((option) => {
        const isSelected = option.value === value

        return (
          <li
            key={option.value}
            role="option"
            aria-selected={isSelected}
            onClick={() => handleSelect(option.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleSelect(option.value)
              }
            }}
            tabIndex={0}
            className={cn(
              'flex items-center justify-between gap-3 px-4 py-2.5 rounded-sm mx-1.5',
              'cursor-pointer select-none',
              'transition-colors duration-100',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400',
              isSelected
                ? 'bg-white text-primary-400'
                : 'text-neutral-900 hover:bg-neutral-50 active:bg-neutral-50',
            )}
          >
            <span className="flex items-center gap-3 min-w-0">
              {option.icon && (
                <span className="shrink-0" aria-hidden="true">
                  {option.icon}
                </span>
              )}
              <span className="whitespace-normal sm:whitespace-nowrap">{option.label}</span>
            </span>
            {isSelected && (
              <Check
                size={18}
                className="shrink-0 text-primary-400"
                aria-hidden="true"
              />
            )}
          </li>
        )
      })}
    </ul>
  )

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label
          id={labelId}
          htmlFor={id}
          className="block mb-1.5 text-sm font-medium text-neutral-900"
        >
          {label}
          {required && <span className="text-error ml-0.5">*</span>}
        </label>
      )}

      <div className="relative">
        {trigger}

        {/* Desktop popover  portalled with fixed position to escape overflow clipping */}
        {!isMobile &&
          createPortal(
            <AnimatePresence>
              {open && (
                <motion.div
                  initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
                  transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 28, mass: 0.7 }}
                  style={popoverStyle}
                  className="z-[60] relative gpu-panel"
                >
                  {/* Scrollable list */}
                  <div
                    ref={(node) => {
                      (popoverRef as React.MutableRefObject<HTMLDivElement | null>).current = node
                      if (node) {
                        const canScroll = node.scrollHeight > node.clientHeight
                        const hint = node.parentElement?.querySelector<HTMLElement>('[data-scroll-hint]')
                        if (hint) hint.style.opacity = canScroll ? '1' : '0'
                      }
                    }}
                    className={cn(
                      'bg-white rounded-md shadow-sm border border-neutral-100',
                      'max-h-60 overflow-y-auto',
                      'py-1.5',
                    )}
                    onScroll={(e) => {
                      const el = e.currentTarget
                      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 4
                      const hint = el.parentElement?.querySelector<HTMLElement>('[data-scroll-hint]')
                      if (hint) hint.style.opacity = atBottom ? '0' : '1'
                    }}
                  >
                    {optionsList}
                  </div>

                  {/* Scroll hint gradient  overlays bottom of list */}
                  <div
                    data-scroll-hint
                    className={cn(
                      'absolute bottom-0 left-0 right-0 h-10 rounded-b-md',
                      'bg-gradient-to-t from-primary-200/80 via-primary-100/50 to-transparent',
                      'pointer-events-none transition-opacity duration-200',
                    )}
                    style={{ opacity: 0 }}
                  />
                </motion.div>
              )}
            </AnimatePresence>,
            document.body,
          )}
      </div>

      {/* Mobile bottom sheet */}
      {isMobile && (
        <BottomSheet
          open={open}
          onClose={() => setOpen(false)}
          snapPoints={[0.4]}
        >
          <h3 className="font-heading text-base font-semibold text-neutral-900 mb-3">
            {label ?? placeholder}
          </h3>
          {optionsList}
        </BottomSheet>
      )}

      {/* Error text */}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-caption text-error">
          {error}
        </p>
      )}
    </div>
  )
}
