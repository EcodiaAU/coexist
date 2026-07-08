import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { User, AlertTriangle, Heart, HeartPulse } from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Chip } from '@/components/chip'
import { useToast } from '@/components/toast'
import { useAuth } from '@/hooks/use-auth'
import { useProfile, useUpdateProfile } from '@/hooks/use-profile'
import { supabase } from '@/lib/supabase'
import { isCampoutActivity } from '@/lib/dietary'
import type { Tables } from '@/types/database.types'

type Profile = Tables<'profiles'>

const DISCOVERY_OPTIONS = [
  'Social media',
  'Friend or family',
  'School or uni',
  'Web search',
  'Event or festival',
  'News or media',
  'Other',
]

/**
 * Profile details survey shown after a user's first event check-in.
 * Collects essential information that helps leaders run safe events.
 *
 * Wrapper handles loading state so the form only mounts once profile data
 * is available  useState initializers see the real values.
 */
export default function ProfileSurveyPage() {
  useAuth()
  const { data: profile, isLoading } = useProfile()

  if (isLoading) {
    return (
      <Page swipeBack header={<Header title="Quick Profile Setup" back />}>
        <div className="pt-8 px-4 space-y-4">
          <div className="w-14 h-14 rounded-full bg-primary-100 mx-auto animate-pulse" />
          <div className="h-4 bg-primary-100 rounded animate-pulse w-3/4 mx-auto" />
          <div className="h-4 bg-primary-100 rounded animate-pulse w-1/2 mx-auto" />
        </div>
      </Page>
    )
  }

  // Key by profile.id so if it somehow changes, form resets
  return <ProfileSurveyForm key={profile?.id ?? 'new'} profile={profile ?? null} />
}

/* ------------------------------------------------------------------ */
/*  Form component (only mounts after profile is loaded)               */
/* ------------------------------------------------------------------ */

