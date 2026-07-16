import {
  type ReactNode,
  forwardRef,
  useState,
  useId,
  useRef,
  useCallback,
  useEffect,
} from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Search, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'

type InputType = 'text' | 'email' | 'password' | 'search' | 'textarea' | 'date' | 'time' | 'tel' | 'number'

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
  inputMode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search'
  enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send'
  autoCapitalize?: 'off' | 'none' | 'on' | 'sentences' | 'words' | 'characters'
  pattern?: string
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
    inputMode,
    enterKeyHint,
    autoCapitalize,
    pattern,
  },
  ref,
) {
  const id = useId()
  const errorId = `${id}-error`
  const helperId = `${id}-helper`
  const shouldReduceMotion = useReducedMotion()

  const [focused, setFocused] = useState(false)
  const [filled, setFilled] = useState(() => !!(value ?? defaultValue))
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

  // Track IME composition state to avoid clobbering the Android GBoard /
  // Samsung Keyboard composing buffer with React re-renders. Without the full
  // hybrid-controlled pattern below, ANY ancestor re-render (sibling form
  // state, useReducedMotion media-query change, animations finishing,
  // unrelated query refetch) mid-composition triggers React reconciliation
  // against the `value=` prop, and React writes the stale parent state back
  // into the DOM input, wiping the IME's in-progress composing buffer. Net
  // user-visible: "I'm pressing keys but nothing types" on the highlights
  // free-text box, log-impact species fields, signup name, every <Input>-
  // using surface. Reported 2026-06-04 on 1.8.27 even after the 17865dd
  // guard-first race fix (which only handled <Input>'s OWN setState as the
  // clobbering re-render, not ambient parent re-renders).
  const composingRef = useRef(false)

  // IME-safe value sync. The DOM <input>/<textarea> is UNCONTROLLED (we render
  // defaultValue, never value=), so React never writes the element's value
  // during an in-flight IME composition - that write is exactly what drops typed
  // characters on Android Chromium WebView. GBoard composes text/email fields
  // (so they broke); password fields don't compose (so only they worked). We
  // instead mirror the parent's controlled `value` into the DOM imperatively,
  // and ONLY when it genuinely differs AND we are not composing. During normal
  // typing the DOM already holds the right text, so this never fires; it runs
  // only for true external changes (prefills, programmatic resets). Deps are
  // [value] alone - NOT [value, filled] - because the earlier `filled`
  // dependency (63e4fe8) re-ran the sync on every keystroke and clobbered the
  // composing buffer. Origin: Tate 2026-06-09, after the fully-controlled
  // attempt (685d8f4) reintroduced the clobber via React writing value on every
  // composition render.
  useEffect(() => {
    const el = internalRef.current
    if (!el) return
    if (composingRef.current) return
    if (value === undefined) return
    if (el.value !== value) {
      el.value = value
      setFilled(value.length > 0)
    }
  }, [value])

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
      setFilled(val.length > 0)
      onBlur?.(e)
    },
    [onBlur],
  )

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      composingRef.current = false
      const target = e.currentTarget
      setFilled(target.value.length > 0)
      // Flush the finalised value upward (some browsers don't emit input/change
      // after compositionend).
      onChange?.({
        ...e,
        target,
        currentTarget: target,
      } as unknown as React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>)
    },
    [onChange],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const val = e.currentTarget.value
      // Do NOT propagate upstream mid-composition; compositionEnd will flush.
      // The DOM owns its value (uncontrolled), so there is nothing to keep in
      // sync here - we just gate the upward onChange on composition state.
      if (composingRef.current) return
      setFilled(val.length > 0)
      onChange?.(e)
    },
    [onChange],
  )

  const isDate = type === 'date'
  const isTime = type === 'time'
  // Native date/time inputs always show their picker affordance, so the
  // floating label needs to start in the floated position to avoid colliding
  // with the picker glyph.
  const isPicker = isDate || isTime
  const isCompact = compact && !label
  const isFloating = focused || filled || isPicker
  const isTextarea = type === 'textarea'
  const isSearch = type === 'search'
  const isPassword = type === 'password'
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type

  const sharedClasses = cn(
    'peer w-full rounded-sm px-4 box-border',
    // Native date/time inputs on iOS+Android render their picker button at
    // intrinsic width, which can push the field past its container.
    // appearance-none strips the platform chrome so the field obeys w-full
    // like a regular text input.
    isPicker && 'appearance-none min-w-0 max-w-full',
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
    <div data-eos-id="src/components/input.tsx#0" className={cn('w-full', className)}>
      <div data-eos-id="src/components/input.tsx#1" className="relative">
        {/* Search icon */}
        {isSearch && (
          <Search data-eos-id="src/components/input.tsx#2"
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
            aria-hidden="true"
          />
        )}

        {/* Custom icon */}
        {icon && !isSearch && (
          <span data-eos-id="src/components/input.tsx#3" className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
            {icon}
          </span>
        )}

        {isTextarea ? (
          <textarea data-eos-id="src/components/input.tsx#4"
            ref={setRef as React.Ref<HTMLTextAreaElement>}
            id={id}
            name={name}
            rows={rows}
            // Uncontrolled (defaultValue + imperative sync, see effect above) so
            // React never writes value mid-IME-composition and drops characters.
            defaultValue={value ?? defaultValue ?? ''}
            onChange={handleChange}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
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
            inputMode={inputMode}
            enterKeyHint={enterKeyHint}
            autoCapitalize={autoCapitalize}
            className={cn(sharedClasses, 'resize-y', isCompact ? 'min-h-[80px]' : 'min-h-[100px]')}
          />
        ) : (
          <input data-eos-id="src/components/input.tsx#5"
            ref={setRef as React.Ref<HTMLInputElement>}
            id={id}
            type={isTextarea ? undefined : inputType}
            name={name}
            // Uncontrolled (defaultValue + imperative sync, see effect above) so
            // React never writes value mid-IME-composition and drops characters.
            defaultValue={value ?? defaultValue ?? ''}
            onChange={handleChange}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
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
            inputMode={inputMode}
            enterKeyHint={enterKeyHint}
            autoCapitalize={autoCapitalize}
            pattern={pattern}
            className={sharedClasses}
          />
        )}

        {/* Floating label */}
        {!isCompact && (
          <motion.label data-eos-id="src/components/input.tsx#6"
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
            {required && <span data-eos-id="src/components/input.tsx#7" className="text-error ml-0.5">*</span>}
          </motion.label>
        )}

        {/* Password toggle */}
        {isPassword && (
          <button data-eos-id="src/components/input.tsx#8"
            type="button"
            onClick={() => setShowPassword((p) => !p)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className={cn(
              'absolute right-1 top-1/2 -translate-y-1/2',
              'min-w-11 min-h-11 flex items-center justify-center',
              'rounded-sm text-neutral-400 hover:text-neutral-700',
              'cursor-pointer select-none',
              'active:scale-[0.97] transition-transform duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
            )}
          >
            {showPassword ? <EyeOff data-eos-id="src/components/input.tsx#9" size={18} /> : <Eye data-eos-id="src/components/input.tsx#10" size={18} />}
          </button>
        )}
      </div>

      {/* Error / helper text */}
      <AnimatePresence data-eos-id="src/components/input.tsx#11" mode="wait">
        {error ? (
          <motion.p data-eos-id="src/components/input.tsx#12"
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
          <motion.p data-eos-id="src/components/input.tsx#13"
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
