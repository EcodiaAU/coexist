import Link from 'next/link'

/**
 * Full-bleed bento tile in the Co-Exist film aesthetic: edge-to-edge cover image,
 * a subtle olive film tint + grain, a bottom gradient so overlaid text reads, and
 * a slow hover zoom. Children render the overlaid label (bottom-left by default).
 *
 * tint: olive film wash (default true) - set false for shop product shots so the
 * product colour stays true while keeping the full-bleed look.
 */
export function BentoTile({
  href,
  external = false,
  image,
  hoverImage,
  alt = '',
  span = '',
  tint = true,
  children,
}: {
  href: string
  external?: boolean
  image?: string | null
  hoverImage?: string | null
  alt?: string
  span?: string
  tint?: boolean
  children?: React.ReactNode
}) {
  const inner = (
    <>
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt={alt}
            loading="lazy"
            className={`absolute inset-0 -z-30 h-full w-full object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.06] ${hoverImage ? 'group-hover:opacity-0' : ''}`}
          />
          {hoverImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hoverImage}
              alt=""
              aria-hidden
              loading="lazy"
              className="absolute inset-0 -z-30 h-full w-full object-cover opacity-0 transition-opacity duration-700 group-hover:opacity-100"
            />
          ) : null}
        </>
      ) : null}
      {tint ? <div className="absolute inset-0 -z-20 bg-olive-900/35 mix-blend-multiply transition-opacity duration-500 group-hover:opacity-50" /> : null}
      <div className="absolute inset-0 -z-20 bg-gradient-to-t from-olive-950/85 via-olive-950/10 to-transparent" />
      <div className="grain-layer absolute inset-0 -z-10" />
      {children}
    </>
  )

  const cls = `group relative isolate block overflow-hidden bg-olive-900 ${span}`
  return external ? (
    <a href={href} className={cls}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  )
}
