import { type ReactNode, forwardRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'

const variantStyles = {
  primary:
    'bg-primary-800 text-white hover:bg-primary-950 focus-visible:ring-primary-400',
  secondary:
    'bg-primary-100 text-primary-800 shadow-sm hover:bg-primary-200 focus-visible:ring-primary-400',
  ghost:
    'bg-transparent text-primary-800 hover:bg-primary-50 focus-visible:ring-primary-400',
  danger:
    'bg-error text-white hover:opacity-90 focus-visible:ring-error',
  auth:
    'bg-primary-800 text-white hover:bg-primary-950 focus-visible:ring-primary-400 rounded-md h-[54px] text-[15px] font-bold',
} as const

const sizeStyles = {
  sm: 'min-h-11 px-4 text-sm gap-1.5',
  md: 'min-h-12 px-5 gap-2',
  lg: 'min-h-14 px-6 text-base gap-2.5',
} as const

type ButtonVariant = keyof typeof variantStyles
type ButtonSize = keyof typeof sizeStyles

export interface ButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  loading?: boolean
  disabled?: boolean
  fullWidth?: boolean
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  type?: 'button' | 'submit' | 'reset'
  children?: ReactNode
  className?: string
  'aria-label'?: string
  title?: string
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg data-eos-id="src/components/button.tsx#0"
      className={cn('animate-spin', className)}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle data-eos-id="src/components/button.tsx#1"
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2.5"
      />
      <path data-eos-id="src/components/button.tsx#2"
        d="M14 8a6 6 0 0 0-6-6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      icon,
      loading = false,
      disabled = false,
      fullWidth = false,
      onClick,
      type = 'button',
      children,
      className,
      'aria-label': ariaLabel,
      title,
    },
    ref,
  ) {
    const shouldReduceMotion = useReducedMotion()
    const isDisabled = disabled || loading

    return (
      <motion.button data-eos-id="src/components/button.tsx#3"
        ref={ref}
        type={type}
        disabled={isDisabled}
        onClick={onClick}
        title={title}
        aria-label={ariaLabel}
        aria-busy={loading}
        aria-disabled={isDisabled}
        whileTap={
          isDisabled || shouldReduceMotion ? undefined : { scale: 0.975 }
        }
        transition={{ type: 'spring', stiffness: 400, damping: 26, mass: 0.7 }}
        className={cn(
          'relative inline-flex items-center justify-center font-heading font-semibold',
          'rounded-sm cursor-pointer select-none',
          'transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          variantStyles[variant],
          sizeStyles[size],
          fullWidth && 'w-full',
          isDisabled && 'opacity-50 cursor-not-allowed pointer-events-none',
          className,
        )}
      >
        {loading ? (
          <>
            <Spinner data-eos-id="src/components/button.tsx#4"
              className={cn(
                size === 'sm' && 'w-3.5 h-3.5',
                size === 'md' && 'w-4 h-4',
                size === 'lg' && 'w-5 h-5',
              )}
            />
            {children && <span data-eos-id="src/components/button.tsx#5">{children}</span>}
          </>
        ) : (
          <>
            {icon && (
              <span data-eos-id="src/components/button.tsx#6" className="flex items-center justify-center shrink-0">
                {icon}
              </span>
            )}
            {children && <span data-eos-id="src/components/button.tsx#7">{children}</span>}
          </>
        )}
      </motion.button>
    )
  },
)
