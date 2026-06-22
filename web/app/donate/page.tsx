import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { APP_URL } from '@/lib/env'

export const metadata: Metadata = {
  title: 'Donate',
  description:
    'Support Co-Exist Australia. Your donation puts young people back into nature and funds local conservation across the country. ACNC registered charity.',
}

const TIERS = [
  { amount: 25, blurb: 'Equipment for a volunteer on a conservation day.' },
  { amount: 50, blurb: 'Native plants in the ground at a local planting.' },
  { amount: 100, blurb: 'Helps a collective run its next event.' },
]

function donateHref(amount?: number, frequency: 'one_time' | 'monthly' = 'one_time') {
  const u = new URL(`${APP_URL}/donate`)
  if (amount) u.searchParams.set('amount', String(amount))
  u.searchParams.set('frequency', frequency)
  return u.toString()
}

export default function DonatePage() {
  return (
    <main>
      <PageHeader
        eyebrow="Support us"
        title="Put young people back into nature"
        subtitle="Co-Exist is a registered charity. Every dollar funds events, equipment and the local communities driving real conservation."
      />

      <section className="mx-auto max-w-5xl px-5 py-14">
        <div className="grid gap-5 sm:grid-cols-3">
          {TIERS.map((t) => (
            <div key={t.amount} className="flex flex-col rounded-3xl border border-neutral-100 bg-white p-7 text-center shadow-sm">
              <div className="text-4xl font-extrabold text-neutral-900">${t.amount}</div>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-neutral-600">{t.blurb}</p>
              <a
                href={donateHref(t.amount)}
                className="mt-5 rounded-full bg-olive-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-olive-800"
              >
                Give ${t.amount}
              </a>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href={donateHref(undefined, 'one_time')}
            className="rounded-full border border-neutral-200 px-6 py-3 text-sm font-bold text-neutral-800 hover:bg-neutral-50"
          >
            Choose your own amount
          </a>
          <a
            href={donateHref(undefined, 'monthly')}
            className="rounded-full border border-neutral-200 px-6 py-3 text-sm font-bold text-neutral-800 hover:bg-neutral-50"
          >
            Give monthly
          </a>
        </div>

        <p className="mt-6 text-center text-sm text-neutral-500">
          Donations are processed securely in the Co-Exist app. You can give as a guest or sign in.
        </p>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <div className="rounded-3xl border border-neutral-100 bg-surface-1 p-7">
            <h2 className="text-lg font-bold text-neutral-900">Why it matters</h2>
            <p className="mt-3 leading-relaxed text-neutral-600">
              Co-Exist exists so young Australians can lead conservation in their own
              communities. Your support is what gets them outside, together, doing
              work that lasts.
            </p>
          </div>
          <div className="rounded-3xl border border-neutral-100 bg-surface-1 p-7">
            <h2 className="text-lg font-bold text-neutral-900">Registered charity</h2>
            <p className="mt-3 leading-relaxed text-neutral-600">
              Co-Exist Australia Ltd is an ACNC registered charity. ABN 39 660 776 983.
              For partnership or major-gift conversations, please{' '}
              <a href="/contact" className="font-semibold text-primary-700 hover:text-primary-800">
                get in touch
              </a>
              .
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
