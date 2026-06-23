import Link from 'next/link'
import { APP_URL } from '@/lib/env'
import { SocialIcons } from './social-icons'
import { AcknowledgementFlags } from './acknowledgement-flags'
import { Certifications } from './certifications'
import { StoreBadges } from './store-badges'

const BEQUEST_URL = 'https://gatheredhere.com.au/c/coexistaustralia'

const COMMUNITY = [
  { label: 'Attend an event', href: '/events' },
  { label: 'Join a collective', href: '/collectives' },
  { label: 'Join our team', href: '/get-involved/team' },
  { label: 'Support us', href: '/get-involved/support' },
]

const SUPPORT = [
  { label: 'Donate', href: '/donate' },
  { label: 'Shop', href: '/shop' },
  { label: 'Leave a legacy', href: BEQUEST_URL, external: true },
  { label: 'Become a partner', href: '/contact' },
]

const COEXIST = [
  { label: 'About', href: '/about' },
  { label: 'News', href: '/news' },
  { label: 'Contact', href: '/contact' },
  { label: 'Open the app', href: APP_URL, external: true },
]

function Col({ title, links }: { title: string; links: { label: string; href: string; external?: boolean }[] }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-neutral-400">{title}</p>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            {l.external ? (
              <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-sm text-neutral-600 hover:text-primary-700">
                {l.label}
              </a>
            ) : (
              <Link href={l.href} className="text-sm text-neutral-600 hover:text-primary-700">
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-neutral-100 bg-surface-1">
      <div className="mx-auto w-full max-w-[1700px] px-5 py-16 sm:px-8 lg:px-14">
        <div className="grid gap-12 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo-olive.png" alt="Co-Exist Australia" className="h-9 w-auto" />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-neutral-600">
              We respectfully acknowledge the Traditional Custodians of the lands and waters on which
              we live, work and gather, and pay our respects to Elders past and present. Always was,
              always will be Aboriginal land.
            </p>
            <StoreBadges className="mt-7" />
            <AcknowledgementFlags className="mt-7" />
            <SocialIcons tone="dark" className="mt-6" />
            <Certifications className="mt-7" />
          </div>

          <Col title="Community" links={COMMUNITY} />
          <Col title="Support" links={SUPPORT} />
          <Col title="Co-Exist" links={COEXIST} />
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-neutral-200 pt-6 text-xs text-neutral-500 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Co-Exist Australia Ltd · ABN 39 660 776 983 · ACNC registered charity</p>
          <div className="flex items-center gap-5">
            <Link href="/legal/privacy" className="hover:text-primary-700">Privacy</Link>
            <Link href="/legal/terms" className="hover:text-primary-700">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
