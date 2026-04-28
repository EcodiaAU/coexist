/* eslint-disable react-refresh/only-export-components */
import {
    type ReactNode,
    createContext,
    useContext,
    forwardRef,
} from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
    TreePine,
    Waves,
    Sprout,
    Compass,
    Bird,
    Flower2,
    Droplets,
    Leaf,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { coverImagePositionStyle } from '@/lib/cover-image'
import { OptimizedImage } from './optimized-image'

/* ------------------------------------------------------------------ */
/*  Nature watermarks - Lucide icons used as large, low-opacity marks  */
/* ------------------------------------------------------------------ */

/** Map activity types to their watermark Lucide icon */
const ACTIVITY_WATERMARK_ICONS: Record<string, ReactNode> = {
  clean_up:               <Waves size={72} strokeWidth={1} />,
  tree_planting:           <TreePine size={72} strokeWidth={1} />,
  ecosystem_restoration:   <Sprout size={72} strokeWidth={1} />,
  nature_hike:             <Compass size={72} strokeWidth={1} />,
  camp_out:                <Bird size={72} strokeWidth={1} />,
  spotlighting:            <Flower2 size={72} strokeWidth={1} />,
  other:                   <Leaf size={72} strokeWidth={1} />,
}

const DEFAULT_WATERMARK = <Leaf size={72} strokeWidth={1} />

export function getWatermark(activityType?: string): ReactNode {
  if (!activityType) return DEFAULT_WATERMARK
  return ACTIVITY_WATERMARK_ICONS[activityType] ?? DEFAULT_WATERMARK
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

type CardVariant =
  | 'event'
  | 'collective'
  | 'stat'
  | 'profile'
  | 'merch'
  | 'announcement'

interface CardContextValue {
  variant: CardVariant
}

const CardContext = createContext<CardContextValue>({ variant: 'event' })

function useCard() {
  return useContext(CardContext)
}

/* ------------------------------------------------------------------ */
/*  Variant-specific styling                                           */
/* ------------------------------------------------------------------ */

const variantWrapper: Record<CardVariant, string> = {
  event: 'bg-white',
  collective: 'bg-white',
  stat: 'bg-white',
  profile: 'bg-white',
  merch: 'bg-white',
  announcement: 'bg-white',
}

/* ------------------------------------------------------------------ */
/*  Card (root)                                                        */
/* ------------------------------------------------------------------ */

interface CardRootProps {
  variant?: CardVariant
  children: ReactNode
  className?: string
  onClick?: React.MouseEventHandler<HTMLDivElement>
  'aria-label'?: string
  /** Activity type for nature watermark decoration */
  watermark?: string | boolean
}

const CardRoot = forwardRef<HTMLDivElement, CardRootProps>(function CardRoot(
  { variant = 'event', children, className, onClick, 'aria-label': ariaLabel, watermark },
  ref,
) {
  const shouldReduceMotion = useReducedMotion()
  const isInteractive = !!onClick
  const watermarkIcon = watermark === true
    ? DEFAULT_WATERMARK
    : typeof watermark === 'string'
      ? (ACTIVITY_WATERMARK_ICONS[watermark] ?? DEFAULT_WATERMARK)
      : null

  return (
    <CardContext.Provider value={{ variant }}>
      <motion.div
        ref={ref}
        role={isInteractive ? 'button' : 'article'}
        tabIndex={isInteractive ? 0 : undefined}
        aria-label={ariaLabel}
        onClick={onClick}
        onKeyDown={
          isInteractive
            ? (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>)
                }
              }
            : undefined
        }
        whileTap={
          isInteractive && !shouldReduceMotion
            ? { scale: 0.98 }
            : undefined
        }
        transition={{ type: 'spring', stiffness: 400, damping: 26, mass: 0.7 }}
        className={cn(
          'relative rounded-2xl shadow-sm overflow-hidden',
          isInteractive && 'cursor-pointer select-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2',
          variantWrapper[variant],
          className,
        )}
      >
        {children}
        {watermarkIcon && (
          <div
            className="absolute -bottom-2 -right-2 opacity-[0.06] text-neutral-800 pointer-events-none"
            aria-hidden="true"
          >
            {watermarkIcon}
          </div>
        )}
      </motion.div>
    </CardContext.Provider>
  )
})

/* ------------------------------------------------------------------ */
/*  Card.Image                                                         */
/* ------------------------------------------------------------------ */

interface CardImageProps {
  src: string
  alt: string
  aspectRatio?: string
  className?: string
  /** Focal point x percent (0-100). Defaults to 50. */
  positionX?: number | null
  /** Focal point y percent (0-100). Defaults to 50. */
  positionY?: number | null
}

