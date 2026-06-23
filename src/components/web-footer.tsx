import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'
import {
  APP_NAME,
  TAGLINE,
  INSTAGRAM_URL,
  FACEBOOK_URL,
} from '@/lib/constants'
import { EcodiaAttribution } from '@/components/ecodia-attribution'

const footerLinks: Array<
  | { label: string; to: string }
  | { label: string; onClick: () => void }
  | { label: string; href: string }
> = [
  { label: 'About', to: '/about' },
  { label: 'Privacy', to: '/privacy' },
  { label: 'Terms', to: '/terms' },
  { label: 'Data Policy', to: '/data-policy' },
  { label: 'Disclaimer', to: '/disclaimer' },
  { label: 'Accessibility', to: '/accessibility' },
  { label: 'Cookies', to: '/cookies' },
  { label: 'Contact', to: '/contact' },
]

const socialLinks = [
  { label: 'Instagram', href: INSTAGRAM_URL, icon: InstagramIcon },
  { label: 'Facebook', href: FACEBOOK_URL, icon: FacebookIcon },
]

interface WebFooterProps {
  className?: string
}

export function WebFooter({ className }: WebFooterProps) {
  const year = new Date().getFullYear()

  return (
    <footer
      className={cn(
        'bg-primary-950 text-white/70',
        'mt-auto',
        className,
      )}
      aria-label="Site footer"
    >
      <div className="mx-auto max-w-[1280px] px-6 py-12">
        <div className="grid gap-10 md:grid-cols-3">
          {/* Brand column */}
          <div>
            <img
              src="/logos/white-wordmark.webp"
              alt={APP_NAME}
              className="h-20 w-auto"
            />
            <p className="mt-2 text-sm text-white/50 font-medium">
              {TAGLINE}
            </p>
            <div className="flex items-center gap-3 mt-5">
              {socialLinks.map(({ label, href, icon: Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'flex items-center justify-center',
                    'w-11 h-11 rounded-full',
                    'bg-primary-900 text-white/70',
                    'hover:bg-primary-800 hover:text-white',
                    'transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                  )}
                  aria-label={label}
                >
                  <Icon />
                </a>
              ))}
            </div>
          </div>

          {/* Links column */}
          <div>
            <h3 className="font-heading text-sm font-semibold text-white mb-4">
              Links
            </h3>
            <ul className="space-y-2.5">
              {footerLinks.map((link) =>
                'to' in link && link.to ? (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="text-sm hover:text-white transition-colors duration-150 focus-visible:outline-none focus-visible:underline"
                    >
                      {link.label}
                    </Link>
                  </li>
                ) : 'onClick' in link && link.onClick ? (
                  <li key={link.label}>
                    <button
                      type="button"
                      onClick={link.onClick}
                      className="text-sm hover:text-white min-h-11 flex items-center justify-center cursor-pointer select-none active:scale-[0.97] transition-transform duration-150 focus-visible:outline-none focus-visible:underline"
                    >
                      {link.label}
                    </button>
                  </li>
                ) : (
                  <li key={link.label}>
                    <a
                      href={'href' in link ? link.href : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm hover:text-white transition-colors duration-150 focus-visible:outline-none focus-visible:underline"
                    >
                      {link.label}
                    </a>
                  </li>
                ),
              )}
            </ul>
          </div>

          {/* Download column */}
          <div>
            <h3 className="font-heading text-sm font-semibold text-white mb-4">
              Download the app
            </h3>
            <div className="flex flex-col gap-3">
              {/* App Store badge */}
              <a
                href="https://apps.apple.com/au/app/co-exist/id6760897574"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'inline-flex items-center gap-3 px-4 py-2.5',
                  'rounded-sm bg-primary-900',
                  'hover:bg-primary-800 transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                )}
                aria-label="Download on the App Store"
              >
                <AppleIcon />
                <div>
                  <p className="text-[11px] text-white/50 leading-tight">
                    Download on the
                  </p>
                  <p className="text-sm font-semibold text-white leading-tight">
                    App Store
                  </p>
                </div>
              </a>

              {/* Play Store badge */}
              <a
                href="https://play.google.com/store/apps/details?id=org.coexistaus.app&hl=en"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'inline-flex items-center gap-3 px-4 py-2.5',
                  'rounded-sm bg-primary-900',
                  'hover:bg-primary-800 transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                )}
                aria-label="Get it on Google Play"
              >
                <PlayStoreIcon />
                <div>
                  <p className="text-[11px] text-white/50 leading-tight">
                    Get it on
                  </p>
                  <p className="text-sm font-semibold text-white leading-tight">
                    Google Play
                  </p>
                </div>
              </a>
            </div>
          </div>
        </div>

        {/* Acknowledgment */}
        <div className="mt-10 pt-8 border-t border-primary-800">
          <div className="flex items-center gap-3 mb-4">
            <img
              src="/img/aboriginal-peoples-flag.png"
              alt="Aboriginal Peoples flag"
              className="h-6 w-auto"
            />
            <img
              src="/img/torres-strait-peoples-flag.png"
              alt="Torres Strait Islander Peoples flag"
              className="h-6 w-auto"
            />
          </div>
          <p className="text-xs text-white/50 leading-relaxed">
            We acknowledge the Traditional Custodians of the lands on which we
            live and work, and pay our respects to Elders past, present and
            emerging. We recognise that sovereignty was never ceded and that this
            land always was, and always will be, Aboriginal and Torres Strait
            Islander land.
          </p>
          <div className="mt-4 flex items-center justify-between text-xs text-white/50">
            <span>&copy; {year} Co-Exist Australia Ltd. All rights reserved.</span>
            <EcodiaAttribution />
          </div>
        </div>
      </div>
    </footer>
  )
}

/* ---- Inline SVG icons (avoids extra dependency) ---- */

function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg width="20" height="24" viewBox="0 0 20 24" fill="currentColor" aria-hidden="true" className="text-white">
      <path d="M16.52 12.46c-.03-2.85 2.33-4.22 2.44-4.29-1.33-1.94-3.4-2.21-4.13-2.24-1.76-.18-3.43 1.04-4.33 1.04-.89 0-2.27-1.01-3.73-.99-1.92.03-3.69 1.12-4.68 2.84-1.99 3.46-.51 8.59 1.43 11.4.95 1.37 2.08 2.92 3.57 2.86 1.43-.06 1.97-.93 3.7-.93 1.73 0 2.22.93 3.73.9 1.54-.03 2.52-1.4 3.46-2.78 1.09-1.59 1.54-3.13 1.57-3.21-.03-.01-3.01-1.16-3.04-4.6zm-2.85-8.46c.79-.96 1.32-2.29 1.18-3.62-1.14.05-2.52.76-3.34 1.72-.73.85-1.37 2.2-1.2 3.5 1.27.1 2.57-.65 3.36-1.6z" />
    </svg>
  )
}

function PlayStoreIcon() {
  return (
    <svg width="20" height="22" viewBox="0 0 20 22" fill="currentColor" aria-hidden="true" className="text-white">
      <path d="M1.22.52C.93.83.75 1.3.75 1.89v18.22c0 .59.18 1.06.47 1.37l.07.07L11.5 11.34v-.25L1.29.45l-.07.07z" />
      <path d="M14.9 14.73l-3.4-3.39v-.25l3.4-3.39.08.04 4.02 2.29c1.15.65 1.15 1.72 0 2.37l-4.02 2.29-.08.04z" />
      <path d="M15 14.69L11.5 11.1 1.29 21.48c.38.4.99.45 1.7.05L15 14.69z" />
      <path d="M15 7.74L2.99.9c-.71-.4-1.32-.35-1.7.05L11.5 11.34 15 7.74z" />
    </svg>
  )
}
