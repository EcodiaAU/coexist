import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
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
  Waves,
  Flag,
  ShieldOff,
  Phone,
  Heart,
  Shield,
} from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Avatar } from '@/components/avatar'
import { Chip } from '@/components/chip'
import { BentoStatCard, BentoStatGrid } from '@/components/bento-stats'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { ReportContentSheet } from '@/components/report-content-sheet'
import { BlockUserSheet } from '@/components/block-user-sheet'
import { parseLocationPoint } from '@/lib/geo'
import { MapView } from '@/components'
import { useAuth } from '@/hooks/use-auth'
import { useProfile, useProfileCollectives, useProfileStats, useMutualConnections } from '@/hooks/use-profile'
import { useIsBlocked } from '@/hooks/use-user-blocks'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { REDACTED_PLACEHOLDER } from '@/lib/profile-visibility'

function ViewProfileSkeleton() {
  return (
    <div className="space-y-6 py-6">
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
    </div>
  )
}

export default function ViewProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const { user } = useAuth()
  const { data: profile, isLoading, isError, isFetched, refetch } = useProfile(userId)
  const showLoading = useDelayedLoading(isLoading)
  const { data: collectives } = useProfileCollectives(userId)
  const { data: stats } = useProfileStats(userId)
  const { data: mutualData } = useMutualConnections(userId ?? '')
  const isBlocked = useIsBlocked(userId)
  const isOwnProfile = user?.id === userId
  // Defense-in-depth tier flag from get_user_profile_v1 RPC. The DB drops
  // sensitive fields to NULL for non-staff viewers; this flag drives the
  // [redacted]-style UI gating so a non-staff viewer sees an explicit
  // privacy notice rather than blank fields.
  const canSeeSensitive = profile?.viewer_can_see_sensitive !== false

  const [showReportSheet, setShowReportSheet] = useState(false)
  const [showBlockSheet, setShowBlockSheet] = useState(false)

  // Loading state. We render the skeleton ALWAYS while the query is
  // in-flight (not gated by useDelayedLoading - see fork_moy0mxm3 1.8.5
  // item 8 fix). The previous logic gated the skeleton behind a 1000ms
  // delay AND fell through to the "User not found" empty state during the
  // pre-delay window, which surfaced as a permanent-looking false negative
  // across all roles when react-query was warming the cache or the RPC was
  // slower than 1s. Use showLoading only to UPGRADE from blank-page to
  // skeleton on slow networks; render NOTHING (just the page chrome)
  // during the brief delay window so we never flash "User not found" while
  // we are actually still loading.
  if (isLoading) {
    return (
      <Page swipeBack header={<Header title="Profile" back />}>
        {showLoading ? <ViewProfileSkeleton /> : null}
      </Page>
    )
  }

  // Error state. Distinct from "user not found" - the RPC errored (network,
  // auth, transient DB), so surface a retry rather than telling the user
  // their friend doesn't exist.
  if (isError) {
    return (
      <Page swipeBack header={<Header title="Profile" back />}>
        <EmptyState
          illustration="error"
          title="Could not load profile"
          description="Something went wrong fetching this profile. Try again."
          action={{ label: 'Retry', onClick: () => refetch() }}
        />
      </Page>
    )
  }

  // Not-found: the query finished, no error, but the RPC returned NULL -
  // either the target user has no profile row, or the caller is
  // unauthenticated. Only render this AFTER isFetched=true so we never
  // collide with the loading window above.
  if (isFetched && !profile) {
    return (
      <Page swipeBack header={<Header title="Profile" back />}>
        <EmptyState
          illustration="error"
          title="User not found"
          description="This profile doesn't exist or has been removed"
          action={{ label: 'Go Back', onClick: () => navigate(-1) }}
        />
      </Page>
    )
  }
  if (!profile) {
    // Defensive belt-and-braces: if isFetched is false but profile is also
    // falsy and we are not loading or erroring, show the page chrome only.
    return <Page swipeBack header={<Header title="Profile" back />} />
  }

  const stagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.04 } },
  }

  const fadeUp = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  }

  const memberSince = new Date(profile.created_at ?? Date.now()).toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <Page swipeBack header={<Header title={profile.display_name ?? 'Profile'} back />}>
      <motion.div variants={shouldReduceMotion ? undefined : stagger} initial="hidden" animate="visible" className="pb-8">
        {/* Profile Header */}
        <motion.div
          variants={fadeUp}
          className="flex flex-col items-center pt-6 pb-4"
        >
          <Avatar
            src={profile.avatar_url}
            name={profile.display_name ?? ''}
            size="xl"
          />

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
                className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-600 transition-colors"
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
          <motion.div
            variants={fadeUp}
            className="mt-2 rounded-xl bg-surface-0 shadow-sm px-4 py-3"
          >
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

        {/* Stats */}
        <motion.div variants={fadeUp} className="mt-6">
          <BentoStatGrid>
            <BentoStatCard value={stats?.eventsAttended ?? 0} label="Events" icon={<Calendar size={18} />} theme="warning" />
            <BentoStatCard value={stats?.hoursVolunteered ?? 0} label="Hours" icon={<Clock size={16} />} unit="hrs" theme="primary" />
            <BentoStatCard value={stats?.treesPlanted ?? 0} label="Trees" icon={<TreePine size={16} />} theme="sprout" />
            {(stats?.rubbishCollectedKg ?? 0) > 0 && (
              <BentoStatCard value={stats?.rubbishCollectedKg ?? 0} label="Litter Removed" icon={<Trash2 size={16} />} unit="kg" theme="sky" />
            )}
          </BentoStatGrid>
        </motion.div>

        {/* Collectives */}
        {collectives && collectives.length > 0 && (
          <motion.section
            variants={fadeUp}
            className="mt-6"
          >
            <h3 className="font-heading text-base font-semibold text-neutral-900 mb-3">
              Collectives
            </h3>
            <div className="flex flex-wrap gap-2">
              {collectives.map((membership) => {
                const collective = membership.collectives as { name: string } | null
                return (
                  <Chip
                    key={membership.collective_id}
                    label={collective?.name ?? ''}
                    selected
                  />
                )
              })}
            </div>
          </motion.section>
        )}


        {/* Interests */}
        {profile.interests && profile.interests.length > 0 && (
          <motion.section
            variants={fadeUp}
            className="mt-6"
          >
            <h3 className="font-heading text-base font-semibold text-neutral-900 mb-3">
              Interests
            </h3>
            <div className="flex flex-wrap gap-2">
              {profile.interests.map((interest) => (
                <Chip key={interest} label={interest} selected />
              ))}
            </div>
          </motion.section>
        )}

        {/* Privacy notice for non-staff viewers (replaces sensitive sections) */}
        {!isOwnProfile && !canSeeSensitive && (
          <motion.section variants={fadeUp} className="mt-6">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 flex items-start gap-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0 bg-neutral-200 text-neutral-600">
                <ShieldOff size={14} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-neutral-900">Personal details hidden</p>
                <p className="text-xs text-neutral-600 mt-0.5">
                  {REDACTED_PLACEHOLDER} - leaders can see contact, location and emergency info; participants only see public profile.
                </p>
              </div>
            </div>
          </motion.section>
        )}

        {/* Emergency contact (staff-tier only). Always visible to staff
             (assist_leader / co_leader / leader / national_leader / manager
             / admin) and self - this section never honours a "private
             profile" toggle. Origin: Tate verbatim 17:19 AEST 9 May 2026
             "emergency contact always visible to leaders and admin". The
             RPC layer (get_user_profile_v1) gates emergency_contact_*
             fields by v_can_see_sensitive which is is_self OR
             is_collective_staff_or_above; this UI is a presentation mirror
             of that invariant. */}
        {canSeeSensitive && profile.emergency_contact_name && (
          <motion.section variants={fadeUp} className="mt-6">
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
                      <a
                        href={`tel:${profile.emergency_contact_phone}`}
                        className="text-sm text-primary-700 flex items-center gap-1.5 mt-1 font-medium hover:text-primary-800 active:scale-[0.98] transition-transform"
                      >
                        <Phone size={13} className="text-warning-600" />
                        {profile.emergency_contact_phone}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.section>
        )}

        {/* Location mini-map (staff-only - geo PII) */}
        {canSeeSensitive && (() => {
          const pos = parseLocationPoint(profile.location_point)
          if (!pos) return null
          return (
            <motion.section
              variants={fadeUp}
              className="mt-6"
            >
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

        {/* Report & Block actions (only for other users) */}
        {!isOwnProfile && userId && (
          <motion.div
            variants={fadeUp}
            className="mt-8 flex gap-3"
          >
            <button
              type="button"
              onClick={() => setShowReportSheet(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-warning-700 bg-warning-50 hover:bg-warning-100 active:scale-[0.97] transition-all duration-150 cursor-pointer select-none"
            >
              <Flag size={16} />
              Report
            </button>
            <button
              type="button"
              onClick={() => setShowBlockSheet(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-error-600 bg-error-50 hover:bg-error-100 active:scale-[0.97] transition-all duration-150 cursor-pointer select-none"
            >
              <ShieldOff size={16} />
              {isBlocked ? 'Blocked' : 'Block'}
            </button>
          </motion.div>
        )}
      </motion.div>

      {/* Report sheet */}
      {userId && (
        <ReportContentSheet
          open={showReportSheet}
          onClose={() => setShowReportSheet(false)}
          contentId={userId}
          contentType="profile"
        />
      )}

      {/* Block sheet */}
      {userId && (
        <BlockUserSheet
          open={showBlockSheet}
          onClose={() => setShowBlockSheet(false)}
          userId={userId}
          userName={profile.display_name ?? 'this user'}
        />
      )}
    </Page>
  )
}
