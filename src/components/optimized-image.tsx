import { useState, useCallback, useRef, useEffect, type CSSProperties } from 'react'
import { cn } from '@/lib/cn'
import { getSrcSet, getPlaceholderUrl, getTransformUrl, isSupabaseStorageUrl } from '@/lib/image-utils'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface OptimizedImageProps {
  src: string
  alt: string
  /** CSS sizes attribute - tells the browser how wide the image renders at each breakpoint */
  sizes?: string
  /** Explicit widths for srcset generation. Defaults to [320, 640, 768, 1024, 1280] */
  srcSetWidths?: readonly number[]
  /** Quality for Supabase transforms (default 80) */
  quality?: number
  /** Aspect ratio CSS value (e.g. "16/9", "2.2/1") - sets on the wrapper */
  aspectRatio?: string
  /** Priority image (hero/above-fold): eager loading, high fetch priority, no blur-up */
  priority?: boolean
  /** Additional class on the <img> element */
  className?: string
  /** Additional class on the wrapper div */
  wrapperClassName?: string
  /** Inline style merged onto the <img> element (e.g. focal point object-position). */
  imgStyle?: CSSProperties
  /** Callback when the image finishes loading */
  onLoad?: () => void
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * Optimised image component for the Co-Exist app.
 *
 * - Generates responsive srcset via Supabase Storage transforms
 * - Lazy loads by default (eager when `priority` is set)
 * - Uses `decoding="async"` to avoid blocking the main thread
 * - Shows a tiny blurred placeholder while loading (blur-up)
 * - Graceful error fallback
 */
export function OptimizedImage({
  src,
  alt,
  sizes = '100vw',
  srcSetWidths,
  quality = 80,
  aspectRatio,
  priority = false,
  className,
  wrapperClassName,
  imgStyle,
  onLoad,
}: OptimizedImageProps) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  // If the image is already cached by the browser, onload fires synchronously
  // before React attaches the handler. Check on mount.
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true)
    }
  }, [src])

  const handleLoad = useCallback(() => {
    setLoaded(true)
    onLoad?.()
  }, [onLoad])

  const handleError = useCallback(() => setError(true), [])

  // Build srcset for Supabase Storage URLs
  const srcSet = getSrcSet(src, srcSetWidths, quality)
  const placeholderSrc = !priority ? getPlaceholderUrl(src) : ''
  const showPlaceholder = !!placeholderSrc && !loaded && !error

  // For non-Supabase URLs or priority images that need a sized src,
  // use the original. For Supabase URLs, use a sensible default (1280w).
  const imgSrc = isSupabaseStorageUrl(src)
    ? getTransformUrl(src, { width: 1280, quality })
    : src

  if (error) {
    return (
      <div data-eos-id="src/components/optimized-image.tsx#0"
        className={cn(
          'flex items-center justify-center bg-primary-50',
          wrapperClassName,
        )}
        style={aspectRatio ? { aspectRatio } : undefined}
      >
        <span data-eos-id="src/components/optimized-image.tsx#1" className="text-sm text-neutral-500">Image unavailable</span>
      </div>
    )
  }

  return (
    <div data-eos-id="src/components/optimized-image.tsx#2"
      className={cn('relative overflow-hidden', wrapperClassName)}
      style={aspectRatio ? { aspectRatio } : undefined}
    >
      {/* Tiny blur placeholder */}
      {showPlaceholder && (
        <img data-eos-id="src/components/optimized-image.tsx#3"
          src={placeholderSrc}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover blur-xl scale-110"
        />
      )}

      <img data-eos-id="src/components/optimized-image.tsx#4"
        ref={imgRef}
        src={imgSrc}
        srcSet={srcSet || undefined}
        sizes={srcSet ? sizes : undefined}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : undefined}
        onLoad={handleLoad}
        onError={handleError}
        className={cn(
          'w-full h-full object-cover',
          !loaded && 'opacity-0',
          loaded && 'opacity-100 transition-opacity duration-300',
          className,
        )}
        style={imgStyle}
      />
    </div>
  )
}
