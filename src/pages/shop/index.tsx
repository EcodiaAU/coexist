import { useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { useParallaxEngine } from '@/hooks/use-parallax-scroll'
import {
    ShoppingBag,
    ChevronRight,
    TrendingUp,
    Package,
    Shirt,
    Backpack,
    StickyNote,
    Coffee,
    HardHat,
} from 'lucide-react'
import { Page } from '@/components/page'
import { SearchBar } from '@/components/search-bar'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { useProducts } from '@/hooks/use-merch'
import { useCart } from '@/hooks/use-cart'
import { formatPrice, type Product } from '@/types/merch'
import { useLayout } from '@/hooks/use-layout'
import { Header } from '@/components/header'
import { WaveTransition } from '@/components/wave-transition'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ */
/*  Animations                                                         */
/* ------------------------------------------------------------------ */

const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 24 } },
}
const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 25 } },
}
const slideInRight: Variants = {
  hidden: { opacity: 0, x: 30 },
  visible: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 260, damping: 24 } },
}

/* ------------------------------------------------------------------ */
/*  Layered background - fills the entire page behind content          */
/* ------------------------------------------------------------------ */

/**
 * Rich multi-layered background:
 * 1. Base: warm green-tinted off-white
 * 2. Diagonal gradient band (top-left → bottom-right)
 * 3. Topographic contour SVG pattern
 * 4. Large leaf silhouette watermarks
 * 5. Subtle dot grid in alternating bands
 * 6. Static blurred color orbs for depth
 */
