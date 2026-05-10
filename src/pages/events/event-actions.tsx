import { motion, type Variants } from 'framer-motion'
import { CalendarPlus } from 'lucide-react'
import { Button } from '@/components'

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface EventActionsProps {
  past: boolean
  fadeUpVariants: Variants | undefined
  onCalendarOpen: () => void
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/*                                                                     */
/*  The bottom-of-page action row used to host a low-visibility        */
/*  "Share" button that just copied a URL. That share affordance has    */
/*  moved: high-vis pulse-button in the page header (see EventHero)    */
/*  and a second share button paired with "Cancel Registration" in the */
/*  CTA footer (see event-detail.tsx). Both open the EventShareSheet   */
/*  which generates Instagram-ready PNGs in 1:1, 4:5 and 16:9.         */
/* ------------------------------------------------------------------ */

export function EventActions({ past, fadeUpVariants, onCalendarOpen }: EventActionsProps) {
  if (past) return null

  return (
    <motion.div
      variants={fadeUpVariants}
      className="relative"
    >
      <Button
        variant="secondary"
        size="md"
        icon={<CalendarPlus size={14} />}
        onClick={onCalendarOpen}
        fullWidth
        className="text-xs whitespace-nowrap"
      >
        Add to Calendar
      </Button>
    </motion.div>
  )
}
