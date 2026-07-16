import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { Reveal } from '@/components/reveal'
import { WordSwap } from '@/components/word-swap'
import { APP_URL } from '@/lib/env'
import { BLUR } from '@/lib/blur'

export const metadata: Metadata = {
  title: 'Join our team',
  description:
    'Lead a collective, volunteer your skills, or help run Co-Exist behind the scenes. Co-Exist is built by young people who decided to do something. There is room for you.',
}

const ROLES = [
  {
    title: 'Lead a collective',
    body: 'Start and run a local group in your area. We give you the playbook, the training and a community of leaders behind you, so you are never doing it alone.',
    href: `${APP_URL}/lead-a-collective`,
    cta: 'Start a collective',
    external: true,
  },
  {
    title: 'Volunteer your skills',
    body: 'Photography, social, design, event support, fundraising. If you have a skill and a few hours, we have somewhere it makes a real difference.',
    href: '/contact',
    cta: 'Get in touch',
    external: false,
  },
  {
    title: 'Help run the movement',
    body: 'We are always looking for committed people to help coordinate collectives, support leaders and grow Co-Exist across the country.',
    href: '/contact',
    cta: 'Register interest',
    external: false,
  },
]

export default function TeamPage() {
  return (
    <main data-eos-id="web/app/get-involved/team/page.tsx#0">
      <PageHeader data-eos-id="web/app/get-involved/team/page.tsx#1"
        eyebrow="Join the movement"
        title="Join the team"
        subtitle="Co-Exist is powered by young people who decided to stop scrolling and start doing. No experience needed, just the want to."
        image="/images/gather.webp"
      />

      {/* Why join - full-bleed split */}
      <section data-eos-id="web/app/get-involved/team/page.tsx#2" className="grid items-stretch bg-white md:grid-cols-2">
        <Reveal data-eos-id="web/app/get-involved/team/page.tsx#3" className="relative order-1 min-h-[54vh] overflow-hidden md:order-2">
          <Image data-eos-id="web/app/get-involved/team/page.tsx#4" src="/images/nature.webp" alt="Young people on a Co-Exist conservation day" fill quality={88} sizes="(max-width:768px) 100vw, 50vw" placeholder="blur" blurDataURL={BLUR['/images/nature.webp']} className="object-cover transition-transform duration-[1.2s] hover:scale-105" />
          {/* olive-900/15 tint + grain to match hero grade */}
          <div data-eos-id="web/app/get-involved/team/page.tsx#5" className="absolute inset-0 bg-olive-900/15" />
          <div data-eos-id="web/app/get-involved/team/page.tsx#6" className="grain-layer" />
        </Reveal>
        <div data-eos-id="web/app/get-involved/team/page.tsx#7" className="order-2 flex items-center px-6 py-24 md:order-1 md:px-16">
          <Reveal data-eos-id="web/app/get-involved/team/page.tsx#8" className="max-w-md">
            <p data-eos-id="web/app/get-involved/team/page.tsx#9" className="eyebrow text-primary-600">Why join</p>
            <h2 data-eos-id="web/app/get-involved/team/page.tsx#10" className="display-tight has-mark mt-5 text-5xl text-neutral-900 sm:text-6xl">
              Find something that
              <span data-eos-id="web/app/get-involved/team/page.tsx#11" className="mt-2 block"><WordSwap data-eos-id="web/app/get-involved/team/page.tsx#12" words={['actually matters', 'lasts', 'feels good', 'is yours']} /></span>
            </h2>
            <p data-eos-id="web/app/get-involved/team/page.tsx#13" className="mt-6 text-[15px] leading-relaxed text-neutral-500">
              You meet people who care about the same things you do. You learn skills you keep for
              life. And you get outside and do real work for the place you live. That is the whole
              offer, and it is a good one.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Ways in - editorial numbered list */}
      <section data-eos-id="web/app/get-involved/team/page.tsx#14" className="bg-white">
        <div data-eos-id="web/app/get-involved/team/page.tsx#15" className="max-w-6xl px-6 pb-24 pt-4 md:px-16">
          <p data-eos-id="web/app/get-involved/team/page.tsx#16" className="eyebrow text-primary-600">Ways in</p>
          <h2 data-eos-id="web/app/get-involved/team/page.tsx#17" className="display-tight mt-3 text-5xl text-neutral-900 sm:text-6xl">Three ways to get involved</h2>
          <div data-eos-id="web/app/get-involved/team/page.tsx#18" className="mt-12 border-t border-neutral-300">
            {ROLES.map((r, i) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const Wrap: any = r.external ? 'a' : Link
              return (
                <Reveal data-eos-id="web/app/get-involved/team/page.tsx#19" key={r.title} delay={i * 110}>
                  <Wrap data-eos-href="dynamic" data-eos-href-label="Href" data-eos-href-scope="item" data-eos-id="web/app/get-involved/team/page.tsx#20"
                    href={r.href}
                    {...(r.external ? { target: '_self' } : {})}
                    className="group/role relative block border-b border-neutral-300"
                  >
                    <div data-eos-id="web/app/get-involved/team/page.tsx#21" className="grid gap-3 py-12 md:grid-cols-[5rem_1fr_auto] md:items-center md:gap-10 md:py-14">
                      <span data-eos-id="web/app/get-involved/team/page.tsx#22" className="text-6xl font-light leading-none text-primary-300 transition-colors duration-300 group-hover/role:text-primary-500 sm:text-7xl">
                        0{i + 1}
                      </span>
                      <div data-eos-id="web/app/get-involved/team/page.tsx#23">
                        <h3 data-eos-id="web/app/get-involved/team/page.tsx#24" data-eos-var="r.title" data-eos-var-label="Title" data-eos-var-scope="item" className="text-2xl text-neutral-900 transition-colors duration-300 group-hover/role:text-primary-800">{r.title}</h3>
                        <p data-eos-id="web/app/get-involved/team/page.tsx#25" data-eos-var="r.body" data-eos-var-label="Body" data-eos-var-scope="item" className="mt-2 max-w-xl text-[15px] leading-relaxed text-neutral-500">{r.body}</p>
                      </div>
                      <span data-eos-id="web/app/get-involved/team/page.tsx#26" className="flex shrink-0 items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">
                        {r.cta}
                        <span data-eos-id="web/app/get-involved/team/page.tsx#27" className="transition-transform duration-300 group-hover/role:translate-x-1">→</span>
                      </span>
                    </div>
                  </Wrap>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>
    </main>
  )
}
