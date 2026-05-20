/**
 * Centralised date and time formatting utilities.
 *
 * Timezone model
 * --------------
 * Events belong to a collective which has an IANA timezone (e.g.
 * `Australia/Perth`). An event may override with its own timezone.
 * All event-facing formatting and day-of-event checks must use the
 * event's *effective* timezone, NOT the viewer's local browser zone -
 * otherwise a member in Sydney viewing a Perth event would see the
 * Perth wall-clock shifted by 2 hours.
 *
 * Resolve the effective timezone at the call site with
 * `eventTimezone(event, collective)`; pass it to the formatters below.
 */

const DEFAULT_TZ = 'Australia/Sydney'

/**
 * Resolves an event's effective IANA timezone.
 * Order: event.timezone override > collective.timezone > fallback.
 */
export function eventTimezone(
  event: { timezone?: string | null } | null | undefined,
  collective: { timezone?: string | null } | null | undefined,
  fallback: string = DEFAULT_TZ,
): string {
  return event?.timezone ?? collective?.timezone ?? fallback
}

/** "Wed 2 Apr" - formatted in `timeZone` if provided, else viewer-local. */
export function formatDate(dateStr: string, timeZone?: string): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  })
}

/** "2 Apr 2025" (year always shown) */
export function formatDateLong(dateStr: string, showYear = true, timeZone?: string): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: showYear ? 'numeric' : undefined,
    timeZone,
  })
}

/** "2 Apr" (no weekday, no year) */
export function formatDateShort(dateStr: string, timeZone?: string): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone,
  })
}

/** "3:45 pm" - formatted in `timeZone` if provided. */
export function formatTime(date: Date | string, timeZone?: string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(d)
}

/**
 * Short timezone label for display next to a time, e.g. "AWST", "AEDT".
 * Returns empty string if the zone matches the viewer's local zone (no
 * need to disambiguate). Falls back to the IANA name on locales that
 * don't surface a short name.
 */
export function timezoneLabel(timeZone: string | null | undefined, ref: Date | string = new Date()): string {
  if (!timeZone) return ''
  const viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (timeZone === viewerTz) return ''
  const d = typeof ref === 'string' ? new Date(ref) : ref
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone, timeZoneName: 'short' }).formatToParts(d)
  const tz = parts.find((p) => p.type === 'timeZoneName')?.value
  return tz ?? timeZone
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
 * "YYYY-MM-DD" for an absolute timestamp interpreted in `timeZone`. Used
 * to compare an event's local date to "today" in the event's zone,
 * matching the BE check-in-window guards which use
 * `(date AT TIME ZONE event_tz)::date` on both sides.
 *
 * en-CA locale is the cheapest way to coerce a Date through
 * Intl.DateTimeFormat into ISO YYYY-MM-DD shape.
 */
export function localDateIn(
  timeZone: string,
  date: Date | string = new Date(),
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-CA', { timeZone })
}

/**
 * True iff `eventDateStartIso` falls on the same calendar day as "now"
 * in the given timezone. Mirrors the BE day-of check-in window guard.
 */
export function isEventToday(
  eventDateStartIso: string | null | undefined,
  timeZone: string,
): boolean {
  if (!eventDateStartIso) return false
  return localDateIn(timeZone, eventDateStartIso) === localDateIn(timeZone)
}

/**
 * True iff the "Tap to Sign In" button should be visible on the
 * Next-Event card.
 *
 * Visibility window:
 *   - Opens:  calendar-day start of the event's date in the event's
 *             timezone (matching the BE
 *             enforce_event_day_check_in_window trigger).
 *   - Closes: 2 hours after `eventDateStartIso`.
 *
 * @param eventDateStartIso events.date_start timestamptz ISO string
 * @param timeZone          the event's effective IANA timezone
 */
export function isSignInButtonVisible(
  eventDateStartIso: string | null | undefined,
  timeZone: string,
): boolean {
  if (!eventDateStartIso) return false
  if (!isEventToday(eventDateStartIso, timeZone)) return false
  const startMs = new Date(eventDateStartIso).getTime()
  return Date.now() <= startMs + 2 * 60 * 60 * 1000
}

