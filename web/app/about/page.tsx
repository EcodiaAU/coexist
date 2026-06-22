import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { Reveal } from '@/components/reveal'
import { getSiteContent, getTeamMembers } from '@/lib/queries'

export const revalidate = 1800

export const metadata: Metadata = {
  title: 'About',
  description:
    'Co-Exist is a movement built by young people, for young people. Our mission: creating communities that preserve and protect wildlife and wild places.',
}

const GROUP_LABEL: Record<string, string> = { board: 'Board', core: 'Core team', leader: 'Collective leaders' }
const GROUP_ORDER = ['board', 'core', 'leader']

export default async function AboutPage() {
  const [content, team] = await Promise.all([getSiteContent(), getTeamMembers()])
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
          <Image src="/images/nature.webp" alt="Young people in nature with Co-Exist" fill className="object-cover transition-transform duration-[1.2s] hover:scale-105" />
        </Reveal>
        <div className="order-2 flex items-center px-6 py-24 md:order-1 md:px-16">
          <Reveal className="max-w-md">
            <p className="eyebrow text-primary-600">Our story</p>
            <h2 className="mt-5 text-4xl text-neutral-900 sm:text-5xl">It started with one reason to get outside</h2>
            <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-neutral-500">
              <p>
                Co-Exist began with founder Kurt Jones, who found purpose outdoors after growing up
                disconnected from nature. He saw what happens when young people are given a reason to
                get outside together, and a real job to do.
              </p>
              <p>
                It launched in 2022 with a simple idea: a nationwide movement where young Australians
                lead climate action and community in their own neighbourhoods, through local collectives.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Mission / Vision - flat editorial statements */}
      <section className="bg-olive-800 text-oncream">
        <div className="mx-auto grid max-w-6xl gap-x-16 gap-y-12 px-6 py-24 md:grid-cols-2">
          <Reveal>
            <p className="eyebrow text-sage">Our mission</p>
            <p className="mt-5 text-3xl leading-snug text-oncream sm:text-4xl">{mission}</p>
          </Reveal>
          <Reveal delay={120}>
            <p className="eyebrow text-sage">Our vision</p>
            <p className="mt-5 text-3xl leading-snug text-oncream sm:text-4xl">{vision}</p>
          </Reveal>
        </div>
      </section>

      {/* Founder quote with watermark */}
      <section className="relative overflow-hidden bg-white">
        <span className="watermark left-[-2%] top-1/2 -translate-y-1/2 text-[24vw] text-olive-900">Co-Exist</span>
        <div className="relative mx-auto max-w-4xl px-6 py-28 text-center">
          <Reveal>
            <blockquote className="text-3xl leading-[1.2] text-neutral-900 sm:text-[2.6rem]">“{founderQuote}”</blockquote>
            <p className="eyebrow mt-9 text-primary-600">{founderName}</p>
          </Reveal>
        </div>
      </section>

      {/* Team (CMS-managed) - flat editorial grid */}
      {groupedTeam.length > 0 && (
        <section className="bg-white">
          <div className="mx-auto max-w-6xl px-6 pb-24">
            <p className="eyebrow text-primary-600">The people</p>
            <h2 className="mt-4 text-4xl text-neutral-900 sm:text-5xl">Meet the team</h2>
            {groupedTeam.map(([group, members]) => (
              <div key={group} className="mt-12">
                <p className="eyebrow text-neutral-400">{GROUP_LABEL[group] ?? group}</p>
                <div className="mt-6 grid gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
                  {members.map((m) => (
                    <div key={m.id}>
                      <div className="relative aspect-square overflow-hidden bg-primary-50">
                        {m.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.photo_url} alt={m.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-3xl font-light text-primary-300">
                            {m.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <h3 className="mt-4 text-xl text-neutral-900">{m.name}</h3>
                      {m.role_title && <p className="mt-0.5 text-sm text-neutral-500">{m.role_title}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="bg-olive-700 text-oncream">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <Reveal>
            <h2 className="text-4xl text-oncream sm:text-6xl">Every action counts</h2>
            <p className="mx-auto mt-6 max-w-md text-[15px] text-oncream/80">
              Together we can create a lasting impact for people and the planet.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href="/collectives" className="rounded-full bg-oncream px-8 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-olive-900 transition-all duration-300 hover:px-10">
                Join a collective
              </Link>
              <Link href="/get-involved/support" className="rounded-full border border-oncream/40 px-8 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-oncream transition-all duration-300 hover:border-oncream hover:bg-oncream/10">
                Support our work
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  )
}
