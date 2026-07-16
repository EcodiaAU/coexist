import { BLUR } from '@/lib/blur'
import { ParallaxImage } from '@/components/parallax-image'

/**
 * Cinematic page header. Optionally renders over a full-bleed image with a dark
 * olive wash (editorial cover); otherwise a tall, airy white header. Either way
 * a huge thin Avenir title with credit-roll eyebrow.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  image,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  image?: string
}) {
  if (image) {
    return (
      <section data-eos-id="web/components/page-header.tsx#0" data-eos-v="2" className="film-cover relative isolate flex min-h-[72vh] items-center justify-center overflow-hidden lg:min-h-[82vh]">
        <ParallaxImage data-eos-id="web/components/page-header.tsx#1" src={image} priority blurDataURL={BLUR[image]} />
        <div data-eos-id="web/components/page-header.tsx#2" className="grain-layer absolute inset-0 z-0" />
        <div data-eos-id="web/components/page-header.tsx#3" className="relative z-10 mx-auto w-full max-w-3xl px-6 py-32 text-center translate-x-[4px] translate-y-[0px]">
          {eyebrow && <p data-eos-id="web/components/page-header.tsx#4" className="eyebrow text-oncream/70">{eyebrow}</p>}
          <h1 data-eos-id="web/components/page-header.tsx#5" className="display-tight mx-auto mt-4 max-w-4xl text-[3.25rem] leading-[0.92] text-oncream sm:text-7xl">{title}</h1>
          {subtitle && <p data-eos-id="web/components/page-header.tsx#6" className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-oncream/90">{subtitle}</p>}
        </div>
      </section>
    )
  }
  return (
    <section data-eos-id="web/components/page-header.tsx#7" className="relative isolate flex min-h-[58vh] items-center justify-center overflow-hidden bg-white lg:min-h-[64vh]">
      <div data-eos-id="web/components/page-header.tsx#8" className="relative z-10 mx-auto w-full max-w-3xl px-6 py-28 text-center">
        {eyebrow && <p data-eos-id="web/components/page-header.tsx#9" className="eyebrow text-primary-600">{eyebrow}</p>}
        <h1 data-eos-id="web/components/page-header.tsx#10" className="display-tight mx-auto mt-5 max-w-4xl text-[3.25rem] leading-[0.92] text-neutral-900 sm:text-8xl">{title}</h1>
        {subtitle && <p data-eos-id="web/components/page-header.tsx#11" className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-neutral-500">{subtitle}</p>}
      </div>
    </section>
  )
}
