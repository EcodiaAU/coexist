import { useMemo, useState } from 'react'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { ArrowUpRight, MapPin } from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { EmptyState } from '@/components/empty-state'
import { OptimizedImage } from '@/components/optimized-image'
import { coverImagePositionStyle } from '@/lib/cover-image'
import { cn } from '@/lib/cn'
import {
  useDoGoodOrganisations,
  useCategoryImages,
  externalUrl,
  type DoGoodOrganisation,
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
  conservation: 'Land',
  wildlife: 'Wildlife',
  marine: 'Ocean',
  climate: 'Climate',
  community: 'Community',
  first_nations: 'First Nations',
  youth: 'Youth',
}

/* ------------------------------------------------------------------ */
/*  Organisation card                                                  */
/* ------------------------------------------------------------------ */

/** Full-bleed photographic card. The OPPORTUNITY is the headline, because the
 *  question someone is holding on this page is "what can I go and do", and the
 *  organisation answers "with whom". Every card is one tap to their own page.
 *  The first card in the list gets a taller crop so the page opens on an image
 *  rather than on a row of equal tiles. */
function OrgCard({ org, lead }: { org: DoGoodOrganisation; lead: boolean }) {
  const rm = useReducedMotion()
  const href = org.url ? externalUrl(org.url) : null
  const ratio = lead ? '4/5' : '1/1'

  const inner = (
    <>
      {org.cover && (
        <OptimizedImage
          src={org.cover}
          alt=""
          aspectRatio={ratio}
          wrapperClassName="absolute inset-0"
          className="absolute inset-0"
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          imgStyle={coverImagePositionStyle(org.image_position_x, org.image_position_y)}
        />
      )}
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/10"
        aria-hidden="true"
      />

      <div className="absolute top-4 left-4 right-4 flex items-start justify-between gap-2">
        <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white backdrop-blur-md">
          {CATEGORY_LABELS[org.category] ?? org.category}
        </span>
        {org.logo_url && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/90 p-1">
            <img src={org.logo_url} alt="" loading="lazy" className="h-full w-full object-contain" />
          </span>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-5">
        {org.opportunity && (
          <h3
            className={cn(
              'font-heading font-bold leading-[1.02] tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]',
              lead ? 'text-[1.75rem] line-clamp-4' : 'text-[1.35rem] line-clamp-3',
            )}
          >
            {org.opportunity}
          </h3>
        )}

        <p className="mt-2.5 text-[13px] font-semibold text-white/90">{org.name}</p>

        {org.blurb && (
          <p className="mt-1.5 max-w-[38ch] text-[12.5px] leading-relaxed text-white/65 line-clamp-2">
            {org.blurb}
          </p>
        )}

        <div className="mt-3.5 flex items-center justify-between gap-3">
          {org.location ? (
            <span className="inline-flex min-w-0 items-center gap-1 text-[11px] font-medium text-white/55">
              <MapPin size={11} strokeWidth={2.2} className="shrink-0" />
              <span className="truncate">{org.location}</span>
            </span>
          ) : (
            <span />
          )}
          {href && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-[12px] font-bold text-white ring-1 ring-white/25 backdrop-blur-md">
              Get involved
              <ArrowUpRight size={13} strokeWidth={2.6} />
            </span>
          )}
        </div>
      </div>
    </>
  )

  const shell = cn(
    'relative block overflow-hidden rounded-2xl bg-moss-900 shadow-lg shadow-moss-900/10',
    lead ? 'aspect-[4/5]' : 'aspect-square',
  )

  return (
    <motion.div variants={rm ? undefined : rise}>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${org.opportunity ?? 'Get involved'} with ${org.name}`}
          className={cn(shell, 'transition-transform duration-200 active:scale-[0.985]')}
        >
          {inner}
        </a>
      ) : (
        <div className={shell}>{inner}</div>
      )}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DoGoodPage() {
  const rm = useReducedMotion()
  const { data: orgs, isLoading, isError } = useDoGoodOrganisations()
  const { data: covers } = useCategoryImages()
  const [filter, setFilter] = useState<string | null>(null)

  // Chips are derived from what is actually listed, so a category with nothing
  // in it never renders an empty filter.
  const categories = useMemo(() => {
    const seen: string[] = []
    for (const o of orgs ?? []) if (!seen.includes(o.category)) seen.push(o.category)
    return seen
  }, [orgs])

  const visible = filter ? (orgs ?? []).filter((o) => o.category === filter) : (orgs ?? [])
  const heroImage = covers?.['do_good:conservation'] ?? covers?.['do_good:marine'] ?? null

  return (
    <Page
      swipeBack
      noBackground
      className="!px-0 bg-moss-900"
      stickyOverlay={<Header title="Do Good" back transparent className="collapse-header" />}
    >
      {/* Full-bleed photographic hero */}
      <div className="relative min-h-[62vh] overflow-hidden bg-moss-900">
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
        <div className="absolute inset-0 bg-gradient-to-t from-moss-900 via-moss-900/55 to-black/25" aria-hidden="true" />

        <motion.div
          className="absolute inset-x-0 bottom-0 p-6 pb-9"
          initial={rm ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/60">Co-Exist</p>
          <h1 className="mt-3 font-heading text-[3rem] font-bold uppercase leading-[0.88] tracking-tight text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.5)]">
            Do
            <br />
            Good
          </h1>
          <p className="mt-4 max-w-[30ch] text-[14px] leading-relaxed text-white/75">
            Co-Exist is not the only mob doing this work. Here is where else you
            can put your hands to it.
          </p>
        </motion.div>
      </div>

      <div className="bg-moss-900 px-4 pb-14 pt-6">
        {isLoading ? (
          <div className="space-y-4">
            <div className="aspect-[4/5] w-full animate-pulse rounded-2xl bg-white/10" />
            <div className="aspect-square w-full animate-pulse rounded-2xl bg-white/10" />
          </div>
        ) : isError ? (
          <div className="rounded-2xl bg-white/95 p-1">
            <EmptyState
              illustration="error"
              title="Couldn't load organisations"
              description="Something went wrong loading the directory. Please try again shortly."
            />
          </div>
        ) : !orgs?.length ? (
          <div className="rounded-2xl bg-white/95 p-1">
            <EmptyState
              illustration="empty"
              title="Nothing listed yet"
              description="We're building this directory of other organisations to get involved with. Check back soon."
            />
          </div>
        ) : (
          <>
            {categories.length > 1 && (
              <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 hide-scrollbar">
                <FilterChip active={filter === null} onClick={() => setFilter(null)}>All</FilterChip>
                {categories.map((c) => (
                  <FilterChip key={c} active={filter === c} onClick={() => setFilter(c)}>
                    {CATEGORY_LABELS[c] ?? c}
                  </FilterChip>
                ))}
              </div>
            )}

            <motion.div
              className="space-y-4 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0 lg:grid-cols-3"
              initial="hidden"
              animate="visible"
              variants={rm ? undefined : stagger}
            >
              {visible.map((org, i) => (
                <OrgCard key={org.id} org={org} lead={i === 0} />
              ))}
            </motion.div>
          </>
        )}

        <p className="mx-auto mt-10 max-w-[38ch] text-center text-[11px] leading-relaxed text-white/40">
          These organisations run their own programs. Links open outside the app.
        </p>
      </div>
    </Page>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full px-4 py-2 text-[12px] font-bold transition-colors',
        active
          ? 'bg-white text-moss-900'
          : 'bg-white/10 text-white/75 ring-1 ring-white/15 hover:text-white',
      )}
    >
      {children}
    </button>
  )
}
