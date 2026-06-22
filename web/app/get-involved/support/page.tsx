import Link from 'next/link'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'

export const metadata: Metadata = {
  title: 'Support us',
  description:
    'Donate, partner, or fundraise for Co-Exist. Every contribution puts young people back into nature and grows the movement.',
}

const WAYS = [
  {
    title: 'Donate',
    body: 'A one-off or regular gift directly funds events, equipment and the people who make conservation days happen.',
    href: '/donate',
    cta: 'Make a donation',
  },
  {
    title: 'Partner with us',
    body: 'Businesses and foundations help us reach more young people and more places. Let us find a partnership that fits.',
    href: '/contact',
    cta: 'Start a conversation',
  },
  {
    title: 'Fundraise',
    body: 'Run your own fundraiser, or get your workplace or school involved. We will help you set it up.',
    href: '/contact',
    cta: 'Get in touch',
  },
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
      <section className="mx-auto max-w-5xl px-5 py-14">
        <div className="grid gap-5 md:grid-cols-3">
          {WAYS.map((w) => (
            <div key={w.title} className="flex flex-col rounded-3xl border border-neutral-100 bg-white p-7 shadow-sm">
              <h2 className="text-lg font-bold text-neutral-900">{w.title}</h2>
              <p className="mt-3 flex-1 leading-relaxed text-neutral-600">{w.body}</p>
              <Link href={w.href} className="mt-5 inline-block text-sm font-bold text-primary-700 hover:text-primary-800">
                {w.cta} →
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-10 text-center text-sm text-neutral-500">
          Co-Exist Australia Ltd is an ACNC registered charity. ABN 39 660 776 983.
        </p>
      </section>
    </main>
  )
}
