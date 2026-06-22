import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getEvent } from '@/lib/queries'
import { activityLabel, formatEventDate } from '@/lib/format'
import { APP_URL } from '@/lib/env'

export const revalidate = 900

type Params = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params
  const event = await getEvent(id).catch(() => null)
  if (!event) return { title: 'Event' }
  return {
    title: event.title,
    description:
      event.description?.slice(0, 155) ??
      `${activityLabel(event.activity_type)} with Co-Exist on ${formatEventDate(event.date_start, event.timezone)}.`,
    openGraph: event.cover_image_url ? { images: [event.cover_image_url] } : undefined,
  }
}

export default async function EventDetailPage({ params }: Params) {
  const { id } = await params
  const event = await getEvent(id).catch(() => null)
  if (!event) notFound()

  const registerHref = event.external_registration_url || `${APP_URL}/event/${event.id}`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    startDate: event.date_start,
    endDate: event.date_end ?? undefined,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    description: event.description ?? undefined,
    image: event.cover_image_url ?? undefined,
    location: event.address
      ? { '@type': 'Place', name: event.address, address: event.address }
      : undefined,
    organizer: { '@type': 'Organization', name: 'Co-Exist Australia', url: 'https://coexistaus.org' },
  }

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {event.cover_image_url && (
        <div className="relative aspect-[21/9] w-full overflow-hidden bg-neutral-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={event.cover_image_url} alt={event.title} className="h-full w-full object-cover" />
        </div>
      )}

      <article className="mx-auto max-w-3xl px-5 py-12">
        <Link href="/events" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
          ← All events
        </Link>

        <span className="mt-5 inline-block rounded-full bg-primary-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-primary-700">
          {activityLabel(event.activity_type)}
        </span>
        <h1 className="mt-3 text-3xl font-extrabold text-neutral-900 sm:text-4xl">{event.title}</h1>

        <dl className="mt-6 grid gap-4 rounded-2xl border border-neutral-100 bg-white p-5 shadow-sm sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">When</dt>
            <dd className="mt-1 font-semibold text-neutral-900">
              {formatEventDate(event.date_start, event.timezone)}
            </dd>
          </div>
          {event.address && (
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Where</dt>
              <dd className="mt-1 font-semibold text-neutral-900">{event.address}</dd>
            </div>
          )}
          {event.collective && (
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Hosted by</dt>
              <dd className="mt-1 font-semibold text-neutral-900">
                <Link href={`/collectives/${event.collective.slug}`} className="hover:text-primary-700">
                  {event.collective.name}
                </Link>
              </dd>
            </div>
          )}
          {event.capacity ? (
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Capacity</dt>
              <dd className="mt-1 font-semibold text-neutral-900">{event.capacity} spots</dd>
            </div>
          ) : null}
        </dl>

        {event.description && (
          <div className="mt-8 whitespace-pre-line text-lg leading-relaxed text-neutral-700">
            {event.description}
          </div>
        )}

        <div className="mt-10">
          <a
            href={registerHref}
            className="inline-block rounded-full bg-olive-700 px-7 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-olive-800"
          >
            Register for this event
          </a>
          <p className="mt-2 text-xs text-neutral-400">
            Registration happens in the Co-Exist app, where you can check in on the day.
          </p>
        </div>
      </article>
    </main>
  )
}
