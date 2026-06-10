import { motion, useReducedMotion, type Variants } from 'framer-motion'
import {
    Heart,
    Sparkles,
    CheckCircle2,
    FileText,
    ArrowRight,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Button } from '@/components/button'
import { WaveTransition } from '@/components/wave-transition'
import { useParallaxLayers } from '@/hooks/use-parallax-scroll'

/* ------------------------------------------------------------------ */
/*  Animation variants                                                 */
/* ------------------------------------------------------------------ */

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.25, 0.1, 0.25, 1] } },
}

/* ------------------------------------------------------------------ */
/*  Content                                                            */
/* ------------------------------------------------------------------ */

const WHO_WERE_LOOKING_FOR = [
  'Are passionate about connecting people with nature and driving social impact',
  'Have skills or a keen interest in areas like social media, content creation, community engagement or event facilitation',
  'Want to contribute regularly',
  'Are keen to lead or support a Collective in their region',
]

const PD_LINKS = [
  {
    title: 'Collective Leader',
    description: 'Find the Collective Leader Position Description here',
    url: 'https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/dev-assets/CollectiveLeader.pdf',
  },
  {
    title: 'Assistant Leader',
    description: 'Find the Assistant Leader Position Description here',
    url: 'https://tjutlbzekfouwsiaplbr.supabase.co/storage/v1/object/public/dev-assets/AssistantLeader.pdf',
  },
]

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LeadershipPage() {
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const navigate = useNavigate()
  const { bgRef, fgRef, textRef } = useParallaxLayers({ textRange: 180, withScale: false })

  return (
    <Page swipeBack noBackground className="!px-0 bg-white" stickyOverlay={<Header title="" back transparent className="collapse-header" />}>
      {/* Hero - layered image parallax */}
      <div className="relative">
        <div className="relative w-full h-[110vw] min-h-[480px] sm:h-auto overflow-hidden">
          {/* Background layer */}
          <div
            ref={rm ? undefined : bgRef}
            className="h-full will-change-transform"
          >
            <img
              src="/img/leadership-hero-bg.webp"
              alt="Co-Exist leadership landscape"
              decoding="async"
              fetchPriority="high"
              className="w-full h-full object-cover object-center sm:h-auto sm:object-fill block"
            />
          </div>

          {/* Foreground cutout */}
          <div
            ref={rm ? undefined : fgRef}
            className="absolute inset-0 z-[3] will-change-transform"
          >
            <img
              src="/img/leadership-hero-fg.webp"
              alt=""
              decoding="async"
              className="w-full h-full object-cover object-center sm:h-auto sm:object-fill block"
            />
          </div>

          {/* Scrim for text legibility */}
          <div className="absolute inset-0 z-[1] bg-gradient-to-b from-black/40 via-black/20 to-transparent" />

          {/* Hero text */}
          <div
            ref={rm ? undefined : textRef}
            className="absolute inset-x-0 top-[30%] sm:top-[22%] z-[2] flex flex-col items-center px-6 will-change-transform"
          >
            <span role="heading" aria-level={1} className="font-heading text-[2.5rem] sm:text-[3.5rem] lg:text-[5rem] font-bold uppercase text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.6)] leading-[0.85] block text-center" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.5), 0 0 40px rgba(0,0,0,0.3)' }}>
              Leadership
            </span>
          </div>
        </div>

        {/* Wave transition */}
        <WaveTransition size="lg" />
      </div>

      {/* Content */}
      <motion.div
        className="px-4 sm:px-6 lg:px-8 space-y-8 pb-12 pt-6"
        initial="hidden"
        animate="visible"
        variants={shouldReduceMotion ? undefined : stagger}
      >
        {/* Page heading */}
        <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="text-center">
          <h2 className="font-heading text-xl sm:text-2xl font-bold text-neutral-900">
            Join the Movement Behind the Movement
          </h2>
        </motion.div>

        {/* Intro paragraph */}
        <motion.div variants={shouldReduceMotion ? undefined : fadeUp} className="space-y-4">
          <p className="text-sm text-neutral-600 leading-relaxed">
            Co-Exist is powered by passionate young people driving real impact. Whether it's social media, content creation, event facilitation, or community engagement, our core team is the engine behind everything we do.
          </p>
          <p className="text-sm text-neutral-600 leading-relaxed">
            This is not a sign-up for one-off event volunteering - this is for those who want to play an ongoing role in growing Co-Exist, leading initiatives, and helping drive our mission forward.
          </p>
        </motion.div>

        {/* Who We're Looking For */}
        <motion.section variants={shouldReduceMotion ? undefined : fadeUp}>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-neutral-400 mb-3 px-1">
            Who We're Looking For
          </h3>
          <div className="rounded-2xl bg-gradient-to-br from-bark-500 via-bark-700 to-bark-800 shadow-sm p-6 space-y-3.5">
            <p className="text-[14px] text-white/90 leading-snug font-medium mb-1">
              We're looking for young people who:
            </p>
            {WHO_WERE_LOOKING_FOR.map((item) => (
              <div key={item} className="flex items-start gap-3">
                <CheckCircle2 size={18} className="text-white/60 mt-0.5 shrink-0" />
                <p className="text-[14px] text-white leading-snug">{item}</p>
              </div>
            ))}
          </div>
        </motion.section>

        {/* Ready to Get Involved? */}
        <motion.section variants={shouldReduceMotion ? undefined : fadeUp}>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-neutral-400 mb-3 px-1">
            Ready to Get Involved?
          </h3>
          <div className="space-y-4">
            <div className="rounded-2xl bg-gradient-to-br from-primary-600 via-primary-700 to-secondary-800 shadow-sm p-6">
              <p className="text-[14px] text-white/85 leading-relaxed">
                Collectives are Co-Exist's local action teams - they are youth-led groups that deliver events and environmental initiatives on the ground.
              </p>
              <p className="text-[14px] text-white/85 leading-relaxed mt-3">
                Each Collective is guided by a <span className="text-white font-semibold">Collective Leader</span>, who steers regional strategy and growth, and supported by <span className="text-white font-semibold">Assistant Leaders</span>, who help coordinate projects, events, and community engagement.
              </p>
            </div>

            {/* PD download cards */}
            <div className="grid grid-cols-1 gap-3">
              {PD_LINKS.map(({ title, description, url }) => (
                <a
                  key={title}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-bark-50 to-bark-100 border border-bark-200/60 p-5 hover:shadow-lg active:scale-[0.98] transition-all"
                >
                  <div className="flex items-center gap-4">
                    <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-bark-700 shadow-sm shrink-0 group-hover:bg-bark-800 transition-colors">
                      <FileText size={18} className="text-white" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="font-heading text-[15px] font-bold text-bark-900 block">
                        {title} Position Description
                      </span>
                      <p className="text-[12px] text-bark-500 mt-0.5 leading-snug">
                        View PDF
                      </p>
                    </div>
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-bark-100 group-hover:bg-bark-200 transition-colors shrink-0">
                      <ArrowRight size={14} className="text-bark-600" />
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </motion.section>

        {/* Call to action */}
        <motion.section variants={shouldReduceMotion ? undefined : fadeUp}>
          <div className="rounded-2xl bg-gradient-to-br from-sprout-500 via-sprout-600 to-primary-800 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-3 mb-1">
              <Sparkles size={20} className="text-white/70" />
              <span className="font-heading text-base font-bold text-white">
                Sound like you?
              </span>
            </div>
            <p className="text-[14px] text-white/75 leading-relaxed">
              If this sounds like you, fill out a quick form and we'll be in touch!
            </p>
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              icon={<Heart size={16} />}
              onClick={() => navigate('/lead-a-collective')}
            >
              Fill Out the Form
            </Button>
          </div>
        </motion.section>

      </motion.div>
    </Page>
  )
}
