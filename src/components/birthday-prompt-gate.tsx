import { useState } from 'react'
import { BottomSheet } from '@/components/bottom-sheet'
import { DateInput } from '@/components/date-input'
import { Button } from '@/components/button'
import { useAuth } from '@/hooks/use-auth'
import { useProfile, useUpdateProfile } from '@/hooks/use-profile'
import { calculateAge } from '@/lib/date-format'

/**
 * One-time gate that asks every existing user for their date of birth the
 * next time they open the app. We switched onboarding from a static age
 * number to DOB (age derives from it, so it never goes stale), but users
 * who already completed their profile have `age` set and `date_of_birth`
 * null - the profile-completion gate will never re-prompt them. This fills
 * that gap: it fires for any authenticated user whose date_of_birth is null
 * and writes both date_of_birth and the derived age.
 */
export function BirthdayPromptGate() {
  const { user } = useAuth()
  const { data: profile, isLoading } = useProfile()
  const updateProfile = useUpdateProfile()
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [error, setError] = useState<string | null>(null)

  const needsBirthday = !!user && !isLoading && !!profile && !profile.date_of_birth

  if (!needsBirthday) return null

  const handleSave = async () => {
    const age = calculateAge(dateOfBirth)
    if (age === null) {
      setError('Please enter a valid date')
      return
    }
    if (age < 5 || age > 120) {
      setError('Please check the date is correct')
      return
    }
    setError(null)
    await updateProfile.mutateAsync({
      date_of_birth: dateOfBirth || null,
      age,
    })
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <BottomSheet open onClose={() => { /* mandatory - no dismiss */ }}>
      <div className="px-1 pb-2 space-y-4">
        <div className="space-y-1.5">
          <h2 className="text-lg font-heading font-semibold text-neutral-900">
            One quick thing
          </h2>
          <p className="text-sm text-neutral-600">
            We now use your birthday instead of your age, so it stays right
            without you having to update it every year.
          </p>
        </div>
        <DateInput
          label="Date of Birth"
          value={dateOfBirth}
          onChange={(v) => { setDateOfBirth(v); setError(null) }}
          max={today}
          error={error ?? undefined}
        />
        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={updateProfile.isPending}
          disabled={!dateOfBirth}
          onClick={handleSave}
        >
          Save
        </Button>
      </div>
    </BottomSheet>
  )
}
