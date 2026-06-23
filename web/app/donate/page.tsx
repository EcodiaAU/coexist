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
          <h2 className="display-tight text-3xl text-neutral-900 sm:text-4xl">Small gifts, real ground covered</h2>
          <div className="mt-8 divide-y divide-neutral-200 border-t border-neutral-200">
            {IMPACT.map((i) => (
              <div key={i.amount} className="flex items-center gap-5 bg-white py-5">
                <span className="w-16 shrink-0 font-normal tabular-nums text-2xl text-olive-700">{i.amount}</span>
                <span className="text-[15px] leading-relaxed text-neutral-600">{i.blurb}</span>
              </div>
            ))}
          </div>
          <div className="relative mt-6 overflow-hidden bg-olive-800 p-7 text-oncream">
            <div className="grain-layer absolute inset-0 z-0" />
            <div className="relative z-10">
              <p className="text-lg">Why it matters</p>
              <p className="mt-2 text-[14px] leading-relaxed text-oncream/85">
                Co-Exist exists so young Australians can lead conservation in their own communities.
                Your support is what gets them outside, together, doing work that lasts.
              </p>
            </div>
          </div>
          <div className="mt-6 border-t border-neutral-200 pt-6">
            <p className="label text-neutral-400">Donate via deposit</p>
            <p className="mt-2 text-sm text-neutral-500">Prefer to give by bank transfer? These are our details.</p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex gap-4">
                <dt className="w-20 shrink-0 text-neutral-400">Bank</dt>
                <dd className="text-neutral-800">Bendigo Bank</dd>
              </div>
              <div className="flex gap-4">
                <dt className="w-20 shrink-0 text-neutral-400">BSB</dt>
                <dd className="tabular-nums text-neutral-800">633 000</dd>
              </div>
              <div className="flex gap-4">
                <dt className="w-20 shrink-0 text-neutral-400">Account</dt>
                <dd className="tabular-nums text-neutral-800">195 774 351</dd>
              </div>
            </dl>
            <p className="mt-5 text-xs leading-relaxed text-neutral-400">
              Prefer to leave a gift in your will?{' '}
              <a href="https://gatheredhere.com.au/c/coexistaustralia" target="_blank" rel="noopener noreferrer" className="text-primary-700 hover:text-primary-800">
                Make a bequest
              </a>
              . ACNC registered charity, ABN 39 660 776 983. Donations over $2 are tax deductible.
            </p>
          </div>
        </div>

        <div className="md:sticky md:top-28 md:self-start">
          <DonateForm />
        </div>
      </section>

      {/* Supporter voices - with real faces from the live donate page */}
      <section className="relative isolate overflow-hidden bg-olive-800 text-oncream">
        <div className="grain-layer absolute inset-0 z-0" />
        <div className="relative z-10 mx-auto max-w-6xl px-6 py-24">
          <h2 className="display-tight text-center text-3xl text-oncream sm:text-4xl">Why people give</h2>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {[
              { quote: 'Your support helps young people lead real change.', photo: '/images/donors/d1.jpg' },
              { quote: 'Thanks to Co-Exist, I found my people, and my voice.', photo: '/images/donors/d2.jpg' },
              { quote: 'We are building a movement that lasts. Your support makes it real.', photo: '/images/donors/d3.jpg' },
            ].map((t, i) => (
              <Reveal key={t.quote} delay={i * 110} className="flex flex-col items-start text-left">
                <div className="relative aspect-[4/5] w-full overflow-hidden">
                  <div className="absolute inset-0 z-10 bg-olive-800/30" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.photo} alt="" className="h-full w-full object-cover" />
                </div>
                <blockquote className="mt-5 text-xl font-light leading-snug text-oncream">
                  &ldquo;{t.quote}&rdquo;
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
            <h2 className="display-tight text-4xl text-neutral-900 sm:text-5xl">Leave the world in safe hands</h2>
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
              className="mt-7 inline-block bg-olive-700 px-8 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-white transition-colors duration-300 hover:bg-olive-800"
            >
              Leave a legacy
            </a>
          </Reveal>
        </div>
      </section>
    </main>
  )
}
