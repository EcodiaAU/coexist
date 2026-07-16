import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCollective } from '@/lib/queries'
import { APP_URL } from '@/lib/env'

export const revalidate = 1800

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const c = await getCollective(slug).catch(() => null)
  if (!c) return { title: 'Collective' }
  return {
    title: `${c.name} collective`,
    description:
      c.description?.slice(0, 155) ??
      `The ${c.name} Co-Exist collective runs local conservation in ${c.region ?? 'their community'}. Join in.`,
    openGraph: c.cover_image_url ? { images: [c.cover_image_url] } : undefined,
  }
}

export default async function CollectiveDetailPage({ params }: Params) {
  const { slug } = await params
  const c = await getCollective(slug).catch(() => null)
  if (!c) notFound()

  const regionMeta = [
    [c.region, c.state].filter(Boolean).join(', '),
    c.member_count ? `${c.member_count} members` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <main data-eos-id="web/app/collectives/[slug]/page.tsx#0">
      {/* Cinematic cover: olive film tint + grain + flat-black bottom gradient */}
      {c.cover_image_url && (
        <div data-eos-id="web/app/collectives/[slug]/page.tsx#1" className="relative isolate min-h-[60vh] w-full overflow-hidden bg-neutral-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img data-eos-id="web/app/collectives/[slug]/page.tsx#2"
            src={c.cover_image_url}
            alt={c.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* Olive film tint */}
          <div data-eos-id="web/app/collectives/[slug]/page.tsx#3" className="absolute inset-0 bg-olive-900/35 mix-blend-multiply" />
          {/* Grain overlay */}
          <div data-eos-id="web/app/collectives/[slug]/page.tsx#4" className="grain-layer pointer-events-none absolute inset-0" />
          {/* Flat-black bottom gradient for text legibility */}
          <div data-eos-id="web/app/collectives/[slug]/page.tsx#5" className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/70 to-transparent" />
          {/* Collective name + meta bottom-left */}
          <div data-eos-id="web/app/collectives/[slug]/page.tsx#6" className="absolute inset-x-0 bottom-0 p-6 sm:p-10">
            <h1 data-eos-id="web/app/collectives/[slug]/page.tsx#7" data-eos-var="c.name" data-eos-var-label="Name" data-eos-var-scope="prop" className="display-tight font-normal text-4xl leading-[0.96] text-oncream sm:text-6xl">
              {c.name}
            </h1>
            {regionMeta && (
              <p data-eos-id="web/app/collectives/[slug]/page.tsx#8" className="label mt-3 text-oncream/80">{regionMeta}</p>
            )}
          </div>
        </div>
      )}

      {/* If no cover image, render heading in the article body */}
      <article data-eos-id="web/app/collectives/[slug]/page.tsx#9" className="mx-auto max-w-3xl px-5 py-12">
        {/* Back link: .label + SVG chevron */}
        <Link data-eos-href="static" data-eos-id="web/app/collectives/[slug]/page.tsx#10"
          href="/collectives"
          className="label inline-flex items-center gap-1.5 text-neutral-500 hover:text-neutral-800"
        >
          <svg data-eos-id="web/app/collectives/[slug]/page.tsx#11"
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="shrink-0"
          >
            <path data-eos-id="web/app/collectives/[slug]/page.tsx#12" d="M9 11.5L4.5 7 9 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All collectives
        </Link>

        {/* Fallback heading when no cover image */}
        {!c.cover_image_url && (
          <>
            <h1 data-eos-id="web/app/collectives/[slug]/page.tsx#13" data-eos-var="c.name" data-eos-var-label="Name" data-eos-var-scope="prop" className="display-tight mt-5 font-normal text-3xl text-neutral-900 sm:text-4xl">
              {c.name}
            </h1>
            {regionMeta && (
              <p data-eos-id="web/app/collectives/[slug]/page.tsx#14" className="label mt-3 text-neutral-500">{regionMeta}</p>
            )}
          </>
        )}

        {c.description && (
          <div data-eos-id="web/app/collectives/[slug]/page.tsx#15" data-eos-var="c.description" data-eos-var-label="Description" data-eos-var-scope="prop" className="mt-8 max-w-prose whitespace-pre-line text-lg leading-relaxed text-neutral-700">
            {c.description}
          </div>
        )}

        {/* CTAs: flat square, no rounded corners, no shadow */}
        <div data-eos-id="web/app/collectives/[slug]/page.tsx#16" className="mt-10 flex flex-wrap gap-3">
          <a data-eos-href="dynamic" data-eos-href-label="Slug" data-eos-href-scope="prop" data-eos-id="web/app/collectives/[slug]/page.tsx#17"
            href={`${APP_URL}/collective/${c.slug}`}
            className="rounded-none bg-olive-700 px-7 py-3 text-sm font-semibold text-white hover:bg-olive-800"
          >
            Join this collective
          </a>
          <Link data-eos-href="static" data-eos-id="web/app/collectives/[slug]/page.tsx#18"
            href="/events"
            className="rounded-none border border-neutral-800 px-7 py-3 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
          >
            See upcoming events
          </Link>
        </div>
      </article>
    </main>
  )
}
