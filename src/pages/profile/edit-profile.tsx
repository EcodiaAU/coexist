import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
    Camera,
    User, Shield,
    Heart,
    Sparkles,
    Compass,
    Accessibility,
    Utensils
} from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Avatar } from '@/components/avatar'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { DateInput } from '@/components/date-input'
import { Chip } from '@/components/chip'
import { Skeleton } from '@/components/skeleton'
import { UploadProgress } from '@/components/upload-progress'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { useAuth } from '@/hooks/use-auth'
import { useProfile, useUpdateProfile } from '@/hooks/use-profile'
import { useCamera } from '@/hooks/use-camera'
import { useImageUpload } from '@/hooks/use-image-upload'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { PlaceAutocomplete } from '@/components/place-autocomplete'
import { calculateAge } from '@/lib/date-format'

const INTEREST_OPTIONS = [
  'Tree Planting',
  'Beach Cleanup',
  'Habitat Restoration',
  'Wildlife Surveys',
  'Nature Walks',
  'Education',
  'Seed Collecting',
  'Weed Removal',
  'Waterway Cleanup',
  'Community Gardens',
  'Photography',
  'Citizen Science',
]

const DISCOVERY_OPTIONS = [
  'Social media',
  'Friend or family',
  'School or uni',
  'Web search',
  'Event or festival',
  'News or media',
  'Other',
]

/* ------------------------------------------------------------------ */
/*  Section card wrapper                                               */
/* ------------------------------------------------------------------ */

