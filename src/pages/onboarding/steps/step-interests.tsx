import { motion, useReducedMotion } from 'framer-motion'
import { Trees, Waves, Sprout, Leaf, Fence, Flashlight, MoreHorizontal } from 'lucide-react'
import { Chip } from '@/components/chip'
import { Button } from '@/components/button'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

const INTERESTS = [
  { id: 'clean_up', label: 'Clean Up', icon: <Waves size={16} /> },
  { id: 'tree_planting', label: 'Tree Planting', icon: <Trees size={16} /> },
  { id: 'ecosystem_restoration', label: 'Ecosystem Restoration', icon: <Sprout size={16} /> },
  { id: 'nature_hike', label: 'Nature Hike', icon: <Leaf size={16} /> },
  { id: 'camp_out', label: 'Camp Out', icon: <Fence size={16} /> },
  { id: 'spotlighting', label: 'Spotlighting', icon: <Flashlight size={16} /> },
  { id: 'other', label: 'Other', icon: <MoreHorizontal size={16} /> },
]

interface StepInterestsProps {
  selected: string[]
  onChange: (interests: string[]) => void
  onNext: () => void
  onSkip: () => void
}

export function StepInterests({ selected, onChange, onNext, onSkip }: StepInterestsProps) {
  const shouldReduceMotion = useReducedMotion()

  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id],
    )
  }

  return (
    <div className="flex-1 flex flex-col px-4 pt-8 min-h-0">
      <motion.div
        className="flex-1"
        variants={shouldReduceMotion ? undefined : stagger}
        initial="hidden"
        animate="visible"
      >
        <motion.h2 variants={fadeUp} className="font-heading text-2xl font-bold text-neutral-900">
          What are you into?
        </motion.h2>
        <motion.p variants={fadeUp} className="mt-2 text-neutral-500">
          Pick the conservation activities that excite you. Choose as many as you like.
        </motion.p>

        <div className="mt-8 flex flex-wrap gap-2.5" role="listbox" aria-multiselectable="true">
          {INTERESTS.map((interest) => (
            <motion.div key={interest.id} variants={fadeUp}>
            <Chip
              label={interest.label}
              icon={interest.icon}
              selected={selected.includes(interest.id)}
              onSelect={() => toggle(interest.id)}
            />
            </motion.div>
          ))}
        </div>
      </motion.div>

      <div
        className="py-6 space-y-3"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <Button variant="primary" size="lg" fullWidth onClick={onNext} disabled={selected.length === 0}>
          Continue
        </Button>
        <Button variant="ghost" size="lg" fullWidth onClick={onSkip}>
          Skip for now
        </Button>
      </div>
    </div>
  )
}