function ProfileSurveyForm({ profile }: { profile: Profile | null }) {
  const { id: eventId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const updateProfile = useUpdateProfile()
  const { toast } = useToast()

  const [firstName, setFirstName] = useState(profile?.first_name ?? '')
  const [lastName, setLastName] = useState(profile?.last_name ?? '')
  const [age, setAge] = useState(profile?.age != null ? String(profile.age) : '')
  const [postcode, setPostcode] = useState(profile?.postcode ?? '')
  const [gender, setGender] = useState(profile?.gender ?? '')
  const [email, setEmail] = useState(profile?.email ?? '')
  const [pronouns, setPronouns] = useState(profile?.pronouns ?? '')
  const [collectiveDiscovery, setCollectiveDiscovery] = useState(profile?.collective_discovery ?? '')
  const [accessibilityRequirements, setAccessibilityRequirements] = useState(profile?.accessibility_requirements ?? '')
  const [dietaryRequirements, setDietaryRequirements] = useState(profile?.dietary_requirements ?? '')
  const [medicalRequirements, setMedicalRequirements] = useState(profile?.medical_requirements ?? '')
  const [reqError, setReqError] = useState<string | null>(null)
  const [emergencyContactName, setEmergencyContactName] = useState(profile?.emergency_contact_name ?? '')
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(profile?.emergency_contact_phone ?? '')
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState(profile?.emergency_contact_relationship ?? '')

  // Is the event that triggered this survey a camp-out? Camp-outs need
  // dietary + medical on file for catering and safety, so for those the two
  // fields are required here (empty answers must be an explicit "None"/"Nil",
  // never silently blank). For every other event the fields stay optional so
  // a first-time beach-cleanup attendee is not force-gated.
  const { data: isCampout = false } = useQuery({
    queryKey: ['profile-survey-event-activity', eventId],
    queryFn: async () => {
      if (!eventId) return false
      const { data } = await supabase
        .from('events')
        .select('activity_type')
        .eq('id', eventId)
        .maybeSingle()
      return isCampoutActivity(data?.activity_type ?? null)
    },
    enabled: !!eventId,
    staleTime: 5 * 60 * 1000,
  })

  const fadeUp = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  }

  const stagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.06 } },
  }

  const handleSubmit = async () => {
    // Camp-out safety gate: both fields must be answered. An explicit
    // "None"/"Nil" is fine; a blank is not.
    if (isCampout && (!dietaryRequirements.trim() || !medicalRequirements.trim())) {
      setReqError('Camp-outs need your dietary and medical/allergy info. Enter "None" if you have none.')
      return
    }
    setReqError(null)
    try {
      await updateProfile.mutateAsync({
        first_name: firstName || null,
        last_name: lastName || null,
        age: age ? parseInt(age, 10) : null,
        postcode: postcode || null,
        gender: gender || null,
        email: email || null,
        pronouns: pronouns || null,
        collective_discovery: collectiveDiscovery || null,
        accessibility_requirements: accessibilityRequirements || null,
        dietary_requirements: dietaryRequirements || null,
        medical_requirements: medicalRequirements || null,
        emergency_contact_name: emergencyContactName || null,
        emergency_contact_phone: emergencyContactPhone || null,
        emergency_contact_relationship: emergencyContactRelationship || null,
        profile_details_completed: true,
      })
      toast.success('Details saved!')
      navigate(eventId ? `/events/${eventId}` : '/', { replace: true })
    } catch {
      toast.error('Failed to save details')
    }
  }

  const handleSkip = async () => {
    // Mark as completed so they don't get prompted again
    try {
      await updateProfile.mutateAsync({ profile_details_completed: true })
    } catch {
      // Non-critical, just navigate
    }
    navigate(eventId ? `/events/${eventId}` : '/', { replace: true })
  }

  return (
    <Page
      swipeBack
      header={<Header title="Quick Profile Setup" back />}
      footer={
        <div className="space-y-2">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={updateProfile.isPending}
            onClick={handleSubmit}
          >
            Save Details
          </Button>
          {!isCampout && (
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              onClick={handleSkip}
            >
              Skip for now
            </Button>
          )}
        </div>
      }
    >
      <motion.div
        variants={shouldReduceMotion ? undefined : stagger}
        initial="hidden"
        animate="visible"
        className="pt-4 pb-8 space-y-6"
      >
        {/* Intro */}
        <motion.div variants={fadeUp} className="text-center px-4">
          <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-3">
            <Heart size={24} className="text-primary-600" />
          </div>
          <h2 className="font-heading text-lg font-bold text-neutral-900">
            Welcome to your first event!
          </h2>
          <p className="text-sm text-neutral-500 mt-1.5 max-w-xs mx-auto">
            Help us keep you safe by filling in a few quick details. Your emergency info is only visible to event leaders.
          </p>
        </motion.div>

        {/* Personal details */}
        <motion.div variants={fadeUp}>
          <div className="flex items-center gap-2 mb-3">
            <User size={16} className="text-neutral-500" />
            <h3 className="font-heading text-sm font-semibold text-neutral-900 uppercase tracking-wider">
              Your Details
            </h3>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                maxLength={50}
                className="[&_input]:bg-surface-3"
              />
              <Input
                label="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                maxLength={50}
                className="[&_input]:bg-surface-3"
              />
            </div>
            <Input
              label="Pronouns"
              value={pronouns}
              onChange={(e) => setPronouns(e.target.value)}
              placeholder="e.g. she/her, they/them"
              maxLength={30}
              className="[&_input]:bg-surface-3"
            />
            <div className="grid grid-cols-2 gap-3">
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
            <Input
              label="Postcode"
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              placeholder="e.g. 2481"
              maxLength={10}
              className="[&_input]:bg-surface-3"
            />
          </div>
        </motion.div>

        {/* How did you discover Co-Exist */}
        <motion.div variants={fadeUp}>
          <h3 className="font-heading text-sm font-semibold text-primary-800 mb-3 uppercase tracking-wider">
            How Did You Discover Co-Exist?
          </h3>
          <div className="flex flex-wrap gap-2">
            {DISCOVERY_OPTIONS.map((opt) => (
              <Chip
                key={opt}
                label={opt}
                selected={collectiveDiscovery === opt}
                onSelect={() => setCollectiveDiscovery(collectiveDiscovery === opt ? '' : opt)}
              />
            ))}
          </div>
        </motion.div>

        {/* Accessibility */}
        <motion.div variants={fadeUp}>
          <h3 className="font-heading text-sm font-semibold text-primary-800 mb-3 uppercase tracking-wider">
            Accessibility Requirements
          </h3>
          <Input
            label="Any accessibility needs?"
            value={accessibilityRequirements}
            onChange={(e) => setAccessibilityRequirements(e.target.value)}
            placeholder="e.g. Wheelchair access, hearing assistance..."
            type="textarea"
            rows={2}
            maxLength={500}
            className="[&_textarea]:bg-neutral-50 [&_textarea]:border [&_textarea]:border-neutral-200"
          />
        </motion.div>

        {/* Dietary */}
        <motion.div variants={fadeUp}>
          <h3 className="font-heading text-sm font-semibold text-primary-800 mb-3 uppercase tracking-wider">
            Dietary Requirements{isCampout && <span className="text-error-500"> *</span>}
          </h3>
          <Input
            label="Dietary requirements (vegetarian, vegan, etc.)"
            value={dietaryRequirements}
            onChange={(e) => { setDietaryRequirements(e.target.value); if (reqError) setReqError(null) }}
            placeholder='e.g. Vegetarian, gluten free - or "None"'
            type="textarea"
            rows={2}
            maxLength={500}
            className="[&_textarea]:bg-neutral-50 [&_textarea]:border [&_textarea]:border-neutral-200"
          />
        </motion.div>

        {/* Medical / allergies */}
        <motion.div variants={fadeUp}>
          <div className="flex items-center gap-2 mb-3">
            <HeartPulse size={16} className="text-rose-600" />
            <h3 className="font-heading text-sm font-semibold text-primary-800 uppercase tracking-wider">
              Medical &amp; Allergies{isCampout && <span className="text-error-500"> *</span>}
            </h3>
          </div>
          <p className="text-xs text-neutral-500 mb-3">
            Allergies, conditions or medication our leaders should know about. Only visible to event leaders.
          </p>
          <Input
            label="Medical / allergy info"
            value={medicalRequirements}
            onChange={(e) => { setMedicalRequirements(e.target.value); if (reqError) setReqError(null) }}
            placeholder='e.g. Asthma, EpiPen for nut allergy - or "None"'
            type="textarea"
            rows={2}
            maxLength={500}
            className="[&_textarea]:bg-neutral-50 [&_textarea]:border [&_textarea]:border-neutral-200"
          />
          {isCampout && (
            <p className="text-xs text-neutral-500 mt-2">
              Dietary and medical info are required for camp-outs. Enter &quot;None&quot; if you have none.
            </p>
          )}
          {reqError && <p className="text-xs text-error-500 mt-2">{reqError}</p>}
        </motion.div>

        {/* Emergency contact */}
        <motion.div variants={fadeUp}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-warning-600" />
            <h3 className="font-heading text-sm font-semibold text-neutral-900 uppercase tracking-wider">
              Emergency Contact
            </h3>
          </div>
          <p className="text-xs text-neutral-500 mb-3">
            Only visible to event leaders for safety purposes.
          </p>
          <div className="space-y-3">
            <Input
              label="Contact Name"
              value={emergencyContactName}
              onChange={(e) => setEmergencyContactName(e.target.value)}
              placeholder="Full name"
              maxLength={100}
              className="[&_input]:bg-surface-3"
            />
            <Input
              label="Contact Phone"
              value={emergencyContactPhone}
              onChange={(e) => setEmergencyContactPhone(e.target.value)}
              placeholder="0400 000 000"
              type="tel"
              maxLength={20}
              className="[&_input]:bg-surface-3"
            />
            <Input
              label="Relationship"
              value={emergencyContactRelationship}
              onChange={(e) => setEmergencyContactRelationship(e.target.value)}
              placeholder="e.g. Parent, Partner"
              maxLength={50}
              className="[&_input]:bg-surface-3"
            />
          </div>
        </motion.div>
      </motion.div>
    </Page>
  )
}
