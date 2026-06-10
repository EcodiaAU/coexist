import { useState } from 'react'
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
    Leaf,
    Waves,
    Ticket,
} from 'lucide-react'
import { Page } from '@/components/page'
import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Chip } from '@/components/chip'
import { Card } from '@/components/card'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { useAuth } from '@/hooks/use-auth'
import { useProfile, useProfileCollectives, useProfileStats } from '@/hooks/use-profile'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
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

const detailTints = {
  primary: { iconBg: 'bg-primary-500', iconText: 'text-white', stripe: 'border-l-primary-500' },
  sky:     { iconBg: 'bg-sky-500', iconText: 'text-white', stripe: 'border-l-sky-500' },
  moss:    { iconBg: 'bg-moss-500', iconText: 'text-white', stripe: 'border-l-moss-500' },
  sprout:  { iconBg: 'bg-sprout-500', iconText: 'text-white', stripe: 'border-l-sprout-500' },
  plum:    { iconBg: 'bg-plum-500', iconText: 'text-white', stripe: 'border-l-plum-500' },
}

function DetailRow({ icon, label, value, tint = 'primary' }: { icon: React.ReactNode; label: string; value: string; tint?: keyof typeof detailTints }) {
  const t = detailTints[tint]
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3 border-l-4', t.stripe)}>
      <div className={cn('shrink-0 w-8 h-8 rounded-lg flex items-center justify-center', t.iconBg, t.iconText)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{label}</p>
        <p className="text-sm font-medium text-neutral-900 truncate">{value}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Section heading                                                    */
/* ------------------------------------------------------------------ */

function SectionHeading({ icon, iconBg, title, action }: { icon?: React.ReactNode; iconBg?: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2.5">
        {icon && (
          <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center text-white', iconBg ?? 'bg-primary-500')}>
            {icon}
          </div>
        )}
        <h3 className="font-heading text-base font-bold text-neutral-900">{title}</h3>
      </div>
      {action}
    </div>
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
  useAuth()
  const { data: profile, isLoading: profileLoading } = useProfile()
  const { data: collectives, isLoading: collectivesLoading } = useProfileCollectives()
  const { data: stats, isLoading: statsLoading } = useProfileStats()

  const isLoading = profileLoading || collectivesLoading || statsLoading
  const showLoading = useDelayedLoading(isLoading)

  if (showLoading) {
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
      {/* Hero banner */}
      <div className="-mx-4 lg:-mx-6">
        <div className="relative overflow-hidden bg-[#879e62] pb-20 pt-8">
          {/* Settings button */}
          <div className="relative z-10 flex justify-end px-4 mt-2">
            <button
              onClick={() => navigate('/settings')}
              className="flex items-center justify-center w-11 h-11 rounded-full bg-white/15 text-white/90 hover:bg-white/25 active:scale-[0.93] transition-[colors,transform] duration-150"
              aria-label="Settings"
            >
              <Settings size={18} />
            </button>
          </div>

          {/* Profile identity */}
          <motion.div
            className="relative z-10 flex flex-col items-center mt-2"
            variants={rm ? undefined : fadeUp}
            initial="hidden"
            animate="visible"
          >
            <div className="rounded-full p-1 bg-gradient-to-br from-sprout-300/50 to-moss-300/50 shadow-xl">
              <div className="rounded-full ring-3 ring-white/40 overflow-hidden flex items-center justify-center aspect-square w-24">
                <Avatar
                  src={profile.avatar_url}
                  name={profile.display_name ?? ''}
                  size="xl"
                />
              </div>
            </div>

            <h2 className="mt-3 font-heading text-xl font-bold text-white drop-shadow-sm">
              {profile.display_name}
            </h2>
            {profile.pronouns && (
              <span className="mt-0.5 text-sm text-sprout-200">{profile.pronouns}</span>
            )}

            {/* Location + Instagram */}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
              {profile.location && (
                <span className="flex items-center gap-1 text-sm text-white/70">
                  <MapPin size={13} />
                  {profile.location}
                </span>
              )}
              {profile.instagram_handle && (
                <a
                  href={`https://instagram.com/${profile.instagram_handle.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-white/70 hover:text-white transition-colors"
                >
                  <Instagram size={13} />
                  {profile.instagram_handle.startsWith('@')
                    ? profile.instagram_handle
                    : `@${profile.instagram_handle}`}
                </a>
              )}
            </div>

            <span className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-xs text-white/80">
              <Leaf size={12} className="text-sprout-300" />
              Member since {memberSince}
            </span>
          </motion.div>
        </div>

        {/* Overlapping action buttons.
            These sit on -mt-5 overlapping the green hero. The previous variant
            used <Button variant=secondary> with bg-white + !text-neutral-700 +
            hover:!bg-neutral-50 overrides on top of the secondary variant's
            bg-primary-100. On Android the framer-motion whileTap scale combined
            with the multi-layer bg overrides caused the buttons to briefly
            render transparent during the tap animation, exposing the green
            hero (and "Helen" display name above it). Tate verbatim 2026-05-28:
            "while its in the tap animation the button goes transparent and
            the users display name shows in place of the button". Native
            <button> with explicit bg-white in every state, no Tailwind !
            overrides, no framer-motion transform, no negative z-stacking. */}
        <div className="relative z-20 -mt-5 flex justify-center gap-2 px-4">
          {[
            { icon: <Pencil size={14} />, label: 'Edit Profile', to: '/profile/edit' },
            { icon: <Ticket size={14} />, label: 'Tickets', to: '/profile/tickets' },
            { icon: <Settings size={14} />, label: 'Settings', to: '/settings' },
          ].map((b) => (
            <button
              key={b.to}
              type="button"
              onClick={() => navigate(b.to)}
              className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-xl bg-white text-neutral-700 text-xs font-heading font-semibold border border-neutral-200 shadow-sm whitespace-nowrap cursor-pointer select-none transition-[background-color,transform] duration-150 hover:bg-neutral-50 active:bg-neutral-50 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
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
        <motion.div variants={fadeUp}>
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
            icon={<User size={14} />}
            iconBg="bg-primary-600"
            title="Your Details"
            action={
              <button
                onClick={() => navigate('/profile/edit')}
                className="flex items-center gap-1 text-xs font-bold text-neutral-600 bg-neutral-100 hover:bg-neutral-200 px-3 min-h-9 rounded-full active:scale-[0.95] transition-[colors,transform] duration-150 cursor-pointer"
              >
                Edit <ChevronRight size={13} />
              </button>
            }
          />
          <div className="rounded-2xl bg-white shadow-sm border border-neutral-100 overflow-hidden">
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
            icon={<Shield size={14} />}
            iconBg="bg-warning-600"
            title="Emergency Contact"
            action={
              profile.emergency_contact_name ? (
                <button
                  onClick={() => navigate('/profile/edit')}
                  className="flex items-center gap-1 text-xs font-bold text-neutral-600 bg-neutral-100 hover:bg-neutral-200 px-3 min-h-9 rounded-full active:scale-[0.95] transition-[colors,transform] duration-150 cursor-pointer"
                >
                  Edit <ChevronRight size={13} />
                </button>
              ) : undefined
            }
          />
          <div className="rounded-2xl overflow-hidden shadow-sm">
            {profile.emergency_contact_name ? (
              <div className="bg-white p-4 border border-neutral-100 border-l-4 border-l-warning-400">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-10 h-10 rounded-full bg-warning-100 flex items-center justify-center">
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
              <div className="bg-white p-5 text-center border border-neutral-100 border-l-4 border-l-warning-400">
                <div className="w-12 h-12 rounded-full bg-warning-100 flex items-center justify-center mx-auto mb-3">
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
            icon={<TreePine size={14} />}
            iconBg="bg-moss-600"
            title="My Collectives"
          />
          {collectives && collectives.length > 0 ? (
            <div className="space-y-2.5">
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
                  <Card
                    key={collective.id}
                    variant="collective"
                    watermark
                    onClick={() => navigate(`/collectives/${collective.slug}`)}
                    className="flex flex-row items-center gap-3 p-3 bg-white shadow-sm border border-neutral-100"
                  >
                    <div className="shrink-0 w-12 h-12 rounded-xl overflow-hidden bg-gradient-to-br from-moss-300 to-primary-300 shadow-sm">
                      {collective.cover_image_url ? (
                        <img
                          src={collective.cover_image_url}
                          alt={collective.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white">
                          <TreePine size={20} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-heading font-bold text-sm text-neutral-900 truncate">
                        {collective.name}
                      </p>
                      <p className="text-xs text-moss-600 font-medium">
                        {collective.region} · {collective.member_count} members
                      </p>
                    </div>
                    <Badge variant="default" size="sm">
                      {(membership.role ?? '').replace('_', ' ')}
                    </Badge>
                  </Card>
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
              icon={<Sprout size={14} />}
              iconBg="bg-sprout-600"
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
