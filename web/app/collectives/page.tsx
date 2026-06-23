import Link from 'next/link'
import type { Metadata } from 'next'
import { getCollectives, type CollectiveVM } from '@/lib/queries'
import { PageHeader } from '@/components/page-header'
import { CollectiveMapClient } from '@/components/collective-map-client'
import { bentoSpans, BENTO_GRID } from '@/lib/bento'
import { APP_URL } from '@/lib/env'

export const revalidate = 1800

export const metadata: Metadata = {
  title: 'Collectives',
  description:
    'Co-Exist collectives are youth-led groups running local conservation across Australia. Find your nearest collective and join the movement.',
}

export default async function CollectivesPage() {
  let collectives: CollectiveVM[] = []
  try {
    collectives = await getCollectives()
  } catch {
    collectives = []
  }

  // total grid tiles = collectives + the "start a collective" CTA tile
  const n = collectives.length + 1
  const spans = bentoSpans(n)

  return (
    <main>
      <PageHeader
        eyebrow="Get involved"
        title="Find your collective"
        subtitle={`${collectives.length} youth-led collectives across Australia, each running conservation in their own backyard.`}
        image="/images/collective.webp"
      />

      {/* Full-bleed interactive map (ported from the app), flush to hero + grid */}
      <CollectiveMapClient collectives={collectives} className="h-[78vh] min-h-[540px] w-full" />

      {/* Full-bleed flush bento - flat bottom (CTA is the last tile, fills its row) */}
      <section>
        {collectives.length === 0 ? (
          <p className="py-16 text-center text-neutral-500">Collectives are loading. Check back shortly.</p>
        ) : (
          <div className={BENTO_GRID}>
            {collectives.map((c, i) => (
              <Link
                key={c.id}
                href={`/collectives/${c.slug}`}
                className={`group relative isolate overflow-hidden bg-olive-800 ${spans[i]}`}
              >
                {c.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.cover_image_url} alt={c.name} loading="lazy" className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-[1.2s] group-hover:scale-105" />
                ) : null}
                <div className="absolute inset-0 -z-10 bg-gradient-to-t from-olive-950/85 via-olive-950/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <h2 className={`uppercase leading-[0.98] tracking-[-0.02em] text-oncream ${spans[i].includes('row-span-2') ? 'text-3xl sm:text-4xl' : 'text-xl'}`}>{c.name}</h2>
                  {c.member_count ? (
                    <p className="mt-1 text-[11px] uppercase tracking-[0.02em] text-oncream/60">{c.member_count} members</p>
                  ) : null}
                </div>
              </Link>
            ))}

            {/* CTA tile - fills the rest of the last row so the grid bottom is flat */}
            <a
              href={`${APP_URL}/lead-a-collective`}
              className={`group flex flex-col items-center justify-center bg-olive-700 p-5 text-center text-oncream transition-colors hover:bg-olive-600 ${spans[n - 1]}`}
            >
              <span className="text-xl leading-tight text-oncream sm:text-2xl">Start a collective</span>
              <span className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-oncream/70">Not near one yet? →</span>
            </a>
          </div>
        )}
      </section>
    </main>
  )
}
