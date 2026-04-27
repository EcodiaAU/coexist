import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { MapPin } from 'lucide-react'
import { Button } from '@/components/button'
import { PlaceAutocomplete } from '@/components/place-autocomplete'
import type { PlaceResult } from '@/components/place-autocomplete'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

interface StepLocationProps {
  location: string
  onChange: (location: string, point: { lat: number; lng: number } | null) => void
  onNext: () => void
  onSkip: () => void
}

export function StepLocation({ location, onChange, onNext, onSkip }: StepLocationProps) {
  const [query, setQuery] = useState(location)
  const shouldReduceMotion = useReducedMotion()

  function handleChange(value: string, place: PlaceResult | null) {
    setQuery(value)
    onChange(value, place ? { lat: place.lat, lng: place.lng } : null)
  }

  return (
    <div className="flex-1 flex flex-col px-4 pt-8">
      <motion.div
        className="flex-1"
        variants={shouldReduceMotion ? undefined : stagger}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={fadeUp} className="w-14 h-14 rounded-full bg-neutral-50 flex items-center justify-center mb-6">
          <MapPin className="w-7 h-7 text-neutral-400" />
        </motion.div>

        <motion.h2 variants={fadeUp} className="font-heading text-2xl font-bold text-neutral-900">
          Where are you based?
        </motion.h2>
        <motion.p variants={fadeUp} className="mt-2 text-neutral-500 leading-relaxed">
          We'll suggest nearby collectives and events in your area.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-8">
          <PlaceAutocomplete
            label="Suburb or city"
            value={query}
            onChange={handleChange}
            placeholder="e.g. Byron Bay, NSW"
          />
        </motion.div>
      </motion.div>

      <div
        className="py-6 space-y-3"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <Button variant="primary" size="lg" fullWidth onClick={onNext} disabled={!query.trim()}>
          Continue
        </Button>
        <Button variant="ghost" size="lg" fullWidth onClick={onSkip}>
          Skip for now
        </Button>
      </div>
    </div>
  )
}
