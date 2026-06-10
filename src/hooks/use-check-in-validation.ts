import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { CHECK_IN_ERROR_MESSAGES, type CheckInErrorKind } from '@/lib/constants/check-in'

export type { CheckInErrorKind }
export { CHECK_IN_ERROR_MESSAGES }

export type RegistrationValidationResult =
  | { status: 'ok' }
  | { status: 'error'; kind: CheckInErrorKind }

/**
 * Validates a user's eligibility to check in to an event against the
 * database. Returns a discriminated union so callers can handle each
 * outcome.
 *
 * Per Tate 2026-05-23 Co-Exist incident: people must be able to register
 * AND sign in on the day, including walk-ups with no prior registration
 * and people who were on the waitlist or had previously cancelled. The
 * downstream check-in mutation (useCheckIn self path / useCodeCheckIn)
 * upserts to status='attended' so a missing or non-attended row is
 * fine. The only blocking states surfaced here are "already checked in"
 * (a soft no-op signal so the UI doesn't show a confusing second
 * success) and unexpected query errors.
 *
 * Does NOT perform the check-in itself - that remains the caller's
 * responsibility so each context (page vs sheet) can react to the
 * result in its own way.
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

      if (error) {
        return { status: 'error', kind: 'generic' }
      }

      if (registration && registration.status === 'attended' && registration.checked_in_at) {
        return { status: 'error', kind: 'already_checked_in' }
      }

      return { status: 'ok' }
    },
    [],
  )

  return { validateRegistration }
}
