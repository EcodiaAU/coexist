import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Tent } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { useToast } from '@/components/toast'
import { NO_DIETARY_SENTINEL, NO_MEDICAL_SENTINEL } from '@/lib/dietary'

/* ------------------------------------------------------------------ */
/*  Camp-out requirements modal (captured at purchase)                 */
/*                                                                     */
/*  Shown before a camp-out ticket checkout when the buyer is missing  */
/*  dietary and/or medical info. It BLOCKS the purchase: the buyer     */
/*  cannot reach Stripe checkout until both required fields are         */
/*  answered (an explicit "None" is a valid answer, a blank is not).   */
/*  On save it persists to the buyer's profile and invokes onSaved,    */
/*  which continues to checkout. It is dismissable (Cancel) - unlike   */
/*  the app-open DietaryGate backstop - because no ticket exists yet.  */
/* ------------------------------------------------------------------ */

interface Props {
  open: boolean
  needDietary: boolean
  needMedical: boolean
  onClose: () => void
  onSaved: () => void
}

export function CampoutRequirementsModal({ open, needDietary, needMedical, onClose, onSaved }: Props) {
  const { user, refreshProfile } = useAuth()
  const { toast } = useToast()
  const [dietary, setDietary] = useState('')
  const [medical, setMedical] = useState('')
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
      onSaved()
    } catch {
      toast.error('Could not save. Please try again.')
      setSaving(false)
    }
  }, [user, needDietary, needMedical, dietary, medical, refreshProfile, onSaved, toast])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="campout-reqs-title"
    >
      <div className="fixed inset-0 bg-black/60" aria-hidden="true" onClick={saving ? undefined : onClose} />

      <div
        className="relative w-full sm:max-w-md max-h-full overflow-y-auto bg-surface-0 rounded-t-md sm:rounded-md shadow-sm flex flex-col"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1.5rem)' }}
      >
        <div className="px-6 pt-7 pb-6 space-y-5">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary-100 flex items-center justify-center">
              <Tent size={22} className="text-primary-800" />
            </div>
            <h2 id="campout-reqs-title" className="font-heading text-xl font-bold text-neutral-900">
              Before you book this camp-out
            </h2>
            <p className="text-sm text-neutral-500 leading-relaxed">
              Camp-outs are catered and remote, so our leaders need your dietary
              and medical/allergy info before you book. Only event leaders can
              see it.
            </p>
          </div>

          {needDietary && (
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
                disabled={saving}
                onClick={() => { setDietary(NO_DIETARY_SENTINEL); if (error) setError(null) }}
                className="text-xs font-medium text-neutral-500 underline underline-offset-2"
              >
                No dietary requirements
              </button>
            </div>
          )}

          {needMedical && (
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
                disabled={saving}
                onClick={() => { setMedical(NO_MEDICAL_SENTINEL); if (error) setError(null) }}
                className="text-xs font-medium text-neutral-500 underline underline-offset-2"
              >
                No medical needs or allergies
              </button>
            </div>
          )}

          {error && <p className="text-xs text-error-500">{error}</p>}

          <div className="space-y-2.5">
            <Button
              variant="primary"
              fullWidth
              loading={saving}
              onClick={handleSave}
            >
              Save and continue to payment
            </Button>
            <Button
              variant="ghost"
              fullWidth
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
