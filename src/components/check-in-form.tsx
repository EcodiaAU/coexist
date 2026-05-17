import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, useReducedMotion, AnimatePresence as AnimatePresenceInner } from 'framer-motion'
import {
  WifiOff,
  User,
  AlertTriangle,
  Hash,
} from 'lucide-react'
import { useProfile, useUpdateProfile } from '@/hooks/use-profile'
import { useOffline } from '@/hooks/use-offline'
import { Button } from '@/components/button'
import { Input } from '@/components/input'

/* ------------------------------------------------------------------ */
/*  Profile Details Form                                               */
/* ------------------------------------------------------------------ */

interface ProfileDetailsProps {
  onComplete: () => void
}

export function ProfileDetails({ onComplete }: ProfileDetailsProps) {
  const rm = useReducedMotion()
  const { data: profileData } = useProfile()
  const updateProfile = useUpdateProfile()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('')
  const [email, setEmail] = useState('')
  const [emergencyName, setEmergencyName] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')
  const [emergencyRelationship, setEmergencyRelationship] = useState('')

  // Pre-fill from existing profile
  useEffect(() => {
    if (profileData) {
      setFirstName(profileData.first_name ?? '')
      setLastName(profileData.last_name ?? '')
      setAge(profileData.age != null ? String(profileData.age) : '')
      setGender(profileData.gender ?? '')
      setEmail(profileData.email ?? '')
      setEmergencyName(profileData.emergency_contact_name ?? '')
      setEmergencyPhone(profileData.emergency_contact_phone ?? '')
      setEmergencyRelationship(profileData.emergency_contact_relationship ?? '')
    }
  }, [profileData])

  const detailsValid = firstName.trim() && lastName.trim() && emergencyName.trim() && emergencyPhone.trim()

  const handleSaveDetails = useCallback(async () => {
    try {
      await updateProfile.mutateAsync({
        first_name: firstName || null,
        last_name: lastName || null,
        age: age ? parseInt(age, 10) : null,
        gender: gender || null,
        email: email || null,
        emergency_contact_name: emergencyName || null,
        emergency_contact_phone: emergencyPhone || null,
        emergency_contact_relationship: emergencyRelationship || null,
        profile_details_completed: true,
      })
      onComplete()
    } catch {
      // Stay on details step
    }
  }, [firstName, lastName, age, gender, email, emergencyName, emergencyPhone, emergencyRelationship, updateProfile, onComplete])

  return (
    <motion.div
      key="details"
      initial={rm ? undefined : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={rm ? { opacity: 0 } : { opacity: 0, y: -12 }}
      transition={rm ? { duration: 0 } : { duration: 0.25, ease: 'easeInOut' }}
      className="pb-4"
    >
      <div className="text-center mb-5">
        <div className="w-12 h-12 rounded-full bg-warning-100 flex items-center justify-center mx-auto mb-3">
          <AlertTriangle size={22} className="text-warning-600" />
        </div>
        <h3 className="font-heading text-lg font-bold text-neutral-900">
          Safety details required
        </h3>
        <p className="text-sm text-neutral-500 mt-1 max-w-xs mx-auto">
          We need a few details before you can check in. Your emergency info is only visible to event leaders.
        </p>
      </div>

      <div className="space-y-4 overflow-y-auto px-0.5 -mx-0.5" style={{ maxHeight: 'calc(55vh - var(--kb-height, 0px))' }}>
        {/* Personal */}
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <User size={14} className="text-neutral-500" />
            <h4 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Your Details</h4>
          </div>
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <Input
                label="First Name *"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                maxLength={50}
                className="[&_input]:bg-surface-3"
              />
              <Input
                label="Last Name *"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                maxLength={50}
                className="[&_input]:bg-surface-3"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Input
                label="Age"
                value={age}
                onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))}
                placeholder="Age"
                type="number"
                maxLength={3}
                className="[&_input]:bg-surface-3"
              />
              <Input
                label="Gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                placeholder="e.g. Female"
                maxLength={30}
                className="[&_input]:bg-surface-3"
              />
            </div>
            <Input
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              type="email"
              maxLength={100}
              className="[&_input]:bg-surface-3"
            />
          </div>
        </div>

        {/* Emergency */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <AlertTriangle size={14} className="text-warning-600" />
            <h4 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Emergency Contact *</h4>
          </div>
          <p className="text-[11px] text-neutral-500 mb-2.5">Only visible to event leaders for safety.</p>
          <div className="space-y-2.5">
            <Input
              label="Contact Name *"
              value={emergencyName}
              onChange={(e) => setEmergencyName(e.target.value)}
              placeholder="Full name"
              maxLength={100}
              className="[&_input]:bg-surface-3"
            />
            <Input
              label="Contact Phone *"
              value={emergencyPhone}
              onChange={(e) => setEmergencyPhone(e.target.value)}
              placeholder="0400 000 000"
              type="tel"
              maxLength={20}
              className="[&_input]:bg-surface-3"
            />
            <Input
              label="Relationship"
              value={emergencyRelationship}
              onChange={(e) => setEmergencyRelationship(e.target.value)}
              placeholder="e.g. Parent, Partner"
              maxLength={50}
              className="[&_input]:bg-surface-3"
            />
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!detailsValid}
          loading={updateProfile.isPending}
          onClick={handleSaveDetails}
        >
          Save & Continue to Check In
        </Button>
        {!detailsValid && (
          <p className="text-[11px] text-center text-neutral-500">
            Fill in starred (*) fields to continue
          </p>
        )}
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  3-Digit Code Entry View                                            */
/* ------------------------------------------------------------------ */

