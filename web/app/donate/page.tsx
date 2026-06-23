import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { DonateForm } from '@/components/donate-form'
import { Reveal } from '@/components/reveal'

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
        eyebrow="Donate"
        title="Put young people back into nature"
        subtitle="Co-Exist is a registered charity. Every dollar funds events, equipment and the young people driving real conservation. Give securely in seconds, no account needed."
        image="/images/gather.webp"
      />

      {/* Gift + form */}
      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-[1fr_1.05fr] lg:gap-16">
        <div>
          <p className="eyebrow text-primary-600">Where your gift goes</p>
          <h2 className="mt-3 text-3xl text-neutral-900 sm:text-4xl">Small gifts, real ground covered</h2>
          <div className="mt-8 space-y-px overflow-hidden rounded-3xl border border-neutral-200">
            {IMPACT.map((i) => (
              <div key={i.amount} className="flex items-center gap-5 bg-white px-6 py-5">
                <span className="w-16 shrink-0 text-2xl text-olive-700">{i.amount}</span>
                <span className="text-[15px] leading-relaxed text-neutral-600">{i.blurb}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-3xl bg-olive-800 p-7 text-oncream">
            <p className="text-lg">Why it matters</p>
            <p className="mt-2 text-[14px] leading-relaxed text-oncream/85">
              Co-Exist exists so young Australians can lead conservation in their own communities.
              Your support is what gets them outside, together, doing work that lasts.
            </p>
          </div>
          <p className="mt-6 text-sm leading-relaxed text-neutral-500">
            Prefer to give by bank transfer, or leave a gift in your will?{' '}
            <a href="/contact" className="font-semibold text-primary-700 hover:text-primary-800">
              Get in touch
            </a>{' '}
            and we will sort it out. ACNC registered charity, ABN 39 660 776 983. Donations over $2 are tax deductible.
          </p>
        </div>

        <DonateForm />
      </section>

      {/* Supporter voices */}
      <section className="relative isolate overflow-hidden bg-olive-800 text-oncream">
        <div className="grain-layer absolute inset-0 z-0" />
        <div className="relative z-10 mx-auto max-w-6xl px-6 py-24">
          <p className="eyebrow text-center text-sage">Why people give</p>
          <div className="mt-12 grid gap-10 md:grid-cols-3">
            {[
              'Your support helps young people lead real change.',
              'Thanks to Co-Exist, I found my people, and my voice.',
              'We are building a movement that lasts. Your support makes it real.',
            ].map((quote, i) => (
              <Reveal key={quote} delay={i * 90}>
                <blockquote className="text-2xl font-light leading-snug text-oncream">
                  &ldquo;{quote}&rdquo;
                </blockquote>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Bequest / leave a legacy */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 md:grid-cols-2">
          <Reveal>
            <p className="eyebrow text-primary-600">Leave a legacy</p>
            <h2 className="mt-3 text-4xl text-neutral-900 sm:text-5xl">Leave the world in safe hands</h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="text-[15px] leading-relaxed text-neutral-600">
              A bequest is a vote of confidence in our young people. You can make a lasting difference
              by amplifying young voices, supporting wellbeing, and equipping young leaders in
              conservation with the tools they need to protect the planet.
            </p>
            <a
              href="https://gatheredhere.com.au/c/coexistaustralia"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-7 inline-block rounded-full bg-olive-700 px-8 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-white transition-all duration-300 hover:bg-olive-800 hover:px-10"
            >
              Leave a legacy
            </a>
          </Reveal>
        </div>
      </section>
    </main>
  )
}
