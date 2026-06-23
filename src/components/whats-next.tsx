import { type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

interface WhatsNextSuggestion {
  label: string
  description?: string
  icon?: ReactNode
  to?: string
  onClick?: () => void
}

interface WhatsNextProps {
  title?: string
  suggestions: WhatsNextSuggestion[]
  className?: string
}

/**
 * "What's next?" prompts after every completion action.
 * §52 item 32.
 */
export function WhatsNext({
  title = "What's next?",
  suggestions,
  className,
}: WhatsNextProps) {
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()

  if (suggestions.length === 0) return null

  return (
    <motion.div
      className={cn('space-y-2', className)}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.3 }}
    >
      <p className="text-overline text-neutral-400 px-1">{title}</p>

      <div className="space-y-1.5">
        {suggestions.map((s, i) => (
          <motion.button
            key={i}
            type="button"
            onClick={() => {
              if (s.onClick) s.onClick()
              else if (s.to) navigate(s.to)
            }}
            className={cn(
              'flex items-center gap-3 w-full p-3 rounded-sm',
              'bg-white/60 border border-neutral-100',
              'text-left transition-colors duration-150',
              'hover:bg-neutral-50',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
            )}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
            initial={shouldReduceMotion ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 + i * 0.1, duration: 0.2 }}
          >
            {s.icon && (
              <span className="flex items-center justify-center w-9 h-9 rounded-sm bg-primary-100 text-primary-400 shrink-0">
                {s.icon}
              </span>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-neutral-900">{s.label}</p>
              {s.description && (
                <p className="text-xs text-neutral-500 mt-0.5">{s.description}</p>
              )}
            </div>
            <ChevronRight size={16} className="text-neutral-400 shrink-0" />
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}
