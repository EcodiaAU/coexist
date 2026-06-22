import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
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
      />

      {/* Story */}
      <section className="bg-cream">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-extrabold text-neutral-900 sm:text-3xl">Our story</h2>
            <div className="mt-5 space-y-4 text-lg leading-relaxed text-neutral-600">
              <p>
                Co-Exist began with founder Kurt Jones, who found purpose outdoors after
                growing up disconnected from nature. He saw what happens when young people
                are given a reason to get outside together, and a real job to do.
              </p>
              <p>
                Co-Exist launched in 2022 with a simple idea: build a nationwide movement
                where young Australians take the lead on climate action and community in
                their own neighbourhoods, through local collectives.
              </p>
            </div>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-neutral-100 shadow-sm">
            <Image src="/images/nature.webp" alt="Young people in nature with Co-Exist" fill className="object-cover" />
          </div>
        </div>
      </section>

      {/* Mission / Vision */}
      <section className="bg-surface-1">
        <div className="mx-auto grid max-w-6xl gap-5 px-5 py-16 md:grid-cols-2">
          <div className="rounded-3xl border border-neutral-100 bg-white p-8 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary-600">Our mission</p>
            <p className="mt-3 text-xl font-semibold leading-relaxed text-neutral-900">{mission}</p>
          </div>
          <div className="rounded-3xl border border-neutral-100 bg-white p-8 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary-600">Our vision</p>
            <p className="mt-3 text-xl font-semibold leading-relaxed text-neutral-900">{vision}</p>
          </div>
        </div>
      </section>

      {/* Founder quote */}
      <section className="bg-olive-700 text-oncream">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <blockquote className="font-serif text-3xl font-medium leading-[1.25] text-oncream sm:text-[2.4rem]">
            “{founderQuote}”
          </blockquote>
          <p className="eyebrow mt-8 text-oncream/70">{founderName}</p>
        </div>
      </section>

      {/* Team (CMS-managed) */}
      {groupedTeam.length > 0 && (
        <section className="bg-cream">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="text-2xl font-extrabold text-neutral-900 sm:text-3xl">Meet the team</h2>
            {groupedTeam.map(([group, members]) => (
              <div key={group} className="mt-8">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-400">
                  {GROUP_LABEL[group] ?? group}
                </p>
                <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {members.map((m) => (
                    <div key={m.id} className="rounded-2xl border border-neutral-100 bg-white p-5 text-center shadow-sm">
                      <div className="mx-auto h-20 w-20 overflow-hidden rounded-full bg-primary-50">
                        {m.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.photo_url} alt={m.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-lg font-bold text-primary-400">
                            {m.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <h3 className="mt-3 font-bold text-neutral-900">{m.name}</h3>
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
      <section className="bg-cream">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center">
          <h2 className="text-2xl font-extrabold text-neutral-900 sm:text-3xl">
            Every action counts
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-lg text-neutral-600">
            Together we can create a lasting impact for people and the planet.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/collectives" className="rounded-full bg-olive-700 px-6 py-3 text-sm font-bold text-white hover:bg-olive-800">
              Join a collective
            </Link>
            <Link href="/get-involved/support" className="rounded-full border border-neutral-200 px-6 py-3 text-sm font-bold text-neutral-800 hover:bg-neutral-50">
              Support our work
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
