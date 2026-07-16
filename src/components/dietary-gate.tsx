import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { UtensilsCrossed } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { useToast } from '@/components/toast'
import {
  DIETARY_GATE_QUERY_KEY,
  NO_DIETARY_SENTINEL,
  NO_MEDICAL_SENTINEL,
  CAMPOUT_ACTIVITY_TYPE,
} from '@/lib/dietary'

/* ------------------------------------------------------------------ */
/*  Dietary + medical requirements gate                                */
/*                                                                     */
/*  Anyone holding a ticket or registration to an UPCOMING TICKETED    */
/*  event must have dietary requirements on file - catering for        */
/*  camp-outs and ticketed events is ordered off this field. Holders   */
/*  of an upcoming CAMP-OUT must additionally have medical / allergy    */
/*  info on file (safety for multi-day, remote, overnight events).     */
/*                                                                     */
/*  Users missing a required field who hold such a ticket get a        */
/*  blocking prompt on app open (which backdates the requirement to    */
/*  existing ticket holders, e.g. Aadya) and immediately after a       */
/*  ticket purchase (the checkout flow invalidates                     */
/*  DIETARY_GATE_QUERY_KEY, re-running the eligibility check). The      */
/*  purchase flow itself also captures these fields inline before      */
/*  checkout for camp-outs; this gate is the backstop for existing     */
/*  holders, free claims, and any path that bypasses the inline form.  */
/*                                                                     */
/*  Both fields have a legitimate "none" answer, so each offers a       */
/*  "None" quick-fill that stores the sentinel. An empty/null field    */
/*  means "never answered" and keeps the gate armed; the sentinel      */
/*  means "answered: none" and never re-nags.                          */
/*                                                                     */
/*  Precedence: PhoneGate wins. This gate only renders once a phone    */
/*  is on file, so the two blocking portals can never stack.           */
/* ------------------------------------------------------------------ */

