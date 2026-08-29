import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ShieldCheck } from 'lucide-react'
import { Input } from '@/components/input'
import { Button } from '@/components/button'
import { FourWheelDriveField, FOUR_WHEEL_DRIVE_HELP } from '@/components/four-wheel-drive-field'
import { NO_DIETARY_SENTINEL, NO_MEDICAL_SENTINEL } from '@/lib/dietary'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

export interface SafetyIntake {
  dietary: string
  medical: string
  emergencyName: string
  emergencyPhone: string
  emergencyRelationship: string
  fourWheelDrive: boolean | null
}

interface StepSafetyProps {
  value: SafetyIntake
  onChange: (patch: Partial<SafetyIntake>) => void
  onNext: () => void
  onSkip: () => void
}

/**
 * The combined safety intake, asked ONCE at onboarding (Tate 2026-08-30:
 * "this all needs to be done at the same point and preferably this would have
 * been done before at onboarding").
 *
 * Four things, one screen: dietary requirements, medical and allergy info, an
 * emergency contact, and whether the person has a four-wheel drive. Before
 * this step they were collected in three different places and only ever from
 * people who had already reached a checkout, which is why coverage sat at 119
 * dietary and 76 medical answers against 2,581 profiles on 2026-08-30.
 *
 * SKIPPABLE, on purpose. Every field here is needed by someone holding a seat
 * at a real event, and nobody else; hard-requiring an emergency contact from a
 * stranger who has just made an account is friction paid at the top of the
 * funnel for data we do not yet need. The enforcement point is the ticket
 * purchase gate in event-detail, which is not skippable, and the app-open
 * backstop in dietary-gate, which is not dismissable. This step exists so that
 * by the time someone buys, they have usually already answered.
 *
 * Partial answers are kept. A user who fills in dietary and skips the rest has
 * their dietary answer saved, and the later gates ask only for what is still
 * missing.
 */
export function StepSafety({ value, onChange, onNext, onSkip }: StepSafetyProps) {
  const shouldReduceMotion = useReducedMotion()
  const [error, setError] = useState<string | null>(null)

  function handleContinue() {
    // The one rule: an emergency contact needs a name AND a number, because a
    // contact you cannot ring is not a contact (the same predicate the gates
    // enforce, hasEmergencyContact). Half a contact is worse than none,
    // because it looks answered on a roster.
    const name = value.emergencyName.trim()
    const phone = value.emergencyPhone.trim()
    if ((name && !phone) || (phone && !name)) {
      setError('An emergency contact needs both a name and a phone number')
      return
    }
    setError(null)
    onNext()
  }

  return (
    <div className="flex-1 flex flex-col px-4 pt-8">
      <motion.div
        className="flex-1"
        variants={shouldReduceMotion ? undefined : stagger}
        initial="hidden"
        animate="visible"
      >
        <motion.div
          variants={fadeUp}
          className="w-14 h-14 rounded-full bg-neutral-50 flex items-center justify-center mb-6"
        >
          <ShieldCheck className="w-7 h-7 text-neutral-400" />
        </motion.div>

        <motion.h2 variants={fadeUp} className="font-heading text-2xl font-bold text-neutral-900">
          A few things for event day
        </motion.h2>
        <motion.p variants={fadeUp} className="mt-2 text-neutral-500 leading-relaxed">
          Our leaders cater the food, carry the first-aid kit and plan the drive in. Answering now
          means you are never asked at the checkout. Only event leaders can see any of it.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-8 space-y-5">
          <div className="space-y-1.5">
            <Input
              type="textarea"
              label="Dietary requirements"
              value={value.dietary}
              onChange={(e) => { onChange({ dietary: e.target.value }); if (error) setError(null) }}
              placeholder="e.g. Vegetarian, gluten free, vegan..."
              rows={2}
              maxLength={500}
            />
            <button
              type="button"
              onClick={() => onChange({ dietary: NO_DIETARY_SENTINEL })}
              className="text-xs font-medium text-neutral-500 underline underline-offset-2"
            >
              No dietary requirements
            </button>
          </div>

          <div className="space-y-1.5">
            <Input
              type="textarea"
              label="Medical / allergy info"
              value={value.medical}
              onChange={(e) => { onChange({ medical: e.target.value }); if (error) setError(null) }}
              placeholder="e.g. Asthma, EpiPen for nut allergy..."
              rows={2}
              maxLength={500}
            />
            <button
              type="button"
              onClick={() => onChange({ medical: NO_MEDICAL_SENTINEL })}
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
              value={value.emergencyName}
              onChange={(e) => { onChange({ emergencyName: e.target.value }); if (error) setError(null) }}
              placeholder="e.g. Sam Rivers"
              maxLength={120}
            />
            <Input
              type="tel"
              label="Their phone"
              value={value.emergencyPhone}
              onChange={(e) => { onChange({ emergencyPhone: e.target.value }); if (error) setError(null) }}
              placeholder="e.g. 0400 000 000"
              inputMode="tel"
              maxLength={40}
            />
            <Input
              label="Relationship (optional)"
              value={value.emergencyRelationship}
              onChange={(e) => onChange({ emergencyRelationship: e.target.value })}
              placeholder="e.g. Partner, parent, friend"
              maxLength={80}
            />
          </div>

          <FourWheelDriveField
            value={value.fourWheelDrive}
            onChange={(v) => { onChange({ fourWheelDrive: v }); if (error) setError(null) }}
            helpText={FOUR_WHEEL_DRIVE_HELP}
          />

          {error && <p className="text-xs text-error-500">{error}</p>}
        </motion.div>
      </motion.div>

      <div
        className="py-6 space-y-3"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <Button variant="primary" size="lg" fullWidth onClick={handleContinue}>
          Continue
        </Button>
        <Button variant="ghost" size="lg" fullWidth onClick={onSkip}>
          I'll do this later
        </Button>
      </div>
    </div>
  )
}
