import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Thank you', robots: { index: false } }

export default function ShopThankYouPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
      <p className="eyebrow text-primary-600">Order confirmed</p>
      <h1 className="mt-4 text-5xl text-neutral-900 sm:text-6xl">Thank you</h1>
      <p className="mt-5 text-[15px] leading-relaxed text-neutral-500">
        Your order is in and a receipt is on its way to your email. Thank you for backing young
        people leading conservation across Australia.
      </p>
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <Link href="/shop" className="rounded-full bg-olive-700 px-7 py-3 text-[13px] font-semibold uppercase tracking-wider text-white hover:bg-olive-800">
          Keep shopping
        </Link>
        <Link href="/" className="rounded-full border border-neutral-300 px-7 py-3 text-[13px] font-semibold uppercase tracking-wider text-neutral-800 hover:bg-neutral-50">
          Back home
        </Link>
      </div>
    </main>
  )
}
