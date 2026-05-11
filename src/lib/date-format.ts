/**
 * Centralised date and time formatting utilities.
 */

/** "Wed 2 Apr" */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/** "2 Apr 2025" (year always shown) */
export function formatDateLong(dateStr: string, showYear = true): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: showYear ? 'numeric' : undefined,
  })
}

/** "2 Apr" (no weekday, no year) */
export function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
  })
}

/** "3:45 pm" */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}

/** Relative: "Just now", "5m ago", "2h ago", "3d ago", or falls back to formatDateLong */
export function formatRelative(dateStr: string): string {
  const date = new Date(dateStr)
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return formatDateLong(dateStr, diff > 31536000)
}

/** Days from now until dateStr (negative = past) */
export function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

/**
 * "YYYY-MM-DD" for an absolute timestamp interpreted in Australia/Sydney
 * timezone. Used to compare an event's local date to "today" in AEST,
 * matching the BE check-in-window guard
 * (supabase migrations/20260509000000_event_day_check_in_window.sql)
 * which uses `(date AT TIME ZONE 'Australia/Sydney')::date` on both
 * sides.
 *
 * en-CA locale is used as the cheapest way to coerce a Date through
 * Intl.DateTimeFormat into ISO YYYY-MM-DD shape.
 */
export function localDateAEST(date: Date | string = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })
}

/**
 * True iff `eventDateStartIso` (an events.date_start timestamptz string)
 * falls on the same calendar day as "now" in Australia/Sydney. Mirrors
 * the BE day-of check-in window guard exactly.
 */
export function isEventTodayAEST(eventDateStartIso: string | null | undefined): boolean {
  if (!eventDateStartIso) return false
  return localDateAEST(eventDateStartIso) === localDateAEST()
}

/**
 * True iff the "Tap to Sign In" button should be visible on the Next-Event
 * card.
 *
 * Visibility window:
 *   - Opens:  AEST calendar-day start of the event's date (midnight AEST on
 *             event day — this is when the sign-in window opens, matching the
 *             BE enforce_event_day_check_in_window trigger).
 *   - Closes: 2 hours after `eventDateStartIso` (giving late arrivals a
 *             reasonable window to sign in after the activity begins).
 *
 * Outside this window (far-future events, or >2h after start) the button
 * is hidden. Mirrors Tate's spec: "sign-in window opens AND for 2 hours
 * after event start" (conductor directive, 11 May 2026).
 *
 * @param eventDateStartIso - events.date_start ISO timestamptz string
 */
export function isSignInButtonVisible(eventDateStartIso: string | null | undefined): boolean {
  if (!eventDateStartIso) return false
  if (!isEventTodayAEST(eventDateStartIso)) return false
  const startMs = new Date(eventDateStartIso).getTime()
  return Date.now() <= startMs + 2 * 60 * 60 * 1000
}

// ---------------------------------------------------------------------------
// Aliases kept for call-site compatibility
// ---------------------------------------------------------------------------

/** @deprecated use formatDate */
export const formatEventDate = formatDate
/** @deprecated use formatDate */
export const formatCardDate = formatDate
/** @deprecated use formatTime */
export const formatEventTime = formatTime
/** @deprecated use formatTime */
export const formatCardTime = formatTime
/** @deprecated use formatDateLong */
export const formatDateTime = formatDateLong
