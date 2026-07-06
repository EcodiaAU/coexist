import { useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
    Minus, Plus, Tag, ArrowRight, Clock,
    AlertTriangle, ShoppingBag, Truck, Shield, X, Leaf,
} from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { useToast } from '@/components/toast'
import { useCart } from '@/hooks/use-cart'
import { validatePromoCode } from '@/hooks/use-merch'
import {
    useMyReservations,
    useReservationCountdown,
    useReserveStock,
    useCartReservationSync,
} from '@/hooks/use-stock-reservation'
import { formatPrice, variantLabel } from '@/types/merch'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ */
/*  Reservation countdown badge                                        */
/* ------------------------------------------------------------------ */

function ReservationTimer({ expiresAt }: { expiresAt: string | undefined }) {
  const { secondsLeft, isExpiring, isExpired } = useReservationCountdown(expiresAt)

  if (secondsLeft === null) return null

  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  const display = `${mins}:${secs.toString().padStart(2, '0')}`

  if (isExpired) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-error-50 mt-2 w-fit">
        <AlertTriangle size={11} className="text-error-500" />
        <span className="text-[11px] font-semibold text-error-600">Expired</span>
      </div>
    )
  }

  return (
    <div className={cn(
      'flex items-center gap-1.5 px-2.5 py-1 rounded-full mt-2 w-fit',
      isExpiring ? 'bg-warning-50' : 'bg-moss-50',
    )}>
      <Clock size={11} className={isExpiring ? 'text-warning-500' : 'text-moss-600'} />
      <span className={cn(
        'text-[11px] font-semibold tabular-nums',
        isExpiring ? 'text-warning-600' : 'text-moss-700',
      )}>
        {display} left
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Cart page                                                          */
/* ------------------------------------------------------------------ */

export default function CartPage() {
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const { toast } = useToast()
  const items = useCart((s) => s.items)
  const removeItem = useCart((s) => s.removeItem)
  const updateQuantity = useCart((s) => s.updateQuantity)
  const promoCode = useCart((s) => s.promoCode)
  const setPromoCode = useCart((s) => s.setPromoCode)
  const subtotalCents = useCart((s) => s.subtotalCents())
  const memberDiscountCents = useCart((s) => s.memberDiscountCents())
  const discountCents = useCart((s) => s.discountCents())
  const shippingCents = useCart((s) => s.shippingCents())
  const totalCents = useCart((s) => s.totalCents())
  const linePriceCents = useCart((s) => s.linePriceCents)
  const hasUnpricedItems = useCart((s) => s.hasUnpricedItems())

  const { release, reserve } = useReserveStock()
  const { getReservation } = useMyReservations()
  useCartReservationSync(items)

  const handleRemove = useCallback((variantId: string) => {
    removeItem(variantId)
    release(variantId)
  }, [removeItem, release])

  const handleUpdateQuantity = useCallback(async (item: typeof items[0], newQty: number) => {
    if (newQty <= 0) {
      handleRemove(item.variant.id)
      return
    }
    const result = await reserve(item.product.id, item.variant.id, newQty)
    if (!result.success) {
      toast.error(
        result.available === 0
          ? 'This item is no longer available'
          : `Only ${result.available} available`,
      )
      if (result.available && result.available > 0) {
        updateQuantity(item.variant.id, result.available)
      }
      return
    }
    updateQuantity(item.variant.id, newQty)
  }, [handleRemove, reserve, updateQuantity, toast])

  const stagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.06 } },
  }

  const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
  }

  const [promoInput, setPromoInput] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)

  const handleApplyPromo = useCallback(async () => {
    if (!promoInput.trim()) return
    setPromoLoading(true)
    try {
      const result = await validatePromoCode(promoInput)
      if (result.valid && result.promo) {
        setPromoCode(result.promo as NonNullable<typeof promoCode>)
        toast.success('Promo code applied!')
        setPromoInput('')
      } else {
        toast.error('Invalid or expired promo code')
      }
    } catch {
      toast.error('Error validating promo code')
    } finally {
      setPromoLoading(false)
    }
  }, [promoInput, setPromoCode, toast])

  /* ================================================================ */
  /*  Empty state                                                      */
  /* ================================================================ */
  if (items.length === 0) {
    return (
      <Page swipeBack noBackground className="!px-0" stickyOverlay={<Header title="" back transparent className="collapse-header" />}>
        {/* Hero */}
        <div className="relative overflow-hidden bg-white">

          <div className="relative z-10 px-4 sm:px-6 lg:px-8 pb-16 text-center" style={{ paddingTop: '5rem' }}>
            <motion.div
              initial={rm ? false : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
              className="inline-flex items-center justify-center w-16 h-16 rounded-md bg-neutral-100 mb-5"
            >
              <ShoppingBag size={30} className="text-neutral-400" />
            </motion.div>

            <motion.div
              initial={rm ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <h1 className="font-heading text-2xl font-bold text-neutral-900">
                Your cart is empty
              </h1>
              <p className="text-sm text-neutral-500 mt-2.5 max-w-[260px] mx-auto leading-relaxed">
                Gear that gives back - every purchase supports conservation across Australia
              </p>
            </motion.div>
          </div>

        </div>

        {/* Body */}
        <div className="bg-white px-5 pt-6 pb-10 flex flex-col items-center">
          <Link to="/shop" tabIndex={-1}>
            <Button variant="primary" size="lg" icon={<ShoppingBag size={18} />}>
              Browse the shop
            </Button>
          </Link>

          <div className="flex items-center gap-4 mt-8 px-5 py-3 rounded-md bg-white border border-neutral-100 shadow-sm">
            <div className="flex items-center gap-1.5 text-neutral-500">
              <Truck size={14} />
              <span className="text-xs font-medium">Free over $75</span>
            </div>
            <div className="w-px h-4 bg-neutral-200" />
            <div className="flex items-center gap-1.5 text-neutral-500">
              <Shield size={14} />
              <span className="text-xs font-medium">Secure checkout</span>
            </div>
          </div>
        </div>
      </Page>
    )
  }

  /* ================================================================ */
  /*  Cart with items                                                  */
  /* ================================================================ */
  return (
    <Page
      swipeBack
      noBackground
      className="!px-0"
      stickyOverlay={<Header title="" back transparent className="collapse-header" />}
      footer={
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-500">Total</span>
            <span className="font-heading text-lg font-bold text-neutral-900 tabular-nums">
              {formatPrice(totalCents)}
            </span>
          </div>
          {hasUnpricedItems && (
            <p className="text-xs text-error text-center">
              Some items in your cart are missing a price. Remove them to
              continue, or contact us for help.
            </p>
          )}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            icon={<ArrowRight size={18} />}
            disabled={hasUnpricedItems}
            onClick={() => navigate('/shop/checkout')}
          >
            Checkout
          </Button>
        </div>
      }
    >
      {/* ── Hero ── */}
      <div className="relative overflow-hidden bg-white">

        <div
          className="relative z-10 px-4 sm:px-6 lg:px-8 pb-12 flex items-center gap-4"
          style={{ paddingTop: '3.5rem' }}
        >
          <div className="flex items-center justify-center w-12 h-12 rounded-sm bg-neutral-100 shrink-0">
            <ShoppingBag size={22} className="text-neutral-400" />
          </div>
          <div>
            <h1 className="font-heading text-lg font-bold text-neutral-900">
              {items.length} {items.length === 1 ? 'item' : 'items'} in your cart
            </h1>
            <p className="text-xs text-neutral-500 mt-0.5">
              {formatPrice(subtotalCents)} subtotal
            </p>
          </div>
        </div>

      </div>

      {/* ── Cart body ── */}
      <div className="bg-white min-h-[50dvh]">
        <motion.div
          variants={rm ? undefined : stagger}
          initial="hidden"
          animate="visible"
          className="px-4 pt-4 pb-6 space-y-3"
        >
          {/* Cart items */}
          <AnimatePresence mode="popLayout">
            {items.map((item) => (
              <motion.div
                key={item.variant.id}
                layout
                initial={rm ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={rm ? undefined : { opacity: 0, x: -60, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.25 }}
                className="relative rounded-md overflow-hidden bg-white border border-neutral-100 shadow-sm"
              >
                <div className="flex gap-3.5 p-3.5">
                  {/* Image */}
                  <Link to={`/shop/${item.product.slug}`} className="shrink-0 group">
                    <div className="relative rounded-sm overflow-hidden ring-1 ring-primary-900/[0.06]">
                      <img
                        src={item.product.images[0] ?? '/img/placeholder-merch.jpg'}
                        alt={item.product.name}
                        className="w-[84px] h-[84px] object-cover group-active:scale-[0.97] transition-transform duration-150"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 ring-1 ring-inset ring-black/[0.04] rounded-sm pointer-events-none" />
                    </div>
                  </Link>

                  {/* Details */}
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-heading font-semibold text-[13px] sm:text-sm text-neutral-900 line-clamp-2 leading-tight">
                          {item.product.name}
                        </p>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          {variantLabel(item.variant)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemove(item.variant.id)}
                        className="flex items-center justify-center w-11 h-11 -mt-0.5 -mr-1 rounded-full text-neutral-400 hover:text-error-500 hover:bg-error-50 cursor-pointer select-none active:scale-[0.98] transition-transform duration-150"
                        aria-label={`Remove ${item.product.name}`}
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <ReservationTimer expiresAt={getReservation(item.variant.id)?.expires_at} />

                    {/* Price + Quantity */}
                    <div className="flex items-center justify-between mt-auto pt-2">
                      <p className="font-heading font-bold text-[15px] text-neutral-900 tabular-nums">
                        {(() => {
                          const unit = linePriceCents(item)
                          return unit === null
                            ? 'Price unavailable'
                            : formatPrice(unit * item.quantity)
                        })()}
                      </p>

                      <div className="inline-flex items-center gap-0 bg-neutral-50 rounded-sm border border-neutral-100">
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(item, item.quantity - 1)}
                          className="flex items-center justify-center w-11 h-11 rounded-l-sm text-neutral-600 hover:bg-neutral-100 cursor-pointer select-none active:scale-[0.98] transition-transform duration-150"
                          aria-label="Decrease quantity"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="text-sm font-bold text-neutral-900 tabular-nums min-w-[2.5ch] text-center">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(item, item.quantity + 1)}
                          className="flex items-center justify-center w-11 h-11 rounded-r-sm text-neutral-600 hover:bg-neutral-100 cursor-pointer select-none active:scale-[0.98] transition-transform duration-150"
                          aria-label="Increase quantity"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Promo code */}
          <motion.div variants={fadeUp} className="pt-1">
            {promoCode ? (
              <div className="flex items-center gap-2.5 px-4 py-3 bg-white border border-neutral-100 shadow-sm rounded-sm">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-neutral-100">
                  <Tag size={14} className="text-neutral-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-neutral-900">{promoCode.code}</p>
                  <p className="text-xs text-neutral-500">Promo applied</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPromoCode(null)}
                  className="flex items-center justify-center w-11 h-11 rounded-full text-neutral-400 hover:bg-neutral-100 cursor-pointer select-none active:scale-[0.98] transition-transform duration-150"
                  aria-label="Remove promo code"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    label="Promo code"
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value)}
                    icon={<Tag size={16} />}
                  />
                </div>
                <Button
                  variant="secondary"
                  size="md"
                  loading={promoLoading}
                  onClick={handleApplyPromo}
                  className="self-start mt-1"
                >
                  Apply
                </Button>
              </div>
            )}
          </motion.div>

          {/* Order summary */}
          <motion.div
            variants={fadeUp}
            className="rounded-md overflow-hidden border border-neutral-100 shadow-sm"
          >
            {/* Header */}
            <div className="bg-white px-4 py-3 border-b border-neutral-100">
              <h3 className="font-heading font-semibold text-sm text-neutral-900">Order summary</h3>
            </div>

            {/* Body */}
            <div className="bg-white px-4 py-4 space-y-3">
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between text-neutral-500">
                  <span>Subtotal</span>
                  <span className="tabular-nums font-medium">{formatPrice(subtotalCents)}</span>
                </div>
                {memberDiscountCents > 0 && (
                  <div className="flex justify-between text-neutral-600">
                    <span className="flex items-center gap-1.5">
                      <Tag size={12} />
                      Member discount
                    </span>
                    <span className="tabular-nums font-medium">-{formatPrice(memberDiscountCents)}</span>
                  </div>
                )}
                {discountCents > 0 && (
                  <div className="flex justify-between text-neutral-600">
                    <span className="flex items-center gap-1.5">
                      <Tag size={12} />
                      Promo discount
                    </span>
                    <span className="tabular-nums font-medium">-{formatPrice(discountCents)}</span>
                  </div>
                )}
                <div className="flex justify-between text-neutral-500">
                  <span className="flex items-center gap-1.5">
                    <Truck size={12} />
                    Shipping
                  </span>
                  <span className="tabular-nums font-medium">
                    {shippingCents === 0 ? (
                      <span className="text-neutral-900 font-semibold">Free</span>
                    ) : (
                      formatPrice(shippingCents)
                    )}
                  </span>
                </div>
              </div>

              {/* Total */}
              <div className="-mx-4 px-4 py-3.5 bg-neutral-50 border-t border-neutral-100 flex justify-between items-center">
                <span className="font-heading font-bold text-neutral-900">Total</span>
                <span className="font-heading font-bold text-lg text-neutral-900 tabular-nums">
                  {formatPrice(totalCents)}
                </span>
              </div>
            </div>
          </motion.div>

          {/* Trust badges */}
          <motion.div variants={fadeUp} className="flex items-center justify-center gap-4 py-3">
            <div className="flex items-center gap-1.5 text-neutral-400">
              <Truck size={13} />
              <span className="text-xs font-medium">Free over $75</span>
            </div>
            <div className="w-px h-3.5 bg-neutral-200" />
            <div className="flex items-center gap-1.5 text-neutral-400">
              <Shield size={13} />
              <span className="text-xs font-medium">Secure</span>
            </div>
            <div className="w-px h-3.5 bg-neutral-200" />
            <div className="flex items-center gap-1.5 text-neutral-400">
              <Leaf size={13} />
              <span className="text-xs font-medium">Eco packaging</span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </Page>
  )
}
