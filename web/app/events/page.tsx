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
      <PageHeader
        eyebrow="Get involved"
        title="Upcoming events"
        subtitle="Conservation days run by collectives around the country. Everyone welcome. Come for the work, stay for the people."
        image="/images/nature.webp"
      />

      <section>
        {events.length === 0 ? (
          <div className="mx-auto max-w-6xl px-6 py-20 text-center">
            <p className="text-2xl text-neutral-900">No upcoming events listed right now</p>
            <p className="mx-auto mt-3 max-w-md text-neutral-500">
              New events are added all the time. Join a collective to hear about the next one near you.
            </p>
            <Link
              href="/collectives"
              className="mt-7 inline-block rounded-full bg-olive-700 px-7 py-3 text-[13px] font-semibold uppercase tracking-wider text-white hover:bg-olive-800"
            >
              Find a collective
            </Link>
          </div>
        ) : (
          <div className={BENTO_GRID}>
            {events.map((e, i) => (
              <BentoTile key={e.id} href={`/events/${e.id}`} image={e.cover_image_url} alt={e.title} span={spans[i]}>
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sage">
                    {formatDateShort(e.date_start, e.timezone)}
                  </p>
                  <h2 className={`mt-1.5 uppercase leading-[0.96] tracking-[-0.02em] text-oncream ${spans[i].includes('row-span-2') ? 'text-3xl sm:text-4xl' : 'text-lg'}`}>
                    {e.title}
                  </h2>
                  {e.collective && (
                    <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-oncream/65">
                      Co-Exist {e.collective.name}
                    </p>
                  )}
                </div>
              </BentoTile>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
