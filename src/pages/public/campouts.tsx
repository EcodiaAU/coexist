import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { MapPin, ArrowRight, Tent } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { OGMeta } from '@/components/og-meta'
import { WebFooter } from '@/components/web-footer'
import { OptimizedImage } from '@/components/optimized-image'

type CampoutType = 'outback' | 'rainforest'

const TYPES: { key: CampoutType; name: string; place: string; match: (t: string) => boolean }[] = [
  { key: 'rainforest', name: 'Rainforest Campout', place: 'Wild Mountains, Running Creek QLD', match: (t) => /wild mountain/i.test(t) },
  { key: 'outback', name: 'Outback Campout', place: 'Myall Park Botanic Garden, Glenmorgan QLD', match: (t) => /myall park/i.test(t) },
]

interface EventRow { id: string; title: string; date_start: string; date_end: string | null; cover_image_url: string | null }

export default function PublicCampoutsPage() {
  const shouldReduceMotion = useReducedMotion()

  const { data } = useQuery({
    queryKey: ['public-campouts-types'],
    queryFn: async () => {
      const { data: events, error } = await supabase
        .from('events')
        .select('id, title, date_start, date_end, cover_image_url')
        .eq('is_public', true)
        .eq('status', 'published')
        .eq('activity_type', 'camp_out')
        .order('date_start', { ascending: true })
      if (error) throw error
      const upcoming = (events ?? []).filter((e) => new Date((e.date_end ?? e.date_start) as string) >= new Date()) as EventRow[]

      const ids = upcoming.map((e) => e.id)
      const priceByEvent: Record<string, number> = {}
      if (ids.length) {
        const { data: tt } = await supabase.from('event_ticket_types').select('event_id, price_cents').in('event_id', ids).eq('is_active', true)
        for (const t of tt ?? []) {
          const c = t.price_cents as number
          if (priceByEvent[t.event_id as string] === undefined || c < priceByEvent[t.event_id as string]) priceByEvent[t.event_id as string] = c
        }
      }

      return TYPES.map((ty) => {
        const mine = upcoming.filter((e) => ty.match(e.title))
        const minPrice = mine.reduce<number | null>((m, e) => {
          const p = priceByEvent[e.id]
          return p === undefined ? m : m === null ? p : Math.min(m, p)
        }, null)
        return { ...ty, count: mine.length, cover: mine.find((e) => e.cover_image_url)?.cover_image_url ?? null, minPrice }
      }).filter((t) => t.count > 0)
    },
  })

  const cards = data ?? []

  return (
    <div className="min-h-dvh bg-secondary-950">
      <OGMeta title="Conservation Campouts" description="Weekends in the wild with Co-Exist Australia. Camp, restore habitat, and meet your people. Book your spot." canonicalPath="/campouts" />

      {/* Two full-bleed tiles: side-by-side on laptop, stacked on mobile. */}
      <div className="grid lg:grid-cols-2 lg:h-dvh">
        {(cards.length ? cards : TYPES.map((t) => ({ ...t, count: 0, cover: null, minPrice: null }))).map((c, i) => (
          <motion.div
            key={c.key}
            initial={shouldReduceMotion ? undefined : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            className="relative"
          >
            <Link
              to={`/campouts/${c.key}`}
              className="group relative flex aspect-square lg:aspect-auto lg:h-full flex-col justify-end overflow-hidden"
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
