import { type ReactNode, useId, useRef, useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/cn'

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: ReactNode
  description?: string
  indeterminate?: boolean
  className?: string
}

export function Checkbox({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  indeterminate = false,
  className,
}: CheckboxProps) {
  const id = useId()
  const descriptionId = `${id}-desc`
  const inputRef = useRef<HTMLInputElement>(null)
  const shouldReduceMotion = useReducedMotion()

  // Sync indeterminate property (not available as HTML attribute)
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate
    }
  }, [indeterminate])

  const isCheckedOrIndeterminate = checked || indeterminate

  return (
    <label data-eos-id="src/components/checkbox.tsx#0"
      className={cn(
        'relative flex items-start gap-3 min-h-11 cursor-pointer select-none active:scale-[0.98] transition-transform duration-150',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      {/* Hidden native input */}
      <input data-eos-id="src/components/checkbox.tsx#1"
        ref={inputRef}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        aria-label={!label ? 'Checkbox' : undefined}
        aria-describedby={description ? descriptionId : undefined}
        className="absolute opacity-0 w-0 h-0 peer"
      />

      {/* Visual checkbox */}
      <span data-eos-id="src/components/checkbox.tsx#2"
        aria-hidden="true"
        className={cn(
          'relative flex items-center justify-center shrink-0',
          'w-5 h-5 mt-0.5 rounded',
          'border-2 transition-colors duration-150',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-primary-400 peer-focus-visible:ring-offset-2',
          isCheckedOrIndeterminate
            ? 'bg-primary-800 border-primary-600'
            : 'bg-white border-neutral-300',
        )}
      >
        <AnimatePresence data-eos-id="src/components/checkbox.tsx#3" mode="wait">
          {indeterminate ? (
            <motion.span data-eos-id="src/components/checkbox.tsx#4"
              key="indeterminate"
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.1 }}
            >
              <Minus data-eos-id="src/components/checkbox.tsx#5" size={14} className="text-white" strokeWidth={3} />
            </motion.span>
          ) : checked ? (
            <motion.span data-eos-id="src/components/checkbox.tsx#6"
              key="checked"
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.1 }}
            >
              <Check data-eos-id="src/components/checkbox.tsx#7" size={14} className="text-white" strokeWidth={3} />
            </motion.span>
          ) : null}
        </AnimatePresence>
      </span>

      {/* Label + description */}
      {(label || description) && (
        <div data-eos-id="src/components/checkbox.tsx#8" className="min-w-0">
          {label && (
            <span data-eos-id="src/components/checkbox.tsx#9" className="block text-sm font-medium text-primary-800">
              {label}
            </span>
          )}
          {description && (
            <span data-eos-id="src/components/checkbox.tsx#10"
              id={descriptionId}
              className="block text-caption text-primary-400 mt-0.5"
            >
              {description}
            </span>
          )}
        </div>
      )}
    </label>
  )
}
