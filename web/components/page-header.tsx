export function PageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
}) {
  return (
    <section className="border-b border-neutral-200/60 bg-cream">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        {eyebrow && <p className="eyebrow text-primary-600">{eyebrow}</p>}
        <h1 className="mt-3 max-w-4xl text-[2.6rem] leading-[1.03] text-neutral-900 sm:text-6xl">{title}</h1>
        {subtitle && <p className="mt-5 max-w-2xl text-lg text-neutral-600">{subtitle}</p>}
      </div>
    </section>
  )
}
