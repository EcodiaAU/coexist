/**
 * Centralised date and time formatting utilities.
 *
 * Floating local time model (Tate 2026-05-25)
 * -------------------------------------------
 * Events store a wall-clock (`9am 15 Jun 2026`), NOT an absolute UTC
 * instant. The wall-clock is stamped into the timestamptz column with a
 * UTC offset (e.g. `2026-06-15T09:00:00Z`) but is read back verbatim by
 * every renderer regardless of viewer timezone. A Perth admin's 9am
 * event reads as "9:00 am" to a Sydney viewer, a Perth viewer, and a
 * Bali viewer. Anyone outside the host's locale does two seconds of
 * mental math if they need to know their local equivalent.
 *
 * Practical consequence: every formatter below pins `timeZone: 'UTC'`
 * so the stored wall-clock comes back unchanged. The legacy `timeZone`
 * parameter on `formatDate/formatTime/...` is kept for source-level
 * back-compat with existing call sites but is ignored.
 */

const FLOATING_TZ = 'UTC'
const DEFAULT_TZ = FLOATING_TZ

/**
 * Legacy resolver. In the floating-local model the event's IANA tz is
 * irrelevant for display - the wall-clock is the wall-clock. Kept as a
 * stub so existing call sites continue to compile; returns the floating
 * tz unconditionally.
 */
export function eventTimezone(
  _event?: { timezone?: string | null } | null,
  _collective?: { timezone?: string | null } | null,
  _fallback?: string,
): string {
  return FLOATING_TZ
}

/** "Wed 2 Apr" - the stored wall-clock, never tz-converted. */
export function formatDate(dateStr: string, _legacyTz?: string): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: FLOATING_TZ,
  })
}

/** "2 Apr 2025" (year always shown) */
export function formatDateLong(dateStr: string, showYear = true, _legacyTz?: string): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: showYear ? 'numeric' : undefined,
    timeZone: FLOATING_TZ,
  })
}

/** "2 Apr" (no weekday, no year) */
export function formatDateShort(dateStr: string, _legacyTz?: string): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: FLOATING_TZ,
  })
}

/** "3:45 pm" - the stored wall-clock, never tz-converted. */
export function formatTime(date: Date | string, _legacyTz?: string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: FLOATING_TZ,
  }).format(d)
}

/**
 * Legacy timezone label helper. Always returns empty in the floating-
 * local model - there is no tz to disambiguate, the wall-clock is the
 * wall-clock for every viewer.
 */
export function timezoneLabel(_timeZone?: string | null, _ref?: Date | string): string {
  return ''
}

/** "Sat, 14 Jun 2026, 9:00 am" - long-form event datetime in the
 *  stored wall-clock. Use anywhere an event time is rendered (cards,
 *  emails, push notifications, review panels). */
export function formatEventLong(iso: string, _legacyTz?: string | null): string {
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: FLOATING_TZ,
  }).format(new Date(iso))
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

/** Days from now until dateStr (negative = past). */
export function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

/**
 * "YYYY-MM-DD" for an absolute timestamp.
 *
 * Floating-local model: the stored wall-clock IS the calendar date,
 * regardless of viewer tz. `localDateIn(_, iso)` returns the UTC date
 * slice of the stored value (= the host's calendar day). When called
 * without `date`, returns the viewer's local calendar date (used for
 * "today" comparisons - the viewer's own clock decides whether the
 * host's wall-clock date is today/tomorrow/past).
 *
 * The first param is the LEGACY timezone (kept for back-compat); the
 * date-portion is always extracted in UTC so the host's wall-clock day
 * is preserved.
 */
