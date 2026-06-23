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
      <PageHeader eyebrow="From the movement" title="News & updates" image="/images/nature.webp" />

      <section className="mx-auto max-w-6xl px-5 py-14">
        {news.length === 0 ? (
          <div className="py-24 text-center md:py-32">
            <p className="display-tight text-2xl font-normal text-neutral-900">Nothing new just yet</p>
            <p className="mt-4 text-neutral-500">
              Stories and updates from across the movement will appear here. Subscribe below to get them in your inbox.
            </p>
          </div>
        ) : (
          <div>
            {news.map((n, i) => (
              <article key={n.id} className={i > 0 ? 'border-t border-neutral-200' : ''}>
                {n.image_url && (
                  <div className="relative overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={n.image_url}
                      alt={n.title}
                      loading="lazy"
                      className="aspect-[16/9] w-full object-cover"
                    />
                    <div className="grain-layer" />
                    <div className="absolute inset-0 bg-olive-800/30" />
                  </div>
                )}
                <div className="py-8">
                  <p className="label text-neutral-400">
                    {formatDateShort(n.created_at)}
                    {n.is_pinned ? ', Pinned' : ''}
                  </p>
                  <h2 className="display-tight mt-2 text-2xl font-normal text-neutral-900">{n.title}</h2>
                  {n.content && (
                    <p className="mt-4 max-w-3xl whitespace-pre-line leading-relaxed text-neutral-600">{n.content}</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
