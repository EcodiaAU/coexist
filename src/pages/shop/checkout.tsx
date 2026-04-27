import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { MapPin, CreditCard, Clock, Truck, Tag, Shield, Lock } from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { useToast } from '@/components/toast'
import { useCart } from '@/hooks/use-cart'
import { useCreateMerchCheckout, useSavedAddresses } from '@/hooks/use-orders'
import { useCartReservationSync, useMyReservations, useReservationCountdown } from '@/hooks/use-stock-reservation'
import { redirectToCheckout } from '@/lib/stripe'
import { formatPrice, type ShippingAddress } from '@/types/merch'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

 
const _AU_STATES = [
  { label: 'NSW', value: 'NSW' },
  { label: 'VIC', value: 'VIC' },
  { label: 'QLD', value: 'QLD' },
  { label: 'WA', value: 'WA' },
  { label: 'SA', value: 'SA' },
  { label: 'TAS', value: 'TAS' },
  { label: 'ACT', value: 'ACT' },
  { label: 'NT', value: 'NT' },
]

const EMPTY_ADDRESS: ShippingAddress = {
  full_name: '',
  line1: '',
  line2: null,
  city: '',
  state: '',
  postcode: '',
  country: 'AU',
  phone: null,
}

/* ------------------------------------------------------------------ */
/*  Checkout page                                                      */
/* ------------------------------------------------------------------ */

