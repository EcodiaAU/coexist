import { useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Phone } from 'lucide-react'
import { Input } from '@/components/input'
import { Button } from '@/components/button'
import { isValidPhone } from '@/lib/validation'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

interface StepPhoneProps {
  phone: string
  onChange: (phone: string) => void
  onNext: () => void
}

/**
 * Mobile number, collected inline during onboarding so it's asked ONCE, in the
 * flow, instead of ambushing the user with a blocking PhoneGate modal the
 * moment they land in the app (Tate 2026-07-26: "do it all at once"). The gate
 * (src/components/phone-gate.tsx) stays as a backstop for legacy users who
 * onboarded before this step existed - a new user who fills this in never
 * triggers it. Phone is a required safety field (leaders reach attendees on
 * event day), so this step has no skip.
 */
export function StepPhone({ phone, onChange, onNext }: StepPhoneProps) {
  const shouldReduceMotion = useReducedMotion()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  function handleContinue() {
    // Read the live DOM value (belt-and-braces vs any pending IME state) so a
    // valid number can never be stranded behind a stale parent value.
    const live = (inputRef.current?.value ?? phone).trim()
    if (!isValidPhone(live)) {
      setError('Please enter a valid mobile number')
      inputRef.current?.focus()
      return
    }
    setError(null)
    if (live !== phone) onChange(live)
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
          <Phone className="w-7 h-7 text-neutral-400" />
        </motion.div>

        <motion.h2 variants={fadeUp} className="font-heading text-2xl font-bold text-neutral-900">
          What's your mobile number?
        </motion.h2>
        <motion.p variants={fadeUp} className="mt-2 text-neutral-500 leading-relaxed">
          We ask everyone for a mobile number for safety, so event leaders can reach you on the day
          of events you're attending.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-8">
          <Input
            ref={inputRef}
            type="tel"
            label="Mobile number"
            value={phone}
            onChange={(e) => {
              onChange(e.target.value)
              if (error) setError(null)
            }}
            placeholder="0400 000 000 or +44 7911 123456"
            helperText="Any country's number works. Include the country code (like +44) if you're outside Australia."
            inputMode="tel"
            autoComplete="tel"
            enterKeyHint="done"
            maxLength={20}
            error={error ?? undefined}
          />
        </motion.div>
      </motion.div>

      <div
        className="py-6 space-y-3"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <Button variant="primary" size="lg" fullWidth onClick={handleContinue}>
          Continue
        </Button>
      </div>
    </div>
  )
}
