import Link from 'next/link'
import type { Metadata } from 'next'
import { getUpcomingEvents } from '@/lib/queries'
import { PageHeader } from '@/components/page-header'
import { activityLabel, formatEventDate } from '@/lib/format'

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

  return (
    <main>
      <PageHeader
        eyebrow="Get involved"
        title="Upcoming events"
        subtitle="Conservation days run by collectives around the country. Everyone is welcome. Come for the work, stay for the people."
        image="/images/nature.webp"
      />

      <section className="mx-auto max-w-6xl px-5 py-14">
        {events.length === 0 ? (
          <div className="rounded-2xl border border-neutral-100 bg-white p-10 text-center shadow-sm">
            <p className="text-lg font-semibold text-neutral-900">No upcoming events listed right now</p>
            <p className="mt-2 text-neutral-600">
              New events are added all the time. Join a collective to hear about the next one near you.
            </p>
            <Link
              href="/collectives"
              className="mt-5 inline-block rounded-full bg-olive-700 px-6 py-2.5 text-sm font-bold text-white hover:bg-olive-800"
            >
              Find a collective
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => (
              <Link
                key={e.id}
                href={`/events/${e.id}`}
                className="group overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-neutral-100">
                  {e.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={e.cover_image_url}
                      alt={e.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-primary-50 text-primary-300">
                      <span className="text-sm font-semibold uppercase tracking-wider">Co-Exist</span>
                    </div>
                  )}
                  <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-primary-700">
                    {activityLabel(e.activity_type)}
                  </span>
                </div>
                <div className="p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    {formatEventDate(e.date_start, e.timezone)}
                  </p>
                  <h2 className="mt-1.5 font-bold text-neutral-900 group-hover:text-primary-700">
                    {e.title}
                  </h2>
                  {e.address && <p className="mt-1 text-sm text-neutral-500">{e.address}</p>}
                  {e.collective && (
                    <p className="mt-3 text-xs text-neutral-400">
                      Hosted by {e.collective.name}
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
