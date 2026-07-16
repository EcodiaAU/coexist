'use client'

import Image from 'next/image'
import { useEffect, useRef } from 'react'

/**
 * Full-bleed hero image with a gentle scroll parallax. The image sits in a taller
 * container (extra headroom top + bottom) and translates at a fraction of scroll
 * so it drifts slower than the page. Respects prefers-reduced-motion. Place inside
 * a position:relative + overflow-hidden section.
 *
 * `paper` renders the brand paper-texture INSIDE the transformed container, so the
 * texture is locked to the image and parallaxes with it (one printed surface).
 * `blur` applies a light uniform blur across the whole image for a soft hero.
 */
export function ParallaxImage({
  src,
  priority = false,
  blurDataURL,
  className = '',
  paper = false,
  blur = false,
}: {
  src: string
  priority?: boolean
  blurDataURL?: string
  className?: string
  paper?: boolean
  blur?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    const section = el?.parentElement
    if (!el || !section) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    const update = () => {
      raf = 0
      const top = section.getBoundingClientRect().top
      // image drifts down as the section scrolls up (and vice versa), slower than page
      el.style.transform = `translate3d(0, ${(-top * 0.18).toFixed(1)}px, 0)`
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div data-eos-id="web/components/parallax-image.tsx#0" data-eos-v="2" ref={ref} className="absolute inset-x-0 -top-[20%] -z-10 h-[140%] will-change-transform">
      <Image data-eos-id="web/components/parallax-image.tsx#1"
        src={src}
        alt=""
        fill
        priority={priority}
        unoptimized
        sizes="100vw"
        {...(priority ? { fetchPriority: 'high' as const } : {})}
        className={`object-cover ${blur ? 'blur-[3px]' : ''} ${className}`}
        {...(blurDataURL ? { placeholder: 'blur' as const, blurDataURL } : {})}
      />
      {/* paper texture rides inside the transformed container so it is locked to
          the image and parallaxes with it (printed-surface feel) */}
      {paper && <div data-eos-id="web/components/parallax-image.tsx#2" className="paper-texture absolute inset-0" />}
    </div>
  )
}
