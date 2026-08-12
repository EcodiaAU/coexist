import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
  MapPin,
  Calendar,
  Clock,
  TreePine,
  Users,
  Trash2,
  Sprout,
  ArrowLeft,
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
import { bentoMixedTheme } from '@/components/bento-stats-themes'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { ReportContentSheet } from '@/components/report-content-sheet'
import { BlockUserSheet } from '@/components/block-user-sheet'
import {
  ProfileHero,
  SectionHeading,
  profileStagger as stagger,
  profileFadeUp as fadeUp,
} from '@/components/profile-shared'
import { parseLocationPoint } from '@/lib/geo'
import { MapView } from '@/components'
import { useAuth } from '@/hooks/use-auth'
import { useProfile, useProfileCollectives, useProfileStats, useMutualConnections } from '@/hooks/use-profile'
import { useIsBlocked, useUnblockUser } from '@/hooks/use-user-blocks'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { REDACTED_PLACEHOLDER } from '@/lib/profile-visibility'
import { prettyInterestLabel } from '@/lib/interests'

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
  const rm = !!shouldReduceMotion
  const { user } = useAuth()
  const { data: profile, isLoading, isError, isFetched, refetch } = useProfile(userId)
  const showLoading = useDelayedLoading(isLoading)
  const { data: collectives } = useProfileCollectives(userId)
  const { data: stats } = useProfileStats(userId)
  const { data: mutualData } = useMutualConnections(userId ?? '')
  const isBlocked = useIsBlocked(userId)
  const unblockUser = useUnblockUser()
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
    return <Page swipeBack header={<Header title="Profile" back />}><></></Page>
  }

  // Private profile: the target opted into "Only collective members" visibility
  // and this viewer is not self / a fellow active member / admin. The RPC
  // returned name + avatar only, so show an explicit private notice instead of
  // a hollow shell. Undefined (older payloads / own profile) => visible.
  if (profile.viewer_can_see_profile === false) {
    return (
      <Page swipeBack header={<Header title={profile.display_name ?? 'Profile'} back />}>
        <div className="flex flex-col items-center gap-3 px-6 pt-12 text-center">
          <Avatar src={profile.avatar_url} name={profile.display_name ?? ''} size="xl" />
          <h2 className="mt-2 font-heading text-xl font-bold text-neutral-900">
            {profile.display_name ?? 'Member'}
          </h2>
          <div className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
            <Shield size={16} />
            <span>This profile is private</span>
          </div>
          <p className="max-w-xs text-sm text-neutral-500 leading-relaxed">
            {profile.display_name ?? 'This member'} shares their full profile only with
            people in their collectives.
          </p>
        </div>
      </Page>
    )
  }

  const memberSince = new Date(profile.created_at ?? Date.now()).toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
  })

  // Same hero-image language as the own-profile surface: lead with a landscape
  // from a collective the member belongs to; fall back to the nature gradient
  // inside ProfileHero when there is none.
  const heroImage: string | null =
    (collectives ?? [])
      .map((m) => (m.collectives as { cover_image_url?: string | null } | null)?.cover_image_url)
      .find((u): u is string => !!u) ||
    null

  // Stats mirror the own-profile bento (compact + mixed theme) so the two
  // surfaces read as one system. Litter only appears once it is non-zero.
  const showLitter = (stats?.rubbishCollectedKg ?? 0) > 0

  return (
    <Page noBackground className="bg-surface-2">
      {/* Full-bleed image hero, shared with the own-profile surface. The back
          affordance rides on the image as a glass button (this surface has no
          top tab bar), replacing the old solid Header for the loaded state. */}
      <ProfileHero
        heroImage={heroImage}
        avatarUrl={profile.avatar_url}
        displayName={profile.display_name ?? 'Member'}
        pronouns={profile.pronouns}
        // Location is staff-only PII (suburb/town); only staff-tier viewers
        // get it on the hero, matching the sensitive-field gating below.
        location={canSeeSensitive ? profile.location : null}
        instagramHandle={profile.instagram_handle}
        memberSince={memberSince}
        reduceMotion={rm}
        topLeft={
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="flex items-center justify-center w-11 h-11 rounded-full bg-white/15 backdrop-blur-sm text-white hover:bg-white/25 active:scale-[0.98] transition-[colors,transform] duration-150"
          >
            <ArrowLeft size={18} />
          </button>
        }
      />

      {/* Bio card below the hero, matching the own-profile treatment. */}
      {profile.bio && (
        <motion.div
          variants={rm ? undefined : fadeUp}
          initial="hidden"
          animate="visible"
          className="mt-6 mx-auto max-w-sm"
        >
          <div className="rounded-2xl bg-white border border-neutral-100 shadow-sm px-5 py-4 text-center">
            <p className="text-sm text-neutral-500 leading-relaxed italic">
              &ldquo;{profile.bio}&rdquo;
            </p>
          </div>
        </motion.div>
      )}

      <motion.div
        className="pb-8 mt-6"
        variants={rm ? undefined : stagger}
        initial="hidden"
        animate="visible"
      >
        {/* Mutual Connections */}
        {mutualData && (mutualData.sharedCollectives.length > 0 || mutualData.sharedEventCount > 0) && (
          <motion.div
            variants={fadeUp}
            className="rounded-2xl bg-white border border-neutral-100 shadow-sm px-4 py-3.5"
          >
            <div className="flex items-center gap-3 text-sm text-neutral-600">
              <div className="shrink-0 w-9 h-9 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
                <Users size={16} />
              </div>
              <div className="min-w-0">
                {mutualData.sharedCollectives.length > 0 && (
                  <p>
                    You&apos;re both in{' '}
                    <span className="font-semibold text-neutral-900">
                      {mutualData.sharedCollectives.map((c) => c.name).join(', ')}
                    </span>
                  </p>
                )}
                {mutualData.sharedEventCount > 0 && (
                  <p>
                    You&apos;ve attended{' '}
                    <span className="font-semibold text-neutral-900">{mutualData.sharedEventCount} events</span>{' '}
                    together
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Impact Stats - compact bento, mixed theme (matches own profile) */}
        <motion.div variants={fadeUp} className="mt-6">
          <BentoStatGrid compact>
            <BentoStatCard compact value={stats?.eventsAttended ?? 0} label="Events" icon={<Calendar size={18} />} theme={bentoMixedTheme(0)} />
            <BentoStatCard compact value={stats?.hoursVolunteered ?? 0} label="Hours" icon={<Clock size={18} />} theme={bentoMixedTheme(1)} />
            <BentoStatCard compact value={stats?.treesPlanted ?? 0} label="Trees" icon={<TreePine size={18} />} theme={bentoMixedTheme(2)} />
            {showLitter && (
              <BentoStatCard compact value={stats?.rubbishCollectedKg ?? 0} label="Litter Removed" icon={<Trash2 size={18} />} unit="kg" theme={bentoMixedTheme(3)} />
            )}
          </BentoStatGrid>
        </motion.div>

        {/* Collectives - image grid, matching the own-profile treatment */}
        {collectives && collectives.length > 0 && (
          <motion.section variants={fadeUp} className="mt-6">
            <SectionHeading icon={<TreePine size={13} />} title="Collectives" />
            <div className="grid grid-cols-2 gap-3">
              {collectives.map((membership) => {
                const collective = membership.collectives as {
                  id: string
                  name: string
                  slug: string
                  cover_image_url: string | null
                  region: string | null
                  member_count: number
                } | null
                if (!collective) return null
                return (
                  <button
                    key={collective.id}
                    type="button"
                    onClick={() => navigate(`/collectives/${collective.slug}`)}
                    aria-label={collective.name}
                    className="group relative block w-full overflow-hidden rounded-2xl shadow-sm aspect-[4/3] active:scale-[0.98] transition-transform duration-200"
                  >
                    {collective.cover_image_url ? (
                      <img
                        src={collective.cover_image_url}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-[#879e62] via-moss-700 to-primary-800" aria-hidden="true">
                        <div className="absolute -right-3 -top-3 text-white/10">
                          <TreePine size={96} strokeWidth={1} />
                        </div>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" aria-hidden="true" />
                    <div className="absolute inset-x-0 bottom-0 p-3 text-left">
                      <p className="font-heading font-bold text-sm text-white leading-tight drop-shadow line-clamp-2">
                        {collective.name}
                      </p>
                      <p className="mt-0.5 text-[11px] text-white/85">
                        {[collective.region, collective.member_count != null ? `${collective.member_count} members` : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </motion.section>
        )}

        {/* Interests */}
        {profile.interests && profile.interests.length > 0 && (
          <motion.section variants={fadeUp} className="mt-6">
            <SectionHeading icon={<Sprout size={13} />} title="Interests" />
            <div className="rounded-2xl bg-white border border-neutral-100 shadow-sm p-4">
              <div className="flex flex-wrap gap-2">
                {profile.interests.map((interest) => (
                  <Chip key={interest} label={prettyInterestLabel(interest)} selected />
                ))}
              </div>
            </div>
          </motion.section>
        )}

        {/* Privacy notice for non-staff viewers (replaces sensitive sections) */}
        {!isOwnProfile && !canSeeSensitive && (
          <motion.section variants={fadeUp} className="mt-6">
            <div className="rounded-2xl border border-neutral-100 bg-white shadow-sm px-4 py-3.5 flex items-start gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0 bg-neutral-100 text-neutral-500">
                <ShieldOff size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-neutral-900">Personal details hidden</p>
                <p className="text-xs text-neutral-500 mt-0.5">
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
          <motion.section variants={fadeUp} className="mt-5">
            <SectionHeading icon={<Shield size={13} />} accent="text-warning-500" title="Emergency Contact" />
            <div className="rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-white p-4 border border-neutral-100">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-warning-50 flex items-center justify-center">
                    <Heart size={18} className="text-warning-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-neutral-900">
                      {profile.emergency_contact_name}
                    </p>
                    {profile.emergency_contact_relationship && (
                      <p className="text-xs text-neutral-500 font-medium">{profile.emergency_contact_relationship}</p>
                    )}
                    {profile.emergency_contact_phone && (
                      <a
                        href={`tel:${profile.emergency_contact_phone}`}
                        className="text-sm text-neutral-700 flex items-center gap-1.5 mt-1 font-medium hover:text-primary-700 active:scale-[0.98] transition-transform"
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
            <motion.section variants={fadeUp} className="mt-6">
              <SectionHeading icon={<MapPin size={13} />} title="Location" />
              <MapView
                center={pos}
                zoom={12}
                markers={[{ id: userId ?? 'user', position: pos, variant: 'default', label: profile.location ?? undefined }]}
                interactive={false}
                aria-label={`${profile.display_name ?? 'User'} location`}
                className="h-40 rounded-2xl overflow-hidden"
              />
            </motion.section>
          )
        })()}

        {/* Report & Block actions (only for other users) */}
        {!isOwnProfile && userId && (
          <motion.div variants={fadeUp} className="mt-8 flex gap-3">
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
              onClick={() => {
                if (isBlocked) {
                  if (userId) unblockUser.mutate(userId)
                } else {
                  setShowBlockSheet(true)
                }
              }}
              disabled={unblockUser.isPending}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-error-600 bg-error-50 hover:bg-error-100 active:scale-[0.97] transition-all duration-150 cursor-pointer select-none disabled:opacity-50"
            >
              <ShieldOff size={16} />
              {isBlocked ? 'Unblock' : 'Block'}
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
