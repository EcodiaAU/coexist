import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getCollectives, type CollectiveVM } from '@/lib/queries'
import { PageHeader } from '@/components/page-header'
import { APP_URL } from '@/lib/env'

export const revalidate = 1800

export const metadata: Metadata = {
  title: 'Collectives',
  description:
    'Co-Exist collectives are youth-led groups running local conservation across Australia. Find your nearest collective and join the movement.',
}

function span(i: number): string {
  const m = i % 6
  if (m === 0) return 'sm:col-span-2 sm:row-span-2'
  if (m === 3) return 'sm:col-span-2'
  return ''
}

export default async function CollectivesPage() {
  let collectives: CollectiveVM[] = []
  try {
    collectives = await getCollectives()
  } catch {
    collectives = []
  }

  return (
    <main>
      <PageHeader
        eyebrow="Get involved"
        title="Find your collective"
        subtitle={`${collectives.length} youth-led collectives across Australia, each running conservation in their own backyard.`}
        image="/images/gather.webp"
      />

      {/* Our collective reach - the Co-Exist Australia map */}
      <section className="bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16 text-center">
          <p className="eyebrow text-primary-600">Our collective reach</p>
          <div className="relative mx-auto mt-8 aspect-[1480/1080] w-full max-w-3xl">
            <Image src="/images/map.webp" alt="Map of Co-Exist collectives across Australia" fill className="object-contain" />
          </div>
        </div>
      </section>

      {/* Bento grid of collectives - name only (region is the same as the name) */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        {collectives.length === 0 ? (
          <p className="py-16 text-center text-neutral-500">Collectives are loading. Check back shortly.</p>
        ) : (
          <div className="grid auto-rows-[13rem] grid-flow-row-dense grid-cols-2 gap-3 sm:grid-cols-4">
            {collectives.map((c, i) => (
              <Link
                key={c.id}
                href={`/collectives/${c.slug}`}
                className={`group relative isolate overflow-hidden rounded-2xl bg-olive-800 ${span(i)}`}
              >
                {c.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.cover_image_url} alt={c.name} loading="lazy" className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-[1.2s] group-hover:scale-105" />
                ) : null}
                <div className="absolute inset-0 -z-10 bg-gradient-to-t from-olive-950/85 via-olive-950/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <h2 className={`leading-[1.02] text-oncream ${i % 6 === 0 ? 'text-3xl sm:text-4xl' : 'text-xl'}`}>{c.name}</h2>
                  {c.member_count ? (
                    <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-oncream/60">{c.member_count} members</p>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-14 rounded-3xl bg-olive-700 p-10 text-center text-oncream">
          <h2 className="text-3xl sm:text-4xl">No collective near you yet?</h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] text-oncream/80">
            We are always growing. Register your interest in leading one and we will help you start it.
          </p>
          <a href={`${APP_URL}/lead-a-collective`} className="mt-6 inline-block rounded-full bg-oncream px-7 py-3 text-[13px] font-semibold uppercase tracking-wider text-olive-900 hover:bg-white">
            Start a collective
          </a>
        </div>
      </section>
    </main>
  )
}
