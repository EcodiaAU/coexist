import { useNavigate } from 'react-router-dom'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { useMyOrders } from '@/hooks/use-orders'
import { formatPrice, type OrderStatus } from '@/types/merch'
import { cn } from '@/lib/cn'

const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } },
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-warning-100 text-warning-800' },
  processing: { label: 'Processing', color: 'bg-info-100 text-info-800' },
  shipped: { label: 'Shipped', color: 'bg-plum-100 text-plum-800' },
  delivered: { label: 'Delivered', color: 'bg-success-100 text-success-800' },
  cancelled: { label: 'Cancelled', color: 'bg-white text-neutral-500' },
  refunded: { label: 'Refunded', color: 'bg-error-100 text-error-700' },
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function OrdersPage() {
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const { data: orders, isLoading, isError, refetch } = useMyOrders()
  const showLoading = useDelayedLoading(isLoading)

  return (
    <Page swipeBack header={<Header title="My Orders" back />}>
      <div className="py-4">
        {showLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} variant="card" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            illustration="error"
            title="Couldn't load orders"
            description="Something went wrong loading your orders."
            action={{ label: 'Try again', onClick: () => refetch() }}
          />
        ) : !orders || orders.length === 0 ? (
          <EmptyState
            illustration="empty"
            title="No orders yet"
            description="Your merch orders will appear here"
            action={{ label: 'Browse shop', to: '/shop' }}
          />
        ) : (
          <motion.div
            variants={shouldReduceMotion ? undefined : stagger}
            initial="hidden"
            animate="visible"
            className="space-y-3"
          >
            {orders.map((order) => {
              const config = STATUS_CONFIG[order.status]
              return (
                <motion.button
                  key={order.id}
                  variants={fadeUp}
                  type="button"
                  onClick={() => navigate(`/shop/orders/${order.id}`)}
                  className={cn(
                    'w-full text-left p-4 rounded-2xl bg-white',
                    'shadow-sm border border-neutral-100',
                    'transition-colors duration-150 cursor-pointer',
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-neutral-500 font-mono">
                      #{order.id.slice(0, 8)}
                    </span>
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-xs font-semibold',
                        config.color,
                      )}
                    >
                      {config.label}
                    </span>
                  </div>

                  {/* Item previews */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex -space-x-2">
                      {order.items.slice(0, 3).map((item) => (
                        <img
                          key={item.id}
                          src={item.image_url ?? '/img/placeholder-merch.jpg'}
                          alt={item.product_name}
                          className="w-8 h-8 rounded-lg object-cover border-2 border-white"
                        />
                      ))}
                      {order.items.length > 3 && (
                        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-white border-2 border-white text-xs font-medium text-neutral-500">
                          +{order.items.length - 3}
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-neutral-500">
                      {order.items.length} item{order.items.length > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-500">
                      {formatDate(order.created_at)}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="font-heading font-bold text-sm text-neutral-900">
                        {formatPrice(order.total_cents ?? 0)}
                      </span>
                      <ChevronRight size={16} className="text-neutral-400" />
                    </div>
                  </div>
                </motion.button>
              )
            })}
          </motion.div>
        )}
      </div>
    </Page>
  )
}
