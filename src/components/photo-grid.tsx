import { useState, useCallback, memo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { getSrcSet, getTransformUrl, isSupabaseStorageUrl } from '@/lib/image-utils'

interface GridImage {
  src: string
  alt: string
  id: string
}

interface PhotoGridProps {
  images: GridImage[]
  onImageClick?: (index: number) => void
  maxVisible?: number
  loading?: boolean
  className?: string
  'aria-label'?: string
}

const HOVER_SCALE = { scale: 1.03 }
const TAP_SCALE = { scale: 0.97 }
const SPRING_TRANSITION = { type: 'spring' as const, stiffness: 400, damping: 25 }

const PhotoItem = memo(function PhotoItem({
  image,
  index,
  isLastVisible,
  overflowCount,
  shouldReduceMotion,
  onImageClick,
  isLoaded,
  onLoad,
}: {
  image: GridImage
  index: number
  isLastVisible: boolean
  overflowCount: number
  shouldReduceMotion: boolean | null
  onImageClick?: (index: number) => void
  isLoaded: boolean
  onLoad: (id: string) => void
}) {
  const handleClick = useCallback(() => onImageClick?.(index), [onImageClick, index])
  const handleLoad = useCallback(() => onLoad(image.id), [onLoad, image.id])

  return (
    <motion.button
      key={image.id}
      type="button"
      role="gridcell"
      aria-label={isLastVisible ? `View ${overflowCount} more photos` : image.alt}
      onClick={handleClick}
      whileHover={shouldReduceMotion ? undefined : HOVER_SCALE}
      whileTap={shouldReduceMotion ? undefined : TAP_SCALE}
      transition={SPRING_TRANSITION}
      className={cn(
        'relative aspect-square overflow-hidden rounded-lg',
        'cursor-pointer select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2',
      )}
    >
      <img
        src={isSupabaseStorageUrl(image.src) ? getTransformUrl(image.src, { width: 640, quality: 80 }) : image.src}
        srcSet={getSrcSet(image.src, [200, 400, 640]) || undefined}
        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
        alt={image.alt}
        loading="lazy"
        decoding="async"
        onLoad={handleLoad}
        className={cn(
          'h-full w-full object-cover transition-opacity duration-300',
          isLoaded ? 'opacity-100' : 'opacity-0',
        )}
      />

      {!isLoaded && (
        <div
          className="absolute inset-0 animate-pulse bg-white"
          aria-hidden="true"
        />
      )}

      {isLastVisible && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/60"
          aria-hidden="true"
        >
          <span className="text-lg font-heading font-semibold text-white">
            +{overflowCount} more
          </span>
        </div>
      )}
    </motion.button>
  )
})

export function PhotoGrid({
  images,
  onImageClick,
  maxVisible = 8,
  loading = false,
  className,
  'aria-label': ariaLabel = 'Photo gallery',
}: PhotoGridProps) {
  const shouldReduceMotion = useReducedMotion()
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set())

  const handleImageLoad = useCallback((id: string) => {
    setLoadedImages((prev) => new Set(prev).add(id))
  }, [])

  if (loading) {
    return (
      <div
        role="status"
        aria-label="Loading photos"
        className={cn(
          'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2',
          className,
        )}
      >
        {Array.from({ length: maxVisible }).map((_, i) => (
          <div
            key={i}
            className="aspect-square animate-pulse rounded-lg bg-white"
          />
        ))}
        <span className="sr-only">Loading photos</span>
      </div>
    )
  }

  const hasOverflow = images.length > maxVisible
  const visibleImages = hasOverflow
    ? images.slice(0, maxVisible)
    : images
  const overflowCount = images.length - maxVisible

  return (
    <div
      role="grid"
      aria-label={ariaLabel}
      className={cn(
        'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2',
        className,
      )}
    >
      {visibleImages.map((image, index) => (
        <PhotoItem
          key={image.id}
          image={image}
          index={index}
          isLastVisible={hasOverflow && index === maxVisible - 1}
          overflowCount={overflowCount}
          shouldReduceMotion={shouldReduceMotion}
          onImageClick={onImageClick}
          isLoaded={loadedImages.has(image.id)}
          onLoad={handleImageLoad}
        />
      ))}
    </div>
  )
}
