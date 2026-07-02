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

interface MultiSelectOption {
  value: string
  label: string
  icon?: ReactNode
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  /** Selected values. Empty array = nothing selected (rendered as `allLabel`). */
  value: string[]
  onChange: (value: string[]) => void
  /** Label shown on the trigger when nothing is selected (e.g. "All Collectives"). */
  allLabel?: string
  /**
   * Trigger label when >2 items are selected. `{n}` is replaced with the count.
   * Defaults to "{n} selected".
   */
  countLabel?: (n: number) => string
  label?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
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

/**
 * Checkbox-style multi-select that mirrors <Dropdown>'s look and interaction
 * model (fixed-position portal on desktop, bottom sheet on mobile) but keeps
 * the menu open while toggling several options. Selecting nothing means "all"
 * to the caller - the trigger renders `allLabel` and onChange emits [].
 */
export function MultiSelect({
  options,
  value,
  onChange,
  allLabel = 'All',
  countLabel = (n) => `${n} selected`,
  label,
  disabled = false,
  className,
  triggerClassName,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const shouldReduceMotion = useReducedMotion()
  const id = useId()
  const labelId = `${id}-label`
  const listboxId = `${id}-listbox`

  const selectedSet = new Set(value)
  const selectedOptions = options.filter((o) => selectedSet.has(o.value))

  // Trigger label: nothing -> allLabel, one/two -> their names, more -> count.
  const triggerLabel =
    selectedOptions.length === 0
      ? allLabel
      : selectedOptions.length <= 2
        ? selectedOptions.map((o) => o.label).join(' + ')
        : countLabel(selectedOptions.length)

  // Fixed-position popover styling (escapes overflow clipping), recalculated
  // on scroll/resize so it follows the trigger.
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
          width: rect.width,
        })
      })
    }

    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setPopoverStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      })
    }

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

  const toggle = useCallback(
    (optionValue: string) => {
      const next = new Set(value)
      if (next.has(optionValue)) next.delete(optionValue)
      else next.add(optionValue)
      onChange([...next])
    },
    [value, onChange],
  )

  const clearAll = useCallback(() => onChange([]), [onChange])

  // Close popover on outside click / Escape (desktop)
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
      aria-label={!label ? allLabel : undefined}
      className={cn(
        'flex items-center justify-between w-full h-11 rounded-full px-4 bg-surface-3',
        'text-[16px] sm:text-sm leading-normal text-left',
        'cursor-pointer select-none transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        open ? 'ring-2 ring-primary-500' : '',
        triggerClassName,
      )}
    >
      <span
        className={cn(
          'truncate min-w-0',
          selectedOptions.length > 0 ? 'text-neutral-900' : 'text-neutral-500',
        )}
      >
        {triggerLabel}
      </span>
      <ChevronDown
        size={18}
        className={cn(
          'shrink-0 ml-2 text-neutral-400 transition-transform duration-150',
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
      aria-multiselectable="true"
      aria-labelledby={label ? labelId : undefined}
      className={cn(isMobile ? 'px-2 pb-2' : '')}
    >
      {options.map((option) => {
        const isSelected = selectedSet.has(option.value)

        return (
          <li
            key={option.value}
            role="option"
            aria-selected={isSelected}
            onClick={() => toggle(option.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggle(option.value)
              }
            }}
            tabIndex={0}
            className={cn(
              'flex items-center justify-between gap-3 px-4 py-2.5 rounded-sm mx-1.5',
              'cursor-pointer select-none transition-colors duration-100',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400',
              isSelected
                ? 'bg-white text-primary-400'
                : 'text-neutral-900 hover:bg-neutral-50 active:bg-neutral-50',
            )}
          >
            <span className="flex items-center gap-3 min-w-0">
              <span
                className={cn(
                  'shrink-0 grid place-items-center w-[18px] h-[18px] rounded-[5px] border transition-colors',
                  isSelected
                    ? 'bg-primary-400 border-primary-400'
                    : 'bg-white border-neutral-300',
                )}
                aria-hidden="true"
              >
                {isSelected && <Check size={13} className="text-white" strokeWidth={3} />}
              </span>
              {option.icon && (
                <span className="shrink-0" aria-hidden="true">
                  {option.icon}
                </span>
              )}
              <span className="truncate">{option.label}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )

  // "All / Clear" reset row - selecting it drops back to the all-collectives view.
  const clearRow = (
    <button
      type="button"
      onClick={clearAll}
      disabled={value.length === 0}
      className={cn(
        'flex items-center justify-between w-full px-4 py-2.5 rounded-sm mx-1.5',
        'text-sm font-medium cursor-pointer select-none transition-colors duration-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400',
        value.length === 0
          ? 'text-primary-400 bg-white cursor-default'
          : 'text-neutral-600 hover:bg-neutral-50',
      )}
    >
      <span>{allLabel}</span>
      {value.length === 0 && <Check size={18} className="shrink-0 text-primary-400" aria-hidden="true" />}
    </button>
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
        </label>
      )}

      <div className="relative">
        {trigger}

        {/* Desktop popover - portalled with fixed position to escape overflow clipping */}
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
                  <div
                    ref={popoverRef}
                    className={cn(
                      'bg-white rounded-md shadow-sm border border-neutral-100',
                      'max-h-72 overflow-y-auto py-1.5',
                    )}
                  >
                    {clearRow}
                    <div className="my-1 border-t border-neutral-100" />
                    {optionsList}
                  </div>
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
          snapPoints={[0.6]}
        >
          <h3 className="font-heading text-base font-semibold text-neutral-900 mb-3">
            {label ?? allLabel}
          </h3>
          {clearRow}
          <div className="my-1 border-t border-neutral-100" />
          {optionsList}
        </BottomSheet>
      )}
    </div>
  )
}
