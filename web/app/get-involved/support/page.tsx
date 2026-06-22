import Link from 'next/link'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'

export const metadata: Metadata = {
  title: 'Support us',
  description:
    'Donate, partner, or fundraise for Co-Exist. Become a corporate partner and put young people back into nature across Australia. ACNC registered charity.',
}

const WAYS = [
  { title: 'Donate', body: 'A one-off or regular gift funds events, equipment and the people who make conservation days happen.', href: '/donate', cta: 'Make a donation' },
  { title: 'Fundraise', body: 'Run your own fundraiser, or rally your workplace or school. We will help you set it up.', href: '/contact', cta: 'Get in touch' },
  { title: 'Volunteer', body: 'Give your time and skills. Lead a collective, or help run the movement behind the scenes.', href: '/get-involved/team', cta: 'Join the team' },
]

export default function SupportPage() {
  return (
    <main>
      <PageHeader
        eyebrow="Support us"
        title="Help us put young people back into nature"
        subtitle="Co-Exist is a registered charity. Your support goes straight into local conservation and the communities that drive it."
        image="/images/nature.webp"
      />

      {/* Corporate partner - feature band */}
      <section className="bg-olive-800 text-oncream">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 md:grid-cols-2">
          <div>
            <p className="eyebrow text-sage">For business</p>
            <h2 className="mt-4 text-4xl text-oncream sm:text-5xl">Become a corporate partner</h2>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-oncream/85">
              Partner with Co-Exist to back young people leading real conservation across Australia.
              We build partnerships that fit, from event sponsorship and team volunteer days to
              multi-year program support, with the impact reporting to match.
            </p>
            <Link href="/contact" className="mt-8 inline-block rounded-full bg-oncream px-8 py-3.5 text-[13px] font-semibold uppercase tracking-wider text-olive-900 transition-all duration-300 hover:px-10">
              Start a conversation
            </Link>
          </div>
          <div className="rounded-3xl border border-oncream/15 p-8">
            <blockquote className="text-2xl font-light leading-snug text-oncream sm:text-3xl">
              &ldquo;You&apos;re actually making a difference to the world around you.&rdquo;
            </blockquote>
            <p className="eyebrow mt-6 text-sage">Sam Lundberg, Co-Exist volunteer</p>
          </div>
        </div>
      </section>

      {/* Ways to support */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <p className="eyebrow text-primary-600">Ways to support</p>
        <h2 className="mt-3 text-4xl text-neutral-900 sm:text-5xl">More ways to help</h2>
        <div className="mt-10 grid gap-x-8 gap-y-10 md:grid-cols-3">
          {WAYS.map((w) => (
            <div key={w.title} className="flex flex-col border-t border-neutral-200 pt-6">
              <h3 className="text-2xl text-neutral-900">{w.title}</h3>
              <p className="mt-3 flex-1 text-[15px] leading-relaxed text-neutral-500">{w.body}</p>
              <Link href={w.href} className="mt-5 inline-block text-xs font-semibold uppercase tracking-[0.18em] text-primary-700 hover:text-primary-900">
                {w.cta} →
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-12 text-sm text-neutral-400">
          Co-Exist Australia Ltd is an ACNC registered charity. ABN 39 660 776 983.
        </p>
      </section>
    </main>
  )
}
