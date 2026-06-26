import type { Metadata } from 'next'
import { Montserrat } from 'next/font/google'
import localFont from 'next/font/local'
import { SITE_URL } from '@/lib/env'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import './globals.css'

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-montserrat',
  display: 'swap',
})

// Aileron - the Co-Exist title font (bundled, OFL). Drives every heading site-wide.
const aileron = localFont({
  src: [
    { path: './fonts/aileron-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/aileron-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/aileron-700.woff2', weight: '700', style: 'normal' },
    { path: './fonts/aileron-800.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-aileron',
  display: 'swap',
})


export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Co-Exist Australia - Explore. Connect. Protect.',
    template: '%s | Co-Exist Australia',
  },
  description:
    'Co-Exist is a nationwide movement of young people gathering to preserve and protect their local environment. Join a collective, attend an event, and create real conservation impact across Australia.',
  openGraph: {
    siteName: 'Co-Exist Australia',
    type: 'website',
    locale: 'en_AU',
    images: ['/images/hero.webp'],
  },
  alternates: { canonical: '/' },
}

const ORG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'NGO',
  name: 'Co-Exist Australia',
  url: SITE_URL,
  description:
    'A nationwide movement of young people gathering to preserve and protect their local environment.',
  sameAs: [
    'https://www.instagram.com/coexistaus',
    'https://www.facebook.com/coexistaus',
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${montserrat.variable} ${aileron.variable}`}>
      <body className="flex min-h-screen flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSONLD) }}
        />
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  )
}
