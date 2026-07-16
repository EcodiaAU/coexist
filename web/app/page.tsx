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
    <main data-eos-id="web/app/page.tsx#0">
      {/* Hero - parallax retained, content mirrors coexistaus.org (clean: title + subtitle + CTAs) */}
      <section data-eos-id="web/app/page.tsx#1" className="relative isolate flex min-h-[90vh] flex-col items-center justify-center overflow-hidden">
        <ParallaxImage data-eos-id="web/app/page.tsx#2" src="/images/hero.webp" priority blurDataURL={BLUR['/images/hero.webp']} />
        <div data-eos-id="web/app/page.tsx#3" className="grain-layer absolute inset-0 z-0" />
        <div data-eos-id="web/app/page.tsx#4" className="absolute inset-0 z-0 bg-black/25" />

        <div data-eos-id="web/app/page.tsx#5" className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center px-6 py-32 text-center">
          <p data-eos-id="web/app/page.tsx#6" className="eyebrow text-oncream/70">Co-Exist Australia</p>
          <h1 data-eos-id="web/app/page.tsx#7" className="display-tight mx-auto mt-6 max-w-4xl text-[3.6rem] leading-[0.92] text-oncream sm:text-[7.5rem]">{heroTitle}</h1>
          <p data-eos-id="web/app/page.tsx#8" className="mx-auto mt-7 max-w-md text-base text-oncream/85">{heroSubtitle}</p>
          <div data-eos-id="web/app/page.tsx#9" className="mt-9 flex flex-wrap justify-center gap-3">
            <Link data-eos-href="static" data-eos-id="web/app/page.tsx#10" href="/collectives" className="rounded-full bg-oncream px-7 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-olive-900 transition-all duration-300 hover:px-9">
              Join a collective
            </Link>
            <Link data-eos-href="static" data-eos-id="web/app/page.tsx#11" href="/events" className="rounded-full border border-oncream/40 px-7 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-oncream transition-all duration-300 hover:border-oncream hover:bg-oncream/10">
              Attend an event
            </Link>
          </div>
        </div>
      </section>

      {/* About Co-Exist - copy mirrors coexistaus.org; Australia map on the LEFT for laptops */}
      <section data-eos-id="web/app/page.tsx#12" className="grid items-center md:grid-cols-2 bg-[#ffffff]">
        <Reveal data-eos-id="web/app/page.tsx#13" className="order-1 flex items-center justify-center px-6 py-14 md:order-1 md:py-24">
          <Image data-eos-id="web/app/page.tsx#14" src="/images/map.webp" alt="Map of Co-Exist collectives across Australia" width={520} height={620} className="h-auto max-w-md object-contain border-[#16170f] w-[448px]" />
        </Reveal>
        <div data-eos-id="web/app/page.tsx#15" className="order-2 flex items-center px-6 py-16 md:order-2 md:px-16 md:py-24">
          <Reveal data-eos-id="web/app/page.tsx#16" className="max-w-xl">
            <p data-eos-id="web/app/page.tsx#17" className="eyebrow text-primary-600">The movement</p>
            <h2 data-eos-id="web/app/page.tsx#18" className="mt-5 text-4xl text-neutral-900 sm:text-5xl">About Co-Exist</h2>
            <p data-eos-id="web/app/page.tsx#19" className="mt-6 text-[15px] leading-relaxed text-neutral-600">
              Co-Exist is a nationwide movement of young people driving positive change. We come
              together to connect with each other, explore our wild places, and most importantly
              protect and preserve our natural environment. Co-Exist empowers young Australians to
              build friendships, learn new skills, and lead local conservation projects together.
            </p>
            <p data-eos-id="web/app/page.tsx#20" className="mt-4 text-[15px] leading-relaxed text-neutral-600">
              Our founder, Kurt Jones, realised the importance of connecting with nature for mental
              health through his experiences in community conservation. He was inspired to create
              outdoor volunteering and conservation opportunities for other young people.
            </p>
            <p data-eos-id="web/app/page.tsx#21" className="mt-4 text-[15px] leading-relaxed text-neutral-600">
              By building collectives across Australia, we are empowering the next generation of
              nature lovers to get involved in community conservation at a grassroots level. Are you
              up for the challenge?
            </p>
            <Link data-eos-href="static" data-eos-id="web/app/page.tsx#22" href="/about" className="mt-7 inline-block rounded-full bg-black px-7 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-white transition-all duration-300 hover:px-9">
              Tell me more
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Imagine what we could achieve together - impact stats (dedicated section, mirrors original) */}
      <section data-eos-id="web/app/page.tsx#23" className="bg-olive-800 text-oncream">
        <div data-eos-id="web/app/page.tsx#24" className="mx-auto max-w-6xl px-6 py-24 text-center">
          <Reveal data-eos-id="web/app/page.tsx#25">
            <h2 data-eos-id="web/app/page.tsx#26" className="display-tight mx-auto max-w-3xl text-[2.5rem] leading-[1.02] text-oncream sm:text-6xl">
              Imagine what we could achieve together
            </h2>
            <p data-eos-id="web/app/page.tsx#27" className="mx-auto mt-7 max-w-2xl text-[15px] leading-relaxed text-oncream/80">
              Our collectives create long-term impact through leadership, connection and action.
              Whether it is a beach cleanup or a tree-planting event, our community loves getting
              hands-on with likeminded people and seeing the hard work pay off.
            </p>
            <p data-eos-id="web/app/page.tsx#28" className="mt-6 text-[11px] font-semibold uppercase tracking-[0.22em] text-oncream/55">
              Here is what we have achieved so far
            </p>
          </Reveal>
          <div data-eos-id="web/app/page.tsx#29" className="mt-12 grid grid-cols-2 gap-y-10 sm:grid-cols-5">
            {tiles.map((t, i) => (
              <Reveal data-eos-id="web/app/page.tsx#30" key={t.label} delay={i * 80} className={`text-center ${i > 0 ? 'sm:border-l sm:border-oncream/15' : ''}`}>
                <div data-eos-id="web/app/page.tsx#31" className="text-[3.25rem] font-semibold leading-none tracking-[-0.06em] text-oncream tabular-nums">
                  {t.value}
                  {t.unit && <span data-eos-id="web/app/page.tsx#32" data-eos-var="t.unit" data-eos-var-label="Unit" data-eos-var-scope="item" className="text-2xl">{t.unit}</span>}
                </div>
                <div data-eos-id="web/app/page.tsx#33" data-eos-var="t.label" data-eos-var-label="Label" data-eos-var-scope="item" className="mx-auto mt-2 max-w-[12ch] text-[11px] font-semibold uppercase tracking-[0.18em] text-oncream/70">{t.label}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* What's a Collective? - mirrors original copy + activity list */}
      <section data-eos-id="web/app/page.tsx#34" className="grid items-stretch bg-white md:grid-cols-2">
        <Reveal data-eos-id="web/app/page.tsx#35" className="relative order-1 min-h-[56vh] overflow-hidden">
          <Image data-eos-id="web/app/page.tsx#36" src="/images/gather.webp" alt="A local Co-Exist collective gathering" fill sizes="(max-width:768px) 100vw, 50vw" placeholder="blur" blurDataURL={BLUR['/images/gather.webp']} className="object-cover transition-transform duration-[1.2s] hover:scale-105" />
          <div data-eos-id="web/app/page.tsx#37" className="absolute inset-0 bg-olive-900/15 mix-blend-multiply" />
          <div data-eos-id="web/app/page.tsx#38" className="grain-layer absolute inset-0" />
        </Reveal>
        <div data-eos-id="web/app/page.tsx#39" className="order-2 flex items-center px-6 py-24 md:px-16">
          <Reveal data-eos-id="web/app/page.tsx#40" className="max-w-md">
            <p data-eos-id="web/app/page.tsx#41" className="eyebrow text-primary-600">Get involved</p>
            <h2 data-eos-id="web/app/page.tsx#42" className="mt-5 text-4xl text-neutral-900 sm:text-5xl">Join a collective</h2>
            <p data-eos-id="web/app/page.tsx#43" className="mt-6 text-[15px] leading-relaxed text-neutral-600">
              Find your people and get hands-on for the places you love. Collectives are made up of,
              and led by, young people who share a love for the natural world. Across Australia, they
              host:
            </p>
            <ul data-eos-id="web/app/page.tsx#44" className="mt-5 space-y-2.5">
              {['Urban landcare and plantings', 'Beach and river cleanups', 'Nature walks and wildlife spotting', 'Conservation campouts and retreats'].map((item) => (
                <li data-eos-id="web/app/page.tsx#45" key={item} className="flex items-start gap-3 text-[15px] text-neutral-700">
                  <span data-eos-id="web/app/page.tsx#46" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-olive-700" />
                  {item}
                </li>
              ))}
            </ul>
            <Link data-eos-href="static" data-eos-id="web/app/page.tsx#47" href="/collectives" className="mt-8 inline-block rounded-full bg-black px-7 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-white transition-all duration-300 hover:px-9">
              Find your people
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Make an immediate impact - donate */}
      <section data-eos-id="web/app/page.tsx#48" className="relative overflow-hidden bg-olive-700 text-oncream">
        <span data-eos-id="web/app/page.tsx#49" className="watermark right-[-3%] bottom-[-8%] text-[22vw] text-oncream">Protect</span>
        <div data-eos-id="web/app/page.tsx#50" className="relative mx-auto max-w-4xl px-6 py-20 text-center">
          <Reveal data-eos-id="web/app/page.tsx#51">
            <h2 data-eos-id="web/app/page.tsx#52" className="display-tight text-[2.75rem] text-oncream sm:text-6xl">Make an immediate impact</h2>
            <p data-eos-id="web/app/page.tsx#53" className="mx-auto mt-7 max-w-xl text-[15px] leading-relaxed text-oncream/80">
              If you cannot join a collective or attend an event right now, you can still help by
              donating to Co-Exist. Funds go towards building communities, supporting mental
              wellbeing and organising conservation events for young people.
            </p>
            <div data-eos-id="web/app/page.tsx#54" className="mt-9 flex flex-wrap justify-center gap-3">
              <Link data-eos-href="static" data-eos-id="web/app/page.tsx#55" href="/donate" className="rounded-full bg-oncream px-8 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-olive-900 transition-all duration-300 hover:px-10">
                Donate
              </Link>
              <Link data-eos-href="static" data-eos-id="web/app/page.tsx#56" href="/get-involved/support" className="rounded-full border border-oncream/40 px-8 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-oncream transition-all duration-300 hover:border-oncream hover:bg-oncream/10">
                Other ways to help
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Supported by - all funders in one full-opacity row, VFFF in the middle */}
      {orderedPartners.length > 0 && (
        <section data-eos-id="web/app/page.tsx#57" className="bg-white">
          <div data-eos-id="web/app/page.tsx#58" className="mx-auto max-w-6xl px-6 py-16 text-center">
            <p data-eos-id="web/app/page.tsx#59" className="eyebrow text-neutral-400">Supported by</p>
            <div data-eos-id="web/app/page.tsx#60" className="mt-9 flex flex-wrap items-center justify-center gap-x-12 gap-y-7">
              {orderedPartners.map((p) => {
                const isVfff = vfff && p === vfff
                return p.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img data-eos-id="web/app/page.tsx#61" key={p.id} src={p.logo_url} alt={p.name} className={`w-auto object-contain opacity-100 ${isVfff ? 'h-16 sm:h-20' : 'h-11'}`} />
                ) : (
                  <span data-eos-id="web/app/page.tsx#62" data-eos-var="p.name" data-eos-var-label="Name" data-eos-var-scope="item" key={p.id} className="text-[13px] font-semibold uppercase tracking-wider text-neutral-500">{p.name}</span>
                )
              })}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
