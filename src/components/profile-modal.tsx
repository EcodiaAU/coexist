import { type ReactNode } from 'react'
import {
  MapPin,
  Instagram,
  Calendar,
  Clock,
  TreePine,
  Users,
  Trash2,
  Sprout,
  Bird,
  Ruler,
  User,
  Mail,
  Phone,
  Shield,
  Heart,
  Accessibility,
  Utensils,
} from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { BottomSheet } from '@/components/bottom-sheet'
import { Avatar } from '@/components/avatar'
import { Chip } from '@/components/chip'
import { StatCard } from '@/components/stat-card'
import { Skeleton } from '@/components/skeleton'
import { cn } from '@/lib/cn'
import { parseLocationPoint } from '@/lib/geo'
import { MapView } from '@/components'
import { useProfile, useProfileCollectives, useProfileStats, useMutualConnections } from '@/hooks/use-profile'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'
import { REDACTED_PLACEHOLDER } from '@/lib/profile-visibility'
import { prettyInterestLabel } from '@/lib/interests'

function ProfileModalSkeleton() {
  return (
    <div data-eos-id="src/components/profile-modal.tsx#0" data-eos-v="2" className="space-y-6 py-4">
      <div data-eos-id="src/components/profile-modal.tsx#1" className="flex flex-col items-center gap-3">
        <Skeleton data-eos-id="src/components/profile-modal.tsx#2" variant="avatar" className="h-24 w-24" />
        <Skeleton data-eos-id="src/components/profile-modal.tsx#3" variant="title" className="w-40" />
        <Skeleton data-eos-id="src/components/profile-modal.tsx#4" variant="text" className="w-24" />
      </div>
      <div data-eos-id="src/components/profile-modal.tsx#5" className="grid grid-cols-3 gap-3">
        <Skeleton data-eos-id="src/components/profile-modal.tsx#6" variant="stat-card" />
        <Skeleton data-eos-id="src/components/profile-modal.tsx#7" variant="stat-card" />
        <Skeleton data-eos-id="src/components/profile-modal.tsx#8" variant="stat-card" />
      </div>
      <Skeleton data-eos-id="src/components/profile-modal.tsx#9" variant="card" className="h-24" />
      <Skeleton data-eos-id="src/components/profile-modal.tsx#10" variant="card" className="h-16" />
    </div>
  )
}

const TINT_COLORS = {
  primary: 'bg-primary-100 text-primary-600',
  sky: 'bg-sky-100 text-sky-600',
  moss: 'bg-moss-100 text-moss-600',
  sprout: 'bg-sprout-100 text-sprout-600',
  plum: 'bg-plum-100 text-plum-600',
} as const

function DetailRow({ icon, label, value, tint = 'primary' }: { icon: ReactNode; label: string; value: string; tint?: keyof typeof TINT_COLORS }) {
  return (
    <div data-eos-id="src/components/profile-modal.tsx#11" className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100 last:border-b-0">
      <div data-eos-id="src/components/profile-modal.tsx#12" className={cn('flex items-center justify-center w-7 h-7 rounded-sm shrink-0', TINT_COLORS[tint])}>
        {icon}
      </div>
      <div data-eos-id="src/components/profile-modal.tsx#13" className="flex-1 min-w-0">
        <p data-eos-id="src/components/profile-modal.tsx#14" className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">{label}</p>
        <p data-eos-id="src/components/profile-modal.tsx#15" className="text-sm font-semibold text-neutral-900 truncate">{value}</p>
      </div>
    </div>
  )
}

interface ProfileModalProps {
  userId: string | null
  open: boolean
  onClose: () => void
}

