import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { ContactForm } from '@/components/contact-form'
import { WordSwap } from '@/components/word-swap'
import { SocialIcons } from '@/components/social-icons'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with Co-Exist Australia. Partnerships, volunteering, media, or just to say hello.',
}

export default function ContactPage() {
  return (
    <main data-eos-id="web/app/contact/page.tsx#0" data-eos-v="2">
      <PageHeader data-eos-id="web/app/contact/page.tsx#1"
        eyebrow="Contact us"
        title="Say hello"
        subtitle="Whether you want to start a collective, partner with us, or just say hi, we read every message."
        image="/images/hero.webp"
      />

      <section data-eos-id="web/app/contact/page.tsx#2" className="mx-auto grid max-w-6xl gap-14 px-6 py-20 md:grid-cols-[1fr_1.1fr]">
        <div data-eos-id="web/app/contact/page.tsx#3">
          <h2 data-eos-id="web/app/contact/page.tsx#4" className="has-mark text-4xl text-neutral-900 sm:text-5xl">
            Get in touch to
            <span data-eos-id="web/app/contact/page.tsx#5" className="mt-2 block">
              <WordSwap data-eos-id="web/app/contact/page.tsx#6" words={['start a collective', 'partner with us', 'volunteer', 'ask us anything', 'just say hi']} />
            </span>
          </h2>
          <p data-eos-id="web/app/contact/page.tsx#7" className="mt-6 max-w-sm text-[15px] leading-relaxed text-neutral-500">
            We are a small team of young people who care a lot. Tell us what you have in mind.
          </p>

          <p data-eos-id="web/app/contact/page.tsx#8" className="mt-4 text-lg text-neutral-700">
            Real replies, no auto-responders. We aim to respond within one business day.
          </p>

          <div data-eos-id="web/app/contact/page.tsx#9" className="mt-10 space-y-8">
            <div data-eos-id="web/app/contact/page.tsx#10">
              <p data-eos-id="web/app/contact/page.tsx#11" className="label text-neutral-400">Email</p>
              <a data-eos-href="static" data-eos-id="web/app/contact/page.tsx#12"
                href="mailto:hello@coexistaus.org"
                className="mt-2 block text-2xl text-neutral-900 underline decoration-neutral-300 underline-offset-4 transition-[text-decoration-color] hover:decoration-olive-700"
              >
                hello@coexistaus.org
              </a>
            </div>
            <div data-eos-id="web/app/contact/page.tsx#13">
              <p data-eos-id="web/app/contact/page.tsx#14" className="label text-neutral-400">Follow along</p>
              <SocialIcons data-eos-id="web/app/contact/page.tsx#15" tone="dark" className="mt-3" />
            </div>
            <p data-eos-id="web/app/contact/page.tsx#16" className="text-xs text-neutral-400">
              Co-Exist Australia Ltd is an ACNC registered charity. ABN 39 660 776 983.
            </p>
          </div>
        </div>

        <ContactForm data-eos-id="web/app/contact/page.tsx#17" />
      </section>
    </main>
  )
}
