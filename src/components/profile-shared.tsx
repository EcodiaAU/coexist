import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { MapPin, Instagram, Leaf, TreePine, ChevronRight } from 'lucide-react'
import { Avatar } from '@/components/avatar'
import { cn } from '@/lib/cn'
import { profileFadeUp, detailTints } from '@/components/profile-shared-tokens'

/* ------------------------------------------------------------------ */
/*  Shared profile language                                           */
/*                                                                    */
/*  The own-profile (/profile) and view-profile (/profile/:userId)    */
/*  surfaces share one visual system so they never drift: a           */
/*  full-bleed image hero (Kurt 2026-08-12: less UI chrome, more      */
/*  full-bleed imagery), journal-header section labels, and soft      */
/*  pastel detail rows. Both consume these primitives so a change to  */
/*  the hero or a heading lands in both places at once.               */
/*                                                                    */
/*  Non-component tokens (motion variants, tint map) live in          */
/*  profile-shared-tokens.ts so this file exports only components.    */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Full-bleed image hero                                             */
/* ------------------------------------------------------------------ */

interface ProfileHeroProps {
  /** Landscape cover (a collective the member belongs to). Null => nature gradient. */
  heroImage: string | null
  avatarUrl?: string | null
  displayName: string
  pronouns?: string | null
  location?: string | null
  instagramHandle?: string | null
  /** Formatted "Member since" month + year. */
  memberSince: string
  /** Overlay slot pinned top-left (e.g. a back button on a viewed profile). */
  topLeft?: ReactNode
  /** Overlay slot pinned top-right (e.g. a settings button on your own profile). */
  topRight?: ReactNode
  reduceMotion?: boolean
}

// Lead the profile with full-bleed imagery, matching the homepage events
// sections. The hero background is a landscape (a cover from a collective the
// member belongs to, same imagery language as the events cards); the member's
// avatar shows as the crisp ring on top. When they belong to no collective, a
// nature gradient renders instead. We deliberately do NOT blow the square
// avatar up as the background - it crops badly and dark/logo avatars go black.
export function ProfileHero({
  heroImage,
  avatarUrl,
  displayName,
  pronouns,
  location,
  instagramHandle,
  memberSince,
  topLeft,
  topRight,
  reduceMotion = false,
}: ProfileHeroProps) {
  const igHref = instagramHandle
    ? `https://instagram.com/${instagramHandle.replace('@', '')}`
    : undefined
  const igLabel = instagramHandle
    ? instagramHandle.startsWith('@')
      ? instagramHandle
      : `@${instagramHandle}`
    : ''

  return (
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

        {topLeft && <div className="absolute top-3 left-4 z-10">{topLeft}</div>}
        {topRight && <div className="absolute top-3 right-4 z-10">{topRight}</div>}

        {/* Profile identity, overlaid at the bottom over the image */}
        <motion.div
          className="absolute inset-x-0 bottom-0 z-10 flex items-end gap-4 p-5"
          variants={reduceMotion ? undefined : profileFadeUp}
          initial="hidden"
          animate="visible"
        >
          <div className="rounded-full p-1 bg-white/20 backdrop-blur-sm shadow-lg shrink-0">
            <div className="rounded-full ring-2 ring-white/60 overflow-hidden flex items-center justify-center aspect-square">
              <Avatar src={avatarUrl} name={displayName} size="xl" />
            </div>
          </div>

          <div className="min-w-0 flex-1 pb-1">
            <h2 className="font-heading text-2xl font-bold text-white drop-shadow-md leading-tight truncate">
              {displayName}
            </h2>
            {pronouns && <span className="text-sm text-white/80">{pronouns}</span>}

            {/* Location + Instagram */}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {location && (
                <span className="flex items-center gap-1 text-xs text-white/85">
                  <MapPin size={12} />
                  {location}
                </span>
              )}
              {igHref && (
                <a
                  href={igHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-white/85 hover:text-white transition-colors"
                >
                  <Instagram size={12} />
                  {igLabel}
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
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Section heading (journal-header style)                            */
/* ------------------------------------------------------------------ */

// A small uppercase micro-label, no solid colour block. `accent` lets one
// section (emergency) carry a quiet safety cue on the icon without
// reintroducing chrome.
export function SectionHeading({
  icon,
  title,
  action,
  accent,
}: {
  icon?: ReactNode
  title: string
  action?: ReactNode
  accent?: string
}) {
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

// Subtle ghost "Edit" link that replaces a grey pill button - less chrome,
// reads as an editorial affordance.
export function EditLink({ onClick }: { onClick: () => void }) {
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
/*  Detail row                                                        */
/* ------------------------------------------------------------------ */

export function DetailRow({
  icon,
  label,
  value,
  tint = 'primary',
}: {
  icon: ReactNode
  label: string
  value: string
  tint?: keyof typeof detailTints
}) {
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
