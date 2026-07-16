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
      <div className="flex items-center gap-2 px-3 py-2 rounded-sm bg-error-50/60">
        <RefreshCw size={14} className="text-error-500" />
        <span className="text-xs font-medium text-error-700 capitalize">{status}</span>
        <span className="text-xs text-error-400 ml-auto">{formatDateTime(updatedAt)}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      {STATUS_FLOW.map((s, i) => {
        const Icon = STATUS_ICONS[s]
        const isActive = i <= currentIdx
        const isCurrent = i === currentIdx

        return (
          <div key={s} className="flex items-center gap-1 flex-1">
            <div
              className={cn(
                'flex items-center justify-center w-7 h-7 rounded-full shrink-0 transition-colors',
                isCurrent
                  ? 'bg-primary-500 text-white shadow-sm'
                  : isActive
                    ? 'bg-primary-200 text-primary-700'
                    : 'bg-neutral-50 text-neutral-300',
              )}
            >
              <Icon size={12} />
            </div>
            {i < STATUS_FLOW.length - 1 && (
              <div
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
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
      {cards.map((c) => {
        const Icon = c.icon
        return (
          <div key={c.label} className="p-4 rounded-md bg-white border border-neutral-100 shadow-sm text-center">
            <div className={cn('w-7 h-7 rounded-sm flex items-center justify-center mx-auto mb-1', c.iconBg)}>
              <Icon size={14} />
            </div>
            <p className="font-heading text-xl font-bold tabular-nums text-neutral-900">{c.count}</p>
            <p className="text-[11px] font-semibold mt-0.5 text-neutral-500">{c.label}</p>
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
      <Divider />
      <div>
        <h4 className="text-xs font-semibold text-neutral-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <RotateCcw size={12} />
          Return Requests
        </h4>
        <div className="space-y-2">
          {returns.map((ret) => (
            <div
              key={ret.id}
              className="p-3 rounded-sm bg-white border border-neutral-100 shadow-sm"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <Avatar
                    src={ret.profiles?.avatar_url}
                    name={ret.profiles?.display_name ?? 'User'}
                    size="xs"
                  />
                  <span className="text-sm font-medium text-neutral-900">
                    {ret.profiles?.display_name ?? 'Unknown'}
                  </span>
                </div>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize',
                    RETURN_STATUS_COLORS[ret.status],
                  )}
                >
                  {ret.status}
                </span>
              </div>
              <p className="text-sm text-neutral-400 mb-1">
                <span className="font-medium">Reason:</span> {ret.reason}
              </p>
              {ret.status === 'requested' && (
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Check size={14} />}
                    loading={updateReturn.isPending}
                    onClick={() => handleUpdate(ret.id, 'approved')}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<X size={14} />}
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

  if (showLoading) return <Skeleton variant="text" count={3} />
  if (!returns || returns.length === 0) return null

  const pending = returns.filter((r) => r.status === 'requested')
  if (pending.length === 0) return null

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-sm bg-warning-50 text-warning-600">
          <RotateCcw size={14} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-neutral-900">Pending Returns</h3>
          <p className="text-[11px] text-neutral-400">{pending.length} awaiting review</p>
        </div>
      </div>
      <div className="space-y-2">
        {pending.map((ret) => (
          <div
            key={ret.id}
            className="p-4 rounded-md bg-white border border-neutral-100 shadow-sm"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Avatar
                  src={ret.profiles?.avatar_url}
                  name={ret.profiles?.display_name ?? 'User'}
                  size="xs"
                />
                <span className="text-sm font-medium text-neutral-900">
                  {ret.profiles?.display_name ?? 'Unknown'}
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize bg-warning-100 text-warning-800">
                {ret.status}
              </span>
            </div>
            <p className="text-sm text-neutral-400 mb-1">
              <span className="font-medium">Reason:</span> {ret.reason}
            </p>
            {ret.order && (
              <p className="text-xs text-neutral-400 mb-2">
                Order #{(ret.order as { id: string }).id.slice(0, 8)} ·{' '}
                {formatPrice((ret.order as { total_cents: number }).total_cents)}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                icon={<Check size={14} />}
                loading={updateReturn.isPending}
                onClick={() => handleUpdate(ret.id, 'approved')}
              >
                Approve
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={<X size={14} />}
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
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="stat-card" />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} variant="card" />
        ))}
      </div>
    )
  }
  if (isLoading && !orders) return null

  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible">
      {/* Pending returns banner */}
      <motion.div variants={fadeUp}>
        <AllReturnsList />
      </motion.div>

      {/* Summary counts */}
      {orders && orders.length > 0 && (
        <motion.div variants={fadeUp}>
          <OrderCounts orders={orders} />
        </motion.div>
      )}

      {/* Filters */}
      <motion.div variants={fadeUp} className="mb-3">
        <TabBar
          tabs={STATUS_OPTIONS.map((opt) => ({ id: opt.value, label: opt.label }))}
          activeTab={statusFilter}
          onChange={(id) => setStatusFilter(id as OrderStatus | 'all')}
          aria-label="Order status filter"
        />
      </motion.div>

      {/* Search + export */}
      <motion.div variants={fadeUp} className="flex gap-2 mb-5">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search orders..."
          compact
          className="flex-1 [&>*+*]:!bg-white"
        />
        <Button variant="ghost" size="sm" icon={<Download size={14} />} onClick={handleExport}>
          CSV
        </Button>
      </motion.div>

      {/* Order list */}
      <motion.div variants={fadeUp}>
        {filteredOrders.length === 0 ? (
          <EmptyState
            illustration="empty"
            title="No orders"
            description={search ? 'Try a different search' : 'Orders will appear here'}
          />
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => openOrder(order)}
                className={cn(
                  'w-full text-left p-5 bg-white border rounded-md shadow-sm cursor-pointer transition-[color,background-color,transform] duration-200 active:scale-[0.98]',
                  CARD_STATUS_GRADIENTS[order.status] ?? 'border-neutral-100',
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Avatar
                      src={order.profiles?.avatar_url}
                      name={order.profiles?.display_name ?? 'Unknown'}
                      size="xs"
                    />
                    <span className="text-sm font-semibold text-neutral-900">
                      {order.profiles?.display_name ?? 'Unknown'}
                    </span>
                  </div>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize',
                      STATUS_COLORS[order.status],
                    )}
                  >
                    {order.status}
                  </span>
                </div>

                {/* Mini timeline */}
                <OrderTimeline
                  status={order.status}
                  createdAt={order.created_at}
                  updatedAt={order.updated_at}
                />

                <div className="flex items-center justify-between mt-2.5">
                  <span className="text-xs text-neutral-400">
                    #{order.id.slice(0, 8)} · {order.items.length} item
                    {order.items.length !== 1 ? 's' : ''} · {formatDate(order.created_at)}
                  </span>
                  <span className="font-heading font-bold text-sm text-neutral-900 tabular-nums">
                    {formatPrice(order.total_cents)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </motion.div>

      {/* ---- Order detail sheet ---- */}
      <BottomSheet
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        snapPoints={[0.9]}
      >
        {selectedOrder && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-heading font-semibold text-lg text-neutral-900">
                  Order #{selectedOrder.id.slice(0, 8)}
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {formatDateTime(selectedOrder.created_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleCopyId(selectedOrder.id)}
                className="flex items-center gap-1.5 px-3 min-h-11 rounded-sm text-sm text-neutral-400 hover:bg-neutral-50 cursor-pointer"
              >
                <Copy size={12} />
                Copy ID
              </button>
            </div>

            {/* Timeline */}
            <OrderTimeline
              status={selectedOrder.status}
              createdAt={selectedOrder.created_at}
              updatedAt={selectedOrder.updated_at}
            />

            <Divider />

            {/* Customer */}
            <div className="flex items-center gap-3">
              <Avatar
                src={selectedOrder.profiles?.avatar_url}
                name={selectedOrder.profiles?.display_name ?? 'Unknown'}
                size="sm"
              />
              <div>
                <p className="text-sm font-semibold text-neutral-900">
                  {selectedOrder.profiles?.display_name ?? 'Unknown'}
                </p>
              </div>
            </div>

            <Divider />

            {/* Items */}
            <div>
              <h4 className="text-xs font-semibold text-neutral-900 uppercase tracking-wider mb-2">
                Items
              </h4>
              <div className="space-y-2">
                {selectedOrder.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-2 rounded-sm bg-neutral-50">
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt={item.product_name}
                        className="w-10 h-10 rounded-sm object-cover shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">
                        {item.product_name}
                      </p>
                      <p className="text-xs text-neutral-400">
                        {item.variant_label} x{item.quantity}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-neutral-900 tabular-nums shrink-0">
                      {formatPrice(item.price_cents * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Total */}
            <div className="px-1">
              <div className="flex justify-between text-sm font-bold text-neutral-900">
                <span>Total</span>
                <span className="tabular-nums">{formatPrice(selectedOrder.total_cents ?? Math.round((selectedOrder.total ?? 0) * 100))}</span>
              </div>
            </div>

            <Divider />

            {/* Shipping address */}
            <div>
              <h4 className="text-xs font-semibold text-neutral-900 uppercase tracking-wider mb-2">
                Shipping
              </h4>
              <div className="flex items-start gap-2 p-3 rounded-sm bg-neutral-50">
                <MapPin size={14} className="text-neutral-400 shrink-0 mt-0.5" />
                <div className="text-sm text-neutral-600">
                  <p className="font-medium">{selectedOrder.shipping_address?.full_name}</p>
                  <p>{selectedOrder.shipping_address?.line1}</p>
                  {selectedOrder.shipping_address?.line2 && (
                    <p>{selectedOrder.shipping_address.line2}</p>
                  )}
                  <p>
                    {selectedOrder.shipping_address?.city} {selectedOrder.shipping_address?.state}{' '}
                    {selectedOrder.shipping_address?.postcode}
                  </p>
                  {selectedOrder.shipping_address?.phone && (
                    <p className="mt-1 text-neutral-400">{selectedOrder.shipping_address.phone}</p>
                  )}
                </div>
              </div>

              {/* Tracking */}
              {selectedOrder.tracking_number && (
                <div className="flex items-center gap-2 mt-2 p-2.5 rounded-sm bg-plum-50">
                  <Truck size={14} className="text-plum-600 shrink-0" />
                  <span className="text-sm font-medium text-plum-800 font-mono">
                    {selectedOrder.tracking_number}
                  </span>
                  <a
                    href={`https://auspost.com.au/mypost/track/#/details/${selectedOrder.tracking_number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-plum-600 hover:text-plum-800"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              )}
            </div>

            {/* Returns for this order */}
            <ReturnsBanner orderId={selectedOrder.id} />

            <Divider />

            {/* Admin notes */}
            <div>
              <h4 className="text-xs font-semibold text-neutral-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <StickyNote size={12} />
                Admin Notes
              </h4>
              <Input
                type="textarea"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Internal notes about this order..."
                rows={2}
              />
              {adminNotes !== ((selectedOrder as OrderWithProfile & { admin_notes?: string }).admin_notes ?? '') && (
                <Button
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

            <Divider />

            {/* ---- Fulfilment actions ---- */}
            <div className="space-y-2">
              {selectedOrder.status === 'pending' && (
                <Button
                  variant="primary"
                  fullWidth
                  icon={<Package size={16} />}
                  loading={updateStatus.isPending}
                  onClick={() => handleStatusUpdate(selectedOrder.id, 'processing')}
                >
                  Start Processing
                </Button>
              )}

              {selectedOrder.status === 'processing' && (
                <>
                  <Input
                    label="Tracking number"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="e.g. AP123456789AU"
                  />
                  <Button
                    variant="primary"
                    fullWidth
                    icon={<Truck size={16} />}
                    loading={updateStatus.isPending}
                    onClick={() => handleStatusUpdate(selectedOrder.id, 'shipped')}
                  >
                    Mark as Shipped
                  </Button>
                </>
              )}

              {selectedOrder.status === 'shipped' && (
                <Button
                  variant="primary"
                  fullWidth
                  icon={<CheckCircle2 size={16} />}
                  loading={updateStatus.isPending}
                  onClick={() => handleStatusUpdate(selectedOrder.id, 'delivered')}
                >
                  Mark as Delivered
                </Button>
              )}

              {['pending', 'processing'].includes(selectedOrder.status) && (
                <Button
                  variant="danger"
                  fullWidth
                  icon={<RefreshCw size={16} />}
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
      <ConfirmationSheet
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
