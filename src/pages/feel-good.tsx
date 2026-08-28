import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { Phone, Globe, Clock, ShieldAlert, MessageSquare, ArrowUpRight } from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { EmptyState } from '@/components/empty-state'
import { OptimizedImage } from '@/components/optimized-image'
import { coverImagePositionStyle } from '@/lib/cover-image'
import { cn } from '@/lib/cn'
import {
  useSupportResources,
  useCategoryImages,
  dialString,
  externalUrl,
  type SupportResource,
} from '@/hooks/use-good'

/* ------------------------------------------------------------------ */
/*  Motion                                                             */
/* ------------------------------------------------------------------ */

const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } }
const rise: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
}

const CATEGORY_LABELS: Record<string, string> = {
  crisis: 'Crisis support',
  counselling: 'Counselling',
  youth: 'For young people',
  identity: 'LGBTIQ+',
  first_nations: 'First Nations',
  family: 'Family and safety',
  general: 'Support',
}

/* ------------------------------------------------------------------ */
/*  Resource card                                                      */
/* ------------------------------------------------------------------ */

/** Full-bleed photographic card. The image carries the mood, the overlay
 *  carries the words, and the NUMBER sits on top as a solid pill so it stays
 *  readable over any photo. Crisis lines get the taller crop and the filled
 *  pill; the rest get a shorter crop and a glass pill, which is what separates
 *  "call this right now" from "worth knowing about". */
