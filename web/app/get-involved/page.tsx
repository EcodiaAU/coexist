import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { BentoTile } from '@/components/bento-tile'
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
    image: '/images/collective.webp',
    alt: 'Young people planting trees at a Co-Exist conservation day',
  },
  {
    title: 'Join a collective',
    body: 'Find your local youth-led group and become a regular. This is where the community lives.',
    href: '/collectives',
    cta: 'Find a collective',
    image: '/images/nature.webp',
    alt: 'Co-Exist collective members in a natural setting',
  },
  {
    title: 'Join our team',
    body: 'Lead a collective, volunteer your skills, or help run the movement behind the scenes.',
    href: '/get-involved/team',
    cta: 'See roles',
    image: '/images/gather.webp',
    alt: 'Co-Exist team gathering outdoors',
  },
  {
    title: 'Support us',
    body: 'Donate, partner, or fundraise. Every contribution puts young people back into nature.',
    href: '/get-involved/support',
    cta: 'Support Co-Exist',
    image: '/images/hero.webp',
    alt: 'Co-Exist conservation landscape',
  },
]

function ChevronRight() {
  return (
    <svg
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block h-4 w-4 flex-shrink-0 translate-x-0 transition-transform duration-200 group-hover:translate-x-1"
    >
      <path d="M6 3l5 5-5 5" />
    </svg>
  )
}

export default function GetInvolvedPage() {
  return (
    <main>
      <PageHeader
        eyebrow="Get involved"
        title="Find your way in"
        subtitle="Whatever you have to give - an afternoon, your skills, or your support - there is a place for you here."
        image="/images/collective.webp"
      />

      {/* 2-col bento grid, flush, no gap */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-0">
        {WAYS.map((w) => (
          <BentoTile
            key={w.href}
            href={w.href}
            image={w.image}
            alt={w.alt}
            tint
          >
            <div className="relative flex flex-col justify-end h-72 sm:h-80 p-7">
              <h2 className="display-tight text-xl font-normal text-white leading-tight">
                {w.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-white/75">{w.body}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-normal text-sage tracking-wide">
                {w.cta}
                <ChevronRight />
              </span>
            </div>
          </BentoTile>
        ))}
      </section>

      {/* Slim full-bleed olive strip */}
      <section className="bg-olive-800 py-10 px-5 text-center">
        <p className="text-sm tracking-wide text-white/70 uppercase" style={{ letterSpacing: '0.1em' }}>
          Already part of Co-Exist?
        </p>
        <a
          href={APP_URL}
          className="mt-3 inline-flex items-center gap-2 text-base font-normal text-sage hover:text-white transition-colors duration-200"
        >
          Open the app
          <ChevronRight />
        </a>
      </section>
    </main>
  )
}
