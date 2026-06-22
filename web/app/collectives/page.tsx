import Link from 'next/link'
import type { Metadata } from 'next'
import { getCollectives, type CollectiveVM } from '@/lib/queries'
import { PageHeader } from '@/components/page-header'
import { STATE_ORDER } from '@/lib/format'
import { APP_URL } from '@/lib/env'

export const revalidate = 1800

export const metadata: Metadata = {
  title: 'Collectives',
  description:
    'Co-Exist collectives are youth-led groups running local conservation across Australia. Find your nearest collective and join the movement.',
}

function groupByState(collectives: CollectiveVM[]): [string, CollectiveVM[]][] {
  const groups = new Map<string, CollectiveVM[]>()
  for (const c of collectives) {
    const key = (c.state || 'Other').toUpperCase()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(c)
  }
  return [...groups.entries()].sort((a, b) => {
    const ia = STATE_ORDER.indexOf(a[0])
    const ib = STATE_ORDER.indexOf(b[0])
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
}

export default async function CollectivesPage() {
  let collectives: CollectiveVM[] = []
  try {
    collectives = await getCollectives()
  } catch {
    collectives = []
  }
  const grouped = groupByState(collectives)

  return (
    <main>
      <PageHeader
        eyebrow="Get involved"
        title="Find your collective"
        subtitle={`${collectives.length} youth-led collectives across Australia, each running conservation in their own backyard. Find your people.`}
      />

      <section className="mx-auto max-w-6xl px-5 py-14">
        {grouped.length === 0 ? (
          <p className="text-neutral-600">Collectives are loading. Check back shortly.</p>
        ) : (
          <div className="space-y-12">
            {grouped.map(([state, list]) => (
              <div key={state}>
                <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-400">
                  {state}
                </h2>
                <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((c) => (
                    <Link
                      key={c.id}
                      href={`/collectives/${c.slug}`}
                      className="group overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="relative aspect-[16/10] overflow-hidden bg-neutral-100">
                        {c.cover_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.cover_image_url}
                            alt={c.name}
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center bg-primary-50 text-primary-300">
                            <span className="text-sm font-semibold uppercase tracking-wider">Co-Exist</span>
                          </div>
                        )}
                      </div>
                      <div className="p-5">
                        <h3 className="font-bold text-neutral-900 group-hover:text-primary-700">
                          {c.name}
                        </h3>
                        {c.region && <p className="mt-1 text-sm text-neutral-500">{c.region}</p>}
                        {c.member_count ? (
                          <p className="mt-3 text-xs text-neutral-400">{c.member_count} members</p>
                        ) : null}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-14 rounded-3xl border border-neutral-100 bg-surface-1 p-8 text-center">
          <h2 className="text-2xl font-extrabold text-neutral-900">No collective near you yet?</h2>
          <p className="mx-auto mt-3 max-w-xl text-neutral-600">
            We are always growing. Register your interest in leading a collective and we will help you start one.
          </p>
          <a
            href={`${APP_URL}/lead-a-collective`}
            className="mt-5 inline-block rounded-full bg-primary-500 px-6 py-2.5 text-sm font-bold text-white hover:bg-primary-600"
          >
            Start a collective
          </a>
        </div>
      </section>
    </main>
  )
}
