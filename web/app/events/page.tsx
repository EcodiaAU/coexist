import Link from 'next/link'
import type { Metadata } from 'next'
import { getUpcomingEvents } from '@/lib/queries'
import { PageHeader } from '@/components/page-header'
import { formatDateShort } from '@/lib/format'
import { BentoTile } from '@/components/bento-tile'
import { bentoSpans, BENTO_GRID } from '@/lib/bento'

export const revalidate = 900

export const metadata: Metadata = {
  title: 'Events',
  description:
    'Upcoming Co-Exist conservation events across Australia. Beach cleanups, tree planting, nature walks and more. Find one near you and get involved.',
}

export default async function EventsPage() {
  let events: Awaited<ReturnType<typeof getUpcomingEvents>> = []
  try {
    events = await getUpcomingEvents()
  } catch {
    events = []
  }

  const spans = bentoSpans(events.length)

  return (
    <main>
      <div className="relative isolate">
        <PageHeader
          eyebrow="Get involved"
          title="Upcoming events"
          subtitle="Conservation days run by collectives around the country. Everyone welcome. Come for the work, stay for the people."
          image="/images/nature.webp"
        />
        {/* olive-900/30 mix-blend-multiply wash over the hero to match bento tile tinting */}
        <div className="pointer-events-none absolute inset-0 z-20 bg-olive-900/30 mix-blend-multiply" />
      </div>

      <section>
        {events.length === 0 ? (
          <div className="mx-auto max-w-6xl px-6 py-24 border-t border-neutral-200">
            <p className="display-tight text-[2rem] leading-[0.94] tracking-[-0.03em] text-neutral-900 sm:text-5xl">
              No upcoming events listed right now
            </p>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-neutral-500">
              New events are added all the time. Join a collective to hear about the next one near you.
            </p>
            <Link
              href="/collectives"
              className="mt-8 inline-block border-b border-olive-700 pb-0.5 text-[13px] uppercase tracking-[0.18em] text-olive-700 hover:border-olive-900 hover:text-olive-900"
            >
              Find a collective
            </Link>
          </div>
        ) : (
          <div className={BENTO_GRID}>
            {events.map((e, i) => (
              <BentoTile key={e.id} href={`/events/${e.id}`} image={e.cover_image_url} alt={e.title} span={spans[i]}>
                <div className="absolute inset-x-0 bottom-0 p-5">
                  {/* date label: deeper tint floor so it reads on bright sky photos */}
                  <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="relative z-10">
                    <p className="label rounded-[2px] bg-black/40 px-1.5 py-0.5 text-[10px] text-sage backdrop-blur-[2px]">
                      {formatDateShort(e.date_start, e.timezone)}
                    </p>
                    <h2 className={`display-tight mt-1.5 uppercase leading-[0.96] tracking-[-0.02em] text-oncream ${spans[i].includes('row-span-2') ? 'text-3xl sm:text-4xl' : 'text-base leading-[1.05] sm:text-xl sm:leading-[0.96] line-clamp-2'}`}>
                      {e.title}
                    </h2>
                    {e.collective && (
                      <p className="mt-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-oncream/80">
                        <span className="inline-block h-px w-3 bg-sage/60" />
                        Co-Exist {e.collective.name}
                      </p>
                    )}
                  </div>
                </div>
              </BentoTile>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
