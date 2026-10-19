import { useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Input } from '@/components/input'
import { Button } from '@/components/button'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

interface StepNameHandleProps {
  firstName: string
  lastName: string
  onChange: (firstName: string, lastName: string) => void
  onNext: () => void
}

/**
 * First AND last name, both required (Jess Ditchfield via Tate, 2026-10-19:
 * "can we make last name mandatory when creating an account"). Google and
 * Apple sign-ups never see the email form, so this is where they give it.
 */
export function StepNameHandle({ firstName, lastName, onChange, onNext }: StepNameHandleProps) {
  const shouldReduceMotion = useReducedMotion()
  const firstRef = useRef<HTMLInputElement>(null)
  const lastRef = useRef<HTMLInputElement>(null)

  // iOS autocorrect keeps a one-word entry (like a first name) in an OPEN IME
  // composition until a space/punctuation is typed or the field blurs. The
  // shared <Input> deliberately withholds its upward onChange during
  // composition (to protect the Android GBoard buffer, see input.tsx), so the
  // parent's value can still be empty at the moment the user taps Continue -
  // which, when the button was disabled on an empty name, ate the tap and
  // produced the "I typed my name but can't continue" report (Co-Exist Vic,
  // iPhone, 2026-07-26). Fix: never disable Continue; read the LIVE DOM values
  // on tap so a pending composition can't strand us, and flush them upward
  // before advancing. A last name is one word too, so it gets the same read.
  function handleContinue() {
    const liveFirst = (firstRef.current?.value ?? firstName).trim()
    const liveLast = (lastRef.current?.value ?? lastName).trim()
    if (!liveFirst) {
      firstRef.current?.focus()
      return
    }
    if (!liveLast) {
      lastRef.current?.focus()
      return
    }
    if (liveFirst !== firstName || liveLast !== lastName) onChange(liveFirst, liveLast)
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
        <motion.h2 variants={fadeUp} className="font-heading text-2xl font-bold text-neutral-900">
          What's your name?
        </motion.h2>
        <motion.p variants={fadeUp} className="mt-2 text-neutral-500">
          Your leaders use your full name to find you on the day.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-8 space-y-4">
          <Input
            ref={firstRef}
            label="First name"
            value={firstName}
            onChange={(e) => onChange(e.target.value, lastName)}
            autoComplete="given-name"
            autoCapitalize="words"
            enterKeyHint="next"
            maxLength={50}
          />
          <Input
            ref={lastRef}
            label="Last name"
            value={lastName}
            onChange={(e) => onChange(firstName, e.target.value)}
            autoComplete="family-name"
            autoCapitalize="words"
            enterKeyHint="done"
            maxLength={50}
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
        {/* No "Skip" here: a name is identity-defining and cheap to provide.
            Skipping stranded the user as the literal "New User" in their
            collective + group chats with no later nudge (O2). */}
      </div>
    </div>
  )
}
