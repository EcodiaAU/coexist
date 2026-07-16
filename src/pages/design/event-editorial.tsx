import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
    Calendar, Clock, MapPin, Users,
    Compass, Backpack, Shirt, Mountain, Sun,
    ArrowLeft,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { WaveTransition } from '@/components/wave-transition'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

const MOCK_EVENTS = [
  {
    id: '1',
    title: 'Yarra River Shore Cleanup',
    activity_type: 'clean_up',
    activity_label: 'CLEAN UP',
    date: 'Sat, Apr 12',
    time: '7:30 AM - 11:00 AM',
    duration: '3.5 hrs',
    collective: 'Melbourne Central',
    address: 'Dights Falls, Abbotsford VIC 3067',
    description: 'Join us for a morning along the Yarra River banks near Dights Falls. We\'ll be removing litter from the waterway, cataloguing microplastics, and restoring native ground cover along the embankment.\n\nThis stretch of river is home to platypus and a recovering population of river blackfish - every piece of rubbish we remove directly protects these species.',
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=900&h=600&fit=crop',
    spots: '14/20',
    what_to_bring: 'Reusable water bottle, sunscreen, closed-toe shoes',
    what_to_wear: 'Old clothes you don\'t mind getting muddy. Long pants recommended.',
    meeting_point: 'Dights Falls car park, next to the footbridge',
    terrain: 'Riverbank',
    difficulty: 'easy' as const,
  },
  {
    id: '2',
    title: 'Wilsons Prom Native Planting Day',
    activity_type: 'tree_planting',
    activity_label: 'TREE PLANTING',
    date: 'Sun, Apr 20',
    time: '8:00 AM - 2:00 PM',
    duration: '6 hrs',
    collective: 'Gippsland',
    address: 'Tidal River, Wilsons Promontory VIC 3960',
    image: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=900&h=600&fit=crop',
    spots: '8/30',
    description: 'A full day of planting in the heart of the Prom. We\'re restoring coastal banksia woodland after the 2020 fires.',
    what_to_bring: 'Lunch, 2L water, gardening gloves',
    what_to_wear: 'Sun hat, sturdy boots, layers',
    meeting_point: 'Tidal River visitor centre',
    terrain: 'Coastal bushland',
    difficulty: 'moderate' as const,
  },
  {
    id: '3',
    title: 'Moonlight Marine Survey',
    activity_type: 'ecosystem_restoration',
    activity_label: 'ECOSYSTEM RESTORATION',
    date: 'Fri, Apr 25',
    time: '6:30 PM - 9:30 PM',
    duration: '3 hrs',
    collective: 'Mornington Peninsula',
    address: 'Point Nepean National Park, VIC 3944',
    image: 'https://images.unsplash.com/photo-1583212292454-1fe6229603b7?w=900&h=600&fit=crop',
    spots: '6/12',
    description: 'Survey intertidal rock pools at dusk. Identify and log marine species, assist with seagrass monitoring.',
    what_to_bring: 'Torch, warm layers, notebook',
    what_to_wear: 'Wetsuit booties or reef shoes',
    meeting_point: 'Quarantine Station car park',
    terrain: 'Rocky shoreline',
    difficulty: 'moderate' as const,
  },
]

/* ------------------------------------------------------------------ */
/*  Activity tag colours - muted, earthy, on-brand                     */
/* ------------------------------------------------------------------ */

const activityTagStyle: Record<string, { bg: string; text: string; iconBg: string; iconText: string }> = {
  clean_up:               { bg: 'bg-sky-500/90',     text: 'text-white', iconBg: 'bg-sky-100',     iconText: 'text-sky-700' },
  tree_planting:           { bg: 'bg-primary-600/90', text: 'text-white', iconBg: 'bg-primary-100', iconText: 'text-primary-700' },
  ecosystem_restoration:   { bg: 'bg-sprout-600/90',  text: 'text-white', iconBg: 'bg-sprout-100',  iconText: 'text-sprout-700' },
  nature_hike:             { bg: 'bg-bark-500/90',    text: 'text-white', iconBg: 'bg-bark-100',    iconText: 'text-bark-700' },
  camp_out:                { bg: 'bg-bark-600/90',   text: 'text-white', iconBg: 'bg-bark-100',   iconText: 'text-bark-700' },
  spotlighting:            { bg: 'bg-primary-700/90', text: 'text-white', iconBg: 'bg-primary-100', iconText: 'text-primary-700' },
  other:                   { bg: 'bg-neutral-600/90', text: 'text-white', iconBg: 'bg-neutral-100', iconText: 'text-neutral-700' },
}

