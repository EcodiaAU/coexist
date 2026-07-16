import { useState, useCallback, useEffect, startTransition } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import { Plus, Edit3, Percent, DollarSign, Truck } from 'lucide-react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Toggle } from '@/components/toggle'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { StaggeredList, StaggeredItem } from '@/components/scroll-reveal'
import { BottomSheet } from '@/components/bottom-sheet'
import { useToast } from '@/components/toast'
import { useAdminPromoCodes, useUpsertPromoCode } from '@/hooks/use-admin-merch'
import { type PromoCode, type PromoType } from '@/types/merch'
import { cn } from '@/lib/cn'

const SNAP_POINTS_75 = [0.75]

const TYPE_LABELS: Record<PromoType, string> = {
  percentage: '% Off',
  flat: '$ Off',
  free_shipping: 'Free Ship',
}

const TYPE_COLOURS: Record<PromoType, string> = {
  percentage: 'bg-info-100 text-info-700 ring-info-300',
  flat: 'bg-success-100 text-success-700 ring-success-300',
  free_shipping: 'bg-plum-100 text-plum-700 ring-plum-300',
}

const CARD_GRADIENTS: Record<PromoType, string> = {
  percentage: 'bg-info-600',
  flat: 'bg-success-600',
  free_shipping: 'bg-plum-600',
}

const TYPE_ICONS: Record<PromoType, typeof Percent> = {
  percentage: Percent,
  flat: DollarSign,
  free_shipping: Truck,
}

