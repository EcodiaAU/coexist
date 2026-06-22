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
    <section className="border-b border-neutral-100 bg-surface-1">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:py-16">
        {eyebrow && (
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary-600">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-2 text-3xl font-extrabold text-neutral-900 sm:text-5xl">{title}</h1>
        {subtitle && <p className="mt-4 max-w-2xl text-lg text-neutral-600">{subtitle}</p>}
      </div>
    </section>
  )
}
