import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { MapPin, ChevronLeft, Tent, Check, TreePine, Users, Flame, Sunrise } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { Button } from '@/components/button'
import { Skeleton } from '@/components/skeleton'
import { OGMeta } from '@/components/og-meta'
import { formatTime } from '@/lib/date-format'
import { WebFooter } from '@/components/web-footer'

type CampoutType = 'outback' | 'rainforest'

interface Highlight { icon: typeof TreePine; label: string }

const TYPE_CONFIG: Record<CampoutType, { name: string; place: string; blurb: string; match: (t: string) => boolean; highlights: Highlight[] }> = {
  outback: {
    name: 'Outback Campout',
    place: 'Myall Park Botanic Garden, Glenmorgan QLD',
    blurb: 'Out west at Myall Park Botanic Garden. Wide skies, campfires under the stars, and hands-on restoration in the Queensland outback. Arrive Friday afternoon, wrap up Sunday morning.',
    highlights: [
      { icon: TreePine, label: 'Hands-on habitat restoration' },
      { icon: Flame, label: 'Campfires under big outback skies' },
      { icon: Users, label: 'A weekend with your people' },
      { icon: Sunrise, label: 'Friday arvo to Sunday morning' },
    ],
    match: (t) => /myall park/i.test(t),
  },
  rainforest: {
    name: 'Rainforest Campout',
    place: 'Wild Mountains, Running Creek QLD',
    blurb: 'Deep in the Wild Mountains rainforest. Camp under the canopy and help restore one of the region\'s richest ecosystems. A weekend of real work and real people, far from the noise.',
    highlights: [
      { icon: TreePine, label: 'Restore ancient rainforest' },
      { icon: Flame, label: 'Camp under the canopy' },
      { icon: Users, label: 'A weekend with your people' },
      { icon: Sunrise, label: 'Friday arvo to Sunday morning' },
    ],
    match: (t) => /wild mountain/i.test(t),
  },
}

