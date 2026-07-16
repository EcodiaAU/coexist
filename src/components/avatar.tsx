import { useState } from 'react'
import { cn } from '@/lib/cn'
import { getTransformUrl, isSupabaseStorageUrl } from '@/lib/image-utils'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export interface AvatarProps {
  src?: string | null
  name?: string | null
  size?: AvatarSize
  online?: boolean
  loading?: boolean
  className?: string
  'aria-label'?: string
}

/* ------------------------------------------------------------------ */
/*  Size map                                                           */
/* ------------------------------------------------------------------ */

const sizeMap: Record<AvatarSize, { px: number; text: string; dot: string; ring: string }> = {
  xs: { px: 24, text: 'text-[11px]', dot: 'w-2 h-2 ring-1', ring: 'ring-2' },
  sm: { px: 32, text: 'text-xs', dot: 'w-2.5 h-2.5 ring-[1.5px]', ring: 'ring-2' },
  md: { px: 40, text: 'text-sm', dot: 'w-3 h-3 ring-2', ring: 'ring-2' },
  lg: { px: 56, text: 'text-base', dot: 'w-3.5 h-3.5 ring-2', ring: 'ring-[3px]' },
  xl: { px: 96, text: 'text-2xl', dot: 'w-4 h-4 ring-2', ring: 'ring-[3px]' },
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getInitials(name: string | undefined | null): string {
  if (!name?.trim()) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Avatar({
  src,
  name,
  size = 'md',
  online,
  loading = false,
  className,
  'aria-label': ariaLabel,
}: AvatarProps) {
  const [imgError, setImgError] = useState(false)
  const s = sizeMap[size]
  const showImage = src && !imgError
  const initials = getInitials(name)

  /* Skeleton */
  if (loading) {
    return (
      <div data-eos-id="src/components/avatar.tsx#0" data-eos-v="2"
        role="status"
        aria-label="Loading avatar"
        className={cn('rounded-full bg-white animate-pulse shrink-0', className)}
        style={{ width: s.px, height: s.px }}
      />
    )
  }

  return (
    <div data-eos-id="src/components/avatar.tsx#1"
      className={cn('relative inline-flex shrink-0', className)}
      style={{ width: s.px, height: s.px }}
    >
      <div data-eos-id="src/components/avatar.tsx#2"
        aria-label={ariaLabel ?? name ?? undefined}
        role="img"
        className={cn(
          'w-full h-full rounded-full overflow-hidden',
          !showImage && 'bg-primary-200',
        )}
      >
        {showImage ? (
          <img data-eos-src="dynamic" data-eos-src-label="Px" data-eos-id="src/components/avatar.tsx#3"
            src={isSupabaseStorageUrl(src!) ? getTransformUrl(src!, { width: s.px * 2, height: s.px * 2 }) : src!}
            alt={name ?? undefined}
            loading="lazy"
            decoding="async"
            width={s.px}
            height={s.px}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span data-eos-id="src/components/avatar.tsx#4"
            className={cn(
              'flex items-center justify-center w-full h-full',
              'font-heading font-semibold text-neutral-500 select-none',
              s.text,
            )}
            aria-hidden="true"
          >
            {initials}
          </span>
        )}
      </div>

      {/* Online indicator */}
      {online !== undefined && online && (
        <span data-eos-id="src/components/avatar.tsx#5"
          aria-label="Online"
          className={cn(
            'absolute bottom-0 right-0 rounded-full bg-success ring-white',
            s.dot,
          )}
        />
      )}
    </div>
  )
}
