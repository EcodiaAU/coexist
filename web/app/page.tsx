import Image from 'next/image'
import Link from 'next/link'
import { getPublicImpactStats, type PublicImpactStats } from '@/lib/public-stats'
import { getSiteContent, getPartners } from '@/lib/queries'
import { WordSwap } from '@/components/word-swap'
import { Reveal } from '@/components/reveal'

export const revalidate = 1800

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
    { value: fmt(stats.rubbishKg), unit: 'kg', label: 'Litter removed' },
    { value: fmt(stats.plants), unit: '', label: 'Native plants' },
    { value: fmt(stats.collectives), unit: '', label: 'Collectives' },
    { value: fmt(stats.volunteers), unit: '', label: 'Young volunteers' },
  ]

  return (
    <main>
      {/* Hero with stats overlaid at the foot of the image */}
      <section className="relative isolate flex min-h-[88vh] flex-col">
        <Image
          src="/images/hero.webp"
          alt="Young people in nature on a Co-Exist conservation day"
          fill
          priority
          className="-z-10 object-cover"
        />
        <div className="-z-10 absolute inset-0 bg-gradient-to-t from-olive-950/90 via-olive-950/45 to-olive-900/30" />

        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 pt-28 pb-10">
          <p className="eyebrow text-oncream/80">Co-Exist Australia</p>
          <h1 className="mt-5 max-w-4xl text-[3.4rem] leading-[0.98] text-oncream sm:text-8xl">{heroTitle}</h1>
          <p className="mt-6 max-w-xl text-lg text-oncream/90">{heroSubtitle}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/collectives"
              className="rounded-full bg-oncream px-7 py-3.5 text-sm font-bold text-olive-900 transition-all duration-300 hover:bg-white hover:px-8"
            >
              Join a collective
            </Link>
            <Link
              href="/events"
              className="rounded-full border border-oncream/50 px-7 py-3.5 text-sm font-bold text-oncream transition-all duration-300 hover:border-oncream hover:bg-oncream/10"
            >
              Attend an event
            </Link>
          </div>
        </div>

        {/* Stats strip overlaid on the hero foot */}
        <div className="mx-auto w-full max-w-6xl border-t border-oncream/20 px-6 py-7">
          <div className="grid grid-cols-2 gap-y-6 sm:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label}>
                <div className="text-3xl font-bold tracking-[-0.04em] text-oncream tabular-nums sm:text-4xl">
                  {t.value}
                  {t.unit && <span className="text-xl">{t.unit}</span>}
                </div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-oncream/60">{t.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-24 md:grid-cols-2">
          <Reveal>
            <p className="eyebrow text-primary-600">The movement</p>
            <h2 className="has-mark mt-4 text-4xl text-neutral-900 sm:text-5xl">
              A nationwide movement of young people driving{' '}
              <WordSwap words={['change', 'impact', 'momentum']} />
            </h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-neutral-600">
              Co-Exist builds collectives that enable young Australians to lead conservation
              projects in their own communities. Find your people, get outside, and do something
              real for the places you love.
            </p>
            <Link
              href="/about"
              className="mt-7 inline-block text-sm font-bold uppercase tracking-wider text-primary-700 transition-colors hover:text-primary-900"
            >
              Read our story →
            </Link>
          </Reveal>
          <Reveal delay={120} className="relative aspect-[4/5] overflow-hidden">
            <Image src="/images/nature.webp" alt="A Co-Exist conservation activity" fill className="object-cover transition-transform duration-700 hover:scale-105" />
          </Reveal>
        </div>
      </section>

      {/* What's a collective */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 pb-24 md:grid-cols-2">
          <Reveal className="relative order-2 aspect-[4/5] overflow-hidden md:order-1">
            <Image src="/images/collective.webp" alt="A local Co-Exist collective" fill className="object-cover transition-transform duration-700 hover:scale-105" />
          </Reveal>
          <Reveal delay={120} className="order-1 md:order-2">
            <p className="eyebrow text-primary-600">What is a collective?</p>
            <h2 className="has-mark mt-4 text-4xl text-neutral-900 sm:text-5xl">
              Youth-led groups, doing <WordSwap words={['good', 'real change', 'the work']} /> in their own backyard
            </h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-neutral-600">
              Collectives host urban landcare, beach cleanups, nature walks and conservation
              retreats. The idea is simple: do good, feel good. Connecting people to themselves,
              to each other, and to nature.
            </p>
            <Link
              href="/collectives"
              className="mt-7 inline-block text-sm font-bold uppercase tracking-wider text-primary-700 transition-colors hover:text-primary-900"
            >
              Find a collective near you →
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Founder quote */}
      <section className="bg-olive-800 text-oncream">
        <div className="mx-auto max-w-4xl px-6 py-28 text-center">
          <Reveal>
            <blockquote className="text-3xl leading-[1.18] text-oncream sm:text-[2.8rem]">
              “{founderQuote}”
            </blockquote>
            <p className="eyebrow mt-9 text-sage">{founderName}</p>
          </Reveal>
        </div>
      </section>

      {/* Partners */}
      {partners.length > 0 && (
        <section className="bg-white">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <p className="eyebrow text-center text-neutral-400">With the support of</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-14 gap-y-5">
              {partners.map((p) =>
                p.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p.id} src={p.logo_url} alt={p.name} className="h-10 w-auto object-contain opacity-60 transition-opacity hover:opacity-100" />
                ) : (
                  <span key={p.id} className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
                    {p.name}
                  </span>
                ),
              )}
            </div>
          </div>
        </section>
      )}

      {/* Donate CTA */}
      <section className="bg-olive-700 text-oncream">
        <div className="mx-auto max-w-4xl px-6 py-28 text-center">
          <Reveal>
            <h2 className="has-mark text-4xl text-oncream sm:text-6xl">
              Help us build communities that{' '}
              <WordSwap words={['protect nature', 'restore nature', 'defend wild places']} />
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-oncream/85">
              Every contribution helps young people get outside and lead real conservation work in
              their community.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link
                href="/donate"
                className="rounded-full bg-oncream px-8 py-3.5 text-sm font-bold text-olive-900 transition-all duration-300 hover:bg-white hover:px-9"
              >
                Donate
              </Link>
              <Link
                href="/get-involved/support"
                className="rounded-full border border-oncream/50 px-8 py-3.5 text-sm font-bold text-oncream transition-all duration-300 hover:border-oncream hover:bg-oncream/10"
              >
                Other ways to help
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  )
}
