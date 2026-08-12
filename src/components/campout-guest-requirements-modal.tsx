import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Tent } from 'lucide-react'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
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
  onSubmit: (values: { dietary: string; medical: string }) => void
}

export function CampoutGuestRequirementsModal({ open, submitting, isCampout, onClose, onSubmit }: Props) {
  const [dietary, setDietary] = useState('')
  const [medical, setMedical] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleContinue = useCallback(() => {
    const dietaryValue = dietary.trim()
    const medicalValue = medical.trim()
    if (!dietaryValue) {
      setError('Tell us your dietary requirements, or tap "None"')
      return
    }
    if (!medicalValue) {
      setError('Tell us your medical / allergy info, or tap "None"')
      return
    }
    setError(null)
    onSubmit({ dietary: dietaryValue, medical: medicalValue })
  }, [dietary, medical, onSubmit])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="campout-guest-reqs-title"
    >
      <div className="fixed inset-0 bg-black/60" aria-hidden="true" onClick={submitting ? undefined : onClose} />

      <div
        className="relative w-full sm:max-w-md max-h-full overflow-y-auto bg-white rounded-t-md sm:rounded-md shadow-sm flex flex-col"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1.5rem)' }}
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
                ? 'Camp-outs are catered and remote, so our leaders need your dietary and medical/allergy info before you book. Only event leaders can see it.'
                : 'Our leaders need your dietary and medical/allergy info before you book, so we can cater safely and be ready for allergies. Only event leaders can see it.'}
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
      </div>
    </div>,
    document.body,
  )
}
