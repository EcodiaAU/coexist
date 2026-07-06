import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Phone } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { useToast } from '@/components/toast'
import { isValidPhone } from '@/lib/validation'

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

export function PhoneGate() {
  const { user, profile, isLoading, refreshProfile } = useAuth()
  const { toast } = useToast()
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Visual-viewport metrics so the sheet always sits ABOVE the on-screen
  // keyboard. iOS/WebKit does not reliably scroll a position:fixed field above
  // the keyboard, so on a small screen (or older Safari) the input AND the
  // Save button end up hidden behind the keyboard and the user cannot type
  // their number or submit - the "phone field will not accept typing" report.
  // We size the gate to the visual viewport (which shrinks to the space above
  // the keyboard) instead of the layout viewport, removing the dependency on
  // WebKit's flaky auto-scroll. See the container style below.
  const [viewport, setViewport] = useState<{ height: number; offsetTop: number } | null>(null)

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

  // Track the visual viewport so the gate follows the keyboard. When the
  // keyboard opens, visualViewport.height shrinks to the visible area above it
  // and offsetTop reflects any keyboard-driven page shift; we anchor the fixed
  // container to those values so the field + button are never occluded.
  useEffect(() => {
    if (!show) return
    const vv = window.visualViewport
    if (!vv) return
    const sync = () => setViewport({ height: vv.height, offsetTop: vv.offsetTop })
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [show])

  const handleSave = useCallback(async () => {
    if (!user) return
    const trimmed = phone.trim()
    if (!isValidPhone(trimmed)) {
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
      className="fixed left-0 right-0 z-[200] flex items-end sm:items-center justify-center"
      // Anchor to the VISUAL viewport, not the layout viewport, so the sheet
      // sits directly above the keyboard on every device / iOS version. When
      // visualViewport is unavailable (older engines / SSR) we fall back to
      // 100dvh, which already tracks the keyboard on modern mobile browsers.
      style={
        viewport
          ? { top: viewport.offsetTop, height: viewport.height }
          : { top: 0, height: '100dvh' }
      }
      role="dialog"
      aria-modal="true"
      aria-labelledby="phone-gate-title"
    >
      {/* Non-dismissable backdrop - no onClick, no Escape handler. Covers the
          whole layout viewport (including behind the keyboard). */}
      <div className="fixed inset-0 bg-black/60" aria-hidden="true" />

      <div
        className="relative w-full sm:max-w-md max-h-full overflow-y-auto bg-surface-0 rounded-t-md sm:rounded-md shadow-sm flex flex-col"
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
            placeholder="0400 000 000 or +44 7911 123456"
            helperText="Any country's number works. Include the country code (like +44) if you're outside Australia."
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
