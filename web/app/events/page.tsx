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
    <main data-eos-id="web/app/events/page.tsx#0" data-eos-v="2">
      <PageHeader data-eos-id="web/app/events/page.tsx#1"
        eyebrow="Get involved"
        title="Upcoming events"
        subtitle="Conservation days run by collectives around the country. Everyone welcome. Come for the work, stay for the people."
        image="/images/nature.webp"
      />

      <section data-eos-id="web/app/events/page.tsx#2">
        {events.length === 0 ? (
          <div data-eos-id="web/app/events/page.tsx#3" className="mx-auto max-w-6xl px-6 py-24 border-t border-neutral-200">
            <p data-eos-id="web/app/events/page.tsx#4" className="display-tight text-[2rem] leading-[0.94] tracking-[-0.03em] text-neutral-900 sm:text-5xl">
              No upcoming events listed right now
            </p>
            <p data-eos-id="web/app/events/page.tsx#5" className="mt-4 max-w-sm text-[15px] leading-relaxed text-neutral-500">
              New events are added all the time. Join a collective to hear about the next one near you.
            </p>
            <Link data-eos-href="static" data-eos-id="web/app/events/page.tsx#6"
              href="/collectives"
              className="mt-8 inline-block border-b border-olive-700 pb-0.5 text-[13px] uppercase tracking-[0.18em] text-olive-700 hover:border-olive-900 hover:text-olive-900"
            >
              Find a collective
            </Link>
          </div>
        ) : (
          <div data-eos-id="web/app/events/page.tsx#7" className={BENTO_GRID}>
            {events.map((e, i) => (
              <BentoTile data-eos-href="dynamic" data-eos-href-label="Id" data-eos-href-scope="item" data-eos-id="web/app/events/page.tsx#8" key={e.id} href={`/events/${e.id}`} image={e.cover_image_url} alt={e.title} span={spans[i]}>
                <div data-eos-id="web/app/events/page.tsx#9" className="absolute inset-x-0 bottom-0 p-5">
                  <p data-eos-id="web/app/events/page.tsx#10" data-eos-var="e.date_start" data-eos-var-label="Date start" data-eos-var-scope="item" className="label text-[10px] text-sage" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.55)' }}>
                    {formatDateShort(e.date_start, e.timezone)}
                  </p>
                  <h2 data-eos-id="web/app/events/page.tsx#11" data-eos-var="e.title" data-eos-var-label="Title" data-eos-var-scope="item" className={`display-tight mt-1.5 uppercase leading-[0.96] tracking-[-0.02em] text-oncream ${spans[i].includes('row-span-2') ? 'text-3xl sm:text-4xl' : 'text-base leading-[1.05] sm:text-xl sm:leading-[0.96] line-clamp-2'}`}>
                    {e.title}
                  </h2>
                  {e.collective && (
                    <p data-eos-id="web/app/events/page.tsx#12" data-eos-var="e.collective.name" data-eos-var-label="Name" data-eos-var-scope="item" className="mt-2 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-oncream/80">
                      <span data-eos-id="web/app/events/page.tsx#13" className="inline-block h-px w-3 bg-sage/60" />
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
