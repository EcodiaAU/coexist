import Link from 'next/link'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { StoreBadges } from '@/components/store-badges'
import { Reveal } from '@/components/reveal'

export const revalidate = 1800

export const metadata: Metadata = {
  title: 'Download the app',
  description:
    'Get the Co-Exist app on iPhone and Android. Find conservation events near you, join your local collective, and track your impact. Free, forever.',
}

const WEB_URL = 'https://app.coexistaus.org'

// Current App Store listing screenshots (app version 2.0.2, de-cartoonified),
// served from Apple's mzstatic CDN.
const SHOTS = [
  {
    src: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/71/4a/33/714a33cd-1cdd-037b-f2be-7710a64002ec/Simulator_Screenshot_-_iPhone_17_Pro_-_2026-04-22_at_14.29.01.png/590x1277bb.jpg',
    caption: 'Find a collective near you',
  },
  {
    src: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/f7/01/c4/f701c452-e526-0ff1-d4e3-290df5b38319/Simulator_Screenshot_-_iPhone_17_Pro_-_2026-04-22_at_14.28.17.png/590x1277bb.jpg',
    caption: 'Track your impact',
  },
  {
    src: 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource211/v4/cc/b1/38/ccb138ab-71fb-20f2-07ec-254d1368b492/Simulator_Screenshot_-_iPhone_17_Pro_-_2026-04-22_at_14.29.26.png/590x1277bb.jpg',
    caption: 'Gear up and support',
  },
]

const DO = [
  { title: 'Join events', body: 'Find conservation events near you and register in a tap. Tree plantings, beach cleans, habitat days.' },
  { title: 'Find your people', body: 'Connect with your local collective, make friends, and show up together for the places you love.' },
  { title: 'Track your impact', body: 'Watch your trees planted, litter removed, and hours volunteered add up over time.' },
]

export default function DownloadPage() {
  return (
    <main data-eos-id="web/app/get-involved/download/page.tsx#0" data-eos-v="2">
      <PageHeader data-eos-id="web/app/get-involved/download/page.tsx#1"
        eyebrow="Get involved"
        title="Get the app"
        subtitle="Join thousands of young Australians restoring habitat, one weekend at a time. Free, forever."
        image="/images/hero.webp"
      />

      {/* Store badges + web fallback */}
      <section data-eos-id="web/app/get-involved/download/page.tsx#2" className="bg-white">
        <div data-eos-id="web/app/get-involved/download/page.tsx#3" className="mx-auto max-w-3xl px-6 py-16 text-center">
          <StoreBadges data-eos-id="web/app/get-involved/download/page.tsx#4" className="justify-center" />
          <p data-eos-id="web/app/get-involved/download/page.tsx#5" className="mt-4 text-[12px] uppercase tracking-[0.14em] text-neutral-400">iOS and Android · Ages 18 to 30</p>
          <Link data-eos-href="dynamic" data-eos-href-label="Web url" data-eos-href-scope="prop" data-eos-id="web/app/get-involved/download/page.tsx#6" href={WEB_URL} className="mt-6 inline-block text-sm text-primary-700 underline underline-offset-4 transition-colors hover:text-primary-900">
            Or continue on the web
          </Link>
        </div>
      </section>

      {/* Phone screenshots */}
      <section data-eos-id="web/app/get-involved/download/page.tsx#7" className="bg-white">
        <div data-eos-id="web/app/get-involved/download/page.tsx#8" className="mx-auto flex max-w-5xl flex-wrap justify-center gap-8 px-6 pb-8">
          {SHOTS.map((s) => (
            <Reveal data-eos-id="web/app/get-involved/download/page.tsx#9" key={s.caption} className="w-56">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img data-eos-src="literal" data-eos-src-label="Src" data-eos-src-binding="src" data-eos-id="web/app/get-involved/download/page.tsx#10" src={s.src} alt={s.caption} loading="lazy" className="w-full rounded-3xl border border-neutral-200 shadow-[0_18px_42px_rgba(71,79,47,0.18)]" />
              <p data-eos-id="web/app/get-involved/download/page.tsx#11" data-eos-var="s.caption" data-eos-var-label="Caption" data-eos-var-scope="item" data-eos-var-src="literal" className="mt-4 text-center text-sm font-medium text-neutral-600">{s.caption}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* What you can do */}
      <section data-eos-id="web/app/get-involved/download/page.tsx#12" className="bg-white">
        <div data-eos-id="web/app/get-involved/download/page.tsx#13" className="mx-auto max-w-6xl px-6 py-20 text-center">
          <p data-eos-id="web/app/get-involved/download/page.tsx#14" className="eyebrow text-primary-600">Everything in one place</p>
          <h2 data-eos-id="web/app/get-involved/download/page.tsx#15" className="mt-3 text-4xl text-neutral-900 sm:text-5xl">What you can do</h2>
          <div data-eos-id="web/app/get-involved/download/page.tsx#16" className="mt-12 grid gap-6 text-left sm:grid-cols-3">
            {DO.map((d) => (
              <Reveal data-eos-id="web/app/get-involved/download/page.tsx#17" key={d.title} className="rounded-2xl border border-neutral-200 bg-white p-7 shadow-[0_8px_26px_rgba(71,79,47,0.06)]">
                <h3 data-eos-id="web/app/get-involved/download/page.tsx#18" data-eos-var="d.title" data-eos-var-label="Title" data-eos-var-scope="item" data-eos-var-src="literal" className="text-lg font-semibold text-neutral-900">{d.title}</h3>
                <p data-eos-id="web/app/get-involved/download/page.tsx#19" data-eos-var="d.body" data-eos-var-label="Body" data-eos-var-scope="item" data-eos-var-src="literal" className="mt-3 text-[15px] leading-relaxed text-neutral-600">{d.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section data-eos-id="web/app/get-involved/download/page.tsx#20" className="bg-olive-800 text-oncream">
        <div data-eos-id="web/app/get-involved/download/page.tsx#21" className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 data-eos-id="web/app/get-involved/download/page.tsx#22" className="display-tight text-[2.4rem] text-oncream sm:text-5xl">Ready to begin?</h2>
          <p data-eos-id="web/app/get-involved/download/page.tsx#23" className="mx-auto mt-5 max-w-md text-[15px] text-oncream/80">
            Download Co-Exist and join your nearest collective today.
          </p>
          <StoreBadges data-eos-id="web/app/get-involved/download/page.tsx#24" className="mt-8 justify-center" />
        </div>
      </section>
    </main>
  )
}
