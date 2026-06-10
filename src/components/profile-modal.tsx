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
    <div className="space-y-6 py-4">
      <div className="flex flex-col items-center gap-3">
        <Skeleton variant="avatar" className="h-24 w-24" />
        <Skeleton variant="title" className="w-40" />
        <Skeleton variant="text" className="w-24" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Skeleton variant="stat-card" />
        <Skeleton variant="stat-card" />
        <Skeleton variant="stat-card" />
      </div>
      <Skeleton variant="card" className="h-24" />
      <Skeleton variant="card" className="h-16" />
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
    <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100 last:border-b-0">
      <div className={cn('flex items-center justify-center w-7 h-7 rounded-lg shrink-0', TINT_COLORS[tint])}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-semibold text-neutral-900 truncate">{value}</p>
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
    <BottomSheet open={open} onClose={onClose} snapPoints={[0.92]}>
      {isStillLoading ? (
        // Render the skeleton always while loading. We still gate the
        // VISIBLE skeleton behind useDelayedLoading so fast loads don't
        // flash a skeleton; the brief delay window renders an empty
        // placeholder rather than the "Could not load profile" empty state.
        showLoading ? <ProfileModalSkeleton /> : <div className="py-16" />
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-neutral-500">
          <User size={32} className="text-neutral-300" />
          <p className="text-sm">Could not load profile</p>
          <p className="text-xs text-neutral-400">Try closing and reopening</p>
        </div>
      ) : !profile ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-neutral-500">
          <User size={32} className="text-neutral-300" />
          <p className="text-sm">User not found</p>
        </div>
      ) : (
        <motion.div
          variants={shouldReduceMotion ? undefined : stagger}
          initial="hidden"
          animate="visible"
          className="pb-6"
        >
          {/* Profile Header */}
          <motion.div variants={fadeUp} className="flex flex-col items-center pt-2 pb-4">
            <Avatar src={profile.avatar_url} name={profile.display_name ?? ''} size="xl" />

            <h2 className="mt-3 font-heading text-xl font-bold text-neutral-900">
              {profile.display_name}
            </h2>
            {profile.pronouns && (
              <span className="text-sm text-neutral-500">{profile.pronouns}</span>
            )}

            {profile.bio && (
              <p className="mt-3 text-center text-sm text-neutral-500 max-w-xs leading-relaxed">
                {profile.bio}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
              {/* Location is staff-only PII (suburb/town); hidden from non-staff viewers */}
              {canSeeSensitive && profile.location && (
                <span className="flex items-center gap-1 text-sm text-neutral-500">
                  <MapPin size={14} />
                  {profile.location}
                </span>
              )}
              {profile.instagram_handle && (
                <a
                  href={`https://instagram.com/${profile.instagram_handle.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-600 transition-colors min-h-11"
                >
                  <Instagram size={14} />
                  {profile.instagram_handle.startsWith('@')
                    ? profile.instagram_handle
                    : `@${profile.instagram_handle}`}
                </a>
              )}
            </div>

            <p className="mt-2 text-xs text-neutral-500">Member since {memberSince}</p>
          </motion.div>

          {/* Mutual Connections */}
          {mutualData && (mutualData.sharedCollectives.length > 0 || mutualData.sharedEventCount > 0) && (
            <motion.div variants={fadeUp} className="mt-2 rounded-xl bg-surface-0 shadow-sm px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-neutral-500">
                <Users size={16} />
                <div>
                  {mutualData.sharedCollectives.length > 0 && (
                    <p>
                      You&apos;re both in{' '}
                      <span className="font-semibold">
                        {mutualData.sharedCollectives.map((c) => c.name).join(', ')}
                      </span>
                    </p>
                  )}
                  {mutualData.sharedEventCount > 0 && (
                    <p>
                      You&apos;ve attended{' '}
                      <span className="font-semibold">{mutualData.sharedEventCount} events</span>{' '}
                      together
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Stats - compact 3-col so values don't clip on the right edge
              of the modal's narrow width. */}
          <motion.div variants={fadeUp} className="mt-6 grid grid-cols-3 gap-2.5">
            <StatCard compact value={stats?.eventsAttended ?? 0} label="Events" icon={<Calendar size={16} />} />
            <StatCard compact value={stats?.hoursVolunteered ?? 0} label="Hours" icon={<Clock size={16} />} />
            <StatCard compact value={stats?.treesPlanted ?? 0} label="Trees" icon={<TreePine size={16} />} />
            {(stats?.rubbishCollectedKg ?? 0) > 0 && (
              <StatCard compact value={stats?.rubbishCollectedKg ?? 0} label="Litter (kg)" icon={<Trash2 size={16} />} />
            )}
            {(stats?.areaRestoredSqm ?? 0) > 0 && (
              <StatCard compact value={stats?.areaRestoredSqm ?? 0} label="Area (sqm)" icon={<Ruler size={16} />} />
            )}
            {(stats?.nativePlants ?? 0) > 0 && (
              <StatCard compact value={stats?.nativePlants ?? 0} label="Native Plants" icon={<Sprout size={16} />} />
            )}
            {(stats?.wildlifeSightings ?? 0) > 0 && (
              <StatCard compact value={stats?.wildlifeSightings ?? 0} label="Wildlife" icon={<Bird size={16} />} />
            )}
          </motion.div>

          {/* Personal Details */}
          {hasDetails && (
            <motion.section variants={fadeUp} className="mt-6">
              <h3 className="font-heading text-base font-semibold text-neutral-900 mb-3 flex items-center gap-2">
                <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary-600 text-white">
                  <User size={13} />
                </div>
                Details
              </h3>
              <div className="rounded-2xl bg-white shadow-sm border border-neutral-100 overflow-hidden">
                {(profile.first_name || profile.last_name) && (
                  <DetailRow icon={<User size={14} />} label="Name" value={[profile.first_name, profile.last_name].filter(Boolean).join(' ')} tint="primary" />
                )}
                {profile.email && (
                  <DetailRow icon={<Mail size={14} />} label="Email" value={profile.email} tint="sky" />
                )}
                {profile.phone && (
                  <DetailRow icon={<Phone size={14} />} label="Phone" value={profile.phone} tint="moss" />
                )}
                {(profile.age || profile.gender) && (
                  <DetailRow
                    icon={<Calendar size={14} />}
                    label="Age / Gender"
                    value={[profile.age && `Age ${profile.age}`, profile.gender].filter(Boolean).join(' · ')}
                    tint="sprout"
                  />
                )}
                {profile.postcode && (
                  <DetailRow icon={<MapPin size={14} />} label="Postcode" value={profile.postcode} tint="plum" />
                )}
                {profile.accessibility_requirements && (
                  <DetailRow icon={<Accessibility size={14} />} label="Accessibility" value={profile.accessibility_requirements} tint="moss" />
                )}
              </div>
            </motion.section>
          )}

          {/* Privacy notice - shown to non-staff viewers in place of sensitive sections */}
          {!canSeeSensitive && (
            <motion.section variants={fadeUp} className="mt-6">
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 flex items-start gap-3">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0 bg-neutral-200 text-neutral-600">
                  <Shield size={14} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-neutral-900">Personal details hidden</p>
                  <p className="text-xs text-neutral-600 mt-0.5">
                    {REDACTED_PLACEHOLDER} - leaders can see contact and emergency info; participants only see public profile.
                  </p>
                </div>
              </div>
            </motion.section>
          )}

          {/* Emergency Contact (staff-tier only) */}
          {canSeeSensitive && profile.emergency_contact_name && (
            <motion.section variants={fadeUp} className="mt-5">
              <h3 className="font-heading text-base font-semibold text-neutral-900 mb-3 flex items-center gap-2">
                <div className="flex items-center justify-center w-6 h-6 rounded-md bg-warning-600 text-white">
                  <Shield size={13} />
                </div>
                Emergency Contact
              </h3>
              <div className="rounded-2xl overflow-hidden bg-white border border-neutral-100 shadow-sm">
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 w-10 h-10 rounded-full bg-warning-50 flex items-center justify-center">
                      <Heart size={18} className="text-warning-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-neutral-900">
                        {profile.emergency_contact_name}
                      </p>
                      {profile.emergency_contact_relationship && (
                        <p className="text-xs text-warning-700 font-medium">{profile.emergency_contact_relationship}</p>
                      )}
                      {profile.emergency_contact_phone && (
                        <p className="text-sm text-primary-700 flex items-center gap-1.5 mt-1 font-medium">
                          <Phone size={13} className="text-warning-600" />
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
            <motion.section variants={fadeUp} className="mt-6">
              <h3 className="font-heading text-base font-semibold text-neutral-900 mb-3">
                Collectives
              </h3>
              <div className="flex flex-wrap gap-2">
                {collectives.map((membership) => {
                  const collective = membership.collectives as { name: string } | null
                  return (
                    <Chip key={membership.collective_id} label={collective?.name ?? ''} selected />
                  )
                })}
              </div>
            </motion.section>
          )}

          {/* Interests */}
          {profile.interests && profile.interests.length > 0 && (
            <motion.section variants={fadeUp} className="mt-6">
              <h3 className="font-heading text-base font-semibold text-neutral-900 mb-3">
                Interests
              </h3>
              <div className="flex flex-wrap gap-2">
                {profile.interests.map((interest) => (
                  <Chip key={interest} label={prettyInterestLabel(interest)} selected />
                ))}
              </div>
            </motion.section>
          )}

          {/* Location mini-map (staff-only - geo PII) */}
          {canSeeSensitive && (() => {
            const pos = parseLocationPoint(profile.location_point)
            if (!pos) return null
            return (
              <motion.section variants={fadeUp} className="mt-6">
                <h3 className="font-heading text-base font-semibold text-neutral-900 mb-3">
                  Location
                </h3>
                <MapView
                  center={pos}
                  zoom={12}
                  markers={[{ id: userId ?? 'user', position: pos, variant: 'default', label: profile.location ?? undefined }]}
                  interactive={false}
                  aria-label={`${profile.display_name ?? 'User'} location`}
                  className="h-40 rounded-2xl"
                />
              </motion.section>
            )
          })()}
        </motion.div>
      )}
    </BottomSheet>
  )
}
