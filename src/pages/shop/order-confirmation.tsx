import { useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import {
  CheckCircle, Package, ArrowRight, ShoppingBag,
  MapPin, Calendar, Truck, Leaf, Sparkles,
} from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Button } from '@/components/button'
import { Skeleton } from '@/components/skeleton'
import { WhatsNext } from '@/components/whats-next'
import { useCart } from '@/hooks/use-cart'
import { useOrder } from '@/hooks/use-orders'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { formatPrice, type OrderStatus } from '@/types/merch'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ */
/*  Animation variants                                                 */
/* ------------------------------------------------------------------ */

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } },
}
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] },
  },
}

/* ------------------------------------------------------------------ */
/*  Status badge config                                                */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-warning-100 text-warning-800' },
  processing: { label: 'Processing', color: 'bg-info-100 text-info-800' },
  shipped: { label: 'Shipped', color: 'bg-plum-100 text-plum-800' },
  delivered: { label: 'Delivered', color: 'bg-success-100 text-success-800' },
  cancelled: { label: 'Cancelled', color: 'bg-white text-neutral-400' },
  refunded: { label: 'Refunded', color: 'bg-error-100 text-error-700' },
}

/* ------------------------------------------------------------------ */
/*  Confetti particles                                                 */
/* ------------------------------------------------------------------ */

interface Particle {
  id: number
  x: number
  y: number
  yEnd: number
  size: number
  color: string
  delay: number
  duration: number
  rotation: number
  rotateEnd: number
  drift: number
}

const CONFETTI_COLORS = [
  'bg-primary-400',     // sage green
  'bg-sprout-400',      // bright green
  'bg-moss-400',        // deep green
  'bg-[#c4a86b]',       // warm gold
  'bg-[#a67c52]',       // warm brown
  'bg-primary-300',     // light sage
  'bg-sprout-300',      // light sprout
  'bg-[#d4b98a]',       // amber/tan
]

// Module-level generator - random calls live outside component scope to satisfy react-hooks/purity
function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const rotation = Math.random() * 360
    return {
      id: i,
      x: Math.random() * 100,
      y: -10 - Math.random() * 20,
      yEnd: 320 + Math.random() * 120,
      size: 4 + Math.random() * 6,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.random() * 1.2,
      duration: 2.2 + Math.random() * 1.5,
      rotation,
      rotateEnd: rotation + 180 + Math.random() * 180,
      drift: (Math.random() - 0.5) * 40,
    }
  })
}

function useConfettiParticles(count: number): Particle[] {
  return useMemo(() => generateParticles(count), [count])
}

