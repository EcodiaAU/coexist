import { cn } from '@/lib/cn'

type SkeletonVariant =
  | 'text'
  | 'title'
  | 'avatar'
  | 'card'
  | 'stat-card'
  | 'image'
  | 'list-item'

interface SkeletonProps {
  variant?: SkeletonVariant
  className?: string
  /** Repeat the skeleton n times (applies to text and list-item variants) */
  count?: number
}

const shimmerClass = [
  'relative overflow-hidden bg-primary-100',
  'before:absolute before:inset-0',
  'before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent',
  'before:animate-[shimmer_1.5s_ease-in-out_infinite]',
  'motion-reduce:before:animate-none',
].join(' ')

const variantStyles: Record<SkeletonVariant, string> = {
  text: 'h-4 rounded w-full',
  title: 'h-6 rounded w-3/4',
  avatar: 'rounded-full',
  card: 'h-48 rounded-md w-full',
  'stat-card': 'h-24 rounded-sm w-full',
  image: 'aspect-video rounded-sm w-full',
  'list-item': '', // composite - handled separately
}

function ShimmerBlock({ className }: { className?: string }) {
  return (
    <div data-eos-id="src/components/skeleton.tsx#0" data-eos-v="2"
      className={cn(shimmerClass, className)}
      aria-hidden="true"
    />
  )
}

function ListItemSkeleton({ className }: { className?: string }) {
  return (
    <div data-eos-id="src/components/skeleton.tsx#1" className={cn('flex items-center gap-3', className)}>
      <ShimmerBlock data-eos-id="src/components/skeleton.tsx#2" className="h-10 w-10 shrink-0 rounded-full" />
      <div data-eos-id="src/components/skeleton.tsx#3" className="flex-1 space-y-2">
        <ShimmerBlock data-eos-id="src/components/skeleton.tsx#4" className="h-4 rounded w-3/4" />
        <ShimmerBlock data-eos-id="src/components/skeleton.tsx#5" className="h-3 rounded w-1/2" />
      </div>
    </div>
  )
}

export function Skeleton({
  variant = 'text',
  className,
  count = 1,
}: SkeletonProps) {
  const repeatable = variant === 'text' || variant === 'list-item'
  const times = repeatable ? Math.max(1, count) : 1

  if (variant === 'list-item') {
    return (
      <div data-eos-id="src/components/skeleton.tsx#6" className={cn('space-y-4', className)} role="status" aria-label="Loading">
        {Array.from({ length: times }, (_, i) => (
          <ListItemSkeleton data-eos-id="src/components/skeleton.tsx#7" key={i} />
        ))}
        <span data-eos-id="src/components/skeleton.tsx#8" className="sr-only">Loading content</span>
      </div>
    )
  }

  if (variant === 'avatar') {
    return (
      <div data-eos-id="src/components/skeleton.tsx#9" role="status" aria-label="Loading" className={cn('inline-block', className)}>
        <ShimmerBlock data-eos-id="src/components/skeleton.tsx#10" className={cn(variantStyles.avatar, 'h-10 w-10', className)} />
        <span data-eos-id="src/components/skeleton.tsx#11" className="sr-only">Loading content</span>
      </div>
    )
  }

  if (times > 1) {
    return (
      <div data-eos-id="src/components/skeleton.tsx#12" className={cn('space-y-3', className)} role="status" aria-label="Loading">
        {Array.from({ length: times }, (_, i) => (
          <ShimmerBlock data-eos-id="src/components/skeleton.tsx#13"
            key={i}
            className={cn(
              variantStyles[variant],
              // Vary widths for a more natural look
              i === times - 1 && 'w-2/3',
            )}
          />
        ))}
        <span data-eos-id="src/components/skeleton.tsx#14" className="sr-only">Loading content</span>
      </div>
    )
  }

  return (
    <div data-eos-id="src/components/skeleton.tsx#15" role="status" aria-label="Loading">
      <ShimmerBlock data-eos-id="src/components/skeleton.tsx#16" className={cn(variantStyles[variant], className)} />
      <span data-eos-id="src/components/skeleton.tsx#17" className="sr-only">Loading content</span>
    </div>
  )
}
