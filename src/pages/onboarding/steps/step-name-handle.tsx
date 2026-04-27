import { motion, useReducedMotion } from 'framer-motion'
import { Input } from '@/components/input'
import { Button } from '@/components/button'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

interface StepNameHandleProps {
  displayName: string
  instagramHandle?: string
  onChange: (name: string, handle?: string) => void
  onNext: () => void
  onSkip: () => void
}

export function StepNameHandle({ displayName, instagramHandle, onChange, onNext, onSkip }: StepNameHandleProps) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <div className="flex-1 flex flex-col px-4 pt-8">
      <motion.div
        className="flex-1"
        variants={shouldReduceMotion ? undefined : stagger}
        initial="hidden"
        animate="visible"
      >
        <motion.h2 variants={fadeUp} className="font-heading text-2xl font-bold text-neutral-900">
          What should we call you?
        </motion.h2>
        <motion.p variants={fadeUp} className="mt-2 text-neutral-500">
          This is how you'll appear in your collective.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-8 space-y-4">
          <Input
            label="Display name"
            value={displayName}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="name"
          />
        </motion.div>
      </motion.div>

      <div
        className="py-6 space-y-3"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <Button variant="primary" size="lg" fullWidth onClick={onNext} disabled={!displayName.trim()}>
          Continue
        </Button>
        <Button variant="ghost" size="lg" fullWidth onClick={onSkip}>
          Skip for now
        </Button>
      </div>
    </div>
  )
}
