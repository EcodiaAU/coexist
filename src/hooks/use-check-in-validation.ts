import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { CHECK_IN_ERROR_MESSAGES, type CheckInErrorKind } from '@/lib/constants/check-in'

export type { CheckInErrorKind }
export { CHECK_IN_ERROR_MESSAGES }

export type RegistrationValidationResult =
  | { status: 'ok' }
  | { status: 'waitlisted' }
  | { status: 'error'; kind: CheckInErrorKind }

/**
 * Validates a user's registration for an event against the database.
 * Returns a discriminated union so callers can handle each outcome.
 *
 * Does NOT perform the check-in itself - that remains the caller's responsibility
 * so each context (page vs sheet) can react to the result in its own way.
 */
export function useCheckInValidation() {
  const validateRegistration = useCallback(
    async (eventId: string, userId: string): Promise<RegistrationValidationResult> => {
      const { data: registration, error } = await supabase
        .from('event_registrations')
        .select('status, checked_in_at')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .maybeSingle()

      if (error || !registration) {
        return { status: 'error', kind: 'not_registered' }
      }

      if (registration.status === 'attended' && registration.checked_in_at) {
        return { status: 'error', kind: 'already_checked_in' }
      }

      if (registration.status === 'waitlisted') {
        return { status: 'waitlisted' }
      }

      if (registration.status !== 'registered' && registration.status !== 'invited') {
        return { status: 'error', kind: 'not_registered' }
      }

      return { status: 'ok' }
    },
    [],
  )

  return { validateRegistration }
}
