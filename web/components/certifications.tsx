/**
 * Accreditation logos (verified from the live coexistaus.org support page):
 * 1% for the Planet, ACNC Registered Charity, Social Traders, Climate Active.
 * Two of the four are white-on-transparent, so they render on a dark olive strip
 * rather than a separate light section.
 */
const CERTS = [
  { src: '/images/certs/onepercent.png', alt: '1% for the Planet member' },
  { src: '/images/certs/acnc.png', alt: 'ACNC Registered Charity' },
  { src: '/images/certs/socialtraders.png', alt: 'Social Traders certified' },
  { src: '/images/certs/climateactive.jpg', alt: 'Climate Active' },
]

export function Certifications({ className = '' }: { className?: string }) {
  return (
    <div className={`inline-flex flex-wrap items-center gap-x-6 gap-y-4 rounded-2xl bg-olive-900 px-6 py-4 ${className}`}>
      {CERTS.map((c) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={c.src} src={c.src} alt={c.alt} className="h-10 w-auto object-contain" />
      ))}
    </div>
  )
}
