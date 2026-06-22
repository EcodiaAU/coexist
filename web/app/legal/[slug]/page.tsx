import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLegalPage, getLegalSlugs } from '@/lib/queries'
import { formatDateShort } from '@/lib/format'

export const revalidate = 3600

type Params = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  try {
    const slugs = await getLegalSlugs()
    return slugs.map((slug) => ({ slug }))
  } catch {
    return []
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const page = await getLegalPage(slug).catch(() => null)
  if (!page) return { title: 'Legal' }
  return { title: page.title, description: page.summary ?? undefined }
}

export default async function LegalPage({ params }: Params) {
  const { slug } = await params
  const page = await getLegalPage(slug).catch(() => null)
  if (!page) notFound()

  return (
    <main className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="text-3xl font-extrabold text-neutral-900 sm:text-4xl">{page.title}</h1>
      {page.updated_at && (
        <p className="mt-2 text-sm text-neutral-400">Last updated {formatDateShort(page.updated_at)}</p>
      )}
      {/* First-party, admin-authored CMS content (legal_pages.content is HTML). */}
      <div
        className="rich-content mt-8"
        dangerouslySetInnerHTML={{ __html: page.content }}
      />
    </main>
  )
}
