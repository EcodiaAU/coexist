import Link from 'next/link'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { APP_URL } from '@/lib/env'

export const metadata: Metadata = {
  title: 'Join our team',
  description:
    'Lead a collective, volunteer your skills, or help run Co-Exist behind the scenes. Be part of building the movement.',
}

const ROLES = [
  {
    title: 'Lead a collective',
    body: 'Start and run a local group in your area. We give you the tools, training and support to make it happen.',
    href: `${APP_URL}/lead-a-collective`,
    cta: 'Start a collective',
    external: true,
  },
  {
    title: 'Volunteer your skills',
    body: 'Photography, social media, design, event support, fundraising. If you have a skill, we have a use for it.',
    href: '/contact',
    cta: 'Get in touch',
  },
  {
    title: 'Help run the movement',
    body: 'We are always looking for committed people to help coordinate collectives and grow Co-Exist nationally.',
    href: '/contact',
    cta: 'Register interest',
  },
]

export default function TeamPage() {
  return (
    <main>
      <PageHeader
        eyebrow="Join our team"
        title="Help build the movement"
        subtitle="Co-Exist is powered by young people who decided to do something. There is room for you."
        image="/images/collective.webp"
      />
      <section className="mx-auto max-w-5xl px-5 py-14">
        <div className="grid gap-5 md:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r.title} className="flex flex-col rounded-3xl border border-neutral-100 bg-white p-7 shadow-sm">
              <h2 className="text-lg font-bold text-neutral-900">{r.title}</h2>
              <p className="mt-3 flex-1 leading-relaxed text-neutral-600">{r.body}</p>
              {r.external ? (
                <a href={r.href} className="mt-5 inline-block text-sm font-bold text-primary-700 hover:text-primary-800">
                  {r.cta} →
                </a>
              ) : (
                <Link href={r.href} className="mt-5 inline-block text-sm font-bold text-primary-700 hover:text-primary-800">
                  {r.cta} →
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
