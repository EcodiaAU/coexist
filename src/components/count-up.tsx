import { useEffect, useRef } from 'react'
import {
  useInView,
  useMotionValue,
  useTransform,
  animate,
  useReducedMotion,
  motion,
} from 'framer-motion'
import { cn } from '@/lib/cn'

interface CountUpProps {
  end: number
  start?: number
  duration?: number
  decimals?: number
  prefix?: string
  suffix?: string
  triggerOnView?: boolean
  className?: string
  'aria-label'?: string
}

export function CountUp({
  end,
  start = 0,
  duration = 2000,
  decimals = 0,
  prefix = '',
  suffix = '',
  triggerOnView = true,
  className,
  'aria-label': ariaLabel,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const shouldReduceMotion = useReducedMotion()
  const isInView = useInView(ref, { once: true, amount: 0.5 })
  const motionValue = useMotionValue(start)
  const hasAnimated = useRef(false)

  const formatted = useTransform(motionValue, (value) => {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value)
  })

  useEffect(() => {
    if (hasAnimated.current) return

    const shouldAnimate = triggerOnView ? isInView : true
    if (!shouldAnimate) return

    hasAnimated.current = true

    if (shouldReduceMotion) {
      motionValue.set(end)
      return
    }

    const controls = animate(motionValue, end, {
      duration: duration / 1000,
      ease: 'easeOut',
    })

    return () => controls.stop()
  }, [isInView, triggerOnView, end, start, duration, motionValue, shouldReduceMotion])

  const displayLabel =
    ariaLabel ?? `${prefix}${new Intl.NumberFormat(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(end)}${suffix}`

  return (
    <span data-eos-id="src/components/count-up.tsx#0"
      ref={ref}
      aria-label={displayLabel}
      className={cn('tabular-nums', className)}
    >
      {prefix}
      <motion.span data-eos-id="src/components/count-up.tsx#1">{formatted}</motion.span>
      {suffix}
    </span>
  )
}
