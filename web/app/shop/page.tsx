import type { Metadata } from 'next'
import { getProducts, type ProductVM } from '@/lib/queries'
import { PageHeader } from '@/components/page-header'
import { BentoTile } from '@/components/bento-tile'
import { bentoSpans, BENTO_GRID } from '@/lib/bento'

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

export default async function ShopPage() {
  let products: ProductVM[] = []
  try {
    products = await getProducts()
  } catch {
    products = []
  }

  const spans = bentoSpans(products.length)

  return (
    <main>
      <PageHeader
        eyebrow="Shop"
        title="Merch"
        subtitle="Natural, durable Co-Exist gear. Every purchase puts young people back into nature. Checkout in seconds, no account needed."
        image="/images/collective.webp"
      />

      <section>
        {products.length === 0 ? (
          <p className="mx-auto max-w-6xl px-6 py-16 text-center text-neutral-500">Our shop is restocking. Check back soon.</p>
        ) : (
          <div className={BENTO_GRID}>
            {products.map((p, i) => (
              <BentoTile
                key={p.id}
                href={`/shop/${p.slug}`}
                image={p.images[0]}
                hoverImage={p.images[1]}
                alt={p.name}
                span={spans[i]}
                tint={false}
              >
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
                  <h2 className={`uppercase leading-[0.98] tracking-[-0.02em] text-oncream ${spans[i].includes('row-span-2') ? 'text-2xl sm:text-3xl' : 'text-base'}`}>{p.name}</h2>
                  <span className="shrink-0 text-sm text-oncream/90">{price(p)}</span>
                </div>
              </BentoTile>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
