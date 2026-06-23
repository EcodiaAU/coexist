/**
 * Accreditation row. Co-Exist holds these memberships/certifications (verified
 * from the live coexistaus.org support page): 1% for the Planet, ACNC
 * Registered Charity, Social Traders, Climate Active. Rendered as clean text
 * badges; swap to official logo images in /public/images/certs if provided.
 */
const CERTS = [
  { label: '1% for the Planet', sub: 'Member' },
  { label: 'ACNC', sub: 'Registered Charity' },
  { label: 'Social Traders', sub: 'Certified' },
  { label: 'Climate Active', sub: 'Certified' },
]

export function Certifications({
  className = '',
  tone = 'dark',
}: {
  className?: string
  tone?: 'dark' | 'light'
}) {
  const border = tone === 'light' ? 'border-oncream/25' : 'border-neutral-300'
  const main = tone === 'light' ? 'text-oncream' : 'text-neutral-700'
  const sub = tone === 'light' ? 'text-oncream/55' : 'text-neutral-400'
  return (
    <div className={`flex flex-wrap items-stretch gap-2.5 ${className}`}>
      {CERTS.map((c) => (
        <div key={c.label} className={`rounded-lg border px-3 py-2 ${border}`}>
          <p className={`text-[12px] font-semibold leading-tight ${main}`}>{c.label}</p>
          <p className={`text-[9px] uppercase tracking-[0.16em] ${sub}`}>{c.sub}</p>
        </div>
      ))}
    </div>
  )
}