function CardImage({
  src,
  alt,
  aspectRatio = '16/9',
  className,
  positionX,
  positionY,
}: CardImageProps) {
  const { variant } = useCard()
  const hasGradient = variant === 'event'

  return (
    <div className={cn('relative w-full overflow-hidden', className)} style={{ aspectRatio }}>
      <OptimizedImage
        src={src}
        alt={alt}
        aspectRatio={aspectRatio}
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        className="absolute inset-0"
        imgStyle={coverImagePositionStyle(positionX, positionY)}
      />
      {hasGradient && (
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"
          aria-hidden="true"
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Card.Overlay - full-bleed image with text overlay                  */
/* ------------------------------------------------------------------ */

interface CardOverlayProps {
  src: string
  alt: string
  aspectRatio?: string
  children: ReactNode
  className?: string
  /** Gradient direction: 'bottom' (default) or 'top' */
  gradientFrom?: 'bottom' | 'top'
  /** Focal point x percent (0-100). Defaults to 50. */
  positionX?: number | null
  /** Focal point y percent (0-100). Defaults to 50. */
  positionY?: number | null
}

function CardOverlay({
  src,
  alt,
  aspectRatio = '3/2',
  children,
  className,
  gradientFrom = 'bottom',
  positionX,
  positionY,
}: CardOverlayProps) {
  const gradientClass = gradientFrom === 'top'
    ? 'bg-gradient-to-b from-black/60 via-black/25 to-transparent'
    : 'bg-gradient-to-t from-black/65 via-black/30 to-transparent'

  return (
    <div className={cn('relative w-full overflow-hidden', className)} style={{ aspectRatio }}>
      <OptimizedImage
        src={src}
        alt={alt}
        aspectRatio={aspectRatio}
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        className="absolute inset-0"
        imgStyle={coverImagePositionStyle(positionX, positionY)}
      />
      <div className={cn('absolute inset-0', gradientClass)} aria-hidden="true" />
      <div className="absolute inset-0 flex flex-col justify-end p-4">
        {children}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Card.Badge                                                         */
/* ------------------------------------------------------------------ */

interface CardBadgeProps {
  children: ReactNode
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  className?: string
}

const badgePositionMap: Record<NonNullable<CardBadgeProps['position']>, string> = {
  'top-left': 'top-2 left-2',
  'top-right': 'top-2 right-2',
  'bottom-left': 'bottom-2 left-2',
  'bottom-right': 'bottom-2 right-2',
}

function CardBadge({
  children,
  position = 'top-right',
  className,
}: CardBadgeProps) {
  return (
    <span
      className={cn(
        'absolute z-10',
        badgePositionMap[position],
        className,
      )}
    >
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Card.Content                                                       */
/* ------------------------------------------------------------------ */

interface CardContentProps {
  children: ReactNode
  className?: string
}

function CardContent({ children, className }: CardContentProps) {
  return <div className={cn('p-4', className)}>{children}</div>
}

/* ------------------------------------------------------------------ */
/*  Card.Title                                                         */
/* ------------------------------------------------------------------ */

interface CardTitleProps {
  children: ReactNode
  as?: 'h2' | 'h3' | 'h4' | 'h5'
  className?: string
}

function CardTitle({ children, as: Tag = 'h3', className }: CardTitleProps) {
  return (
    <Tag
      className={cn(
        'font-heading font-semibold text-neutral-900 leading-tight',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

/* ------------------------------------------------------------------ */
/*  Card.Meta                                                          */
/* ------------------------------------------------------------------ */

interface CardMetaProps {
  children: ReactNode
  className?: string
}

function CardMeta({ children, className }: CardMetaProps) {
  return (
    <p className={cn('text-caption text-neutral-500 mt-1', className)}>
      {children}
    </p>
  )
}

/* ------------------------------------------------------------------ */
/*  Card.Skeleton                                                      */
/* ------------------------------------------------------------------ */

interface CardSkeletonProps {
  hasImage?: boolean
  lines?: number
  className?: string
}

function CardSkeleton({
  hasImage = true,
  lines = 3,
  className,
}: CardSkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading card"
      className={cn(
        'rounded-2xl shadow-sm overflow-hidden bg-white animate-pulse',
        className,
      )}
    >
      {hasImage && (
        <div className="w-full bg-neutral-100" style={{ aspectRatio: '16/9' }} />
      )}
      <div className="p-4 space-y-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-3.5 bg-neutral-100 rounded',
              i === 0 && 'w-3/4 h-4',
              i === lines - 1 && 'w-1/2',
            )}
          />
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Compound export                                                    */
/* ------------------------------------------------------------------ */

export const Card = Object.assign(CardRoot, {
  Root: CardRoot,
  Image: CardImage,
  Overlay: CardOverlay,
  Badge: CardBadge,
  Content: CardContent,
  Title: CardTitle,
  Meta: CardMeta,
  Skeleton: CardSkeleton,
})
