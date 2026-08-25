import { useState, useCallback } from 'react'
import { Tent } from 'lucide-react'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Modal } from '@/components/modal'
import { NO_DIETARY_SENTINEL, NO_MEDICAL_SENTINEL } from '@/lib/dietary'

/* ------------------------------------------------------------------ */
/*  Guest ticket requirements modal (public booking, no account)       */
/*                                                                     */
/*  The public campout / event pages let someone book with just name + */
/*  email, but dietary + medical/allergy info is a hard pre-checkout    */
/*  requirement for EVERY ticketed event (Angelica, 2026-07-08; broad- */
/*  ened from camp-outs to all ticketed events 2026-08-12) - the same  */
/*  rule the authed CampoutRequirementsModal enforces. The guest has    */
/*  no session/profile yet, so unlike that modal this one does NOT      */
/*  write to the DB: it collects both answers and hands them back via   */
/*  onSubmit, and guest-ticket-checkout persists them onto the          */
/*  provisioned profile (and hard-enforces the gate server-side).      */
/*  An explicit "None" is a valid answer; a blank is not. `isCampout`  */
/*  only tunes the copy.                                               */
/* ------------------------------------------------------------------ */

interface Props {
  open: boolean
  submitting: boolean
  isCampout: boolean
  onClose: () => void
  onSubmit: (values: {
    dietary: string
    medical: string
    emergencyName: string
    emergencyPhone: string
    emergencyRelationship: string
  }) => void
}

export function CampoutGuestRequirementsModal({ open, submitting, isCampout, onClose, onSubmit }: Props) {
  const [dietary, setDietary] = useState('')
  const [medical, setMedical] = useState('')
  // Emergency contact. Kurt 2026-08-25: "half of the people don't have their
  // emergency contacts on there so I'm having to email many people
  // individually". There is no "None" escape here, unlike dietary and medical:
  // a remote camp-out with no way to reach anyone is the one gap that cannot be
  // answered with a shrug.
  const [emergencyName, setEmergencyName] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')
  const [emergencyRelationship, setEmergencyRelationship] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleContinue = useCallback(() => {
    const dietaryValue = dietary.trim()
    const medicalValue = medical.trim()
    const emName = emergencyName.trim()
    const emPhone = emergencyPhone.trim()
    if (!dietaryValue) {
      setError('Tell us your dietary requirements, or tap "None"')
      return
    }
    if (!medicalValue) {
      setError('Tell us your medical / allergy info, or tap "None"')
      return
    }
    if (!emName) {
      setError('Give us an emergency contact name')
      return
    }
    if (!emPhone) {
      setError('Give us a phone number for your emergency contact')
      return
    }
    setError(null)
    onSubmit({
      dietary: dietaryValue,
      medical: medicalValue,
      emergencyName: emName,
      emergencyPhone: emPhone,
      emergencyRelationship: emergencyRelationship.trim(),
    })
  }, [dietary, medical, emergencyName, emergencyPhone, emergencyRelationship, onSubmit])

  return (
    <Modal
      open={open}
      onClose={() => { if (!submitting) onClose() }}
      ariaLabel={isCampout ? 'Before you book this camp-out' : 'Before you book your ticket'}
    >
        <div className="px-6 pt-7 pb-6 space-y-5">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary-100 flex items-center justify-center">
              <Tent size={22} className="text-primary-800" />
            </div>
            <h2 id="campout-guest-reqs-title" className="font-heading text-xl font-bold text-neutral-900">
              {isCampout ? 'Before you book this camp-out' : 'Before you book your ticket'}
            </h2>
            <p className="text-sm text-neutral-500 leading-relaxed">
              {isCampout
                ? 'Camp-outs are catered and remote, so our leaders need your dietary and medical/allergy info and an emergency contact before you book. Only event leaders can see it.'
                : 'Our leaders need your dietary and medical/allergy info and an emergency contact before you book, so we can cater safely, be ready for allergies, and reach someone if we have to. Only event leaders can see it.'}
            </p>
          </div>

          <div className="space-y-1.5">
            <Input
              type="textarea"
              label="Dietary requirements"
              value={dietary}
              onChange={(e) => { setDietary(e.target.value); if (error) setError(null) }}
              placeholder="e.g. Vegetarian, gluten free, vegan..."
              rows={2}
              maxLength={500}
            />
            <button
              type="button"
              disabled={submitting}
              onClick={() => { setDietary(NO_DIETARY_SENTINEL); if (error) setError(null) }}
              className="text-xs font-medium text-neutral-500 underline underline-offset-2"
            >
              No dietary requirements
            </button>
          </div>

          <div className="space-y-1.5">
            <Input
              type="textarea"
              label="Medical / allergy info"
              value={medical}
              onChange={(e) => { setMedical(e.target.value); if (error) setError(null) }}
              placeholder="e.g. Asthma, EpiPen for nut allergy..."
              rows={2}
              maxLength={500}
            />
            <button
              type="button"
              disabled={submitting}
              onClick={() => { setMedical(NO_MEDICAL_SENTINEL); if (error) setError(null) }}
              className="text-xs font-medium text-neutral-500 underline underline-offset-2"
            >
              No medical needs or allergies
            </button>
          </div>

          <div className="space-y-2.5 rounded-md border border-neutral-100 bg-neutral-50/60 p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              Emergency contact
            </p>
            <Input
              label="Their name"
              value={emergencyName}
              onChange={(e) => { setEmergencyName(e.target.value); if (error) setError(null) }}
              placeholder="e.g. Sam Rivers"
              maxLength={120}
            />
            <Input
              type="tel"
              label="Their phone"
              value={emergencyPhone}
              onChange={(e) => { setEmergencyPhone(e.target.value); if (error) setError(null) }}
              placeholder="e.g. 0400 000 000"
              maxLength={40}
            />
            <Input
              label="Relationship (optional)"
              value={emergencyRelationship}
              onChange={(e) => { setEmergencyRelationship(e.target.value); if (error) setError(null) }}
              placeholder="e.g. Partner, parent, friend"
              maxLength={80}
            />
          </div>

          {error && <p className="text-xs text-error-500">{error}</p>}

          <div className="space-y-2.5">
            <Button variant="primary" fullWidth loading={submitting} onClick={handleContinue}>
              Continue to payment
            </Button>
            <Button variant="ghost" fullWidth disabled={submitting} onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
    </Modal>
  )
}
