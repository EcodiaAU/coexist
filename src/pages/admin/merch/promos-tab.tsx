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
  percentage: 'from-info-500/90 to-info-700',
  flat: 'from-success-500/90 to-success-700',
  free_shipping: 'from-plum-500/90 to-plum-700',
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
    <BottomSheet open={open} onClose={onClose} snapPoints={SNAP_POINTS_75}>
      <div className="space-y-5" onKeyDown={handleKeyDown}>
        <h3 className="font-heading font-semibold text-lg text-neutral-900">
          {promo ? 'Edit promo' : 'New promo code'}
        </h3>
        <Input
          label="Code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />

        {/* Type selector with richer colours */}
        <div>
          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Type</p>
          <div className="flex gap-2">
            {(['percentage', 'flat', 'free_shipping'] as PromoType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  'flex-1 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors duration-150',
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
          <Input
            label={type === 'percentage' ? 'Percentage' : 'Amount (cents)'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        )}
        <Input
          label="Max uses (optional)"
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
        />
        <Input
          label="Expires"
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />
        <Toggle label="Active" checked={isActive} onChange={setIsActive} />
        <div className="pt-1">
          <Button variant="primary" fullWidth loading={upsert.isPending} onClick={handleSave}>
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
    return <Skeleton variant="text" count={5} />
  }
  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible">
      <motion.div variants={fadeUp} className="flex justify-between items-center mb-5">
        <h2 className="font-heading font-semibold text-neutral-900">
          Promo Codes
          <span className="ml-2 text-sm font-normal text-neutral-500">{promos?.length ?? 0}</span>
        </h2>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => {
            setEditPromo(undefined)
            setFormOpen(true)
          }}
        >
          Add
        </Button>
      </motion.div>

      <motion.div variants={fadeUp}>
      {!promos || promos.length === 0 ? (
        <EmptyState
          illustration="empty"
          title="No promo codes"
          description="Create promo codes for discounts and campaigns"
        />
      ) : (
        <StaggeredList className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {promos.map((promo) => {
            const Icon = TYPE_ICONS[promo.type]
            return (
              <StaggeredItem
                key={promo.id}
                className={cn(
                  'rounded-2xl p-5 shadow-lg bg-gradient-to-br relative overflow-hidden',
                  CARD_GRADIENTS[promo.type],
                  !promo.is_active && 'opacity-60 grayscale-[30%]',
                )}
              >
                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/15">
                        <Icon size={18} className="text-white" />
                      </span>
                      <div>
                        <span className="font-mono font-bold text-sm text-white block">
                          {promo.code}
                        </span>
                        {!promo.is_active && (
                          <span className="text-[10px] font-bold text-white/50 uppercase">Inactive</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditPromo(promo)
                        setFormOpen(true)
                      }}
                      className="flex items-center gap-1.5 px-3.5 min-h-11 rounded-lg bg-white/15 text-white/90 text-sm font-semibold hover:bg-white/25 cursor-pointer transition-colors"
                    >
                      <Edit3 size={12} />
                      Edit
                    </button>
                  </div>

                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="font-heading text-2xl font-bold text-white tabular-nums">
                      {promo.type === 'percentage' && `${promo.value}%`}
                      {promo.type === 'flat' && `$${Number(promo.value).toFixed(2)}`}
                      {promo.type === 'free_shipping' && 'Free'}
                    </span>
                    <span className="text-xs text-white/50">
                      {promo.type === 'free_shipping' ? 'shipping' : 'off'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-white/60">
                    <span>{promo.uses_count}{promo.max_uses ? ` / ${promo.max_uses}` : ''} uses</span>
                    {promo.valid_to && (
                      <span>
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

      <PromoFormSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        promo={editPromo}
      />
    </motion.div>
  )
}
