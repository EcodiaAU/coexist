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

      {/* Cinematic hero: full-bleed cover + olive film tint + grain + bottom flat-black gradient */}
      {event.cover_image_url ? (
        <section className="relative isolate flex min-h-[58vh] items-end overflow-hidden bg-neutral-900 sm:min-h-[68vh]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={event.cover_image_url}
            alt={event.title}
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* olive film tint */}
          <div className="absolute inset-0 bg-olive-900/40" />
          {/* grain overlay */}
          <div className="grain-layer absolute inset-0 z-0" />
          {/* bottom flat-black gradient */}
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 to-transparent" />
          {/* title lockup */}
          <div className="relative z-10 mx-auto w-full max-w-4xl px-6 pb-12 pt-40 sm:pb-16">
            <span className="mark inline-block text-oncream/90 text-[11px] tracking-[0.18em] uppercase">
              {activityLabel(event.activity_type)}
            </span>
            <h1 className="display-tight mt-3 text-[2.75rem] font-normal leading-[0.92] text-oncream sm:text-6xl">
              {event.title}
            </h1>
          </div>
        </section>
      ) : (
        /* No cover image: plain white header with title */
        <section className="flex min-h-[32vh] items-end bg-white border-b border-neutral-200">
          <div className="mx-auto w-full max-w-4xl px-6 pb-12 pt-32">
            <span className="mark inline-block text-[11px] tracking-[0.18em] uppercase text-olive-700">
              {activityLabel(event.activity_type)}
            </span>
            <h1 className="display-tight mt-3 text-[2.75rem] font-normal leading-[0.92] text-neutral-900 sm:text-6xl">
              {event.title}
            </h1>
          </div>
        </section>
      )}

      <article className="mx-auto max-w-4xl px-5 py-12">
        {/* Back link */}
        <Link
          href="/events"
          className="label inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M7.5 2L3.5 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All events
        </Link>

        {/* Flat spec row replacing rounded card */}
        <dl className="mt-8 border-y border-neutral-200 divide-y divide-neutral-100">
          <div className="flex gap-6 py-3">
            <dt className="label w-24 shrink-0 text-neutral-400">When</dt>
            <dd className="text-[15px] text-neutral-900">
              {formatEventDate(event.date_start, event.timezone)}
            </dd>
          </div>
          {event.address && (
            <div className="flex gap-6 py-3">
              <dt className="label w-24 shrink-0 text-neutral-400">Where</dt>
              <dd className="text-[15px] text-neutral-900">{event.address}</dd>
            </div>
          )}
          {event.collective && (
            <div className="flex gap-6 py-3">
              <dt className="label w-24 shrink-0 text-neutral-400">Hosted by</dt>
              <dd className="text-[15px] text-neutral-900">
                <Link
                  href={`/collectives/${event.collective.slug}`}
                  className="label inline-flex items-center gap-1 text-neutral-700 hover:text-olive-700 transition-colors"
                >
                  Co-Exist {event.collective.name}
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    <path d="M2.5 5h5M5 2.5l2.5 2.5L5 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </dd>
            </div>
          )}
          {event.capacity ? (
            <div className="flex gap-6 py-3">
              <dt className="label w-24 shrink-0 text-neutral-400">Capacity</dt>
              <dd className="text-[15px] text-neutral-900">{event.capacity} spots</dd>
            </div>
          ) : null}
        </dl>

        {/* Description constrained to max-w-prose */}
        {event.description && (
          <div className="mt-8 max-w-prose whitespace-pre-line text-[17px] leading-relaxed text-neutral-700">
            {event.description}
          </div>
        )}

        {/* Flat CTA band */}
        <div className="mt-12 border-t border-neutral-200 pt-8">
          <a
            href={registerHref}
            className="inline-block bg-olive-700 px-8 py-3.5 text-sm font-medium tracking-wide text-white transition-colors hover:bg-olive-800"
          >
            Register for this event
          </a>
          <p className="mt-3 text-xs text-neutral-400">
            Registration happens in the Co-Exist app, where you can check in on the day.
          </p>
        </div>
      </article>
    </main>
  )
}
