import { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

interface ChipProps {
  label: string
  selected?: boolean
  onSelect?: () => void
  onDismiss?: () => void
  icon?: ReactNode
  variant?: 'default' | 'activity'
  className?: string
  'aria-label'?: string
}

const variantStyles = {
  default: {
    selected: 'bg-primary-600 text-white ring-2 ring-primary-300 shadow-sm',
    unselected: 'bg-white text-neutral-700 border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 shadow-sm',
  },
  activity: {
    selected: 'bg-primary-600 text-white ring-2 ring-primary-300 shadow-sm',
    unselected: 'bg-white text-neutral-700 border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 shadow-sm',
  },
} as const

export function Chip({
  label,
  selected = false,
  onSelect,
  onDismiss,
  icon,
  variant = 'default',
  className,
  'aria-label': ariaLabel,
}: ChipProps) {
  const shouldReduceMotion = useReducedMotion()
  const styles = variantStyles[variant]

  return (
    <motion.button data-eos-id="src/components/chip.tsx#0" data-eos-v="2"
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={ariaLabel ?? label}
      onClick={onSelect}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 min-h-11',
        'text-sm font-medium cursor-pointer select-none',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1',
        selected ? styles.selected : styles.unselected,
        className,
      )}
    >
      {icon && (
        <span data-eos-id="src/components/chip.tsx#1" className="flex items-center shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      <span data-eos-id="src/components/chip.tsx#2">{label}</span>
      {onDismiss && (
        <span data-eos-id="src/components/chip.tsx#3"
          role="button"
          tabIndex={0}
          aria-label={`Remove ${label}`}
          onClick={(e) => {
            e.stopPropagation()
            onDismiss()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              onDismiss()
            }
          }}
          className={cn(
            'flex items-center justify-center rounded-full',
            '-mr-1 ml-0.5 min-w-[28px] min-h-[28px] p-1',
            'hover:bg-black/10 transition-colors duration-100',
          )}
        >
          <X data-eos-id="src/components/chip.tsx#4" className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        </span>
      )}
    </motion.button>
  )
}
