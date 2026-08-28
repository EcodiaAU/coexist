import { useMemo, useState } from 'react'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { ArrowUpRight, MapPin } from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { EmptyState } from '@/components/empty-state'
import { OptimizedImage } from '@/components/optimized-image'
import { FilterPillRow, type FilterOption } from '@/components/filter-pill-row'
import { coverImagePositionStyle } from '@/lib/cover-image'
import { cn } from '@/lib/cn'
import {
  useDoGoodOrganisations,
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

/** One crop for every card. A taller lead tile reads as an accident rather than
 *  as emphasis once the page ground is white and the cards are the only colour,
 *  so the grid stays uniform (Tate, 2026-08-28). */
const CARD_ASPECT = 'aspect-[4/5]'

/* ------------------------------------------------------------------ */
/*  Organisation card                                                  */
/* ------------------------------------------------------------------ */

/** Full-bleed photographic card. The OPPORTUNITY is the headline, because the
 *  question someone is holding on this page is "what can I go and do", and the
 *  organisation answers "with whom". Every card is one tap to their own page. */
function OrgCard({ org }: { org: DoGoodOrganisation }) {
  const rm = useReducedMotion()
  const href = org.url ? externalUrl(org.url) : null

  const inner = (
    <>
      {org.cover && (
        <OptimizedImage
          src={org.cover}
          alt=""
          aspectRatio="4/5"
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
          <h3 className="font-heading text-[1.55rem] font-bold leading-[1.02] tracking-tight text-white line-clamp-4 drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]">
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
    CARD_ASPECT,
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
  const [filter, setFilter] = useState<string>('all')

  // Pills are derived from what is actually listed, so a category with nothing
  // in it never renders an empty filter.
  const categories = useMemo(() => {
    const seen: string[] = []
    for (const o of orgs ?? []) if (!seen.includes(o.category)) seen.push(o.category)
    return seen
  }, [orgs])

  const filterOptions = useMemo<FilterOption[]>(
    () => [
      { id: 'all', label: 'All' },
      ...categories.map((c) => ({ id: c, label: CATEGORY_LABELS[c] ?? c })),
    ],
    [categories],
  )

  const visible =
    filter === 'all' ? (orgs ?? []) : (orgs ?? []).filter((o) => o.category === filter)

  return (
    <Page
      swipeBack
      noBackground
      className="!px-0 bg-white"
      stickyOverlay={<Header title="Do Good" back transparent className="collapse-header" />}
    >
      <div style={{ paddingTop: '3.5rem' }}>
        {/* Centred title block on the white ground. The photographs live on the
            cards, which is where they earn their place. */}
        <motion.div
          className="px-6 pb-8 pt-8 text-center"
          initial={rm ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="font-heading text-[3rem] font-bold uppercase leading-[0.88] tracking-tight text-moss-900">
            Do
            <br />
            Good
          </h1>
          <p className="mx-auto mt-4 max-w-[30ch] text-[14px] leading-relaxed text-neutral-600">
            Co-Exist is not the only mob doing this work. Here is where else you
            can put your hands to it.
          </p>
        </motion.div>

        <div className="px-4 pb-14">
          {isLoading ? (
            <div className="space-y-4">
              <div className={cn('w-full animate-pulse rounded-2xl bg-neutral-200/70', CARD_ASPECT)} />
              <div className={cn('w-full animate-pulse rounded-2xl bg-neutral-200/70', CARD_ASPECT)} />
            </div>
          ) : isError ? (
            <EmptyState
              illustration="error"
              title="Couldn't load organisations"
              description="Something went wrong loading the directory. Please try again shortly."
            />
          ) : !orgs?.length ? (
            <EmptyState
              illustration="empty"
              title="Nothing listed yet"
              description="We're building this directory of other organisations to get involved with. Check back soon."
            />
          ) : (
            <>
              {categories.length > 1 && (
                <FilterPillRow
                  options={filterOptions}
                  value={filter}
                  onChange={setFilter}
                  aria-label="Filter organisations by category"
                  className="-mx-4 mb-3 px-4"
                />
              )}

              <motion.div
                className="space-y-4 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0 lg:grid-cols-3"
                initial="hidden"
                animate="visible"
                variants={rm ? undefined : stagger}
              >
                {visible.map((org) => (
                  <OrgCard key={org.id} org={org} />
                ))}
              </motion.div>
            </>
          )}

          <p className="mx-auto mt-10 max-w-[38ch] text-center text-[11px] leading-relaxed text-neutral-500">
            These organisations run their own programs. Links open outside the app.
          </p>
        </div>
      </div>
    </Page>
  )
}
