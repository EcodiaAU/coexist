import { NewsletterForm } from './newsletter-form'

/**
 * Prominent, on-aesthetic newsletter section. Sits just above the footer on
 * every page (olive band + grain), so the email signup is far more visible than
 * a footer field. Feeds the same /api/newsletter -> newsletter_subscribers list.
 */
export function NewsletterBand() {
  return (
    <section data-eos-id="web/components/newsletter-band.tsx#0" className="relative isolate overflow-hidden bg-olive-800 text-oncream">
      <div data-eos-id="web/components/newsletter-band.tsx#1" className="grain-layer absolute inset-0 z-0" />
      <div data-eos-id="web/components/newsletter-band.tsx#2" className="relative z-10 mx-auto max-w-3xl px-6 py-20 text-center sm:py-24">
        <h2 data-eos-id="web/components/newsletter-band.tsx#3" className="text-4xl text-oncream sm:text-5xl">News and events, worth opening</h2>
        <p data-eos-id="web/components/newsletter-band.tsx#4" className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-oncream/80">
          Upcoming events, what collectives are up to, and ways to get outside. Straight to your
          inbox, only when there is something good to share.
        </p>
        <NewsletterForm data-eos-id="web/components/newsletter-band.tsx#5" tone="light" className="mx-auto mt-8 max-w-md justify-center" />
        <p data-eos-id="web/components/newsletter-band.tsx#6" className="mt-4 text-xs text-oncream/55">No spam. Unsubscribe any time.</p>
      </div>
    </section>
  )
}