export default function CheckoutPage() {
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const { toast } = useToast()
  const items = useCart((s) => s.items)
  const subtotalCents = useCart((s) => s.subtotalCents())
  const memberDiscountCents = useCart((s) => s.memberDiscountCents())
  const discountCents = useCart((s) => s.discountCents())
  const shippingCents = useCart((s) => s.shippingCents())
  const totalCents = useCart((s) => s.totalCents())
   
  const _clearCart = useCart((s) => s.clear)

   
  const { releaseAll: _releaseAll } = useCartReservationSync(items)
  const { reservations } = useMyReservations()

  const earliestExpiry = reservations.length > 0
    ? reservations.reduce<string | undefined>((earliest, r) =>
        !earliest || new Date(r.expires_at) < new Date(earliest) ? r.expires_at : earliest,
      undefined)
    : undefined
  const { secondsLeft: reservationSecondsLeft, isExpiring: reservationExpiring, isExpired: reservationExpired } =
    useReservationCountdown(earliestExpiry)

  const { data: savedAddresses } = useSavedAddresses()
  const checkout = useCreateMerchCheckout()

  const stagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.05 } },
  }

  const fadeUp = {
    hidden: { opacity: 0, y: 14 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
  }

  const [address, setAddress] = useState<ShippingAddress>(EMPTY_ADDRESS)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleSelectSaved = useCallback((saved: ShippingAddress) => {
    setAddress(saved)
    setErrors({})
  }, [])

  const updateField = useCallback((field: keyof ShippingAddress, value: string) => {
    setAddress((a) => ({ ...a, [field]: value || null }))
    setErrors((e) => ({ ...e, [field]: '' }))
  }, [])

  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {}
    if (!address.full_name.trim()) errs.full_name = 'Name is required'
    if (!address.line1.trim()) errs.line1 = 'Address is required'
    if (!address.city.trim()) errs.city = 'City is required'
    if (!address.state) errs.state = 'State is required'
    if (!address.postcode.trim()) errs.postcode = 'Postcode is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }, [address])

  const handleCheckout = useCallback(async () => {
    if (!validate()) return
    if (reservationExpired) {
      toast.error('Your reservations have expired. Please go back to your cart and try again.')
      return
    }
    try {
      const result = await checkout.mutateAsync({ shippingAddress: address })
      if (result.url) {
        window.location.href = result.url
      } else if (result.session_id) {
        await redirectToCheckout(result.session_id)
      }
    } catch {
      toast.error('Checkout failed. Please try again.')
    }
  }, [validate, checkout, address, toast, reservationExpired])

  useEffect(() => {
    if (items.length === 0) {
      toast.info('Your cart is empty')
      navigate('/shop/cart', { replace: true })
    }
  }, [items.length, navigate, toast])

  if (items.length === 0) return null

  const reservationMins = reservationSecondsLeft !== null ? Math.floor(reservationSecondsLeft / 60) : 0
  const reservationSecs = reservationSecondsLeft !== null ? (reservationSecondsLeft % 60).toString().padStart(2, '0') : '00'

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
          <Button
            variant="primary"
            size="lg"
            fullWidth
            icon={<CreditCard size={18} />}
            loading={checkout.isPending}
            disabled={reservationExpired}
            onClick={handleCheckout}
          >
            {reservationExpired ? 'Reservations Expired' : `Pay ${formatPrice(totalCents)}`}
          </Button>
        </div>
      }
    >
      {/* ── Hero ── */}
      <div className="bg-white border-b border-neutral-100">
        <div
          className="px-4 pb-5 flex items-center gap-4"
          style={{ paddingTop: '3.5rem' }}
        >
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-neutral-50 shrink-0 border border-neutral-100">
            <Lock size={22} className="text-neutral-500" />
          </div>
          <div>
            <h1 className="font-heading text-lg font-bold text-neutral-900">
              Secure checkout
            </h1>
            <p className="text-xs text-neutral-500 mt-0.5">
              {items.length} {items.length === 1 ? 'item' : 'items'} &middot; {formatPrice(totalCents)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Checkout body ── */}
      <div className="bg-white min-h-[50dvh]">
        <motion.div
          variants={rm ? undefined : stagger}
          initial="hidden"
          animate="visible"
          className="px-4 pt-4 pb-6 space-y-4"
        >
          {/* Reservation countdown */}
          {reservationSecondsLeft !== null && reservationSecondsLeft > 0 && (
            <motion.div
              variants={fadeUp}
              className={cn(
                'flex items-center gap-2.5 px-4 py-3 rounded-xl',
                reservationExpiring
                  ? 'bg-warning-50 border border-warning-200'
                  : 'bg-white border border-neutral-100',
              )}
            >
              <Clock size={16} className={reservationExpiring ? 'text-warning-600 shrink-0' : 'text-neutral-500 shrink-0'} />
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-semibold', reservationExpiring ? 'text-warning-800' : 'text-neutral-900')}>
                  Items reserved for you
                </p>
                <p className={cn('text-xs', reservationExpiring ? 'text-warning-600' : 'text-neutral-500')}>
                  Complete within {reservationMins}:{reservationSecs}
                </p>
              </div>
            </motion.div>
          )}
          {reservationExpired && (
            <motion.div
              variants={fadeUp}
              className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-error-50 ring-1 ring-error-200/50"
            >
              <Clock size={16} className="text-error-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-error-800">Reservations expired</p>
                <p className="text-xs text-error-600">Go back to your cart to re-reserve items</p>
              </div>
            </motion.div>
          )}

          {/* Saved addresses */}
          {savedAddresses && savedAddresses.length > 0 && (
            <motion.section variants={fadeUp}>
              <h3 className="text-[11px] uppercase tracking-[0.15em] font-bold text-neutral-400 mb-3">
                Saved addresses
              </h3>
              <div className="space-y-2">
                {savedAddresses.map((saved, i) => {
                  const isSelected = address.line1 === saved.line1 && address.postcode === saved.postcode
                  return (
                    <button
                      key={saved.id ?? i}
                      type="button"
                      onClick={() => handleSelectSaved(saved)}
                      className={cn(
                        'w-full text-left p-3.5 min-h-11 rounded-xl cursor-pointer select-none active:scale-[0.98] transition-transform duration-150',
                        isSelected
                          ? 'ring-2 ring-primary-500 bg-white shadow-sm'
                          : 'bg-white border border-neutral-100 shadow-sm hover:border-neutral-200',
                      )}
                    >
                      <p className="text-sm font-medium text-neutral-900">{saved.full_name}</p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {saved.line1}, {saved.city} {saved.state} {saved.postcode}
                      </p>
                    </button>
                  )
                })}
              </div>
            </motion.section>
          )}

          {/* Shipping address form */}
          <motion.section
            variants={fadeUp}
            className="rounded-2xl overflow-hidden border border-neutral-100 shadow-sm"
          >
            <div className="bg-white px-4 py-3 flex items-center gap-2 border-b border-neutral-100">
              <MapPin size={16} className="text-neutral-500" />
              <h3 className="text-[11px] uppercase tracking-[0.15em] font-bold text-neutral-400">
                Shipping address
              </h3>
            </div>
            <div className="bg-white px-4 py-4 space-y-3">
              <Input
                label="Full name"
                value={address.full_name}
                onChange={(e) => updateField('full_name', e.target.value)}
                error={errors.full_name}
                required
                autoComplete="name"
              />
              <Input
                label="Address line 1"
                value={address.line1}
                onChange={(e) => updateField('line1', e.target.value)}
                error={errors.line1}
                required
                autoComplete="address-line1"
              />
              <Input
                label="Address line 2 (optional)"
                value={address.line2 ?? ''}
                onChange={(e) => updateField('line2', e.target.value)}
                autoComplete="address-line2"
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="City"
                  value={address.city}
                  onChange={(e) => updateField('city', e.target.value)}
                  error={errors.city}
                  required
                  autoComplete="address-level2"
                />
                <Input
                  label="State"
                  value={address.state}
                  onChange={(e) => updateField('state', e.target.value)}
                  error={errors.state}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Postcode"
                  value={address.postcode}
                  onChange={(e) => updateField('postcode', e.target.value)}
                  error={errors.postcode}
                  required
                  autoComplete="postal-code"
                />
                <Input
                  label="Phone (optional)"
                  value={address.phone ?? ''}
                  onChange={(e) => updateField('phone', e.target.value)}
                  autoComplete="tel"
                />
              </div>
            </div>
          </motion.section>

          {/* Order summary */}
          <motion.section
            variants={fadeUp}
            className="rounded-2xl overflow-hidden border border-neutral-100 shadow-sm"
          >
            <div className="bg-white px-4 py-3 border-b border-neutral-100">
              <h3 className="text-[11px] uppercase tracking-[0.15em] font-bold text-neutral-400">Order summary</h3>
            </div>

            <div className="bg-white px-4 py-4 space-y-4">
              {/* Item thumbnails */}
              <div className="space-y-2.5">
                {items.map((item) => (
                  <div key={item.variant.id} className="flex items-center gap-3 p-2 -mx-2 rounded-xl hover:bg-neutral-50 transition-colors">
                    <div className="relative rounded-lg overflow-hidden ring-1 ring-neutral-900/[0.06] shrink-0">
                      <img
                        src={item.product.images[0] ?? '/img/placeholder-merch.jpg'}
                        alt={item.product.name}
                        className="w-12 h-12 object-cover"
                      />
                      <div className="absolute inset-0 ring-1 ring-inset ring-black/[0.04] rounded-lg pointer-events-none" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">
                        {item.product.name}
                      </p>
                      <p className="text-xs text-neutral-500">x{item.quantity}</p>
                    </div>
                    <span className="text-sm font-semibold text-neutral-900 tabular-nums">
                      {formatPrice(item.variant.price_cents * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-neutral-100" />

              {/* Totals */}
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between text-neutral-500">
                  <span>Subtotal</span>
                  <span className="tabular-nums font-medium">{formatPrice(subtotalCents)}</span>
                </div>
                {memberDiscountCents > 0 && (
                  <div className="flex justify-between text-moss-700">
                    <span className="flex items-center gap-1.5">
                      <Tag size={12} />
                      Member discount
                    </span>
                    <span className="tabular-nums font-medium">-{formatPrice(memberDiscountCents)}</span>
                  </div>
                )}
                {discountCents > 0 && (
                  <div className="flex justify-between text-moss-700">
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
                      <span className="text-moss-600 font-semibold">Free</span>
                    ) : (
                      formatPrice(shippingCents)
                    )}
                  </span>
                </div>
              </div>

              {/* Total highlight */}
              <div className="-mx-4 px-4 py-3.5 bg-neutral-50 border-t border-neutral-100 flex justify-between items-center">
                <span className="font-heading font-bold text-neutral-900">Total</span>
                <span className="font-heading font-bold text-lg text-neutral-900 tabular-nums">
                  {formatPrice(totalCents)}
                </span>
              </div>
            </div>
          </motion.section>

          {/* Trust badges */}
          <motion.div variants={fadeUp} className="flex items-center justify-center gap-4 py-2">
            <div className="flex items-center gap-1.5 text-neutral-400">
              <Shield size={13} />
              <span className="text-xs font-medium">SSL encrypted</span>
            </div>
            <div className="w-px h-3.5 bg-neutral-200" />
            <div className="flex items-center gap-1.5 text-neutral-400">
              <CreditCard size={13} />
              <span className="text-xs font-medium">Stripe powered</span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </Page>
  )
}
