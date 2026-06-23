import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Calendar, MapPin, Tent, ChevronRight, TreePine } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { Skeleton } from '@/components/skeleton'
import { OGMeta } from '@/components/og-meta'
import { formatTime } from '@/lib/date-format'
import { WebFooter } from '@/components/web-footer'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

/** Floating-local: the stored wall-clock is the wall-clock for every viewer. */
function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

interface CampoutRow {
  id: string
  title: string
  address: string | null
  date_start: string
  date_end: string | null
  cover_image_url: string | null
}

export default function PublicCampoutsPage() {
  const shouldReduceMotion = useReducedMotion()

  const { data, isLoading } = useQuery({
    queryKey: ['public-campouts'],
    queryFn: async () => {
      const { data: events, error } = await supabase
        .from('events')
        .select('id, title, address, date_start, date_end, cover_image_url')
        .eq('is_public', true)
        .eq('status', 'published')
        .eq('activity_type', 'camp_out')
        .order('date_start', { ascending: true })
      if (error) throw error

      const upcoming = (events ?? []).filter(
        (e) => new Date((e.date_end ?? e.date_start) as string) >= new Date(),
      ) as CampoutRow[]

      // Cheapest ticket per event for a "from $X" label (anon-readable for
      // public ticketed events via ticket_types_public_select).
      const priceByEvent: Record<string, number> = {}
      if (upcoming.length > 0) {
        const { data: tt } = await supabase
          .from('event_ticket_types')
          .select('event_id, price_cents')
          .in('event_id', upcoming.map((e) => e.id))
          .eq('is_active', true)
        for (const t of tt ?? []) {
          const cents = t.price_cents as number
          if (priceByEvent[t.event_id as string] === undefined || cents < priceByEvent[t.event_id as string]) {
            priceByEvent[t.event_id as string] = cents
          }
        }
      }
      return { campouts: upcoming, priceByEvent }
    },
  })

  const campouts = data?.campouts ?? []
  const priceByEvent = data?.priceByEvent ?? {}

  return (
    <div className="min-h-dvh bg-white">
      <OGMeta
        title="Conservation Campouts"
        description="Weekends in the wild with Co-Exist Australia. Camp, restore habitat, and meet your people. Book your spot."
        canonicalPath="/campouts"
      />

      {/* Header */}
      <header className="relative overflow-hidden bg-secondary-950 text-white">
        <TreePine className="pointer-events-none absolute -bottom-8 -right-6 text-white/[0.06]" size={200} strokeWidth={1.2} />
        <div className="mx-auto max-w-3xl px-5 sm:px-6 pt-16 pb-12 sm:pt-20 sm:pb-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary-300 mb-3">Co-Exist Australia</p>
          <h1 className="font-heading text-[2.5rem] sm:text-[3.5rem] font-bold uppercase leading-[0.9] tracking-tight">
            Conservation<br />Campouts
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/80">
            Weekends in the wild. Camp under the stars, restore habitat with your hands, and meet the people doing the work. Pick a date below to book your spot.
          </p>
        </div>
      </header>

      {/* List */}
      <main className="mx-auto max-w-3xl px-5 sm:px-6 py-8 sm:py-10">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-44 rounded-md" />
            <Skeleton className="h-44 rounded-md" />
            <Skeleton className="h-44 rounded-md" />
          </div>
        ) : campouts.length === 0 ? (
          <div className="rounded-md border border-neutral-100 bg-neutral-50 px-6 py-12 text-center">
            <Tent size={28} className="mx-auto text-primary-400 mb-3" />
            <p className="font-heading text-lg font-bold text-neutral-900">No campouts scheduled right now</p>
            <p className="mt-1 text-sm text-neutral-500">Check back soon, or follow along for the next dates.</p>
          </div>
        ) : (
          <motion.div
            variants={shouldReduceMotion ? undefined : stagger}
            initial="hidden"
            animate="visible"
            className="space-y-4"
          >
            {campouts.map((e) => {
              const price = priceByEvent[e.id]
              return (
                <motion.div key={e.id} variants={shouldReduceMotion ? undefined : fadeUp}>
                  <Link
                    to={`/event/${e.id}`}
                    className="group block overflow-hidden rounded-md border border-neutral-100 bg-white shadow-sm transition-transform duration-200 active:scale-[0.99]"
                  >
                    <div className="relative h-40 sm:h-48 bg-primary-800 overflow-hidden">
                      {e.cover_image_url ? (
                        <img src={e.cover_image_url} alt={e.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                      ) : (
                        <div className="flex h-full items-center justify-center"><Tent size={48} className="text-primary-300" /></div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                      <div className="absolute bottom-3 left-4 right-4">
                        <h2 className="font-heading text-lg sm:text-xl font-bold text-white leading-snug drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
                          {e.title}
                        </h2>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 px-4 py-3.5">
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="flex items-center gap-1.5 text-sm font-medium text-neutral-900">
                          <Calendar size={14} className="shrink-0 text-primary-500" />
                          {formatDate(e.date_start)}
                          <span className="text-neutral-400">·</span>
                          {formatTime(e.date_start)}
                        </p>
                        {e.address && (
                          <p className="flex items-center gap-1.5 text-[13px] text-neutral-500 truncate">
                            <MapPin size={13} className="shrink-0 text-neutral-400" />
                            <span className="truncate">{e.address}</span>
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {price !== undefined && (
                          <span className="text-right">
                            <span className="block text-[10px] uppercase tracking-wide text-neutral-400">from</span>
                            <span className="font-heading text-base font-bold text-neutral-900">${(price / 100).toFixed(0)}</span>
                          </span>
                        )}
                        <ChevronRight size={18} className="text-neutral-300 transition-transform duration-150 group-hover:translate-x-0.5" />
                      </div>
                    </div>
                  </Link>
                </motion.div>
              )
            })}
          </motion.div>
        )}

        <p className={cn('mt-8 text-center text-xs text-neutral-400')}>
          Booking is secure via Stripe. No account needed. We&apos;ll email your ticket and a link to the campout group chat.
        </p>
      </main>

      <WebFooter />
    </div>
  )
}
