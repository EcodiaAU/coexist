import { type ReactNode, forwardRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'

const variantStyles = {
  primary:
    'bg-primary-800 text-white hover:bg-primary-950 focus-visible:ring-primary-400',
  secondary:
    'bg-primary-100 text-primary-800 hover:bg-primary-200 focus-visible:ring-primary-400',
  ghost:
    'bg-transparent text-primary-800 hover:bg-primary-50 focus-visible:ring-primary-400',
  danger:
    'bg-error text-white hover:opacity-90 focus-visible:ring-error',
  auth:
    'bg-primary-800 text-white hover:bg-primary-950 focus-visible:ring-primary-400 rounded-md h-[54px] text-[15px] font-bold',
} as const

// The elevation ladder from the shared @ecodia/motion contract. Applied only to
// the raised variants so a card is a hairline at rest and lifts to a whisper on
// hover, never a drop-shadowed slab. Ghost/danger stay flat.
const variantShadow: Partial<Record<ButtonVariant, string>> = {
  primary: 'shadow-[var(--ec-sh-1)] hover:shadow-[var(--ec-sh-2)]',
  secondary: 'shadow-[var(--ec-sh-1)] hover:shadow-[var(--ec-sh-2)]',
  auth: 'shadow-[var(--ec-sh-1)] hover:shadow-[var(--ec-sh-2)]',
}

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
  /**
   * Async success state. Flip `loading` -> `success` after a submit resolves and
   * the button morphs the spinner into a drawn check (the signed-off prototype
   * interaction, `ec-draw` from the shared motion contract). Backward compatible:
   * defaults to false, so nothing changes for callers that never set it.
   */
  success?: boolean
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
    <svg data-eos-id="src/components/button.tsx#0" data-eos-v="2"
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

// Drawn check: the stroke draws itself in over --dur-slow with the shared ease.
// One-shot on mount, so it fires exactly when the button flips into `success`.
function DrawnCheck({ className }: { className?: string }) {
  return (
    <svg
      className={cn('shrink-0', className)}
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 10.5l4 4 8-9"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 20,
          strokeDashoffset: 20,
          animation: 'ec-draw var(--dur-slow) var(--ease-out) forwards',
        }}
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
      success = false,
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
    // success takes precedence over loading for what is rendered.
    const state: 'success' | 'loading' | 'idle' = success
      ? 'success'
      : loading
        ? 'loading'
        : 'idle'
    // The raised variants also lift on hover; flat variants (ghost/danger) do not.
    const lifts = variant === 'primary' || variant === 'secondary' || variant === 'auth'

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
        whileHover={
          isDisabled || shouldReduceMotion || !lifts ? undefined : { y: -1 }
        }
        whileTap={
          isDisabled || shouldReduceMotion ? undefined : { scale: 0.975 }
        }
        transition={{ type: 'spring', stiffness: 400, damping: 26, mass: 0.7 }}
        className={cn(
          'relative inline-flex items-center justify-center font-heading font-semibold',
          'rounded-sm cursor-pointer select-none',
          // Colour + elevation move on the shared motion contract (--ease-out /
          // --dur-fast); transform (hover-lift, press-scale) stays framer-driven.
          'transition-[color,background-color,border-color,box-shadow,opacity]',
          '[transition-timing-function:var(--ease-out)] [transition-duration:var(--dur-fast)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          variantStyles[variant],
          variantShadow[variant],
          sizeStyles[size],
          // On success, morph the surface to the success token.
          state === 'success' && '!bg-success !text-white',
          fullWidth && 'w-full',
          isDisabled && 'opacity-50 cursor-not-allowed pointer-events-none',
          className,
        )}
      >
        {state === 'loading' ? (
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
        ) : state === 'success' ? (
          <>
            <DrawnCheck
              className={cn(
                size === 'sm' && 'w-4 h-4',
                size === 'md' && 'w-[18px] h-[18px]',
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