interface DateRow {
  id: string
  title: string
  address: string | null
  date_start: string
  date_end: string | null
  cover_image_url: string | null
  price_cents: number | null
  ticket_type_id: string | null
  sold_out: boolean
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

export default function CampoutTypePage() {
  const { type } = useParams<{ type: string }>()
  const shouldReduceMotion = useReducedMotion()
  const cfg = type === 'outback' || type === 'rainforest' ? TYPE_CONFIG[type] : null

  const { data: dates, isLoading } = useQuery({
    queryKey: ['public-campout-type', type],
    queryFn: async () => {
      const { data: events, error } = await supabase
        .from('events')
        .select('id, title, address, date_start, date_end, cover_image_url, event_extras')
        .eq('is_public', true)
        .eq('status', 'published')
        .eq('activity_type', 'camp_out')
        .order('date_start', { ascending: true })
      if (error) throw error
      const mine = (events ?? []).filter(
        (e) => cfg!.match(e.title as string) && new Date((e.date_end ?? e.date_start) as string) >= new Date(),
      )
      const { data: tt } = mine.length
        ? await supabase.from('event_ticket_types').select('event_id, id, price_cents').in('event_id', mine.map((e) => e.id)).eq('is_active', true)
        : { data: [] }
      const ttByEvent: Record<string, { id: string; price_cents: number }> = {}
      for (const t of tt ?? []) {
        const cur = ttByEvent[t.event_id as string]
        if (!cur || (t.price_cents as number) < cur.price_cents) ttByEvent[t.event_id as string] = { id: t.id as string, price_cents: t.price_cents as number }
      }
      return mine.map((e) => {
        const ex = e.event_extras as Record<string, unknown> | null
        return {
          ...e,
          price_cents: ttByEvent[e.id as string]?.price_cents ?? null,
          ticket_type_id: ttByEvent[e.id as string]?.id ?? null,
          sold_out: !!(ex && typeof ex === 'object' && ex.sold_out === true),
        }
      }) as DateRow[]
    },
    enabled: !!cfg,
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const rows = dates ?? []
  const selected = rows.find((r) => r.id === selectedId) ?? null
  const cover = rows.find((r) => r.cover_image_url)?.cover_image_url ?? null

  async function book() {
    if (!selected?.ticket_type_id || selected.sold_out) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr('Please enter a valid email address'); return }
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/guest-ticket-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ event_id: selected.id, ticket_type_id: selected.ticket_type_id, email: email.trim(), name: name.trim(), quantity: 1 }),
      })
      const out = await res.json()
      if (!res.ok || !out.url) throw new Error(out.error || 'Could not start checkout')
      window.location.href = out.url
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start checkout')
      setBusy(false)
    }
  }

  if (!cfg) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-white p-6 text-center">
        <OGMeta title="Campouts" description="Co-Exist conservation campouts." canonicalPath="/campouts" />
        <h1 className="font-heading text-2xl font-bold text-neutral-900">Campout not found</h1>
        <Link to="/campouts" className="mt-3 text-sm font-medium text-primary-600 underline">Back to campouts</Link>
      </div>
    )
  }

  const fromPrice = rows.reduce<number | null>((m, r) => (r.price_cents == null ? m : m == null ? r.price_cents : Math.min(m, r.price_cents)), null)

  return (
    <div className="min-h-dvh bg-white">
      <OGMeta title={cfg.name} description={cfg.blurb} canonicalPath={`/campouts/${type}`} image={cover || undefined} />

      {/* ── Immersive hero ── */}
      <div className="relative h-[58vh] min-h-[22rem] sm:h-[66vh] bg-secondary-950 overflow-hidden">
        {cover ? (
          <motion.img
            src={cover} alt={cfg.name}
            className="h-full w-full object-cover"
            initial={shouldReduceMotion ? undefined : { scale: 1.06 }}
            animate={{ scale: 1 }}
            transition={{ duration: 1.4, ease: 'easeOut' }}
          />
        ) : (
          <div className="flex h-full items-center justify-center"><Tent size={64} className="text-primary-300" /></div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-secondary-950 via-secondary-950/35 to-black/25" />
        <Link to="/campouts" className="absolute top-4 left-4 sm:top-6 sm:left-6 inline-flex items-center gap-1 rounded-full bg-black/30 px-3 py-1.5 text-[13px] font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/50">
          <ChevronLeft size={15} /> Campouts
        </Link>
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-5xl px-5 sm:px-8 pb-9 sm:pb-14">
            <motion.div
              initial={shouldReduceMotion ? undefined : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70 mb-3">Co-Exist Campouts</p>
              <h1 className="font-heading text-[2.6rem] sm:text-[4.25rem] font-bold uppercase leading-[0.9] tracking-tight text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.55)]">
                {cfg.name}
              </h1>
              <p className="mt-3 flex items-center gap-1.5 text-[15px] text-white/85">
                <MapPin size={15} className="shrink-0" /> {cfg.place}
              </p>
            </motion.div>
          </div>
        </div>
      </div>

      {/* ── Body: story + sticky booking ── */}
      <main className="mx-auto max-w-5xl px-5 sm:px-8 py-10 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr] lg:gap-16">
          {/* LEFT: story + highlights */}
          <div>
            <p className="text-lg sm:text-xl leading-relaxed text-neutral-700">{cfg.blurb}</p>

            <div className="mt-9 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
              {cfg.highlights.map((h) => (
                <div key={h.label} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-moss-50">
                    <h.icon size={18} className="text-moss-700" />
                  </span>
                  <span className="text-[15px] font-medium text-neutral-800 leading-snug pt-1.5">{h.label}</span>
                </div>
              ))}
            </div>

            <div className="mt-10 rounded-lg bg-primary-950 px-6 py-7 text-white">
              <p className="font-heading text-xl sm:text-2xl italic leading-snug">Every campout restores real habitat.</p>
              <p className="mt-2 text-[15px] text-white/65 leading-relaxed">You camp, you work alongside good people, and you leave a place better than you found it. That is the whole idea.</p>
            </div>
          </div>

          {/* RIGHT: sticky booking card */}
          <div className="lg:sticky lg:top-8 self-start">
            <div className="rounded-xl border border-neutral-200 bg-white shadow-[0_2px_24px_rgba(0,0,0,0.06)] p-5 sm:p-6">
              <div className="flex items-baseline justify-between">
                <h2 className="font-heading text-xl font-bold text-neutral-900">Choose your date</h2>
                {fromPrice !== null && <span className="text-sm font-medium text-neutral-500">from ${(fromPrice / 100).toFixed(0)}</span>}
              </div>

              {isLoading ? (
                <div className="mt-4 space-y-2.5"><Skeleton className="h-16 rounded-md" /><Skeleton className="h-16 rounded-md" /></div>
              ) : rows.length === 0 ? (
                <div className="mt-4 rounded-md border border-neutral-100 bg-neutral-50 px-5 py-8 text-center">
                  <p className="text-sm text-neutral-500">No upcoming dates right now. Check back soon.</p>
                </div>
              ) : (
                <div className="mt-4 space-y-2.5">
                  {rows.map((r) => {
                    const soldOut = r.sold_out
                    const active = selectedId === r.id && !soldOut
                    const d = new Date(r.date_start)
                    const wd = d.toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'UTC' })
                    const day = d.toLocaleDateString('en-AU', { day: 'numeric', timeZone: 'UTC' })
                    const mon = d.toLocaleDateString('en-AU', { month: 'short', timeZone: 'UTC' })
                    const ends = r.date_end ? new Date(r.date_end).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : null
                    return (
                      <button
                        key={r.id}
                        type="button"
                        disabled={soldOut}
                        aria-disabled={soldOut}
                        onClick={() => { if (soldOut) return; setSelectedId(active ? null : r.id); setErr(null) }}
                        className={cn(
                          'flex w-full items-center gap-3.5 rounded-md border px-3 py-3 text-left transition-all duration-150',
                          soldOut
                            ? 'border-neutral-200 bg-neutral-50 cursor-not-allowed'
                            : active
                              ? 'border-primary-600 bg-primary-50 ring-1 ring-primary-600'
                              : 'border-neutral-200 bg-white hover:border-primary-300 hover:bg-primary-50/40',
                        )}
                      >
                        <div className={cn('flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-md leading-none', soldOut ? 'bg-neutral-100 text-neutral-400' : active ? 'bg-primary-600 text-white' : 'bg-primary-50 text-primary-700')}>
                          <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">{wd}</span>
                          <span className="font-heading text-xl font-bold">{day}</span>
                          <span className="text-[10px] font-semibold uppercase opacity-70">{mon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={cn('block text-sm font-semibold', soldOut ? 'text-neutral-400' : 'text-neutral-900')}>{formatDate(r.date_start)}</span>
                          <span className="block text-[12px] text-neutral-500">{formatTime(r.date_start)}{ends ? ` to ${ends}` : ''}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2.5">
                          {soldOut ? (
                            <span className="rounded-full bg-neutral-200 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-neutral-600">Sold out</span>
                          ) : (
                            <>
                              {r.price_cents !== null && <span className="font-heading text-base font-bold text-neutral-900">${(r.price_cents / 100).toFixed(0)}</span>}
                              <span className={cn('flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors', active ? 'border-primary-600 bg-primary-600 text-white' : 'border-neutral-200')}>
                                {active && <Check size={12} strokeWidth={3} />}
                              </span>
                            </>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Booking form, revealed once a date is chosen */}
              <motion.div initial={false} animate={{ height: selected ? 'auto' : 0, opacity: selected ? 1 : 0 }} transition={{ duration: shouldReduceMotion ? 0 : 0.25 }} className="overflow-hidden">
                {selected && (
                  <div className="pt-4">
                    <div className="space-y-2.5">
                      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" className="w-full rounded-md border border-neutral-200 px-4 py-3 text-neutral-900 outline-none focus:border-primary-500" />
                      <input value={email} onChange={(e) => { setEmail(e.target.value); setErr(null) }} type="email" inputMode="email" autoComplete="email" placeholder="Email for your ticket" className="w-full rounded-md border border-neutral-200 px-4 py-3 text-neutral-900 outline-none focus:border-primary-500" />
                    </div>
                    {err && <p className="mt-2 text-sm text-error-500">{err}</p>}
                    <Button variant="primary" size="lg" fullWidth loading={busy} disabled={busy} onClick={book} className="mt-3">
                      {`Book ${formatDate(selected.date_start)}${selected.price_cents !== null ? ` - $${(selected.price_cents / 100).toFixed(0)}` : ''}`}
                    </Button>
                    <p className="mt-2.5 text-center text-xs text-neutral-400">No account needed. We&apos;ll email your ticket and a link to the group chat.</p>
                  </div>
                )}
              </motion.div>
            </div>
          </div>
        </div>
      </main>

      <WebFooter />
    </div>
  )
}
