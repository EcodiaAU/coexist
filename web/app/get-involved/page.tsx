import Link from 'next/link'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { APP_URL } from '@/lib/env'

export const metadata: Metadata = {
  title: 'Get involved',
  description:
    'There are lots of ways to be part of Co-Exist. Attend an event, join a collective, join our team, or support our work.',
}

const WAYS = [
  {
    title: 'Attend an event',
    body: 'Come to a conservation day near you. Beach cleanups, tree planting, nature walks. No experience needed.',
    href: '/events',
    cta: 'See events',
  },
  {
    title: 'Join a collective',
    body: 'Find your local youth-led group and become a regular. This is where the community lives.',
    href: '/collectives',
    cta: 'Find a collective',
  },
  {
    title: 'Join our team',
    body: 'Lead a collective, volunteer your skills, or help run the movement behind the scenes.',
    href: '/get-involved/team',
    cta: 'See roles',
  },
  {
    title: 'Support us',
    body: 'Donate, partner, or fundraise. Every contribution puts young people back into nature.',
    href: '/get-involved/support',
    cta: 'Support Co-Exist',
  },
]

export default function GetInvolvedPage() {
  return (
    <main>
      <PageHeader
        eyebrow="Get involved"
        title="Find your way in"
        subtitle="Whatever you have to give - an afternoon, your skills, or your support - there is a place for you here."
      />
      <section className="mx-auto max-w-5xl px-5 py-14">
        <div className="grid gap-5 sm:grid-cols-2">
          {WAYS.map((w) => (
            <Link
              key={w.href}
              href={w.href}
              className="group rounded-3xl border border-neutral-100 bg-white p-7 shadow-sm transition-shadow hover:shadow-md"
            >
              <h2 className="text-xl font-bold text-neutral-900 group-hover:text-primary-700">{w.title}</h2>
              <p className="mt-3 leading-relaxed text-neutral-600">{w.body}</p>
              <span className="mt-5 inline-block text-sm font-bold text-primary-700">{w.cta} →</span>
            </Link>
          ))}
        </div>
        <p className="mt-10 text-center text-sm text-neutral-500">
          Already part of Co-Exist?{' '}
          <a href={APP_URL} className="font-semibold text-primary-700 hover:text-primary-800">
            Open the app
          </a>
        </p>
      </section>
    </main>
  )
}
