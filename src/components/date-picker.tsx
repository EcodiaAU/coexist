import { useId, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Calendar, Clock } from 'lucide-react'
import { cn } from '@/lib/cn'
import { utcIsoToWallClock, wallClockToUtcIso } from '@/lib/date-format'

type DatePickerMode = 'date' | 'time' | 'datetime'

interface DatePickerProps {
  value: Date | null
  onChange: (date: Date | null) => void
  placeholder?: string
  label?: string
  error?: string
  min?: Date
  max?: Date
  mode?: DatePickerMode
  className?: string
}

/**
 * Floating-local time (Tate 2026-05-25 + 2026-05-26): events have no
 * timezone. A Date passed in or out of this picker encodes a wall-clock
 * as UTC - `Date('2026-05-07T15:00Z')` means "3pm 7 May" for every
 * viewer in every device timezone. The picker never converts through
 * any IANA zone, so a Brisbane Jess picking "3pm 7 May" and a Perth
 * Kurt viewing the same event both see exactly "3pm 7 May" - no drift,
 * no +10h surprise into the next day.
 *
 * The picker previously took a `timeZone` prop. With a non-empty value
 * its trigger-button preview re-rendered the wall-clock-as-UTC Date
 * through Intl.DateTimeFormat({ timeZone: ... }), which added the host
 * tz offset on top of the already-baked wall-clock - so a Brisbane
 * Jess picking 3pm 7 May saw the button update to "1am 8 May" (3pm UTC
 * viewed in Sydney). The prop is gone; every path below is UTC-locked.
 */
function formatDate(date: Date, mode: DatePickerMode): string {
  const options: Intl.DateTimeFormatOptions = { timeZone: 'UTC' }

  if (mode === 'date' || mode === 'datetime') {
    options.year = 'numeric'
    options.month = 'long'
    options.day = 'numeric'
  }
  if (mode === 'time' || mode === 'datetime') {
    options.hour = 'numeric'
    options.minute = '2-digit'
  }

  return new Intl.DateTimeFormat(undefined, options).format(date)
}

function toInputType(mode: DatePickerMode): string {
  switch (mode) {
    case 'date':
      return 'date'
    case 'time':
      return 'time'
    case 'datetime':
      return 'datetime-local'
  }
}

function dateToInputValue(date: Date, mode: DatePickerMode): string {
  if (mode === 'datetime') {
    return utcIsoToWallClock(date.toISOString())
  }
  if (mode === 'date') {
    const y = date.getUTCFullYear()
    const m = String(date.getUTCMonth() + 1).padStart(2, '0')
    const d = String(date.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  // mode === 'time'
  const h = String(date.getUTCHours()).padStart(2, '0')
  const min = String(date.getUTCMinutes()).padStart(2, '0')
  return `${h}:${min}`
}

function inputValueToDate(value: string, mode: DatePickerMode): Date | null {
  if (!value) return null

  if (mode === 'time') {
    // Time-only: encode HH:mm on today's UTC date so .getUTCHours
    // round-trips. Consumers reading the result only care about
    // hour/minute, so the date slice is arbitrary.
    const [h, m] = value.split(':').map(Number)
    if (Number.isNaN(h) || Number.isNaN(m)) return null
    const d = new Date()
    d.setUTCHours(h, m, 0, 0)
    return d
  }

  if (mode === 'datetime') {
    try {
      return new Date(wallClockToUtcIso(value))
    } catch {
      return null
    }
  }

  // mode === 'date': parse YYYY-MM-DD as UTC midnight so .getUTCDate
  // round-trips on the host wall-clock day.
  const parsed = new Date(value + 'T00:00:00.000Z')
  return isNaN(parsed.getTime()) ? null : parsed
}

export function DatePicker({
  value,
  onChange,
  placeholder,
  label,
  error,
  min,
  max,
  mode = 'date',
  className,
}: DatePickerProps) {
  const id = useId()
  const errorId = `${id}-error`
  const inputRef = useRef<HTMLInputElement>(null)
  const shouldReduceMotion = useReducedMotion()

  const inputType = toInputType(mode)

  const defaultPlaceholder =
    placeholder ??
    (mode === 'date'
      ? 'Select date'
      : mode === 'time'
        ? 'Select time'
        : 'Select date & time')

  const handleTriggerClick = () => {
    inputRef.current?.showPicker?.()
    inputRef.current?.focus()
    inputRef.current?.click()
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = inputValueToDate(e.target.value, mode)
    onChange(date)
  }

  const IconComponent = mode === 'time' ? Clock : Calendar

  return (
    <div data-eos-id="src/components/date-picker.tsx#0" data-eos-v="2" className={cn('w-full', className)}>
      {label && (
        <label data-eos-id="src/components/date-picker.tsx#1"
          htmlFor={id}
          className="block mb-1.5 text-sm font-medium text-neutral-900"
        >
          {label}
        </label>
      )}

      <div data-eos-id="src/components/date-picker.tsx#2" className="relative">
        {/* Visible trigger button */}
        <button data-eos-id="src/components/date-picker.tsx#3"
          type="button"
          onClick={handleTriggerClick}
          aria-label={label ?? defaultPlaceholder}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            'flex items-center w-full rounded-sm bg-surface-3 px-4 py-3 min-h-12',
            'text-[16px] leading-normal text-left',
            'cursor-pointer select-none',
            'transition-transform duration-150 active:scale-[0.98]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2',
            error
              ? 'ring-2 ring-error'
              : 'hover:bg-neutral-100 hover:shadow-sm',
          )}
        >
          <IconComponent data-eos-id="src/components/date-picker.tsx#4"
            size={18}
            className="shrink-0 mr-3 text-neutral-400"
            aria-hidden="true"
          />
          <span data-eos-id="src/components/date-picker.tsx#5"
            className={cn(
              'flex-1 truncate',
              value ? 'text-neutral-900' : 'text-neutral-400',
            )}
          >
            {value ? formatDate(value, mode) : defaultPlaceholder}
          </span>
        </button>

        {/* Hidden native input */}
        <input data-eos-id="src/components/date-picker.tsx#6"
          ref={inputRef}
          id={id}
          type={inputType}
          value={value ? dateToInputValue(value, mode) : ''}
          onChange={handleChange}
          min={min ? dateToInputValue(min, mode) : undefined}
          max={max ? dateToInputValue(max, mode) : undefined}
          aria-label={label ?? defaultPlaceholder}
          aria-invalid={!!error}
          tabIndex={-1}
          className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
        />
      </div>

      {/* Error text */}
      <AnimatePresence data-eos-id="src/components/date-picker.tsx#7" mode="wait">
        {error && (
          <motion.p data-eos-id="src/components/date-picker.tsx#8"
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
        )}
      </AnimatePresence>
    </div>
  )
}