export function localDateIn(
  _legacyTz: string,
  date?: Date | string,
): string {
  if (date === undefined) {
    // "today" in the VIEWER'S local calendar
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const d = typeof date === 'string' ? new Date(date) : date
  // host's stored wall-clock day = UTC date slice
  return d.toLocaleDateString('en-CA', { timeZone: FLOATING_TZ })
}

/**
 * True iff the event's stored calendar day matches the viewer's local
 * calendar day. Floating-local: the host's "15 Jun 2026 9am" is "today"
 * for any viewer whose phone clock says 15 Jun, regardless of tz.
 */
export function isEventToday(
  eventDateStartIso: string | null | undefined,
  _legacyTz?: string,
): boolean {
  if (!eventDateStartIso) return false
  return localDateIn(FLOATING_TZ, eventDateStartIso) === localDateIn(FLOATING_TZ)
}

/**
 * Day-of-event check-in CTA visibility (participant self / public QR).
 * Visible all of the host's calendar day, in the viewer's local clock.
 */
export function isSignInButtonVisible(
  eventDateStartIso: string | null | undefined,
  _legacyTz?: string,
): boolean {
  if (!eventDateStartIso) return false
  return isEventToday(eventDateStartIso)
}

/**
 * Leader/admin check-in window. Future blocked, event-day open,
 * past open until impact logged (post-event backfill window).
 *
 * "Event day" is the host's stored wall-clock calendar day; "today" is
 * the viewer's local calendar day. So a Sydney leader at 11pm AEST on
 * 15 Jun can still check in attendees for a 15 Jun Perth event because
 * both sides say 15 Jun; the same leader at 1am AEST on 16 Jun sees
 * the event drop into the backfill branch.
 */
export function isCheckInOpenForLeader(
  eventDateStartIso: string | null | undefined,
  _legacyTz: string,
  impactLogged: boolean,
): boolean {
  if (!eventDateStartIso) return false
  const eventDay = localDateIn(FLOATING_TZ, eventDateStartIso)
  const today = localDateIn(FLOATING_TZ)
  if (eventDay > today) return false // future: blocked
  if (eventDay === today) return true // event day: open
  return !impactLogged // past: open until impact logged
}

// ---------------------------------------------------------------------------
// datetime-local <-> ISO conversion
// ---------------------------------------------------------------------------

/**
 * Convert a wall-clock string (`YYYY-MM-DDTHH:mm`) into a UTC ISO
 * string. Floating-local: stamp the typed wall-clock directly into
 * UTC so `9am Perth typed in Vic` stores as `2026-06-15T09:00:00.000Z`
 * and reads back as "9am" for every viewer.
 *
 * Legacy `timeZone` param is ignored (kept for source-compat).
 */
export function wallClockToUtcIso(
  wallClock: string,
  _legacyTz?: string,
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wallClock)
  if (!m) throw new Error(`Invalid wall-clock value: ${wallClock}`)
  const [, ys, mos, ds, hs, mis] = m
  return `${ys}-${mos}-${ds}T${hs}:${mis}:00.000Z`
}

/**
 * Inverse of `wallClockToUtcIso`. Returns the UTC-slice wall-clock so
 * datetime-local inputs display exactly the host's typed value.
 */
export function utcIsoToWallClock(iso: string, _legacyTz?: string): string {
  const d = new Date(iso)
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const da = String(d.getUTCDate()).padStart(2, '0')
  const h = String(d.getUTCHours()).padStart(2, '0')
  const mi = String(d.getUTCMinutes()).padStart(2, '0')
  return `${y}-${mo}-${da}T${h}:${mi}`
}

// ---------------------------------------------------------------------------
// Aliases kept for call-site compatibility
// ---------------------------------------------------------------------------

/** @deprecated use formatDate(dateStr) */
export const formatEventDate = formatDate
/** @deprecated use formatDate(dateStr) */
export const formatCardDate = formatDate
/** @deprecated use formatTime(date) */
export const formatEventTime = formatTime
/** @deprecated use formatTime(date) */
export const formatCardTime = formatTime
/** @deprecated use formatDateLong(dateStr, true) */
export const formatDateTime = formatDateLong

/** @deprecated use localDateIn(_, date) */
export function localDateAEST(date: Date | string = new Date()): string {
  return localDateIn(FLOATING_TZ, date)
}
/** @deprecated use isEventToday(iso) */
export function isEventTodayAEST(eventDateStartIso: string | null | undefined): boolean {
  return isEventToday(eventDateStartIso)
}
