import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getProduct } from '@/lib/queries'
import { BuyButton } from '@/components/buy-button'

export const revalidate = 900

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  const p = await getProduct(slug).catch(() => null)
  if (!p) return { title: 'Shop' }
  return {
    title: p.name,
    description: p.description?.slice(0, 155) ?? `${p.name} from Co-Exist Australia.`,
    openGraph: p.images[0] ? { images: [p.images[0]] } : undefined,
  }
}

export default async function ProductPage({ params }: Params) {
  const { slug } = await params
  const p = await getProduct(slug).catch(() => null)
  if (!p) notFound()

  const cents = p.base_price_cents ?? (p.price != null ? Math.round(p.price * 100) : 0)
  const price = `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`

  return (
    <main className="mx-auto max-w-6xl px-6 pt-32 pb-20">
      <Link href="/shop" className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-700 hover:text-primary-900">
        ← Shop
      </Link>

      <div className="mt-6 grid gap-12 md:grid-cols-2">
        <div className="space-y-4">
          {(p.images.length ? p.images : ['']).map((img, i) =>
            img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={img} alt={`${p.name} ${i + 1}`} className="w-full bg-neutral-100 object-cover" />
            ) : (
              <div key={i} className="flex aspect-[4/5] items-center justify-center bg-neutral-100 text-primary-300">Co-Exist</div>
            ),
          )}
        </div>

        <div className="md:sticky md:top-28 md:self-start">
          {p.category && <p className="eyebrow text-primary-600">{p.category}</p>}
          <h1 className="mt-3 text-4xl text-neutral-900 sm:text-5xl">{p.name}</h1>
          <p className="mt-3 text-2xl text-neutral-500">{price}</p>

          <BuyButton productId={p.id} variants={p.variants} />

          {p.description && (
            <div className="mt-10 whitespace-pre-line border-t border-neutral-200 pt-8 text-[15px] leading-relaxed text-neutral-600">
              {p.description}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
