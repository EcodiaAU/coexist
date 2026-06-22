import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { ContactForm } from '@/components/contact-form'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with Co-Exist Australia. Partnerships, volunteering, media, or just to say hello.',
}

export default function ContactPage() {
  return (
    <main>
      <PageHeader eyebrow="Contact us" title="Say hello" subtitle="We would love to hear from you." />
      <section className="mx-auto grid max-w-5xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr]">
        <ContactForm />
        <div className="space-y-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-400">Email</p>
            <a href="mailto:hello@coexistaus.org" className="mt-1 block font-semibold text-primary-700 hover:text-primary-800">
              hello@coexistaus.org
            </a>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-400">Follow</p>
            <div className="mt-1 flex gap-4 text-sm font-semibold text-neutral-700">
              <a href="https://www.instagram.com/coexistaus" className="hover:text-primary-700">Instagram</a>
              <a href="https://www.facebook.com/coexistaus" className="hover:text-primary-700">Facebook</a>
            </div>
          </div>
          <p className="text-sm text-neutral-500">
            Co-Exist Australia Ltd is an ACNC registered charity. ABN 39 660 776 983.
          </p>
        </div>
      </section>
    </main>
  )
}
