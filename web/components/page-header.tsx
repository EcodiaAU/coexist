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
      <section className="relative isolate flex min-h-[58vh] items-end overflow-hidden">
        <Image src={image} alt="" fill priority className="-z-10 object-cover" />
        <div className="-z-10 absolute inset-0 bg-gradient-to-t from-olive-950/85 via-olive-950/35 to-olive-900/20" />
        <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-40">
          {eyebrow && <p className="eyebrow text-oncream/75">{eyebrow}</p>}
          <h1 className="mt-4 max-w-4xl text-5xl leading-[0.98] text-oncream sm:text-7xl">{title}</h1>
          {subtitle && <p className="mt-5 max-w-xl text-base text-oncream/85">{subtitle}</p>}
        </div>
      </section>
    )
  }
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-6xl px-6 pb-12 pt-36 sm:pt-44">
        {eyebrow && <p className="eyebrow text-primary-600">{eyebrow}</p>}
        <h1 className="mt-5 max-w-4xl text-5xl leading-[0.98] text-neutral-900 sm:text-8xl">{title}</h1>
        {subtitle && <p className="mt-6 max-w-xl text-base leading-relaxed text-neutral-500">{subtitle}</p>}
      </div>
    </section>
  )
}
