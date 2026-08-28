import { useState, useCallback } from 'react'
import { UtensilsCrossed } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { useToast } from '@/components/toast'
import { Modal } from '@/components/modal'
import {
  DIETARY_GATE_QUERY_KEY,
  hasEmergencyContact,
  LIVE_REGISTRATION_STATUSES,
  LIVE_TICKET_STATUSES,
  NO_DIETARY_SENTINEL,
  NO_MEDICAL_SENTINEL,
} from '@/lib/dietary'

/* ------------------------------------------------------------------ */
/*  Dietary + medical requirements gate                                */
/*                                                                     */
/*  Anyone holding a ticket or registration to an UPCOMING TICKETED    */
/*  event must have BOTH dietary requirements and medical / allergy     */
/*  info on file - catering + safety are ordered off these fields.      */
/*  (Broadened 2026-08-12 from "medical only for camp-outs" to every    */
/*  ticketed event, so leaders always hold allergy/medical data for     */
/*  every ticket holder.)                                              */
/*                                                                     */
/*  Users missing a required field who hold such a ticket get a        */
/*  blocking prompt on app open (which backdates the requirement to    */
/*  existing ticket holders, e.g. Aadya) and immediately after a       */
/*  ticket purchase (the checkout flow invalidates                     */
/*  DIETARY_GATE_QUERY_KEY, re-running the eligibility check). The      */
/*  purchase flow itself also captures these fields inline before      */
/*  checkout; this gate is the backstop for existing holders, free      */
/*  claims, and any path that bypasses the inline form.                */
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
  // Emergency contact. Kurt 2026-08-25: "half of the people don't have their
  // emergency contacts on there so I'm having to email many people
  // individually". Unlike dietary and medical there is NO "None" quick-fill:
  // a remote camp-out with nobody to call is not a valid answer.
  const [emName, setEmName] = useState('')
  const [emPhone, setEmPhone] = useState('')
  const [emRel, setEmRel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const dietaryEmpty = !(profile?.dietary_requirements ?? '').trim()
  const medicalEmpty = !(profile?.medical_requirements ?? '').trim()
  // Both name and phone are needed for the contact to be reachable at all.
  const emergencyEmpty = !hasEmergencyContact(profile)

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
    (dietaryEmpty || medicalEmpty || emergencyEmpty)

  // Does this user hold a live ticket OR registration to an upcoming ticketed
  // event? Both tables are checked because a ticketed event can carry either
  // artefact depending on how the user got in (paid checkout, free claim,
  // admin registration). A single live ticket arms both dietary + medical.
  const { data: eligibility } = useQuery({
    queryKey: [...DIETARY_GATE_QUERY_KEY, user?.id],
    queryFn: async (): Promise<{ ticketed: boolean }> => {
      if (!user) return { ticketed: false }
      const nowIso = new Date().toISOString()

      const [tickets, regs] = await Promise.all([
        supabase
          .from('event_tickets')
          .select('id, events!inner(id)')
          .eq('user_id', user.id)
          // Which statuses count as a live seat is defined once in @/lib/dietary
          // (LIVE_TICKET_STATUSES) so this gate and its test cannot drift apart.
          .in('status', LIVE_TICKET_STATUSES as unknown as string[])
          .eq('events.is_ticketed', true)
          .gte('events.date_start', nowIso),
        supabase
          .from('event_registrations')
          .select('id, events!inner(id)')
          .eq('user_id', user.id)
          .in('status', LIVE_REGISTRATION_STATUSES as unknown as string[])
          .eq('events.is_ticketed', true)
          .gte('events.date_start', nowIso),
      ])

      if (tickets.error) throw tickets.error
      if (regs.error) throw regs.error

      const ticketed = (tickets.data?.length ?? 0) + (regs.data?.length ?? 0) > 0
      return { ticketed }
    },
    enabled: candidate,
    staleTime: 5 * 60 * 1000,
  })

  const needDietary = !!eligibility?.ticketed && dietaryEmpty
  const needMedical = !!eligibility?.ticketed && medicalEmpty
  const needEmergency = !!eligibility?.ticketed && emergencyEmpty
  const show = candidate && (needDietary || needMedical || needEmergency)

  // Body scroll-lock and keyboard avoidance are now owned by the Modal
  // primitive (Vaul + `keyboardAware` via useKeyboardHeight - the canonical
  // Capacitor signal that also works under Keyboard.resize:'none', which the
  // old visualViewport-only path missed on native).

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
    const emNameValue = emName.trim()
    const emPhoneValue = emPhone.trim()
    if (needEmergency && !emNameValue) {
      setError('Give us an emergency contact name')
      return
    }
    if (needEmergency && !emPhoneValue) {
      setError('Give us a phone number for your emergency contact')
      return
    }

    const updates: {
      dietary_requirements?: string
      medical_requirements?: string
      emergency_contact_name?: string
      emergency_contact_phone?: string
      emergency_contact_relationship?: string
    } = {}
    if (needDietary) updates.dietary_requirements = dietaryValue
    if (needMedical) updates.medical_requirements = medicalValue
    if (needEmergency) {
      updates.emergency_contact_name = emNameValue
      updates.emergency_contact_phone = emPhoneValue
      if (emRel.trim()) updates.emergency_contact_relationship = emRel.trim()
    }

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
  }, [user, needDietary, needMedical, needEmergency, dietary, medical, emName, emPhone, emRel, refreshProfile, toast])

  // Blocking gate: `dismissible={false}` = no backdrop tap, no Escape, no drag.
  return (
    <Modal
      open={show}
      onClose={() => {}}
      dismissible={false}
      keyboardAware
      ariaLabel={
        needDietary && needMedical
          ? 'A couple of details for your event'
          : needMedical
            ? 'Any medical needs or allergies?'
            : 'Any dietary requirements?'
      }
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
              medical needs, dietary requirements and who to call in an
              emergency to keep everyone safe.
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

          {needEmergency && (
            <div className="space-y-2.5 rounded-md border border-neutral-100 bg-neutral-50/60 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                Emergency contact
              </p>
              <Input
                label="Their name"
                value={emName}
                onChange={(e) => { setEmName(e.target.value); if (error) setError(null) }}
                placeholder="e.g. Sam Rivers"
                maxLength={120}
              />
              <Input
                type="tel"
                label="Their phone"
                value={emPhone}
                onChange={(e) => { setEmPhone(e.target.value); if (error) setError(null) }}
                placeholder="e.g. 0400 000 000"
                maxLength={40}
              />
              <Input
                label="Relationship (optional)"
                value={emRel}
                onChange={(e) => { setEmRel(e.target.value); if (error) setError(null) }}
                placeholder="e.g. Partner, parent, friend"
                maxLength={80}
              />
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
    </Modal>
  )
}
