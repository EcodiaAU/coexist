import Image from 'next/image'
import Link from 'next/link'
import { getPublicImpactStats, type PublicImpactStats } from '@/lib/public-stats'
import { getSiteContent, getPartners } from '@/lib/queries'
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
    content.home_hero_subtitle ||
    'Young people gathering to preserve and protect their local environment.'

  const tiles = [
    { value: fmt(stats.rubbishKg), unit: 'kg', label: 'Litter removed' },
    { value: fmt(stats.plants), unit: '', label: 'Natives planted' },
    { value: fmt(stats.collectives), unit: '', label: 'Collectives across Australia' },
    { value: fmt(stats.volunteers), unit: '', label: 'Young volunteers' },
    { value: fmt(stats.events), unit: '', label: 'Meetups' },
  ]

  // Partner band: drop Bloomberg + GreenCollar; all funders in one row at full
  // opacity, with VFFF ordered into the middle.
  const visiblePartners = partners.filter((p) => !/bloomberg|greencollar/i.test(p.name))
  const vfff = visiblePartners.find((p) => /vincent fairfax|vfff/i.test(p.name))
  const restPartners = visiblePartners.filter((p) => p !== vfff)
  const partnerMid = Math.floor(restPartners.length / 2)
  const orderedPartners = vfff
    ? [...restPartners.slice(0, partnerMid), vfff, ...restPartners.slice(partnerMid)]
    : visiblePartners

  return (
    <main>
      {/* Hero - parallax retained, content mirrors coexistaus.org (clean: title + subtitle + CTAs) */}
      <section className="relative isolate flex min-h-[90vh] flex-col items-center justify-center overflow-hidden">
        <ParallaxImage src="/images/hero.webp" priority blurDataURL={BLUR['/images/hero.webp']} />
        <div className="grain-layer absolute inset-0 z-0" />
        <div className="absolute inset-0 z-0 bg-black/25" />

        <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center px-6 py-32 text-center">
          <p className="eyebrow text-oncream/70">Co-Exist Australia</p>
          <h1 className="display-tight mx-auto mt-6 max-w-4xl text-[3.6rem] leading-[0.92] text-oncream sm:text-[7.5rem]">{heroTitle}</h1>
          <p className="mx-auto mt-7 max-w-md text-base text-oncream/85">{heroSubtitle}</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/collectives" className="rounded-full bg-oncream px-7 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-olive-900 transition-all duration-300 hover:px-9">
              Join a collective
            </Link>
            <Link href="/events" className="rounded-full border border-oncream/40 px-7 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-oncream transition-all duration-300 hover:border-oncream hover:bg-oncream/10">
              Attend an event
            </Link>
          </div>
        </div>
      </section>

      {/* About Co-Exist - copy mirrors coexistaus.org; Australia map on the LEFT for laptops */}
      <section className="grid items-center bg-white md:grid-cols-2">
        <Reveal className="order-1 flex items-center justify-center px-6 py-14 md:order-1 md:py-24">
          <Image src="/images/map.webp" alt="Map of Co-Exist collectives across Australia" width={520} height={620} className="h-auto w-full max-w-md object-contain" />
        </Reveal>
        <div className="order-2 flex items-center px-6 py-16 md:order-2 md:px-16 md:py-24">
          <Reveal className="max-w-xl">
            <p className="eyebrow text-primary-600">The movement</p>
            <h2 className="mt-5 text-4xl text-neutral-900 sm:text-5xl">About Co-Exist</h2>
            <p className="mt-6 text-[15px] leading-relaxed text-neutral-600">
              Co-Exist is a nationwide movement of young people driving positive change. We come
              together to connect with each other, explore our wild places, and most importantly
              protect and preserve our natural environment. Co-Exist empowers young Australians to
              build friendships, learn new skills, and lead local conservation projects together.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-neutral-600">
              Our founder, Kurt Jones, realised the importance of connecting with nature for mental
              health through his experiences in community conservation. He was inspired to create
              outdoor volunteering and conservation opportunities for other young people.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-neutral-600">
              By building collectives across Australia, we are empowering the next generation of
              nature lovers to get involved in community conservation at a grassroots level. Are you
              up for the challenge?
            </p>
            <Link href="/about" className="mt-7 inline-block rounded-full bg-black px-7 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-white transition-all duration-300 hover:px-9">
              Tell me more
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Imagine what we could achieve together - impact stats (dedicated section, mirrors original) */}
      <section className="bg-olive-800 text-oncream">
        <div className="mx-auto max-w-6xl px-6 py-24 text-center">
          <Reveal>
            <h2 className="display-tight mx-auto max-w-3xl text-[2.5rem] leading-[1.02] text-oncream sm:text-6xl">
              Imagine what we could achieve together
            </h2>
            <p className="mx-auto mt-7 max-w-2xl text-[15px] leading-relaxed text-oncream/80">
              Our collectives create long-term impact through leadership, connection and action.
              Whether it is a beach cleanup or a tree-planting event, our community loves getting
              hands-on with likeminded people and seeing the hard work pay off.
            </p>
            <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.22em] text-oncream/55">
              Here is what we have achieved so far
            </p>
          </Reveal>
          <div className="mt-12 grid grid-cols-2 gap-y-10 sm:grid-cols-5">
            {tiles.map((t, i) => (
              <Reveal key={t.label} delay={i * 80} className={`text-center ${i > 0 ? 'sm:border-l sm:border-oncream/15' : ''}`}>
                <div className="text-[3.25rem] font-semibold leading-none tracking-[-0.06em] text-oncream tabular-nums">
                  {t.value}
                  {t.unit && <span className="text-2xl">{t.unit}</span>}
                </div>
                <div className="mx-auto mt-2 max-w-[12ch] text-[11px] font-semibold uppercase tracking-[0.18em] text-oncream/70">{t.label}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* What's a Collective? - mirrors original copy + activity list */}
      <section className="grid items-stretch bg-white md:grid-cols-2">
        <Reveal className="relative order-1 min-h-[56vh] overflow-hidden">
          <Image src="/images/gather.webp" alt="A local Co-Exist collective gathering" fill sizes="(max-width:768px) 100vw, 50vw" placeholder="blur" blurDataURL={BLUR['/images/gather.webp']} className="object-cover transition-transform duration-[1.2s] hover:scale-105" />
          <div className="absolute inset-0 bg-olive-900/15 mix-blend-multiply" />
          <div className="grain-layer absolute inset-0" />
        </Reveal>
        <div className="order-2 flex items-center px-6 py-24 md:px-16">
          <Reveal className="max-w-md">
            <p className="eyebrow text-primary-600">Get involved</p>
            <h2 className="mt-5 text-4xl text-neutral-900 sm:text-5xl">Join a collective</h2>
            <p className="mt-6 text-[15px] leading-relaxed text-neutral-600">
              Find your people and get hands-on for the places you love. Collectives are made up of,
              and led by, young people who share a love for the natural world. Across Australia, they
              host:
            </p>
            <ul className="mt-5 space-y-2.5">
              {['Urban landcare and plantings', 'Beach and river cleanups', 'Nature walks and wildlife spotting', 'Conservation campouts and retreats'].map((item) => (
                <li key={item} className="flex items-start gap-3 text-[15px] text-neutral-700">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-olive-700" />
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/collectives" className="mt-8 inline-block rounded-full bg-black px-7 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-white transition-all duration-300 hover:px-9">
              Find your people
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Make an immediate impact - donate */}
      <section className="relative overflow-hidden bg-olive-700 text-oncream">
        <span className="watermark right-[-3%] bottom-[-8%] text-[22vw] text-oncream">Protect</span>
        <div className="relative mx-auto max-w-4xl px-6 py-20 text-center">
          <Reveal>
            <h2 className="display-tight text-[2.75rem] text-oncream sm:text-6xl">Make an immediate impact</h2>
            <p className="mx-auto mt-7 max-w-xl text-[15px] leading-relaxed text-oncream/80">
              If you cannot join a collective or attend an event right now, you can still help by
              donating to Co-Exist. Funds go towards building communities, supporting mental
              wellbeing and organising conservation events for young people.
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

      {/* Supported by - all funders in one full-opacity row, VFFF in the middle */}
      {orderedPartners.length > 0 && (
        <section className="bg-white">
          <div className="mx-auto max-w-6xl px-6 py-16 text-center">
            <p className="eyebrow text-neutral-400">Supported by</p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-x-12 gap-y-7">
              {orderedPartners.map((p) => {
                const isVfff = vfff && p === vfff
                return p.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p.id} src={p.logo_url} alt={p.name} className={`w-auto object-contain opacity-100 ${isVfff ? 'h-16 sm:h-20' : 'h-11'}`} />
                ) : (
                  <span key={p.id} className="text-[13px] font-semibold uppercase tracking-wider text-neutral-500">{p.name}</span>
                )
              })}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