function ResourceCard({ resource, lead }: { resource: SupportResource; lead: boolean }) {
  const rm = useReducedMotion()
  const dial = resource.phone ? dialString(resource.phone) : null

  return (
    <motion.article
      variants={rm ? undefined : rise}
      className={cn(
        'relative overflow-hidden rounded-2xl bg-plum-900 shadow-lg shadow-plum-900/10',
        lead ? 'aspect-[4/5]' : 'aspect-square',
      )}
    >
      {resource.cover && (
        <OptimizedImage
          src={resource.cover}
          alt=""
          aspectRatio={lead ? '4/5' : '1/1'}
          wrapperClassName="absolute inset-0"
          className="absolute inset-0"
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          imgStyle={coverImagePositionStyle(resource.image_position_x, resource.image_position_y)}
        />
      )}

      {/* Legibility. Two stops, weighted to the bottom where the words live. */}
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/45 to-black/10"
        aria-hidden="true"
      />

      {/* Category, top left */}
      <div className="absolute top-4 left-4 right-4 flex items-start justify-between gap-2">
        <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white backdrop-blur-md">
          {CATEGORY_LABELS[resource.category] ?? CATEGORY_LABELS.general}
        </span>
        {resource.hours && (
          <span className="inline-flex items-center gap-1 rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-semibold text-white/85 backdrop-blur-md">
            <Clock size={10} strokeWidth={2.4} />
            {resource.hours}
          </span>
        )}
      </div>

      {/* Words + action */}
      <div className="absolute inset-x-0 bottom-0 p-5">
        <h3
          className={cn(
            'font-heading font-bold text-white leading-[0.98] tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]',
            lead ? 'text-[2rem]' : 'text-[1.5rem]',
          )}
        >
          {resource.name}
        </h3>
        {resource.tagline && (
          <p className="mt-2 max-w-[30ch] text-[13px] leading-relaxed text-white/80 line-clamp-3">
            {resource.tagline}
          </p>
        )}

        {dial && (
          <a
            href={`tel:${dial}`}
            aria-label={`Call ${resource.name} on ${resource.phone}`}
            className={cn(
              'mt-4 flex min-h-[54px] w-full items-center justify-center gap-2.5 rounded-full px-4',
              'font-heading text-[20px] font-bold tabular-nums tracking-tight',
              'transition-transform duration-150 active:scale-[0.985]',
              lead
                ? 'bg-white text-plum-900 shadow-lg shadow-black/25'
                : 'bg-white/15 text-white ring-1 ring-white/35 backdrop-blur-md',
            )}
          >
            <Phone size={17} strokeWidth={2.4} className="shrink-0" />
            {resource.phone}
          </a>
        )}
        {resource.phone_note && (
          <p className="mt-1.5 text-center text-[11px] text-white/60">{resource.phone_note}</p>
        )}

        <div className="mt-3 flex items-center gap-4">
          {resource.sms_number && (
            <a
              href={`sms:${dialString(resource.sms_number)}`}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/75 transition-colors hover:text-white"
            >
              <MessageSquare size={12} strokeWidth={2.2} />
              Text {resource.sms_number}
            </a>
          )}
          {resource.url && (
            <a
              href={externalUrl(resource.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-white/75 transition-colors hover:text-white"
            >
              <Globe size={12} strokeWidth={2.2} className="shrink-0" />
              <span className="truncate">
                {resource.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
              </span>
              <ArrowUpRight size={11} strokeWidth={2.6} className="shrink-0" />
            </a>
          )}
        </div>
      </div>
    </motion.article>
  )
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

function FeelGoodSkeleton() {
  return (
    <div className="space-y-4 pb-10">
      <div className="aspect-[4/5] w-full animate-pulse rounded-2xl bg-neutral-200/70" />
      <div className="aspect-square w-full animate-pulse rounded-2xl bg-neutral-200/70" />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function FeelGoodPage() {
  const rm = useReducedMotion()
  const { data: resources, isLoading, isError } = useSupportResources()
  const { data: covers } = useCategoryImages()

  const crisis = (resources ?? []).filter((r) => r.is_crisis)
  const rest = (resources ?? []).filter((r) => !r.is_crisis)
  const heroImage = covers?.['feel_good:crisis'] ?? covers?.['feel_good:general'] ?? null

  return (
    <Page
      swipeBack
      noBackground
      className="!px-0 bg-plum-900"
      stickyOverlay={<Header title="Feel Good" back transparent className="collapse-header" />}
    >
      {/* Full-bleed photographic hero */}
      <div className="relative min-h-[62vh] overflow-hidden bg-plum-900">
        {heroImage && (
          <OptimizedImage
            src={heroImage}
            alt=""
            priority
            quality={74}
            sizes="100vw"
            srcSetWidths={[640, 960, 1280]}
            wrapperClassName="absolute inset-0"
            className="absolute inset-0"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-plum-900 via-plum-900/55 to-black/25" aria-hidden="true" />

        <motion.div
          className="absolute inset-x-0 bottom-0 p-6 pb-9"
          initial={rm ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/60">Co-Exist</p>
          <h1 className="mt-3 font-heading text-[3rem] font-bold uppercase leading-[0.88] tracking-tight text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.5)]">
            Feel
            <br />
            Good
          </h1>
          <p className="mt-4 max-w-[30ch] text-[14px] leading-relaxed text-white/75">
            Looking after the planet starts with looking after yourself. Everyone
            here is trained, free, and answering right now.
          </p>
        </motion.div>
      </div>

      {/* Emergency. Pinned directly under the hero, never CMS-editable, so it
          cannot be reordered below the fold or edited away. */}
      <a
        href="tel:000"
        className="flex items-center gap-4 bg-coral-600 px-5 py-4 transition-transform duration-150 active:scale-[0.995]"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15">
          <ShieldAlert size={20} className="text-white" strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-[15px] font-bold text-white">
            If a life is in danger, call 000
          </span>
          <span className="block text-[12px] text-white/75">Police, fire and ambulance. Tap to dial.</span>
        </span>
        <Phone size={17} className="shrink-0 text-white/80" strokeWidth={2.2} />
      </a>

      <div className="bg-plum-900 px-4 pb-14 pt-8">
        {isLoading ? (
          <FeelGoodSkeleton />
        ) : isError ? (
          <div className="rounded-2xl bg-white/95 p-1">
            <EmptyState
              illustration="error"
              title="Couldn't load support services"
              description="Something went wrong. The 000 line above still works, and Lifeline is 13 11 14."
            />
          </div>
        ) : !resources?.length ? (
          <div className="rounded-2xl bg-white/95 p-1">
            <EmptyState
              illustration="empty"
              title="Nothing listed yet"
              description="Support services are being added. In the meantime, Lifeline is 13 11 14, any hour."
            />
          </div>
        ) : (
          <motion.div initial="hidden" animate="visible" variants={rm ? undefined : stagger}>
            {crisis.length > 0 && (
              <>
                <SectionLabel>If you need someone now</SectionLabel>
                <div className="mb-10 space-y-4 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0 lg:grid-cols-3">
                  {crisis.map((r) => (
                    <ResourceCard key={r.id} resource={r} lead />
                  ))}
                </div>
              </>
            )}

            {rest.length > 0 && (
              <>
                <SectionLabel>More support</SectionLabel>
                <div className="space-y-4 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0 lg:grid-cols-3">
                  {rest.map((r) => (
                    <ResourceCard key={r.id} resource={r} lead={false} />
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}

        <p className="mx-auto mt-10 max-w-[36ch] text-center text-[11px] leading-relaxed text-white/40">
          Co-Exist is not a counselling service. Everyone listed here is, and
          talking to them costs nothing.
        </p>
      </div>
    </Page>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3 px-1">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">{children}</p>
      <div className="h-px flex-1 bg-white/12" />
    </div>
  )
}
