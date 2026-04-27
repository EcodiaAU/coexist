import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { Users, MapPin, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { Button } from '@/components/button'
import { Skeleton } from '@/components/skeleton'
import { cn } from '@/lib/cn'
import type { Database } from '@/types/database.types'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

type Collective = Database['public']['Tables']['collectives']['Row']

interface StepCollectiveProps {
  selectedId: string | null
  onSelect: (id: string | null) => void
  onNext: () => void
  onSkip: () => void
}

export function StepCollective({ selectedId, onSelect, onNext, onSkip }: StepCollectiveProps) {
  const shouldReduceMotion = useReducedMotion()

  const { data: collectives, isLoading, error } = useQuery({
    queryKey: ['onboarding-collectives'],
    queryFn: async () => {
      const { data } = await supabase
        .from('collectives')
        .select('*')
        .eq('is_active', true)
        .or('is_national.is.null,is_national.eq.false')
        .order('member_count', { ascending: false })
        .limit(10)
      return data as Collective[]
    },
  })
  const showLoading = useDelayedLoading(isLoading)

  return (
    <div className="flex-1 flex flex-col px-4 pt-8 min-h-0">
      <motion.div
        className="flex-1 overflow-y-auto"
        variants={shouldReduceMotion ? undefined : stagger}
        initial="hidden"
        animate="visible"
      >
        <motion.h2 variants={fadeUp} className="font-heading text-2xl font-bold text-neutral-900">
          Join a Collective
        </motion.h2>
        <motion.p variants={fadeUp} className="mt-2 text-neutral-500 leading-relaxed">
          Collectives are local volunteer groups. Join one to find events near you.
        </motion.p>

        <div className="mt-6 space-y-3">
          {showLoading ? (
            <Skeleton variant="list-item" count={4} />
          ) : error ? (
            <p className="text-sm text-error-500 text-center py-8">
              Couldn't load collectives. You can skip and join one later.
            </p>
          ) : collectives && collectives.length > 0 ? (
            collectives.map((collective) => {
              const isSelected = selectedId === collective.id
              return (
                <motion.button
                  key={collective.id}
                  type="button"
                  onClick={() => onSelect(isSelected ? null : collective.id)}
                  variants={fadeUp}
                  whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
                  className={cn(
                    'w-full flex items-center gap-3 p-4 rounded-xl text-left cursor-pointer',
                    'transition-colors duration-150',
                    isSelected
                      ? 'ring-2 ring-neutral-900 bg-white border border-neutral-100 shadow-sm'
                      : 'bg-white border border-neutral-100 hover:bg-neutral-50',
                  )}
                >
                  {collective.cover_image_url ? (
                    <img
                      src={collective.cover_image_url}
                      alt=""
                      className="w-12 h-12 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-neutral-50 flex items-center justify-center shrink-0">
                      <Users size={20} className="text-neutral-400" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-neutral-900 truncate">{collective.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {collective.region && (
                        <span className="flex items-center gap-1 text-xs text-neutral-500">
                          <MapPin size={12} />
                          {collective.region}
                        </span>
                      )}
                      <span className="text-xs text-neutral-500">
                        {collective.member_count} members
                      </span>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="w-6 h-6 rounded-full bg-neutral-900 flex items-center justify-center shrink-0">
                      <Check size={14} className="text-white" />
                    </div>
                  )}
                </motion.button>
              )
            })
          ) : (
            <p className="text-sm text-neutral-500 text-center py-8">
              No collectives available yet. Check back soon!
            </p>
          )}
        </div>
      </motion.div>

      <div
        className="py-6 space-y-3"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <Button variant="primary" size="lg" fullWidth onClick={onNext} disabled={!selectedId}>
          Join & Continue
        </Button>
        <Button variant="ghost" size="lg" fullWidth onClick={onSkip}>
          Skip for now
        </Button>
      </div>
    </div>
  )
}
