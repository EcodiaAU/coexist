import type { Metadata } from 'next'
import { Montserrat } from 'next/font/google'
import localFont from 'next/font/local'
import { SITE_URL } from '@/lib/env'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import './globals.css'
import Script from 'next/script';

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
    <html data-eos-id="web/app/layout.tsx#0" data-eos-v="2" lang="en-AU" className={`${montserrat.variable} ${aileron.variable}`}>
      {/* Spectral - Ecodia's own serif, used only for the "built by Ecodia" attribution mark. */}
      <link data-eos-href="static" data-eos-id="web/app/layout.tsx#1" rel="preconnect" href="https://fonts.googleapis.com" />
      <link data-eos-href="static" data-eos-id="web/app/layout.tsx#2" rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link data-eos-href="static" data-eos-id="web/app/layout.tsx#3"
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,300;1,400;1,500;1,600&display=swap"
      />
      <body data-eos-id="web/app/layout.tsx#4" className="flex min-h-screen flex-col">
        <script data-eos-id="web/app/layout.tsx#5"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSONLD) }}
        />
        <SiteHeader data-eos-id="web/app/layout.tsx#6" />
        <div data-eos-id="web/app/layout.tsx#7" className="flex-1">{children}</div>
        <SiteFooter data-eos-id="web/app/layout.tsx#8" />
              <Script data-eos-id="web/app/layout.tsx#9" src="https://ecosphere.ecodia.au/preview-editor.js" strategy="afterInteractive" />
      </body>
    </html>
  )
}
