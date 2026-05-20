/** Shared error message constants for check-in flows (page + sheet). */
export const CHECK_IN_ERROR_MESSAGES = {
  not_registered: "You're not registered for this event. Register first, then try again.",
  already_checked_in: "You've already checked in to this event!",
  invalid_qr: 'This code is not valid. Check with your event leader.',
  event_cancelled: 'This event has been cancelled.',
  event_not_active: "Check-in for this event isn't open right now.",
  generic: 'Something went wrong. Please try again.',
} as const

export type CheckInErrorKind = keyof typeof CHECK_IN_ERROR_MESSAGES
