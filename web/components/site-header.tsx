'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { NAV, DONATE_HREF, type NavItem } from '@/lib/site-nav'
import { SocialIcons } from '@/components/social-icons'

function TopLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const base = 'text-sm font-semibold text-neutral-700 hover:text-primary-700 transition-colors'
  if (item.external) {
    return (
      <a data-eos-href="dynamic" data-eos-href-label="Href" data-eos-href-scope="prop" data-eos-id="web/components/site-header.tsx#0" data-eos-var="item.label" data-eos-var-label="Label" data-eos-var-scope="prop" href={item.href} className={base} onClick={onNavigate}>
        {item.label}
      </a>
    )
  }
  return (
    <Link data-eos-href="dynamic" data-eos-href-label="Href" data-eos-href-scope="prop" data-eos-id="web/components/site-header.tsx#1" data-eos-var="item.label" data-eos-var-label="Label" data-eos-var-scope="prop" href={item.href} className={base} onClick={onNavigate}>
      {item.label}
    </Link>
  )
}

export function SiteHeader() {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Lock body scroll while the side sheet is open.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <header data-eos-id="web/components/site-header.tsx#2" className="sticky top-0 z-50 border-b border-neutral-200/70 bg-cream/85 backdrop-blur bg-[#b33a3a] text-[#16170f] text-[#ffffff] bg-[#ffffff]">
      <div data-eos-id="web/components/site-header.tsx#3" className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5 sm:h-24 sm:px-6">
        <Link data-eos-href="static" data-eos-id="web/components/site-header.tsx#4" href="/" className="flex items-center" aria-label="Co-Exist Australia home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img data-eos-id="web/components/site-header.tsx#5" src="/images/logo-olive.png" alt="Co-Exist Australia" className="h-10 w-auto sm:h-11" />
        </Link>

        {/* Desktop nav */}
        <nav data-eos-id="web/components/site-header.tsx#6" className="hidden items-center gap-7 lg:flex">
          {NAV.map((item) =>
            item.children ? (
              <div data-eos-id="web/components/site-header.tsx#7" key={item.label} className="group relative">
                <button data-eos-id="web/components/site-header.tsx#8" data-eos-var="item.label" data-eos-var-label="Label" data-eos-var-scope="item" className="flex items-center gap-1 text-sm font-semibold text-neutral-700 transition-colors hover:text-primary-700">
                  {item.label}
                                  </button>
                <div data-eos-id="web/components/site-header.tsx#9" className="invisible absolute left-1/2 top-full z-50 w-56 -translate-x-1/2 pt-3 opacity-0 transition-all group-hover:visible group-hover:opacity-100">
                  <div data-eos-id="web/components/site-header.tsx#10" className="overflow-hidden rounded-2xl border border-neutral-100 bg-white p-2 shadow-lg">
                    {item.children.map((c) => (
                      <Link data-eos-href="dynamic" data-eos-href-label="Href" data-eos-href-scope="item" data-eos-id="web/components/site-header.tsx#11" data-eos-var="c.label" data-eos-var-label="Label" data-eos-var-scope="item"
                        key={c.href}
                        href={c.href}
                        className="block rounded-xl px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 hover:text-primary-700"
                      >
                        {c.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <TopLink data-eos-id="web/components/site-header.tsx#12" key={item.label} item={item} />
            ),
          )}
        </nav>

        {/* Desktop right: socials + donate */}
        <div data-eos-id="web/components/site-header.tsx#13" className="hidden items-center gap-4 lg:flex">
          <SocialIcons data-eos-id="web/components/site-header.tsx#14" tone="dark" />
          <Link data-eos-href="dynamic" data-eos-href-label="Donate href" data-eos-href-scope="prop" data-eos-id="web/components/site-header.tsx#15"
            href={DONATE_HREF}
            className="rounded-full bg-olive-700 px-5 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-olive-800"
          >
            Donate
          </Link>
        </div>

        {/* Mobile toggle */}
        <button data-eos-id="web/components/site-header.tsx#16"
          className="-mr-1 p-1 text-neutral-800 lg:hidden"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <svg data-eos-id="web/components/site-header.tsx#17" width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path data-eos-id="web/components/site-header.tsx#18" d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Mobile side sheet + overlay */}
      <div data-eos-id="web/components/site-header.tsx#19" className={`lg:hidden ${open ? '' : 'pointer-events-none'}`}>
        {/* Overlay */}
        <div data-eos-id="web/components/site-header.tsx#20"
          className={`fixed inset-0 z-40 bg-olive-950/45 backdrop-blur-sm transition-opacity duration-300 ${
            open ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setOpen(false)}
          aria-hidden
        />
        {/* Sheet */}
        <aside data-eos-id="web/components/site-header.tsx#21"
          className={`fixed right-0 top-0 z-50 flex h-[100dvh] w-[84%] max-w-sm flex-col bg-cream shadow-2xl transition-transform duration-300 ease-out ${
            open ? 'translate-x-0' : 'translate-x-full'
          }`}
          role="dialog"
          aria-modal="true"
        >
          <div data-eos-id="web/components/site-header.tsx#22" className="flex h-20 shrink-0 items-center justify-between border-b border-neutral-200 px-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img data-eos-id="web/components/site-header.tsx#23" src="/images/logo-olive.png" alt="Co-Exist Australia" className="h-9 w-auto" />
            <button data-eos-id="web/components/site-header.tsx#24" className="-mr-1 p-1 text-neutral-800" aria-label="Close menu" onClick={() => setOpen(false)}>
              <svg data-eos-id="web/components/site-header.tsx#25" width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path data-eos-id="web/components/site-header.tsx#26" d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <nav data-eos-id="web/components/site-header.tsx#27" className="flex-1 overflow-y-auto px-5 py-6">
            <ul data-eos-id="web/components/site-header.tsx#28" className="flex flex-col">
              {NAV.map((item) => (
                <li data-eos-id="web/components/site-header.tsx#29" key={item.label} className="border-b border-neutral-100">
                  {item.children ? (
                    <>
                      <button data-eos-id="web/components/site-header.tsx#30"
                        className="flex w-full items-center justify-between py-4 text-left text-lg text-neutral-900"
                        onClick={() => setExpanded((e) => (e === item.label ? null : item.label))}
                        aria-expanded={expanded === item.label}
                      >
                        {item.label}
                        <svg data-eos-id="web/components/site-header.tsx#31"
                          width="18" height="18" viewBox="0 0 24 24" fill="none"
                          className={`transition-transform duration-200 ${expanded === item.label ? 'rotate-180' : ''}`}
                          aria-hidden
                        >
                          <path data-eos-id="web/components/site-header.tsx#32" d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <div data-eos-id="web/components/site-header.tsx#33" className={`overflow-hidden transition-all duration-300 ${expanded === item.label ? 'max-h-64' : 'max-h-0'}`}>
                        <div data-eos-id="web/components/site-header.tsx#34" className="flex flex-col gap-1 pb-3 pl-3">
                          {item.children.map((c) => (
                            <Link data-eos-href="dynamic" data-eos-href-label="Href" data-eos-href-scope="item" data-eos-id="web/components/site-header.tsx#35" data-eos-var="c.label" data-eos-var-label="Label" data-eos-var-scope="item"
                              key={c.href}
                              href={c.href}
                              onClick={() => setOpen(false)}
                              className="py-2 text-[15px] text-neutral-500 hover:text-primary-700"
                            >
                              {c.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <Link data-eos-href="dynamic" data-eos-href-label="Href" data-eos-href-scope="item" data-eos-id="web/components/site-header.tsx#36" data-eos-var="item.label" data-eos-var-label="Label" data-eos-var-scope="item"
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="block py-4 text-lg text-neutral-900 hover:text-primary-700"
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>

            <Link data-eos-href="dynamic" data-eos-href-label="Donate href" data-eos-href-scope="prop" data-eos-id="web/components/site-header.tsx#37"
              href={DONATE_HREF}
              onClick={() => setOpen(false)}
              className="mt-7 block rounded-full bg-olive-700 px-5 py-3.5 text-center text-sm font-bold uppercase tracking-wider text-white"
            >
              Donate
            </Link>

            <div data-eos-id="web/components/site-header.tsx#38" className="mt-8 flex items-center justify-between">
              <p data-eos-id="web/components/site-header.tsx#39" className="eyebrow text-neutral-400">Follow along</p>
              <SocialIcons data-eos-id="web/components/site-header.tsx#40" tone="dark" size="lg" />
            </div>
          </nav>
        </aside>
      </div>
    </header>
  )
}
