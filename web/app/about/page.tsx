import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { Reveal } from '@/components/reveal'
import { getSiteContent, getTeamMembers, getCollectiveLeaders } from '@/lib/queries'
import { teamPhoto } from '@/lib/team-photos'
import { BLUR } from '@/lib/blur'

function PersonCard({ name, sub, photo }: { name: string; sub?: string | null; photo?: string | null }) {
  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-none bg-olive-800">
        {photo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt={name} loading="lazy" className="h-full w-full object-cover" />
            {/* olive film tint */}
            <div className="absolute inset-0 bg-olive-900/15 mix-blend-multiply" />
            {/* grain overlay */}
            <div className="grain-layer absolute inset-0 pointer-events-none" />
          </>
        ) : (
          <div className="flex h-full items-center justify-center bg-olive-800">
            <span className="text-6xl font-light text-oncream/70">{name.charAt(0)}</span>
          </div>
        )}
      </div>
      <h3 className="mt-3 text-lg leading-tight text-neutral-900">{name}</h3>
      {sub && <p className="mt-0.5 text-[13px] text-neutral-500">{sub}</p>}
    </div>
  )
}

export const revalidate = 1800

export const metadata: Metadata = {
  title: 'About',
  description:
    'Co-Exist is a movement built by young people, for young people. Our mission: creating communities that preserve and protect wildlife and wild places.',
}

const GROUP_LABEL: Record<string, string> = { board: 'Board', core: 'Core team' }
const GROUP_ORDER = ['board', 'core']

