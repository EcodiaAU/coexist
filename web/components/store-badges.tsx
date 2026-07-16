import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/env'

/** App Store + Google Play badges linking to the Co-Exist app listings. */
export function StoreBadges({ className = '' }: { className?: string }) {
  return (
    <div data-eos-id="web/components/store-badges.tsx#0" data-eos-v="2" className={`flex flex-wrap items-center gap-3 ${className}`}>
      <a data-eos-href="dynamic" data-eos-href-label="App store url" data-eos-href-scope="prop" data-eos-id="web/components/store-badges.tsx#1"
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Download Co-Exist on the App Store"
        className="inline-flex items-center gap-2.5 rounded-xl bg-neutral-900 px-4 py-2.5 text-white transition-transform duration-300 hover:-translate-y-0.5"
      >
        <svg data-eos-id="web/components/store-badges.tsx#2" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path data-eos-id="web/components/store-badges.tsx#3" d="M16.36 12.78c-.02-2.02 1.65-2.99 1.72-3.04-.94-1.37-2.4-1.56-2.92-1.58-1.24-.13-2.43.73-3.06.73-.63 0-1.6-.71-2.64-.69-1.36.02-2.61.79-3.31 2-1.41 2.45-.36 6.07 1.01 8.06.67.97 1.47 2.06 2.52 2.02 1.01-.04 1.39-.65 2.62-.65 1.22 0 1.57.65 2.64.63 1.09-.02 1.78-.99 2.45-1.97.77-1.13 1.09-2.22 1.11-2.28-.02-.01-2.13-.82-2.15-3.26zM14.39 6.86c.56-.68.94-1.62.83-2.56-.81.03-1.79.54-2.37 1.21-.52.6-.97 1.56-.85 2.48.9.07 1.83-.46 2.39-1.13z" />
        </svg>
        <span data-eos-id="web/components/store-badges.tsx#4" className="leading-none">
          <span data-eos-id="web/components/store-badges.tsx#5" className="block text-[8px] uppercase tracking-wide opacity-80">Download on the</span>
          <span data-eos-id="web/components/store-badges.tsx#6" className="block text-sm font-semibold">App Store</span>
        </span>
      </a>
      <a data-eos-href="dynamic" data-eos-href-label="Play store url" data-eos-href-scope="prop" data-eos-id="web/components/store-badges.tsx#7"
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Get Co-Exist on Google Play"
        className="inline-flex items-center gap-2.5 rounded-xl bg-neutral-900 px-4 py-2.5 text-white transition-transform duration-300 hover:-translate-y-0.5"
      >
        <svg data-eos-id="web/components/store-badges.tsx#8" width="18" height="18" viewBox="0 0 24 24" aria-hidden>
          <path data-eos-id="web/components/store-badges.tsx#9" d="M3.6 2.4c-.25.26-.4.66-.4 1.18v16.84c0 .52.15.92.4 1.18l.06.05L13 12.06v-.12L3.66 2.35l-.06.05z" fill="#34A853" />
          <path data-eos-id="web/components/store-badges.tsx#10" d="M16.5 15.56 13 12.06v-.12l3.5-3.5.08.05 4.15 2.36c1.18.67 1.18 1.77 0 2.45l-4.15 2.36-.08.05z" fill="#FBBC04" />
          <path data-eos-id="web/components/store-badges.tsx#11" d="M16.58 15.51 13 12 3.6 21.6c.39.41 1.03.46 1.76.05l11.22-6.14z" fill="#EA4335" />
          <path data-eos-id="web/components/store-badges.tsx#12" d="M16.58 8.49 5.36 2.35c-.73-.41-1.37-.36-1.76.05L13 12l3.58-3.51z" fill="#4285F4" />
        </svg>
        <span data-eos-id="web/components/store-badges.tsx#13" className="leading-none">
          <span data-eos-id="web/components/store-badges.tsx#14" className="block text-[8px] uppercase tracking-wide opacity-80">Get it on</span>
          <span data-eos-id="web/components/store-badges.tsx#15" className="block text-sm font-semibold">Google Play</span>
        </span>
      </a>
    </div>
  )
}