const defaultTag = { bg: 'bg-primary-600/90', text: 'text-white', iconBg: 'bg-primary-100', iconText: 'text-primary-700' }

const difficultyConfig = {
  easy:        { label: 'Easy',       color: 'bg-success-100 text-success-700' },
  moderate:    { label: 'Moderate',   color: 'bg-warning-100 text-warning-700' },
  challenging: { label: 'Challenging', color: 'bg-error-100 text-error-700' },
}


const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.4 } },
}

/* ------------------------------------------------------------------ */
/*  Editorial Event Card                                               */
/* ------------------------------------------------------------------ */

function EditorialEventCard({
  event,
  onTap,
}: {
  event: typeof MOCK_EVENTS[0]
  onTap: () => void
}) {
  const shouldReduceMotion = useReducedMotion()
  const tag = activityTagStyle[event.activity_type] ?? defaultTag

  return (
    <motion.button data-eos-id="src/pages/design/event-editorial.tsx#0" data-eos-v="2"
      type="button"
      onClick={onTap}
      variants={shouldReduceMotion ? undefined : fadeUp}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.975 }}
      transition={{ type: 'spring', stiffness: 400, damping: 26, mass: 0.7 }}
      className="relative w-full rounded-md overflow-hidden cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 group"
      aria-label={`${event.title} - ${event.date}`}
    >
      {/* Full-bleed photo */}
      <div data-eos-id="src/pages/design/event-editorial.tsx#1" className="relative w-full" style={{ aspectRatio: '3/2' }}>
        <img data-eos-src="dynamic" data-eos-src-label="Image" data-eos-id="src/pages/design/event-editorial.tsx#2"
          src={event.image}
          alt={event.title}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          loading="lazy"
        />

        {/* Bottom gradient for text legibility */}
        <div data-eos-id="src/pages/design/event-editorial.tsx#3"
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent"
          aria-hidden="true"
        />

        {/* Activity tag - top left */}
        <span data-eos-id="src/pages/design/event-editorial.tsx#4" data-eos-var="event.activity_label" data-eos-var-label="Activity label" data-eos-var-scope="prop"
          className={cn(
            'absolute top-3 left-3 z-10',
            'inline-flex items-center px-2.5 py-[5px] rounded-full',
            'text-[10px] font-bold uppercase tracking-[0.08em] leading-none',
            'backdrop-blur-sm shadow-sm',
            tag.bg, tag.text,
          )}
        >
          {event.activity_label}
        </span>

        {/* Text overlay - bottom */}
        <div data-eos-id="src/pages/design/event-editorial.tsx#5" className="absolute bottom-0 left-0 right-0 p-4 pb-4.5 z-[5]">
          <h3 data-eos-id="src/pages/design/event-editorial.tsx#6" data-eos-var="event.title" data-eos-var-label="Title" data-eos-var-scope="prop" className="font-heading text-[17px] sm:text-lg font-bold text-white leading-snug drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
            {event.title}
          </h3>
          <p data-eos-id="src/pages/design/event-editorial.tsx#7" data-eos-var="event.date,event.time" data-eos-var-label="Date, Time" data-eos-var-scope="prop" className="text-[13px] font-medium text-white/70 mt-1 drop-shadow-sm">
            {event.date} · {event.time.split('-')[0].trim()}
          </p>
          <p data-eos-id="src/pages/design/event-editorial.tsx#8" data-eos-var="event.collective" data-eos-var-label="Collective" data-eos-var-scope="prop" className="text-[12px] font-medium text-white/50 mt-0.5 drop-shadow-sm">
            {event.collective}
          </p>
        </div>
      </div>
    </motion.button>
  )
}

