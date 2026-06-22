import Image from 'next/image'
import Link from 'next/link'
import { getPublicImpactStats, type PublicImpactStats } from '@/lib/public-stats'
import { getSiteContent, getPartners } from '@/lib/queries'

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
    { value: fmt(stats.rubbishKg), unit: 'kgs', label: 'Litter removed' },
    { value: fmt(stats.plants), unit: '', label: 'Native plants planted' },
    { value: fmt(stats.collectives), unit: '', label: 'Collectives Australia-wide' },
    { value: fmt(stats.volunteers), unit: '', label: 'Young volunteers' },
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
        <div className="-z-10 absolute inset-0 bg-gradient-to-t from-olive-950/85 via-olive-900/55 to-olive-900/40" />
        <div className="mx-auto max-w-6xl px-6 py-32 sm:py-44">
          <p className="eyebrow text-oncream/80">Co-Exist Australia</p>
          <h1 className="mt-5 max-w-4xl text-[2.9rem] leading-[1.02] text-oncream sm:text-7xl">
            {heroTitle}
          </h1>
          <p className="mt-6 max-w-xl text-lg text-oncream/90">{heroSubtitle}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/collectives"
              className="rounded-full bg-oncream px-7 py-3 text-sm font-bold text-olive-900 transition-colors hover:bg-white"
            >
              Join a collective
            </Link>
            <Link
              href="/events"
              className="rounded-full border border-oncream/50 px-7 py-3 text-sm font-bold text-oncream transition-colors hover:bg-oncream/10"
            >
              Attend an event
            </Link>
          </div>
        </div>
      </section>

      {/* Impact band - one dark olive band (mirrors the live-site stats band) */}
      <section className="bg-olive-800 text-oncream">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <p className="eyebrow text-center text-sage">Our impact so far</p>
          <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label} className="text-center">
                <div className="font-serif text-5xl font-medium tracking-tight text-oncream tabular-nums sm:text-6xl">
                  {t.value}
                  {t.unit && <span className="ml-1 text-2xl">{t.unit}</span>}
                </div>
                <div className="mt-3 text-xs uppercase tracking-[0.15em] text-oncream/60">{t.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About - cream */}
      <section className="bg-paper">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 md:grid-cols-2">
          <div>
            <p className="eyebrow text-primary-600">The movement</p>
            <h2 className="mt-3 text-4xl text-neutral-900 sm:text-5xl">
              A nationwide movement of young people driving <span className="mark">change</span>
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-neutral-600">
              Co-Exist builds collectives that enable young Australians to lead conservation
              projects in their own communities. We make it easy to find your people, get
              outside, and do something real for the places you love.
            </p>
            <Link href="/about" className="mt-7 inline-block font-serif text-lg italic text-primary-700 hover:text-primary-800">
              Read our story →
            </Link>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] shadow-sm">
            <Image src="/images/nature.webp" alt="A Co-Exist conservation activity" fill className="object-cover" />
          </div>
        </div>
      </section>

      {/* What's a collective - white with photo (matches the live-site layout) */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 md:grid-cols-2">
          <div className="relative order-2 aspect-[4/3] overflow-hidden rounded-[2rem] shadow-sm md:order-1">
            <Image src="/images/collective.webp" alt="A local Co-Exist collective" fill className="object-cover" />
          </div>
          <div className="order-1 md:order-2">
            <p className="eyebrow text-primary-600">What is a collective?</p>
            <h2 className="mt-3 text-4xl text-neutral-900 sm:text-5xl">
              Youth-led groups, doing <span className="mark">good</span> in their own backyard
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-neutral-600">
              Collectives host urban landcare, beach cleanups, nature walks and conservation
              retreats. The idea is simple: do good, feel good. Connecting people to themselves,
              to each other, and to nature.
            </p>
            <Link href="/collectives" className="mt-7 inline-block font-serif text-lg italic text-primary-700 hover:text-primary-800">
              Find a collective near you →
            </Link>
          </div>
        </div>
      </section>

      {/* Founder quote - cream, large serif */}
      <section className="bg-cream">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <blockquote className="font-serif text-3xl font-medium leading-[1.25] text-olive-800 sm:text-[2.6rem]">
            “{founderQuote}”
          </blockquote>
          <p className="eyebrow mt-8 text-primary-600">{founderName}</p>
        </div>
      </section>

      {/* Partners */}
      {partners.length > 0 && (
        <section className="border-y border-neutral-200 bg-paper">
          <div className="mx-auto max-w-6xl px-6 py-14">
            <p className="eyebrow text-center text-neutral-400">With the support of</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-5">
              {partners.map((p) =>
                p.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p.id} src={p.logo_url} alt={p.name} className="h-10 w-auto object-contain opacity-70" />
                ) : (
                  <span key={p.id} className="font-serif text-lg italic text-neutral-500">
                    {p.name}
                  </span>
                ),
              )}
            </div>
          </div>
        </section>
      )}

      {/* Donate CTA - deep olive */}
      <section className="bg-olive-800 text-oncream">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <h2 className="text-4xl text-oncream sm:text-6xl">Help us build communities that <span className="mark">protect nature</span></h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-oncream/85">
            Every contribution helps young people get outside and lead real conservation work in
            their community.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link
              href="/donate"
              className="rounded-full bg-oncream px-8 py-3.5 text-sm font-bold text-olive-900 transition-colors hover:bg-white"
            >
              Donate
            </Link>
            <Link
              href="/get-involved/support"
              className="rounded-full border border-oncream/50 px-8 py-3.5 text-sm font-bold text-oncream transition-colors hover:bg-oncream/10"
            >
              Other ways to help
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
