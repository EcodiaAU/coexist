import type { Metadata } from 'next'
import { Montserrat } from 'next/font/google'
import { SITE_URL } from '@/lib/env'
import './globals.css'

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-montserrat',
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
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={montserrat.variable}>
      <body>{children}</body>
    </html>
  )
}