export default async function AboutPage() {
  const [content, team, leaders] = await Promise.all([getSiteContent(), getTeamMembers(), getCollectiveLeaders()])
  const mission = content.mission || 'Creating communities that preserve and protect wildlife and wild places.'
  const vision = content.vision || 'Young people connected to nature and leading its protection and restoration.'
  const founderQuote =
    content.founder_quote ||
    'Imagine if we had a collective in every major town. Think of the amount of waste we could be cleaning. Large scale social and environmental impact. It is possible.'
  const founderName = content.founder_name || 'Kurt Jones, Founder & CEO'

  const groupedTeam = GROUP_ORDER.map((g) => [g, team.filter((m) => m.team_group === g)] as const).filter(
    ([, list]) => list.length > 0,
  )

  return (
    <main>
      <PageHeader
        eyebrow="About Co-Exist"
        title="A movement built by young people, for young people"
        subtitle="When young people connect with nature, they step up to protect it."
        image="/images/hero.webp"
      />

      {/* Story - full-bleed image half */}
      <section className="grid items-stretch bg-white md:grid-cols-2">
        <Reveal className="relative order-1 min-h-[52vh] overflow-hidden md:order-2">
          <Image src="/images/nature.webp" alt="Young people in nature with Co-Exist" fill sizes="(max-width:768px) 100vw, 50vw" placeholder="blur" blurDataURL={BLUR['/images/nature.webp']} className="object-cover transition-transform duration-[1.2s] hover:scale-105" />
          {/* olive film tint + grain on nature photo */}
          <div className="absolute inset-0 bg-olive-900/20 mix-blend-multiply pointer-events-none" />
          <div className="grain-layer absolute inset-0 pointer-events-none" />
        </Reveal>
        <div className="order-2 flex items-center px-6 py-24 md:order-1 md:px-16">
          <Reveal className="max-w-md">
            <p className="eyebrow text-primary-600">Our story</p>
            <h2 className="display-tight mt-5 text-5xl text-neutral-900 sm:text-6xl">It started with one reason to get outside</h2>
            <div className="mt-4 h-px w-12 bg-olive-800" />
            <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-neutral-500">
              <p>
                Co-Exist was founded on a simple but powerful idea: when young people connect with
                nature, they step up to protect it.
              </p>
              <p>
                Founder Kurt Jones knows this firsthand. Growing up in a low-income area, he struggled
                to find direction, often feeling disconnected from his community and the natural world.
                It was an outdoor program that changed his life. Surrounded by the raw beauty of nature,
                Kurt found a sense of purpose, resilience, and a passion for conservation.
              </p>
              <p>
                He threw himself into wildlife restoration and environmental education, but noticed a
                gap: there weren&apos;t enough spaces for young people to lead in conservation and feel
                like they truly belonged. He set out to change that.
              </p>
              <p>
                In 2022, Kurt formally launched Co-Exist with a bold vision: a nationwide movement where
                young Australians reconnect with nature, take real climate action, and build stronger
                communities through local collectives. Today it is a thriving community of young leaders
                running conservation in cities and towns across the country.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Mission / Vision - flat editorial statements */}
      <section className="relative overflow-hidden bg-olive-800 text-oncream">
        {/* watermark texture */}
        <div className="watermark pointer-events-none absolute inset-0 flex items-center justify-center select-none">
          CO-EXIST
        </div>
        {/* grain overlay */}
        <div className="grain-layer absolute inset-0 pointer-events-none" />
        <div className="relative mx-auto grid max-w-6xl gap-x-16 gap-y-12 px-6 py-24 md:grid-cols-2">
          <Reveal>
            <span className="text-7xl font-light text-oncream/20 leading-none select-none" aria-hidden="true">01</span>
            <p className="eyebrow text-sage">Our mission</p>
            <p className="mt-5 text-3xl leading-snug text-oncream sm:text-4xl">{mission}</p>
          </Reveal>
          <Reveal delay={120}>
            <span className="text-7xl font-light text-oncream/20 leading-none select-none" aria-hidden="true">02</span>
            <p className="eyebrow text-sage">Our vision</p>
            <p className="mt-5 text-3xl leading-snug text-oncream sm:text-4xl">{vision}</p>
          </Reveal>
        </div>
      </section>

      {/* Founder quote */}
      <section className="relative overflow-hidden bg-cream">
        <div className="relative mx-auto max-w-4xl px-6 py-28 text-center">
          <Reveal>
            <div className="mb-4 text-[6rem] leading-none text-sage select-none" aria-hidden="true">&ldquo;</div>
            <blockquote className="text-3xl leading-[1.2] text-neutral-900 sm:text-[2.6rem]">{founderQuote}</blockquote>
            <div className="mx-auto mt-8 h-px w-10 bg-olive-800" />
            <p className="label mt-5 text-primary-600">{founderName}</p>
          </Reveal>
        </div>
      </section>

      {/* Team - board + core (curated) and live collective leaders, with app avatars */}
      {(groupedTeam.length > 0 || leaders.length > 0) && (
        <section className="bg-white">
          <div className="mx-auto max-w-6xl px-6 pb-24">
            <h2 className="display-tight text-5xl text-neutral-900 sm:text-6xl">Meet the team</h2>

            {groupedTeam.map(([group, members]) => (
              <div key={group} className="mt-12 border-t border-neutral-200 pt-8">
                <p className="label text-neutral-400">{GROUP_LABEL[group] ?? group}</p>
                <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
                  {members.map((m) => (
                    <PersonCard key={m.id} name={m.name} sub={m.role_title} photo={teamPhoto(m.name) ?? m.photo_url} />
                  ))}
                </div>
              </div>
            ))}

            {leaders.length > 0 && (
              <div className="mt-12 border-t border-neutral-200 pt-8">
                <p className="label text-neutral-400">Collective leaders</p>
                <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-3 lg:grid-cols-4">
                  {leaders.map((l) => (
                    <PersonCard key={l.id} name={l.name} sub={`${l.collective} collective`} photo={teamPhoto(l.fullName) ?? teamPhoto(l.name) ?? l.avatar_url} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="bg-olive-700 text-oncream">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <Reveal>
            <h2 className="display-tight text-5xl text-oncream sm:text-6xl">Every action counts</h2>
            <p className="mx-auto mt-6 max-w-md text-[15px] text-oncream/80">
              Together we can create a lasting impact for people and the planet.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href="/collectives" className="rounded-full bg-oncream px-8 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-olive-900 transition-transform duration-300 hover:-translate-y-0.5">
                Join a collective
              </Link>
              <Link href="/get-involved/support" className="rounded-full border border-oncream/40 px-8 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-oncream transition-transform duration-300 hover:-translate-y-0.5 hover:border-oncream hover:bg-oncream/10">
                Support our work
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  )
}
