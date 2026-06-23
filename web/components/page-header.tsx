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
      <section className="film-cover relative isolate flex min-h-[72vh] items-center justify-center overflow-hidden lg:min-h-[82vh]">
        <ParallaxImage src={image} priority blurDataURL={BLUR[image]} />
        <div className="paper-texture absolute inset-0 z-0" />
        <div className="grain-layer absolute inset-0 z-0" />
        <div className="relative z-10 mx-auto w-full max-w-3xl px-6 py-32 text-center">
          {eyebrow && <p className="eyebrow text-oncream/70">{eyebrow}</p>}
          <h1 className="display-tight mx-auto mt-4 max-w-4xl text-[3.25rem] leading-[0.92] text-oncream sm:text-7xl">{title}</h1>
          {subtitle && <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-oncream/90">{subtitle}</p>}
        </div>
      </section>
    )
  }
  return (
    <section className="relative isolate flex min-h-[58vh] items-center justify-center overflow-hidden bg-white lg:min-h-[64vh]">
      <div className="paper-texture absolute inset-0 z-0" />
      <div className="relative z-10 mx-auto w-full max-w-3xl px-6 py-28 text-center">
        {eyebrow && <p className="eyebrow text-primary-600">{eyebrow}</p>}
        <h1 className="display-tight mx-auto mt-5 max-w-4xl text-[3.25rem] leading-[0.92] text-neutral-900 sm:text-8xl">{title}</h1>
        {subtitle && <p className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-neutral-500">{subtitle}</p>}
      </div>
    </section>
  )
}