function ConfettiLayer({ rm }: { rm: boolean }) {
  const particles = useConfettiParticles(rm ? 0 : 28)

  if (rm) return null

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className={cn('absolute rounded-sm', p.color)}
          style={{
            width: p.size,
            height: p.size * 0.6,
            left: `${p.x}%`,
            rotate: p.rotation,
          }}
          initial={{ y: p.y, opacity: 0 }}
          animate={{
            y: [p.y, p.yEnd],
            x: [0, p.drift],
            opacity: [0, 1, 1, 0],
            rotate: [p.rotation, p.rotateEnd],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Breathing decorative elements                                      */
/* ------------------------------------------------------------------ */

function DepthElements({ rm: _rm }: { rm: boolean }) {
  return null
}

/* ------------------------------------------------------------------ */
/*  Hero celebration section                                           */
/* ------------------------------------------------------------------ */

function CelebrationHero({ rm }: { rm: boolean }) {
  return (
    <div className="relative pt-16 pb-6 overflow-hidden">
      <ConfettiLayer rm={rm} />

      <div className="relative z-20 flex flex-col items-center text-center px-6">
        {/* Animated check icon with pulsing rings */}
        <motion.div
          className="relative mb-5"
          initial={rm ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.15 }}
        >
          <div className="relative w-20 h-20 rounded-full bg-primary-500 flex items-center justify-center">
            <CheckCircle size={36} className="text-white" strokeWidth={2.5} />
          </div>
        </motion.div>

        {/* Heading */}
        <motion.h1
          initial={rm ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="font-heading text-2xl sm:text-3xl font-extrabold text-neutral-900"
        >
          Order confirmed!
        </motion.h1>

        <motion.p
          initial={rm ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.35 }}
          className="mt-2 text-sm text-neutral-500 max-w-xs leading-relaxed"
        >
          You&apos;ll receive a confirmation email shortly with your order details.
        </motion.p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Order summary card                                                 */
/* ------------------------------------------------------------------ */

function OrderSummaryCard({
  orderId,
  rm,
}: {
  orderId: string
  rm: boolean
}) {
  const { data: order, isLoading, isError } = useOrder(orderId)
  const showLoading = useDelayedLoading(isLoading)
  if (showLoading) {
    return (
      <div className="bg-white border border-neutral-100 shadow-sm rounded-2xl overflow-hidden">
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton variant="text" className="w-32" />
            <Skeleton variant="text" className="w-20" />
          </div>
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-12 h-12 rounded-xl" />
              <div className="flex-1 space-y-1.5">
                <Skeleton variant="text" className="w-3/4" />
                <Skeleton variant="text" className="w-1/3" />
              </div>
            </div>
          ))}
          <div className="h-px bg-neutral-100" />
          <div className="flex justify-between">
            <Skeleton variant="text" className="w-16" />
            <Skeleton variant="text" className="w-20" />
          </div>
        </div>
      </div>
    )
  }

  if (isError || !order) {
    return (
      <div className="bg-white border border-neutral-100 shadow-sm rounded-2xl overflow-hidden">
        <div className="p-5 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-50 border border-neutral-100">
            <Package size={16} className="text-neutral-500" />
            <span className="text-sm font-mono text-neutral-900">
              #{orderId.slice(0, 8)}
            </span>
          </div>
          <p className="mt-3 text-sm text-neutral-500">
            Order details will appear here once ready.
          </p>
        </div>
      </div>
    )
  }

  const config = STATUS_CONFIG[order.status]
  const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <motion.div
      initial={rm ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.4 }}
      className="bg-white border border-neutral-100 shadow-sm rounded-2xl overflow-hidden"
    >
      <div className="p-5">
        {/* Order ID + Status */}
        <div className="flex items-center justify-between mb-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-50 border border-neutral-100">
            <Package size={13} className="text-neutral-500" />
            <span className="text-xs font-mono font-semibold text-neutral-900">
              #{orderId.slice(0, 8)}
            </span>
          </div>
          <span
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-semibold',
              config.color,
            )}
          >
            {config.label}
          </span>
        </div>

        {/* Items list */}
        <div className="space-y-3 mb-4">
          {order.items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <img
                src={item.image_url ?? '/img/placeholder-merch.jpg'}
                alt={item.product_name}
                className="w-12 h-12 rounded-xl object-cover border border-neutral-100 shadow-sm"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] sm:text-sm font-semibold text-neutral-900 line-clamp-2 leading-snug">
                  {item.product_name}
                </p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {item.variant_label && (
                    <span>{item.variant_label} &middot; </span>
                  )}
                  Qty {item.quantity}
                </p>
              </div>
              <span className="text-sm font-heading font-bold text-neutral-900 tabular-nums shrink-0">
                {formatPrice(item.price_cents * item.quantity)}
              </span>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-neutral-100 to-transparent mb-3" />

        {/* Shipping + total */}
        <div className="space-y-2">
          {(() => {
            // DB has flat columns shipping_city/shipping_state, but Order type has nested shipping_address
            const raw = order as unknown as Record<string, unknown>
            const city = (raw.shipping_city as string) || order.shipping_address?.city
            const state = (raw.shipping_state as string) || order.shipping_address?.state
            const location = [city, state].filter(Boolean).join(', ')
            if (!location) return null
            return (
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <MapPin size={13} className="shrink-0" />
                <span>Shipping to {location}</span>
              </div>
            )
          })()}
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Calendar size={13} className="shrink-0" />
            <span>
              Ordered {new Date(order.created_at).toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </div>
        </div>

        {/* Total row */}
        <div className="mt-4 flex items-center justify-between px-4 py-3 rounded-2xl bg-neutral-50">
          <span className="text-sm font-semibold text-neutral-900">
            Total ({itemCount} item{itemCount !== 1 ? 's' : ''})
          </span>
          <span className="font-heading text-lg font-extrabold text-neutral-900 tabular-nums">
            {formatPrice(order.total_cents ?? 0)}
          </span>
        </div>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Impact message card                                                */
/* ------------------------------------------------------------------ */

function ImpactCard({ rm }: { rm: boolean }) {
  return (
    <motion.div
      initial={rm ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.4 }}
      className="flex items-start gap-3 p-4 rounded-2xl bg-white border border-neutral-100 shadow-sm"
    >
      <div className="w-10 h-10 rounded-xl bg-primary-500 flex items-center justify-center shrink-0">
        <Leaf size={18} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-neutral-900">
          Thanks for supporting Co-Exist!
        </p>
        <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
          Every purchase funds conservation events and habitat restoration across Australia.
        </p>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function OrderConfirmationPage() {
  const [searchParams] = useSearchParams()
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const clearCart = useCart((s) => s.clear)
  const orderId = searchParams.get('order_id')

  // Clear cart on mount when we have a valid order_id
  useEffect(() => {
    if (orderId) {
      clearCart()
    }
  }, [orderId, clearCart])

  return (
    <Page
      noBackground
      fullBleed
      className="!bg-transparent"
      stickyOverlay={<Header title="" back transparent className="!fixed pointer-events-none [&_button]:pointer-events-auto" />}
    >
      <div className="relative min-h-[80dvh] bg-white">
        <DepthElements rm={rm} />

        {/* ── Content ── */}
        <div className="relative z-10 px-4 lg:px-6">
          <div className="max-w-lg mx-auto">
            <motion.div
              variants={rm ? undefined : stagger}
              initial="hidden"
              animate="visible"
              className="space-y-5"
            >
              {/* ── Celebration hero ── */}
              <motion.div variants={fadeUp}>
                <CelebrationHero rm={rm} />
              </motion.div>

              {/* ── Order summary ── */}
              {orderId && (
                <motion.div variants={fadeUp}>
                  <OrderSummaryCard orderId={orderId} rm={rm} />
                </motion.div>
              )}

              {/* ── Impact message ── */}
              <motion.div variants={fadeUp}>
                <ImpactCard rm={rm} />
              </motion.div>

              {/* ── Action buttons ── */}
              <motion.div variants={fadeUp} className="space-y-3">
                {orderId && (
                  <Link to={`/shop/orders/${orderId}`} tabIndex={-1}>
                    <Button
                      variant="primary"
                      size="lg"
                      fullWidth
                      icon={<Truck size={18} />}
                      className="!rounded-2xl"
                    >
                      Track your order
                    </Button>
                  </Link>
                )}
                <Link to="/shop" tabIndex={-1} className="block">
                  <Button
                    variant="ghost"
                    fullWidth
                    icon={<ShoppingBag size={16} />}
                    className="!rounded-2xl"
                  >
                    Continue shopping
                  </Button>
                </Link>
              </motion.div>

              {/* ── Divider ── */}
              <div className="h-px bg-gradient-to-r from-transparent via-neutral-100 to-transparent" />

              {/* ── What's next ── */}
              <motion.div variants={fadeUp}>
                <WhatsNext
                  suggestions={[
                    ...(orderId
                      ? [{
                          label: 'Track Order',
                          description: 'View shipping status and updates',
                          icon: <Truck size={16} />,
                          to: `/shop/orders/${orderId}`,
                        }]
                      : []),
                    {
                      label: 'View All Orders',
                      description: 'See your full order history',
                      icon: <Package size={16} />,
                      to: '/shop/orders',
                    },
                    {
                      label: 'Find an Event',
                      description: 'Join a conservation event near you',
                      icon: <Sparkles size={16} />,
                      to: '/events',
                    },
                  ]}
                />
              </motion.div>

              {/* Bottom spacing */}
              <div className="h-16" />
            </motion.div>
          </div>
        </div>
      </div>
    </Page>
  )
}
