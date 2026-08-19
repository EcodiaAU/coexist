import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import {
    MapPin,
    Instagram,
    Calendar,
    Clock,
    TreePine,
    Trash2,
    Sprout,
    Bird,
    Ruler,
    Phone,
    Mail,
    AlertTriangle,
    Pencil,
    Settings,
    User,
    Heart,
    Shield,
    ChevronRight,
    Accessibility,
    Utensils,
    Leaf,
    Waves,
    Ticket,
    Sparkles,
} from 'lucide-react'
import { FEATURE_MEMBERSHIPS } from '@/lib/flags'
import { Page } from '@/components/page'
import { Avatar } from '@/components/avatar'
import { Button } from '@/components/button'
import { Chip } from '@/components/chip'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { useProfile, useProfileCollectives, useProfileStats } from '@/hooks/use-profile'
import { BentoStatCard, BentoStatGrid } from '@/components/bento-stats'
import { bentoMixedTheme } from '@/components/bento-stats-themes'
import { cn } from '@/lib/cn'
import { prettyInterestLabel } from '@/lib/interests'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
}

/* ------------------------------------------------------------------ */
/*  Flat white stat pill                                               */
/* ------------------------------------------------------------------ */

/* (Stats now use BentoStatCard / BentoStatGrid from bento-stats.tsx) */

/* ------------------------------------------------------------------ */
/*  Detail row                                                         */
/* ------------------------------------------------------------------ */

// Soft pastel icon badges only - no solid fills, no coloured left stripes.
// The value is the hero; the tint is a whisper for scannability (design
// system: activity colours live only on small icon badges).
const detailTints = {
  primary: 'bg-primary-50 text-primary-600',
  sky:     'bg-sky-50 text-sky-600',
  moss:    'bg-moss-50 text-moss-600',
  sprout:  'bg-sprout-50 text-sprout-600',
  plum:    'bg-plum-50 text-plum-600',
}

