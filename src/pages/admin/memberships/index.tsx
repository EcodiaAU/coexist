import { useState, useMemo } from 'react'
import { Plus, Users, CreditCard, Pencil } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAdminHeader } from '@/components/admin-layout'
import { AdminHeroStat, AdminHeroStatRow } from '@/components/admin-hero-stat'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { BottomSheet } from '@/components/bottom-sheet'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { StaggeredList, StaggeredItem } from '@/components/scroll-reveal'
import { TabBar } from '@/components/tab-bar'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import type { MembershipPlan } from '@/hooks/use-membership'

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

interface AdminMembershipRow {
  id: string
  status: string
  interval: string
  current_period_end: string | null
  created_at: string
  membership_plans: { name: string } | null
  profiles: { display_name: string | null } | null
}

function useAdminPlans() {
  return useQuery({
    queryKey: ['admin-membership-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('membership_plans')
        .select('*')
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as unknown as MembershipPlan[]
    },
    staleTime: 60 * 1000,
  })
}

function useAdminMemberships() {
  return useQuery({
    queryKey: ['admin-memberships'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('memberships')
        .select('id, status, interval, current_period_end, created_at, membership_plans(name), profiles(display_name)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as AdminMembershipRow[]
    },
    staleTime: 60 * 1000,
  })
}

const emptyForm = {
  id: '',
  name: '',
  description: '',
  price_monthly: '',
  price_yearly: '',
  is_active: true,
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

const tabs = [
  { id: 'plans', label: 'Plans', icon: <CreditCard size={14} /> },
  { id: 'members', label: 'Members', icon: <Users size={14} /> },
]

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminMembershipsPage() {
  const [activeTab, setActiveTab] = useState('plans')
  const [editing, setEditing] = useState<typeof emptyForm | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: plans, isLoading: plansLoading } = useAdminPlans()
  const { data: members, isLoading: membersLoading } = useAdminMemberships()
  // White until the 1s delay, then the skeleton; never flash a shell on a fast load.
  const showPlansLoading = useDelayedLoading(plansLoading)
  const showMembersLoading = useDelayedLoading(membersLoading)

  const activeCount = useMemo(
    () => (members ?? []).filter((m) => m.status === 'active' || m.status === 'trialing').length,
    [members],
  )

  // Suppressed until there is at least one member or plan, so an all-zero
  // 0 members / 0 plans row never stacks above the empty state.
  const heroStats = useMemo(() => {
    if (activeCount === 0 && (plans?.length ?? 0) === 0) return undefined
    return (
      <AdminHeroStatRow>
        <AdminHeroStat value={activeCount} label="Active members" icon={<Users size={18} />} color="sprout" delay={0} reducedMotion={false} />
        <AdminHeroStat value={plans?.length ?? 0} label="Plans" icon={<CreditCard size={18} />} color="bark" delay={1} reducedMotion={false} />
      </AdminHeroStatRow>
    )
  }, [activeCount, plans?.length])

  useAdminHeader('Membership', { heroContent: heroStats })

  // Plan create/update goes through the manage-membership-plan edge function, which
  // creates/updates the matching Stripe product + prices automatically. Admins never
  // touch Stripe; there are no price-ID fields to fill.
  const upsertPlan = useMutation({
    mutationFn: async (form: typeof emptyForm) => {
      const res = await supabase.functions.invoke('manage-membership-plan', {
        body: {
          action: form.id ? 'update' : 'create',
          id: form.id || undefined,
          name: form.name.trim(),
          description: form.description.trim() || null,
          price_monthly: Number(form.price_monthly) || 0,
          price_yearly: Number(form.price_yearly) || 0,
          is_active: form.is_active,
        },
      })
      if (res.error) throw res.error
      const err = (res.data as { error?: string })?.error
      if (err) throw new Error(err)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-membership-plans'] })
      queryClient.invalidateQueries({ queryKey: ['membership-plans'] })
      setEditing(null)
      toast.success('Plan saved.')
    },
    onError: (e) => toast.error((e as Error)?.message || 'Could not save the plan.'),
  })

  const deletePlan = useMutation({
    mutationFn: async (id: string) => {
      const res = await supabase.functions.invoke('manage-membership-plan', {
        body: { action: 'delete', id },
      })
      if (res.error) throw res.error
      const err = (res.data as { error?: string })?.error
      if (err) throw new Error(err)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-membership-plans'] })
      queryClient.invalidateQueries({ queryKey: ['membership-plans'] })
      setEditing(null)
      setConfirmDelete(null)
      toast.success('Plan deleted.')
    },
    onError: (e) => toast.error((e as Error)?.message || 'Could not delete the plan.'),
  })

  const openEdit = (plan?: MembershipPlan) => {
    setEditing(
      plan
        ? {
            id: plan.id,
            name: plan.name,
            description: plan.description ?? '',
            price_monthly: String(plan.price_monthly),
            price_yearly: String(plan.price_yearly),
            is_active: plan.is_active,
          }
        : { ...emptyForm },
    )
  }

  return (
    <div className="p-4 space-y-4">
      <TabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'plans' && (
        <div className="space-y-3">
          <Button onClick={() => openEdit()} variant="secondary" className="w-full">
            <Plus size={15} /> New plan
          </Button>
          {plansLoading ? (
            showPlansLoading ? <Skeleton className="h-24 rounded-md" /> : null
          ) : !plans?.length ? (
            <EmptyState illustration="empty" title="No plans yet" description="Create a membership plan to get started." />
          ) : (
            <StaggeredList className="space-y-2">
              {plans.map((plan) => (
                <StaggeredItem key={plan.id} className="rounded-md bg-white shadow-sm p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-900">{plan.name}</p>
                      <p className="text-[11px] text-neutral-400 mt-0.5">
                        ${Number(plan.price_monthly).toFixed(0)}/mo · ${Number(plan.price_yearly).toFixed(0)}/yr
                      </p>
                      <p className="text-[10px] text-neutral-400 mt-1">
                        {plan.stripe_price_monthly && plan.stripe_price_yearly
                          ? 'Billing synced with Stripe'
                          : 'Billing syncs on next save'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={cn(
                          'text-[10px] font-semibold px-1.5 py-0.5 rounded-md uppercase tracking-wide',
                          plan.is_active ? 'bg-success-100 text-success-700' : 'bg-neutral-100 text-neutral-500',
                        )}
                      >
                        {plan.is_active ? 'Active' : 'Off'}
                      </span>
                      <button
                        type="button"
                        onClick={() => openEdit(plan)}
                        className="p-1.5 rounded-lg bg-neutral-100 text-neutral-600"
                        aria-label="Edit plan"
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                  </div>
                </StaggeredItem>
              ))}
            </StaggeredList>
          )}
        </div>
      )}

      {activeTab === 'members' && (
        <div className="space-y-3">
          {membersLoading ? (
            showMembersLoading ? <Skeleton className="h-24 rounded-md" /> : null
          ) : !members?.length ? (
            <EmptyState illustration="empty" title="No members yet" description="Paid members will appear here once the join flow is live." />
          ) : (
            <StaggeredList className="space-y-2">
              {members.map((m) => (
                <StaggeredItem key={m.id} className="rounded-md bg-white shadow-sm p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-900 truncate">
                        {m.profiles?.display_name ?? 'Member'}
                      </p>
                      <p className="text-[11px] text-neutral-400 mt-0.5">
                        {m.membership_plans?.name ?? 'Membership'} · {m.interval}
                      </p>
                      {m.current_period_end && (
                        <p className="text-[10px] text-neutral-400 mt-1">Renews {fmtDate(m.current_period_end)}</p>
                      )}
                    </div>
                    <span
                      className={cn(
                        'text-[10px] font-semibold px-1.5 py-0.5 rounded-md uppercase tracking-wide shrink-0',
                        m.status === 'active' || m.status === 'trialing'
                          ? 'bg-success-100 text-success-700'
                          : m.status === 'past_due'
                            ? 'bg-error-100 text-error-700'
                            : 'bg-neutral-100 text-neutral-500',
                      )}
                    >
                      {m.status}
                    </span>
                  </div>
                </StaggeredItem>
              ))}
            </StaggeredList>
          )}
        </div>
      )}

      {/* Plan editor */}
      <BottomSheet open={!!editing} onClose={() => setEditing(null)}>
        {editing && (
          <div className="space-y-3 p-1">
            <h2 className="text-base font-bold text-neutral-900">{editing.id ? 'Edit plan' : 'New plan'}</h2>
            <Input label="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <Input label="Description" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <Input label="Monthly ($)" inputMode="decimal" value={editing.price_monthly} onChange={(e) => setEditing({ ...editing, price_monthly: e.target.value })} />
              <Input label="Yearly ($)" inputMode="decimal" value={editing.price_yearly} onChange={(e) => setEditing({ ...editing, price_yearly: e.target.value })} />
            </div>
            <p className="text-[11px] text-neutral-400">
              Billing is handled for you: saving this plan creates or updates the matching Stripe product and prices automatically. You never need to open Stripe.
            </p>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={editing.is_active}
                onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
              />
              Active (visible on the join page)
            </label>
            <Button onClick={() => upsertPlan.mutate(editing)} disabled={upsertPlan.isPending || !editing.name.trim()} className="w-full">
              {upsertPlan.isPending ? 'Saving...' : 'Save plan'}
            </Button>
            {editing.id && (
              <button
                type="button"
                onClick={() => setConfirmDelete(editing.id)}
                className="w-full text-xs font-semibold text-error-600 py-2"
              >
                Delete plan
              </button>
            )}
          </div>
        )}
      </BottomSheet>

      <ConfirmationSheet
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && deletePlan.mutate(confirmDelete)}
        title="Delete this plan?"
        description="The plan is removed and its Stripe product and prices are archived. Existing members keep their subscription until it ends."
        confirmLabel="Delete plan"
        variant="warning"
      />
    </div>
  )
}
