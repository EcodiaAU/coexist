import { type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/cn'

interface HeaderProps {
  title: string
  back?: boolean
  onBack?: () => void
  rightActions?: ReactNode
  /** Render with no background  back button gets a glass pill for contrast on images */
  transparent?: boolean
  /** Back button gets a dark filled circle background */
  backDark?: boolean
  /** Display the title text in the header center zone */
  showTitle?: boolean
  className?: string
}

export function Header({
  title,
  back = false,
  onBack,
  rightActions,
  transparent = false,
  backDark = false,
  showTitle = false,
  className,
}: HeaderProps) {
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()

  const handleBack = () => {
    if (onBack) {
      onBack()
    } else {
      navigate(-1)
    }
  }

  // No back button and no right actions → nothing to render
  if (!back && !rightActions) return null

  return (
    <div data-eos-id="src/components/header.tsx#0"
      className={cn(
        'sticky z-40',
        'px-4',
        // Empty zones in the header bar should not intercept clicks/taps;
        // only the back button and right actions do. Without this, the
        // 56px-tall sticky bar absorbs taps on content underneath even
        // though most of it is visually empty.
        'pointer-events-none',
        className,
      )}
      style={{
        top: 'var(--safe-top)',
      }}
      aria-label={`${title} page header`}
    >
      <div data-eos-id="src/components/header.tsx#1" className="flex items-center h-14">
        {/* Left zone: back button */}
        <div data-eos-id="src/components/header.tsx#2" className="flex items-center shrink-0 w-10">
          {back && (
            <motion.button data-eos-id="src/components/header.tsx#3"
              type="button"
              onClick={handleBack}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className={cn(
                'flex items-center justify-center',
                'w-11 h-11 -ml-1 rounded-full',
                'cursor-pointer select-none pointer-events-auto',
                'transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                transparent
                  ? 'bg-black/40 text-white hover:bg-black/50'
                  : backDark
                    ? 'bg-primary-800 text-white hover:bg-primary-700 shadow-sm'
                    : 'text-neutral-900 hover:bg-neutral-100',
              )}
              aria-label="Go back"
            >
              <ArrowLeft data-eos-id="src/components/header.tsx#4" size={22} />
            </motion.button>
          )}
        </div>

        {/* Center zone: title or spacer */}
        <div data-eos-id="src/components/header.tsx#5" className="flex-1 min-w-0">
          {showTitle && (
            <p data-eos-id="src/components/header.tsx#6" className={cn(
              'text-sm font-bold truncate pl-2 pointer-events-auto',
              transparent ? 'text-white' : 'text-primary-900',
            )}>
              {title}
            </p>
          )}
        </div>

        {/* Right zone: actions. Only re-enable pointer events when there
            are actually actions  an empty zone would silently eat taps. */}
        <div data-eos-id="src/components/header.tsx#7"
          className={cn(
            'flex items-center shrink-0 gap-1 justify-end',
            rightActions && 'pointer-events-auto',
          )}
        >
          {rightActions}
        </div>
      </div>
    </div>
  )
}
