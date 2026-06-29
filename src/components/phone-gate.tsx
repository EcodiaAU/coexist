import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Phone } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { useToast } from '@/components/toast'

/* ------------------------------------------------------------------ */
/*  Phone gate                                                         */
/*                                                                     */
/*  Mobile number is a required field. Existing users who finished     */
/*  onboarding before it was mandatory (and any new user who lands     */
/*  without one) get a blocking, non-dismissable prompt on app open    */
/*  asking for it before they can use the app. Once saved, the gate    */
/*  disappears for good. Event leaders read this number on the         */
/*  event-day attendee sheet, so it cannot be skipped.                 */
/* ------------------------------------------------------------------ */

// Same shape as `phoneField` in lib/validation.ts, but required (no empty).
const PHONE_RE = /^[\d\s+\-().]{6,20}$/

export function PhoneGate() {
  const { user, profile, isLoading, refreshProfile } = useAuth()
  const { toast } = useToast()
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Show only for a fully-loaded, onboarded user who has no phone on file.
  // Gating on onboarding_completed keeps it off the onboarding/auth flow
  // (those run in a bare shell anyway) and catches new users the moment
  // they land in the app after finishing onboarding without a number.
  const show =
    !isLoading &&
    !!user &&
    !!profile &&
    profile.onboarding_completed === true &&
    !(profile.phone ?? '').trim()

  // Lock body scroll while the gate is up.
  useEffect(() => {
    if (!show) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [show])

  const handleSave = useCallback(async () => {
    if (!user) return
    const trimmed = phone.trim()
    if (!PHONE_RE.test(trimmed)) {
      setError('Please enter a valid mobile number')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const { error: updErr } = await supabase
        .from('profiles')
        .update({ phone: trimmed })
        .eq('id', user.id)
      if (updErr) throw updErr
      await refreshProfile()
      toast.success('Mobile number saved')
      // refreshProfile flips `show` to false, unmounting the gate.
    } catch {
      toast.error('Could not save your number. Please try again.')
    } finally {
      setSaving(false)
    }
  }, [user, phone, refreshProfile, toast])

  if (!show) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="phone-gate-title"
    >
      {/* Non-dismissable backdrop - no onClick, no Escape handler. */}
      <div className="fixed inset-0 bg-black/60" aria-hidden="true" />

      <div
        className="relative w-full sm:max-w-md bg-surface-0 rounded-t-md sm:rounded-md shadow-sm flex flex-col"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1.5rem)' }}
      >
        <div className="px-6 pt-7 pb-6 space-y-5">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary-100 flex items-center justify-center">
              <Phone size={22} className="text-primary-800" />
            </div>
            <h2 id="phone-gate-title" className="font-heading text-xl font-bold text-neutral-900">
              Add your mobile number
            </h2>
            <p className="text-sm text-neutral-500 leading-relaxed">
              We ask everyone for a mobile number for safety, so event leaders can
              reach you on the day of events you are attending.
            </p>
          </div>

          <Input
            type="tel"
            label="Mobile number"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); if (error) setError(null) }}
            placeholder="0400 000 000"
            inputMode="tel"
            autoComplete="tel"
            enterKeyHint="done"
            maxLength={20}
            required
            error={error ?? undefined}
          />

          <Button
            variant="primary"
            fullWidth
            loading={saving}
            onClick={handleSave}
          >
            Save and continue
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
