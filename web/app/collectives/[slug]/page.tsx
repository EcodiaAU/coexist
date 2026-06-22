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

  return (
    <main>
      {c.cover_image_url && (
        <div className="relative aspect-[21/9] w-full overflow-hidden bg-neutral-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.cover_image_url} alt={c.name} className="h-full w-full object-cover" />
        </div>
      )}

      <article className="mx-auto max-w-3xl px-5 py-12">
        <Link href="/collectives" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
          ← All collectives
        </Link>

        <h1 className="mt-5 text-3xl font-extrabold text-neutral-900 sm:text-4xl">{c.name}</h1>
        <p className="mt-2 text-lg text-neutral-500">
          {[c.region, c.state].filter(Boolean).join(', ')}
          {c.member_count ? ` · ${c.member_count} members` : ''}
        </p>

        {c.description && (
          <div className="mt-8 whitespace-pre-line text-lg leading-relaxed text-neutral-700">
            {c.description}
          </div>
        )}

        <div className="mt-10 flex flex-wrap gap-3">
          <a
            href={`${APP_URL}/collective/${c.slug}`}
            className="rounded-full bg-olive-700 px-7 py-3 text-sm font-bold text-white shadow-sm hover:bg-olive-800"
          >
            Join this collective
          </a>
          <Link
            href="/events"
            className="rounded-full border border-neutral-200 px-7 py-3 text-sm font-bold text-neutral-800 hover:bg-neutral-50"
          >
            See upcoming events
          </Link>
        </div>
      </article>
    </main>
  )
}