interface CheckInModeViewProps {
  eventTitle: string
  collectiveName?: string
  isPending: boolean
  onManualSubmit: (code: string) => void
}

export function CheckInModeView({
  eventTitle,
  collectiveName,
  isPending,
  onManualSubmit,
}: CheckInModeViewProps) {
  const rm = useReducedMotion()
  const { isOffline } = useOffline()
  const [digits, setDigits] = useState(['', '', '', ''])
  const inputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]

  // Focus first input on mount
  useEffect(() => {
    requestAnimationFrame(() => inputRefs[0].current?.focus())
  }, [])

  const codeLength = 3 // default; supports up to 4 if extended codes exist

  const handleDigitChange = useCallback((index: number, value: string) => {
    // Allow alphanumeric characters, auto-uppercase
    const char = value.replace(/[^a-zA-Z0-9]/g, '').slice(-1).toUpperCase()
    setDigits(prev => {
      const next = [...prev]
      next[index] = char
      return next
    })
    // Auto-advance to next input
    if (char && index < 3) {
      inputRefs[index + 1].current?.focus()
    }
  }, [])

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs[index - 1].current?.focus()
    }
  }, [digits])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4)
    if (pasted.length >= 3) {
      const newDigits = ['', '', '', '']
      for (let i = 0; i < pasted.length && i < 4; i++) {
        newDigits[i] = pasted[i]
      }
      setDigits(newDigits)
      // Focus last filled input
      const lastIdx = Math.min(pasted.length - 1, 3)
      inputRefs[lastIdx].current?.focus()
    }
  }, [])

  const code = digits.join('')
  const isComplete = code.length >= codeLength && digits.slice(0, codeLength).every(d => d !== '')

  const handleSubmit = useCallback(() => {
    if (!isComplete) return
    onManualSubmit(code.slice(0, digits[3] ? 4 : 3))
  }, [code, isComplete, digits, onManualSubmit])

  return (
    <motion.div
      key="checkin"
      initial={rm ? undefined : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={rm ? { opacity: 0 } : { opacity: 0, y: -12 }}
      transition={rm ? { duration: 0 } : { duration: 0.25, ease: 'easeInOut' }}
      className="pb-2"
    >
      <AnimatePresenceInner mode="wait" initial={false}>
        <motion.div
          key="code-entry"
          initial={rm ? undefined : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={rm ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={rm ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
          className="py-2"
        >
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-3">
              <Hash size={26} className="text-primary-500" />
            </div>
            <h3 className="font-heading text-lg font-bold text-neutral-900">
              Enter Check-In Code
            </h3>
            <p className="text-sm text-neutral-500 mt-1">
              {eventTitle}
            </p>
            {collectiveName && (
              <p className="text-caption text-neutral-400 mt-0.5">{collectiveName}</p>
            )}
            <p className="text-caption text-neutral-400 mt-2">
              Ask your leader for the 3-character code
            </p>
          </div>

          {isOffline && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-warning-50 text-warning-700 text-sm font-medium mb-4">
              <WifiOff size={16} />
              You're offline. Check-in will be queued and synced later.
            </div>
          )}

          {/* 3-digit PIN entry */}
          <div className="flex justify-center gap-3 mb-6" onPaste={handlePaste}>
            {[0, 1, 2].map((i) => (
              <input
                key={i}
                ref={inputRefs[i]}
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                maxLength={1}
                value={digits[i]}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className="w-16 h-20 text-center text-3xl font-heading font-bold rounded-xl border-2 border-neutral-200 bg-white focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-colors"
                autoComplete="off"
              />
            ))}
          </div>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={isPending}
            disabled={!isComplete}
            onClick={handleSubmit}
          >
            Check In
          </Button>
        </motion.div>
      </AnimatePresenceInner>
    </motion.div>
  )
}
