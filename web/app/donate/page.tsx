import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { DonateForm } from '@/components/donate-form'

export const metadata: Metadata = {
  title: 'Donate',
  description:
    'Support Co-Exist Australia. Donate securely in seconds, no account needed. Your gift puts young people back into nature and funds local conservation. ACNC registered charity.',
}

const IMPACT = [
  { amount: '$25', blurb: 'Equipment for a volunteer on a conservation day.' },
  { amount: '$50', blurb: 'Native plants in the ground at a local planting.' },
  { amount: '$100', blurb: 'Helps a collective run its next event.' },
]

export default function DonatePage() {
  return (
    <main>
      <PageHeader
        eyebrow="Support us"
        title="Put young people back into nature"
        subtitle="Co-Exist is a registered charity. Every dollar funds events, equipment and the local communities driving real conservation. Give securely in seconds, no account needed."
      />

      <section className="mx-auto grid max-w-5xl gap-12 px-6 py-16 md:grid-cols-[1fr_1.1fr]">
        <div>
          <h2 className="text-3xl text-neutral-900">Where your gift goes</h2>
          <ul className="mt-6 space-y-5">
            {IMPACT.map((i) => (
              <li key={i.amount} className="flex gap-4">
                <span className="text-2xl font-bold text-olive-700">{i.amount}</span>
                <span className="text-neutral-600">{i.blurb}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 rounded-3xl bg-olive-800 p-6 text-oncream">
            <p className="text-xl font-bold">Why it matters</p>
            <p className="mt-2 text-sm leading-relaxed text-oncream/85">
              Co-Exist exists so young Australians can lead conservation in their own
              communities. Your support is what gets them outside, together, doing work that
              lasts.
            </p>
          </div>
          <p className="mt-6 text-sm text-neutral-500">
            ACNC registered charity. ABN 39 660 776 983. For partnership or major-gift
            conversations,{' '}
            <a href="/contact" className="font-semibold text-primary-700 hover:text-primary-800">
              get in touch
            </a>
            .
          </p>
        </div>

        <DonateForm />
      </section>
    </main>
  )
}
