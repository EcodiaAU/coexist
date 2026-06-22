import type { Metadata } from 'next'
import { getNews, type NewsVM } from '@/lib/queries'
import { PageHeader } from '@/components/page-header'
import { formatDateShort } from '@/lib/format'

export const revalidate = 900

export const metadata: Metadata = {
  title: 'News',
  description: 'The latest from Co-Exist Australia: updates, stories and announcements from across the movement.',
}

export default async function NewsPage() {
  let news: NewsVM[] = []
  try {
    news = await getNews()
  } catch {
    news = []
  }

  return (
    <main>
      <PageHeader eyebrow="From the movement" title="News & updates" />

      <section className="mx-auto max-w-3xl px-5 py-14">
        {news.length === 0 ? (
          <div className="rounded-2xl border border-neutral-100 bg-white p-10 text-center shadow-sm">
            <p className="text-lg font-semibold text-neutral-900">Nothing new just yet</p>
            <p className="mt-2 text-neutral-600">
              Stories and updates from across the movement will appear here. Subscribe below to get them in your inbox.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {news.map((n) => (
              <article key={n.id} className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
                {n.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={n.image_url}
                    alt={n.title}
                    loading="lazy"
                    className="mb-5 aspect-[16/9] w-full rounded-xl object-cover"
                  />
                )}
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  {formatDateShort(n.created_at)}
                  {n.is_pinned ? ' · Pinned' : ''}
                </p>
                <h2 className="mt-1.5 text-xl font-bold text-neutral-900">{n.title}</h2>
                {n.content && (
                  <p className="mt-3 whitespace-pre-line leading-relaxed text-neutral-700">{n.content}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
