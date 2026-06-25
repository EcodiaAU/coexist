import { useId } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'

interface RadioOption {
  value: string
  label: string
  description?: string
}

interface RadioProps {
  options: RadioOption[]
  value?: string
  onChange: (value: string) => void
  name?: string
  disabled?: boolean
  className?: string
}

export function Radio({
  options,
  value,
  onChange,
  name,
  disabled = false,
  className,
}: RadioProps) {
  const groupId = useId()
  const radioName = name ?? groupId
  const shouldReduceMotion = useReducedMotion()

  return (
    <fieldset
      className={cn('space-y-2', className)}
      disabled={disabled}
      aria-label="Radio group"
    >
      {options.map((option) => {
        const optionId = `${groupId}-${option.value}`
        const descId = `${optionId}-desc`
        const isSelected = option.value === value

        return (
          <label
            key={option.value}
            htmlFor={optionId}
            className={cn(
              'flex items-start gap-3 cursor-pointer select-none',
              'rounded-sm min-h-11 active:scale-[0.98] transition-transform duration-150',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            {/* Hidden native radio */}
            <input
              id={optionId}
              type="radio"
              name={radioName}
              value={option.value}
              checked={isSelected}
              onChange={() => onChange(option.value)}
              disabled={disabled}
              aria-describedby={option.description ? descId : undefined}
              className="sr-only peer"
            />

            {/* Visual radio */}
            <span
              aria-hidden="true"
              className={cn(
                'relative flex items-center justify-center shrink-0',
                'w-5 h-5 mt-0.5 rounded-full',
                'border-2 transition-colors duration-150',
                'peer-focus-visible:ring-2 peer-focus-visible:ring-primary-400 peer-focus-visible:ring-offset-2',
                isSelected
                  ? 'border-primary-600'
                  : 'border-neutral-300',
              )}
            >
              {isSelected && (
                <motion.span
                  className="w-2.5 h-2.5 rounded-full bg-primary-800"
                  initial={shouldReduceMotion ? false : { scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 500, damping: 30 }
                  }
                />
              )}
            </span>

            {/* Label + description */}
            <div className="min-w-0">
              <span className="block text-sm font-medium text-primary-800">
                {option.label}
              </span>
              {option.description && (
                <span
                  id={descId}
                  className="block text-caption text-primary-400 mt-0.5"
                >
                  {option.description}
                </span>
              )}
            </div>
          </label>
        )
      })}
    </fieldset>
  )
}
