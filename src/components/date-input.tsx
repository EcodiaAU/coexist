import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/input'

interface DateInputProps {
  label?: string
  /** ISO date string (YYYY-MM-DD) or empty string */
  value: string
  /** Receives ISO date string (YYYY-MM-DD) or empty string when invalid */
  onChange: (isoDate: string) => void
  required?: boolean
  helperText?: string
  error?: string
  autoComplete?: string
  /** Earliest acceptable ISO date (inclusive) */
  min?: string
  /** Latest acceptable ISO date (inclusive) */
  max?: string
  className?: string
}

function isoToDisplay(iso: string): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return ''
  return `${m[3]}/${m[2]}/${m[1]}`
}

function displayToIso(display: string): string | null {
  const cleaned = display.replace(/[^\d]/g, '')
  if (cleaned.length !== 8) return null
  const dd = cleaned.slice(0, 2)
  const mm = cleaned.slice(2, 4)
  const yyyy = cleaned.slice(4, 8)
  const day = parseInt(dd, 10)
  const month = parseInt(mm, 10)
  const year = parseInt(yyyy, 10)
  if (year < 1900 || year > 9999) return null
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null
  }
  return `${yyyy}-${mm}-${dd}`
}

function formatAsTyped(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

/**
 * Cross-platform date input that lets users type DD/MM/YYYY (Australian
 * format) on every platform. Replaces type="date" which renders an opaque
 * native picker on Android with no keyboard fallback - the user has to
 * scroll year-by-year to reach a 1990s DOB, which our charity volunteers
 * reported as a hard blocker (2026-05-16 feedback from Jade).
 *
 * Stores ISO (YYYY-MM-DD) externally, displays DD/MM/YYYY internally.
 */
export function DateInput({
  label,
  value,
  onChange,
  required,
  helperText,
  error,
  autoComplete,
  min,
  max,
  className,
}: DateInputProps) {
  const [display, setDisplay] = useState(() => isoToDisplay(value))
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    const next = isoToDisplay(value)
    if (next !== display && (value || !display)) {
      setDisplay(next)
    }
  }, [value])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const formatted = formatAsTyped(e.currentTarget.value)
      setDisplay(formatted)
      const iso = displayToIso(formatted)
      if (iso) {
        if (min && iso < min) {
          onChange('')
          return
        }
        if (max && iso > max) {
          onChange('')
          return
        }
        onChange(iso)
      } else {
        onChange('')
      }
    },
    [onChange, min, max],
  )

  const handleBlur = useCallback(() => {
    setTouched(true)
  }, [])

  const localError =
    error ??
    (touched && display.replace(/[^\d]/g, '').length > 0 && !displayToIso(display)
      ? 'Enter a valid date (DD/MM/YYYY)'
      : undefined)

  return (
    <Input
      type="text"
      label={label}
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder="DD/MM/YYYY"
      autoComplete={autoComplete}
      required={required}
      helperText={helperText}
      error={localError}
      maxLength={10}
      inputMode="numeric"
      pattern="[0-9/]*"
      enterKeyHint="next"
      className={className}
    />
  )
}
