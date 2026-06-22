'use client'

import { useState } from 'react'
import Link from 'next/link'
import { NAV, DONATE_HREF, type NavItem } from '@/lib/site-nav'

function TopLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const base =
    'text-sm font-semibold text-neutral-700 hover:text-primary-700 transition-colors'
  if (item.external) {
    return (
      <a href={item.href} className={base} onClick={onNavigate}>
        {item.label}
      </a>
    )
  }
  return (
    <Link href={item.href} className={base} onClick={onNavigate}>
      {item.label}
    </Link>
  )
}

export function SiteHeader() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200/70 bg-cream/85 backdrop-blur">
      <div className="mx-auto flex h-24 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center" aria-label="Co-Exist Australia home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-olive.png" alt="Co-Exist Australia" className="h-11 w-auto" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((item) =>
            item.children ? (
              <div key={item.label} className="group relative">
                <button className="flex items-center gap-1 text-sm font-semibold text-neutral-700 transition-colors hover:text-primary-700">
                  {item.label}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div className="invisible absolute left-1/2 top-full z-50 w-56 -translate-x-1/2 pt-3 opacity-0 transition-all group-hover:visible group-hover:opacity-100">
                  <div className="overflow-hidden rounded-2xl border border-neutral-100 bg-white p-2 shadow-lg">
                    {item.children.map((c) => (
                      <Link
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
              <TopLink key={item.label} item={item} />
            ),
          )}
        </nav>

        <div className="hidden items-center md:flex">
          <Link
            href={DONATE_HREF}
            className="rounded-full bg-olive-700 px-5 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-olive-800"
          >
            Donate
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-neutral-200 bg-cream md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-4">
            {NAV.map((item) => (
              <div key={item.label}>
                <TopLink item={item} onNavigate={() => setOpen(false)} />
                {item.children && (
                  <div className="mt-1 flex flex-col gap-1 border-l border-neutral-100 pl-4">
                    {item.children.map((c) => (
                      <Link
                        key={c.href}
                        href={c.href}
                        onClick={() => setOpen(false)}
                        className="py-1 text-sm text-neutral-600 hover:text-primary-700"
                      >
                        {c.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <Link
              href={DONATE_HREF}
              onClick={() => setOpen(false)}
              className="mt-3 rounded-full bg-olive-700 px-5 py-2 text-center text-sm font-bold text-white"
            >
              Donate
            </Link>
          </nav>
        </div>
      )}
    </header>
  )
}
