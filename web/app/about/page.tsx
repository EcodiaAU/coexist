import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'

export const metadata: Metadata = {
  title: 'About',
  description:
    'Co-Exist is a movement built by young people, for young people. Our mission: creating communities that preserve and protect wildlife and wild places.',
}

export default function AboutPage() {
  return (
    <main>
      <PageHeader
        eyebrow="About Co-Exist"
        title="A movement built by young people, for young people"
        subtitle="When young people connect with nature, they step up to protect it."
      />

      {/* Story */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-extrabold text-neutral-900 sm:text-3xl">Our story</h2>
            <div className="mt-5 space-y-4 text-lg leading-relaxed text-neutral-600">
              <p>
                Co-Exist began with founder Kurt Jones, who found purpose outdoors after
                growing up disconnected from nature. He saw what happens when young people
                are given a reason to get outside together, and a real job to do.
              </p>
              <p>
                Co-Exist launched in 2022 with a simple idea: build a nationwide movement
                where young Australians take the lead on climate action and community in
                their own neighbourhoods, through local collectives.
              </p>
            </div>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-neutral-100 shadow-sm">
            <Image src="/images/nature.webp" alt="Young people in nature with Co-Exist" fill className="object-cover" />
          </div>
        </div>
      </section>

      {/* Mission / Vision */}
      <section className="bg-surface-1">
        <div className="mx-auto grid max-w-6xl gap-5 px-5 py-16 md:grid-cols-2">
          <div className="rounded-3xl border border-neutral-100 bg-white p-8 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary-600">Our mission</p>
            <p className="mt-3 text-xl font-semibold leading-relaxed text-neutral-900">
              Creating communities that preserve and protect wildlife and wild places.
            </p>
          </div>
          <div className="rounded-3xl border border-neutral-100 bg-white p-8 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary-600">Our vision</p>
            <p className="mt-3 text-xl font-semibold leading-relaxed text-neutral-900">
              Young people connected to nature and leading its protection and restoration.
            </p>
          </div>
        </div>
      </section>

      {/* Founder quote */}
      <section className="bg-primary-700">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center">
          <blockquote className="text-2xl font-semibold leading-relaxed text-white sm:text-3xl">
            “Imagine if we had a collective in every major town. Think of the amount of waste
            we could be cleaning. Large scale social and environmental impact. It is possible.”
          </blockquote>
          <p className="mt-6 text-sm font-bold uppercase tracking-wider text-white/70">
            Kurt Jones, Founder &amp; CEO
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-white">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center">
          <h2 className="text-2xl font-extrabold text-neutral-900 sm:text-3xl">
            Every action counts
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-lg text-neutral-600">
            Together we can create a lasting impact for people and the planet.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/collectives" className="rounded-full bg-primary-500 px-6 py-3 text-sm font-bold text-white hover:bg-primary-600">
              Join a collective
            </Link>
            <Link href="/get-involved/support" className="rounded-full border border-neutral-200 px-6 py-3 text-sm font-bold text-neutral-800 hover:bg-neutral-50">
              Support our work
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
