import { useState, useMemo } from 'react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import {
  Trophy,
  Plus,
  Calendar,
  Target,
  Trash2,
  Zap,
  X,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAdminHeader } from '@/components/admin-layout'
import { AdminHeroStat, AdminHeroStatRow } from '@/components/admin-hero-stat'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Dropdown } from '@/components/dropdown'
import { BottomSheet } from '@/components/bottom-sheet'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { StaggeredList, StaggeredItem } from '@/components/scroll-reveal'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { logAudit } from '@/lib/audit'

function useChallenges() {
  return useQuery({
    queryKey: ['admin-challenges'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('challenges')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })
}

export default function AdminChallengesPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    goal_type: 'events',
    goal_value: '',
    start_date: '',
    end_date: '',
  })

  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data: challenges, isLoading } = useChallenges()
  const showLoading = useDelayedLoading(isLoading)

  const heroActions = useMemo(() => (
    <Button data-eos-id="src/pages/admin/challenges.tsx#0"
      variant="primary"
      size="sm"
      icon={<Plus data-eos-id="src/pages/admin/challenges.tsx#1" size={16} />}
      onClick={() => setShowCreate(true)}
    >
      Create Challenge
    </Button>
  ), [])

  const heroStats = useMemo(() => (
    <AdminHeroStatRow data-eos-id="src/pages/admin/challenges.tsx#2">
      <AdminHeroStat data-eos-id="src/pages/admin/challenges.tsx#3" value={challenges?.length ?? 0} label="Total" icon={<Trophy data-eos-id="src/pages/admin/challenges.tsx#4" size={18} />} color="warning" delay={0} reducedMotion={false} />
      <AdminHeroStat data-eos-id="src/pages/admin/challenges.tsx#5" value={challenges?.filter((c) => (c as unknown as Record<string, unknown>).status === 'active').length ?? 0} label="Active" icon={<Zap data-eos-id="src/pages/admin/challenges.tsx#6" size={18} />} color="success" delay={1} reducedMotion={false} />
    </AdminHeroStatRow>
  ), [challenges])

  useAdminHeader('Challenges', { actions: heroActions, heroContent: heroStats })

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('challenges').insert({
        title: form.title,
        description: form.description,
        goal_type: form.goal_type,
        goal_value: parseInt(form.goal_value) || 0,
        start_date: form.start_date,
        end_date: form.end_date,
        status: 'active',
      }).select('id').single()
      if (error) throw error
      await logAudit({ action: 'challenge_created', target_type: 'challenge', target_id: data?.id, details: { title: form.title } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-challenges'] })
      setShowCreate(false)
      setForm({
        title: '',
        description: '',
        goal_type: 'events',
        goal_value: '',
        start_date: '',
        end_date: '',
      })
      toast.success('Challenge created')
    },
    onError: () => toast.error('Failed to create challenge'),
  })

  const endMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('challenges')
        .update({ status: 'ended', end_date: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      await logAudit({ action: 'challenge_ended', target_type: 'challenge', target_id: id })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-challenges'] })
      toast.success('Challenge ended')
    },
    onError: () => toast.error('Failed to end challenge'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('challenges').delete().eq('id', id)
      if (error) throw error
      // Log AFTER success - previously the audit entry was written before
      // the delete, so a failed delete still produced an audit record saying
      // it happened. Now the log only reflects actual completed deletes.
      await logAudit({ action: 'challenge_deleted', target_type: 'challenge', target_id: id })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-challenges'] })
      setDeleteTarget(null)
      toast.success('Challenge deleted')
    },
    onError: () => toast.error('Failed to delete challenge'),
  })

  const shouldReduceMotion = useReducedMotion()

  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  return (
    <div data-eos-id="src/pages/admin/challenges.tsx#7">
        <motion.div data-eos-id="src/pages/admin/challenges.tsx#8" variants={stagger} initial="hidden" animate="visible">
          <motion.div data-eos-id="src/pages/admin/challenges.tsx#9" variants={fadeUp}>
          {showLoading ? (
            <Skeleton data-eos-id="src/pages/admin/challenges.tsx#10" variant="list-item" count={4} />
          ) : !challenges?.length ? (
            <EmptyState data-eos-id="src/pages/admin/challenges.tsx#11"
              illustration="empty"
              title="No challenges yet"
              description="Create your first national challenge to motivate collectives"
              action={{ label: 'Create Challenge', onClick: () => setShowCreate(true) }}
            />
          ) : (
            <StaggeredList data-eos-id="src/pages/admin/challenges.tsx#12" className="space-y-3">
              {challenges.map((challenge) => {
                const isActive = (challenge as unknown as Record<string, unknown>).status === 'active'

                return (
                  <StaggeredItem data-eos-id="src/pages/admin/challenges.tsx#13"
                    key={challenge.id}
                    className={cn(
                      'p-4 rounded-sm bg-white shadow-sm',
                      !isActive && 'opacity-60',
                    )}
                  >
                    <div data-eos-id="src/pages/admin/challenges.tsx#14" className="flex items-start justify-between gap-3">
                      <div data-eos-id="src/pages/admin/challenges.tsx#15" className="flex items-start gap-3 min-w-0">
                        <div data-eos-id="src/pages/admin/challenges.tsx#16"
                          className={cn(
                            'flex items-center justify-center w-10 h-10 rounded-sm shrink-0',
                            isActive ? 'bg-neutral-100' : 'bg-neutral-50',
                          )}
                        >
                          <Trophy data-eos-id="src/pages/admin/challenges.tsx#17"
                            size={20}
                            className={isActive ? 'text-neutral-400' : 'text-neutral-400'}
                          />
                        </div>
                        <div data-eos-id="src/pages/admin/challenges.tsx#18" className="min-w-0">
                          <div data-eos-id="src/pages/admin/challenges.tsx#19" className="flex items-center gap-2">
                            <h3 data-eos-id="src/pages/admin/challenges.tsx#20" data-eos-var="challenge.title" data-eos-var-label="Title" data-eos-var-scope="item" className="font-heading text-sm font-semibold text-neutral-900 truncate">
                              {challenge.title}
                            </h3>
                            <span data-eos-id="src/pages/admin/challenges.tsx#21"
                              className={cn(
                                'text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0',
                                isActive
                                  ? 'bg-success-100 text-success-700'
                                  : 'bg-neutral-100 text-neutral-400',
                              )}
                            >
                              {isActive ? 'Active' : 'Ended'}
                            </span>
                          </div>
                          {challenge.description && (
                            <p data-eos-id="src/pages/admin/challenges.tsx#22" data-eos-var="challenge.description" data-eos-var-label="Description" data-eos-var-scope="item" className="text-xs text-neutral-400 mt-0.5 line-clamp-2">
                              {challenge.description}
                            </p>
                          )}
                          <div data-eos-id="src/pages/admin/challenges.tsx#23" className="flex items-center gap-3 mt-2 text-xs text-neutral-400">
                            <span data-eos-id="src/pages/admin/challenges.tsx#24" data-eos-var="challenge.goal_value,challenge.goal_type" data-eos-var-label="Goal value, Goal type" data-eos-var-scope="item" className="flex items-center gap-1">
                              <Target data-eos-id="src/pages/admin/challenges.tsx#25" size={12} />
                              {challenge.goal_value} {challenge.goal_type}
                            </span>
                            {challenge.start_date && (
                              <span data-eos-id="src/pages/admin/challenges.tsx#26" data-eos-var="challenge.start_date,challenge.end_date" data-eos-var-label="Start date, End date" data-eos-var-scope="item" className="flex items-center gap-1">
                                <Calendar data-eos-id="src/pages/admin/challenges.tsx#27" size={12} />
                                {new Date(challenge.start_date).toLocaleDateString('en-AU', {
                                  day: 'numeric',
                                  month: 'short',
                                })}
                                {challenge.end_date &&
                                  ` - ${new Date(challenge.end_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div data-eos-id="src/pages/admin/challenges.tsx#28" className="flex items-center gap-1 shrink-0">
                        {isActive && (
                          <Button data-eos-id="src/pages/admin/challenges.tsx#29"
                            variant="ghost"
                            size="sm"
                            onClick={() => endMutation.mutate(challenge.id)}
                          >
                            End
                          </Button>
                        )}
                        <button data-eos-id="src/pages/admin/challenges.tsx#30"
                          type="button"
                          onClick={() => setDeleteTarget(challenge.id)}
                          className="p-1.5 min-h-11 min-w-11 flex items-center justify-center rounded-sm text-neutral-400 hover:bg-error-50 hover:text-error-600 transition-[colors,transform] duration-150 cursor-pointer active:scale-[0.98]"
                          aria-label="Delete challenge"
                        >
                          <Trash2 data-eos-id="src/pages/admin/challenges.tsx#31" size={16} />
                        </button>
                      </div>
                    </div>
                  </StaggeredItem>
                )
              })}
            </StaggeredList>
          )}
          </motion.div>

          {/* Create modal */}
          <BottomSheet data-eos-id="src/pages/admin/challenges.tsx#32" open={showCreate} onClose={() => setShowCreate(false)}>
            {/* Header */}
            <div data-eos-id="src/pages/admin/challenges.tsx#33" className="flex items-center justify-between mb-4">
              <h2 data-eos-id="src/pages/admin/challenges.tsx#34" className="font-heading text-lg font-semibold text-neutral-900">Create National Challenge</h2>
              <button data-eos-id="src/pages/admin/challenges.tsx#35"
                onClick={() => setShowCreate(false)}
                className="flex items-center justify-center rounded-full min-w-11 min-h-11 text-neutral-400 hover:bg-neutral-50 active:scale-[0.98] transition-[colors,transform] duration-150 cursor-pointer"
                aria-label="Close"
              >
                <X data-eos-id="src/pages/admin/challenges.tsx#36" size={20} />
              </button>
            </div>
            <div data-eos-id="src/pages/admin/challenges.tsx#37" className="space-y-4">
              <Input data-eos-id="src/pages/admin/challenges.tsx#38"
                label="Challenge Title"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                required
                placeholder="e.g. Plant 10,000 Trees"
              />
              <Input data-eos-id="src/pages/admin/challenges.tsx#39"
                type="textarea"
                label="Description"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Describe the challenge..."
              />
              <div data-eos-id="src/pages/admin/challenges.tsx#40" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Dropdown data-eos-id="src/pages/admin/challenges.tsx#41"
                  options={[
                    { value: 'events', label: 'Events' },
                    { value: 'trees', label: 'Trees Planted' },
                    { value: 'hours', label: 'Est. Volunteer Hours' },
                    { value: 'rubbish', label: 'Rubbish (kg)' },
                    { value: 'members', label: 'New Members' },
                  ]}
                  value={form.goal_type}
                  onChange={(v) => setForm((p) => ({ ...p, goal_type: v }))}
                  label="Goal Type"
                />
                <Input data-eos-id="src/pages/admin/challenges.tsx#42"
                  label="Goal Value"
                  value={form.goal_value}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, goal_value: e.target.value }))
                  }
                  placeholder="e.g. 100"
                />
              </div>
              <div data-eos-id="src/pages/admin/challenges.tsx#43" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input data-eos-id="src/pages/admin/challenges.tsx#44"
                  label="Start Date"
                  value={form.start_date}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, start_date: e.target.value }))
                  }
                  placeholder="YYYY-MM-DD"
                />
                <Input data-eos-id="src/pages/admin/challenges.tsx#45"
                  label="End Date"
                  value={form.end_date}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, end_date: e.target.value }))
                  }
                  placeholder="YYYY-MM-DD"
                />
              </div>
              <Button data-eos-id="src/pages/admin/challenges.tsx#46"
                variant="primary"
                fullWidth
                onClick={() => createMutation.mutate()}
                loading={createMutation.isPending}
                disabled={!form.title.trim()}
              >
                Create Challenge
              </Button>
            </div>
          </BottomSheet>

          <ConfirmationSheet data-eos-id="src/pages/admin/challenges.tsx#47"
            open={!!deleteTarget}
            onClose={() => setDeleteTarget(null)}
            onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
            title="Delete Challenge"
            description="This will permanently delete this challenge and its data."
            confirmLabel="Delete"
            variant="danger"
          />
        </motion.div>
    </div>
  )
}
