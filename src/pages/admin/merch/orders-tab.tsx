import { useState, useCallback, useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import {
    Download,
    Truck,
    RefreshCw,
    Package,
    CheckCircle2,
    Clock,
    MapPin,
    Copy,
    ExternalLink,
    StickyNote,
    Check,
    X,
    RotateCcw,
} from 'lucide-react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { TabBar } from '@/components/tab-bar'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { SearchBar } from '@/components/search-bar'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { BottomSheet } from '@/components/bottom-sheet'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { Divider } from '@/components/divider'
import { Avatar } from '@/components/avatar'
import { useToast } from '@/components/toast'
import {
    useAdminOrders,
    useUpdateOrderStatus,
    useRefundOrder,
    useUpdateOrderNotes,
    useAdminReturns,
    useUpdateReturnStatus,
    exportOrdersCsv,
} from '@/hooks/use-admin-merch'
import { formatPrice, type OrderStatus, type Order, type ReturnStatus } from '@/types/merch'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STATUS_OPTIONS: { value: OrderStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
]

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'bg-warning-100 text-warning-800',
  processing: 'bg-info-100 text-info-800',
  shipped: 'bg-plum-100 text-plum-800',
  delivered: 'bg-success-100 text-success-800',
  cancelled: 'bg-white text-neutral-400',
  refunded: 'bg-error-100 text-error-700',
}

const STATUS_ICONS: Record<OrderStatus, typeof Clock> = {
  pending: Clock,
  processing: Package,
  shipped: Truck,
  delivered: CheckCircle2,
  cancelled: RefreshCw,
  refunded: RefreshCw,
}

const CARD_STATUS_GRADIENTS: Record<string, string> = {
  pending: 'border-neutral-100',
  processing: 'border-neutral-100',
  shipped: 'border-neutral-100',
  delivered: 'border-neutral-100',
  cancelled: 'border-neutral-100',
  refunded: 'border-neutral-100',
}

const RETURN_STATUS_COLORS: Record<ReturnStatus, string> = {
  requested: 'bg-warning-100 text-warning-800',
  approved: 'bg-success-100 text-success-800',
  denied: 'bg-error-100 text-error-700',
  refunded: 'bg-plum-100 text-plum-800',
}

const STATUS_FLOW: OrderStatus[] = ['pending', 'processing', 'shipped', 'delivered']

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
  })
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/* ------------------------------------------------------------------ */
/*  Order timeline                                                     */
/* ------------------------------------------------------------------ */

