import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { MapPin, ChevronLeft, Tent, Check } from 'lucide-react'
import { WaitlistJoin } from '@/components/waitlist-join'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { Button } from '@/components/button'
import { Skeleton } from '@/components/skeleton'
import { OGMeta } from '@/components/og-meta'
import { formatTime } from '@/lib/date-format'
import { WebFooter } from '@/components/web-footer'
import { CampoutGuestRequirementsModal } from '@/components/campout-guest-requirements-modal'
import { TicketQuestionsModal } from '@/components/ticket-questions-modal'
import { useEventTicketQuestions, type TicketAnswers } from '@/hooks/use-event-ticket-questions'
import { guestSafetyPayload, type GuestSafetyAnswers } from '@/lib/dietary'
import { type CampoutEvent, resolveCampoutGroup, flagshipConfig } from '@/lib/campout-groups'

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
  /** NULL = unbounded. Drives the waitlist offer on a full date. */
  free_seats?: number | null
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

export default function CampoutTypePage() {
  const { type } = useParams<{ type: string }>()
  const shouldReduceMotion = useReducedMotion()
  // Flagship slugs (outback/rainforest) resolve their copy synchronously so the
  // hero renders instantly. Derived slugs resolve once events load.
  const staticCfg = flagshipConfig(type)

  const { data, isLoading } = useQuery({
    queryKey: ['public-campout-type', type],
    queryFn: async () => {
      const { data: events, error } = await supabase
        .from('events')
        .select('id, title, address, description, date_start, date_end, cover_image_url, event_extras')
        .eq('is_public', true)
        .eq('status', 'published')
        .eq('activity_type', 'camp_out')
        .order('date_start', { ascending: true })
      if (error) throw error
      const group = resolveCampoutGroup((events ?? []) as CampoutEvent[], type)
      if (!group) return { group: null, rows: [] as DateRow[] }

      const mine = group.events
      const { data: tt } = mine.length
        ? await supabase.from('event_ticket_types').select('event_id, id, price_cents').in('event_id', mine.map((e) => e.id)).eq('is_active', true)
        : { data: [] }
      const ttByEvent: Record<string, { id: string; price_cents: number }> = {}
      for (const t of tt ?? []) {
        const cur = ttByEvent[t.event_id as string]
        if (!cur || (t.price_cents as number) < cur.price_cents) ttByEvent[t.event_id as string] = { id: t.id as string, price_cents: t.price_cents as number }
      }
      // Real availability, not just the manual Eventbrite flag. Until
      // 2026-09-05 this page read event_extras.sold_out alone, so a date that
      // was genuinely at capacity rendered as bookable, took the buyer through
      // the whole safety-requirements flow, and only then failed in
      // reserve_event_ticket with "Sold out". Same display-versus-gate drift
      // the public event page was fixed for on 2026-08-25. event_free_seats is
      // SECURITY DEFINER and granted to anon precisely so this page can tell a
      // logged-out visitor the truth.
      const freeByEvent: Record<string, number | null> = {}
      await Promise.all(mine.map(async (e) => {
        const { data: free } = await supabase.rpc('event_free_seats', { p_event_id: e.id })
        freeByEvent[e.id] = (free as number | null) ?? null
      }))

      const rows = mine.map((e) => {
        const ex = e.event_extras as Record<string, unknown> | null
        const free = freeByEvent[e.id]
        return {
          id: e.id,
          title: e.title,
          address: e.address,
          date_start: e.date_start,
          date_end: e.date_end,
          cover_image_url: e.cover_image_url,
          price_cents: ttByEvent[e.id]?.price_cents ?? null,
          ticket_type_id: ttByEvent[e.id]?.id ?? null,
          free_seats: free,
          sold_out: !!(ex && typeof ex === 'object' && ex.sold_out === true)
            || (free !== null && free <= 0),
        }
      }) as DateRow[]
      return { group, rows }
    },
    enabled: !!type,
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [showReqs, setShowReqs] = useState(false)
  const [showQuestions, setShowQuestions] = useState(false)
  // The safety answers are collected in the FIRST modal and only spent once
  // the (optional) questions step is done, so they have to survive in between.
  const [safety, setSafety] = useState<GuestSafetyAnswers | null>(null)

  const group = data?.group ?? null
  const rows = data?.rows ?? []
  // Effective header copy: the loaded group, else the synchronous flagship copy.
  const cfg = group ?? staticCfg
  const selected = rows.find((r) => r.id === selectedId) ?? null
  // Custom ticket questions belong to the DATE the buyer picked, not to the
  // camp-out group, so this refetches as the selection changes. Anon can read
  // them: RLS opens event_ticket_questions for public+published+ticketed events
  // precisely so guest checkout can render them.
  const { data: ticketQuestions = [] } = useEventTicketQuestions(selected?.id)
  const cover = rows.find((r) => r.cover_image_url)?.cover_image_url ?? null

  // Every event on this page is a camp-out, so the whole retreat safety set
  // (dietary, medical, AND a reachable emergency contact) is mandatory before
  // checkout. The Book button opens the requirements modal; its answers flow
  // into book(), which forwards ALL of them via guestSafetyPayload.
  // guest-ticket-checkout is the server-side choke-point that also enforces +
  // persists them, so dropping a field here is not a lax client, it is a dead
  // end: the server rejects the booking and the buyer cannot fix it.
  function startBooking() {
    if (!selected?.ticket_type_id || selected.sold_out) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr('Please enter a valid email address'); return }
    setErr(null)
    setShowReqs(true)
  }

  async function book(reqs: GuestSafetyAnswers, answers?: TicketAnswers) {
    if (!selected?.ticket_type_id || selected.sold_out) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/guest-ticket-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ event_id: selected.id, ticket_type_id: selected.ticket_type_id, email: email.trim(), name: name.trim(), quantity: 1, answers: answers ?? null, ...guestSafetyPayload(reqs) }),
      })
      const out = await res.json()
      if (!res.ok || !out.url) throw new Error(out.error || 'Could not start checkout')
      window.location.href = out.url
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start checkout')
      setBusy(false)
      setShowReqs(false)
      setShowQuestions(false)
    }
  }

  if (!cfg) {
    if (isLoading) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-white p-6 text-center">
          <OGMeta title="Campouts" description="Co-Exist conservation campouts." canonicalPath="/campouts" />
          <Skeleton className="h-8 w-52 rounded-md" />
        </div>
      )
    }
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
                    const active = selectedId === r.id
                    const d = new Date(r.date_start)
                    const wd = d.toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'UTC' })
                    const day = d.toLocaleDateString('en-AU', { day: 'numeric', timeZone: 'UTC' })
                    const mon = d.toLocaleDateString('en-AU', { month: 'short', timeZone: 'UTC' })
                    const ends = r.date_end ? new Date(r.date_end).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : null
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => { setSelectedId(selectedId === r.id ? null : r.id); setErr(null) }}
                        className={cn(
                          'flex w-full items-center gap-3.5 rounded-md border px-3 py-3 text-left transition-all duration-150',
                          soldOut && !active
                            ? 'border-neutral-200 bg-neutral-50'
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
                {selected && selected.sold_out && (
                  <div className="pt-4">
                    <WaitlistJoin
                      eventId={selected.id}
                      ticketTypeId={selected.ticket_type_id}
                      source="public"
                      variant="public"
                    />
                  </div>
                )}
                {selected && !selected.sold_out && (
                  <div className="pt-4">
                    <div className="space-y-2.5">
                      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" className="w-full rounded-md border border-neutral-200 px-4 py-3 text-neutral-900 outline-none focus:border-primary-500" />
                      <input value={email} onChange={(e) => { setEmail(e.target.value); setErr(null) }} type="email" inputMode="email" autoComplete="email" placeholder="Email for your ticket" className="w-full rounded-md border border-neutral-200 px-4 py-3 text-neutral-900 outline-none focus:border-primary-500" />
                    </div>
                    {err && <p className="mt-2 text-sm text-error-500">{err}</p>}
                    <Button variant="primary" size="lg" fullWidth loading={busy} disabled={busy} onClick={startBooking} className="mt-3">
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

      <CampoutGuestRequirementsModal
        open={showReqs}
        submitting={busy}
        isCampout={true}
        onClose={() => { if (!busy) setShowReqs(false) }}
        onSubmit={(vals) => {
          // Safety set collected. If the organiser also set custom questions on
          // this date, they are a HARD server requirement (validate_ticket_answers
          // raises 23514 and reserve_event_ticket fails), so ask them before
          // spending the answers on a checkout that cannot succeed.
          setSafety(vals)
          setShowReqs(false)
          if (ticketQuestions.length > 0) { setShowQuestions(true); return }
          void book(vals)
        }}
      />

      <TicketQuestionsModal
        open={showQuestions}
        questions={ticketQuestions}
        submitting={busy}
        onClose={() => { if (!busy) setShowQuestions(false) }}
        onSubmit={(answers) => {
          if (!safety) return
          setShowQuestions(false)
          void book(safety, answers)
        }}
      />

      <WebFooter />
    </div>
  )
}
