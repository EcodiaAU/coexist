import Link from 'next/link'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { Reveal } from '@/components/reveal'
import { getPublicImpactStats, type PublicImpactStats } from '@/lib/public-stats'

export const revalidate = 1800

export const metadata: Metadata = {
  title: 'Support us',
  description:
    'Donate, partner, or fundraise for Co-Exist. Become a corporate partner and put young people back into nature across Australia. ACNC registered charity.',
}

const FALLBACK: PublicImpactStats = { volunteers: 5500, collectives: 15, plants: 46400, rubbishKg: 5900, events: 340 }
const fmt = (n: number) => new Intl.NumberFormat('en-AU').format(n)

const WAYS = [
  { title: 'Donate', body: 'A one-off or regular gift funds events, equipment and the people who make conservation days happen.', href: '/donate', cta: 'Make a donation' },
  { title: 'Fundraise', body: 'Run your own fundraiser, or rally your workplace or school. We will help you set it up.', href: '/contact', cta: 'Get in touch' },
  { title: 'Volunteer', body: 'Give your time and skills. Lead a collective, or help run the movement behind the scenes.', href: '/get-involved/team', cta: 'Join the team' },
]

const ENABLES = [
  { k: 'Events on the ground', v: 'Plantings, clean-ups and nature days run by local young people, every week, all over the country.' },
  { k: 'Gear that gets reused', v: 'Tools, gloves, native seedlings and safety kit that equip a whole collective, not just one day.' },
  { k: 'Leaders, supported', v: 'Training and backing for the young people who start and run collectives in their own towns.' },
]

// Corporate brands + sponsors (from the live support page). Distinct from the
// foundation funders shown on the home page.
const BRANDS = [
  { name: 'Habitat Co', src: '/images/brands/habitatco.png' },
  { name: 'Zorali', src: '/images/brands/zorali.jpg' },
  { name: 'Endless Parks', src: '/images/brands/endlessparks.jpg' },
  { name: 'Survival', src: '/images/brands/survival.png' },
]

export default async function SupportPage() {
  let stats: PublicImpactStats = FALLBACK
  try { stats = await getPublicImpactStats() } catch { stats = FALLBACK }

  const tiles = [
    { value: fmt(stats.rubbishKg), unit: 'kg', label: 'Litter removed' },
    { value: fmt(stats.plants), unit: '', label: 'Native plants' },
    { value: fmt(stats.collectives), unit: '', label: 'Collectives' },
    { value: fmt(stats.volunteers), unit: '', label: 'Young volunteers' },
  ]

  return (
    <main>
      <PageHeader
        eyebrow="Support us"
        title="Back young people in nature"
        subtitle="Co-Exist is a registered charity. Your support goes straight into local conservation and the young people driving it."
        image="/images/nature.webp"
      />

      {/* Live impact strip - what support has already built */}
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 px-6 py-16 sm:grid-cols-4 sm:py-20">
          {tiles.map((t, i) => (
            <div key={t.label} className={i > 0 ? 'border-l border-neutral-200 pl-8' : ''}>
              <p className="display-tight text-4xl font-light text-neutral-900 sm:text-5xl" style={{ letterSpacing: '-0.04em' }}>
                {t.value}
                {t.unit && <span className="ml-1 text-xl font-light text-neutral-400">{t.unit}</span>}
              </p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-neutral-400">{t.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Corporate partner - feature band */}
      <section className="bg-olive-800 text-oncream">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 md:grid-cols-2">
          <Reveal>
            <p className="eyebrow text-sage">For business</p>
            <h2 className="mt-4 text-4xl text-oncream sm:text-5xl">Become a corporate partner</h2>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-oncream/85">
              Partner with Co-Exist to back young people leading real conservation across Australia.
              We build partnerships that fit, from event sponsorship and team volunteer days to
              multi-year program support, with the impact reporting to match.
            </p>
            <Link href="/contact" className="mt-8 inline-block rounded-full bg-oncream px-8 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-olive-900 transition-all duration-300 hover:px-10">
              Start a conversation
            </Link>
          </Reveal>
          <Reveal delay={120} className="border-l-2 border-sage pl-8">
            <span className="block font-light leading-none text-sage" style={{ fontSize: '4rem', lineHeight: 1 }} aria-hidden="true">&ldquo;</span>
            <blockquote className="display-tight -mt-2 text-3xl font-light leading-snug text-oncream sm:text-4xl">
              You&apos;re actually making a difference to the world around you.
            </blockquote>
            <p className="label mt-6 text-sage">Sam Lundberg, Co-Exist volunteer</p>
          </Reveal>
        </div>
      </section>

      {/* What your support enables */}
      <section className="bg-cream">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <p className="eyebrow text-primary-600">Where it goes</p>
          <h2 className="display-tight mt-3 max-w-2xl text-4xl text-neutral-900 sm:text-5xl">Every dollar does something you can see</h2>
          <div className="mt-12 grid gap-x-10 gap-y-12 md:grid-cols-3">
            {ENABLES.map((e, i) => (
              <Reveal key={e.k} delay={i * 80} className="border-t border-neutral-200 pt-6">
                <h3 className="text-xl text-neutral-900">{e.k}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-neutral-500">{e.v}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Collaborations & sponsorships - featured brand */}
      <section className="border-y border-neutral-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center">
          <h2 className="display-tight text-3xl text-neutral-900 sm:text-4xl">Collaborations &amp; sponsorships</h2>
          <div className="mt-10 flex justify-center border-t border-neutral-200 pt-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/brands/sunslayer.jpg" alt="Sunslayer" className="h-14 w-auto object-contain grayscale opacity-60 transition-all duration-300 hover:grayscale-0 hover:opacity-100" />
          </div>
          <p className="label mt-12 text-neutral-400">Supporters &amp; corporate donors</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-14 gap-y-10 border-t border-neutral-200 pt-8">
            {BRANDS.map((bd) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={bd.name} src={bd.src} alt={bd.name} className="h-10 w-auto max-w-[120px] object-contain grayscale opacity-60 transition-all duration-300 hover:grayscale-0 hover:opacity-100" />
            ))}
          </div>
        </div>
      </section>

      {/* Ways to support */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <p className="eyebrow text-primary-600">Ways to support</p>
          <h2 className="display-tight mt-3 text-4xl text-neutral-900 sm:text-5xl">More ways to help</h2>
          <div className="mt-10 grid gap-x-8 gap-y-10 md:grid-cols-3">
            {WAYS.map((w) => (
              <div key={w.title} className="flex flex-col border-t border-neutral-200 pt-6">
                <h3 className="text-2xl text-neutral-900">{w.title}</h3>
                <p className="mt-3 flex-1 text-[15px] leading-relaxed text-neutral-500">{w.body}</p>
                <Link href={w.href} className="mt-5 inline-block text-xs font-semibold uppercase tracking-[0.18em] text-primary-700 hover:text-primary-900">
                  {w.cta} →
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-12 text-sm text-neutral-400">
            Co-Exist Australia Ltd is an ACNC registered charity. ABN 39 660 776 983. Donations over $2 are tax deductible.
          </p>
        </div>
      </section>
    </main>
  )
}
