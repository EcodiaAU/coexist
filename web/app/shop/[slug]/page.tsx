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

  const [heroImg, ...restImgs] = p.images.length ? p.images : ['']

  return (
    <main className="mx-auto max-w-6xl px-6 pt-32 pb-20">
      <Link href="/shop" className="inline-flex items-center gap-1.5 text-xs font-normal uppercase tracking-[0.18em] text-primary-700 hover:text-primary-900">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Shop
      </Link>

      <div className="mt-6 grid gap-12 md:grid-cols-2">
        {/* Cinematic image gallery */}
        <div>
          {heroImg ? (
            <div className="relative isolate aspect-[4/5] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={heroImg} alt={`${p.name} 1`} className="absolute inset-0 h-full w-full object-cover" />
              {/* olive film tint */}
              <div className="absolute inset-0 bg-olive-900/30 mix-blend-multiply" />
              {/* grain */}
              <div className="grain-layer" />
              {/* bottom flat-black gradient */}
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />
            </div>
          ) : (
            <div className="flex aspect-[4/5] items-center justify-center bg-neutral-100 text-primary-300">Co-Exist</div>
          )}

          {restImgs.length > 0 && (
            <div className="grid grid-cols-2 gap-0">
              {restImgs.map((img, i) =>
                img ? (
                  <div key={i} className="relative isolate aspect-square overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt={`${p.name} ${i + 2}`} className="absolute inset-0 h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-olive-900/30 mix-blend-multiply" />
                    <div className="grain-layer" />
                  </div>
                ) : null,
              )}
            </div>
          )}
        </div>

        <div className="md:sticky md:top-28 md:self-start">
          {p.category && <p className="label text-primary-600">{p.category}</p>}
          <h1 className="display-tight mt-3 text-5xl font-normal text-neutral-900 sm:text-6xl">{p.name}</h1>
          <p className="mt-3 text-xl text-neutral-700">{price}</p>

          <div className="mt-6 border-t border-neutral-200" />
          <BuyButton productId={p.id} variants={p.variants} />

          {p.description && (
            <div className="mt-10 max-w-prose whitespace-pre-line border-t border-neutral-200 pt-8 text-[15px] leading-relaxed text-neutral-600">
              {p.description}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