function SectionCard({
  icon,
  iconBg,
  headerBg,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  iconBg: string
  headerBg?: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-md bg-white shadow-sm border border-neutral-100 overflow-hidden">
      {/* Section header - tinted */}
      <div className={cn('flex items-center gap-3 px-4 pt-4 pb-3', headerBg)}>
        <div className={cn('shrink-0 w-9 h-9 rounded-sm flex items-center justify-center', iconBg)}>
          {icon}
        </div>
        <div>
          <h3 className="font-heading text-sm font-bold text-neutral-900">{title}</h3>
          {description && <p className="text-[11px] text-neutral-500 mt-0.5">{description}</p>}
        </div>
      </div>
      {/* Content - py-4 px-2 (was p-4) so inputs aren't double-padded inside
          the card on top of Page's px-4 outer padding. Fields now extend
          closer to the card edge, giving more horizontal room on mobile.
          Tate verbatim 2026-05-28: "nested x padding from the outter card,
          get rid of that so the fields are jsut on the page and a little
          wider". */}
      <div className="py-4 px-2 space-y-3">
        {children}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Input wrapper - shared styling                                     */
/* ------------------------------------------------------------------ */

const inputStyle = '[&_input]:bg-surface-3 [&_textarea]:bg-surface-3'

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function EditProfilePage() {
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const { profile: authProfile } = useAuth()
  const queryClient = useQueryClient()
  const { data: profile, isLoading } = useProfile()
  const showLoading = useDelayedLoading(isLoading)
  const updateProfile = useUpdateProfile()

  const { capture: _capture, pickFromGallery, loading: cameraLoading, error: cameraError } = useCamera()
  const { upload, progress, uploading, error: uploadError } = useImageUpload({ bucket: 'avatars' })
  const {
    upload: uploadCover,
    progress: coverProgress,
    uploading: coverUploading,
    error: coverUploadError,
  } = useImageUpload({ bucket: 'avatars' })
  const { toast } = useToast()

  // Existing fields
  const [displayName, setDisplayName] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [bio, setBio] = useState('')
  const [instagramHandle, setInstagramHandle] = useState('')
  const [location, setLocation] = useState('')
  const [phone, setPhone] = useState('')
  const [interests, setInterests] = useState<string[]>([])

  // New fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [postcode, setPostcode] = useState('')
  const [gender, setGender] = useState('')
  const [email, setEmail] = useState('')
  const [collectiveDiscovery, setCollectiveDiscovery] = useState('')
  const [accessibilityRequirements, setAccessibilityRequirements] = useState('')
  const [dietaryRequirements, setDietaryRequirements] = useState('')
  const [emergencyContactName, setEmergencyContactName] = useState('')
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('')
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState('')

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)

  // Initialize form with profile data
  if (profile && !initialized) {
    setDisplayName(profile.display_name ?? '')
    setPronouns(profile.pronouns ?? '')
    setBio(profile.bio ?? '')
    setInstagramHandle(profile.instagram_handle ?? '')
    setLocation(profile.location ?? '')
    setPhone(profile.phone ?? '')
    setInterests(profile.interests ?? [])
    setFirstName(profile.first_name ?? '')
    setLastName(profile.last_name ?? '')
    setDateOfBirth(profile.date_of_birth ?? '')
    setPostcode(profile.postcode ?? '')
    setGender(profile.gender ?? '')
    setEmail(profile.email ?? '')
    setCollectiveDiscovery(profile.collective_discovery ?? '')
    setAccessibilityRequirements(profile.accessibility_requirements ?? '')
    setDietaryRequirements(profile.dietary_requirements ?? '')
    setEmergencyContactName(profile.emergency_contact_name ?? '')
    setEmergencyContactPhone(profile.emergency_contact_phone ?? '')
    setEmergencyContactRelationship(profile.emergency_contact_relationship ?? '')
    setInitialized(true)
  }

  const stagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.05 } },
  }

  const fadeUp = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  }

  const handleAvatarChange = async () => {
    const result = await pickFromGallery()
    if (!result) {
      if (cameraError) toast.error(cameraError)
      return
    }
    if (!authProfile?.id) return

    // Show preview immediately (optimistic) - both local state and query cache
    const previewUrl = URL.createObjectURL(result.blob)
    setAvatarPreview(previewUrl)
    const previousProfile = queryClient.getQueryData(['profile', authProfile.id])
    queryClient.setQueryData(['profile', authProfile.id], (old: Record<string, unknown> | undefined) =>
      old ? { ...old, avatar_url: previewUrl } : old,
    )

    try {
      const path = `${authProfile.id}/avatar.jpg`
      const uploaded = await upload(result.blob, path)

      // Append cache-buster so CDN/browser always shows the new image
      const bustUrl = `${uploaded.url}?t=${Date.now()}`
      await updateProfile.mutateAsync({ avatar_url: bustUrl })

      toast.success('Avatar updated!')
    } catch {
      // Revert preview on failure
      setAvatarPreview(null)
      queryClient.setQueryData(['profile', authProfile.id], previousProfile)
      toast.error('Failed to upload avatar')
    } finally {
      URL.revokeObjectURL(previewUrl)
    }
  }

  // Cover photo: the member's own hero banner (Jess 2026-08-19). Mirrors the
  // avatar flow - pick, optimistic preview into the query cache, upload to the
  // owner-scoped avatars bucket at cover.jpg, persist cover_image_url. Falls
  // back to a collective landscape / nature gradient when unset (in the hero).
  const handleCoverChange = async () => {
    const result = await pickFromGallery()
    if (!result) {
      if (cameraError) toast.error(cameraError)
      return
    }
    if (!authProfile?.id) return

    const previewUrl = URL.createObjectURL(result.blob)
    setCoverPreview(previewUrl)
    const previousProfile = queryClient.getQueryData(['profile', authProfile.id])
    queryClient.setQueryData(['profile', authProfile.id], (old: Record<string, unknown> | undefined) =>
      old ? { ...old, cover_image_url: previewUrl } : old,
    )

    try {
      const path = `${authProfile.id}/cover.jpg`
      const uploaded = await uploadCover(result.blob, path)
      const bustUrl = `${uploaded.url}?t=${Date.now()}`
      await updateProfile.mutateAsync({ cover_image_url: bustUrl })
      toast.success('Cover photo updated!')
    } catch {
      setCoverPreview(null)
      queryClient.setQueryData(['profile', authProfile.id], previousProfile)
      toast.error('Failed to upload cover photo')
    } finally {
      URL.revokeObjectURL(previewUrl)
    }
  }

  const toggleInterest = (interest: string) => {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest],
    )
  }

  const handleSave = async () => {
    // Mobile number is required for every member - leaders read it on event day.
    if (!phone.trim()) {
      toast.error('Mobile number is required')
      return
    }
    try {
      await updateProfile.mutateAsync({
        display_name: displayName || null,
        pronouns: pronouns || null,
        bio: bio || null,
        instagram_handle: instagramHandle || null,
        location: location || null,
        phone: phone || null,
        interests,
        first_name: firstName || null,
        last_name: lastName || null,
        date_of_birth: dateOfBirth || null,
        age: calculateAge(dateOfBirth),
        postcode: postcode || null,
        gender: gender || null,
        email: email || null,
        collective_discovery: collectiveDiscovery || null,
        accessibility_requirements: accessibilityRequirements || null,
        dietary_requirements: dietaryRequirements || null,
        emergency_contact_name: emergencyContactName || null,
        emergency_contact_phone: emergencyContactPhone || null,
        emergency_contact_relationship: emergencyContactRelationship || null,
        profile_details_completed: true,
      })
      toast.success('Profile updated!')
      setSaved(true)
      navigate('/profile')
    } catch {
      toast.error('Failed to update profile')
    }
  }

  // ----- Unsaved-changes guard -----------------------------------------
  // The form persists only on Save; swipe-back / header-back / a browser
  // refresh silently discarded a half-filled profile. Track dirtiness against
  // the loaded profile and intercept every exit path.
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [saved, setSaved] = useState(false)

  const sortedInterests = (arr: string[]) => [...arr].sort().join('')
  const isDirty =
    initialized &&
    !saved &&
    (displayName !== (profile?.display_name ?? '') ||
      pronouns !== (profile?.pronouns ?? '') ||
      bio !== (profile?.bio ?? '') ||
      instagramHandle !== (profile?.instagram_handle ?? '') ||
      location !== (profile?.location ?? '') ||
      phone !== (profile?.phone ?? '') ||
      sortedInterests(interests) !== sortedInterests(profile?.interests ?? []) ||
      firstName !== (profile?.first_name ?? '') ||
      lastName !== (profile?.last_name ?? '') ||
      dateOfBirth !== (profile?.date_of_birth ?? '') ||
      postcode !== (profile?.postcode ?? '') ||
      gender !== (profile?.gender ?? '') ||
      email !== (profile?.email ?? '') ||
      collectiveDiscovery !== (profile?.collective_discovery ?? '') ||
      accessibilityRequirements !== (profile?.accessibility_requirements ?? '') ||
      dietaryRequirements !== (profile?.dietary_requirements ?? '') ||
      emergencyContactName !== (profile?.emergency_contact_name ?? '') ||
      emergencyContactPhone !== (profile?.emergency_contact_phone ?? '') ||
      emergencyContactRelationship !== (profile?.emergency_contact_relationship ?? ''))

  // Web: browser refresh / tab close prompt while dirty.
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const handleAttemptBack = () => {
    if (isDirty) {
      setShowDiscardConfirm(true)
    } else {
      navigate('/profile')
    }
  }

  if (showLoading) {
    return (
      <Page swipeBack header={<Header title="Edit Profile" back />}>
        <div className="py-4 space-y-4">
          <div className="flex justify-center">
            <Skeleton variant="avatar" className="h-24 w-24" />
          </div>
          <Skeleton variant="text" count={5} />
        </div>
      </Page>
    )
  }

  return (
    <Page
      swipeBack={!isDirty}
      noBackground
      className="bg-neutral-50"
      stickyOverlay={<Header title="" back transparent className="-mb-14" onBack={handleAttemptBack} />}
      footer={
        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={updateProfile.isPending}
          onClick={handleSave}
        >
          Save Changes
        </Button>
      }
    >
      <div className="pb-8">
        {/* Avatar with colourful backdrop */}
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative -mx-4 lg:-mx-6 overflow-hidden"
        >
          <div className="relative py-8">
            {/* Cover photo banner - the member's own hero image (or their
                collective landscape / moss fallback when unset). Tappable to
                replace. */}
            {(coverPreview ?? profile?.cover_image_url) ? (
              <img
                src={coverPreview ?? profile?.cover_image_url ?? undefined}
                alt=""
                className="absolute inset-0 h-full w-full object-cover object-center"
              />
            ) : (
              <div className="absolute inset-0 bg-moss-400" aria-hidden="true" />
            )}
            {/* Legibility scrim over the cover so the avatar + controls read. */}
            <div className="absolute inset-0 bg-black/25" aria-hidden="true" />

            {/* Change cover - top offset respects the safe-area inset so the
                control clears the iOS status bar / dynamic island on native
                (a flat top-2 sat under the notch and was untappable). */}
            <button
              onClick={handleCoverChange}
              disabled={cameraLoading || coverUploading}
              style={{ top: 'max(env(safe-area-inset-top, 0px), 0.5rem)' }}
              className="absolute right-2 z-50 inline-flex items-center gap-1.5 rounded-full bg-black/40 backdrop-blur-sm px-3 h-9 text-white text-xs font-semibold hover:bg-black/55 active:scale-[0.98] transition-[colors,transform] duration-150 disabled:opacity-50"
              aria-label="Change cover photo"
            >
              <Camera size={14} />
              Cover photo
            </button>

            <div className="relative z-10 flex flex-col items-center">
              <div className="relative">
                <div className="ring-4 ring-white/30 rounded-full overflow-hidden flex items-center justify-center aspect-square w-24">
                  <Avatar
                    src={avatarPreview ?? profile?.avatar_url}
                    name={displayName || 'User'}
                    size="xl"
                  />
                </div>
                <button
                  onClick={handleAvatarChange}
                  disabled={cameraLoading || uploading}
                  className="absolute -bottom-1 -right-1 flex items-center justify-center w-11 h-11 rounded-full bg-white shadow-sm text-primary-600 hover:bg-neutral-50 active:scale-[0.98] transition-[colors,transform] duration-150 disabled:opacity-50"
                  aria-label="Change avatar"
                >
                  <Camera size={16} />
                </button>
              </div>
              <UploadProgress
                progress={uploading ? progress : coverProgress}
                uploading={uploading || coverUploading}
                error={uploadError ?? coverUploadError}
                className="mt-2 max-w-[200px]"
              />
              <p className="mt-2 text-xs text-white/80">Tap the camera for your photo, or Cover photo for your banner</p>
            </div>
          </div>
        </motion.div>

        {/* Form sections */}
        <motion.div
          variants={shouldReduceMotion ? undefined : stagger}
          initial="hidden"
          animate="visible"
          className="space-y-4 mt-5"
        >

          {/* ---- Personal Details ---- */}
          <motion.div variants={fadeUp}>
            <SectionCard
              icon={<User size={17} className="text-primary-600" />}
              iconBg="bg-neutral-200"
              headerBg="bg-neutral-50"
              title="Personal Details"
              description="Your identity info - visible to event leaders"
            >
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="First Name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  maxLength={50}
                  className={inputStyle}
                />
                <Input
                  label="Last Name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                  maxLength={50}
                  className={inputStyle}
                />
              </div>
              <Input
                label="Display Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How you appear to others"
                maxLength={50}
                className={inputStyle}
              />
              <Input
                label="Pronouns"
                value={pronouns}
                onChange={(e) => setPronouns(e.target.value)}
                placeholder="e.g. she/her, they/them"
                maxLength={30}
                className={inputStyle}
              />
              <div className="grid grid-cols-2 gap-3">
                <DateInput
                  label="Date of Birth"
                  value={dateOfBirth}
                  onChange={setDateOfBirth}
                  max={new Date().toISOString().split('T')[0]}
                  className={inputStyle}
                />
                <Input
                  label="Gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  placeholder="e.g. Female, Non-binary"
                  maxLength={30}
                  className={inputStyle}
                />
              </div>
              <Input
                label="Contact email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                type="email"
                maxLength={100}
                helperText="A contact email shown to event leaders. This is NOT your login email - change that in Settings > Account > Change Email."
                className={inputStyle}
              />
              <Input
                label="Postcode"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="e.g. 2481"
                maxLength={10}
                className={inputStyle}
              />
            </SectionCard>
          </motion.div>

          {/* ---- About You ---- */}
          <motion.div variants={fadeUp}>
            <SectionCard
              icon={<Sparkles size={17} className="text-sprout-600" />}
              iconBg="bg-sprout-100"
              headerBg="bg-neutral-50"
              title="About You"
              description="Express yourself - shown on your public profile"
            >
              <Input
                label="Bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell people about yourself..."
                type="textarea"
                maxLength={500}
                className={inputStyle}
              />
              <Input
                label="Instagram Handle"
                value={instagramHandle}
                onChange={(e) => setInstagramHandle(e.target.value.replace(/^@+/, ''))}
                placeholder="@coexistaus"
                maxLength={30}
                className={inputStyle}
              />
              <PlaceAutocomplete
                label="Location"
                value={location}
                onChange={(val) => setLocation(val)}
                placeholder="e.g. Byron Bay, NSW"
                className={inputStyle}
              />
              <Input
                label="Mobile number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0400 000 000 or +44 7911 123456"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={20}
                required
                helperText="Any country's number works (include the country code, like +44, if outside Australia). Event leaders reach you on the day."
                className={inputStyle}
              />
            </SectionCard>
          </motion.div>

          {/* ---- How Did You Discover Co-Exist ---- */}
          <motion.div variants={fadeUp}>
            <SectionCard
              icon={<Compass size={17} className="text-sky-600" />}
              iconBg="bg-sky-200/80"
              headerBg="bg-sky-50/60"
              title="How Did You Discover Co-Exist?"
            >
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
            </SectionCard>
          </motion.div>

          {/* ---- Conservation Interests ---- */}
          <motion.div variants={fadeUp}>
            <SectionCard
              icon={<Heart size={17} className="text-moss-600" />}
              iconBg="bg-moss-100"
              headerBg="bg-neutral-50"
              title="Conservation Interests"
              description="Select what excites you most"
            >
              <div className="flex flex-wrap gap-2">
                {INTEREST_OPTIONS.map((interest) => (
                  <Chip
                    key={interest}
                    label={interest}
                    selected={interests.includes(interest)}
                    onSelect={() => toggleInterest(interest)}
                  />
                ))}
              </div>
            </SectionCard>
          </motion.div>

          {/* ---- Accessibility Requirements ---- */}
          <motion.div variants={fadeUp}>
            <SectionCard
              icon={<Accessibility size={17} className="text-plum-600" />}
              iconBg="bg-plum-200/80"
              headerBg="bg-plum-50/60"
              title="Accessibility Requirements"
              description="Let us know so events work for you"
            >
              <Input
                label="Any accessibility needs?"
                value={accessibilityRequirements}
                onChange={(e) => setAccessibilityRequirements(e.target.value)}
                placeholder="e.g. Wheelchair access, hearing loop, visual impairment assistance..."
                type="textarea"
                rows={3}
                maxLength={500}
                className={inputStyle}
              />
            </SectionCard>
          </motion.div>

          {/* ---- Dietary Requirements ---- */}
          <motion.div variants={fadeUp}>
            <SectionCard
              icon={<Utensils size={17} className="text-sprout-600" />}
              iconBg="bg-sprout-200/80"
              headerBg="bg-sprout-50/60"
              title="Dietary Requirements"
              description="So campout catering works for you, no separate form"
            >
              <Input
                label="Dietary requirements (allergies, vegan, etc.)"
                value={dietaryRequirements}
                onChange={(e) => setDietaryRequirements(e.target.value)}
                placeholder="e.g. Vegetarian, gluten free, nut allergy..."
                type="textarea"
                rows={3}
                maxLength={500}
                className={inputStyle}
              />
            </SectionCard>
          </motion.div>

          {/* ---- Emergency Contact ---- */}
          <motion.div variants={fadeUp}>
            <SectionCard
              icon={<Shield size={17} className="text-warning-700" />}
              iconBg="bg-warning-200/80"
              headerBg="bg-warning-50/60"
              title="Emergency Contact"
              description="Shared with event leaders on the day for safety"
            >
              <Input
                label="Contact Name"
                value={emergencyContactName}
                onChange={(e) => setEmergencyContactName(e.target.value)}
                placeholder="Full name"
                maxLength={100}
                className={inputStyle}
              />
              <Input
                label="Contact Phone"
                value={emergencyContactPhone}
                onChange={(e) => setEmergencyContactPhone(e.target.value)}
                placeholder="0400 000 000"
                type="tel"
                maxLength={20}
                className={inputStyle}
              />
              <Input
                label="Relationship"
                value={emergencyContactRelationship}
                onChange={(e) => setEmergencyContactRelationship(e.target.value)}
                placeholder="e.g. Parent, Partner, Friend"
                maxLength={50}
                className={inputStyle}
              />
            </SectionCard>
          </motion.div>

          {/*
            Privacy settings live on /settings/privacy as the canonical surface
            (1.8.4 item 4, fork_motzkqf5_016150). Removed the duplicate inline
            section that was never wired to a save handler. /profile/edit
            stays focused on profile content - identity, bio, interests,
            emergency contacts. Toggles for visibility / marketing / blocked
            users belong with the rest of Settings.
          */}
        </motion.div>
      </div>

      <ConfirmationSheet
        open={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        onConfirm={() => {
          setShowDiscardConfirm(false)
          navigate('/profile')
        }}
        title="Discard changes?"
        description="You have unsaved changes. If you leave now, they'll be lost."
        confirmLabel="Discard"
        variant="danger"
      />
    </Page>
  )
}
