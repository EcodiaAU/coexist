import Link from 'next/link'
import type { Metadata } from 'next'
import { getProducts, type ProductVM } from '@/lib/queries'
import { PageHeader } from '@/components/page-header'

export const revalidate = 900

export const metadata: Metadata = {
  title: 'Shop',
  description:
    'Co-Exist Australia merch. Totes, tees and more in natural, durable materials. Every purchase supports young people leading conservation. No account needed.',
}

function price(p: ProductVM): string {
  const c = p.base_price_cents ?? (p.price != null ? Math.round(p.price * 100) : 0)
  return `$${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`
}

function ProductCard({ p, big = false }: { p: ProductVM; big?: boolean }) {
  const hover = p.images[1]
  return (
    <Link href={`/shop/${p.slug}`} className="group block">
      <div className={`relative overflow-hidden bg-neutral-100 ${big ? 'aspect-[4/3]' : 'aspect-[4/5]'}`}>
        {p.images[0] ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.images[0]} alt={p.name} loading="lazy" className={`absolute inset-0 h-full w-full object-cover transition-all duration-700 ${hover ? 'group-hover:opacity-0' : 'group-hover:scale-105'}`} />
            {hover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hover} alt="" aria-hidden loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-700 group-hover:opacity-100" />
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-primary-300">Co-Exist</div>
        )}
        <span className="absolute right-4 top-4 rounded-full bg-cream/90 px-3 py-1 text-xs font-bold text-olive-900 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          View →
        </span>
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-3">
        <h2 className={`text-neutral-900 ${big ? 'text-2xl' : 'text-lg'}`}>{p.name}</h2>
        <span className="shrink-0 text-neutral-500">{price(p)}</span>
      </div>
    </Link>
  )
}

export default async function ShopPage() {
  let products: ProductVM[] = []
  try {
    products = await getProducts()
  } catch {
    products = []
  }
  const [featured, ...rest] = products

  return (
    <main>
      <PageHeader
        eyebrow="Shop"
        title="Wear what you stand for"
        subtitle="Natural, durable Co-Exist gear. Every purchase puts young people back into nature. Checkout in seconds, no account needed."
        image="/images/collective.webp"
      />

      <section className="mx-auto max-w-6xl px-6 py-16">
        {products.length === 0 ? (
          <p className="py-16 text-center text-neutral-500">Our shop is restocking. Check back soon.</p>
        ) : (
          <>
            {featured && (
              <div className="mb-16 grid items-center gap-10 md:grid-cols-2">
                <Link href={`/shop/${featured.slug}`} className="group relative aspect-[4/3] overflow-hidden bg-neutral-100">
                  {featured.images[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={featured.images[0]} alt={featured.name} className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1.2s] group-hover:scale-105" />
                  )}
                </Link>
                <div>
                  <p className="eyebrow text-primary-600">Featured</p>
                  <h2 className="mt-4 text-4xl text-neutral-900 sm:text-5xl">{featured.name}</h2>
                  <p className="mt-2 text-xl text-neutral-500">{price(featured)}</p>
                  {featured.description && (
                    <p className="mt-5 line-clamp-3 max-w-md text-[15px] leading-relaxed text-neutral-500">{featured.description}</p>
                  )}
                  <Link href={`/shop/${featured.slug}`} className="mt-7 inline-block rounded-full bg-olive-700 px-8 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-white transition-all duration-300 hover:px-10">
                    Shop this
                  </Link>
                </div>
              </div>
            )}

            {rest.length > 0 && (
              <div className="grid gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((p) => (
                  <ProductCard key={p.id} p={p} />
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}
