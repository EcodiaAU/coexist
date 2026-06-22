import Image from 'next/image'
import Link from 'next/link'
import { getPublicImpactStats, type PublicImpactStats } from '@/lib/public-stats'
import { getSiteContent, getPartners } from '@/lib/queries'

// Revalidate the homepage (and its live impact figures) on a schedule rather
// than per request - the numbers move slowly and this keeps DB load bounded.
export const revalidate = 1800

// Baseline fallback so `next build` and a stats outage never 500 the homepage.
const FALLBACK: PublicImpactStats = {
  volunteers: 5500,
  collectives: 15,
  plants: 46400,
  rubbishKg: 5900,
  events: 340,
}

async function loadStats(): Promise<PublicImpactStats> {
  try {
    return await getPublicImpactStats()
  } catch {
    return FALLBACK
  }
}

const fmt = (n: number) => new Intl.NumberFormat('en-AU').format(n)

export default async function HomePage() {
  const [stats, content, partners] = await Promise.all([loadStats(), getSiteContent(), getPartners()])
  const heroTitle = content.home_hero_title || 'Explore. Connect. Protect.'
  const heroSubtitle =
    content.home_hero_subtitle || 'Young people gathering to preserve and protect their local environment.'
  const founderQuote =
    content.founder_quote ||
    'Imagine if we had a collective in every major town. Think of the amount of waste we could be cleaning. Large scale social and environmental impact. It is possible.'
  const founderName = content.founder_name || 'Kurt Jones, Founder & CEO'

  const tiles = [
    { value: fmt(stats.rubbishKg) + ' kgs', label: 'Litter removed' },
    { value: fmt(stats.plants), label: 'Native plants planted' },
    { value: fmt(stats.collectives), label: 'Collectives across Australia' },
    { value: fmt(stats.volunteers), label: 'Young volunteers' },
  ]

  return (
    <main>
      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        <Image
          src="/images/hero.webp"
          alt="Young people in nature on a Co-Exist conservation day"
          fill
          priority
          className="-z-10 object-cover"
        />
        <div className="-z-10 absolute inset-0 bg-gradient-to-t from-black/70 via-black/35 to-black/30" />
        <div className="mx-auto max-w-6xl px-5 py-28 sm:py-40">
          <p className="text-[12px] font-bold uppercase tracking-[0.25em] text-white/80">
            Co-Exist Australia
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-tight text-white sm:text-6xl">
            {heroTitle}
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/90">{heroSubtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/collectives"
              className="rounded-full bg-primary-500 px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-600"
            >
              Join a collective
            </Link>
            <Link
              href="/events"
              className="rounded-full bg-white/95 px-6 py-3 text-sm font-bold text-neutral-900 shadow-sm transition-colors hover:bg-white"
            >
              Attend an event
            </Link>
          </div>
        </div>
      </section>

      {/* Impact band (live) */}
      <section className="border-b border-neutral-100 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-400">
            Our impact so far
          </h2>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {tiles.map((t) => (
              <div
                key={t.label}
                className="rounded-2xl border border-neutral-100 bg-white p-6 text-center shadow-sm"
              >
                <div className="text-3xl font-extrabold tabular-nums text-neutral-900 sm:text-4xl">
                  {t.value}
                </div>
                <div className="mt-2 text-xs uppercase tracking-wider text-neutral-500">
                  {t.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-20 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-extrabold text-neutral-900 sm:text-4xl">
              A nationwide movement of young people driving positive change
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-neutral-600">
              Co-Exist builds collectives that enable young Australians to lead
              conservation projects in their own communities. We make it easy to
              find your people, get outside, and do something real for the places
              you love.
            </p>
            <Link
              href="/about"
              className="mt-6 inline-block text-sm font-bold text-primary-700 hover:text-primary-800"
            >
              Read our story →
            </Link>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-neutral-100 shadow-sm">
            <Image src="/images/nature.webp" alt="A Co-Exist conservation activity" fill className="object-cover" />
          </div>
        </div>
      </section>

      {/* What's a collective */}
      <section className="bg-surface-1">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-20 md:grid-cols-2">
          <div className="relative order-2 aspect-[4/3] overflow-hidden rounded-3xl border border-neutral-100 shadow-sm md:order-1">
            <Image src="/images/collective.webp" alt="A local Co-Exist collective" fill className="object-cover" />
          </div>
          <div className="order-1 md:order-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary-600">
              What is a collective?
            </p>
            <h2 className="mt-3 text-3xl font-extrabold text-neutral-900 sm:text-4xl">
              Youth-led groups, doing good in their own backyard
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-neutral-600">
              Collectives host urban landcare, beach cleanups, nature walks and
              conservation retreats. The idea is simple: do good, feel good.
              Connecting people to themselves, to each other, and to nature.
            </p>
            <Link
              href="/collectives"
              className="mt-6 inline-block text-sm font-bold text-primary-700 hover:text-primary-800"
            >
              Find a collective near you →
            </Link>
          </div>
        </div>
      </section>

      {/* Founder quote */}
      <section className="bg-primary-700">
        <div className="mx-auto max-w-4xl px-5 py-20 text-center">
          <blockquote className="text-2xl font-semibold leading-relaxed text-white sm:text-3xl">
            “{founderQuote}”
          </blockquote>
          <p className="mt-6 text-sm font-bold uppercase tracking-wider text-white/70">{founderName}</p>
        </div>
      </section>

      {/* Partners */}
      {partners.length > 0 && (
        <section className="border-y border-neutral-100 bg-white">
          <div className="mx-auto max-w-6xl px-5 py-12">
            <h2 className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-400">
              With the support of
            </h2>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
              {partners.map((p) =>
                p.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p.id} src={p.logo_url} alt={p.name} className="h-10 w-auto object-contain opacity-80" />
                ) : (
                  <span key={p.id} className="text-sm font-semibold text-neutral-500">
                    {p.name}
                  </span>
                ),
              )}
            </div>
          </div>
        </section>
      )}

      {/* Donate CTA */}
      <section className="bg-white">
        <div className="mx-auto max-w-4xl px-5 py-20 text-center">
          <h2 className="text-3xl font-extrabold text-neutral-900 sm:text-4xl">
            Help us build communities that protect nature
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-neutral-600">
            Every contribution helps young people get outside and lead real
            conservation work in their community.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/donate"
              className="rounded-full bg-primary-500 px-7 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-600"
            >
              Donate
            </Link>
            <Link
              href="/get-involved/support"
              className="rounded-full border border-neutral-200 px-7 py-3 text-sm font-bold text-neutral-800 transition-colors hover:bg-neutral-50"
            >
              Other ways to help
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
