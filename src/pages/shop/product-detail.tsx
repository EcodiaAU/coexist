import { useState, useCallback, useRef, useMemo } from 'react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
    ShoppingBag,
    ChevronLeft,
    ChevronRight,
    Minus,
    Plus,
    Truck,
    ShieldCheck,
    Leaf,
    Check,
    ArrowLeft,
    X,
} from 'lucide-react'
import { Page } from '@/components/page'
import { Header } from '@/components/header'
import { Button } from '@/components/button'
import { Card } from '@/components/card'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { BottomSheet } from '@/components/bottom-sheet'
import { useToast } from '@/components/toast'
import { useProduct, useRelatedProducts } from '@/hooks/use-merch'
import { useCart } from '@/hooks/use-cart'
import { useAvailableStock, useReserveStock } from '@/hooks/use-stock-reservation'
import { formatPrice, type ProductVariant, type Product } from '@/types/merch'
import { cn } from '@/lib/cn'
import { adminStagger as stagger, fadeUp } from '@/lib/admin-motion'

/* ------------------------------------------------------------------ */
/*  Swipeable image gallery                                            */
/* ------------------------------------------------------------------ */

function ImageGallery({ images, alt }: { images: string[]; alt: string }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [currentIndex, setCurrentIndex] = useState(0)

  const scrollTo = useCallback((index: number) => {
    if (!scrollRef.current) return
    const el = scrollRef.current
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' })
    setCurrentIndex(index)
  }, [])

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const el = scrollRef.current
    const idx = Math.round(el.scrollLeft / el.clientWidth)
    setCurrentIndex(idx)
  }, [])

  if (images.length === 0) {
    return (
      <div className="w-full aspect-[4/5] sm:aspect-square bg-neutral-50 flex items-center justify-center rounded-b-3xl">
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-full bg-white/80 flex items-center justify-center shadow-sm">
            <ShoppingBag size={32} className="text-neutral-400" />
          </div>
          <span className="text-sm text-neutral-400 font-medium">No image available</span>
        </div>
      </div>
    )
  }

  return (
    <div className="relative -mx-4 lg:mx-auto lg:max-w-md lg:rounded-2xl lg:overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory overflow-x-auto scrollbar-none"
      >
        {images.map((src, i) => (
          <div key={i} className="snap-center shrink-0 w-full">
            <div className="relative">
              <img
                src={src}
                alt={`${alt} image ${i + 1}`}
                className="w-full aspect-[4/5] sm:aspect-square object-cover"
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
                fetchPriority={i === 0 ? 'high' : undefined}
              />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
            </div>
          </div>
        ))}
      </div>

      {/* Pill dots */}
      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-0 px-1 py-1 rounded-full bg-black/20">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => scrollTo(i)}
              aria-label={`Image ${i + 1}`}
              className="flex items-center justify-center min-w-11 min-h-11 cursor-pointer select-none"
            >
              <span
                className={cn(
                  'rounded-full transition-[width,background-color] duration-200',
                  i === currentIndex
                    ? 'w-6 h-2 bg-white'
                    : 'w-2 h-2 bg-white/50',
                )}
              />
            </button>
          ))}
        </div>
      )}

      {/* Arrow buttons (desktop) */}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => scrollTo(Math.max(0, currentIndex - 1))}
            className={cn(
              'hidden lg:flex absolute left-3 top-1/2 -translate-y-1/2',
              'items-center justify-center w-10 h-10 rounded-full',
              'bg-white shadow-sm',
              'cursor-pointer select-none active:scale-[0.95] transition-transform duration-150',
              'hover:bg-white',
              currentIndex === 0 && 'opacity-0 pointer-events-none',
            )}
            aria-label="Previous image"
          >
            <ChevronLeft size={18} className="text-neutral-900" />
          </button>
          <button
            type="button"
            onClick={() => scrollTo(Math.min(images.length - 1, currentIndex + 1))}
            className={cn(
              'hidden lg:flex absolute right-3 top-1/2 -translate-y-1/2',
              'items-center justify-center w-10 h-10 rounded-full',
              'bg-white shadow-sm',
              'cursor-pointer select-none active:scale-[0.95] transition-transform duration-150',
              'hover:bg-white',
              currentIndex === images.length - 1 && 'opacity-0 pointer-events-none',
            )}
            aria-label="Next image"
          >
            <ChevronRight size={18} className="text-neutral-900" />
          </button>
        </>
      )}

      {/* Image counter badge */}
      {images.length > 1 && (
        <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/30 text-white text-xs font-medium tabular-nums">
          {currentIndex + 1}/{images.length}
        </span>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Trust badges row                                                   */
/* ------------------------------------------------------------------ */

function TrustBadges() {
  const badges = [
    { icon: Leaf, label: 'Eco-friendly' },
    { icon: Truck, label: 'AU shipping' },
    { icon: ShieldCheck, label: 'Secure checkout' },
  ]

  return (
    <div className="flex items-center justify-center gap-6 py-4 px-3 rounded-2xl bg-white border border-neutral-100 shadow-sm">
      {badges.map(({ icon: Icon, label }) => (
        <div key={label} className="flex flex-col items-center gap-1.5">
          <div className="w-9 h-9 rounded-full bg-neutral-50 flex items-center justify-center shadow-sm">
            <Icon size={16} className="text-neutral-500" />
          </div>
          <span className="text-[11px] font-medium text-neutral-500">{label}</span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Quantity stepper                                                    */
/* ------------------------------------------------------------------ */

function QuantityStepper({
  value,
  onChange,
  max,
}: {
  value: number
  onChange: (v: number) => void
  max?: number
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl bg-neutral-50 shadow-sm p-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        className={cn(
          'flex items-center justify-center w-10 h-10 rounded-lg',
          'cursor-pointer select-none active:scale-[0.93] transition-transform duration-150',
          value <= 1
            ? 'text-neutral-200 cursor-not-allowed'
            : 'text-neutral-600 hover:bg-neutral-100',
        )}
        aria-label="Decrease quantity"
      >
        <Minus size={16} strokeWidth={2.5} />
      </button>
      <span className="font-heading font-bold text-neutral-900 min-w-[3ch] text-center tabular-nums text-lg">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(max ? Math.min(max, value + 1) : value + 1)}
        disabled={max !== undefined && value >= max}
        className={cn(
          'flex items-center justify-center w-10 h-10 rounded-lg',
          'cursor-pointer select-none active:scale-[0.93] transition-transform duration-150',
          max !== undefined && value >= max
            ? 'text-neutral-200 cursor-not-allowed'
            : 'text-neutral-600 hover:bg-neutral-100',
        )}
        aria-label="Increase quantity"
      >
        <Plus size={16} strokeWidth={2.5} />
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Section divider                                                    */
/* ------------------------------------------------------------------ */

function Divider() {
  return <div className="h-px bg-gradient-to-r from-transparent via-neutral-100 to-transparent" />
}

/* ------------------------------------------------------------------ */
/*  Share helper                                                       */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                   */
/* ------------------------------------------------------------------ */

function ProductDetailSkeleton() {
  return (
    <Page swipeBack header={<Header title="" back />}>
      <div className="-mx-4 lg:mx-0">
        <Skeleton variant="image" className="rounded-none lg:rounded-2xl aspect-[4/5] sm:aspect-square" />
      </div>
      <div className="py-6 space-y-5">
        <div className="space-y-3">
          <Skeleton variant="title" className="w-2/3" />
          <Skeleton variant="text" className="w-1/3" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="text" className="w-16 h-11 rounded-xl" />
          ))}
        </div>
        <Skeleton variant="text" count={3} />
      </div>
    </Page>
  )
}

/* ------------------------------------------------------------------ */
/*  Added-to-cart recommendation modal                                 */
/* ------------------------------------------------------------------ */

function AddedToCartModal({
  open,
  onClose,
  related,
}: {
  open: boolean
  onClose: () => void
  related: Product[] | undefined
}) {
  const navigate = useNavigate()

  return (
    <BottomSheet open={open} onClose={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading text-lg font-semibold text-neutral-900">Added to cart!</h2>
        <button
          onClick={onClose}
          className="flex items-center justify-center rounded-full min-w-11 min-h-11 text-neutral-400 hover:bg-neutral-100 active:scale-[0.93] transition-[colors,transform] duration-150 cursor-pointer"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>
      <div className="space-y-5">
        {/* Recommendations */}
        {related && related.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-neutral-600 mb-3">
              You might also like
            </p>
            <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2 -mx-1 px-1">
              {related.slice(0, 6).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onClose()
                    navigate(`/shop/${p.slug}`)
                  }}
                  className="shrink-0 w-32 cursor-pointer select-none active:scale-[0.97] transition-transform duration-150 text-left"
                >
                  <div className="rounded-xl overflow-hidden bg-neutral-50 shadow-sm">
                    <img
                      src={p.images[0] ?? '/img/placeholder-merch.jpg'}
                      alt={p.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full aspect-square object-cover"
                    />
                    <div className="p-2.5">
                      <p className="text-xs font-semibold text-neutral-900 line-clamp-1">
                        {p.name}
                      </p>
                      <p className="text-xs font-bold text-neutral-500 mt-0.5">
                        {formatPrice(p.base_price_cents)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-2.5 pt-1">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            icon={<ShoppingBag size={18} />}
            onClick={() => {
              onClose()
              navigate('/shop/checkout')
            }}
          >
            Checkout Now
          </Button>
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            icon={<ArrowLeft size={18} />}
            onClick={onClose}
          >
            Continue Shopping
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Main product detail page                                           */
/* ------------------------------------------------------------------ */

export default function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const { toast } = useToast()
  const { data: product, isLoading } = useProduct(slug)
  const showLoading = useDelayedLoading(isLoading)
  const { data: related } = useRelatedProducts(product?.id)
  const addItem = useCart((s) => s.addItem)
  const { reserve } = useReserveStock()

  // Realtime available stock (total - other users' reservations)
  const { getAvailable, loading: stockLoading } = useAvailableStock(product?.id)

  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [addedToCart, setAddedToCart] = useState(false)
  const [showCartModal, setShowCartModal] = useState(false)
  const [reserving, setReserving] = useState(false)

  // Auto-select first in-stock variant when product loads
  const activeVariant = selectedVariant ?? product?.variants.find((v) => v.stock > 0 && v.is_active) ?? product?.variants[0] ?? null

  // Use realtime available stock instead of static variant.stock
  const availableStock = activeVariant ? getAvailable(activeVariant.id) : 0
  const inStock = !stockLoading && availableStock > 0

  const sizes = useMemo(
    () => product ? [...new Set(product.variants.map((v) => v.size).filter(Boolean))] as string[] : [],
    [product],
  )
  const colours = useMemo(
    () => product ? [...new Set(product.variants.map((v) => v.colour).filter(Boolean))] as string[] : [],
    [product],
  )

  const handleAddToCart = useCallback(async () => {
    if (!product || !activeVariant) return
    setReserving(true)
    try {
      // Reserve stock first - prevents overselling
      const result = await reserve(product.id, activeVariant.id, quantity)
      if (!result.success) {
        if (result.error === 'insufficient_stock') {
          toast.error(
            result.available === 0
              ? 'Sorry, this item just sold out!'
              : `Only ${result.available} available - please reduce quantity`,
          )
        } else {
          toast.error('Could not reserve stock. Please try again.')
        }
        return
      }
      addItem(product, activeVariant, quantity)
      setAddedToCart(true)
      toast.success(`${product.name} added to cart - reserved for 15 min`)
      setShowCartModal(true)
      setTimeout(() => setAddedToCart(false), 2000)
    } finally {
      setReserving(false)
    }
  }, [product, activeVariant, quantity, addItem, toast, reserve])

  const handleBuyNow = useCallback(async () => {
    if (!product || !activeVariant) return
    setReserving(true)
    try {
      const result = await reserve(product.id, activeVariant.id, quantity)
      if (!result.success) {
        toast.error(
          result.available === 0
            ? 'Sorry, this item just sold out!'
            : `Only ${result.available} available - please reduce quantity`,
        )
        return
      }
      addItem(product, activeVariant, quantity)
      navigate('/shop/checkout')
    } finally {
      setReserving(false)
    }
  }, [product, activeVariant, quantity, addItem, navigate, reserve, toast])

  if (showLoading) return <ProductDetailSkeleton />
  if (!product) {
    return (
      <Page swipeBack header={<Header title="Product" back />}>
        <EmptyState
          illustration="error"
          title="Product not found"
          description="This product may have been removed or the link is incorrect"
          action={{ label: 'Back to shop', to: '/shop' }}
        />
      </Page>
    )
  }

  return (
    <Page
      swipeBack
      noBackground
      stickyOverlay={<Header title="" back transparent className="collapse-header" />}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          {/* Price + quantity */}
          <div className="flex items-center justify-center gap-3 sm:justify-start">
            <p className="font-heading text-lg font-bold text-neutral-900 leading-none">
              {formatPrice((activeVariant?.price_cents ?? product.base_price_cents) * quantity)}
            </p>
            <QuantityStepper
              value={quantity}
              onChange={setQuantity}
              max={availableStock || undefined}
            />
          </div>
          {/* Buttons */}
          <div className="flex gap-2 flex-1">
            <Button
              variant="secondary"
              size="md"
              fullWidth
              icon={addedToCart ? <Check size={16} /> : <ShoppingBag size={16} />}
              disabled={!inStock || reserving}
              loading={reserving}
              onClick={handleAddToCart}
              className=""
            >
              {addedToCart ? 'Added!' : inStock ? 'Cart' : 'Sold Out'}
            </Button>
            <Button
              variant="primary"
              size="md"
              fullWidth
              disabled={!inStock || reserving}
              loading={reserving}
              onClick={handleBuyNow}
            >
              Buy Now
            </Button>
          </div>
        </div>
      }
    >
      {/* Hero image gallery */}
      <ImageGallery images={product.images} alt={product.name} />

      <motion.div
        variants={shouldReduceMotion ? undefined : stagger}
        initial="hidden"
        animate="visible"
        className="py-6 space-y-6"
      >
        {/* ---- Name, price, rating ---- */}
        <motion.div variants={fadeUp} className="space-y-3">
          {product.category && (
            <span className="inline-block px-3 py-1 rounded-full bg-neutral-100 text-neutral-600 text-xs font-semibold uppercase tracking-wider">
              {product.category}
            </span>
          )}

          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-neutral-900 leading-tight">
            {product.name}
          </h1>

          <div className="flex items-center flex-wrap gap-3">
            <span className="font-heading text-2xl font-bold text-neutral-900">
              {formatPrice(activeVariant?.price_cents ?? product.base_price_cents)}
            </span>

          </div>

          {/* Stock status badges - uses realtime available stock */}
          <AnimatePresence mode="wait">
            {activeVariant && !stockLoading && availableStock === 0 && (
              <motion.div
                key="oos"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-error-50"
              >
                <div className="w-2 h-2 rounded-full bg-error-400" />
                <span className="text-sm font-medium text-error-700">Out of stock</span>
              </motion.div>
            )}
            {activeVariant && availableStock > 0 && availableStock <= 5 && (
              <motion.div
                key="low"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-warning-50"
              >
                <div className="w-2 h-2 rounded-full bg-warning-400 animate-pulse" />
                <span className="text-sm font-medium text-warning-700">
                  Only {availableStock} available - grab yours!
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <Divider />

        {/* ---- Description ---- */}
        <motion.div variants={fadeUp}>
          <h2 className="text-[11px] uppercase tracking-[0.15em] font-bold text-neutral-400 mb-3">
            About this product
          </h2>
          <p className="text-[15px] text-neutral-600 leading-relaxed">
            {product.description}
          </p>
        </motion.div>

        {/* ---- Variant selectors ---- */}
        {(sizes.length > 0 || colours.length > 0) && (
          <>
            <Divider />

            {sizes.length > 0 && (
              <motion.div variants={fadeUp}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-[11px] uppercase tracking-[0.15em] font-bold text-neutral-400">
                    Size
                  </h2>
                  {activeVariant?.size && (
                    <span className="text-sm text-neutral-500">{activeVariant.size}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {sizes.map((size) => {
                    const variant = product.variants.find(
                      (v) => v.size === size && (activeVariant?.colour ? v.colour === activeVariant.colour : true),
                    )
                    const isSelected = activeVariant?.size === size
                    const available = variant && getAvailable(variant.id) > 0

                    return (
                      <motion.button
                        key={size}
                        type="button"
                        onClick={() => variant && setSelectedVariant(variant)}
                        disabled={!available}
                        whileTap={available ? { scale: 0.93 } : undefined}
                        className={cn(
                          'relative px-5 py-2.5 min-h-11 min-w-[3.5rem] rounded-xl text-sm font-semibold',
                          'transition-transform duration-200 cursor-pointer select-none',
                          isSelected
                            ? 'bg-neutral-900 text-white shadow-sm'
                            : available
                              ? 'bg-white border border-neutral-100 text-neutral-900 shadow-sm'
                              : 'bg-neutral-50 text-neutral-300 cursor-not-allowed line-through',
                        )}
                      >
                        {size}
                      </motion.button>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {colours.length > 0 && (
              <motion.div variants={fadeUp}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-[11px] uppercase tracking-[0.15em] font-bold text-neutral-400">
                    Colour
                  </h2>
                  {activeVariant?.colour && (
                    <span className="text-sm text-neutral-500">{activeVariant.colour}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {colours.map((colour) => {
                    const variant = product.variants.find(
                      (v) => v.colour === colour && (activeVariant?.size ? v.size === activeVariant.size : true),
                    )
                    const isSelected = activeVariant?.colour === colour
                    const available = variant && getAvailable(variant.id) > 0

                    return (
                      <motion.button
                        key={colour}
                        type="button"
                        onClick={() => variant && setSelectedVariant(variant)}
                        disabled={!available}
                        whileTap={available ? { scale: 0.93 } : undefined}
                        className={cn(
                          'relative px-5 py-2.5 min-h-11 rounded-xl text-sm font-semibold',
                          'transition-transform duration-200 cursor-pointer select-none',
                          isSelected
                            ? 'bg-neutral-900 text-white shadow-sm'
                            : available
                              ? 'bg-white border border-neutral-100 text-neutral-900 shadow-sm'
                              : 'bg-neutral-50 text-neutral-300 cursor-not-allowed line-through',
                        )}
                      >
                        {colour}
                      </motion.button>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </>
        )}

        <Divider />

        {/* ---- Trust badges ---- */}
        <motion.div variants={fadeUp}>
          <TrustBadges />
        </motion.div>

        {/* ---- Related products ---- */}
        {related && related.length > 0 && (
          <>
            <Divider />

            <motion.div variants={fadeUp}>
              <h2 className="font-heading text-lg font-bold text-neutral-900 mb-4">
                You might also like
              </h2>
              <div className="-mx-4 lg:-mx-0">
                <div className="flex gap-3 overflow-x-auto px-4 lg:px-0 scrollbar-none pb-2">
                  {related.map((p, i) => (
                    <motion.button
                      key={p.id}
                      type="button"
                      onClick={() => navigate(`/shop/${p.slug}`)}
                      initial={shouldReduceMotion ? undefined : { opacity: 0, x: 20 }}
                      animate={shouldReduceMotion ? undefined : { opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08, type: 'spring' as const, stiffness: 300, damping: 25 }}
                      className="shrink-0 w-40 cursor-pointer select-none active:scale-[0.97] transition-transform duration-150"
                    >
                      <Card variant="merch">
                        <div className="relative">
                          <Card.Image
                            src={p.images[0] ?? '/img/placeholder-merch.jpg'}
                            alt={p.name}
                            aspectRatio="1/1"
                          />
                          {p.variants.every((v) => v.stock === 0) && (
                            <div className="absolute inset-0 bg-neutral-900/40 flex items-center justify-center">
                              <span className="px-2.5 py-1 bg-white/90 rounded-full text-xs font-semibold text-neutral-900">
                                Sold out
                              </span>
                            </div>
                          )}
                        </div>
                        <Card.Content className="pb-3">
                          <Card.Title className="text-xs line-clamp-1">
                            {p.name}
                          </Card.Title>
                          <p className="text-xs font-bold text-neutral-500 mt-1">
                            {formatPrice(p.base_price_cents)}
                          </p>
                        </Card.Content>
                      </Card>
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </motion.div>

      <AddedToCartModal
        open={showCartModal}
        onClose={() => setShowCartModal(false)}
        related={related}
      />
    </Page>
  )
}