export function DietaryGate() {
  const { user, profile, isLoading, refreshProfile } = useAuth()
  const { toast } = useToast()
  const [dietary, setDietary] = useState('')
  const [medical, setMedical] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [viewport, setViewport] = useState<{ height: number; offsetTop: number } | null>(null)

  const dietaryEmpty = !(profile?.dietary_requirements ?? '').trim()
  const medicalEmpty = !(profile?.medical_requirements ?? '').trim()

  // Candidate = onboarded user, phone already on file (PhoneGate precedence:
  // that gate handles phone-less users and the two must never stack), and at
  // least one requirement field still unanswered. Only candidates run the
  // eligibility query.
  const candidate =
    !isLoading &&
    !!user &&
    !!profile &&
    profile.onboarding_completed === true &&
    !!(profile.phone ?? '').trim() &&
    (dietaryEmpty || medicalEmpty)

  // Does this user hold a live ticket OR registration to an upcoming ticketed
  // event, and is any of those events a camp-out? Both tables are checked
  // because a ticketed event can carry either artefact depending on how the
  // user got in (paid checkout, free claim, admin registration).
  const { data: eligibility } = useQuery({
    queryKey: [...DIETARY_GATE_QUERY_KEY, user?.id],
    queryFn: async (): Promise<{ ticketed: boolean; campout: boolean }> => {
      if (!user) return { ticketed: false, campout: false }
      const nowIso = new Date().toISOString()

      const [tickets, regs] = await Promise.all([
        supabase
          .from('event_tickets')
          .select('id, events!inner(id, activity_type)')
          .eq('user_id', user.id)
          .in('status', ['pending', 'confirmed', 'checked_in'])
          .eq('events.is_ticketed', true)
          .gte('events.date_start', nowIso),
        supabase
          .from('event_registrations')
          .select('id, events!inner(id, activity_type)')
          .eq('user_id', user.id)
          .in('status', ['registered', 'attended'])
          .eq('events.is_ticketed', true)
          .gte('events.date_start', nowIso),
      ])

      if (tickets.error) throw tickets.error
      if (regs.error) throw regs.error

      const rows = [...(tickets.data ?? []), ...(regs.data ?? [])]
      const activityOf = (r: unknown): string | null => {
        const e = (r as { events?: { activity_type?: string | null } | null }).events
        return e?.activity_type ?? null
      }
      const ticketed = rows.length > 0
      const campout = rows.some((r) => activityOf(r) === CAMPOUT_ACTIVITY_TYPE)
      return { ticketed, campout }
    },
    enabled: candidate,
    staleTime: 5 * 60 * 1000,
  })

  const needDietary = !!eligibility?.ticketed && dietaryEmpty
  const needMedical = !!eligibility?.campout && medicalEmpty
  const show = candidate && (needDietary || needMedical)

  // Lock body scroll while the gate is up.
  useEffect(() => {
    if (!show) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [show])

  // Keyboard-aware sizing via the visual viewport, same mechanism as
  // PhoneGate: anchor the sheet to the visible area above the on-screen
  // keyboard so the fields and buttons are never occluded.
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
    // Validate every shown field is answered (an explicit "None" quick-fill
    // is a valid answer; a blank is not).
    const dietaryValue = dietary.trim()
    const medicalValue = medical.trim()
    if (needDietary && !dietaryValue) {
      setError('Tell us your dietary requirements, or tap "None"')
      return
    }
    if (needMedical && !medicalValue) {
      setError('Tell us your medical / allergy info, or tap "None"')
      return
    }

    const updates: { dietary_requirements?: string; medical_requirements?: string } = {}
    if (needDietary) updates.dietary_requirements = dietaryValue
    if (needMedical) updates.medical_requirements = medicalValue

    setError(null)
    setSaving(true)
    try {
      const { error: updErr } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
      if (updErr) throw updErr
      await refreshProfile()
      toast.success('Saved')
      // refreshProfile flips `show` to false, unmounting the gate.
    } catch {
      toast.error('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }, [user, needDietary, needMedical, dietary, medical, refreshProfile, toast])

  if (!show) return null

  return createPortal(
    <div data-eos-id="src/components/dietary-gate.tsx#0" data-eos-v="2"
      className="fixed left-0 right-0 z-[200] flex items-end sm:items-center justify-center"
      style={
        viewport
          ? { top: viewport.offsetTop, height: viewport.height }
          : { top: 0, height: '100dvh' }
      }
      role="dialog"
      aria-modal="true"
      aria-labelledby="dietary-gate-title"
    >
      {/* Non-dismissable backdrop - no onClick, no Escape handler. */}
      <div data-eos-id="src/components/dietary-gate.tsx#1" className="fixed inset-0 bg-black/60" aria-hidden="true" />

      <div data-eos-id="src/components/dietary-gate.tsx#2"
        className="relative w-full sm:max-w-md max-h-full overflow-y-auto bg-surface-0 rounded-t-md sm:rounded-md shadow-sm flex flex-col"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1.5rem)' }}
      >
        <div data-eos-id="src/components/dietary-gate.tsx#3" className="px-6 pt-7 pb-6 space-y-5">
          <div data-eos-id="src/components/dietary-gate.tsx#4" className="flex flex-col items-center text-center gap-3">
            <div data-eos-id="src/components/dietary-gate.tsx#5" className="h-12 w-12 rounded-full bg-primary-100 flex items-center justify-center">
              <UtensilsCrossed data-eos-id="src/components/dietary-gate.tsx#6" size={22} className="text-primary-800" />
            </div>
            <h2 data-eos-id="src/components/dietary-gate.tsx#7" id="dietary-gate-title" className="font-heading text-xl font-bold text-neutral-900">
              {needDietary && needMedical
                ? 'A couple of details for your event'
                : needMedical
                  ? 'Any medical needs or allergies?'
                  : 'Any dietary requirements?'}
            </h2>
            <p data-eos-id="src/components/dietary-gate.tsx#8" className="text-sm text-neutral-500 leading-relaxed">
              You have a ticket to an upcoming event. We cater for camp-outs and
              ticketed events, and our leaders need to know about allergies,
              medical needs and dietary requirements to keep everyone safe.
            </p>
          </div>

          {needDietary && (
            <div data-eos-id="src/components/dietary-gate.tsx#9" className="space-y-1.5">
              <Input data-eos-id="src/components/dietary-gate.tsx#10"
                type="textarea"
                label="Dietary requirements"
                value={dietary}
                onChange={(e) => { setDietary(e.target.value); if (error) setError(null) }}
                placeholder="e.g. Vegetarian, gluten free, vegan..."
                rows={2}
                maxLength={500}
              />
              <button data-eos-id="src/components/dietary-gate.tsx#11"
                type="button"
                disabled={saving}
                onClick={() => { setDietary(NO_DIETARY_SENTINEL); if (error) setError(null) }}
                className="text-xs font-medium text-neutral-500 underline underline-offset-2"
              >
                No dietary requirements
              </button>
            </div>
          )}

          {needMedical && (
            <div data-eos-id="src/components/dietary-gate.tsx#12" className="space-y-1.5">
              <Input data-eos-id="src/components/dietary-gate.tsx#13"
                type="textarea"
                label="Medical / allergy info"
                value={medical}
                onChange={(e) => { setMedical(e.target.value); if (error) setError(null) }}
                placeholder="e.g. Asthma, EpiPen for nut allergy..."
                rows={2}
                maxLength={500}
              />
              <button data-eos-id="src/components/dietary-gate.tsx#14"
                type="button"
                disabled={saving}
                onClick={() => { setMedical(NO_MEDICAL_SENTINEL); if (error) setError(null) }}
                className="text-xs font-medium text-neutral-500 underline underline-offset-2"
              >
                No medical needs or allergies
              </button>
            </div>
          )}

          {error && <p data-eos-id="src/components/dietary-gate.tsx#15" className="text-xs text-error-500">{error}</p>}

          <Button data-eos-id="src/components/dietary-gate.tsx#16"
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
