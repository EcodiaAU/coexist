import Image from 'next/image'

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
      <section className="film-cover relative isolate flex min-h-[62vh] items-end overflow-hidden">
        <Image src={image} alt="" fill priority quality={90} sizes="100vw" className="-z-10 object-cover" />
        <div className="grain-layer absolute inset-0 z-0" />
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-14 pt-40 sm:pb-20">
          {eyebrow && <p className="eyebrow text-oncream/70">{eyebrow}</p>}
          <h1 className="display-tight mt-4 max-w-4xl text-[3.25rem] leading-[0.92] text-oncream sm:text-7xl">{title}</h1>
          {subtitle && <p className="mt-5 max-w-md text-[15px] leading-relaxed text-oncream/85">{subtitle}</p>}
        </div>
      </section>
    )
  }
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-6xl px-6 pb-12 pt-36 sm:pt-44">
        {eyebrow && <p className="eyebrow text-primary-600">{eyebrow}</p>}
        <h1 className="display-tight mt-5 max-w-4xl text-[3.25rem] leading-[0.92] text-neutral-900 sm:text-8xl">{title}</h1>
        {subtitle && <p className="mt-6 max-w-md text-[15px] leading-relaxed text-neutral-500">{subtitle}</p>}
      </div>
    </section>
  )
}
