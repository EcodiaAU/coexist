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
    <div data-eos-id="web/components/site-footer.tsx#0" data-eos-v="2">
      <p data-eos-id="web/components/site-footer.tsx#1" className="text-[11px] font-bold uppercase tracking-[0.15em] text-oncream/50">{title}</p>
      <ul data-eos-id="web/components/site-footer.tsx#2" className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li data-eos-id="web/components/site-footer.tsx#3" key={l.label}>
            {l.external ? (
              <a data-eos-href="dynamic" data-eos-href-label="Href" data-eos-href-scope="item" data-eos-id="web/components/site-footer.tsx#4" data-eos-var="l.label" data-eos-var-label="Label" data-eos-var-scope="item" href={l.href} target="_blank" rel="noopener noreferrer" className="text-sm text-oncream/75 transition-colors hover:text-oncream">
                {l.label}
              </a>
            ) : (
              <Link data-eos-href="dynamic" data-eos-href-label="Href" data-eos-href-scope="item" data-eos-id="web/components/site-footer.tsx#5" data-eos-var="l.label" data-eos-var-label="Label" data-eos-var-scope="item" href={l.href} className="text-sm text-oncream/75 transition-colors hover:text-oncream">
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
    <footer data-eos-id="web/components/site-footer.tsx#6" className="relative isolate overflow-hidden bg-olive-900 text-oncream">
      <div data-eos-id="web/components/site-footer.tsx#7" className="grain-layer absolute inset-0 z-0" />
      <div data-eos-id="web/components/site-footer.tsx#8" className="relative z-10 mx-auto w-full max-w-[1700px] px-5 py-14 sm:px-8 lg:px-14">
        {/* Newsletter - top of the unified footer */}
        <div data-eos-id="web/components/site-footer.tsx#9" className="grid gap-8 border-b border-oncream/15 pb-12 md:grid-cols-[1.6fr_1fr] md:items-end">
          <div data-eos-id="web/components/site-footer.tsx#10">
            <h2 data-eos-id="web/components/site-footer.tsx#11" className="display-tight max-w-xl text-4xl text-oncream sm:text-5xl">News &amp; events, worth opening</h2>
            <p data-eos-id="web/components/site-footer.tsx#12" className="mt-4 max-w-md text-[15px] leading-relaxed text-oncream/70">Upcoming events, what collectives are up to, and ways to get outside. Only good stuff.</p>
          </div>
          <div data-eos-id="web/components/site-footer.tsx#13">
            <NewsletterForm data-eos-id="web/components/site-footer.tsx#14" tone="light" />
            <p data-eos-id="web/components/site-footer.tsx#15" className="mt-3 text-xs text-oncream/55">Unsubscribe any time.</p>
          </div>
        </div>

        <div data-eos-id="web/components/site-footer.tsx#16" className="grid gap-10 pt-12 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div data-eos-id="web/components/site-footer.tsx#17">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img data-eos-src="static" data-eos-id="web/components/site-footer.tsx#18" src="/images/logo-white.png" alt="Co-Exist Australia" className="h-9 w-auto" />
            <p data-eos-id="web/components/site-footer.tsx#19" className="mt-5 max-w-sm text-sm leading-relaxed text-oncream/70">
              We respectfully acknowledge the Traditional Custodians of the lands and waters on which
              we live, work and gather, and pay our respects to Elders past and present. Always was,
              always will be Aboriginal land.
            </p>
            <div data-eos-id="web/components/site-footer.tsx#20" className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4">
              <AcknowledgementFlags data-eos-id="web/components/site-footer.tsx#21" />
              <SocialIcons data-eos-id="web/components/site-footer.tsx#22" tone="light" />
            </div>
            <StoreBadges data-eos-id="web/components/site-footer.tsx#23" className="mt-6" />
          </div>

          <Col data-eos-id="web/components/site-footer.tsx#24" title="Community" links={COMMUNITY} />
          <Col data-eos-id="web/components/site-footer.tsx#25" title="Support" links={SUPPORT} />
          <Col data-eos-id="web/components/site-footer.tsx#26" title="Co-Exist" links={COEXIST} />
        </div>

        <div data-eos-id="web/components/site-footer.tsx#27" className="mt-10 flex flex-col gap-5 border-t border-oncream/15 pt-6 text-xs text-oncream/55 lg:flex-row lg:items-center lg:justify-between">
          <div data-eos-id="web/components/site-footer.tsx#28" className="flex flex-col gap-2">
            <p data-eos-id="web/components/site-footer.tsx#29">© {new Date().getFullYear()} Co-Exist Australia Ltd · ABN 39 660 776 983 · ACNC registered charity</p>
            <a data-eos-href="static" data-eos-id="web/components/site-footer.tsx#30"
              href="https://ecodia.au"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="built by Ecodia"
              style={{ fontFamily: "'Spectral', 'Iowan Old Style', Garamond, 'Times New Roman', serif" }}
              className="inline-block w-fit text-[15px] leading-none no-underline text-oncream"
            >
              built by Ecodia
            </a>
          </div>
          <div data-eos-id="web/components/site-footer.tsx#31" className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <Certifications data-eos-id="web/components/site-footer.tsx#32" />
            <Link data-eos-href="static" data-eos-id="web/components/site-footer.tsx#33" href="/legal/privacy" className="transition-colors hover:text-oncream">Privacy</Link>
            <Link data-eos-href="static" data-eos-id="web/components/site-footer.tsx#34" href="/legal/terms" className="transition-colors hover:text-oncream">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