function OrderTimeline({ status, updatedAt }: { status: OrderStatus; createdAt: string; updatedAt: string }) {
  const currentIdx = STATUS_FLOW.indexOf(status)
  const isFinal = status === 'cancelled' || status === 'refunded'

  if (isFinal) {
    return (
      <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#0" className="flex items-center gap-2 px-3 py-2 rounded-sm bg-error-50/60">
        <RefreshCw data-eos-id="src/pages/admin/merch/orders-tab.tsx#1" size={14} className="text-error-500" />
        <span data-eos-id="src/pages/admin/merch/orders-tab.tsx#2" className="text-xs font-medium text-error-700 capitalize">{status}</span>
        <span data-eos-id="src/pages/admin/merch/orders-tab.tsx#3" className="text-xs text-error-400 ml-auto">{formatDateTime(updatedAt)}</span>
      </div>
    )
  }

  return (
    <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#4" className="flex items-center gap-1">
      {STATUS_FLOW.map((s, i) => {
        const Icon = STATUS_ICONS[s]
        const isActive = i <= currentIdx
        const isCurrent = i === currentIdx

        return (
          <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#5" key={s} className="flex items-center gap-1 flex-1">
            <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#6"
              className={cn(
                'flex items-center justify-center w-7 h-7 rounded-full shrink-0 transition-colors',
                isCurrent
                  ? 'bg-primary-500 text-white shadow-sm'
                  : isActive
                    ? 'bg-primary-200 text-primary-700'
                    : 'bg-neutral-50 text-neutral-300',
              )}
            >
              <Icon data-eos-id="src/pages/admin/merch/orders-tab.tsx#7" size={12} />
            </div>
            {i < STATUS_FLOW.length - 1 && (
              <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#8"
                className={cn(
                  'h-0.5 flex-1 rounded-full transition-colors',
                  i < currentIdx ? 'bg-primary-300' : 'bg-neutral-100',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Summary counts                                                     */
/* ------------------------------------------------------------------ */

type OrderWithProfile = Order & { profiles: { display_name: string | null; avatar_url: string | null } | null }

function OrderCounts({ orders }: { orders: OrderWithProfile[] }) {
  const counts = useMemo(() => {
    const c: Record<string, number> = { pending: 0, processing: 0, shipped: 0, delivered: 0 }
    for (const o of orders) {
      if (c[o.status] !== undefined) c[o.status]++
    }
    return c
  }, [orders])

  const cards = [
    { label: 'Pending', count: counts.pending, iconBg: 'bg-warning-50 text-warning-600', icon: Clock },
    { label: 'Processing', count: counts.processing, iconBg: 'bg-info-50 text-info-600', icon: Package },
    { label: 'Shipped', count: counts.shipped, iconBg: 'bg-plum-50 text-plum-600', icon: Truck },
    { label: 'Delivered', count: counts.delivered, iconBg: 'bg-success-50 text-success-600', icon: CheckCircle2 },
  ]

  return (
    <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#9" className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
      {cards.map((c) => {
        const Icon = c.icon
        return (
          <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#10" key={c.label} className="p-4 rounded-md bg-white border border-neutral-100 shadow-sm text-center">
            <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#11" className={cn('w-7 h-7 rounded-sm flex items-center justify-center mx-auto mb-1', c.iconBg)}>
              <Icon data-eos-id="src/pages/admin/merch/orders-tab.tsx#12" size={14} />
            </div>
            <p data-eos-id="src/pages/admin/merch/orders-tab.tsx#13" data-eos-var="c.count" data-eos-var-label="Count" data-eos-var-scope="item" className="font-heading text-xl font-bold tabular-nums text-neutral-900">{c.count}</p>
            <p data-eos-id="src/pages/admin/merch/orders-tab.tsx#14" data-eos-var="c.label" data-eos-var-label="Label" data-eos-var-scope="item" data-eos-var-src="literal" className="text-[11px] font-semibold mt-0.5 text-neutral-500">{c.label}</p>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Returns section (embedded in order detail)                         */
/* ------------------------------------------------------------------ */

function ReturnsBanner({ orderId }: { orderId: string }) {
  const { data: allReturns } = useAdminReturns()
  const updateReturn = useUpdateReturnStatus()
  const { toast } = useToast()

  const returns = useMemo(() => {
    if (!allReturns) return []
    return allReturns.filter((r) => {
      const orderRef = r.order as { id: string } | null
      return orderRef?.id === orderId
    })
  }, [allReturns, orderId])

  const handleUpdate = useCallback(
    async (returnId: string, status: 'approved' | 'denied') => {
      try {
        await updateReturn.mutateAsync({ returnId, status })
        toast.success(`Return ${status}`)
      } catch {
        toast.error('Failed to update return')
      }
    },
    [updateReturn, toast],
  )

  if (returns.length === 0) return null

  return (
    <>
      <Divider data-eos-id="src/pages/admin/merch/orders-tab.tsx#15" />
      <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#16">
        <h4 data-eos-id="src/pages/admin/merch/orders-tab.tsx#17" className="text-xs font-semibold text-neutral-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <RotateCcw data-eos-id="src/pages/admin/merch/orders-tab.tsx#18" size={12} />
          Return Requests
        </h4>
        <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#19" className="space-y-2">
          {returns.map((ret) => (
            <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#20"
              key={ret.id}
              className="p-3 rounded-sm bg-white border border-neutral-100 shadow-sm"
            >
              <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#21" className="flex items-center justify-between mb-1.5">
                <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#22" className="flex items-center gap-2">
                  <Avatar data-eos-id="src/pages/admin/merch/orders-tab.tsx#23"
                    src={ret.profiles?.avatar_url}
                    name={ret.profiles?.display_name ?? 'User'}
                    size="xs"
                  />
                  <span data-eos-id="src/pages/admin/merch/orders-tab.tsx#24" data-eos-var="ret.profiles.display_name" data-eos-var-label="Display name" data-eos-var-scope="item" className="text-sm font-medium text-neutral-900">
                    {ret.profiles?.display_name ?? 'Unknown'}
                  </span>
                </div>
                <span data-eos-id="src/pages/admin/merch/orders-tab.tsx#25" data-eos-var="ret.status" data-eos-var-label="Status" data-eos-var-scope="item"
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize',
                    RETURN_STATUS_COLORS[ret.status],
                  )}
                >
                  {ret.status}
                </span>
              </div>
              <p data-eos-id="src/pages/admin/merch/orders-tab.tsx#26" data-eos-var="ret.reason" data-eos-var-label="Reason" data-eos-var-scope="item" className="text-sm text-neutral-400 mb-1">
                <span data-eos-id="src/pages/admin/merch/orders-tab.tsx#27" className="font-medium">Reason:</span> {ret.reason}
              </p>
              {ret.status === 'requested' && (
                <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#28" className="flex gap-2 mt-2">
                  <Button data-eos-id="src/pages/admin/merch/orders-tab.tsx#29"
                    variant="primary"
                    size="sm"
                    icon={<Check data-eos-id="src/pages/admin/merch/orders-tab.tsx#30" size={14} />}
                    loading={updateReturn.isPending}
                    onClick={() => handleUpdate(ret.id, 'approved')}
                  >
                    Approve
                  </Button>
                  <Button data-eos-id="src/pages/admin/merch/orders-tab.tsx#31"
                    variant="danger"
                    size="sm"
                    icon={<X data-eos-id="src/pages/admin/merch/orders-tab.tsx#32" size={14} />}
                    loading={updateReturn.isPending}
                    onClick={() => handleUpdate(ret.id, 'denied')}
                  >
                    Deny
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Standalone returns list (all returns across orders)                */
/* ------------------------------------------------------------------ */

function AllReturnsList() {
  const { data: returns, isLoading } = useAdminReturns()
  const showLoading = useDelayedLoading(isLoading)
  const updateReturn = useUpdateReturnStatus()
  const { toast } = useToast()

  const handleUpdate = useCallback(
    async (returnId: string, status: 'approved' | 'denied') => {
      try {
        await updateReturn.mutateAsync({ returnId, status })
        toast.success(`Return ${status}`)
      } catch {
        toast.error('Failed to update return')
      }
    },
    [updateReturn, toast],
  )

  if (showLoading) return <Skeleton data-eos-id="src/pages/admin/merch/orders-tab.tsx#33" variant="text" count={3} />
  if (!returns || returns.length === 0) return null

  const pending = returns.filter((r) => r.status === 'requested')
  if (pending.length === 0) return null

  return (
    <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#34" className="mb-5">
      <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#35" className="flex items-center gap-2 mb-3">
        <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#36" className="flex items-center justify-center w-8 h-8 rounded-sm bg-warning-50 text-warning-600">
          <RotateCcw data-eos-id="src/pages/admin/merch/orders-tab.tsx#37" size={14} />
        </div>
        <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#38">
          <h3 data-eos-id="src/pages/admin/merch/orders-tab.tsx#39" className="text-sm font-bold text-neutral-900">Pending Returns</h3>
          <p data-eos-id="src/pages/admin/merch/orders-tab.tsx#40" className="text-[11px] text-neutral-400">{pending.length} awaiting review</p>
        </div>
      </div>
      <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#41" className="space-y-2">
        {pending.map((ret) => (
          <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#42"
            key={ret.id}
            className="p-4 rounded-md bg-white border border-neutral-100 shadow-sm"
          >
            <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#43" className="flex items-center justify-between mb-2">
              <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#44" className="flex items-center gap-2">
                <Avatar data-eos-id="src/pages/admin/merch/orders-tab.tsx#45"
                  src={ret.profiles?.avatar_url}
                  name={ret.profiles?.display_name ?? 'User'}
                  size="xs"
                />
                <span data-eos-id="src/pages/admin/merch/orders-tab.tsx#46" data-eos-var="ret.profiles.display_name" data-eos-var-label="Display name" data-eos-var-scope="item" className="text-sm font-medium text-neutral-900">
                  {ret.profiles?.display_name ?? 'Unknown'}
                </span>
              </div>
              <span data-eos-id="src/pages/admin/merch/orders-tab.tsx#47" data-eos-var="ret.status" data-eos-var-label="Status" data-eos-var-scope="item" className="px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize bg-warning-100 text-warning-800">
                {ret.status}
              </span>
            </div>
            <p data-eos-id="src/pages/admin/merch/orders-tab.tsx#48" data-eos-var="ret.reason" data-eos-var-label="Reason" data-eos-var-scope="item" className="text-sm text-neutral-400 mb-1">
              <span data-eos-id="src/pages/admin/merch/orders-tab.tsx#49" className="font-medium">Reason:</span> {ret.reason}
            </p>
            {ret.order && (
              <p data-eos-id="src/pages/admin/merch/orders-tab.tsx#50" data-eos-var="ret.order,ret.order" data-eos-var-label="Order, Order" data-eos-var-scope="item" className="text-xs text-neutral-400 mb-2">
                Order #{(ret.order as { id: string }).id.slice(0, 8)} ·{' '}
                {formatPrice((ret.order as { total_cents: number }).total_cents)}
              </p>
            )}
            <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#51" className="flex gap-2">
              <Button data-eos-id="src/pages/admin/merch/orders-tab.tsx#52"
                variant="primary"
                size="sm"
                icon={<Check data-eos-id="src/pages/admin/merch/orders-tab.tsx#53" size={14} />}
                loading={updateReturn.isPending}
                onClick={() => handleUpdate(ret.id, 'approved')}
              >
                Approve
              </Button>
              <Button data-eos-id="src/pages/admin/merch/orders-tab.tsx#54"
                variant="danger"
                size="sm"
                icon={<X data-eos-id="src/pages/admin/merch/orders-tab.tsx#55" size={14} />}
                loading={updateReturn.isPending}
                onClick={() => handleUpdate(ret.id, 'denied')}
              >
                Deny
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Orders tab                                                         */
/* ------------------------------------------------------------------ */

export default function OrdersTab() {
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<OrderWithProfile | null>(null)
  const [trackingNumber, setTrackingNumber] = useState('')
  const [adminNotes, setAdminNotes] = useState('')
  const [refundTarget, setRefundTarget] = useState<Order | null>(null)

  const { toast } = useToast()
  const shouldReduceMotion = useReducedMotion()
  const { data: orders, isLoading } = useAdminOrders(
    statusFilter === 'all' ? undefined : statusFilter,
  )
  const showLoading = useDelayedLoading(isLoading)
  const updateStatus = useUpdateOrderStatus()
  const refundOrder = useRefundOrder()
  const updateNotes = useUpdateOrderNotes()

  const filteredOrders = useMemo(() => {
    if (!orders) return []
    if (!search) return orders
    const q = search.toLowerCase()
    return orders.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        (o.profiles?.display_name ?? '').toLowerCase().includes(q),
    )
  }, [orders, search])

  const handleStatusUpdate = useCallback(
    async (orderId: string, status: OrderStatus) => {
      try {
        await updateStatus.mutateAsync({
          orderId,
          status,
          trackingNumber: status === 'shipped' ? trackingNumber : undefined,
        })
        toast.success(`Order marked as ${status}`)
        setSelectedOrder(null)
        setTrackingNumber('')
      } catch {
        toast.error('Failed to update order')
      }
    },
    [updateStatus, trackingNumber, toast],
  )

  const handleSaveNotes = useCallback(async () => {
    if (!selectedOrder) return
    try {
      await updateNotes.mutateAsync({ orderId: selectedOrder.id, notes: adminNotes })
      toast.success('Notes saved')
    } catch {
      toast.error('Failed to save notes')
    }
  }, [selectedOrder, adminNotes, updateNotes, toast])

  const handleRefund = useCallback(async () => {
    if (!refundTarget) return
    try {
      await refundOrder.mutateAsync(refundTarget.id)
      toast.success('Refund initiated - process via Stripe dashboard')
    } catch {
      toast.error('Failed to process refund')
    }
    setRefundTarget(null)
  }, [refundTarget, refundOrder, toast])

  const handleExport = useCallback(async () => {
    try {
      await exportOrdersCsv(statusFilter === 'all' ? undefined : statusFilter)
      toast.success('CSV downloaded')
    } catch {
      toast.error('Export failed')
    }
  }, [statusFilter, toast])

  const handleCopyId = useCallback(
    (id: string) => {
      navigator.clipboard.writeText(id)
      toast.success('Order ID copied')
    },
    [toast],
  )

  const openOrder = useCallback(
    (order: OrderWithProfile) => {
      setSelectedOrder(order)
      setTrackingNumber(order.tracking_number ?? '')
      setAdminNotes((order as OrderWithProfile & { admin_notes?: string }).admin_notes ?? '')
    },
    [],
  )

  // Only show skeleton on first ever load, not on tab/filter switches
  if (showLoading && !orders) {
    return (
      <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#56" className="space-y-3">
        <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#57" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton data-eos-id="src/pages/admin/merch/orders-tab.tsx#58" key={i} variant="stat-card" />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton data-eos-id="src/pages/admin/merch/orders-tab.tsx#59" key={i} variant="card" />
        ))}
      </div>
    )
  }
  if (isLoading && !orders) return null

  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  return (
    <motion.div data-eos-id="src/pages/admin/merch/orders-tab.tsx#60" variants={stagger} initial="hidden" animate="visible">
      {/* Pending returns banner */}
      <motion.div data-eos-id="src/pages/admin/merch/orders-tab.tsx#61" variants={fadeUp}>
        <AllReturnsList data-eos-id="src/pages/admin/merch/orders-tab.tsx#62" />
      </motion.div>

      {/* Summary counts */}
      {orders && orders.length > 0 && (
        <motion.div data-eos-id="src/pages/admin/merch/orders-tab.tsx#63" variants={fadeUp}>
          <OrderCounts data-eos-id="src/pages/admin/merch/orders-tab.tsx#64" orders={orders} />
        </motion.div>
      )}

      {/* Filters */}
      <motion.div data-eos-id="src/pages/admin/merch/orders-tab.tsx#65" variants={fadeUp} className="mb-3">
        <TabBar data-eos-id="src/pages/admin/merch/orders-tab.tsx#66"
          tabs={STATUS_OPTIONS.map((opt) => ({ id: opt.value, label: opt.label }))}
          activeTab={statusFilter}
          onChange={(id) => setStatusFilter(id as OrderStatus | 'all')}
          aria-label="Order status filter"
        />
      </motion.div>

      {/* Search + export */}
      <motion.div data-eos-id="src/pages/admin/merch/orders-tab.tsx#67" variants={fadeUp} className="flex gap-2 mb-5">
        <SearchBar data-eos-id="src/pages/admin/merch/orders-tab.tsx#68"
          value={search}
          onChange={setSearch}
          placeholder="Search orders..."
          compact
          className="flex-1 [&>*+*]:!bg-white"
        />
        <Button data-eos-id="src/pages/admin/merch/orders-tab.tsx#69" variant="ghost" size="sm" icon={<Download data-eos-id="src/pages/admin/merch/orders-tab.tsx#70" size={14} />} onClick={handleExport}>
          CSV
        </Button>
      </motion.div>

      {/* Order list */}
      <motion.div data-eos-id="src/pages/admin/merch/orders-tab.tsx#71" variants={fadeUp}>
        {filteredOrders.length === 0 ? (
          <EmptyState data-eos-id="src/pages/admin/merch/orders-tab.tsx#72"
            illustration="empty"
            title="No orders"
            description={search ? 'Try a different search' : 'Orders will appear here'}
          />
        ) : (
          <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#73" className="space-y-4">
            {filteredOrders.map((order) => (
              <button data-eos-id="src/pages/admin/merch/orders-tab.tsx#74"
                key={order.id}
                type="button"
                onClick={() => openOrder(order)}
                className={cn(
                  'w-full text-left p-5 bg-white border rounded-md shadow-sm cursor-pointer transition-[color,background-color,transform] duration-200 active:scale-[0.98]',
                  CARD_STATUS_GRADIENTS[order.status] ?? 'border-neutral-100',
                )}
              >
                <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#75" className="flex items-center justify-between mb-2">
                  <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#76" className="flex items-center gap-2">
                    <Avatar data-eos-id="src/pages/admin/merch/orders-tab.tsx#77"
                      src={order.profiles?.avatar_url}
                      name={order.profiles?.display_name ?? 'Unknown'}
                      size="xs"
                    />
                    <span data-eos-id="src/pages/admin/merch/orders-tab.tsx#78" data-eos-var="order.profiles.display_name" data-eos-var-label="Display name" data-eos-var-scope="item" className="text-sm font-semibold text-neutral-900">
                      {order.profiles?.display_name ?? 'Unknown'}
                    </span>
                  </div>
                  <span data-eos-id="src/pages/admin/merch/orders-tab.tsx#79" data-eos-var="order.status" data-eos-var-label="Status" data-eos-var-scope="item"
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize',
                      STATUS_COLORS[order.status],
                    )}
                  >
                    {order.status}
                  </span>
                </div>

                {/* Mini timeline */}
                <OrderTimeline data-eos-id="src/pages/admin/merch/orders-tab.tsx#80"
                  status={order.status}
                  createdAt={order.created_at}
                  updatedAt={order.updated_at}
                />

                <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#81" className="flex items-center justify-between mt-2.5">
                  <span data-eos-id="src/pages/admin/merch/orders-tab.tsx#82" data-eos-var="order.id,order.created_at" data-eos-var-label="Id, Created at" data-eos-var-scope="item" className="text-xs text-neutral-400">
                    #{order.id.slice(0, 8)} · {order.items.length} item
                    {order.items.length !== 1 ? 's' : ''} · {formatDate(order.created_at)}
                  </span>
                  <span data-eos-id="src/pages/admin/merch/orders-tab.tsx#83" data-eos-var="order.total_cents" data-eos-var-label="Total cents" data-eos-var-scope="item" className="font-heading font-bold text-sm text-neutral-900 tabular-nums">
                    {formatPrice(order.total_cents)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </motion.div>

      {/* ---- Order detail sheet ---- */}
      <BottomSheet data-eos-id="src/pages/admin/merch/orders-tab.tsx#84"
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        snapPoints={[0.9]}
      >
        {selectedOrder && (
          <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#85" className="space-y-4">
            {/* Header */}
            <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#86" className="flex items-center justify-between">
              <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#87">
                <h3 data-eos-id="src/pages/admin/merch/orders-tab.tsx#88" data-eos-var="selectedOrder.id" data-eos-var-label="Id" data-eos-var-scope="prop" className="font-heading font-semibold text-lg text-neutral-900">
                  Order #{selectedOrder.id.slice(0, 8)}
                </h3>
                <p data-eos-id="src/pages/admin/merch/orders-tab.tsx#89" data-eos-var="selectedOrder.created_at" data-eos-var-label="Created at" data-eos-var-scope="prop" className="text-xs text-neutral-400 mt-0.5">
                  {formatDateTime(selectedOrder.created_at)}
                </p>
              </div>
              <button data-eos-id="src/pages/admin/merch/orders-tab.tsx#90"
                type="button"
                onClick={() => handleCopyId(selectedOrder.id)}
                className="flex items-center gap-1.5 px-3 min-h-11 rounded-sm text-sm text-neutral-400 hover:bg-neutral-50 cursor-pointer"
              >
                <Copy data-eos-id="src/pages/admin/merch/orders-tab.tsx#91" size={12} />
                Copy ID
              </button>
            </div>

            {/* Timeline */}
            <OrderTimeline data-eos-id="src/pages/admin/merch/orders-tab.tsx#92"
              status={selectedOrder.status}
              createdAt={selectedOrder.created_at}
              updatedAt={selectedOrder.updated_at}
            />

            <Divider data-eos-id="src/pages/admin/merch/orders-tab.tsx#93" />

            {/* Customer */}
            <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#94" className="flex items-center gap-3">
              <Avatar data-eos-id="src/pages/admin/merch/orders-tab.tsx#95"
                src={selectedOrder.profiles?.avatar_url}
                name={selectedOrder.profiles?.display_name ?? 'Unknown'}
                size="sm"
              />
              <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#96">
                <p data-eos-id="src/pages/admin/merch/orders-tab.tsx#97" data-eos-var="selectedOrder.profiles.display_name" data-eos-var-label="Display name" data-eos-var-scope="prop" className="text-sm font-semibold text-neutral-900">
                  {selectedOrder.profiles?.display_name ?? 'Unknown'}
                </p>
              </div>
            </div>

            <Divider data-eos-id="src/pages/admin/merch/orders-tab.tsx#98" />

            {/* Items */}
            <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#99">
              <h4 data-eos-id="src/pages/admin/merch/orders-tab.tsx#100" className="text-xs font-semibold text-neutral-900 uppercase tracking-wider mb-2">
                Items
              </h4>
              <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#101" className="space-y-2">
                {selectedOrder.items.map((item) => (
                  <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#102" key={item.id} className="flex items-center gap-3 p-2 rounded-sm bg-neutral-50">
                    {item.image_url && (
                      <img data-eos-id="src/pages/admin/merch/orders-tab.tsx#103"
                        src={item.image_url}
                        alt={item.product_name}
                        className="w-10 h-10 rounded-sm object-cover shrink-0"
                      />
                    )}
                    <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#104" className="flex-1 min-w-0">
                      <p data-eos-id="src/pages/admin/merch/orders-tab.tsx#105" data-eos-var="item.product_name" data-eos-var-label="Product name" data-eos-var-scope="item" className="text-sm font-medium text-neutral-900 truncate">
                        {item.product_name}
                      </p>
                      <p data-eos-id="src/pages/admin/merch/orders-tab.tsx#106" data-eos-var="item.variant_label,item.quantity" data-eos-var-label="Variant label, Quantity" data-eos-var-scope="item" className="text-xs text-neutral-400">
                        {item.variant_label} x{item.quantity}
                      </p>
                    </div>
                    <span data-eos-id="src/pages/admin/merch/orders-tab.tsx#107" data-eos-var="item.price_cents" data-eos-var-label="Price cents" data-eos-var-scope="item" className="text-sm font-semibold text-neutral-900 tabular-nums shrink-0">
                      {formatPrice(item.price_cents * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Total */}
            <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#108" className="px-1">
              <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#109" className="flex justify-between text-sm font-bold text-neutral-900">
                <span data-eos-id="src/pages/admin/merch/orders-tab.tsx#110">Total</span>
                <span data-eos-id="src/pages/admin/merch/orders-tab.tsx#111" data-eos-var="selectedOrder.total_cents" data-eos-var-label="Total cents" data-eos-var-scope="prop" className="tabular-nums">{formatPrice(selectedOrder.total_cents ?? Math.round((selectedOrder.total ?? 0) * 100))}</span>
              </div>
            </div>

            <Divider data-eos-id="src/pages/admin/merch/orders-tab.tsx#112" />

            {/* Shipping address */}
            <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#113">
              <h4 data-eos-id="src/pages/admin/merch/orders-tab.tsx#114" className="text-xs font-semibold text-neutral-900 uppercase tracking-wider mb-2">
                Shipping
              </h4>
              <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#115" className="flex items-start gap-2 p-3 rounded-sm bg-neutral-50">
                <MapPin data-eos-id="src/pages/admin/merch/orders-tab.tsx#116" size={14} className="text-neutral-400 shrink-0 mt-0.5" />
                <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#117" className="text-sm text-neutral-600">
                  <p data-eos-id="src/pages/admin/merch/orders-tab.tsx#118" data-eos-var="selectedOrder.shipping_address.full_name" data-eos-var-label="Full name" data-eos-var-scope="prop" className="font-medium">{selectedOrder.shipping_address?.full_name}</p>
                  <p data-eos-id="src/pages/admin/merch/orders-tab.tsx#119" data-eos-var="selectedOrder.shipping_address.line1" data-eos-var-label="Line1" data-eos-var-scope="prop">{selectedOrder.shipping_address?.line1}</p>
                  {selectedOrder.shipping_address?.line2 && (
                    <p data-eos-id="src/pages/admin/merch/orders-tab.tsx#120" data-eos-var="selectedOrder.shipping_address.line2" data-eos-var-label="Line2" data-eos-var-scope="prop">{selectedOrder.shipping_address.line2}</p>
                  )}
                  <p data-eos-id="src/pages/admin/merch/orders-tab.tsx#121" data-eos-var="selectedOrder.shipping_address.city,selectedOrder.shipping_address.state,selectedOrder.shipping_address.postcode" data-eos-var-label="City, State, Postcode" data-eos-var-scope="prop">
                    {selectedOrder.shipping_address?.city} {selectedOrder.shipping_address?.state}{' '}
                    {selectedOrder.shipping_address?.postcode}
                  </p>
                  {selectedOrder.shipping_address?.phone && (
                    <p data-eos-id="src/pages/admin/merch/orders-tab.tsx#122" data-eos-var="selectedOrder.shipping_address.phone" data-eos-var-label="Phone" data-eos-var-scope="prop" className="mt-1 text-neutral-400">{selectedOrder.shipping_address.phone}</p>
                  )}
                </div>
              </div>

              {/* Tracking */}
              {selectedOrder.tracking_number && (
                <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#123" className="flex items-center gap-2 mt-2 p-2.5 rounded-sm bg-plum-50">
                  <Truck data-eos-id="src/pages/admin/merch/orders-tab.tsx#124" size={14} className="text-plum-600 shrink-0" />
                  <span data-eos-id="src/pages/admin/merch/orders-tab.tsx#125" data-eos-var="selectedOrder.tracking_number" data-eos-var-label="Tracking number" data-eos-var-scope="prop" className="text-sm font-medium text-plum-800 font-mono">
                    {selectedOrder.tracking_number}
                  </span>
                  <a data-eos-href="dynamic" data-eos-href-label="Tracking number" data-eos-href-scope="prop" data-eos-id="src/pages/admin/merch/orders-tab.tsx#126"
                    href={`https://auspost.com.au/mypost/track/#/details/${selectedOrder.tracking_number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-plum-600 hover:text-plum-800"
                  >
                    <ExternalLink data-eos-id="src/pages/admin/merch/orders-tab.tsx#127" size={14} />
                  </a>
                </div>
              )}
            </div>

            {/* Returns for this order */}
            <ReturnsBanner data-eos-id="src/pages/admin/merch/orders-tab.tsx#128" orderId={selectedOrder.id} />

            <Divider data-eos-id="src/pages/admin/merch/orders-tab.tsx#129" />

            {/* Admin notes */}
            <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#130">
              <h4 data-eos-id="src/pages/admin/merch/orders-tab.tsx#131" className="text-xs font-semibold text-neutral-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <StickyNote data-eos-id="src/pages/admin/merch/orders-tab.tsx#132" size={12} />
                Admin Notes
              </h4>
              <Input data-eos-id="src/pages/admin/merch/orders-tab.tsx#133"
                type="textarea"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Internal notes about this order..."
                rows={2}
              />
              {adminNotes !== ((selectedOrder as OrderWithProfile & { admin_notes?: string }).admin_notes ?? '') && (
                <Button data-eos-id="src/pages/admin/merch/orders-tab.tsx#134"
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  loading={updateNotes.isPending}
                  onClick={handleSaveNotes}
                >
                  Save notes
                </Button>
              )}
            </div>

            <Divider data-eos-id="src/pages/admin/merch/orders-tab.tsx#135" />

            {/* ---- Fulfilment actions ---- */}
            <div data-eos-id="src/pages/admin/merch/orders-tab.tsx#136" className="space-y-2">
              {selectedOrder.status === 'pending' && (
                <Button data-eos-id="src/pages/admin/merch/orders-tab.tsx#137"
                  variant="primary"
                  fullWidth
                  icon={<Package data-eos-id="src/pages/admin/merch/orders-tab.tsx#138" size={16} />}
                  loading={updateStatus.isPending}
                  onClick={() => handleStatusUpdate(selectedOrder.id, 'processing')}
                >
                  Start Processing
                </Button>
              )}

              {selectedOrder.status === 'processing' && (
                <>
                  <Input data-eos-id="src/pages/admin/merch/orders-tab.tsx#139"
                    label="Tracking number"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="e.g. AP123456789AU"
                  />
                  <Button data-eos-id="src/pages/admin/merch/orders-tab.tsx#140"
                    variant="primary"
                    fullWidth
                    icon={<Truck data-eos-id="src/pages/admin/merch/orders-tab.tsx#141" size={16} />}
                    loading={updateStatus.isPending}
                    onClick={() => handleStatusUpdate(selectedOrder.id, 'shipped')}
                  >
                    Mark as Shipped
                  </Button>
                </>
              )}

              {selectedOrder.status === 'shipped' && (
                <Button data-eos-id="src/pages/admin/merch/orders-tab.tsx#142"
                  variant="primary"
                  fullWidth
                  icon={<CheckCircle2 data-eos-id="src/pages/admin/merch/orders-tab.tsx#143" size={16} />}
                  loading={updateStatus.isPending}
                  onClick={() => handleStatusUpdate(selectedOrder.id, 'delivered')}
                >
                  Mark as Delivered
                </Button>
              )}

              {['pending', 'processing'].includes(selectedOrder.status) && (
                <Button data-eos-id="src/pages/admin/merch/orders-tab.tsx#144"
                  variant="danger"
                  fullWidth
                  icon={<RefreshCw data-eos-id="src/pages/admin/merch/orders-tab.tsx#145" size={16} />}
                  onClick={() => setRefundTarget(selectedOrder)}
                >
                  Refund Order
                </Button>
              )}
            </div>
          </div>
        )}
      </BottomSheet>

      {/* Refund confirmation */}
      <ConfirmationSheet data-eos-id="src/pages/admin/merch/orders-tab.tsx#146"
        open={!!refundTarget}
        onClose={() => setRefundTarget(null)}
        onConfirm={handleRefund}
        title="Refund order?"
        description={`This will mark the order as refunded (${formatPrice(refundTarget?.total_cents ?? 0)}). Process the actual refund via Stripe dashboard.`}
        confirmLabel="Refund"
        variant="danger"
      />
    </motion.div>
  )
}
