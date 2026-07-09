import Link from 'next/link'
import { APP_URL } from '@/lib/env'
import { SocialIcons } from './social-icons'
import { AcknowledgementFlags } from './acknowledgement-flags'
import { Certifications } from './certifications'
import { StoreBadges } from './store-badges'
import { NewsletterForm } from './newsletter-form'

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
  { label: 'Download the app', href: '/get-involved/download' },
  { label: 'Contact', href: '/contact' },
  { label: 'Open the app', href: APP_URL, external: true },
]

function Col({ title, links }: { title: string; links: { label: string; href: string; external?: boolean }[] }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-oncream/50">{title}</p>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            {l.external ? (
              <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-sm text-oncream/75 transition-colors hover:text-oncream">
                {l.label}
              </a>
            ) : (
              <Link href={l.href} className="text-sm text-oncream/75 transition-colors hover:text-oncream">
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
    <footer className="relative isolate overflow-hidden bg-olive-900 text-oncream">
      <div className="grain-layer absolute inset-0 z-0" />
      <div className="relative z-10 mx-auto w-full max-w-[1700px] px-5 py-14 sm:px-8 lg:px-14">
        {/* Newsletter - top of the unified footer */}
        <div className="grid gap-8 border-b border-oncream/15 pb-12 md:grid-cols-[1.6fr_1fr] md:items-end">
          <div>
            <h2 className="display-tight max-w-xl text-4xl text-oncream sm:text-5xl">News and events, worth opening</h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-oncream/70">
              Upcoming events, what collectives are up to, and ways to get outside. Only when there is
              something good to share.
            </p>
          </div>
          <div>
            <NewsletterForm tone="light" />
            <p className="mt-3 text-xs text-oncream/55">No spam. Unsubscribe any time.</p>
          </div>
        </div>

        <div className="grid gap-10 pt-12 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo-white.png" alt="Co-Exist Australia" className="h-9 w-auto" />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-oncream/70">
              We respectfully acknowledge the Traditional Custodians of the lands and waters on which
              we live, work and gather, and pay our respects to Elders past and present. Always was,
              always will be Aboriginal land.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4">
              <AcknowledgementFlags />
              <SocialIcons tone="light" />
            </div>
            <StoreBadges className="mt-6" />
          </div>

          <Col title="Community" links={COMMUNITY} />
          <Col title="Support" links={SUPPORT} />
          <Col title="Co-Exist" links={COEXIST} />
        </div>

        <div className="mt-10 flex flex-col gap-5 border-t border-oncream/15 pt-6 text-xs text-oncream/55 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <p>© {new Date().getFullYear()} Co-Exist Australia Ltd · ABN 39 660 776 983 · ACNC registered charity</p>
            <a
              href="https://ecodia.au"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="built by Ecodia"
              style={{ fontFamily: "'Spectral', 'Iowan Old Style', Garamond, 'Times New Roman', serif" }}
              className="inline-block w-fit italic text-[15px] leading-none no-underline text-oncream"
            >
              built by Ecodia
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <Certifications />
            <Link href="/legal/privacy" className="transition-colors hover:text-oncream">Privacy</Link>
            <Link href="/legal/terms" className="transition-colors hover:text-oncream">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
