import Link from 'next/link'
import type { Metadata } from 'next'
import { getProducts, type ProductVM } from '@/lib/queries'
import { PageHeader } from '@/components/page-header'
import { bentoFeatured, bentoLastFill } from '@/lib/bento'

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

  return (
    <main>
      <PageHeader
        eyebrow="Shop"
        title="Wear what you stand for"
        subtitle="Natural, durable Co-Exist gear. Every purchase puts young people back into nature. Checkout in seconds, no account needed."
        image="/images/collective.webp"
      />

      <section>
        {products.length === 0 ? (
          <p className="mx-auto max-w-6xl px-6 py-16 text-center text-neutral-500">Our shop is restocking. Check back soon.</p>
        ) : (
          <div className="grid auto-rows-[46vw] grid-cols-2 sm:auto-rows-[15rem] sm:grid-cols-4">
            {products.map((p, i) => {
              const hover = p.images[1]
              return (
                <Link
                  key={p.id}
                  href={`/shop/${p.slug}`}
                  className={`group relative isolate overflow-hidden bg-neutral-200 ${bentoFeatured(i)} ${bentoLastFill(products.length, i)}`}
                >
                  {p.images[0] ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.images[0]} alt={p.name} loading="lazy" className={`absolute inset-0 -z-10 h-full w-full object-cover transition-all duration-700 ${hover ? 'group-hover:opacity-0' : 'group-hover:scale-105'}`} />
                      {hover && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={hover} alt="" aria-hidden loading="lazy" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-0 transition-opacity duration-700 group-hover:opacity-100" />
                      )}
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center text-primary-300">Co-Exist</div>
                  )}
                  <div className="absolute inset-0 -z-10 bg-gradient-to-t from-olive-950/80 via-olive-950/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
                    <h2 className={`leading-[1.05] text-oncream ${i === 0 ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>{p.name}</h2>
                    <span className="shrink-0 text-sm text-oncream/85">{price(p)}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
