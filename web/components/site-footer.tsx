import Link from 'next/link'
import { APP_URL } from '@/lib/env'
import { NewsletterForm } from './newsletter-form'

const COMMUNITY = [
  { label: 'Attend an event', href: '/events' },
  { label: 'Join a collective', href: '/collectives' },
  { label: 'Join our team', href: '/get-involved/team' },
  { label: 'Support us', href: '/get-involved/support' },
]

const COEXIST = [
  { label: 'About', href: '/about' },
  { label: 'News', href: '/news' },
  { label: 'Contact', href: '/contact' },
  { label: 'Open the app', href: APP_URL, external: true },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-neutral-100 bg-surface-1">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo-olive.png" alt="Co-Exist Australia" className="h-8 w-auto" />
            <p className="mt-4 max-w-md text-sm leading-relaxed text-neutral-600">
              Co-Exist acknowledges the Traditional Custodians of the lands and
              waters where we gather, and pays respect to Elders past and present.
              Always was, always will be Aboriginal land.
            </p>
            <div className="mt-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-neutral-400">
                Stay in the loop
              </p>
              <NewsletterForm className="mt-3 max-w-sm" />
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-neutral-400">
              Community
            </p>
            <ul className="mt-4 space-y-2">
              {COMMUNITY.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-neutral-600 hover:text-primary-700">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-neutral-400">
              Co-Exist
            </p>
            <ul className="mt-4 space-y-2">
              {COEXIST.map((l) => (
                <li key={l.href}>
                  {l.external ? (
                    <a href={l.href} className="text-sm text-neutral-600 hover:text-primary-700">
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
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-neutral-100 pt-6 text-xs text-neutral-500 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Co-Exist Australia Ltd · ABN 39 660 776 983 · ACNC registered charity</p>
          <div className="flex gap-4">
            <a href="https://www.instagram.com/coexistaus" className="hover:text-primary-700">Instagram</a>
            <a href="https://www.facebook.com/coexistaus" className="hover:text-primary-700">Facebook</a>
            <Link href="/legal/privacy" className="hover:text-primary-700">Privacy</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
