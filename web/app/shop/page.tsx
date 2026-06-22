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

function priceLabel(p: ProductVM): string {
  const cents = p.base_price_cents ?? (p.price != null ? Math.round(p.price * 100) : 0)
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`
}

export default async function ShopPage() {
  let products: ProductVM[] = []
  try {
    products = await getProducts()
  } catch {
    products = []
  }

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
          <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <Link key={p.id} href={`/shop/${p.slug}`} className="group">
                <div className="relative aspect-[4/5] overflow-hidden bg-neutral-100">
                  {p.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.images[0]} alt={p.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-primary-300">Co-Exist</div>
                  )}
                </div>
                <div className="mt-4 flex items-baseline justify-between gap-3">
                  <h2 className="text-lg text-neutral-900">{p.name}</h2>
                  <span className="shrink-0 text-lg text-neutral-500">{priceLabel(p)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
