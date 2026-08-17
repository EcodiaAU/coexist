import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { MapPin, ArrowRight, Tent } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { OGMeta } from '@/components/og-meta'
import { WebFooter } from '@/components/web-footer'
import { OptimizedImage } from '@/components/optimized-image'
import {
  type CampoutEvent,
  type CampoutGroup,
  groupUpcomingCampouts,
  flagshipPlaceholders,
} from '@/lib/campout-groups'

// Gap-free bento that adapts to the tile count. Mobile always stacks a single
// column; the grid only activates from lg (or sm for the 5+ scrolling grid).
function bentoContainerClass(count: number): string {
  if (count <= 1) return 'grid grid-cols-1 lg:h-dvh'
  if (count === 2) return 'grid lg:grid-cols-2 lg:h-dvh'
  if (count <= 4) return 'grid lg:grid-cols-2 lg:grid-rows-2 lg:h-dvh'
  return 'grid grid-cols-1 sm:grid-cols-2'
}

// Per-tile grid-span so no cell is ever left empty.
function bentoTileClass(count: number, i: number, total: number): string {
  if (count === 3 && i === 0) return 'lg:row-span-2' // tall feature left, two stacked right
  if (count >= 5 && total % 2 === 1 && i === total - 1) return 'sm:col-span-2' // odd tail fills the row
  return ''
}

export default function PublicCampoutsPage() {
  const shouldReduceMotion = useReducedMotion()

  const { data } = useQuery({
    queryKey: ['public-campouts-types'],
    queryFn: async () => {
      const { data: events, error } = await supabase
        .from('events')
        .select('id, title, address, description, date_start, date_end, cover_image_url')
        .eq('is_public', true)
        .eq('status', 'published')
        .eq('activity_type', 'camp_out')
        .order('date_start', { ascending: true })
      if (error) throw error
      const rows = (events ?? []) as CampoutEvent[]

      const now = new Date()
      const ids = rows.filter((e) => new Date((e.date_end ?? e.date_start) as string) >= now).map((e) => e.id)
      const priceByEvent: Record<string, number> = {}
      if (ids.length) {
        const { data: tt } = await supabase.from('event_ticket_types').select('event_id, price_cents').in('event_id', ids).eq('is_active', true)
        for (const t of tt ?? []) {
          const c = t.price_cents as number
          if (priceByEvent[t.event_id as string] === undefined || c < priceByEvent[t.event_id as string]) priceByEvent[t.event_id as string] = c
        }
      }

      return groupUpcomingCampouts(rows, priceByEvent)
    },
  })

  const groups = data ?? []
  const tiles: CampoutGroup[] = groups.length ? groups : flagshipPlaceholders()
  const count = tiles.length
  const tileAspect = count >= 5 ? 'aspect-[16/10]' : 'aspect-square lg:aspect-auto lg:h-full'

  return (
    <div className="min-h-dvh bg-secondary-950">
      <OGMeta title="Conservation Campouts" description="Weekends in the wild with Co-Exist Australia. Camp, restore habitat, and meet your people. Book your spot." canonicalPath="/campouts" />

      {/* Full-bleed campout tiles in a gap-free bento; mobile stacks single-column. */}
      <div className={bentoContainerClass(count)}>
        {tiles.map((c, i) => (
          <motion.div
            key={c.slug}
            initial={shouldReduceMotion ? undefined : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            className={cn('relative', bentoTileClass(count, i, count))}
          >
            <Link
              to={`/campouts/${c.slug}`}
              className={cn('group relative flex flex-col justify-end overflow-hidden', tileAspect)}
            >
              {c.cover ? (
                <OptimizedImage
                  src={c.cover}
                  alt={c.name}
                  priority
                  quality={70}
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  srcSetWidths={[640, 960, 1280, 1600]}
                  wrapperClassName="absolute inset-0"
                  className="transition-transform duration-[1.2s] ease-out group-hover:scale-[1.04]"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-primary-800"><Tent size={64} className="text-primary-300" /></div>
              )}
              {/* Legibility scrim */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/20" />

              <div className="relative p-7 sm:p-10 lg:p-12 text-white">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70 mb-3">Co-Exist Campouts</p>
                <h2 className="font-heading text-[2.25rem] sm:text-[3rem] font-bold uppercase leading-[0.92] tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]">
                  {c.name}
                </h2>
                <p className="mt-3 flex items-center gap-1.5 text-sm text-white/85">
                  <MapPin size={14} className="shrink-0" /> {c.place}
                </p>
                <p className="mt-1 text-[15px] font-semibold text-white">
                  {c.count > 0 ? <>{c.count} {c.count === 1 ? 'date' : 'dates'}{c.minPrice !== null ? ` · from $${(c.minPrice / 100).toFixed(0)}` : ''}</> : 'Dates coming soon'}
                </p>

                <span className="mt-6 inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-bold text-secondary-950 shadow-lg transition-transform duration-200 group-hover:gap-3 group-active:scale-[0.98]">
                  Choose a date <ArrowRight size={16} />
                </span>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      <WebFooter />
    </div>
  )
}
