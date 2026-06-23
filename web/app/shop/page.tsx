import type { Metadata } from 'next'
import { getProducts, type ProductVM } from '@/lib/queries'
import { ParallaxImage } from '@/components/parallax-image'
import { BentoTile } from '@/components/bento-tile'
import { bentoSpans, BENTO_GRID } from '@/lib/bento'
import { BLUR } from '@/lib/blur'

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
      {/* Hero: centred title over the image (matches PageHeader) */}
      <section className="film-cover relative isolate flex min-h-[72vh] items-center justify-center overflow-hidden lg:min-h-[82vh]">
        <ParallaxImage
          src="/images/collective.webp"
          priority
          blurDataURL={BLUR['/images/collective.webp']}
          className="object-[50%_75%]"
        />
        <div className="grain-layer absolute inset-0 z-0" />
        <div className="relative z-10 mx-auto w-full max-w-3xl px-6 py-32 text-center">
          <h1
            className="display-tight mx-auto mt-4 max-w-4xl text-[3.25rem] leading-[0.92] text-oncream sm:text-7xl"
            style={{ textShadow: '0 1px 8px rgba(0,0,0,0.45)' }}
          >
            Merch
          </h1>
          <p
            className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-oncream/85"
            style={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}
          >
            Natural, durable Co-Exist gear. Every purchase puts young people back into nature. Checkout in seconds, no account needed.
          </p>
        </div>
      </section>

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
                {/* Price: quiet top-right tag */}
                <span className="absolute right-4 top-4 z-10 tabular-nums text-[11px] tracking-[0.14em] uppercase text-oncream/80">
                  {price(p)}
                </span>
                {/* Name: bottom-left, tighter on small tiles */}
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <h2 className={`uppercase leading-[0.98] tracking-[-0.02em] text-oncream ${spans[i].includes('row-span-2') ? 'text-2xl sm:text-3xl' : 'text-sm leading-tight'}`}>{p.name}</h2>
                </div>
              </BentoTile>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
