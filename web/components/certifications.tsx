/**
 * Accreditation logos (verified from the live coexistaus.org footer):
 * 1% for the Planet, Little Phil (Certified Impact Partner), ACNC Registered
 * Charity. Two are white-on-transparent, so they render on a dark olive strip.
 */
const CERTS = [
  { src: '/images/certs/onepercent.png', alt: '1% for the Planet member' },
  { src: '/images/certs/littlephil.png', alt: 'Little Phil Certified Impact Partner' },
  { src: '/images/certs/acnc.png', alt: 'ACNC Registered Charity' },
]

export function Certifications({ className = '' }: { className?: string }) {
  return (
    <div className={`inline-flex flex-wrap items-center gap-x-6 gap-y-4 border border-oncream/10 bg-olive-950 px-5 py-3 ${className}`}>
      {CERTS.map((c) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={c.src} src={c.src} alt={c.alt} className="h-10 w-auto object-contain" />
      ))}
    </div>
  )
}