export function ProfileModal({ userId, open, onClose }: ProfileModalProps) {
  const { data: profile, isLoading, isError, isFetched } = useProfile(userId ?? undefined)
  const showLoading = useDelayedLoading(isLoading && !!userId)
  const { data: collectives } = useProfileCollectives(userId ?? undefined)
  const { data: stats } = useProfileStats(userId ?? undefined)
  const { data: mutualData } = useMutualConnections(userId ?? '')
  const shouldReduceMotion = useReducedMotion()
  // Distinguish in-flight loading from terminal "could not load" - the
  // previous logic conflated both behind `isError || !profile`, which
  // caused a flash of "Could not load profile" during the first ~1s of
  // every open across all roles (useDelayedLoading returns
  // isLoading && show, where show only flips true after a 1000ms delay).
  // See fork_moy0mxm3 1.8.5 item 8 fix.
  const isStillLoading = (isLoading || !isFetched) && !!userId


  const memberSince = profile
    ? new Date(profile.created_at ?? '').toLocaleDateString('en-AU', {
        month: 'long',
        year: 'numeric',
      })
    : ''

  // viewer_can_see_sensitive is set by useProfile (own=true, staff=true,
  // non-staff non-self=false). For backward-compat treat undefined as
  // visible (own profile path).
  const canSeeSensitive = profile?.viewer_can_see_sensitive !== false
  const hasDetails = profile && canSeeSensitive && (
    profile.first_name || profile.email || profile.phone ||
    profile.age || profile.postcode || profile.gender
  )

  return (
    <BottomSheet data-eos-id="src/components/profile-modal.tsx#16" open={open} onClose={onClose} snapPoints={[0.92]}>
      {isStillLoading ? (
        // Render the skeleton always while loading. We still gate the
        // VISIBLE skeleton behind useDelayedLoading so fast loads don't
        // flash a skeleton; the brief delay window renders an empty
        // placeholder rather than the "Could not load profile" empty state.
        showLoading ? <ProfileModalSkeleton data-eos-id="src/components/profile-modal.tsx#17" /> : <div data-eos-id="src/components/profile-modal.tsx#18" className="py-16" />
      ) : isError ? (
        <div data-eos-id="src/components/profile-modal.tsx#19" className="flex flex-col items-center justify-center py-16 gap-3 text-neutral-500">
          <User data-eos-id="src/components/profile-modal.tsx#20" size={32} className="text-neutral-300" />
          <p data-eos-id="src/components/profile-modal.tsx#21" className="text-sm">Could not load profile</p>
          <p data-eos-id="src/components/profile-modal.tsx#22" className="text-xs text-neutral-400">Try closing and reopening</p>
        </div>
      ) : !profile ? (
        <div data-eos-id="src/components/profile-modal.tsx#23" className="flex flex-col items-center justify-center py-16 gap-3 text-neutral-500">
          <User data-eos-id="src/components/profile-modal.tsx#24" size={32} className="text-neutral-300" />
          <p data-eos-id="src/components/profile-modal.tsx#25" className="text-sm">User not found</p>
        </div>
      ) : (
        <motion.div data-eos-id="src/components/profile-modal.tsx#26"
          variants={shouldReduceMotion ? undefined : stagger}
          initial="hidden"
          animate="visible"
          className="pb-6"
        >
          {/* Profile Header */}
          <motion.div data-eos-id="src/components/profile-modal.tsx#27" variants={fadeUp} className="flex flex-col items-center pt-2 pb-4">
            <Avatar data-eos-id="src/components/profile-modal.tsx#28" src={profile.avatar_url} name={profile.display_name ?? ''} size="xl" />

            <h2 data-eos-id="src/components/profile-modal.tsx#29" data-eos-var="profile.display_name" data-eos-var-label="Display name" data-eos-var-scope="prop" className="mt-3 font-heading text-xl font-bold text-neutral-900">
              {profile.display_name}
            </h2>
            {profile.pronouns && (
              <span data-eos-id="src/components/profile-modal.tsx#30" data-eos-var="profile.pronouns" data-eos-var-label="Pronouns" data-eos-var-scope="prop" className="text-sm text-neutral-500">{profile.pronouns}</span>
            )}

            {profile.bio && (
              <p data-eos-id="src/components/profile-modal.tsx#31" data-eos-var="profile.bio" data-eos-var-label="Bio" data-eos-var-scope="prop" className="mt-3 text-center text-sm text-neutral-500 max-w-xs leading-relaxed">
                {profile.bio}
              </p>
            )}

            <div data-eos-id="src/components/profile-modal.tsx#32" className="mt-3 flex flex-wrap items-center justify-center gap-3">
              {/* Location is staff-only PII (suburb/town); hidden from non-staff viewers */}
              {canSeeSensitive && profile.location && (
                <span data-eos-id="src/components/profile-modal.tsx#33" data-eos-var="profile.location" data-eos-var-label="Location" data-eos-var-scope="prop" className="flex items-center gap-1 text-sm text-neutral-500">
                  <MapPin data-eos-id="src/components/profile-modal.tsx#34" size={14} />
                  {profile.location}
                </span>
              )}
              {profile.instagram_handle && (
                <a data-eos-href="dynamic" data-eos-href-label="Instagram handle" data-eos-href-scope="prop" data-eos-id="src/components/profile-modal.tsx#35" data-eos-var="profile.instagram_handle" data-eos-var-label="Instagram handle" data-eos-var-scope="prop"
                  href={`https://instagram.com/${profile.instagram_handle.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-600 transition-colors min-h-11"
                >
                  <Instagram data-eos-id="src/components/profile-modal.tsx#36" size={14} />
                  {profile.instagram_handle.startsWith('@')
                    ? profile.instagram_handle
                    : `@${profile.instagram_handle}`}
                </a>
              )}
            </div>

            <p data-eos-id="src/components/profile-modal.tsx#37" className="mt-2 text-xs text-neutral-500">Member since {memberSince}</p>
          </motion.div>

          {/* Mutual Connections */}
          {mutualData && (mutualData.sharedCollectives.length > 0 || mutualData.sharedEventCount > 0) && (
            <motion.div data-eos-id="src/components/profile-modal.tsx#38" variants={fadeUp} className="mt-2 rounded-sm bg-surface-0 shadow-sm px-4 py-3">
              <div data-eos-id="src/components/profile-modal.tsx#39" className="flex items-center gap-2 text-sm text-neutral-500">
                <Users data-eos-id="src/components/profile-modal.tsx#40" size={16} />
                <div data-eos-id="src/components/profile-modal.tsx#41">
                  {mutualData.sharedCollectives.length > 0 && (
                    <p data-eos-id="src/components/profile-modal.tsx#42">
                      You&apos;re both in{' '}
                      <span data-eos-id="src/components/profile-modal.tsx#43" data-eos-var="mutualData.sharedCollectives" data-eos-var-label="Shared collectives" data-eos-var-scope="prop" className="font-semibold">
                        {mutualData.sharedCollectives.map((c) => c.name).join(', ')}
                      </span>
                    </p>
                  )}
                  {mutualData.sharedEventCount > 0 && (
                    <p data-eos-id="src/components/profile-modal.tsx#44">
                      You&apos;ve attended{' '}
                      <span data-eos-id="src/components/profile-modal.tsx#45" data-eos-var="mutualData.sharedEventCount" data-eos-var-label="Shared event count" data-eos-var-scope="prop" className="font-semibold">{mutualData.sharedEventCount} events</span>{' '}
                      together
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Stats - compact 3-col so values don't clip on the right edge
              of the modal's narrow width. */}
          <motion.div data-eos-id="src/components/profile-modal.tsx#46" variants={fadeUp} className="mt-6 grid grid-cols-3 gap-2.5">
            <StatCard data-eos-id="src/components/profile-modal.tsx#47" compact value={stats?.eventsAttended ?? 0} label="Events" icon={<Calendar data-eos-id="src/components/profile-modal.tsx#48" size={16} />} />
            <StatCard data-eos-id="src/components/profile-modal.tsx#49" compact value={stats?.hoursVolunteered ?? 0} label="Hours" icon={<Clock data-eos-id="src/components/profile-modal.tsx#50" size={16} />} />
            <StatCard data-eos-id="src/components/profile-modal.tsx#51" compact value={stats?.treesPlanted ?? 0} label="Trees" icon={<TreePine data-eos-id="src/components/profile-modal.tsx#52" size={16} />} />
            {(stats?.rubbishCollectedKg ?? 0) > 0 && (
              <StatCard data-eos-id="src/components/profile-modal.tsx#53" compact value={stats?.rubbishCollectedKg ?? 0} label="Litter (kg)" icon={<Trash2 data-eos-id="src/components/profile-modal.tsx#54" size={16} />} />
            )}
            {(stats?.areaRestoredSqm ?? 0) > 0 && (
              <StatCard data-eos-id="src/components/profile-modal.tsx#55" compact value={stats?.areaRestoredSqm ?? 0} label="Area (sqm)" icon={<Ruler data-eos-id="src/components/profile-modal.tsx#56" size={16} />} />
            )}
            {(stats?.nativePlants ?? 0) > 0 && (
              <StatCard data-eos-id="src/components/profile-modal.tsx#57" compact value={stats?.nativePlants ?? 0} label="Native Plants" icon={<Sprout data-eos-id="src/components/profile-modal.tsx#58" size={16} />} />
            )}
            {(stats?.wildlifeSightings ?? 0) > 0 && (
              <StatCard data-eos-id="src/components/profile-modal.tsx#59" compact value={stats?.wildlifeSightings ?? 0} label="Wildlife" icon={<Bird data-eos-id="src/components/profile-modal.tsx#60" size={16} />} />
            )}
          </motion.div>

          {/* Personal Details */}
          {hasDetails && (
            <motion.section data-eos-id="src/components/profile-modal.tsx#61" variants={fadeUp} className="mt-6">
              <h3 data-eos-id="src/components/profile-modal.tsx#62" className="font-heading text-base font-semibold text-neutral-900 mb-3 flex items-center gap-2">
                <div data-eos-id="src/components/profile-modal.tsx#63" className="flex items-center justify-center w-6 h-6 rounded-md bg-primary-600 text-white">
                  <User data-eos-id="src/components/profile-modal.tsx#64" size={13} />
                </div>
                Details
              </h3>
              <div data-eos-id="src/components/profile-modal.tsx#65" className="rounded-md bg-white shadow-sm border border-neutral-100 overflow-hidden">
                {(profile.first_name || profile.last_name) && (
                  <DetailRow data-eos-id="src/components/profile-modal.tsx#66" icon={<User data-eos-id="src/components/profile-modal.tsx#67" size={14} />} label="Name" value={[profile.first_name, profile.last_name].filter(Boolean).join(' ')} tint="primary" />
                )}
                {profile.email && (
                  <DetailRow data-eos-id="src/components/profile-modal.tsx#68" icon={<Mail data-eos-id="src/components/profile-modal.tsx#69" size={14} />} label="Email" value={profile.email} tint="sky" />
                )}
                {profile.phone && (
                  <DetailRow data-eos-id="src/components/profile-modal.tsx#70" icon={<Phone data-eos-id="src/components/profile-modal.tsx#71" size={14} />} label="Phone" value={profile.phone} tint="moss" />
                )}
                {(profile.age || profile.gender) && (
                  <DetailRow data-eos-id="src/components/profile-modal.tsx#72"
                    icon={<Calendar data-eos-id="src/components/profile-modal.tsx#73" size={14} />}
                    label="Age / Gender"
                    value={[profile.age && `Age ${profile.age}`, profile.gender].filter(Boolean).join(' · ')}
                    tint="sprout"
                  />
                )}
                {profile.postcode && (
                  <DetailRow data-eos-id="src/components/profile-modal.tsx#74" icon={<MapPin data-eos-id="src/components/profile-modal.tsx#75" size={14} />} label="Postcode" value={profile.postcode} tint="plum" />
                )}
                {profile.accessibility_requirements && (
                  <DetailRow data-eos-id="src/components/profile-modal.tsx#76" icon={<Accessibility data-eos-id="src/components/profile-modal.tsx#77" size={14} />} label="Accessibility" value={profile.accessibility_requirements} tint="moss" />
                )}
                {profile.dietary_requirements && (
                  <DetailRow data-eos-id="src/components/profile-modal.tsx#78" icon={<Utensils data-eos-id="src/components/profile-modal.tsx#79" size={14} />} label="Dietary" value={profile.dietary_requirements} tint="sprout" />
                )}
              </div>
            </motion.section>
          )}

          {/* Privacy notice - shown to non-staff viewers in place of sensitive sections */}
          {!canSeeSensitive && (
            <motion.section data-eos-id="src/components/profile-modal.tsx#80" variants={fadeUp} className="mt-6">
              <div data-eos-id="src/components/profile-modal.tsx#81" className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 flex items-start gap-3">
                <div data-eos-id="src/components/profile-modal.tsx#82" className="flex items-center justify-center w-7 h-7 rounded-sm shrink-0 bg-neutral-200 text-neutral-600">
                  <Shield data-eos-id="src/components/profile-modal.tsx#83" size={14} />
                </div>
                <div data-eos-id="src/components/profile-modal.tsx#84" className="flex-1">
                  <p data-eos-id="src/components/profile-modal.tsx#85" className="text-sm font-semibold text-neutral-900">Personal details hidden</p>
                  <p data-eos-id="src/components/profile-modal.tsx#86" className="text-xs text-neutral-600 mt-0.5">
                    {REDACTED_PLACEHOLDER} - leaders can see contact and emergency info; participants only see public profile.
                  </p>
                </div>
              </div>
            </motion.section>
          )}

          {/* Emergency Contact (staff-tier only) */}
          {canSeeSensitive && profile.emergency_contact_name && (
            <motion.section data-eos-id="src/components/profile-modal.tsx#87" variants={fadeUp} className="mt-5">
              <h3 data-eos-id="src/components/profile-modal.tsx#88" className="font-heading text-base font-semibold text-neutral-900 mb-3 flex items-center gap-2">
                <div data-eos-id="src/components/profile-modal.tsx#89" className="flex items-center justify-center w-6 h-6 rounded-md bg-warning-600 text-white">
                  <Shield data-eos-id="src/components/profile-modal.tsx#90" size={13} />
                </div>
                Emergency Contact
              </h3>
              <div data-eos-id="src/components/profile-modal.tsx#91" className="rounded-md overflow-hidden bg-white border border-neutral-100 shadow-sm">
                <div data-eos-id="src/components/profile-modal.tsx#92" className="p-4">
                  <div data-eos-id="src/components/profile-modal.tsx#93" className="flex items-start gap-3">
                    <div data-eos-id="src/components/profile-modal.tsx#94" className="shrink-0 w-10 h-10 rounded-full bg-warning-50 flex items-center justify-center">
                      <Heart data-eos-id="src/components/profile-modal.tsx#95" size={18} className="text-warning-600" />
                    </div>
                    <div data-eos-id="src/components/profile-modal.tsx#96" className="flex-1 min-w-0">
                      <p data-eos-id="src/components/profile-modal.tsx#97" data-eos-var="profile.emergency_contact_name" data-eos-var-label="Emergency contact name" data-eos-var-scope="prop" className="text-sm font-bold text-neutral-900">
                        {profile.emergency_contact_name}
                      </p>
                      {profile.emergency_contact_relationship && (
                        <p data-eos-id="src/components/profile-modal.tsx#98" data-eos-var="profile.emergency_contact_relationship" data-eos-var-label="Emergency contact relationship" data-eos-var-scope="prop" className="text-xs text-warning-700 font-medium">{profile.emergency_contact_relationship}</p>
                      )}
                      {profile.emergency_contact_phone && (
                        <p data-eos-id="src/components/profile-modal.tsx#99" data-eos-var="profile.emergency_contact_phone" data-eos-var-label="Emergency contact phone" data-eos-var-scope="prop" className="text-sm text-primary-700 flex items-center gap-1.5 mt-1 font-medium">
                          <Phone data-eos-id="src/components/profile-modal.tsx#100" size={13} className="text-warning-600" />
                          {profile.emergency_contact_phone}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>
          )}

          {/* Collectives */}
          {collectives && collectives.length > 0 && (
            <motion.section data-eos-id="src/components/profile-modal.tsx#101" variants={fadeUp} className="mt-6">
              <h3 data-eos-id="src/components/profile-modal.tsx#102" className="font-heading text-base font-semibold text-neutral-900 mb-3">
                Collectives
              </h3>
              <div data-eos-id="src/components/profile-modal.tsx#103" className="flex flex-wrap gap-2">
                {collectives.map((membership) => {
                  const collective = membership.collectives as { name: string } | null
                  return (
                    <Chip data-eos-id="src/components/profile-modal.tsx#104" key={membership.collective_id} label={collective?.name ?? ''} selected />
                  )
                })}
              </div>
            </motion.section>
          )}

          {/* Interests */}
          {profile.interests && profile.interests.length > 0 && (
            <motion.section data-eos-id="src/components/profile-modal.tsx#105" variants={fadeUp} className="mt-6">
              <h3 data-eos-id="src/components/profile-modal.tsx#106" className="font-heading text-base font-semibold text-neutral-900 mb-3">
                Interests
              </h3>
              <div data-eos-id="src/components/profile-modal.tsx#107" className="flex flex-wrap gap-2">
                {profile.interests.map((interest) => (
                  <Chip data-eos-id="src/components/profile-modal.tsx#108" key={interest} label={prettyInterestLabel(interest)} selected />
                ))}
              </div>
            </motion.section>
          )}

          {/* Location mini-map (staff-only - geo PII) */}
          {canSeeSensitive && (() => {
            const pos = parseLocationPoint(profile.location_point)
            if (!pos) return null
            return (
              <motion.section data-eos-id="src/components/profile-modal.tsx#109" variants={fadeUp} className="mt-6">
                <h3 data-eos-id="src/components/profile-modal.tsx#110" className="font-heading text-base font-semibold text-neutral-900 mb-3">
                  Location
                </h3>
                <MapView data-eos-id="src/components/profile-modal.tsx#111"
                  center={pos}
                  zoom={12}
                  markers={[{ id: userId ?? 'user', position: pos, variant: 'default', label: profile.location ?? undefined }]}
                  interactive={false}
                  aria-label={`${profile.display_name ?? 'User'} location`}
                  className="h-40 rounded-md"
                />
              </motion.section>
            )
          })()}
        </motion.div>
      )}
    </BottomSheet>
  )
}
