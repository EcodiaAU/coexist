import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { cn } from '@/lib/cn'
import { coverImagePositionStyle } from '@/lib/cover-image'

interface CoverImageFocalPointPickerProps {
  imageUrl: string
  /** 0-100, percentage offset from the left of the image. */
  x: number
  /** 0-100, percentage offset from the top of the image. */
  y: number
  /** Fired with rounded integer percentages when the focal point changes. */
  onChange: (x: number, y: number) => void
  disabled?: boolean
  /** Aspect ratio for the live preview container, e.g. '16/9'. */
  previewAspect?: string
  /** Debounce window for onChange in milliseconds. Defaults to 200. */
  debounceMs?: number
  className?: string
}

/**
 * Click anywhere on the image to set the focal point. The crosshair indicates
 * the current value. A live preview shows how the image will render inside a
 * fixed aspect-ratio container with `object-fit: cover`.
 *
 * v1: focal-point only. No real cropping. Persists as two integer columns
 * (`cover_image_position_x`, `cover_image_position_y`) on the underlying row
 * and applied at every render site via `object-position`.
 */
export function CoverImageFocalPointPicker({
  imageUrl,
  x,
  y,
  onChange,
  disabled = false,
  previewAspect = '16/9',
  debounceMs = 200,
  className,
}: CoverImageFocalPointPickerProps) {
  const [localX, setLocalX] = useState<number>(clamp(Math.round(x ?? 50)))
  const [localY, setLocalY] = useState<number>(clamp(Math.round(y ?? 50)))
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep local state in sync if the upstream value changes (e.g. when a new
  // image is uploaded and the parent resets focal point to 50/50).
  useEffect(() => {
    setLocalX(clamp(Math.round(x ?? 50)))
    setLocalY(clamp(Math.round(y ?? 50)))
  }, [x, y])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const fire = useCallback(
    (nx: number, ny: number) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onChange(nx, ny)
      }, debounceMs)
    },
    [onChange, debounceMs],
  )

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (disabled) return
      const target = event.currentTarget
      const rect = target.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const px = clamp(Math.round(((event.clientX - rect.left) / rect.width) * 100))
      const py = clamp(Math.round(((event.clientY - rect.top) / rect.height) * 100))
      setLocalX(px)
      setLocalY(py)
      fire(px, py)
    },
    [disabled, fire],
  )

  const handleNumberChange = useCallback(
    (axis: 'x' | 'y', raw: string) => {
      const parsed = Number.parseInt(raw, 10)
      if (Number.isNaN(parsed)) return
      const v = clamp(parsed)
      if (axis === 'x') {
        setLocalX(v)
        fire(v, localY)
      } else {
        setLocalY(v)
        fire(localX, v)
      }
    },
    [fire, localX, localY],
  )

  const previewStyle: CSSProperties = {
    aspectRatio: previewAspect,
    ...coverImagePositionStyle(localX, localY),
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-neutral-700">
          Focal point
        </p>
        <p className="text-xs text-neutral-500">
          Tap the cover image to choose which part stays visible when the image
          is cropped to fit different layouts.
        </p>
      </div>

      <div
        role={disabled ? undefined : 'button'}
        tabIndex={disabled ? undefined : 0}
        aria-label={
          disabled
            ? 'Cover image focal point'
            : 'Click to set the cover image focal point'
        }
        onClick={handleClick}
        onKeyDown={(event) => {
          if (disabled) return
          // Arrow-key nudge for keyboard users.
          if (event.key === 'ArrowLeft') {
            const v = clamp(localX - 1)
            setLocalX(v)
            fire(v, localY)
            event.preventDefault()
          } else if (event.key === 'ArrowRight') {
            const v = clamp(localX + 1)
            setLocalX(v)
            fire(v, localY)
            event.preventDefault()
          } else if (event.key === 'ArrowUp') {
            const v = clamp(localY - 1)
            setLocalY(v)
            fire(localX, v)
            event.preventDefault()
          } else if (event.key === 'ArrowDown') {
            const v = clamp(localY + 1)
            setLocalY(v)
            fire(localX, v)
            event.preventDefault()
          }
        }}
        className={cn(
          'relative rounded-xl overflow-hidden border border-neutral-200 select-none',
          disabled ? 'cursor-not-allowed opacity-70' : 'cursor-crosshair',
        )}
        data-testid="cover-image-focal-point-picker"
      >
        <img
          src={imageUrl}
          alt="Cover (full)"
          className="w-full h-auto block pointer-events-none"
          draggable={false}
        />
        {/* Crosshair indicator */}
        <div
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            left: `${localX}%`,
            top: `${localY}%`,
            transform: 'translate(-50%, -50%)',
          }}
          data-testid="cover-image-focal-point-indicator"
        >
          <div className="w-5 h-5 rounded-full border-2 border-white shadow-md bg-primary-500/80" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-white" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-neutral-700">
          <span className="w-4">x</span>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={localX}
            onChange={(e) => handleNumberChange('x', e.target.value)}
            disabled={disabled}
            className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-sm"
            aria-label="Focal point x percentage"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-neutral-700">
          <span className="w-4">y</span>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={localY}
            onChange={(e) => handleNumberChange('y', e.target.value)}
            disabled={disabled}
            className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-sm"
            aria-label="Focal point y percentage"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setLocalX(50)
            setLocalY(50)
            fire(50, 50)
          }}
          disabled={disabled || (localX === 50 && localY === 50)}
          className={cn(
            'ml-auto text-xs text-neutral-500 hover:text-neutral-700 disabled:opacity-40',
            'cursor-pointer disabled:cursor-not-allowed',
          )}
        >
          Reset to centre
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-neutral-700">Live preview</p>
        <div className="rounded-xl overflow-hidden bg-neutral-100">
          <img
            src={imageUrl}
            alt="Cover preview"
            className="w-full object-cover block"
            style={previewStyle}
            data-testid="cover-image-focal-point-preview"
          />
        </div>
      </div>
    </div>
  )
}

function clamp(n: number): number {
  if (n < 0) return 0
  if (n > 100) return 100
  return n
}
