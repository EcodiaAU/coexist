import { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

interface ListItemProps {
  icon?: ReactNode
  avatar?: ReactNode
  title: string
  subtitle?: string
  rightContent?: ReactNode
  onClick?: () => void
  href?: string
  disabled?: boolean
  hideDivider?: boolean
  className?: string
  'aria-label'?: string
}

export function ListItem({
  icon,
  avatar,
  title,
  subtitle,
  rightContent,
  onClick,
  href,
  disabled = false,
  hideDivider = false,
  className,
  'aria-label': ariaLabel,
}: ListItemProps) {
  const shouldReduceMotion = useReducedMotion()
  const isInteractive = !disabled && (!!onClick || !!href)

  const content = (
    <>
      {(icon || avatar) && (
        <span data-eos-id="src/components/list-item.tsx#0" data-eos-v="2"
          className="flex items-center justify-center shrink-0 mr-3 text-neutral-400"
          aria-hidden="true"
        >
          {avatar ?? icon}
        </span>
      )}
      <span data-eos-id="src/components/list-item.tsx#1" className="flex-1 min-w-0">
        <span data-eos-id="src/components/list-item.tsx#2" className="block text-sm font-medium text-neutral-900 truncate">
          {title}
        </span>
        {subtitle && (
          <span data-eos-id="src/components/list-item.tsx#3" className="block text-xs text-neutral-500 truncate mt-0.5">
            {subtitle}
          </span>
        )}
      </span>
      <span data-eos-id="src/components/list-item.tsx#4" className="flex items-center shrink-0 ml-3 text-neutral-400">
        {rightContent ?? (
          isInteractive && (
            <ChevronRight data-eos-id="src/components/list-item.tsx#5" className="w-5 h-5" aria-hidden="true" />
          )
        )}
      </span>
    </>
  )

  const sharedClassName = cn(
    'flex items-center w-full min-h-14 px-4 py-3 text-left',
    'transition-colors duration-100',
    isInteractive && 'cursor-pointer hover:bg-surface-3 active:bg-surface-3',
    disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
    !hideDivider && 'border-b border-neutral-100',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400',
    className,
  )

  if (href && !disabled) {
    return (
      <motion.a data-eos-href="dynamic" data-eos-href-label="Href" data-eos-href-scope="prop" data-eos-id="src/components/list-item.tsx#6"
        href={href}
        aria-label={ariaLabel ?? title}
        aria-disabled={disabled}
        whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className={sharedClassName}
      >
        {content}
      </motion.a>
    )
  }

  if (onClick && !disabled) {
    return (
      <motion.button data-eos-id="src/components/list-item.tsx#7"
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? title}
        aria-disabled={disabled}
        whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className={sharedClassName}
      >
        {content}
      </motion.button>
    )
  }

  return (
    <div data-eos-id="src/components/list-item.tsx#8"
      aria-label={ariaLabel ?? title}
      aria-disabled={disabled || undefined}
      className={sharedClassName}
    >
      {content}
    </div>
  )
}
