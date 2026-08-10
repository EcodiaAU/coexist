import { useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Input } from '@/components/input'
import { Button } from '@/components/button'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

interface StepNameHandleProps {
  displayName: string
  instagramHandle?: string
  onChange: (name: string, handle?: string) => void
  onNext: () => void
}

export function StepNameHandle({ displayName, onChange, onNext }: StepNameHandleProps) {
  const shouldReduceMotion = useReducedMotion()
  const inputRef = useRef<HTMLInputElement>(null)

  // iOS autocorrect keeps a one-word entry (like a first name) in an OPEN IME
  // composition until a space/punctuation is typed or the field blurs. The
  // shared <Input> deliberately withholds its upward onChange during
  // composition (to protect the Android GBoard buffer, see input.tsx), so the
  // parent's `displayName` can still be empty at the moment the user taps
  // Continue - which, when the button was `disabled={!displayName.trim()}`,
  // ate the tap and produced the "I typed my name but can't continue" report
  // (Co-Exist Vic, iPhone, 2026-07-26). Fix: never disable Continue; read the
  // LIVE DOM value on tap so a pending composition can't strand us, and flush
  // it upward before advancing.
  function handleContinue() {
    const live = (inputRef.current?.value ?? displayName).trim()
    if (!live) {
      inputRef.current?.focus()
      return
    }
    if (live !== displayName) onChange(live)
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
          What should we call you?
        </motion.h2>
        <motion.p variants={fadeUp} className="mt-2 text-neutral-500">
          This is how you'll appear in your collective.
        </motion.p>

        <motion.div variants={fadeUp} className="mt-8 space-y-4">
          <Input
            ref={inputRef}
            label="Display name"
            value={displayName}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="name"
            autoCapitalize="words"
            enterKeyHint="done"
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
        {/* No "Skip" here: a display name is identity-defining and cheap to
            provide. Skipping stranded the user as the literal "New User" in
            their collective + group chats with no later nudge (O2). */}
      </div>
    </div>
  )
}
