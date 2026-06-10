import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
  PartyPopper,
  ArrowRight,
  BookOpen,
  Layers,
  Star,
  Sparkles,
} from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Button } from '@/components/button'
import { Confetti } from '@/components/confetti'
import { useDevModule, useDevSection } from '@/hooks/use-admin-development'

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LearnCompletePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion

  const type = searchParams.get('type')
  const id = searchParams.get('id')

  const { data: module } = useDevModule(type === 'module' ? (id ?? undefined) : undefined)
  const { data: section } = useDevSection(type === 'section' ? (id ?? undefined) : undefined)

  const title = module?.title ?? section?.title ?? 'Content'
  const isModule = type === 'module'

  return (
    <Page swipeBack noBackground className="!px-0 bg-white" stickyOverlay={<Header title="" back transparent className="collapse-header" />}>
      {/* Background gradient */}
      <div className="relative min-h-[85vh] flex flex-col items-center justify-center overflow-hidden">


        {/* Confetti */}
        {!rm && <Confetti active />}

        <div className="relative z-10 text-center px-6 max-w-md">
          {/* Celebration icon */}
          <motion.div
            initial={rm ? {} : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 250, damping: 14 }}
            className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-moss-100 shadow-sm mb-8"
          >
            <PartyPopper size={44} className="text-moss-700" />
          </motion.div>

          {/* Stars decoration */}
          <motion.div
            initial={rm ? {} : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex items-center justify-center gap-1.5 mb-4"
          >
            {[...Array(3)].map((_, i) => (
              <motion.div
                key={i}
                initial={rm ? {} : { scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.5 + i * 0.1, type: 'spring', stiffness: 300, damping: 12 }}
              >
                <Star size={18} className="text-moss-400 fill-moss-400" />
              </motion.div>
            ))}
          </motion.div>

          {/* Heading */}
          <motion.h1
            initial={rm ? {} : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="font-heading text-3xl font-bold text-neutral-900 mb-2"
          >
            {isModule ? 'Module Complete!' : 'Section Complete!'}
          </motion.h1>

          <motion.p
            initial={rm ? {} : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="text-[14px] text-neutral-500 mb-8 leading-relaxed"
          >
            You've completed <span className="font-bold text-neutral-700">{title}</span>.
            <br />Great work on your leadership journey!
          </motion.p>

          {/* Completed card */}
          <motion.div
            initial={rm ? {} : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="inline-flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-white border border-moss-200/60 shadow-sm mb-10"
          >
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-moss-50">
              {isModule ? (
                <BookOpen size={20} className="text-moss-600" />
              ) : (
                <Layers size={20} className="text-moss-600" />
              )}
            </div>
            <div className="text-left">
              <p className="text-[13px] font-bold text-neutral-900">{title}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <Sparkles size={11} className="text-moss-500" />
                <p className="text-[11px] text-moss-600 font-bold">Completed</p>
              </div>
            </div>
          </motion.div>

          {/* Action */}
          <motion.div
            initial={rm ? {} : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55 }}
          >
            <Button
              variant="primary"
              size="lg"
              icon={<ArrowRight size={16} />}
              onClick={() => navigate('/learn')}
            >
              Continue Learning
            </Button>
          </motion.div>
        </div>
      </div>
    </Page>
  )
}
