import { NewsletterForm } from './newsletter-form'
import { BillingBlock } from './billing-block'

/**
 * Prominent, on-aesthetic newsletter section. Sits just above the footer on
 * every page (olive band + grain), so the email signup is far more visible than
 * a footer field. Feeds the same /api/newsletter -> newsletter_subscribers list.
 */
export function NewsletterBand() {
  return (
    <section className="relative isolate overflow-hidden bg-olive-800 text-oncream">
      <div className="grain-layer absolute inset-0 z-0" />
      <BillingBlock
        className="bottom-6 right-6 hidden sm:block"
        text="CO-EXIST AUSTRALIA. a nationwide movement of young people protecting the places they love. EXPLORE. CONNECT. PROTECT. join a collective, attend an event, get outside. EST. 2022."
      />
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-20 text-center sm:py-24">
        <h2 className="text-4xl text-oncream sm:text-5xl">News and events, worth opening</h2>
        <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-oncream/80">
          Upcoming events, what collectives are up to, and ways to get outside. Straight to your
          inbox, only when there is something good to share.
        </p>
        <NewsletterForm tone="light" className="mx-auto mt-8 max-w-md justify-center" />
        <p className="mt-4 text-xs text-oncream/55">No spam. Unsubscribe any time.</p>
      </div>
    </section>
  )
}
