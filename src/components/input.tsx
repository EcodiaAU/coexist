import {
  type ReactNode,
  forwardRef,
  useState,
  useId,
  useRef,
  useCallback,
} from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Search, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'

type InputType = 'text' | 'email' | 'password' | 'search' | 'textarea' | 'date' | 'tel' | 'number'

export interface InputProps {
  type?: InputType
  label?: string
  compact?: boolean
  value?: string
  defaultValue?: string
  onChange?: React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>
  onBlur?: React.FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>
  onFocus?: React.FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>
  error?: string
  helperText?: string
  disabled?: boolean
  required?: boolean
  placeholder?: string
  name?: string
  autoComplete?: string
  rows?: number
  icon?: ReactNode
  className?: string
  /** Extra classes merged onto the <input>/<textarea> element itself (e.g. bg override). */
  inputClassName?: string
  /** Extra classes merged onto the floating label element. */
  labelClassName?: string
  'aria-label'?: string
  maxLength?: number
  max?: string
  min?: string
  step?: string
}

export const Input = forwardRef<
  HTMLInputElement | HTMLTextAreaElement,
  InputProps
>(function Input(
  {
    type = 'text',
    label,
    compact,
    value,
    defaultValue,
    onChange,
    onBlur,
    onFocus,
    error,
    helperText,
    disabled = false,
    required = false,
    placeholder,
    name,
    autoComplete,
    rows = 4,
    icon,
    className,
    inputClassName,
    labelClassName,
    'aria-label': ariaLabel,
    maxLength,
    max,
    min,
    step,
  },
  ref,
) {
  const id = useId()
  const errorId = `${id}-error`
  const helperId = `${id}-helper`
  const shouldReduceMotion = useReducedMotion()

  const [focused, setFocused] = useState(false)
  const [uncontrolledFilled, setUncontrolledFilled] = useState(
    () => !!(value ?? defaultValue),
  )
  const filled = value !== undefined ? value.length > 0 : uncontrolledFilled
  const [showPassword, setShowPassword] = useState(false)

  const internalRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  const setRef = useCallback(
    (node: HTMLInputElement | HTMLTextAreaElement | null) => {
      internalRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) (ref as React.MutableRefObject<typeof node>).current = node
    },
    [ref],
  )

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFocused(true)
      onFocus?.(e)
    },
    [onFocus],
  )

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFocused(false)
      const val = e.currentTarget.value
      setUncontrolledFilled(val.length > 0)
      onBlur?.(e)
    },
    [onBlur],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setUncontrolledFilled(e.currentTarget.value.length > 0)
      onChange?.(e)
    },
    [onChange],
  )

  const isDate = type === 'date'
  const isCompact = compact && !label
  const isFloating = focused || filled || isDate
  const isTextarea = type === 'textarea'
  const isSearch = type === 'search'
  const isPassword = type === 'password'
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type

  const sharedClasses = cn(
    'peer w-full rounded-lg px-4 box-border',
    // Native date inputs on iOS render their picker button at intrinsic
    // width, which can push the field past its container. appearance-none
    // strips the platform chrome so the field obeys w-full like a regular
    // text input.
    isDate && 'appearance-none min-w-0 max-w-full',
    isCompact ? 'py-3' : 'pt-7 pb-2',
    inputClassName ?? 'bg-surface-3',
    'text-[16px] leading-normal text-neutral-900',
    'placeholder:text-neutral-400',
    'outline-none transition-colors duration-150',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    (isSearch || icon) && 'pl-10',
    isPassword && 'pr-12',
    error
      ? 'ring-2 ring-error focus:ring-error'
      : 'focus:ring-2 focus:ring-primary-500',
  )

  const labelMotion = {
    initial: false as const,
    animate: {
      y: isFloating ? -2 : 10,
      scale: isFloating ? 0.75 : 1,
      originX: 0,
    },
    transition: shouldReduceMotion
      ? { duration: 0 }
      : { type: 'spring', stiffness: 400, damping: 30 },
  }

  const describedBy = [
    error ? errorId : null,
    helperText && !error ? helperId : null,
  ]
    .filter(Boolean)
    .join(' ') || undefined

  return (
    <div className={cn('w-full', className)}>
      <div className="relative">
        {/* Search icon */}
        {isSearch && (
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
            aria-hidden="true"
          />
        )}

        {/* Custom icon */}
        {icon && !isSearch && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
            {icon}
          </span>
        )}

        {isTextarea ? (
          <textarea
            ref={setRef as React.Ref<HTMLTextAreaElement>}
            id={id}
            name={name}
            rows={rows}
            value={value}
            defaultValue={defaultValue}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            disabled={disabled}
            required={required}
            autoComplete={autoComplete}
            placeholder={isCompact ? placeholder : focused ? placeholder : undefined}
            aria-label={ariaLabel}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            maxLength={maxLength}
            className={cn(sharedClasses, 'resize-y', isCompact ? 'min-h-[80px]' : 'min-h-[100px]')}
          />
        ) : (
          <input
            ref={setRef as React.Ref<HTMLInputElement>}
            id={id}
            type={isTextarea ? undefined : inputType}
            name={name}
            value={value}
            defaultValue={defaultValue}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            disabled={disabled}
            required={required}
            autoComplete={autoComplete}
            placeholder={isCompact ? placeholder : focused ? placeholder : undefined}
            aria-label={ariaLabel}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            maxLength={maxLength}
            max={max}
            min={min}
            step={step}
            className={sharedClasses}
          />
        )}

        {/* Floating label */}
        {!isCompact && (
          <motion.label
            htmlFor={id}
            {...(labelMotion as Record<string, unknown>)}
            className={cn(
              'absolute left-4 top-3 pointer-events-none',
              'text-[16px] leading-normal origin-left',
              (isSearch || icon) && 'left-10',
              error ? 'text-error' : focused ? 'text-primary-500' : 'text-neutral-500',
              labelClassName,
            )}
          >
            {label}
            {required && <span className="text-error ml-0.5">*</span>}
          </motion.label>
        )}

        {/* Password toggle */}
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((p) => !p)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className={cn(
              'absolute right-1 top-1/2 -translate-y-1/2',
              'min-w-11 min-h-11 flex items-center justify-center',
              'rounded-xl text-neutral-400 hover:text-neutral-700',
              'cursor-pointer select-none',
              'active:scale-[0.97] transition-transform duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
            )}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>

      {/* Error / helper text */}
      <AnimatePresence mode="wait">
        {error ? (
          <motion.p
            key="error"
            id={errorId}
            role="alert"
            initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="mt-1.5 text-caption text-error"
          >
            {error}
          </motion.p>
        ) : helperText ? (
          <motion.p
            key="helper"
            id={helperId}
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="mt-1.5 text-caption text-neutral-500"
          >
            {helperText}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  )
})
