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
    <main data-eos-id="web/app/donate/page.tsx#0">
      <PageHeader data-eos-id="web/app/donate/page.tsx#1"
        eyebrow="Donate"
        title="Put young people back into nature"
        subtitle="Co-Exist is a registered charity. Every dollar funds events, equipment and the young people driving real conservation. Give securely in seconds, no account needed."
        image="/images/gather.webp"
      />

      {/* Gift + form */}
      <section data-eos-id="web/app/donate/page.tsx#2" className="mx-auto grid max-w-6xl gap-12 px-6 py-20 md:grid-cols-[1fr_1.05fr] lg:gap-16">
        <div data-eos-id="web/app/donate/page.tsx#3">
          <h2 data-eos-id="web/app/donate/page.tsx#4" className="display-tight text-3xl text-neutral-900 sm:text-4xl">Small gifts, real ground covered</h2>
          <div data-eos-id="web/app/donate/page.tsx#5" className="mt-8 divide-y divide-neutral-200 border-t border-neutral-200">
            {IMPACT.map((i) => (
              <div data-eos-id="web/app/donate/page.tsx#6" key={i.amount} className="flex items-center gap-5 bg-white py-5">
                <span data-eos-id="web/app/donate/page.tsx#7" data-eos-var="i.amount" data-eos-var-label="Amount" data-eos-var-scope="item" className="w-16 shrink-0 font-normal tabular-nums text-2xl text-olive-700">{i.amount}</span>
                <span data-eos-id="web/app/donate/page.tsx#8" data-eos-var="i.blurb" data-eos-var-label="Blurb" data-eos-var-scope="item" className="text-[15px] leading-relaxed text-neutral-600">{i.blurb}</span>
              </div>
            ))}
          </div>
          <div data-eos-id="web/app/donate/page.tsx#9" className="relative mt-6 overflow-hidden bg-olive-800 p-7 text-oncream">
            <div data-eos-id="web/app/donate/page.tsx#10" className="grain-layer absolute inset-0 z-0" />
            <div data-eos-id="web/app/donate/page.tsx#11" className="relative z-10">
              <p data-eos-id="web/app/donate/page.tsx#12" className="text-lg">Why it matters</p>
              <p data-eos-id="web/app/donate/page.tsx#13" className="mt-2 text-[14px] leading-relaxed text-oncream/85">
                Co-Exist exists so young Australians can lead conservation in their own communities.
                Your support is what gets them outside, together, doing work that lasts.
              </p>
            </div>
          </div>
          <div data-eos-id="web/app/donate/page.tsx#14" className="mt-6 border-t border-neutral-200 pt-6">
            <p data-eos-id="web/app/donate/page.tsx#15" className="label text-neutral-400">Donate via deposit</p>
            <p data-eos-id="web/app/donate/page.tsx#16" className="mt-2 text-sm text-neutral-500">Prefer to give by bank transfer? These are our details.</p>
            <dl data-eos-id="web/app/donate/page.tsx#17" className="mt-4 space-y-2 text-sm">
              <div data-eos-id="web/app/donate/page.tsx#18" className="flex gap-4">
                <dt data-eos-id="web/app/donate/page.tsx#19" className="w-20 shrink-0 text-neutral-400">Bank</dt>
                <dd data-eos-id="web/app/donate/page.tsx#20" className="text-neutral-800">Bendigo Bank</dd>
              </div>
              <div data-eos-id="web/app/donate/page.tsx#21" className="flex gap-4">
                <dt data-eos-id="web/app/donate/page.tsx#22" className="w-20 shrink-0 text-neutral-400">BSB</dt>
                <dd data-eos-id="web/app/donate/page.tsx#23" className="tabular-nums text-neutral-800">633 000</dd>
              </div>
              <div data-eos-id="web/app/donate/page.tsx#24" className="flex gap-4">
                <dt data-eos-id="web/app/donate/page.tsx#25" className="w-20 shrink-0 text-neutral-400">Account</dt>
                <dd data-eos-id="web/app/donate/page.tsx#26" className="tabular-nums text-neutral-800">195 774 351</dd>
              </div>
            </dl>
            <p data-eos-id="web/app/donate/page.tsx#27" className="mt-5 text-xs leading-relaxed text-neutral-400">
              Prefer to leave a gift in your will?{' '}
              <a data-eos-href="static" data-eos-id="web/app/donate/page.tsx#28" href="https://gatheredhere.com.au/c/coexistaustralia" target="_blank" rel="noopener noreferrer" className="text-primary-700 hover:text-primary-800">
                Make a bequest
              </a>
              . ACNC registered charity, ABN 39 660 776 983. Donations over $2 are tax deductible.
            </p>
          </div>
        </div>

        <div data-eos-id="web/app/donate/page.tsx#29" className="md:sticky md:top-28 md:self-start">
          <DonateForm data-eos-id="web/app/donate/page.tsx#30" />
        </div>
      </section>

      {/* Supporter voices - with real faces from the live donate page */}
      <section data-eos-id="web/app/donate/page.tsx#31" className="relative isolate overflow-hidden bg-olive-800 text-oncream">
        <div data-eos-id="web/app/donate/page.tsx#32" className="grain-layer absolute inset-0 z-0" />
        <div data-eos-id="web/app/donate/page.tsx#33" className="relative z-10 mx-auto max-w-6xl px-6 py-24">
          <h2 data-eos-id="web/app/donate/page.tsx#34" className="display-tight text-center text-3xl text-oncream sm:text-4xl">Why people give</h2>
          <div data-eos-id="web/app/donate/page.tsx#35" className="mt-14 grid gap-8 md:grid-cols-3">
            {[
              { quote: 'Your support helps young people lead real change.', photo: '/images/donors/d1.jpg' },
              { quote: 'Thanks to Co-Exist, I found my people, and my voice.', photo: '/images/donors/d2.jpg' },
              { quote: 'We are building a movement that lasts. Your support makes it real.', photo: '/images/donors/d3.jpg' },
            ].map((t, i) => (
              <Reveal data-eos-id="web/app/donate/page.tsx#36" key={t.quote} delay={i * 110} className="flex flex-col items-start text-left">
                <div data-eos-id="web/app/donate/page.tsx#37" className="relative aspect-[4/5] w-full overflow-hidden">
                  <div data-eos-id="web/app/donate/page.tsx#38" className="absolute inset-0 z-10 bg-olive-800/30" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img data-eos-id="web/app/donate/page.tsx#39" src={t.photo} alt="" className="h-full w-full object-cover" />
                </div>
                <blockquote data-eos-id="web/app/donate/page.tsx#40" data-eos-var="t.quote" data-eos-var-label="Quote" data-eos-var-scope="item" className="mt-5 text-xl font-light leading-snug text-oncream">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Bequest / leave a legacy */}
      <section data-eos-id="web/app/donate/page.tsx#41" className="bg-white">
        <div data-eos-id="web/app/donate/page.tsx#42" className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 md:grid-cols-2">
          <Reveal data-eos-id="web/app/donate/page.tsx#43">
            <h2 data-eos-id="web/app/donate/page.tsx#44" className="display-tight text-4xl text-neutral-900 sm:text-5xl">Leave the world in safe hands</h2>
          </Reveal>
          <Reveal data-eos-id="web/app/donate/page.tsx#45" delay={120}>
            <p data-eos-id="web/app/donate/page.tsx#46" className="text-[15px] leading-relaxed text-neutral-600">
              A bequest is a vote of confidence in our young people. You can make a lasting difference
              by amplifying young voices, supporting wellbeing, and equipping young leaders in
              conservation with the tools they need to protect the planet.
            </p>
            <a data-eos-href="static" data-eos-id="web/app/donate/page.tsx#47"
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
