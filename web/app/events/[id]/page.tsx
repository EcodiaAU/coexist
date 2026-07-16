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
    <main data-eos-id="web/app/events/[id]/page.tsx#0" data-eos-v="2">
      <script data-eos-id="web/app/events/[id]/page.tsx#1" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Cinematic hero: full-bleed cover + olive film tint + grain + bottom flat-black gradient */}
      {event.cover_image_url ? (
        <section data-eos-id="web/app/events/[id]/page.tsx#2" className="relative isolate flex min-h-[58vh] items-end overflow-hidden bg-neutral-900 sm:min-h-[68vh]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img data-eos-src="dynamic" data-eos-src-label="Cover image url" data-eos-id="web/app/events/[id]/page.tsx#3"
            src={event.cover_image_url}
            alt={event.title}
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* olive film tint */}
          <div data-eos-id="web/app/events/[id]/page.tsx#4" className="absolute inset-0 bg-olive-900/40" />
          {/* grain overlay */}
          <div data-eos-id="web/app/events/[id]/page.tsx#5" className="grain-layer absolute inset-0 z-0" />
          {/* bottom flat-black gradient */}
          <div data-eos-id="web/app/events/[id]/page.tsx#6" className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 to-transparent" />
          {/* title lockup */}
          <div data-eos-id="web/app/events/[id]/page.tsx#7" className="relative z-10 mx-auto w-full max-w-4xl px-6 pb-12 pt-40 sm:pb-16">
            <span data-eos-id="web/app/events/[id]/page.tsx#8" data-eos-var="event.activity_type" data-eos-var-label="Activity type" data-eos-var-scope="prop" className="mark inline-block text-oncream/90 text-[11px] tracking-[0.18em] uppercase">
              {activityLabel(event.activity_type)}
            </span>
            <h1 data-eos-id="web/app/events/[id]/page.tsx#9" data-eos-var="event.title" data-eos-var-label="Title" data-eos-var-scope="prop" className="display-tight mt-3 text-[2.75rem] font-normal leading-[0.92] text-oncream sm:text-6xl">
              {event.title}
            </h1>
          </div>
        </section>
      ) : (
        /* No cover image: plain white header with title */
        <section data-eos-id="web/app/events/[id]/page.tsx#10" className="flex min-h-[32vh] items-end bg-white border-b border-neutral-200">
          <div data-eos-id="web/app/events/[id]/page.tsx#11" className="mx-auto w-full max-w-4xl px-6 pb-12 pt-32">
            <span data-eos-id="web/app/events/[id]/page.tsx#12" data-eos-var="event.activity_type" data-eos-var-label="Activity type" data-eos-var-scope="prop" className="mark inline-block text-[11px] tracking-[0.18em] uppercase text-olive-700">
              {activityLabel(event.activity_type)}
            </span>
            <h1 data-eos-id="web/app/events/[id]/page.tsx#13" data-eos-var="event.title" data-eos-var-label="Title" data-eos-var-scope="prop" className="display-tight mt-3 text-[2.75rem] font-normal leading-[0.92] text-neutral-900 sm:text-6xl">
              {event.title}
            </h1>
          </div>
        </section>
      )}

      <article data-eos-id="web/app/events/[id]/page.tsx#14" className="mx-auto max-w-4xl px-5 py-12">
        {/* Back link */}
        <Link data-eos-href="static" data-eos-id="web/app/events/[id]/page.tsx#15"
          href="/events"
          className="label inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          <svg data-eos-id="web/app/events/[id]/page.tsx#16" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path data-eos-id="web/app/events/[id]/page.tsx#17" d="M7.5 2L3.5 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All events
        </Link>

        {/* Flat spec row replacing rounded card */}
        <dl data-eos-id="web/app/events/[id]/page.tsx#18" className="mt-8 border-y border-neutral-200 divide-y divide-neutral-100">
          <div data-eos-id="web/app/events/[id]/page.tsx#19" className="flex gap-6 py-3">
            <dt data-eos-id="web/app/events/[id]/page.tsx#20" className="label w-24 shrink-0 text-neutral-400">When</dt>
            <dd data-eos-id="web/app/events/[id]/page.tsx#21" data-eos-var="event.date_start" data-eos-var-label="Date start" data-eos-var-scope="prop" className="text-[15px] text-neutral-900">
              {formatEventDate(event.date_start, event.timezone)}
            </dd>
          </div>
          {event.address && (
            <div data-eos-id="web/app/events/[id]/page.tsx#22" className="flex gap-6 py-3">
              <dt data-eos-id="web/app/events/[id]/page.tsx#23" className="label w-24 shrink-0 text-neutral-400">Where</dt>
              <dd data-eos-id="web/app/events/[id]/page.tsx#24" data-eos-var="event.address" data-eos-var-label="Address" data-eos-var-scope="prop" className="text-[15px] text-neutral-900">{event.address}</dd>
            </div>
          )}
          {event.collective && (
            <div data-eos-id="web/app/events/[id]/page.tsx#25" className="flex gap-6 py-3">
              <dt data-eos-id="web/app/events/[id]/page.tsx#26" className="label w-24 shrink-0 text-neutral-400">Hosted by</dt>
              <dd data-eos-id="web/app/events/[id]/page.tsx#27" className="text-[15px] text-neutral-900">
                <Link data-eos-href="dynamic" data-eos-href-label="Slug" data-eos-href-scope="prop" data-eos-id="web/app/events/[id]/page.tsx#28" data-eos-var="event.collective.name" data-eos-var-label="Name" data-eos-var-scope="prop"
                  href={`/collectives/${event.collective.slug}`}
                  className="label inline-flex items-center gap-1 text-neutral-700 hover:text-olive-700 transition-colors"
                >
                  Co-Exist {event.collective.name}
                  <svg data-eos-id="web/app/events/[id]/page.tsx#29" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    <path data-eos-id="web/app/events/[id]/page.tsx#30" d="M2.5 5h5M5 2.5l2.5 2.5L5 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </dd>
            </div>
          )}
          {event.capacity ? (
            <div data-eos-id="web/app/events/[id]/page.tsx#31" className="flex gap-6 py-3">
              <dt data-eos-id="web/app/events/[id]/page.tsx#32" className="label w-24 shrink-0 text-neutral-400">Capacity</dt>
              <dd data-eos-id="web/app/events/[id]/page.tsx#33" data-eos-var="event.capacity" data-eos-var-label="Capacity" data-eos-var-scope="prop" className="text-[15px] text-neutral-900">{event.capacity} spots</dd>
            </div>
          ) : null}
        </dl>

        {/* Description constrained to max-w-prose */}
        {event.description && (
          <div data-eos-id="web/app/events/[id]/page.tsx#34" data-eos-var="event.description" data-eos-var-label="Description" data-eos-var-scope="prop" className="mt-8 max-w-prose whitespace-pre-line text-[17px] leading-relaxed text-neutral-700">
            {event.description}
          </div>
        )}

        {/* Flat CTA band */}
        <div data-eos-id="web/app/events/[id]/page.tsx#35" className="mt-12 border-t border-neutral-200 pt-8">
          <a data-eos-href="dynamic" data-eos-href-label="Register href" data-eos-href-scope="prop" data-eos-id="web/app/events/[id]/page.tsx#36"
            href={registerHref}
            className="inline-block bg-olive-700 px-8 py-3.5 text-sm font-medium tracking-wide text-white transition-colors hover:bg-olive-800"
          >
            Register for this event
          </a>
          <p data-eos-id="web/app/events/[id]/page.tsx#37" className="mt-3 text-xs text-neutral-400">
            Registration happens in the Co-Exist app, where you can check in on the day.
          </p>
        </div>
      </article>
    </main>
  )
}
