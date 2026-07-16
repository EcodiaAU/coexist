import { type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'

interface ScrollRevealProps {
  children: ReactNode
  /** Delay in seconds */
  delay?: number
  className?: string
}

/**
 * Wraps children in a subtle fade+slide-up animation triggered on scroll.
 * Card reveal on scroll - §55 item 23.
 */
export function ScrollReveal({ children, delay = 0, className }: ScrollRevealProps) {
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) {
    return <div data-eos-id="src/components/scroll-reveal.tsx#0" data-eos-v="2" className={className}>{children}</div>
  }

  return (
    <motion.div data-eos-id="src/components/scroll-reveal.tsx#1"
      className={cn(className)}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.4, delay, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Staggered list wrapper - §55 item 22                              */
/* ------------------------------------------------------------------ */

interface StaggeredListProps {
  children: ReactNode
  /** Stagger delay per item in ms */
  stagger?: number
  className?: string
}

const containerVariants = {
  hidden: {},
  visible: (stagger: number) => ({
    transition: { staggerChildren: stagger / 1000 },
  }),
}

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] } },
} as const satisfies import('framer-motion').Variants

export function StaggeredList({
  children,
  stagger = 30,
  className,
}: StaggeredListProps) {
  const shouldReduceMotion = useReducedMotion()

  if (shouldReduceMotion) {
    return <div data-eos-id="src/components/scroll-reveal.tsx#2" className={className}>{children}</div>
  }

  return (
    <motion.div data-eos-id="src/components/scroll-reveal.tsx#3"
      className={className}
      initial="hidden"
      animate="visible"
      custom={stagger}
      variants={containerVariants}
    >
      {children}
    </motion.div>
  )
}

/** Wrap each item in a StaggeredList with this */
export function StaggeredItem({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <motion.div data-eos-id="src/components/scroll-reveal.tsx#4" className={className} variants={itemVariants}>
      {children}
    </motion.div>
  )
}
