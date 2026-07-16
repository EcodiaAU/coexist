import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { getSrcSet, getPlaceholderUrl, getTransformUrl, isSupabaseStorageUrl } from '@/lib/image-utils'

interface ProgressiveImageProps {
  src: string
  alt: string
  /** Low-quality placeholder (blur-up) - auto-generated for Supabase URLs if omitted */
  placeholder?: string
  aspectRatio?: string
  /** CSS sizes attribute for responsive srcset */
  sizes?: string
  className?: string
}

/**
 * Image lazy loading with blur -> sharp progressive loading.
 * Now enhanced with responsive srcset and auto-generated placeholders.
 */
export function ProgressiveImage({
  src,
  alt,
  placeholder,
  aspectRatio = '16/9',
  sizes = '100vw',
  className,
}: ProgressiveImageProps) {
  const shouldReduceMotion = useReducedMotion()
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  const handleLoad = useCallback(() => setLoaded(true), [])
  const handleError = useCallback(() => setError(true), [])

  // Check if already cached on mount
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true)
    }
  }, [src])

  const autoPlaceholder = placeholder || getPlaceholderUrl(src)
  const srcSet = getSrcSet(src)
  const imgSrc = isSupabaseStorageUrl(src)
    ? getTransformUrl(src, { width: 1280, quality: 80 })
    : src

  return (
    <div data-eos-id="src/components/progressive-image.tsx#0"
      className={cn('relative overflow-hidden bg-white', className)}
      style={{ aspectRatio }}
    >
      {/* Placeholder / blur layer */}
      {autoPlaceholder && !loaded && !error && (
        <img data-eos-id="src/components/progressive-image.tsx#1"
          src={autoPlaceholder}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover blur-xl scale-110"
        />
      )}

      {/* Shimmer while loading (only if no placeholder available) */}
      {!loaded && !error && !autoPlaceholder && (
        <div data-eos-id="src/components/progressive-image.tsx#2"
          className={cn(
            'absolute inset-0 bg-white',
            'before:absolute before:inset-0',
            'before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent',
            'before:animate-[shimmer_1.5s_ease-in-out_infinite]',
            'motion-reduce:before:animate-none',
          )}
          aria-hidden="true"
        />
      )}

      {/* Full image */}
      {!error && (
        <motion.img data-eos-id="src/components/progressive-image.tsx#3"
          ref={imgRef}
          src={imgSrc}
          srcSet={srcSet || undefined}
          sizes={srcSet ? sizes : undefined}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            'absolute inset-0 w-full h-full object-cover',
            !loaded && 'opacity-0',
          )}
          initial={false}
          animate={loaded ? { opacity: 1 } : { opacity: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3 }}
        />
      )}

      {/* Error fallback */}
      {error && (
        <div data-eos-id="src/components/progressive-image.tsx#4" className="absolute inset-0 flex items-center justify-center bg-white">
          <span data-eos-id="src/components/progressive-image.tsx#5" className="text-sm text-neutral-500">Image unavailable</span>
        </div>
      )}
    </div>
  )
}
