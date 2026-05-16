import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
    Camera,
    User, Shield,
    Heart,
    Sparkles,
    Compass,
    Accessibility
} from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Avatar } from '@/components/avatar'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Chip } from '@/components/chip'
import { Skeleton } from '@/components/skeleton'
import { UploadProgress } from '@/components/upload-progress'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { useAuth } from '@/hooks/use-auth'
import { useProfile, useUpdateProfile } from '@/hooks/use-profile'
import { useCamera } from '@/hooks/use-camera'
import { useImageUpload } from '@/hooks/use-image-upload'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { PlaceAutocomplete } from '@/components/place-autocomplete'

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
    <div className="rounded-2xl bg-white shadow-sm border border-neutral-100 overflow-hidden">
      {/* Section header - tinted */}
      <div className={cn('flex items-center gap-3 px-4 pt-4 pb-3', headerBg)}>
        <div className={cn('shrink-0 w-9 h-9 rounded-xl flex items-center justify-center', iconBg)}>
          {icon}
        </div>
        <div>
          <h3 className="font-heading text-sm font-bold text-neutral-900">{title}</h3>
          {description && <p className="text-[11px] text-neutral-500 mt-0.5">{description}</p>}
        </div>
      </div>
      {/* Content */}
      <div className="p-4 space-y-3">
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
  const [age, setAge] = useState('')
  const [postcode, setPostcode] = useState('')
  const [gender, setGender] = useState('')
  const [email, setEmail] = useState('')
  const [collectiveDiscovery, setCollectiveDiscovery] = useState('')
  const [accessibilityRequirements, setAccessibilityRequirements] = useState('')
  const [emergencyContactName, setEmergencyContactName] = useState('')
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('')
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState('')

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
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
    setAge(profile.age != null ? String(profile.age) : '')
    setPostcode(profile.postcode ?? '')
    setGender(profile.gender ?? '')
    setEmail(profile.email ?? '')
    setCollectiveDiscovery(profile.collective_discovery ?? '')
    setAccessibilityRequirements(profile.accessibility_requirements ?? '')
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

  const toggleInterest = (interest: string) => {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest],
    )
  }

  const handleSave = async () => {
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
        age: age ? parseInt(age, 10) : null,
        postcode: postcode || null,
        gender: gender || null,
        email: email || null,
        collective_discovery: collectiveDiscovery || null,
        accessibility_requirements: accessibilityRequirements || null,
        emergency_contact_name: emergencyContactName || null,
        emergency_contact_phone: emergencyContactPhone || null,
        emergency_contact_relationship: emergencyContactRelationship || null,
        profile_details_completed: true,
      })
      toast.success('Profile updated!')
      navigate('/profile')
    } catch {
      toast.error('Failed to update profile')
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
      swipeBack
      noBackground
      className="bg-neutral-50"
      stickyOverlay={<Header title="" back transparent className="-mb-14" />}
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
          <div className="bg-gradient-to-br from-primary-500 via-primary-400 to-moss-400 py-8">
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
                  className="absolute -bottom-1 -right-1 flex items-center justify-center w-11 h-11 rounded-full bg-white shadow-sm text-primary-600 hover:bg-neutral-50 active:scale-[0.93] transition-[colors,transform] duration-150 disabled:opacity-50"
                  aria-label="Change avatar"
                >
                  <Camera size={16} />
                </button>
              </div>
              <UploadProgress
                progress={progress}
                uploading={uploading}
                error={uploadError}
                className="mt-2 max-w-[200px]"
              />
              <p className="mt-2 text-xs text-white/60">Tap the camera to change your photo</p>
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
                <Input
                  label="Age"
                  value={age}
                  onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))}
                  placeholder="Age"
                  type="number"
                  maxLength={3}
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
                label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                type="email"
                maxLength={100}
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
                label="Phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0400 000 000"
                type="tel"
                maxLength={20}
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
    </Page>
  )
}
