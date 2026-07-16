import { SOCIALS, type Social } from '@/lib/site-nav'

function Glyph({ icon }: { icon: Social['icon'] }) {
  if (icon === 'instagram') {
    return (
      <svg data-eos-id="web/components/social-icons.tsx#0" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect data-eos-id="web/components/social-icons.tsx#1" x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.7" />
        <circle data-eos-id="web/components/social-icons.tsx#2" cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" />
        <circle data-eos-id="web/components/social-icons.tsx#3" cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg data-eos-id="web/components/social-icons.tsx#4" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path data-eos-id="web/components/social-icons.tsx#5"
        d="M14 8.5V7c0-.7.3-1 1-1h1.5V3.2H14c-2.2 0-3.5 1.4-3.5 3.6V8.5H8.2V11h2.3v9.8h3V11h2.2l.4-2.5H13.5"
        fill="currentColor"
      />
    </svg>
  )
}

/** Row of social links. `tone` adapts colour to light or dark backgrounds. */
export function SocialIcons({
  className = '',
  tone = 'dark',
  size = 'md',
}: {
  className?: string
  tone?: 'dark' | 'light'
  size?: 'md' | 'lg'
}) {
  const box = size === 'lg' ? 'h-11 w-11' : 'h-9 w-9'
  const ring =
    tone === 'light'
      ? 'border-oncream/30 text-oncream hover:bg-oncream/10'
      : 'border-neutral-200 text-neutral-600 hover:border-primary-400 hover:text-primary-700'
  return (
    <div data-eos-id="web/components/social-icons.tsx#6" className={`flex items-center gap-2 ${className}`}>
      {SOCIALS.map((s) => (
        <a data-eos-href="dynamic" data-eos-href-label="Href" data-eos-href-scope="item" data-eos-id="web/components/social-icons.tsx#7"
          key={s.label}
          href={s.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={s.label}
          className={`flex ${box} items-center justify-center rounded-full border transition-colors ${ring}`}
        >
          <Glyph data-eos-id="web/components/social-icons.tsx#8" icon={s.icon} />
        </a>
      ))}
    </div>
  )
}