/**
 * True iff a LEADER/ADMIN may check attendees in (or out) for this event.
 *
 * This is the asymmetric backfill window (post-event check-in, 2026-05-20):
 *   - Future (event's AEST day after today): CLOSED. Preserves the 9-May
 *     wrong-day fix - never mark attendance before the event has happened.
 *   - Event day: OPEN, regardless of impact - a leader might log impact early
 *     then keep checking in stragglers.
 *   - After the event day: OPEN only while impact has NOT been logged. This is
 *     the backfill window for lost-wifi / partner-org sign-in sheets. Once
 *     impact is logged the attendance is final and check-in CLOSES.
 *
 * Mirrors the server-side guards in
 * supabase/migrations/20260520000000_post_event_checkin_backfill.sql, which use
 * the existence of an `event_impact` row as the canonical "impact logged"
 * signal. Pass `impactLogged` from `useEventImpact(eventId)` (row exists).
 *
 * NOTE: participant self check-in (3-digit code) and the public QR form are NOT
 * gated by this - they stay day-of only (`isEventToday` / `isSignInButtonVisible`).
 *
 * @param eventDateStartIso events.date_start timestamptz ISO string
 * @param timeZone          the event's effective IANA timezone
 * @param impactLogged      true iff an event_impact row exists for the event
 */
export function isCheckInOpenForLeader(
  eventDateStartIso: string | null | undefined,
  timeZone: string,
  impactLogged: boolean,
): boolean {
  if (!eventDateStartIso) return false
  const eventDay = localDateIn(timeZone, eventDateStartIso)
  const today = localDateIn(timeZone)
  if (eventDay > today) return false // future: blocked
  if (eventDay === today) return true // event day: open
  return !impactLogged // past: open until impact logged
}

// ---------------------------------------------------------------------------
// datetime-local <-> ISO conversion in a target timezone
// ---------------------------------------------------------------------------

/**
 * Converts a wall-clock string (`YYYY-MM-DDTHH:mm`) entered in the
 * event's timezone into a UTC ISO string suitable for storing in
 * `timestamptz` columns.
 *
 * Why this exists: HTML's `datetime-local` input captures a naked
 * wall-clock value with no zone. `new Date(value)` interprets it as
 * browser-local, which is wrong for cross-zone event creation (east-
 * coast admin typing "10am" for a Perth event ends up with 10am AEST,
 * not 10am AWST). This function pins the wall clock to `timeZone`
 * regardless of where the browser thinks it is.
 */
export function wallClockToUtcIso(
  wallClock: string, // "YYYY-MM-DDTHH:mm" (seconds tolerated, dropped)
  timeZone: string,
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wallClock)
  if (!m) throw new Error(`Invalid wall-clock value: ${wallClock}`)
  const [, ys, mos, ds, hs, mis] = m
  const y = Number(ys), mo = Number(mos), d = Number(ds), h = Number(hs), mi = Number(mis)

  // Assume the wall clock is UTC; measure how far the target zone is
  // offset at that instant; subtract to land the correct UTC instant.
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, 0)
  const offsetMs = tzOffsetMs(timeZone, new Date(asUtc))
  const candidate = asUtc - offsetMs

  // Refine once for DST boundary correctness: if we straddled a
  // transition, the offset at `candidate` may differ from at `asUtc`.
  const refinedOffsetMs = tzOffsetMs(timeZone, new Date(candidate))
  return new Date(asUtc - refinedOffsetMs).toISOString()
}

/**
 * Inverse of `wallClockToUtcIso`: takes a UTC ISO timestamp and returns
 * the wall-clock string (`YYYY-MM-DDTHH:mm`) as seen in `timeZone`.
 * Used to populate the datetime-local input when editing an event in
 * its own timezone.
 */
export function utcIsoToWallClock(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`
}

/**
 * Returns the offset in ms between UTC and `timeZone` at the given
 * instant. Positive = zone is ahead of UTC.
 */
function tzOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') === 24 ? 0 : get('hour'),
    get('minute'),
    get('second'),
  )
  return asIfUtc - at.getTime()
}

// ---------------------------------------------------------------------------
// Aliases kept for call-site compatibility
// ---------------------------------------------------------------------------

/** @deprecated use formatDate(dateStr, timeZone) */
export const formatEventDate = formatDate
/** @deprecated use formatDate(dateStr, timeZone) */
export const formatCardDate = formatDate
/** @deprecated use formatTime(date, timeZone) */
export const formatEventTime = formatTime
/** @deprecated use formatTime(date, timeZone) */
export const formatCardTime = formatTime
/** @deprecated use formatDateLong(dateStr, true, timeZone) */
export const formatDateTime = formatDateLong

/** @deprecated use localDateIn(timeZone, date) */
export function localDateAEST(date: Date | string = new Date()): string {
  return localDateIn('Australia/Sydney', date)
}
/** @deprecated use isEventToday(iso, timeZone) */
export function isEventTodayAEST(eventDateStartIso: string | null | undefined): boolean {
  return isEventToday(eventDateStartIso, 'Australia/Sydney')
}
