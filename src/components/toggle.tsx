import { useId } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'

const sizeConfig = {
  sm: {
    track: 'w-9 h-5',
    thumb: 'w-4 h-4',
    translateOn: 17,
    translateOff: 2,
  },
  md: {
    track: 'w-11 h-6',
    thumb: 'w-5 h-5',
    translateOn: 21,
    translateOff: 2,
  },
} as const

type ToggleSize = keyof typeof sizeConfig

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  description?: string
  size?: ToggleSize
  className?: string
}

export function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  size = 'md',
  className,
}: ToggleProps) {
  const id = useId()
  const descriptionId = `${id}-desc`
  const shouldReduceMotion = useReducedMotion()
  const config = sizeConfig[size]

  return (
    <div data-eos-id="src/components/toggle.tsx#0" data-eos-v="2" className={cn('flex items-start gap-3 min-h-11', className)}>
      {/* Label area (left side) */}
      {(label || description) && (
        <div data-eos-id="src/components/toggle.tsx#1" className="flex-1 min-w-0 select-none">
          {label && (
            <label data-eos-id="src/components/toggle.tsx#2"
              id={id}
              htmlFor={`${id}-switch`}
              className={cn(
                'block text-sm font-medium text-neutral-900 cursor-pointer',
                disabled && 'opacity-50 cursor-not-allowed',
              )}
            >
              {label}
            </label>
          )}
          {description && (
            <p data-eos-id="src/components/toggle.tsx#3"
              id={descriptionId}
              className={cn(
                'text-caption text-neutral-500 mt-0.5',
                disabled && 'opacity-50',
              )}
            >
              {description}
            </p>
          )}
        </div>
      )}

      {/* Switch - outer tap area wraps the visual track for easy touch */}
      <button data-eos-id="src/components/toggle.tsx#4"
        id={`${id}-switch`}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={label ? id : undefined}
        aria-describedby={description ? descriptionId : undefined}
        aria-label={!label ? 'Toggle' : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex items-center justify-center shrink-0 cursor-pointer',
          'min-w-11 min-h-11',
          'transition-transform duration-150 active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        )}
      >
        <span data-eos-id="src/components/toggle.tsx#5"
          className={cn(
            'relative inline-flex shrink-0 rounded-full',
            'transition-colors duration-150',
            config.track,
            checked ? 'bg-primary-500' : 'bg-primary-200',
          )}
        >
          <motion.span data-eos-id="src/components/toggle.tsx#6"
            aria-hidden="true"
            className={cn(
              'absolute top-1/2 block rounded-full bg-white shadow-sm',
              config.thumb,
            )}
            initial={false}
            animate={{
              x: checked ? config.translateOn : config.translateOff,
              y: '-50%',
            }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 420, damping: 28, mass: 0.6 }
            }
          />
        </span>
      </button>
    </div>
  )
}
