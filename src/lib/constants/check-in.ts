/** Shared error message constants for check-in flows (page + sheet). */
export const CHECK_IN_ERROR_MESSAGES = {
  not_registered: "You're not registered for this event. Register first, then try again.",
  already_checked_in: "You've already checked in to this event!",
  invalid_qr: 'This code is not valid. Check with your event leader.',
  event_cancelled: 'This event has been cancelled.',
  event_not_active: "Check-in for this event isn't open right now.",
  // The write went through but the database did not record it as attended.
  // Every self check-in reads its status back for this; until 2026-10-19 a
  // sign-ups-closed event wrote 'waitlisted' behind a success screen.
  not_recorded: "Your check-in wasn't recorded. Ask an event leader to check you in.",
  generic: 'Something went wrong. Please try again.',
} as const

export type CheckInErrorKind = keyof typeof CHECK_IN_ERROR_MESSAGES

/**
 * True for the database's own "not on this day" refusals
 * (enforce_event_day_check_in_window, and handle_event_registration for a
 * self check-in on a sign-ups-closed or externally booked event).
 */
export function isCheckInWindowError(message: string): boolean {
  return (
    message.includes('Check-in is closed') ||
    message.includes('Post-event check-in') ||
    message.includes('not available before the day') ||
    message.includes('leaders only')
  )
}

/**
 * The error kind for a failed self check-in that no screen-specific rule
 * claimed: an unrecorded write, a day-window refusal, or anything else.
 */
export function selfCheckInErrorKind(message: string): CheckInErrorKind {
  if (message === CHECK_IN_ERROR_MESSAGES.not_recorded) return 'not_recorded'
  if (isCheckInWindowError(message)) return 'event_not_active'
  return 'generic'
}

/**
 * The message of anything a check-in mutation throws. supabase-js returns a
 * PostgREST error as a plain object, and the hooks rethrow it as-is, so an
 * `instanceof Error` test read every database refusal (a check-in on the wrong
 * day included) as '' and showed the generic message.
 */
export function checkInErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  return ''
}
