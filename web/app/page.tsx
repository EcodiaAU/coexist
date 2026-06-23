import Image from 'next/image'
import Link from 'next/link'
import { getPublicImpactStats, type PublicImpactStats } from '@/lib/public-stats'
import { getSiteContent, getPartners } from '@/lib/queries'
import { WordSwap } from '@/components/word-swap'
import { Reveal } from '@/components/reveal'
import { ParallaxImage } from '@/components/parallax-image'
import { BLUR } from '@/lib/blur'

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
    { value: fmt(stats.plants), unit: '', label: 'Trees planted' },
    { value: fmt(stats.collectives), unit: '', label: 'Collectives' },
    { value: fmt(stats.volunteers), unit: '', label: 'Young volunteers' },
  ]

  return (
    <main>
      {/* Hero with stats overlaid at the foot of the image */}
      <section className="relative isolate flex min-h-[90vh] flex-col overflow-hidden">
        <ParallaxImage src="/images/hero.webp" priority blurDataURL={BLUR['/images/hero.webp']} />
        {/* home hero carries title + stats at the foot, so it darkens toward the bottom */}
        <div className="-z-10 absolute inset-0 bg-black/20" />
        <div className="-z-10 absolute inset-0 bg-gradient-to-t from-olive-950/95 via-olive-950/40 to-transparent" />

        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 pt-28 pb-10">
          <p className="eyebrow text-oncream/70">Co-Exist Australia</p>
          <h1 className="display-tight mt-6 max-w-4xl text-[3.6rem] leading-[0.92] text-oncream sm:text-[7.5rem]">{heroTitle}</h1>
          <p className="mt-7 max-w-md text-base text-oncream/85">{heroSubtitle}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/collectives" className="rounded-full bg-oncream px-7 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-olive-900 transition-all duration-300 hover:px-9">
              Join a collective
            </Link>
            <Link href="/events" className="rounded-full border border-oncream/40 px-7 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-oncream transition-all duration-300 hover:border-oncream hover:bg-oncream/10">
              Attend an event
            </Link>
          </div>
        </div>

        <div className="mx-auto w-full max-w-6xl border-t border-oncream/15 px-6 pt-9 pb-28 lg:pb-36">
          <div className="grid grid-cols-2 gap-y-7 sm:grid-cols-4">
            {tiles.map((t, i) => (
              <div key={t.label} className={i > 0 ? 'border-l border-oncream/12 pl-6 sm:pl-8' : ''}>
                <div className="text-[3.25rem] font-light leading-none tracking-[-0.06em] text-oncream tabular-nums">
                  {t.value}
                  {t.unit && <span className="text-2xl">{t.unit}</span>}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-oncream/55">{t.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About - full-bleed image half (people in nature, not a face) */}
      <section className="grid items-stretch bg-white md:grid-cols-2">
        <Reveal className="relative order-1 min-h-[72vh] overflow-hidden md:order-2">
          <Image src="/images/nature.webp" alt="Young people on a Co-Exist conservation day" fill sizes="(max-width:768px) 100vw, 50vw" placeholder="blur" blurDataURL={BLUR['/images/nature.webp']} className="object-cover transition-transform duration-[1.2s] hover:scale-105" />
          <div className="absolute inset-0 bg-olive-900/15 mix-blend-multiply" />
          <div className="grain-layer absolute inset-0" />
        </Reveal>
        <div className="order-2 flex items-center px-6 py-32 md:order-1 md:px-16">
          <Reveal className="max-w-md">
            <p className="eyebrow text-primary-600">The movement</p>
            <h2 className="has-mark mt-5 text-4xl text-neutral-900 sm:text-5xl">
              Young Australians taking the lead on
              <span className="mt-2 block"><WordSwap words={['conservation', 'climate action', 'their communities']} /></span>
            </h2>
            <p className="mt-6 text-[15px] leading-relaxed text-neutral-500">
              Founder Kurt Jones started Co-Exist in 2022 after the outdoors gave him direction as a
              kid. The idea was simple: give young people a real job to do in nature, and a community
              to do it with.
            </p>
            <Link href="/about" className="mt-7 inline-block text-xs font-semibold uppercase tracking-[0.18em] text-primary-700 transition-colors hover:text-primary-900">
              Read our story →
            </Link>
          </Reveal>
        </div>
      </section>

      {/* What's a collective - full-bleed image half */}
      <section className="grid items-stretch bg-white md:grid-cols-2">
        <Reveal className="relative order-1 min-h-[56vh] overflow-hidden">
          <Image src="/images/gather.webp" alt="A local Co-Exist collective gathering" fill sizes="(max-width:768px) 100vw, 50vw" placeholder="blur" blurDataURL={BLUR['/images/gather.webp']} className="object-cover transition-transform duration-[1.2s] hover:scale-105" />
          <div className="absolute inset-0 bg-olive-900/15 mix-blend-multiply" />
          <div className="grain-layer absolute inset-0" />
        </Reveal>
        <div className="order-2 flex items-center px-6 py-24 md:px-16">
          <Reveal className="max-w-md">
            <p className="eyebrow text-primary-600">What is a collective?</p>
            <h2 className="has-mark mt-5 text-4xl text-neutral-900 sm:text-5xl">
              Youth-led groups running
              <span className="mt-2 block"><WordSwap words={['beach cleanups', 'tree plantings', 'nature walks']} /></span>
            </h2>
            <p className="mt-6 text-[15px] leading-relaxed text-neutral-500">
              Urban landcare, beach cleanups, nature walks, conservation retreats. The idea is simple:
              do good, feel good. Connecting people to themselves, each other, and nature.
            </p>
            <Link href="/collectives" className="mt-7 inline-block text-xs font-semibold uppercase tracking-[0.18em] text-primary-700 transition-colors hover:text-primary-900">
              Find a collective near you →
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Founder quote - Kurt's photo beside the quote */}
      <section className="bg-olive-800 text-oncream">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 md:grid-cols-[auto_1fr]">
          <Reveal className="relative mx-auto w-44 shrink-0 overflow-hidden rounded-none sm:w-56">
            <div className="relative aspect-[4/5]">
              <Image src="/images/kurt.webp" alt="Kurt Jones, founder of Co-Exist" fill placeholder="blur" blurDataURL={BLUR['/images/kurt.webp']} className="object-cover" />
              <div className="absolute inset-0 bg-olive-900/15 mix-blend-multiply" />
              <div className="grain-layer absolute inset-0" />
            </div>
          </Reveal>
          <Reveal delay={120}>
            <blockquote className="text-[1.6rem] font-light leading-[1.25] text-oncream sm:text-[2.75rem]">&ldquo;{founderQuote}&rdquo;</blockquote>
            <p className="label mt-7 text-sage">{founderName}</p>
          </Reveal>
        </div>
      </section>

      {/* Partners */}
      {partners.length > 0 && (
        <section className="bg-cream">
          <div className="mx-auto max-w-6xl px-6 py-10">
            <p className="eyebrow text-center text-neutral-400">With the support of</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
              {partners.map((p) =>
                p.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p.id} src={p.logo_url} alt={p.name} className="h-8 w-auto object-contain grayscale opacity-40 transition-all duration-300 hover:grayscale-0 hover:opacity-100" />
                ) : (
                  <span key={p.id} className="text-[13px] font-semibold uppercase tracking-wider text-neutral-400">{p.name}</span>
                ),
              )}
            </div>
          </div>
        </section>
      )}

      {/* Donate CTA - watermark */}
      <section className="relative overflow-hidden bg-olive-700 text-oncream">
        <span className="watermark right-[-3%] bottom-[-8%] text-[22vw] text-oncream">Protect</span>
        <div className="relative mx-auto max-w-4xl px-6 py-20 text-center">
          <Reveal>
            <h2 className="display-tight has-mark text-[2.75rem] text-oncream sm:text-6xl">
              Help build communities that
              <span className="mt-2 block"><WordSwap words={['protect nature', 'restore habitat', 'last']} /></span>
            </h2>
            <p className="mx-auto mt-7 max-w-md text-[15px] text-oncream/80">
              Every contribution helps young people get outside and lead real conservation in their community.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href="/donate" className="rounded-full bg-oncream px-8 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-olive-900 transition-all duration-300 hover:px-10">
                Donate
              </Link>
              <Link href="/get-involved/support" className="rounded-full border border-oncream/40 px-8 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-oncream transition-all duration-300 hover:border-oncream hover:bg-oncream/10">
                Other ways to help
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  )
}