/* ------------------------------------------------------------------ */
/*  Field Journal Section Heading                                      */
/* ------------------------------------------------------------------ */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 data-eos-id="src/pages/design/event-editorial.tsx#9" className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400 mb-3">
      {children}
    </h4>
  )
}

/* ------------------------------------------------------------------ */
/*  Detail Info Row                                                    */
/* ------------------------------------------------------------------ */

function InfoRow({
  icon,
  label,
  value,
  accent,
  action,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent: typeof defaultTag
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div data-eos-id="src/pages/design/event-editorial.tsx#10" className="flex items-start gap-3.5 py-3 first:pt-0 last:pb-0">
      <span data-eos-id="src/pages/design/event-editorial.tsx#11"
        className={cn(
          'flex items-center justify-center w-9 h-9 rounded-sm shrink-0',
          accent.iconBg, accent.iconText,
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div data-eos-id="src/pages/design/event-editorial.tsx#12" className="flex-1 min-w-0 pt-0.5">
        <p data-eos-id="src/pages/design/event-editorial.tsx#13" className="text-[10px] uppercase tracking-[0.14em] font-semibold text-neutral-400 leading-none">{label}</p>
        <p data-eos-id="src/pages/design/event-editorial.tsx#14" className="text-[14px] font-semibold text-neutral-800 mt-1 leading-snug break-words">{value}</p>
      </div>
      {action && (
        <button data-eos-id="src/pages/design/event-editorial.tsx#15" data-eos-var="action.label" data-eos-var-label="Label" data-eos-var-scope="prop"
          type="button"
          onClick={action.onClick}
          className={cn(
            'min-h-[36px] flex items-center justify-center gap-1 px-3 py-1.5 rounded-sm text-[12px] font-bold shrink-0 mt-0.5',
            'cursor-pointer select-none active:scale-[0.98] transition-transform duration-150',
            'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
          )}
        >
          <Compass data-eos-id="src/pages/design/event-editorial.tsx#16" size={12} />
          {action.label}
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Detail Page                                                        */
/* ------------------------------------------------------------------ */

function EditorialEventDetail({
  event,
  onBack,
}: {
  event: typeof MOCK_EVENTS[0]
  onBack: () => void
}) {
  const shouldReduceMotion = useReducedMotion()
  const tag = activityTagStyle[event.activity_type] ?? defaultTag
  const diff = event.difficulty ? difficultyConfig[event.difficulty] : null
  const [expanded, setExpanded] = useState(false)

  return (
    <div data-eos-id="src/pages/design/event-editorial.tsx#17" className="relative bg-white min-h-full">
      {/* ── Hero image ── */}
      <div data-eos-id="src/pages/design/event-editorial.tsx#18" className="relative w-full" style={{ height: '45vh', minHeight: 280 }}>
        <img data-eos-src="dynamic" data-eos-src-label="Image" data-eos-id="src/pages/design/event-editorial.tsx#19"
          src={event.image}
          alt={event.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div data-eos-id="src/pages/design/event-editorial.tsx#20"
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/10"
          aria-hidden="true"
        />

        {/* Back + activity tag */}
        <div data-eos-id="src/pages/design/event-editorial.tsx#21" className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pointer-events-none">
          <button data-eos-id="src/pages/design/event-editorial.tsx#22"
            type="button"
            onClick={onBack}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm text-white cursor-pointer select-none active:scale-95 transition-transform duration-150 pointer-events-auto"
            aria-label="Go back"
          >
            <ArrowLeft data-eos-id="src/pages/design/event-editorial.tsx#23" size={18} />
          </button>
        </div>

        {/* Activity tag */}
        <span data-eos-id="src/pages/design/event-editorial.tsx#24" data-eos-var="event.activity_label" data-eos-var-label="Activity label" data-eos-var-scope="prop"
          className={cn(
            'absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-20',
            'inline-flex items-center px-2.5 py-[5px] rounded-full',
            'text-[10px] font-bold uppercase tracking-[0.08em] leading-none',
            'backdrop-blur-sm shadow-sm',
            tag.bg, tag.text,
          )}
        >
          {event.activity_label}
        </span>

        {/* Title on hero */}
        <div data-eos-id="src/pages/design/event-editorial.tsx#25" className="absolute bottom-0 left-0 right-0 z-10 p-5 pb-14">
          <h1 data-eos-id="src/pages/design/event-editorial.tsx#26" data-eos-var="event.title" data-eos-var-label="Title" data-eos-var-scope="prop" className="font-heading text-[24px] font-bold text-white leading-tight drop-shadow-sm">
            {event.title}
          </h1>
          <p data-eos-id="src/pages/design/event-editorial.tsx#27" data-eos-var="event.collective" data-eos-var-label="Collective" data-eos-var-scope="prop" className="text-[13px] font-medium text-white/65 mt-1.5 drop-shadow">
            by {event.collective}
          </p>
        </div>

        {/* Wave cutout */}
        <WaveTransition data-eos-id="src/pages/design/event-editorial.tsx#28" wave={1} className="-bottom-px z-10" />
      </div>

      {/* ── Content ── */}
      <motion.div data-eos-id="src/pages/design/event-editorial.tsx#29"
        className="relative -mt-2 px-4 pb-28 space-y-5"
        variants={shouldReduceMotion ? undefined : stagger}
        initial="hidden"
        animate="visible"
      >
        {/* Key details card */}
        <motion.div data-eos-id="src/pages/design/event-editorial.tsx#30"
          variants={shouldReduceMotion ? undefined : fadeUp}
          className="rounded-md bg-white border border-neutral-200 p-5"
          style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
        >
          <SectionLabel data-eos-id="src/pages/design/event-editorial.tsx#31">Key Details</SectionLabel>
          <div data-eos-id="src/pages/design/event-editorial.tsx#32" className="divide-y divide-neutral-100">
            <InfoRow data-eos-id="src/pages/design/event-editorial.tsx#33"
              icon={<Calendar data-eos-id="src/pages/design/event-editorial.tsx#34" size={16} />}
              label="Date"
              value={event.date}
              accent={tag}
            />
            <InfoRow data-eos-id="src/pages/design/event-editorial.tsx#35"
              icon={<Clock data-eos-id="src/pages/design/event-editorial.tsx#36" size={16} />}
              label="Time"
              value={`${event.time}  ·  ${event.duration}`}
              accent={tag}
            />
            <InfoRow data-eos-id="src/pages/design/event-editorial.tsx#37"
              icon={<MapPin data-eos-id="src/pages/design/event-editorial.tsx#38" size={16} />}
              label="Location"
              value={event.address}
              accent={tag}
              action={{ label: 'Map', onClick: () => {} }}
            />
            <InfoRow data-eos-id="src/pages/design/event-editorial.tsx#39"
              icon={<Users data-eos-id="src/pages/design/event-editorial.tsx#40" size={16} />}
              label="Spots"
              value={event.spots}
              accent={tag}
            />
          </div>
        </motion.div>

        {/* Map placeholder */}
        <motion.div data-eos-id="src/pages/design/event-editorial.tsx#41"
          variants={shouldReduceMotion ? undefined : fadeUp}
          className="rounded-md overflow-hidden border border-neutral-200"
          style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.05)', aspectRatio: '16/9' }}
        >
          <div data-eos-id="src/pages/design/event-editorial.tsx#42" className="w-full h-full bg-neutral-100 flex items-center justify-center">
            <div data-eos-id="src/pages/design/event-editorial.tsx#43" className="text-center">
              <MapPin data-eos-id="src/pages/design/event-editorial.tsx#44" size={24} className="text-neutral-300 mx-auto mb-1.5" />
              <p data-eos-id="src/pages/design/event-editorial.tsx#45" className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Map View</p>
            </div>
          </div>
        </motion.div>

        {/* Description */}
        <motion.div data-eos-id="src/pages/design/event-editorial.tsx#46"
          variants={shouldReduceMotion ? undefined : fadeUp}
          className="rounded-md bg-white border border-neutral-200 p-5"
          style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
        >
          <SectionLabel data-eos-id="src/pages/design/event-editorial.tsx#47">About This Event</SectionLabel>
          <div data-eos-id="src/pages/design/event-editorial.tsx#48" className="relative">
            <p data-eos-id="src/pages/design/event-editorial.tsx#49" data-eos-var="event.description" data-eos-var-label="Description" data-eos-var-scope="prop"
              className={cn(
                'text-[14px] text-neutral-600 leading-[1.7] whitespace-pre-line',
                !expanded && 'line-clamp-4',
              )}
            >
              {event.description}
            </p>
            {!expanded && event.description.length > 180 && (
              <button data-eos-id="src/pages/design/event-editorial.tsx#50"
                type="button"
                onClick={() => setExpanded(true)}
                className="mt-2 text-[13px] font-bold text-primary-600 cursor-pointer select-none active:scale-[0.97] transition-transform duration-150"
              >
                Read more
              </button>
            )}
          </div>
        </motion.div>

        {/* Good to Know */}
        <motion.div data-eos-id="src/pages/design/event-editorial.tsx#51"
          variants={shouldReduceMotion ? undefined : fadeUp}
          className="rounded-md bg-white border border-neutral-200 p-5"
          style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
        >
          <SectionLabel data-eos-id="src/pages/design/event-editorial.tsx#52">Good to Know</SectionLabel>
          <div data-eos-id="src/pages/design/event-editorial.tsx#53" className="space-y-4">
            {event.meeting_point && (
              <div data-eos-id="src/pages/design/event-editorial.tsx#54" className="flex items-start gap-3">
                <span data-eos-id="src/pages/design/event-editorial.tsx#55" className={cn('flex items-center justify-center w-7 h-7 rounded-sm shrink-0', tag.iconBg, tag.iconText)}>
                  <MapPin data-eos-id="src/pages/design/event-editorial.tsx#56" size={13} />
                </span>
                <div data-eos-id="src/pages/design/event-editorial.tsx#57">
                  <p data-eos-id="src/pages/design/event-editorial.tsx#58" className="text-[10px] uppercase tracking-[0.14em] font-semibold text-neutral-400 leading-none">Meeting Point</p>
                  <p data-eos-id="src/pages/design/event-editorial.tsx#59" data-eos-var="event.meeting_point" data-eos-var-label="Meeting point" data-eos-var-scope="prop" className="text-[13px] font-medium text-neutral-700 mt-1">{event.meeting_point}</p>
                </div>
              </div>
            )}
            {event.what_to_bring && (
              <div data-eos-id="src/pages/design/event-editorial.tsx#60" className="flex items-start gap-3">
                <span data-eos-id="src/pages/design/event-editorial.tsx#61" className={cn('flex items-center justify-center w-7 h-7 rounded-sm shrink-0', tag.iconBg, tag.iconText)}>
                  <Backpack data-eos-id="src/pages/design/event-editorial.tsx#62" size={13} />
                </span>
                <div data-eos-id="src/pages/design/event-editorial.tsx#63">
                  <p data-eos-id="src/pages/design/event-editorial.tsx#64" className="text-[10px] uppercase tracking-[0.14em] font-semibold text-neutral-400 leading-none">What to Bring</p>
                  <p data-eos-id="src/pages/design/event-editorial.tsx#65" data-eos-var="event.what_to_bring" data-eos-var-label="What to bring" data-eos-var-scope="prop" className="text-[13px] font-medium text-neutral-700 mt-1">{event.what_to_bring}</p>
                </div>
              </div>
            )}
            {event.what_to_wear && (
              <div data-eos-id="src/pages/design/event-editorial.tsx#66" className="flex items-start gap-3">
                <span data-eos-id="src/pages/design/event-editorial.tsx#67" className={cn('flex items-center justify-center w-7 h-7 rounded-sm shrink-0', tag.iconBg, tag.iconText)}>
                  <Shirt data-eos-id="src/pages/design/event-editorial.tsx#68" size={13} />
                </span>
                <div data-eos-id="src/pages/design/event-editorial.tsx#69">
                  <p data-eos-id="src/pages/design/event-editorial.tsx#70" className="text-[10px] uppercase tracking-[0.14em] font-semibold text-neutral-400 leading-none">What to Wear</p>
                  <p data-eos-id="src/pages/design/event-editorial.tsx#71" data-eos-var="event.what_to_wear" data-eos-var-label="What to wear" data-eos-var-scope="prop" className="text-[13px] font-medium text-neutral-700 mt-1">{event.what_to_wear}</p>
                </div>
              </div>
            )}

            {/* Pills row */}
            <div data-eos-id="src/pages/design/event-editorial.tsx#72" className="flex flex-wrap gap-2 pt-1">
              {diff && (
                <span data-eos-id="src/pages/design/event-editorial.tsx#73" data-eos-var="diff.label" data-eos-var-label="Label" data-eos-var-scope="prop" className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold', diff.color)}>
                  <Sun data-eos-id="src/pages/design/event-editorial.tsx#74" size={12} />
                  {diff.label}
                </span>
              )}
              {event.terrain && (
                <span data-eos-id="src/pages/design/event-editorial.tsx#75" data-eos-var="event.terrain" data-eos-var-label="Terrain" data-eos-var-scope="prop" className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold', tag.iconBg, tag.iconText)}>
                  <Mountain data-eos-id="src/pages/design/event-editorial.tsx#76" size={12} />
                  {event.terrain}
                </span>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* ── Sticky CTA ── */}
      <div data-eos-id="src/pages/design/event-editorial.tsx#77" className="absolute bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-sm border-t border-neutral-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <motion.button data-eos-id="src/pages/design/event-editorial.tsx#78"
          type="button"
          whileTap={{ scale: 0.97 }}
          className={cn(
            'w-full min-h-[52px] rounded-md font-heading font-bold text-[15px] text-white',
            'flex items-center justify-center gap-2',
            'cursor-pointer select-none',
            'bg-primary-800 hover:bg-primary-950',
            'shadow-sm',
            'active:shadow-md transition-shadow duration-150',
          )}
        >
          Count Me In
        </motion.button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Phone Frame                                                        */
/* ------------------------------------------------------------------ */

function PhoneFrame({
  children,
  label,
}: {
  children: React.ReactNode
  label: string
}) {
  return (
    <div data-eos-id="src/pages/design/event-editorial.tsx#79" className="flex flex-col items-center">
      <p data-eos-id="src/pages/design/event-editorial.tsx#80" className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 mb-4">{label}</p>
      <div data-eos-id="src/pages/design/event-editorial.tsx#81"
        className="relative rounded-[40px] bg-neutral-900 p-2 shadow-sm"
        style={{ width: 320 }}
      >
        {/* Notch */}
        <div data-eos-id="src/pages/design/event-editorial.tsx#82" className="absolute top-0 left-1/2 -translate-x-1/2 z-50">
          <div data-eos-id="src/pages/design/event-editorial.tsx#83" className="w-[100px] h-[26px] bg-neutral-900 rounded-b-md" />
        </div>
        {/* Screen */}
        <div data-eos-id="src/pages/design/event-editorial.tsx#84"
          className="relative rounded-[32px] overflow-hidden bg-[#fafafa]"
          style={{ height: 640 }}
        >
          <div data-eos-id="src/pages/design/event-editorial.tsx#85" className="absolute inset-0 overflow-y-auto overscroll-contain scrollbar-none">
            {children}
          </div>
        </div>
        {/* Home indicator */}
        <div data-eos-id="src/pages/design/event-editorial.tsx#86" className="flex justify-center pt-1.5 pb-0.5">
          <div data-eos-id="src/pages/design/event-editorial.tsx#87" className="w-[120px] h-[4px] rounded-full bg-neutral-700" />
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Showcase Page                                                      */
/* ------------------------------------------------------------------ */

export default function EventEditorialShowcase() {
  const shouldReduceMotion = useReducedMotion()
  const [activeView, setActiveView] = useState<'feed' | 'detail'>('feed')
  const [selectedEvent, setSelectedEvent] = useState(MOCK_EVENTS[0])

  const handleCardTap = (event: typeof MOCK_EVENTS[0]) => {
    setSelectedEvent(event)
    setActiveView('detail')
  }

  return (
    <div data-eos-id="src/pages/design/event-editorial.tsx#88" className="min-h-screen bg-neutral-950 py-16 px-6">
      {/* Page header */}
      <motion.div data-eos-id="src/pages/design/event-editorial.tsx#89"
        className="max-w-5xl mx-auto text-center mb-16"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <p data-eos-id="src/pages/design/event-editorial.tsx#90" className="text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-500 mb-3">
          Co-Exist Design System
        </p>
        <h1 data-eos-id="src/pages/design/event-editorial.tsx#91" className="font-heading text-3xl sm:text-4xl font-bold text-white leading-tight">
          Event Cards & Detail
        </h1>
        <p data-eos-id="src/pages/design/event-editorial.tsx#92" className="text-[15px] text-neutral-400 mt-3 max-w-md mx-auto leading-relaxed">
          Photography-forward editorial layout. The image is the card. Typography does the work.
        </p>
      </motion.div>

      {/* Phone frames side by side */}
      <motion.div data-eos-id="src/pages/design/event-editorial.tsx#93"
        className="max-w-5xl mx-auto flex flex-col lg:flex-row items-start justify-center gap-12 lg:gap-16"
        variants={shouldReduceMotion ? undefined : stagger}
        initial="hidden"
        animate="visible"
      >
        {/* Feed view */}
        <motion.div data-eos-id="src/pages/design/event-editorial.tsx#94" variants={shouldReduceMotion ? undefined : fadeUp}>
          <PhoneFrame data-eos-id="src/pages/design/event-editorial.tsx#95" label="Event Feed">
            <div data-eos-id="src/pages/design/event-editorial.tsx#96" className="bg-[#fafafa] min-h-full pt-[42px]">
              {/* Status bar spacer */}
              <div data-eos-id="src/pages/design/event-editorial.tsx#97" className="px-4 pt-2 pb-1">
                <p data-eos-id="src/pages/design/event-editorial.tsx#98" className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">
                  Discover
                </p>
                <h2 data-eos-id="src/pages/design/event-editorial.tsx#99" className="font-heading text-[22px] font-bold text-neutral-900 leading-tight mt-0.5">
                  Events
                </h2>
              </div>

              {/* Cards */}
              <motion.div data-eos-id="src/pages/design/event-editorial.tsx#100"
                className="px-4 pt-3 pb-8 space-y-4"
                variants={shouldReduceMotion ? undefined : stagger}
                initial="hidden"
                animate="visible"
              >
                {MOCK_EVENTS.map((event) => (
                  <EditorialEventCard data-eos-id="src/pages/design/event-editorial.tsx#101"
                    key={event.id}
                    event={event}
                    onTap={() => handleCardTap(event)}
                  />
                ))}
              </motion.div>
            </div>
          </PhoneFrame>
        </motion.div>

        {/* Detail view */}
        <motion.div data-eos-id="src/pages/design/event-editorial.tsx#102" variants={shouldReduceMotion ? undefined : fadeUp}>
          <PhoneFrame data-eos-id="src/pages/design/event-editorial.tsx#103" label="Event Detail">
            <EditorialEventDetail data-eos-id="src/pages/design/event-editorial.tsx#104"
              event={selectedEvent}
              onBack={() => setActiveView('feed')}
            />
          </PhoneFrame>
        </motion.div>
      </motion.div>

      {/* Design notes */}
      <motion.div data-eos-id="src/pages/design/event-editorial.tsx#105"
        className="max-w-2xl mx-auto mt-20 grid grid-cols-2 sm:grid-cols-4 gap-6"
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.6 }}
      >
        {[
          { label: 'Card ratio', value: '3:2' },
          { label: 'Shadow', value: '0 1px 2px' },
          { label: 'Font', value: 'Montserrat' },
          { label: 'Headings', value: '10px tracked' },
        ].map((note) => (
          <div data-eos-id="src/pages/design/event-editorial.tsx#106" key={note.label} className="text-center">
            <p data-eos-id="src/pages/design/event-editorial.tsx#107" data-eos-var="note.label" data-eos-var-label="Label" data-eos-var-scope="item" className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-600">{note.label}</p>
            <p data-eos-id="src/pages/design/event-editorial.tsx#108" data-eos-var="note.value" data-eos-var-label="Value" data-eos-var-scope="item" className="text-[14px] font-semibold text-neutral-300 mt-1">{note.value}</p>
          </div>
        ))}
      </motion.div>
    </div>
  )
}
