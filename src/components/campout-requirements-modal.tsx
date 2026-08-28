import { useState, useCallback } from 'react'
import { Tent } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { useToast } from '@/components/toast'
import { Modal } from '@/components/modal'
import { NO_DIETARY_SENTINEL, NO_MEDICAL_SENTINEL } from '@/lib/dietary'

/* ------------------------------------------------------------------ */
/*  Ticket requirements modal (captured at purchase)                   */
/*                                                                     */
/*  Shown before ANY ticket checkout when the buyer is missing         */
/*  dietary, medical, and/or emergency-contact info. All three are     */
/*  mandatory for every ticketed event (not just camp-outs) so leaders */
/*  always have safety + catering data on file. It BLOCKS the purchase:*/
/*  the buyer cannot reach Stripe checkout until every required field  */
/*  is answered (an explicit "None" is a valid answer, a blank is not).*/
/*  On save it persists to the buyer's profile and invokes onSaved,    */
/*  which continues to checkout. It is dismissable (Cancel) - unlike   */
/*  the app-open DietaryGate backstop - because no ticket exists yet.  */
/*  `isCampout` only tunes the copy (camp-outs are catered + remote,   */
/*  so the wording leans on that); the requirement itself is identical */
/*  for every ticketed event.                                          */
/* ------------------------------------------------------------------ */

interface Props {
  open: boolean
  needDietary: boolean
  needMedical: boolean
  needEmergency: boolean
  isCampout: boolean
  onClose: () => void
  onSaved: () => void
}

export function CampoutRequirementsModal({ open, needDietary, needMedical, needEmergency, isCampout, onClose, onSaved }: Props) {
  const { user, refreshProfile } = useAuth()
  const { toast } = useToast()
  const [dietary, setDietary] = useState('')
  const [medical, setMedical] = useState('')
  // Emergency contact. Deliberately NO "None" quick-fill, unlike dietary and
  // medical: those have a legitimate none, a remote camp-out with nobody to
  // call does not. Name AND phone are both required, because a contact you
  // cannot ring is not a contact.
  const [emName, setEmName] = useState('')
  const [emPhone, setEmPhone] = useState('')
  const [emRel, setEmRel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    if (!user) return
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
      onSaved()
    } catch {
      toast.error('Could not save. Please try again.')
      setSaving(false)
    }
  }, [user, needDietary, needMedical, needEmergency, dietary, medical, emName, emPhone, emRel, refreshProfile, onSaved, toast])

  // Name only the fields actually being asked for, so a buyer who already has
  // dietary and medical on file is not told we need them again.
  const neededLabel = [
    needDietary && 'dietary',
    needMedical && 'medical/allergy',
    needEmergency && 'emergency contact',
  ].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' and $1') + ' info'

  return (
    <Modal
      open={open}
      onClose={() => { if (!saving) onClose() }}
      ariaLabel={isCampout ? 'Before you book this camp-out' : 'Before you book your ticket'}
    >
        <div data-eos-id="src/components/campout-requirements-modal.tsx#3" className="px-6 pt-7 pb-6 space-y-5">
          <div data-eos-id="src/components/campout-requirements-modal.tsx#4" className="flex flex-col items-center text-center gap-3">
            <div data-eos-id="src/components/campout-requirements-modal.tsx#5" className="h-12 w-12 rounded-full bg-primary-100 flex items-center justify-center">
              <Tent data-eos-id="src/components/campout-requirements-modal.tsx#6" size={22} className="text-primary-800" />
            </div>
            <h2 data-eos-id="src/components/campout-requirements-modal.tsx#7" id="campout-reqs-title" className="font-heading text-xl font-bold text-neutral-900">
              {isCampout ? 'Before you book this camp-out' : 'Before you book your ticket'}
            </h2>
            <p data-eos-id="src/components/campout-requirements-modal.tsx#8" className="text-sm text-neutral-500 leading-relaxed">
              {isCampout
                ? `Camp-outs are catered and remote, so our leaders need your ${neededLabel} before you book. Only event leaders can see it.`
                : `Our leaders need your ${neededLabel} before you book, so we can cater safely and be ready in an emergency. Only event leaders can see it.`}
            </p>
          </div>

          {needDietary && (
            <div data-eos-id="src/components/campout-requirements-modal.tsx#9" className="space-y-1.5">
              <Input data-eos-id="src/components/campout-requirements-modal.tsx#10"
                type="textarea"
                label="Dietary requirements"
                value={dietary}
                onChange={(e) => { setDietary(e.target.value); if (error) setError(null) }}
                placeholder="e.g. Vegetarian, gluten free, vegan..."
                rows={2}
                maxLength={500}
              />
              <button data-eos-id="src/components/campout-requirements-modal.tsx#11"
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
            <div data-eos-id="src/components/campout-requirements-modal.tsx#12" className="space-y-1.5">
              <Input data-eos-id="src/components/campout-requirements-modal.tsx#13"
                type="textarea"
                label="Medical / allergy info"
                value={medical}
                onChange={(e) => { setMedical(e.target.value); if (error) setError(null) }}
                placeholder="e.g. Asthma, EpiPen for nut allergy..."
                rows={2}
                maxLength={500}
              />
              <button data-eos-id="src/components/campout-requirements-modal.tsx#14"
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
            <div data-eos-id="src/components/campout-requirements-modal.tsx#19" className="space-y-2.5">
              <Input data-eos-id="src/components/campout-requirements-modal.tsx#20"
                label="Emergency contact name"
                value={emName}
                onChange={(e) => { setEmName(e.target.value); if (error) setError(null) }}
                placeholder="Who should we call?"
                maxLength={120}
              />
              <Input data-eos-id="src/components/campout-requirements-modal.tsx#21"
                type="tel"
                label="Emergency contact phone"
                value={emPhone}
                onChange={(e) => { setEmPhone(e.target.value); if (error) setError(null) }}
                placeholder="Their phone number"
                maxLength={40}
              />
              <Input data-eos-id="src/components/campout-requirements-modal.tsx#22"
                label="Relationship (optional)"
                value={emRel}
                onChange={(e) => { setEmRel(e.target.value); if (error) setError(null) }}
                placeholder="e.g. Mum, partner, housemate"
                maxLength={60}
              />
            </div>
          )}

          {error && <p data-eos-id="src/components/campout-requirements-modal.tsx#15" className="text-xs text-error-500">{error}</p>}

          <div data-eos-id="src/components/campout-requirements-modal.tsx#16" className="space-y-2.5">
            <Button data-eos-id="src/components/campout-requirements-modal.tsx#17"
              variant="primary"
              fullWidth
              loading={saving}
              onClick={handleSave}
            >
              Save and continue to payment
            </Button>
            <Button data-eos-id="src/components/campout-requirements-modal.tsx#18"
              variant="ghost"
              fullWidth
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </Button>
          </div>
        </div>
    </Modal>
  )
}
