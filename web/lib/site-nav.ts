export interface NavItem {
  label: string
  href: string
  /** External links (e.g. into the app) open with a full navigation. */
  external?: boolean
  children?: NavItem[]
}

/**
 * Primary navigation, mirroring the live coexistaus.org structure:
 * Home / Get Involved (Events, Collectives, Team, Support) / About / Contact /
 * Shop / Donate. Shop + Donate reuse the app's existing Stripe commerce
 * (single source of truth); SEO landing pages for them land in P5.
 */
export const NAV: NavItem[] = [
  { label: 'Home', href: '/' },
  {
    label: 'Get Involved',
    href: '/get-involved',
    children: [
      { label: 'Attend an event', href: '/events' },
      { label: 'Join a collective', href: '/collectives' },
      { label: 'Join our team', href: '/get-involved/team' },
      { label: 'Support us', href: '/get-involved/support' },
    ],
  },
  { label: 'About', href: '/about' },
  { label: 'News', href: '/news' },
  { label: 'Contact', href: '/contact' },
  { label: 'Shop', href: '/shop' },
]

/** Prominent CTA shown as a filled button, separate from the nav list. */
export const DONATE_HREF = '/donate'

/** Social channels (verified from the live site footer). */
export interface Social {
  label: string
  href: string
  icon: 'instagram' | 'facebook'
}
export const SOCIALS: Social[] = [
  { label: 'Instagram', href: 'https://www.instagram.com/coexistaus', icon: 'instagram' },
  { label: 'Facebook', href: 'https://www.facebook.com/coexistaus', icon: 'facebook' },
]
