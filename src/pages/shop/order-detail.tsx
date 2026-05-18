import { useState, useCallback } from 'react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Truck, MapPin, RotateCcw } from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Divider } from '@/components/divider'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { BottomSheet } from '@/components/bottom-sheet'
import { useToast } from '@/components/toast'
import { useOrder, useRequestReturn } from '@/hooks/use-orders'
import { formatPrice, type OrderStatus } from '@/types/merch'
import { cn } from '@/lib/cn'

const STATUS_STEPS: OrderStatus[] = ['pending', 'processing', 'shipped', 'delivered']

function StatusTimeline({ current }: { current: OrderStatus }) {
  const currentIdx = STATUS_STEPS.indexOf(current)
  const isCancelled = current === 'cancelled' || current === 'refunded'

  return (
    <div className="flex items-center gap-1" aria-label={`Order status: ${current}`}>
      {STATUS_STEPS.map((step, i) => {
        const done = i <= currentIdx && !isCancelled
        return (
          <div key={step} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={cn(
                  'w-3 h-3 rounded-full border-2',
                  done ? 'bg-neutral-900 border-neutral-900' : 'bg-white border-neutral-200',
                  isCancelled && 'bg-error border-error',
                )}
              />
              <span className="text-[11px] mt-1 text-neutral-500 capitalize">
                {step}
              </span>
            </div>
            {i < STATUS_STEPS.length - 1 && (
              <div
                className={cn(
                  'h-0.5 flex-1 -mt-4',
                  i < currentIdx && !isCancelled ? 'bg-neutral-900' : 'bg-neutral-200',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const shouldReduceMotion = useReducedMotion()
  const { toast } = useToast()
  const { data: order, isLoading } = useOrder(orderId)
  const showLoading = useDelayedLoading(isLoading)
  const requestReturn = useRequestReturn()

  const stagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.04 } },
  }

  const fadeUp = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  }

  const [showReturnSheet, setShowReturnSheet] = useState(false)
  const [returnReason, setReturnReason] = useState('')

  const handleReturn = useCallback(async () => {
    if (!orderId || !returnReason.trim()) return
    try {
      await requestReturn.mutateAsync({ orderId, reason: returnReason.trim() })
      toast.success('Return request submitted')
      setShowReturnSheet(false)
      setReturnReason('')
    } catch {
      toast.error('Failed to submit return request')
    }
  }, [orderId, returnReason, requestReturn, toast])

  if (showLoading) {
    return (
      <Page swipeBack header={<Header title="Order" back />}>
        <div className="py-4 space-y-3">
          <Skeleton variant="title" />
          <Skeleton variant="text" count={4} />
          <Skeleton variant="card" />
        </div>
      </Page>
    )
  }

  if (!order) {
    return (
      <Page swipeBack header={<Header title="Order" back />}>
        <EmptyState
          illustration="error"
          title="Order not found"
          description="This order may not exist or you may not have access"
          action={{ label: 'View all orders', to: '/shop/orders' }}
        />
      </Page>
    )
  }

  const canReturn = order.status === 'delivered' && !order.return_requested

  return (
    <Page swipeBack header={<Header title={`Order #${order.id.slice(0, 8)}`} back />}>
      <motion.div
        variants={shouldReduceMotion ? undefined : stagger}
        initial="hidden"
        animate="visible"
        className="py-5 space-y-6"
      >
        {/* Status timeline */}
        <motion.section variants={fadeUp}>
          <StatusTimeline current={order.status} />
        </motion.section>

        {/* Tracking info */}
        {order.tracking_number && (
          <motion.section variants={fadeUp} className="p-3 rounded-xl bg-white border border-neutral-100 shadow-sm">
            <div className="flex items-center gap-2">
              <Truck size={16} className="text-neutral-500" />
              <span className="text-sm font-medium text-neutral-900">Tracking number</span>
            </div>
            <p className="mt-1 text-sm font-mono text-neutral-900">{order.tracking_number}</p>
          </motion.section>
        )}

        {/* Items */}
        <motion.section variants={fadeUp}>
          <h3 className="font-heading font-semibold text-neutral-900 mb-3">
            Items ({order.items.length})
          </h3>
          <div className="space-y-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex gap-3">
                <img
                  src={item.image_url ?? '/img/placeholder-merch.jpg'}
                  alt={item.product_name}
                  className="w-16 h-16 object-cover rounded-xl shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] sm:text-sm font-medium text-neutral-900 line-clamp-2 leading-snug">
                    {item.product_name}
                  </p>
                  <p className="text-xs text-neutral-500">{item.variant_label}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-neutral-500">Qty: {item.quantity}</span>
                    <span className="text-sm font-semibold text-neutral-900 tabular-nums">
                      {formatPrice(item.price_cents * item.quantity)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.section>

        <Divider />

        {/* Price breakdown */}
        <motion.section variants={fadeUp} className="space-y-2 text-sm">
          <div className="flex justify-between font-heading font-bold text-neutral-900">
            <span>Total</span>
            <span className="tabular-nums">{formatPrice(order.total_cents ?? Math.round((order.total ?? 0) * 100))}</span>
          </div>
        </motion.section>

        {/* Shipping address */}
        <motion.section variants={fadeUp}>
          <div className="flex items-center gap-2 mb-2">
            <MapPin size={16} className="text-neutral-400" />
            <h3 className="font-heading font-semibold text-neutral-900 text-sm">
              Shipping address
            </h3>
          </div>
          <div className="p-3 rounded-xl bg-white shadow-sm border border-neutral-100 text-sm text-neutral-900">
            <p className="font-medium">{order.shipping_address.full_name}</p>
            <p>{order.shipping_address.line1}</p>
            {order.shipping_address.line2 && <p>{order.shipping_address.line2}</p>}
            <p>
              {order.shipping_address.city}, {order.shipping_address.state}{' '}
              {order.shipping_address.postcode}
            </p>
          </div>
        </motion.section>

        {/* Order date */}
        <p className="text-xs text-neutral-500 text-center">
          Ordered {formatDate(order.created_at)}
        </p>

        {/* Return button */}
        {canReturn && (
          <Button
            variant="ghost"
            fullWidth
            icon={<RotateCcw size={16} />}
            onClick={() => setShowReturnSheet(true)}
          >
            Request return
          </Button>
        )}
      </motion.div>

      {/* Return bottom sheet */}
      <BottomSheet
        open={showReturnSheet}
        onClose={() => setShowReturnSheet(false)}
      >
        <div className="space-y-4">
          <h3 className="font-heading font-semibold text-neutral-900 text-lg">
            Request a return
          </h3>
          <p className="text-sm text-neutral-500">
            Let us know why you'd like to return this order. Our team will review your request.
          </p>
          <Input
            type="textarea"
            label="Reason for return"
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
            rows={3}
            required
          />
          <Button
            variant="primary"
            fullWidth
            loading={requestReturn.isPending}
            disabled={!returnReason.trim()}
            onClick={handleReturn}
          >
            Submit return request
          </Button>
        </div>
      </BottomSheet>
    </Page>
  )
}
