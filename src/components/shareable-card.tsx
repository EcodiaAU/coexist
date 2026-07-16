import { useRef, useCallback, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Share2, Download, TreePine, Award, Calendar, TrendingUp } from 'lucide-react'
import html2canvas from 'html2canvas'
import { Button } from '@/components/button'
import { cn } from '@/lib/cn'
import { APP_NAME } from '@/lib/constants'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type CardVariant = 'impact' | 'badge' | 'event' | 'milestone'

interface ShareableCardProps {
  variant: CardVariant
  /** Primary heading (badge name, event title, milestone label) */
  title: string
  /** Secondary text (description, date, stat detail) */
  subtitle?: string
  /** Main stat value (trees planted, points, etc.) */
  value?: string | number
  /** Optional image URL (badge icon, event cover) */
  imageUrl?: string
  /** User's display name - shown as attribution */
  userName?: string
  /** Optional className for the outer wrapper */
  className?: string
}

/* ------------------------------------------------------------------ */
/*  Variant config                                                     */
/* ------------------------------------------------------------------ */

const VARIANT_CONFIG: Record<CardVariant, {
  icon: typeof TreePine
  gradient: string
  accent: string
}> = {
  impact: {
    icon: TrendingUp,
    gradient: 'bg-primary-800',
    accent: 'text-primary-200',
  },
  badge: {
    icon: Award,
    gradient: 'bg-bark-700',
    accent: 'text-bark-200',
  },
  event: {
    icon: Calendar,
    gradient: 'bg-primary-700',
    accent: 'text-primary-200',
  },
  milestone: {
    icon: TreePine,
    gradient: 'bg-secondary-800',
    accent: 'text-secondary-200',
  },
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ShareableCard({
  variant,
  title,
  subtitle,
  value,
  imageUrl,
  userName,
  className,
}: ShareableCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const shouldReduceMotion = useReducedMotion()
  const [generating, setGenerating] = useState(false)

  const config = VARIANT_CONFIG[variant]
  const Icon = config.icon

  const generatePng = useCallback(async (): Promise<Blob | null> => {
    if (!cardRef.current) return null
    setGenerating(true)
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        backgroundColor: null,
        useCORS: true,
        logging: false,
      })
      return new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png')
      })
    } finally {
      setGenerating(false)
    }
  }, [])

  const handleDownload = useCallback(async () => {
    const blob = await generatePng()
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `coexist-${variant}-${Date.now()}.png`
    a.click()
    URL.revokeObjectURL(url)
  }, [generatePng, variant])

  const handleShare = useCallback(async () => {
    const blob = await generatePng()
    if (!blob) return

    const file = new File([blob], `coexist-${variant}.png`, { type: 'image/png' })

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: `${title} - ${APP_NAME}`,
        text: subtitle || title,
        files: [file],
      })
    } else {
      // Fallback: download instead
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `coexist-${variant}.png`
      a.click()
      URL.revokeObjectURL(url)
    }
  }, [generatePng, variant, title, subtitle])

  return (
    <div data-eos-id="src/components/shareable-card.tsx#0" className={cn('flex flex-col items-center gap-4', className)}>
      {/* The card to be captured */}
      <motion.div data-eos-id="src/components/shareable-card.tsx#1"
        ref={cardRef}
        initial={shouldReduceMotion ? false : { scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className={cn(
          'relative w-full max-w-[340px] overflow-hidden rounded-md',
          'bg-gradient-to-br',
          config.gradient,
          'p-6 text-white shadow-sm',
        )}
      >
        {/* Background texture */}
        <div data-eos-id="src/components/shareable-card.tsx#2" className="absolute inset-0 opacity-10" aria-hidden="true">
          <svg data-eos-id="src/components/shareable-card.tsx#3" width="100%" height="100%">
            <pattern data-eos-id="src/components/shareable-card.tsx#4" id={`pattern-${variant}`} x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
              <circle data-eos-id="src/components/shareable-card.tsx#5" cx="20" cy="20" r="1.5" fill="currentColor" />
            </pattern>
            <rect data-eos-id="src/components/shareable-card.tsx#6" width="100%" height="100%" fill={`url(#pattern-${variant})`} />
          </svg>
        </div>

        <div data-eos-id="src/components/shareable-card.tsx#7" className="relative z-10">
          {/* Header row */}
          <div data-eos-id="src/components/shareable-card.tsx#8" className="flex items-center justify-between">
            <span data-eos-id="src/components/shareable-card.tsx#9" className={cn('text-xs font-semibold uppercase tracking-wider', config.accent)}>
              {variant === 'impact' && 'My Impact'}
              {variant === 'badge' && 'Badge Unlocked'}
              {variant === 'event' && 'Event'}
              {variant === 'milestone' && 'Milestone Reached'}
            </span>
            <Icon data-eos-id="src/components/shareable-card.tsx#10" size={20} className={config.accent} />
          </div>

          {/* Image or large value */}
          {imageUrl ? (
            <div data-eos-id="src/components/shareable-card.tsx#11" className="mt-4 flex justify-center">
              <img data-eos-id="src/components/shareable-card.tsx#12"
                src={imageUrl}
                alt={title}
                className="h-24 w-24 rounded-sm object-cover shadow-sm"
                crossOrigin="anonymous"
              />
            </div>
          ) : value != null ? (
            <p data-eos-id="src/components/shareable-card.tsx#13" className="mt-4 font-heading text-5xl font-bold tracking-tight">
              {value}
            </p>
          ) : null}

          {/* Title + subtitle */}
          <h3 data-eos-id="src/components/shareable-card.tsx#14" className="mt-4 font-heading text-xl font-bold leading-tight">{title}</h3>
          {subtitle && (
            <p data-eos-id="src/components/shareable-card.tsx#15" className="mt-1 text-sm text-white/80 leading-relaxed">{subtitle}</p>
          )}

          {/* Attribution */}
          <div data-eos-id="src/components/shareable-card.tsx#16" className="mt-6 flex items-center justify-between bg-white/10 rounded-sm px-3 pt-3 pb-2 -mx-1">
            {userName && (
              <p data-eos-id="src/components/shareable-card.tsx#17" className="text-xs text-white/70">{userName}</p>
            )}
            <p data-eos-id="src/components/shareable-card.tsx#18" className={cn('text-xs font-semibold', !userName && 'ml-auto')}>
              {APP_NAME}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Action buttons */}
      <div data-eos-id="src/components/shareable-card.tsx#19" className="flex gap-2">
        <Button data-eos-id="src/components/shareable-card.tsx#20"
          variant="secondary"
          size="sm"
          icon={<Download data-eos-id="src/components/shareable-card.tsx#21" size={16} />}
          onClick={handleDownload}
          disabled={generating}
        >
          Save
        </Button>
        <Button data-eos-id="src/components/shareable-card.tsx#22"
          variant="primary"
          size="sm"
          icon={<Share2 data-eos-id="src/components/shareable-card.tsx#23" size={16} />}
          onClick={handleShare}
          disabled={generating}
        >
          Share
        </Button>
      </div>
    </div>
  )
}
