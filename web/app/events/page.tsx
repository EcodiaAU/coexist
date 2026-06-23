import Link from 'next/link'
import type { Metadata } from 'next'
import { getUpcomingEvents } from '@/lib/queries'
import { PageHeader } from '@/components/page-header'
import { activityLabel, formatDateShort } from '@/lib/format'

export const revalidate = 900

export const metadata: Metadata = {
  title: 'Events',
  description:
    'Upcoming Co-Exist conservation events across Australia. Beach cleanups, tree planting, nature walks and more. Find one near you and get involved.',
}

// Bento span pattern - varied tile sizes, dense packing fills the gaps.
function span(i: number): string {
  const m = i % 6
  if (m === 0) return 'sm:col-span-2 sm:row-span-2'
  if (m === 3) return 'sm:col-span-2'
  return ''
}

export default async function EventsPage() {
  let events: Awaited<ReturnType<typeof getUpcomingEvents>> = []
  try {
    events = await getUpcomingEvents()
  } catch {
    events = []
  }

  return (
    <main>
      <PageHeader
        eyebrow="Get involved"
        title="Upcoming events"
        subtitle="Conservation days run by collectives around the country. Everyone welcome. Come for the work, stay for the people."
        image="/images/nature.webp"
      />

      <section className="py-14">
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
          <div className="grid auto-rows-[46vw] grid-flow-row-dense grid-cols-2 sm:auto-rows-[15rem] sm:grid-cols-4">
            {events.map((e, i) => (
              <Link
                key={e.id}
                href={`/events/${e.id}`}
                className={`group relative isolate overflow-hidden bg-olive-800 ${span(i)}`}
              >
                {e.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={e.cover_image_url}
                    alt={e.title}
                    loading="lazy"
                    className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-[1.2s] group-hover:scale-105"
                  />
                ) : null}
                <div className="absolute inset-0 -z-10 bg-gradient-to-t from-olive-950/85 via-olive-950/25 to-transparent" />

                <span className="absolute left-4 top-4 rounded-full bg-oncream/90 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-olive-900">
                  {activityLabel(e.activity_type)}
                </span>

                <div className="absolute inset-x-0 bottom-0 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-oncream/70">
                    {formatDateShort(e.date_start, e.timezone)}
                  </p>
                  <h2 className={`mt-1 leading-[1.05] text-oncream ${i % 6 === 0 ? 'text-3xl sm:text-4xl' : 'text-xl'}`}>
                    {e.title}
                  </h2>
                  {e.collective && (
                    <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-oncream/60">
                      Co-Exist {e.collective.name}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
