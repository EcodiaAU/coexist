/**
 * WalkInSheet — Ad-hoc walk-in form for leaders on event day.
 *
 * Mirrors the field shape of profile-survey.tsx (12 fields). Opened from the
 * event-day footer. Inserts a row into event_walk_ins with created_via='leader_adhoc'.
 *
 * Required: first_name + (email OR phone). Everything else optional.
 * UX: toast on failure, not field-level nag messages (festival-fast).
 */
import { useState } from 'react'
import { useToast } from '@/components/toast'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import { BottomSheet, Button } from '@/components'
import { UserPlus, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface WalkInSheetProps {
  eventId: string
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

/* ------------------------------------------------------------------ */
/*  Field component (keeps template concise)                           */
/* ------------------------------------------------------------------ */

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-wider">
        {label}
        {required && <span className="ml-1 text-error-500">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = cn(
  'w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900',
  'placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-400/40',
  'focus:border-primary-400 transition-colors duration-150',
)

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function WalkInSheet({ eventId, open, onClose, onSuccess }: WalkInSheetProps) {
  const { profile } = useAuth()
  const { toast } = useToast()

  // --- Form state (mirrors profile-survey.tsx 12-field shape) ---
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [age, setAge] = useState('')
  const [postcode, setPostcode] = useState('')
  const [gender, setGender] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [collectiveDiscovery, setCollectiveDiscovery] = useState('')
  const [accessibilityRequirements, setAccessibilityRequirements] = useState('')
  const [emergencyContactName, setEmergencyContactName] = useState('')
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('')
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState('')

  const [submitting, setSubmitting] = useState(false)

  function resetForm() {
    setFirstName('')
    setLastName('')
    setEmail('')
    setPhone('')
    setAge('')
    setPostcode('')
    setGender('')
    setPronouns('')
    setCollectiveDiscovery('')
    setAccessibilityRequirements('')
    setEmergencyContactName('')
    setEmergencyContactPhone('')
    setEmergencyContactRelationship('')
  }

  function handleClose() {
    resetForm()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Required: first_name + at least one of email/phone
    if (!firstName.trim()) {
      toast.error('Name is required')
      return
    }
    if (!email.trim() && !phone.trim()) {
      toast.error('Name + email or phone required')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.from('event_walk_ins').insert({
        event_id: eventId,
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        age: age ? parseInt(age, 10) : null,
        postcode: postcode.trim() || null,
        gender: gender.trim() || null,
        pronouns: pronouns.trim() || null,
        collective_discovery: collectiveDiscovery.trim() || null,
        accessibility_requirements: accessibilityRequirements.trim() || null,
        emergency_contact_name: emergencyContactName.trim() || null,
        emergency_contact_phone: emergencyContactPhone.trim() || null,
        emergency_contact_relationship: emergencyContactRelationship.trim() || null,
        status: 'attended',
        created_via: 'leader_adhoc',
        created_by_user_id: profile?.id ?? null,
      })

      if (error) {
        // Surface day-window trigger error (ERRCODE 22023) and any other DB error
        toast.error(error.message || 'Failed to record walk-in')
        return
      }

      toast.success('Walk-in recorded.')
      resetForm()
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record walk-in')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={handleClose} snapPoints={[0.92]}>
      <form onSubmit={handleSubmit} noValidate className="px-5 pb-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2 pt-1 pb-2">
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary-100">
            <UserPlus size={18} className="text-primary-600" />
          </div>
          <div>
            <p className="font-heading text-base font-bold text-neutral-900">Add Walk-In</p>
            <p className="text-xs text-neutral-500">Record someone who showed up today</p>
          </div>
        </div>

        {/* === Personal details === */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" required>
            <input
              className={inputCls}
              type="text"
              placeholder="Jane"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
            />
          </Field>
          <Field label="Last name">
            <input
              className={inputCls}
              type="text"
              placeholder="Smith"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </Field>
        </div>

        <Field label="Email" required={!phone}>
          <input
            className={inputCls}
            type="email"
            placeholder="jane@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
          />
        </Field>

        <Field label="Phone" required={!email}>
          <input
            className={inputCls}
            type="tel"
            placeholder="0412 345 678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            inputMode="tel"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Age">
            <input
              className={inputCls}
              type="number"
              placeholder="e.g. 28"
              min={0}
              max={120}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              inputMode="numeric"
            />
          </Field>
          <Field label="Postcode">
            <input
              className={inputCls}
              type="text"
              placeholder="4000"
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              inputMode="numeric"
              maxLength={10}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Gender">
            <input
              className={inputCls}
              type="text"
              placeholder="e.g. Female"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            />
          </Field>
          <Field label="Pronouns">
            <input
              className={inputCls}
              type="text"
              placeholder="e.g. she/her"
              value={pronouns}
              onChange={(e) => setPronouns(e.target.value)}
            />
          </Field>
        </div>

        <Field label="How did you hear about us?">
          <input
            className={inputCls}
            type="text"
            placeholder="e.g. Instagram, friend, Facebook"
            value={collectiveDiscovery}
            onChange={(e) => setCollectiveDiscovery(e.target.value)}
          />
        </Field>

        <Field label="Accessibility needs">
          <input
            className={inputCls}
            type="text"
            placeholder="Any requirements we should know about?"
            value={accessibilityRequirements}
            onChange={(e) => setAccessibilityRequirements(e.target.value)}
          />
        </Field>

        {/* === Emergency contact === */}
        <div className="rounded-xl border border-warning-200 bg-warning-50 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-warning-600 shrink-0" />
            <p className="text-xs font-semibold text-warning-700 uppercase tracking-wider">
              Emergency Contact
            </p>
          </div>
          <Field label="Name">
            <input
              className={inputCls}
              type="text"
              placeholder="Contact name"
              value={emergencyContactName}
              onChange={(e) => setEmergencyContactName(e.target.value)}
            />
          </Field>
          <Field label="Phone">
            <input
              className={inputCls}
              type="tel"
              placeholder="0400 000 000"
              value={emergencyContactPhone}
              onChange={(e) => setEmergencyContactPhone(e.target.value)}
              inputMode="tel"
            />
          </Field>
          <Field label="Relationship">
            <input
              className={inputCls}
              type="text"
              placeholder="e.g. Parent, Partner"
              value={emergencyContactRelationship}
              onChange={(e) => setEmergencyContactRelationship(e.target.value)}
            />
          </Field>
        </div>

        {/* Submit */}
        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={submitting}
          icon={<UserPlus size={16} />}
        >
          Record Walk-In
        </Button>
      </form>
    </BottomSheet>
  )
}
