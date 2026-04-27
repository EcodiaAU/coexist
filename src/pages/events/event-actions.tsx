import { motion, type Variants } from 'framer-motion'
import { CalendarPlus, Share2 } from 'lucide-react'
import { Button } from '@/components'

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface EventActionsProps {
  past: boolean
  fadeUpVariants: Variants | undefined
  onCalendarOpen: () => void
  onShare: () => void
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function EventActions({ past, fadeUpVariants, onCalendarOpen, onShare }: EventActionsProps) {
  if (past) return null

  return (
    <motion.div
      variants={fadeUpVariants}
      className="flex gap-2.5 relative"
    >
      <Button
        variant="secondary"
        size="md"
        icon={<CalendarPlus size={14} />}
        onClick={onCalendarOpen}
        className="flex-1 text-xs whitespace-nowrap px-2"
      >
        Add to Calendar
      </Button>
      <Button
        variant="secondary"
        size="md"
        icon={<Share2 size={14} />}
        onClick={onShare}
        className="flex-1 text-xs whitespace-nowrap px-2"
      >
        Share
      </Button>
    </motion.div>
  )
}
