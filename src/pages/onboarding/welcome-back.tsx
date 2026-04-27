import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { Hand, Calendar, Users, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { Button } from '@/components/button'
import { Skeleton } from '@/components/skeleton'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

export default function WelcomeBackPage() {
  const navigate = useNavigate()
  const { user, profile, markOnboardingComplete } = useAuth()
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => { markOnboardingComplete() }, [markOnboardingComplete])

  const { data: missedData, isLoading, error } = useQuery({
    queryKey: ['welcome-back', user?.id],
    queryFn: async () => {
      if (!user) return null

      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const [eventsRes] = await Promise.all([
        supabase
          // eslint-disable-next-line @typescript-eslint/prefer-as-const
          .from('events' as 'events')
          .select('id, title', { count: 'exact' })
          .eq('status', 'completed')
          .gte('date_start', thirtyDaysAgo.toISOString())
          .limit(3),
      ])

      return {
        missedEventsCount: eventsRes.count ?? 0,
        recentEvents: eventsRes.data ?? [],
      }
    },
    enabled: !!user,
  })
  const showLoading = useDelayedLoading(isLoading)

  const displayName = profile?.display_name ?? 'there'

  return (
    <div className="min-h-dvh flex flex-col bg-white">
      <motion.div
        className="flex-1 flex flex-col px-4 sm:px-6 pt-12"
        variants={shouldReduceMotion ? undefined : stagger}
        initial="hidden"
        animate="visible"
      >
        {/* Wave icon */}
        <motion.div
          variants={{
            hidden: { scale: 0.5, opacity: 0, rotate: -20 },
            visible: { scale: 1, opacity: 1, rotate: 0, transition: { type: 'spring', stiffness: 200, damping: 15 } },
          }}
          className="mx-auto mb-6"
        >
          <div className="w-20 h-20 rounded-full bg-neutral-50 border border-neutral-100 flex items-center justify-center">
            <Hand className="w-10 h-10 text-neutral-400" />
          </div>
        </motion.div>

        <motion.h1
          variants={fadeUp}
          className="font-heading text-2xl font-bold text-neutral-900 text-center"
        >
          Welcome back, {displayName}!
        </motion.h1>

        <motion.p
          variants={fadeUp}
          className="mt-2 text-neutral-500 text-center max-w-xs mx-auto"
        >
          We missed you. Here's what's been happening while you were away.
        </motion.p>

        {/* What you missed */}
        <div className="mt-8 space-y-3">
          {showLoading ? (
            <Skeleton variant="list-item" count={3} />
          ) : error ? (
            <p className="text-sm text-error-500 text-center py-4">
              Couldn't load your updates. Tap below to jump in anyway.
            </p>
          ) : missedData ? (
            <>
              {missedData.missedEventsCount > 0 && (
                <motion.div
                  variants={fadeUp}
                  className="flex items-center gap-4 p-4 rounded-xl bg-white border border-neutral-100 shadow-sm"
                >
                  <div className="w-10 h-10 rounded-lg bg-neutral-50 flex items-center justify-center shrink-0">
                    <Calendar size={20} className="text-neutral-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-neutral-900">
                      {missedData.missedEventsCount} events happened
                    </p>
                    <p className="text-xs text-neutral-500">Your collective's been busy!</p>
                  </div>
                </motion.div>
              )}

              <motion.div
                variants={fadeUp}
                className="flex items-center gap-4 p-4 rounded-xl bg-white border border-neutral-100 shadow-sm"
              >
                <div className="w-10 h-10 rounded-lg bg-neutral-50 flex items-center justify-center shrink-0">
                  <Users size={20} className="text-neutral-400" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-neutral-900">
                    Your collective is waiting
                  </p>
                  <p className="text-xs text-neutral-500">Jump into the next event!</p>
                </div>
              </motion.div>
            </>
          ) : null}
        </div>
      </motion.div>

      {/* CTA */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="px-4 py-4"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <Button
          variant="primary"
          size="lg"
          fullWidth
          icon={<ArrowRight size={20} />}
          onClick={() => navigate('/', { replace: true })}
        >
          Let's get back to it
        </Button>
      </motion.div>
    </div>
  )
}
