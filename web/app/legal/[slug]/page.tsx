import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getLegalPage, getLegalSlugs } from '@/lib/queries'
import { formatDateShort } from '@/lib/format'
import { PageHeader } from '@/components/page-header'

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
    <main data-eos-id="web/app/legal/[slug]/page.tsx#0">
      <PageHeader data-eos-id="web/app/legal/[slug]/page.tsx#1" title={page.title} />
      <section data-eos-id="web/app/legal/[slug]/page.tsx#2" className="mx-auto max-w-2xl px-6 pt-12 pb-24">
        {page.updated_at && (
          <p data-eos-id="web/app/legal/[slug]/page.tsx#3" data-eos-var="page.updated_at" data-eos-var-label="Updated at" data-eos-var-scope="prop" className="label text-neutral-400">Last updated {formatDateShort(page.updated_at)}</p>
        )}
        <div data-eos-id="web/app/legal/[slug]/page.tsx#4" className="mt-6 border-t border-neutral-200" />
        {/* First-party, admin-authored CMS content (legal_pages.content is HTML). */}
        <div data-eos-id="web/app/legal/[slug]/page.tsx#5"
          className="rich-content mt-8 text-[17px] text-neutral-800 [&_h2]:mt-10 [&_h2]:border-t [&_h2]:border-neutral-200 [&_h2]:pt-6 [&_a]:text-olive-800 [&_a]:underline [&_a]:underline-offset-4 [&_a]:decoration-olive-700/40 hover:[&_a]:decoration-olive-800"
          dangerouslySetInnerHTML={{ __html: page.content }}
        />
      </section>
    </main>
  )
}