function PromoFormSheet({
  open,
  onClose,
  promo,
}: {
  open: boolean
  onClose: () => void
  promo?: PromoCode
}) {
  const { toast } = useToast()
  const upsert = useUpsertPromoCode()

  const [code, setCode] = useState('')
  const [type, setType] = useState<PromoType>('percentage')
  const [value, setValue] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [isActive, setIsActive] = useState(true)

  // Populate form when opening
  useEffect(() => {
    if (open) {
      startTransition(() => {
        setCode(promo?.code ?? '')
        setType(promo?.type ?? 'percentage')
        setValue(promo ? String(promo.value) : '')
        setMaxUses(promo?.max_uses ? String(promo.max_uses) : '')
        setExpiresAt(promo?.valid_to?.slice(0, 10) ?? '')
        setIsActive(promo?.is_active ?? true)
      })
    }
  }, [open, promo])

  const handleSave = useCallback(async () => {
    if (!code.trim() || !value) {
      toast.error('Code and value are required')
      return
    }
    try {
      await upsert.mutateAsync({
        ...(promo ? { id: promo.id } : {}),
        code: code.toUpperCase().trim(),
        type,
        value: Number(value),
        max_uses: maxUses ? Number(maxUses) : null,
        valid_to: expiresAt || null,
        is_active: isActive,
      })
      toast.success(promo ? 'Promo updated' : 'Promo created')
      onClose()
    } catch {
      toast.error('Failed to save promo')
    }
  }, [code, type, value, maxUses, expiresAt, isActive, promo, upsert, toast, onClose])

  // Prevent Enter key from bubbling out of inputs
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') {
      e.preventDefault()
    }
  }, [])

  return (
    <BottomSheet data-eos-id="src/pages/admin/merch/promos-tab.tsx#0" open={open} onClose={onClose} snapPoints={SNAP_POINTS_75}>
      <div data-eos-id="src/pages/admin/merch/promos-tab.tsx#1" className="space-y-5" onKeyDown={handleKeyDown}>
        <h3 data-eos-id="src/pages/admin/merch/promos-tab.tsx#2" className="font-heading font-semibold text-lg text-neutral-900">
          {promo ? 'Edit promo' : 'New promo code'}
        </h3>
        <Input data-eos-id="src/pages/admin/merch/promos-tab.tsx#3"
          label="Code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />

        {/* Type selector with richer colours */}
        <div data-eos-id="src/pages/admin/merch/promos-tab.tsx#4">
          <p data-eos-id="src/pages/admin/merch/promos-tab.tsx#5" className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Type</p>
          <div data-eos-id="src/pages/admin/merch/promos-tab.tsx#6" className="flex gap-2">
            {(['percentage', 'flat', 'free_shipping'] as PromoType[]).map((t) => (
              <button data-eos-id="src/pages/admin/merch/promos-tab.tsx#7" data-eos-var="TYPE_LABELS.[..]" data-eos-var-label="]" data-eos-var-scope="prop"
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  'flex-1 py-2.5 rounded-sm text-xs font-semibold cursor-pointer transition-colors duration-150',
                  type === t
                    ? `${TYPE_COLOURS[t]} ring-2 shadow-sm`
                    : 'bg-neutral-50 text-neutral-400 hover:bg-neutral-100',
                )}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {type !== 'free_shipping' && (
          <Input data-eos-id="src/pages/admin/merch/promos-tab.tsx#8"
            label={type === 'percentage' ? 'Percentage' : 'Amount (cents)'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        )}
        <Input data-eos-id="src/pages/admin/merch/promos-tab.tsx#9"
          label="Max uses (optional)"
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
        />
        <Input data-eos-id="src/pages/admin/merch/promos-tab.tsx#10"
          label="Expires"
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />
        <Toggle data-eos-id="src/pages/admin/merch/promos-tab.tsx#11" label="Active" checked={isActive} onChange={setIsActive} />
        <div data-eos-id="src/pages/admin/merch/promos-tab.tsx#12" className="pt-1">
          <Button data-eos-id="src/pages/admin/merch/promos-tab.tsx#13" variant="primary" fullWidth loading={upsert.isPending} onClick={handleSave}>
            {promo ? 'Update' : 'Create'}
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}

export default function PromosTab() {
  const { data: promos, isLoading } = useAdminPromoCodes()
  const showLoading = useDelayedLoading(isLoading)
  const shouldReduceMotion = useReducedMotion()
  const [formOpen, setFormOpen] = useState(false)
  const [editPromo, setEditPromo] = useState<PromoCode | undefined>()

  if (showLoading) {
    return <Skeleton data-eos-id="src/pages/admin/merch/promos-tab.tsx#14" variant="text" count={5} />
  }
  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  return (
    <motion.div data-eos-id="src/pages/admin/merch/promos-tab.tsx#15" variants={stagger} initial="hidden" animate="visible">
      <motion.div data-eos-id="src/pages/admin/merch/promos-tab.tsx#16" variants={fadeUp} className="flex justify-between items-center mb-5">
        <h2 data-eos-id="src/pages/admin/merch/promos-tab.tsx#17" className="font-heading font-semibold text-neutral-900">
          Promo Codes
          <span data-eos-id="src/pages/admin/merch/promos-tab.tsx#18" className="ml-2 text-sm font-normal text-neutral-500">{promos?.length ?? 0}</span>
        </h2>
        <Button data-eos-id="src/pages/admin/merch/promos-tab.tsx#19"
          variant="primary"
          size="sm"
          icon={<Plus data-eos-id="src/pages/admin/merch/promos-tab.tsx#20" size={14} />}
          onClick={() => {
            setEditPromo(undefined)
            setFormOpen(true)
          }}
        >
          Add
        </Button>
      </motion.div>

      <motion.div data-eos-id="src/pages/admin/merch/promos-tab.tsx#21" variants={fadeUp}>
      {!promos || promos.length === 0 ? (
        <EmptyState data-eos-id="src/pages/admin/merch/promos-tab.tsx#22"
          illustration="empty"
          title="No promo codes"
          description="Create promo codes for discounts and campaigns"
        />
      ) : (
        <StaggeredList data-eos-id="src/pages/admin/merch/promos-tab.tsx#23" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {promos.map((promo) => {
            const Icon = TYPE_ICONS[promo.type]
            return (
              <StaggeredItem data-eos-id="src/pages/admin/merch/promos-tab.tsx#24"
                key={promo.id}
                className={cn(
                  'rounded-md p-5 shadow-sm relative overflow-hidden',
                  CARD_GRADIENTS[promo.type],
                  !promo.is_active && 'opacity-60 grayscale-[30%]',
                )}
              >
                <div data-eos-id="src/pages/admin/merch/promos-tab.tsx#25" className="relative z-10">
                  <div data-eos-id="src/pages/admin/merch/promos-tab.tsx#26" className="flex items-start justify-between mb-3">
                    <div data-eos-id="src/pages/admin/merch/promos-tab.tsx#27" className="flex items-center gap-2">
                      <span data-eos-id="src/pages/admin/merch/promos-tab.tsx#28" className="flex items-center justify-center w-9 h-9 rounded-sm bg-white/15">
                        <Icon data-eos-id="src/pages/admin/merch/promos-tab.tsx#29" size={18} className="text-white" />
                      </span>
                      <div data-eos-id="src/pages/admin/merch/promos-tab.tsx#30">
                        <span data-eos-id="src/pages/admin/merch/promos-tab.tsx#31" data-eos-var="promo.code" data-eos-var-label="Code" data-eos-var-scope="item" className="font-mono font-bold text-sm text-white block">
                          {promo.code}
                        </span>
                        {!promo.is_active && (
                          <span data-eos-id="src/pages/admin/merch/promos-tab.tsx#32" className="text-[10px] font-bold text-white/50 uppercase">Inactive</span>
                        )}
                      </div>
                    </div>
                    <button data-eos-id="src/pages/admin/merch/promos-tab.tsx#33"
                      type="button"
                      onClick={() => {
                        setEditPromo(promo)
                        setFormOpen(true)
                      }}
                      className="flex items-center gap-1.5 px-3.5 min-h-11 rounded-sm bg-white/15 text-white/90 text-sm font-semibold hover:bg-white/25 cursor-pointer transition-colors"
                    >
                      <Edit3 data-eos-id="src/pages/admin/merch/promos-tab.tsx#34" size={12} />
                      Edit
                    </button>
                  </div>

                  <div data-eos-id="src/pages/admin/merch/promos-tab.tsx#35" className="flex items-baseline gap-1 mb-2">
                    <span data-eos-id="src/pages/admin/merch/promos-tab.tsx#36" data-eos-var="promo.type,promo.type,promo.type" data-eos-var-label="Type, Type, Type" data-eos-var-scope="item" className="font-heading text-2xl font-bold text-white tabular-nums">
                      {promo.type === 'percentage' && `${promo.value}%`}
                      {promo.type === 'flat' && `$${Number(promo.value).toFixed(2)}`}
                      {promo.type === 'free_shipping' && 'Free'}
                    </span>
                    <span data-eos-id="src/pages/admin/merch/promos-tab.tsx#37" data-eos-var="promo.type" data-eos-var-label="Type" data-eos-var-scope="item" className="text-xs text-white/50">
                      {promo.type === 'free_shipping' ? 'shipping' : 'off'}
                    </span>
                  </div>

                  <div data-eos-id="src/pages/admin/merch/promos-tab.tsx#38" className="flex items-center gap-3 text-xs text-white/60">
                    <span data-eos-id="src/pages/admin/merch/promos-tab.tsx#39" data-eos-var="promo.uses_count,promo.max_uses" data-eos-var-label="Uses count, Max uses" data-eos-var-scope="item">{promo.uses_count}{promo.max_uses ? ` / ${promo.max_uses}` : ''} uses</span>
                    {promo.valid_to && (
                      <span data-eos-id="src/pages/admin/merch/promos-tab.tsx#40" data-eos-var="promo.valid_to" data-eos-var-label="Valid to" data-eos-var-scope="item">
                        Exp {new Date(promo.valid_to).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                </div>
              </StaggeredItem>
            )
          })}
        </StaggeredList>
      )}
      </motion.div>

      <PromoFormSheet data-eos-id="src/pages/admin/merch/promos-tab.tsx#41"
        open={formOpen}
        onClose={() => setFormOpen(false)}
        promo={editPromo}
      />
    </motion.div>
  )
}
