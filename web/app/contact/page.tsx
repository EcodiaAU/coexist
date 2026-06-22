import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { ContactForm } from '@/components/contact-form'
import { WordSwap } from '@/components/word-swap'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with Co-Exist Australia. Partnerships, volunteering, media, or just to say hello.',
}

export default function ContactPage() {
  return (
    <main>
      <PageHeader
        eyebrow="Contact us"
        title="Say hello"
        subtitle="Whether you want to start a collective, partner with us, or just say hi, we read every message."
        image="/images/hero.webp"
      />

      <section className="mx-auto grid max-w-6xl gap-14 px-6 py-20 md:grid-cols-[1fr_1.1fr]">
        <div>
          <h2 className="has-mark text-4xl text-neutral-900 sm:text-5xl">
            Drop us a line to
            <span className="mt-2 block">
              <WordSwap words={['start a collective', 'partner with us', 'volunteer', 'ask us anything', 'just say hi']} />
            </span>
          </h2>
          <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-neutral-500">
            We are a small team of young people who care a lot. Real replies, no auto-responders.
            Tell us what you have in mind.
          </p>

          <div className="mt-10 space-y-8">
            <div>
              <p className="eyebrow text-neutral-400">Email</p>
              <a href="mailto:hello@coexistaus.org" className="mt-2 block text-2xl text-neutral-900 transition-colors hover:text-primary-700">
                hello@coexistaus.org
              </a>
            </div>
            <div>
              <p className="eyebrow text-neutral-400">Follow along</p>
              <div className="mt-2 flex gap-5 text-lg text-neutral-700">
                <a href="https://www.instagram.com/coexistaus" className="transition-colors hover:text-primary-700">Instagram</a>
                <a href="https://www.facebook.com/coexistaus" className="transition-colors hover:text-primary-700">Facebook</a>
              </div>
            </div>
            <p className="text-xs text-neutral-400">
              Co-Exist Australia Ltd is an ACNC registered charity. ABN 39 660 776 983.
            </p>
          </div>
        </div>

        <ContactForm />
      </section>
    </main>
  )
}