function DetailRow({ icon, label, value, tint = 'primary' }: { icon: React.ReactNode; label: string; value: string; tint?: keyof typeof detailTints }) {
  return (
    <div className="flex items-center gap-3.5 px-4 py-3.5">
      <div className={cn('shrink-0 w-9 h-9 rounded-xl flex items-center justify-center', detailTints[tint])}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-400">{label}</p>
        <p className="text-[15px] font-semibold text-neutral-900 break-words">{value}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Section heading                                                    */
/* ------------------------------------------------------------------ */

// Journal-header style: a small uppercase micro-label, no solid colour block.
// `accent` lets one section (emergency) carry a quiet safety cue on the icon
// without reintroducing chrome.
function SectionHeading({ icon, title, action, accent }: { icon?: React.ReactNode; title: string; action?: React.ReactNode; accent?: string }) {
  return (
    <div className="flex items-center justify-between mb-2.5 px-1">
      <div className="flex items-center gap-2">
        {icon && <span className={cn('shrink-0', accent ?? 'text-neutral-400')}>{icon}</span>}
        <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-neutral-400">{title}</h3>
      </div>
      {action}
    </div>
  )
}

// Subtle ghost "Edit" link that replaces the old grey pill button - less
// chrome, reads as an editorial affordance.
function EditLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-0.5 text-[11px] font-bold uppercase tracking-wider text-primary-600 hover:text-primary-700 active:scale-[0.97] transition-[colors,transform] duration-150 cursor-pointer"
    >
      Edit <ChevronRight size={12} />
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

function ProfileSkeleton() {
  return (
    <div className="space-y-6 py-6">
      <div className="flex flex-col items-center gap-3">
        <Skeleton variant="avatar" className="h-24 w-24" />
        <Skeleton variant="title" className="w-40" />
        <Skeleton variant="text" className="w-24" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Skeleton variant="stat-card" />
        <Skeleton variant="stat-card" />
        <Skeleton variant="stat-card" />
      </div>
      <Skeleton variant="card" />
      <Skeleton variant="text" count={3} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ProfilePage() {
  const [showMoreStats, setShowMoreStats] = useState(false)
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const { data: profile, isLoading: profileLoading, refetch: refetchProfile } = useProfile()
  const { data: collectives, isLoading: collectivesLoading } = useProfileCollectives()
  const { data: stats, isLoading: statsLoading } = useProfileStats()

  // A real profile row always carries created_at (DB NOT NULL default now()). A
  // truthy profile object WITHOUT it is a phantom empty result - it comes from a
  // transient read race (e.g. a redacted/empty RPC row returned while the auth
  // token was mid-refresh) and would otherwise render a broken hero: no name, a
  // "?" avatar, and a fabricated "Member since <today>" from the Date.now()
  // fallback. Treat it as still-loading and force one refetch so it self-heals
  // instead of flashing the empty state. Origin: Tate 2026-08-12, profile hero
  // showed no photo/name on load.
  const isPhantomProfile = !!profile && !profile.created_at
  useEffect(() => {
    if (isPhantomProfile) refetchProfile()
  }, [isPhantomProfile, refetchProfile])

  const isLoading = profileLoading || collectivesLoading || statsLoading

  if (isLoading || isPhantomProfile) {
    return (
      <Page noBackground className="bg-surface-2">
        <ProfileSkeleton />
      </Page>
    )
  }
  if (!profile) {
    return (
      <Page noBackground className="bg-surface-2">
        <EmptyState
          illustration="error"
          title="Profile not found"
          description="We couldn't load your profile. Try again later."
          action={{ label: 'Go Home', to: '/' }}
        />
      </Page>
    )
  }

  const memberSince = new Date(profile.created_at ?? Date.now()).toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
  })

  const hasDetails = profile.first_name || profile.email || profile.phone || profile.age || profile.postcode || profile.gender

  // Lead the profile with full-bleed imagery, matching the homepage events
  // sections. The hero background is a landscape (a cover from a collective the
  // member belongs to, same imagery language as the events cards); the member's
  // avatar shows as the crisp ring on top. When they belong to no collective, a
  // nature gradient renders instead. We deliberately do NOT blow the square
  // avatar up as the background - it crops badly and dark/logo avatars go black.
  // Prefer the member's own uploaded cover photo (Jess 2026-08-19); fall back
  // to a collective landscape, then the nature gradient inside the hero.
  const heroImage: string | null =
    profile.cover_image_url ||
    (collectives ?? [])
      .map((m) => (m.collectives as { cover_image_url?: string | null } | null)?.cover_image_url)
      .find((u): u is string => !!u) ||
    null

  // Core metrics always show (even if 0) - these are the canonical Co-Exist impact metrics.
  // Secondary metrics show if value > 0 OR user attended a relevant activity type.
  const at = stats?.activityTypeCounts ?? {}
  const didLand = (at.tree_planting ?? 0) > 0 || (at.ecosystem_restoration ?? 0) > 0
  const didCoast = (at.clean_up ?? 0) > 0
  const didWild = didCoast || (at.nature_hike ?? 0) > 0

  // Surface every impact metric the user has earned. We show non-zero stats
  // by default + always include Events / Hours so the bento never looks empty
  // on a brand-new profile. "See more" expands to show every metric the user
  // has touched (including zeros for context).
  // Native Plants dropped 2026-05-27 - same metric as Trees in practice;
  // having both made the bento grid double-count the planting work.
  const allStatsRaw = [
    { value: stats?.eventsAttended ?? 0, label: 'Events', icon: <Calendar size={18} />, alwaysShow: true, unit: undefined },
    { value: stats?.hoursVolunteered ?? 0, label: 'Hours', icon: <Clock size={18} />, alwaysShow: true, unit: undefined },
    { value: stats?.treesPlanted ?? 0, label: 'Trees', icon: <TreePine size={18} />, alwaysShow: false, unit: undefined },
    { value: stats?.rubbishCollectedKg ?? 0, label: 'Litter Removed', icon: <Trash2 size={18} />, alwaysShow: false, unit: 'kg' as const },
    { value: stats?.areaRestoredSqm ?? 0, label: 'Area Regenerated', icon: <Ruler size={18} />, alwaysShow: false, unit: 'sqm' as const },
    { value: stats?.wildlifeSightings ?? 0, label: 'Wildlife Sightings', icon: <Bird size={18} />, alwaysShow: false, unit: undefined },
  ]
  const initialStats = allStatsRaw.filter((s) => s.alwaysShow || s.value > 0)
  const hasMoreStats = allStatsRaw.length > initialStats.length
  const allStats = showMoreStats ? allStatsRaw : initialStats

  return (
    <Page noBackground className="bg-surface-2">
      {/* Full-bleed image hero - leads with imagery, matching the homepage
          events sections (Kurt 2026-08-12: less UI chrome, more full-bleed
          imagery). The member's photo (or a collective landscape, or a nature
          gradient) fills the hero; a dark bottom-up gradient keeps the identity
          legible sitting over the image, exactly like the events cards. */}
      <div className="-mx-4 lg:-mx-6">
        <div className="relative min-h-[340px] overflow-hidden">
          {/* Nature gradient base - always painted, so a slow or missing hero
              image never leaves the hero black. */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#879e62] via-moss-700 to-primary-800" aria-hidden="true" />

          {heroImage ? (
            <img
              src={heroImage}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
          ) : (
            /* Nature watermark on the gradient fallback */
            <div className="absolute -right-6 -top-6 text-white/10 pointer-events-none" aria-hidden="true">
              <TreePine size={200} strokeWidth={1} />
            </div>
          )}

          {/* Legibility gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/15" aria-hidden="true" />

          {/* Settings button */}
          <div className="absolute top-3 right-4 z-10">
            <button
              onClick={() => navigate('/settings')}
              className="flex items-center justify-center w-11 h-11 rounded-full bg-white/15 backdrop-blur-sm text-white hover:bg-white/25 active:scale-[0.98] transition-[colors,transform] duration-150"
              aria-label="Settings"
            >
              <Settings size={18} />
            </button>
          </div>

          {/* Profile identity, overlaid at the bottom over the image */}
          <motion.div
            className="absolute inset-x-0 bottom-0 z-10 flex items-end gap-4 p-5"
            variants={rm ? undefined : fadeUp}
            initial="hidden"
            animate="visible"
          >
            <div className="rounded-full p-1 bg-white/20 backdrop-blur-sm shadow-lg shrink-0">
              <div className="rounded-full ring-2 ring-white/60 overflow-hidden flex items-center justify-center aspect-square">
                <Avatar
                  src={profile.avatar_url}
                  name={profile.display_name ?? ''}
                  size="xl"
                />
              </div>
            </div>

            <div className="min-w-0 flex-1 pb-1">
              <h2 className="font-heading text-2xl font-bold text-white drop-shadow-md leading-tight truncate">
                {profile.display_name}
              </h2>
              {profile.pronouns && (
                <span className="text-sm text-white/80">{profile.pronouns}</span>
              )}

              {/* Location + Instagram */}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                {profile.location && (
                  <span className="flex items-center gap-1 text-xs text-white/85">
                    <MapPin size={12} />
                    {profile.location}
                  </span>
                )}
                {profile.instagram_handle && (
                  <a
                    href={`https://instagram.com/${profile.instagram_handle.replace('@', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-white/85 hover:text-white transition-colors"
                  >
                    <Instagram size={12} />
                    {profile.instagram_handle.startsWith('@')
                      ? profile.instagram_handle
                      : `@${profile.instagram_handle}`}
                  </a>
                )}
              </div>

              <span className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm text-[11px] text-white/90">
                <Leaf size={11} className="text-sprout-300" />
                Member since {memberSince}
              </span>
            </div>
          </motion.div>
        </div>

        {/* Action buttons - a light row under the image, no heavy card chrome. */}
        <div className="flex flex-wrap justify-center gap-2 px-4 mt-4">
          {[
            { icon: <Pencil size={14} />, label: 'Edit Profile', to: '/profile/edit' },
            { icon: <Ticket size={14} />, label: 'Tickets', to: '/profile/tickets' },
            { icon: <Heart size={14} />, label: 'Donations', to: '/profile/donations' },
            ...(FEATURE_MEMBERSHIPS
              ? [{ icon: <Sparkles size={14} />, label: 'Membership', to: '/profile/membership' }]
              : []),
            { icon: <Settings size={14} />, label: 'Settings', to: '/settings' },
          ].map((b) => (
            <button
              key={b.to}
              type="button"
              onClick={() => navigate(b.to)}
              className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-sm bg-white text-neutral-700 text-xs font-heading font-semibold border border-neutral-200 shadow-sm whitespace-nowrap cursor-pointer select-none transition-[background-color,transform] duration-150 hover:bg-neutral-50 active:bg-neutral-50 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            >
              <span className="flex items-center justify-center shrink-0">{b.icon}</span>
              <span>{b.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Bio */}
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

      {/* Content */}
      <motion.div
        className="pb-8 mt-6"
        variants={rm ? undefined : stagger}
        initial="hidden"
        animate="visible"
      >

        {/* Bento Impact Stats - compact + filter zero stats, expandable */}
        <motion.div variants={fadeUp} className="mt-6">
          <BentoStatGrid compact>
            {allStats.map((s, i) => (
              <BentoStatCard compact key={s.label} value={s.value} label={s.label} icon={s.icon} unit={s.unit} theme={bentoMixedTheme(i)} />
            ))}
          </BentoStatGrid>
          {hasMoreStats && (
            <button
              type="button"
              onClick={() => setShowMoreStats((v) => !v)}
              className="mt-3 w-full flex items-center justify-center gap-1 text-xs font-semibold text-neutral-600 bg-white border border-neutral-200 rounded-full py-2.5 active:scale-[0.98] transition-transform duration-150 hover:bg-neutral-50"
            >
              {showMoreStats ? 'Show less' : 'See more stats'}
              <ChevronRight size={12} className={cn('transition-transform duration-200', showMoreStats ? 'rotate-90' : 'rotate-0')} />
            </button>
          )}
        </motion.div>

        {/* Personal Details */}
        <motion.section variants={fadeUp} className="mt-6">
          <SectionHeading
            icon={<User size={13} />}
            title="Your Details"
            action={<EditLink onClick={() => navigate('/profile/edit')} />}
          />
          <div className="rounded-2xl bg-white shadow-sm border border-neutral-100 overflow-hidden divide-y divide-neutral-100">
            {hasDetails ? (
              <>
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
                {profile.dietary_requirements && (
                  <DetailRow icon={<Utensils size={14} />} label="Dietary" value={profile.dietary_requirements} tint="sprout" />
                )}
              </>
            ) : (
              <div className="px-4 py-6 text-center">
                <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-3">
                  <User size={20} className="text-neutral-500" />
                </div>
                <p className="text-sm text-neutral-800 font-semibold">No details added yet</p>
                <p className="text-xs text-neutral-500 mt-0.5">Help event leaders know who you are</p>
                <Button
                  variant="primary"
                  size="sm"
                  className="mt-3"
                  onClick={() => navigate('/profile/edit')}
                >
                  Add Your Details
                </Button>
              </div>
            )}
          </div>
        </motion.section>

        {/* Emergency Contact */}
        <motion.section variants={fadeUp} className="mt-5">
          <SectionHeading
            icon={<Shield size={13} />}
            accent="text-warning-500"
            title="Emergency Contact"
            action={
              profile.emergency_contact_name ? (
                <EditLink onClick={() => navigate('/profile/edit')} />
              ) : undefined
            }
          />
          <div className="rounded-2xl overflow-hidden shadow-sm">
            {profile.emergency_contact_name ? (
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
                      <p className="text-sm text-neutral-700 flex items-center gap-1.5 mt-1 font-medium">
                        <Phone size={13} className="text-warning-600" />
                        {profile.emergency_contact_phone}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white p-5 text-center border border-neutral-100">
                <div className="w-12 h-12 rounded-2xl bg-warning-50 flex items-center justify-center mx-auto mb-3">
                  <AlertTriangle size={20} className="text-warning-600" />
                </div>
                <p className="text-sm font-bold text-neutral-800">No emergency contact set</p>
                <p className="text-xs text-neutral-500 mt-0.5">Event leaders need this for your safety</p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => navigate('/profile/edit')}
                >
                  Add Emergency Contact
                </Button>
              </div>
            )}
          </div>
        </motion.section>

        {/* My Collectives */}
        <motion.section
          variants={fadeUp}
          className="mt-6"
        >
          <SectionHeading
            icon={<TreePine size={13} />}
            title="My Collectives"
          />
          {collectives && collectives.length > 0 ? (
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
                const role = (membership.role ?? '').replace(/_/g, ' ')
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
                    {/* Legibility gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" aria-hidden="true" />
                    {/* Role pill (glass) */}
                    {role && (
                      <span className="absolute top-2 left-2 rounded-full bg-white/20 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        {role}
                      </span>
                    )}
                    {/* Name + meta overlaid at the bottom */}
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
          ) : (
            <EmptyState
              illustration="wildlife"
              title="No collectives yet"
              description="Join a local collective to start your conservation journey"
              action={{ label: 'Explore Collectives', to: '/collectives' }}
              className="min-h-[180px]"
            />
          )}
        </motion.section>

        {/* Interests */}
        {profile.interests && profile.interests.length > 0 && (
          <motion.section
            variants={fadeUp}
            className="mt-6"
          >
            <SectionHeading
              icon={<Sprout size={13} />}
              title="Interests"
            />
            <div className="rounded-2xl bg-white border border-neutral-100 shadow-sm p-4">
              <div className="flex flex-wrap gap-2">
                {profile.interests.map((interest) => (
                  <Chip key={interest} label={prettyInterestLabel(interest)} selected />
                ))}
              </div>
            </div>
          </motion.section>
        )}

      </motion.div>
    </Page>
  )
}