function ShopBackground({ rm: _rm }: { rm: boolean }) {
  return (
    <div className="sticky top-0 h-[100dvh] -mb-[100dvh] pointer-events-none overflow-hidden">
      <div className="absolute inset-0 bg-white" />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Category pills                                                     */
/* ------------------------------------------------------------------ */

const CATEGORY_ALL = '__all__'

const CATEGORY_ICONS: Record<string, ReactNode> = {
  clothing: <Shirt size={14} />,
  accessories: <Backpack size={14} />,
  stickers: <StickyNote size={14} />,
  drinkware: <Coffee size={14} />,
  headwear: <HardHat size={14} />,
}

function CategoryPills({
  categories,
  active,
  onChange,
}: {
  categories: string[]
  active: string
  onChange: (cat: string) => void
}) {
  return (
    <div className="relative -mx-5 lg:-mx-6">
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-white to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-4 bg-gradient-to-r from-white to-transparent" />
      <div
        className="flex gap-2 overflow-x-auto px-5 lg:px-6 pb-1 scrollbar-none snap-x snap-proximity"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <button
          type="button"
          onClick={() => onChange(CATEGORY_ALL)}
          className={cn(
            'shrink-0 snap-start px-4 h-10 rounded-2xl text-sm font-semibold transition-transform duration-200 select-none cursor-pointer',
            'flex items-center gap-1.5 active:scale-[0.96]',
            active === CATEGORY_ALL
              ? 'bg-neutral-900 text-white shadow-sm'
              : 'bg-white text-neutral-600 hover:bg-neutral-50 border border-neutral-100 shadow-sm',
          )}
        >
          <Package size={14} />
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => onChange(cat)}
            className={cn(
              'shrink-0 snap-start px-4 h-10 rounded-2xl text-sm font-semibold capitalize transition-transform duration-200 select-none cursor-pointer whitespace-nowrap',
              'flex items-center gap-1.5 active:scale-[0.96]',
              active === cat
                ? 'bg-neutral-900 text-white shadow-sm'
                : 'bg-white text-neutral-600 hover:bg-neutral-50 border border-neutral-100 shadow-sm',
            )}
          >
            {CATEGORY_ICONS[cat.toLowerCase()] && (
              CATEGORY_ICONS[cat.toLowerCase()]
            )}
            {cat}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  (SVG landscape layers removed - replaced with photo parallax)      */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Hero section - two-layer photo parallax                            */
/* ------------------------------------------------------------------ */

function ShopHero({
  rm,
}: {
  rm: boolean
}) {
  const textRef = useRef<HTMLDivElement>(null)
  const { register, unregister } = useParallaxEngine()

  useEffect(() => {
    if (rm) return
    register(textRef, { yRange: 150, scrollEnd: 600 })
    return () => { unregister(textRef) }
  }, [rm, register, unregister])

  return (
    <div className="relative">
      {/*
       * The bg (1920×1080) always fits full-width → container is
       * sized by the bg's natural aspect ratio via the leading img.
       * The fg (1080×1080) is 56.25% of the bg width to keep the
       * ratio between the two constant at every screen size.
       */}
      <div className="relative w-full overflow-hidden">

        {/* ── Layer 0: Background landscape - drives the container height ── */}
        <div>
          <img
            src="/img/merch-hero-1.webp"
            alt="Australian landscape"
            className="w-full h-auto block"
          />
        </div>

        {/* ── Layer 1: Foreground people ── */}
        {/* 56.25% width = 1080/1920, centered, bottom-aligned */}
        <div className="absolute bottom-0 inset-x-0 z-[3] flex justify-center">
          <div style={{ width: '56.25%' }}>
            <img
              src="/img/merch-hero-2.webp"
              alt="Co-Exist members"
              className="w-full h-auto block"
            />
          </div>
        </div>


        {/* Hero text - behind the people so they pass in front */}
        <div
          ref={rm ? undefined : textRef}
          className="absolute inset-x-0 top-[12%] z-[2] flex justify-center will-change-transform"
        >
          <h1 style={{ fontSize: 'clamp(3.5rem, 10vw, 10rem)' }} className="font-heading font-bold text-[#fff] tracking-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.25)]">
            Shop
          </h1>
        </div>
      </div>

      {/* Smooth transition into content - sits on top of the overflowing bg */}
      <WaveTransition position="inline" />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Product card - with colored accent & hover depth                   */
/* ------------------------------------------------------------------ */

function ProductCard({ product, onClick, index: _index }: { product: Product; onClick: () => void; index: number }) {
  const inStock = product.variants.some((v) => v.stock > 0 && v.is_active)
  const lowStock = product.variants.every((v) => v.stock <= 5) && inStock

  return (
    <motion.div
      variants={scaleIn}
      whileTap={{ scale: 0.97 }}
      className="cursor-pointer group"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={product.name}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() }
      }}
    >
      <div className="relative rounded-2xl overflow-hidden shadow-sm transition-colors duration-200">
        {/* Full-bleed image with overlay */}
        <div className="relative aspect-[4/5] overflow-hidden">
          <img
            src={product.images[0] ?? '/img/placeholder-merch.jpg'}
            alt={product.name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            loading="lazy"
          />

          {/* Dark gradient for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

          {!inStock && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span className="px-4 py-1.5 bg-white rounded-full text-sm font-bold text-neutral-900 shadow">
                Sold Out
              </span>
            </div>
          )}

          {lowStock && inStock && (
            <span className="absolute top-3 right-3 px-2.5 py-1 bg-amber-500 text-white text-[11px] font-bold rounded-xl uppercase tracking-wider">
              Low Stock
            </span>
          )}

          {inStock && isNewProduct(product.created_at) && (
            <span className="absolute top-3 left-3 px-2.5 py-1 bg-white text-neutral-900 text-[11px] font-bold rounded-xl uppercase tracking-wider">
              New
            </span>
          )}

          {/* Title + price overlay */}
          <div className="absolute inset-x-0 bottom-0 p-3.5">
            <p className="font-heading text-sm font-bold text-white line-clamp-1 leading-snug">
              {product.name}
            </p>
            <span className="font-heading font-extrabold text-base text-white/90 mt-1 block">
              {formatPrice(product.base_price_cents)}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/** Check if a product was created in the last 14 days */
function isNewProduct(createdAt: string): boolean {
  const diff = Date.now() - new Date(createdAt).getTime()
  return diff < 14 * 24 * 60 * 60 * 1000
}

/* ------------------------------------------------------------------ */
/*  Featured product - bold gradient overlay card                      */
/* ------------------------------------------------------------------ */

function FeaturedProduct({ product, onClick }: { product: Product; onClick: () => void }) {
  return (
    <motion.div
      variants={fadeUp}
      whileTap={{ scale: 0.98 }}
      className="cursor-pointer group"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Featured: ${product.name}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() }
      }}
    >
      <div className="relative rounded-3xl overflow-hidden bg-white border border-neutral-100 shadow-sm">
        <div className="relative aspect-[16/9] sm:aspect-[2/1] overflow-hidden">
          <img
            src={product.images[0] ?? '/img/placeholder-merch.jpg'}
            alt={product.name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />

          {/* Content overlay */}
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 mb-2.5 rounded-full bg-white/90 text-primary-700 text-xs font-bold tracking-wide">
              <TrendingUp size={12} />
              Featured
            </span>
            <h3 className="font-heading text-xl sm:text-2xl font-extrabold text-white leading-tight">
              {product.name}
            </h3>
            <div className="flex items-center gap-3 mt-2">
              <span className="font-heading font-extrabold text-lg text-white">
                {formatPrice(product.base_price_cents)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/*  Section header - with gradient icon badge                          */
/* ------------------------------------------------------------------ */

function SectionHeader({
  icon: _Icon,
  title,
  action,
}: {
  icon: React.ElementType
  title: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <h2 className="text-[11px] uppercase tracking-[0.15em] font-bold text-neutral-400">{title}</h2>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="flex items-center gap-0.5 text-sm font-semibold text-neutral-500 active:opacity-70 cursor-pointer"
        >
          {action.label}
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                   */
/* ------------------------------------------------------------------ */

function ShopSkeleton() {
  return (
    <div className="space-y-6">
      {/* Hero skeleton */}
      <div className="relative">
        <Skeleton className="w-full h-[280px] sm:h-[340px] rounded-none" />
        <div className="relative -mt-1 z-10">
          <div className="h-6 sm:h-10 bg-white" />
        </div>
      </div>
      {/* Search + pills skeleton */}
      <div className="space-y-3 px-5 lg:px-6">
        <Skeleton className="w-full h-12 rounded-2xl" />
        <div className="flex gap-2">
          <Skeleton className="w-18 h-10 rounded-2xl" />
          <Skeleton className="w-22 h-10 rounded-2xl" />
          <Skeleton className="w-26 h-10 rounded-2xl" />
        </div>
      </div>
      {/* Featured skeleton */}
      <div className="px-5 lg:px-6">
        <Skeleton className="w-full h-[200px] rounded-3xl" />
      </div>
      {/* Grid skeleton */}
      <div className="grid grid-cols-2 gap-3.5 px-5 lg:px-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-3xl overflow-hidden bg-white shadow-sm">
            <Skeleton className="h-1 w-full rounded-none" />
            <Skeleton className="aspect-[4/5] rounded-none" />
            <div className="p-3.5 space-y-2">
              <Skeleton className="w-3/4 h-4 rounded" />
              <Skeleton className="w-1/2 h-4 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main shop page                                                     */
/* ------------------------------------------------------------------ */

export default function ShopPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const { data: products, isLoading, isError } = useProducts()
  const showLoading = useDelayedLoading(isLoading)
  const cartCount = useCart((s) => s.itemCount())
  const { navMode } = useLayout()
  const hasBottomTabs = navMode === 'bottom-tabs'
  const isOnShopPage = location.pathname === '/shop'
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState(CATEGORY_ALL)

  // Derive categories from products
  const categories = useMemo(() => {
    if (!products) return []
    const cats = new Set<string>()
    for (const p of products) {
      if (p.category) cats.add(p.category)
    }
    return Array.from(cats).sort()
  }, [products])

  // Filter by search + category
  const filtered = useMemo(() => {
    if (!products) return undefined
    return products.filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase())
      const matchesCat = activeCategory === CATEGORY_ALL || p.category === activeCategory
      return matchesSearch && matchesCat
    })
  }, [products, search, activeCategory])

  // Pick the first product with an image and good rating as featured
  const featured = useMemo(() => {
    if (!products || products.length === 0) return null
    const candidates = products
      .filter((p) => p.images.length > 0 && p.variants.some((v) => v.stock > 0 && v.is_active))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return candidates[0] ?? null
  }, [products])

  // The remaining products (excluding featured if shown at top)
  const gridProducts = useMemo(() => {
    if (!filtered) return undefined
    if (!featured || search || activeCategory !== CATEGORY_ALL) return filtered
    return filtered.filter((p) => p.id !== featured.id)
  }, [filtered, featured, search, activeCategory])

  const showFeatured = featured && !search && activeCategory === CATEGORY_ALL

  const _handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['shop'] })
    await queryClient.invalidateQueries({ queryKey: ['products'] })
  }, [queryClient])

  return (
    <Page className="!px-0 bg-white" stickyOverlay={<Header title="" back transparent className="collapse-header" />}>
      <div className="relative">
        <ShopBackground rm={rm} />
        <div className="relative">
        <div className="relative min-h-dvh">
          {/* Main content */}
          <div className="relative z-10">
            {showLoading ? (
              <ShopSkeleton />
            ) : isError ? (
              <div className="px-5 py-12">
                <EmptyState
                  illustration="error"
                  title="Something went wrong"
                  description="We couldn't load the shop. Pull down to try again."
                />
              </div>
            ) : (
              <motion.div
                initial="hidden"
                animate="visible"
                variants={rm ? undefined : stagger}
                className="pb-8"
              >
                {/* Hero - full bleed with wave transition */}
                <motion.div variants={rm ? undefined : fadeUp}>
                  <ShopHero
                    rm={rm}
                  />
                </motion.div>

                {/* Content below hero - padded */}
                <div className="px-5 lg:px-6 space-y-6 -mt-1">
                  {/* Search */}
                  <motion.div variants={rm ? undefined : fadeUp}>
                    <div className="relative">
                      <SearchBar
                        value={search}
                        onChange={(val) => {
                          setSearch(val)
                          if (val) setActiveCategory(CATEGORY_ALL)
                        }}
                        placeholder="Search merch..."
                        compact
                        className="[&>*+*]:!bg-white"
                      />
                    </div>
                  </motion.div>

                  {/* Category pills */}
                  {categories.length > 0 && (
                    <motion.div variants={rm ? undefined : fadeUp}>
                      <CategoryPills
                        categories={categories}
                        active={activeCategory}
                        onChange={setActiveCategory}
                      />
                    </motion.div>
                  )}

                  {/* Featured product */}
                  {showFeatured && (
                    <motion.div variants={rm ? undefined : slideInRight}>
                      <SectionHeader icon={TrendingUp} title="Featured" />
                      <FeaturedProduct
                        product={featured}
                        onClick={() => navigate(`/shop/${featured.slug}`)}
                      />
                    </motion.div>
                  )}

                  {/* Product grid - on a lightly tinted panel */}
                  {(!gridProducts || gridProducts.length === 0) && !isLoading ? (
                    <EmptyState
                      illustration="search"
                      title={search ? 'No results' : 'Coming soon'}
                      description={
                        search
                          ? `No merch matching "${search}"`
                          : activeCategory !== CATEGORY_ALL
                            ? `No products in this category yet`
                            : 'Our merch store is getting stocked up!'
                      }
                    />
                  ) : gridProducts && gridProducts.length > 0 ? (
                    <div>
                      <SectionHeader
                        icon={Package}
                        title={activeCategory !== CATEGORY_ALL ? activeCategory : 'All Products'}
                      />
                      <motion.div
                        variants={rm ? undefined : stagger}
                        className="grid grid-cols-2 gap-3.5"
                      >
                        {gridProducts.map((product, i) => (
                          <ProductCard
                            key={product.id}
                            product={product}
                            onClick={() => navigate(`/shop/${product.slug}`)}
                            index={i}
                          />
                        ))}
                      </motion.div>
                    </div>
                  ) : null}

                </div>
              </motion.div>
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Floating action buttons */}
      {isOnShopPage && (
        <>
          {/* Orders button */}
          <button
            type="button"
            onClick={() => navigate('/shop/orders')}
            className="fixed right-5 z-50 flex items-center justify-center w-11 h-11 rounded-full bg-white text-neutral-600 shadow-sm active:scale-[0.95] transition-transform cursor-pointer border border-neutral-100"
            style={{ bottom: hasBottomTabs ? 'calc(9.5rem + var(--safe-bottom, 0px))' : 'calc(6rem + var(--safe-bottom, 0px))' }}
            aria-label="My orders"
          >
            <Package size={18} />
          </button>

          {/* Cart button */}
          <button
            type="button"
            onClick={() => navigate('/shop/cart')}
            className="fixed right-5 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-neutral-900 text-white shadow-sm active:scale-[0.95] transition-transform cursor-pointer"
            style={{ bottom: hasBottomTabs ? 'calc(4.5rem + var(--safe-bottom, 0px))' : 'calc(1.5rem + var(--safe-bottom, 0px))' }}
            aria-label={`Cart (${cartCount} items)`}
          >
            <ShoppingBag size={22} />
            {cartCount > 0 && (
              <span
                className={cn(
                  'absolute -top-1 -right-1 flex items-center justify-center',
                  'min-w-[20px] h-[20px] px-1 rounded-full',
                  'bg-primary-500 text-white text-[10px] font-bold shadow-sm',
                )}
              >
                {cartCount}
              </span>
            )}
          </button>
        </>
      )}
    </Page>
  )
}
