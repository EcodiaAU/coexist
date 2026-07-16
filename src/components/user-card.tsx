import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X, MapPin, Instagram, TreePine, Calendar, Star } from 'lucide-react'
import { cn } from '@/lib/cn'

interface UserStats {
  events: number
  points: number
  treesPlanted: number
}

interface UserCardProps {
  name: string
  pronouns?: string
  avatarUrl?: string
  instagramHandle?: string
  collectiveName?: string
  tier?: string
  location?: string
  stats?: UserStats
  onClose: () => void
  className?: string
  'aria-label'?: string
}

function StatBox({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode
  value: number
  label: string
}) {
  return (
    <div data-eos-id="src/components/user-card.tsx#0" data-eos-v="2" className="flex flex-1 flex-col items-center gap-1 rounded-sm bg-surface-2 px-3 py-2.5">
      <span data-eos-id="src/components/user-card.tsx#1" className="text-neutral-400" aria-hidden="true">
        {icon}
      </span>
      <span data-eos-id="src/components/user-card.tsx#2" data-eos-var="value.toLocaleString" data-eos-var-label="To locale string" data-eos-var-scope="prop" className="font-heading text-lg font-bold text-neutral-900">
        {value.toLocaleString()}
      </span>
      <span data-eos-id="src/components/user-card.tsx#3" className="text-[11px] font-medium text-neutral-500">{label}</span>
    </div>
  )
}

export function UserCard({
  name,
  pronouns,
  avatarUrl,
  instagramHandle,
  collectiveName,
  tier,
  location,
  stats,
  onClose,
  className,
  'aria-label': ariaLabel,
}: UserCardProps) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <AnimatePresence data-eos-id="src/components/user-card.tsx#4">
      <motion.div data-eos-id="src/components/user-card.tsx#5"
        role="dialog"
        aria-label={ariaLabel ?? `${name}'s profile`}
        aria-modal="false"
        initial={
          shouldReduceMotion
            ? { opacity: 1 }
            : { opacity: 0, scale: 0.9 }
        }
        animate={{ opacity: 1, scale: 1 }}
        exit={
          shouldReduceMotion
            ? { opacity: 0 }
            : { opacity: 0, scale: 0.9 }
        }
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        className={cn(
          'w-72 overflow-hidden rounded-md bg-surface-0 shadow-sm',
          className,
        )}
      >
        {/* Header */}
        <div data-eos-id="src/components/user-card.tsx#6" className="relative flex flex-col items-center px-5 pb-3 pt-5">
          {/* Close button */}
          <button data-eos-id="src/components/user-card.tsx#7"
            type="button"
            onClick={onClose}
            aria-label="Close profile card"
            className={cn(
              'absolute right-3 top-3 rounded-full p-1 text-primary-400',
              'min-h-11 min-w-11 flex items-center justify-center',
              'cursor-pointer select-none',
              'active:scale-[0.97] transition-transform duration-150',
              'hover:bg-neutral-50 hover:text-neutral-600',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
            )}
          >
            <X data-eos-id="src/components/user-card.tsx#8" size={18} aria-hidden="true" />
          </button>

          {/* Avatar */}
          {avatarUrl ? (
            <img data-eos-src="dynamic" data-eos-src-label="Avatar url" data-eos-id="src/components/user-card.tsx#9"
              src={avatarUrl}
              alt={`${name}'s avatar`}
              className="h-16 w-16 rounded-full object-cover ring-2 ring-neutral-100"
            />
          ) : (
            <div data-eos-id="src/components/user-card.tsx#10"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-xl font-bold text-neutral-500 ring-2 ring-neutral-100"
              aria-hidden="true"
            >
              {name.charAt(0).toUpperCase()}
            </div>
          )}

          {/* Name */}
          <h3 data-eos-id="src/components/user-card.tsx#11" className="mt-2.5 font-heading text-lg font-bold text-neutral-900">
            {name}
          </h3>

          {/* Pronouns */}
          {pronouns && (
            <span data-eos-id="src/components/user-card.tsx#12" className="text-xs text-neutral-500">{pronouns}</span>
          )}

          {/* Tier + Collective badges */}
          <div data-eos-id="src/components/user-card.tsx#13" className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
            {tier && (
              <span data-eos-id="src/components/user-card.tsx#14" className="inline-flex items-center rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-semibold text-primary-800">
                {tier}
              </span>
            )}
            {collectiveName && (
              <span data-eos-id="src/components/user-card.tsx#15" className="inline-flex items-center rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-semibold text-primary-400">
                {collectiveName}
              </span>
            )}
          </div>
        </div>

        {/* Info section */}
        <div data-eos-id="src/components/user-card.tsx#16" className="space-y-2 px-5 pb-3">
          {/* Location */}
          {location && (
            <div data-eos-id="src/components/user-card.tsx#17" className="flex items-center gap-1.5 text-sm text-neutral-500">
              <MapPin data-eos-id="src/components/user-card.tsx#18" size={14} aria-hidden="true" />
              <span data-eos-id="src/components/user-card.tsx#19">{location}</span>
            </div>
          )}

          {/* Instagram */}
          {instagramHandle && (
            <a data-eos-href="dynamic" data-eos-href-label="Replace" data-eos-href-scope="prop" data-eos-id="src/components/user-card.tsx#20"
              href={`https://instagram.com/${instagramHandle.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Visit ${instagramHandle} on Instagram`}
              className={cn(
                'flex items-center gap-1.5 text-sm text-neutral-500 min-h-11',
                'transition-colors duration-150 hover:text-neutral-600',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:rounded',
              )}
            >
              <Instagram data-eos-id="src/components/user-card.tsx#21" size={14} aria-hidden="true" />
              <span data-eos-id="src/components/user-card.tsx#22" data-eos-var="instagramHandle.startsWith" data-eos-var-label="Starts with" data-eos-var-scope="prop">{instagramHandle.startsWith('@') ? instagramHandle : `@${instagramHandle}`}</span>
            </a>
          )}
        </div>

        {/* Stats row */}
        {stats && (
          <div data-eos-id="src/components/user-card.tsx#23" className="flex gap-2 px-4 pb-4 pt-1">
            <StatBox data-eos-id="src/components/user-card.tsx#24"
              icon={<Calendar data-eos-id="src/components/user-card.tsx#25" size={16} />}
              value={stats.events}
              label="Events"
            />
            <StatBox data-eos-id="src/components/user-card.tsx#26"
              icon={<Star data-eos-id="src/components/user-card.tsx#27" size={16} />}
              value={stats.points}
              label="Points"
            />
            <StatBox data-eos-id="src/components/user-card.tsx#28"
              icon={<TreePine data-eos-id="src/components/user-card.tsx#29" size={16} />}
              value={stats.treesPlanted}
              label="Trees"
            />
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
