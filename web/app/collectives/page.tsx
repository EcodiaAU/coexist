import type { Metadata } from 'next'
import { getCollectives, type CollectiveVM } from '@/lib/queries'
import { PageHeader } from '@/components/page-header'
import { CollectiveMapClient } from '@/components/collective-map-client'
import { BentoTile } from '@/components/bento-tile'
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

  // Place tiles so size roughly tracks membership: the biggest collectives land
  // on the 2x2 feature slots, the rest on the small slots (grid order preserved).
  const big: number[] = []
  const small: number[] = []
  for (let i = 0; i < collectives.length; i++) {
    ;(spans[i].includes('row-span-2') ? big : small).push(i)
  }
  const byMembers = [...collectives].sort((a, b) => (b.member_count ?? 0) - (a.member_count ?? 0))
  const placed: CollectiveVM[] = new Array(collectives.length)
  let si = 0
  for (const idx of big) placed[idx] = byMembers[si++]
  for (const idx of small) placed[idx] = byMembers[si++]

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
            {placed.map((c, i) => (
              <BentoTile key={c.id} href={`/collectives/${c.slug}`} image={c.cover_image_url} alt={c.name} span={spans[i]}>
                <div className="absolute inset-x-0 bottom-0 p-5">
                  {/* Large tiles keep bigger type; small tiles use tightened 2xl ramp */}
                  <h2
                    className={`uppercase leading-[0.96] text-oncream ${
                      spans[i].includes('row-span-2')
                        ? 'text-4xl tracking-[-0.03em] sm:text-5xl'
                        : 'text-2xl tracking-[-0.03em]'
                    }`}
                  >
                    {c.name}
                  </h2>
                  {c.member_count ? (
                    <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-oncream/80">
                      {c.member_count} members
                    </p>
                  ) : null}
                </div>
              </BentoTile>
            ))}

            {/* CTA tile: tinted background image + grain so it reads as content, not a hole.
                Flat-bottom bento math (bentoSpans) is preserved. */}
            <a
              href={`${APP_URL}/lead-a-collective`}
              className={`group relative flex flex-col items-center justify-center overflow-hidden p-5 text-center ${spans[n - 1]}`}
              style={{
                backgroundImage: 'url(/images/nature.webp)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              {/* Flat black scrim matching PageHeader/BentoTile convention */}
              <div className="absolute inset-0 bg-black/55" />
              {/* Grain over the CTA tile */}
              <div className="grain-layer pointer-events-none absolute inset-0" />
              <span className="relative z-10 text-2xl leading-tight text-oncream tracking-[-0.02em] sm:text-3xl">
                Start a collective
              </span>
              <span className="relative z-10 mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-oncream/70">
                Not near one yet?
              </span>
            </a>
          </div>
        )}
      </section>
    </main>
  )
}
