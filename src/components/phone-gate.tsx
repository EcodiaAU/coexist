import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Phone } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { useToast } from '@/components/toast'
import { isValidPhone } from '@/lib/validation'
import { useKeyboardHeight } from '@/hooks/use-keyboard-height'

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
  // Keyboard avoidance. TRUE root cause of the iOS "phone field will not
  // accept typing" reports (RCA 2026-07-06, iOS 26.5 sim, WKWebView): the
  // native app runs the WebView with Capacitor `Keyboard.resize: 'none'`
  // (capacitor.config.ts), so when the tel keypad opens NOTHING resizes -
  // window.visualViewport keeps the full layout height and 100dvh never
  // shrinks. This fixed, bottom-anchored sheet therefore stays pinned to the
  // physical screen bottom, i.e. the input AND the Save button sit BEHIND the
  // keypad. Typing actually works (digits land blind), but the user can see
  // neither the field nor a way to finish (the iOS tel keypad has no Done
  // key), which is reported as "it won't let me type my number".
  // The earlier visualViewport-anchored fix (80746b6) only helped browsers
  // where visualViewport shrinks (e.g. Safari web, which auto-reveals focused
  // fields anyway) and no-oped inside the app, where the reports came from.
  // The canonical in-app keyboard signal is useKeyboardHeight (Capacitor
  // keyboardWillShow/Hide events - they fire regardless of resize mode - with
  // a visualViewport fallback for web/Android). BottomSheet and chat-room
  // already offset with it; the gate now does the same.
  const keyboardHeight = useKeyboardHeight()
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [inputFocused, setInputFocused] = useState(false)
  const blurTimer = useRef<number | undefined>(undefined)

  const touchLike = useMemo(
    () =>
      Capacitor.isNativePlatform() ||
      (typeof window !== 'undefined' &&
        window.matchMedia?.('(pointer: coarse)')?.matches === true),
    [],
  )

  // Belt-and-braces on top of the plugin signal: if the field is focused on a
  // touch device but no height signal ever arrives (a missed keyboardWillShow
  // under resize:'none' would otherwise reproduce the occluded gate exactly),
  // assume a keyboard of ~42% of the window - taller than any real iOS or
  // Android keypad, so the sheet can only end up too high, never hidden. The
  // real plugin/viewport height replaces the estimate the moment it arrives.
  // Desktop (fine pointer, no native shell) never enters this branch, so the
  // web layout does not jump on focus.
  const keyboardInset =
    keyboardHeight > 0
      ? keyboardHeight
      : inputFocused && touchLike
        ? Math.round(window.innerHeight * 0.42)
        : 0

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

  // When the keyboard opens the container above it can be shorter than the
  // card; the card scrolls internally (overflow-y-auto) and defaults to its
  // TOP, which would hide the field + Save at the bottom. Pin the scroll to
  // the bottom so the interactive elements stay visible above the keypad.
  useEffect(() => {
    if (!show || keyboardInset <= 0) return
    const raf = requestAnimationFrame(() => {
      const card = cardRef.current
      if (card) card.scrollTop = card.scrollHeight
    })
    return () => cancelAnimationFrame(raf)
  }, [show, keyboardInset])

  const handleSave = useCallback(async () => {
    if (!user) return
    const trimmed = phone.trim()
    if (!isValidPhone(trimmed)) {
      setError('Please enter a valid mobile number')
      return
    }
    setError(null)
    // Dismiss the keypad once validation passes: the iOS tel keypad has no
    // Done/return key, so Save doubles as the explicit dismiss affordance.
    // (Only after validation - a failed attempt keeps the keypad up so the
    // user can correct the number without re-tapping the field.)
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
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
      className="fixed left-0 right-0 top-0 z-[200] flex items-end sm:items-center justify-center"
      // Lift the container's bottom edge above the keyboard. keyboardHeight
      // comes from the Capacitor Keyboard plugin on native (the only signal
      // that works with Keyboard.resize:'none', where visualViewport / dvh
      // never change) and from visualViewport on web/Android. When the
      // keyboard is closed this is bottom:0 = the previous full-screen gate.
      // On web iOS Safari the hook reports 0, and Safari itself scrolls the
      // focused field into view (verified iOS 26.5 sim), so no offset needed.
      style={{ bottom: keyboardInset }}
      data-phone-gate="kb-aware-v2"
      role="dialog"
      aria-modal="true"
      aria-labelledby="phone-gate-title"
    >
      {/* Non-dismissable backdrop - no onClick, no Escape handler. Covers the
          whole layout viewport (including behind the keyboard). */}
      <div className="fixed inset-0 bg-black/60" aria-hidden="true" />

      <div
        ref={cardRef}
        className="relative w-full sm:max-w-md max-h-full overflow-y-auto bg-surface-0 rounded-t-md sm:rounded-md shadow-sm flex flex-col"
        style={{
          paddingBottom:
            keyboardHeight > 0 ? '0.75rem' : 'max(env(safe-area-inset-bottom, 0px), 1.5rem)',
        }}
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
            onFocus={() => {
              if (blurTimer.current) window.clearTimeout(blurTimer.current)
              setInputFocused(true)
            }}
            onBlur={() => {
              // Delay the collapse so a tap on Save is hit-tested against the
              // lifted layout (blur fires mid-tap, before the click lands).
              blurTimer.current = window.setTimeout(() => setInputFocused(false), 250)
            }}
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
