import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import {
    AlertTriangle, PackageX, ArrowUpDown,
    Minus, Plus, CheckSquare, Square, Package, Layers
} from 'lucide-react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { TabBar } from '@/components/tab-bar'
import { SearchBar } from '@/components/search-bar'
import { Button } from '@/components/button'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { BottomSheet } from '@/components/bottom-sheet'
import { useToast } from '@/components/toast'
import { useAdminProducts, useAdjustStock } from '@/hooks/use-admin-merch'
import { variantLabel, type Product, type ProductVariant } from '@/types/merch'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type StockFilter = 'all' | 'low' | 'out'
type SortMode = 'stock-asc' | 'name' | 'product'
interface FlatVariant {
  product: Product
  variant: ProductVariant
}

/* ------------------------------------------------------------------ */
/*  Filter pills                                                       */
/* ------------------------------------------------------------------ */

const STOCK_FILTERS: { value: StockFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'low', label: 'Low Stock' },
  { value: 'out', label: 'Out of Stock' },
]

/* ------------------------------------------------------------------ */
/*  Inventory summary cards                                            */
/* ------------------------------------------------------------------ */

function SummaryCards({ items }: { items: FlatVariant[] }) {
  const totalVariants = items.length
  const outOfStock = items.filter((i) => i.variant.stock === 0).length
  const lowStock = items.filter(
    (i) => i.variant.stock > 0 && i.variant.stock <= i.variant.low_stock_threshold,
  ).length
  const healthy = totalVariants - outOfStock - lowStock

  const cards = [
    { label: 'Total SKUs', value: totalVariants, iconBg: 'bg-primary-50 text-primary-600', icon: Layers },
    { label: 'Healthy', value: healthy, iconBg: 'bg-success-50 text-success-600', icon: Package },
    { label: 'Low Stock', value: lowStock, iconBg: 'bg-warning-50 text-warning-600', icon: AlertTriangle },
    { label: 'Out of Stock', value: outOfStock, iconBg: 'bg-error-50 text-error-600', icon: PackageX },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
      {cards.map((c) => {
        const Icon = c.icon
        return (
          <div key={c.label} className="p-3.5 rounded-md bg-white border border-neutral-100 shadow-sm text-center">
            <div className={cn('w-7 h-7 rounded-sm flex items-center justify-center mx-auto mb-1', c.iconBg)}>
              <Icon size={14} />
            </div>
            <p className="font-heading text-xl font-bold tabular-nums text-neutral-900">
              {c.value}
            </p>
            <p className="text-[11px] text-neutral-500 font-semibold mt-0.5">{c.label}</p>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Inline stock stepper - tap +/- right in the row                    */
/* ------------------------------------------------------------------ */

function InlineStepper({
  item,
  adjustStock,
}: {
  item: FlatVariant
  adjustStock: ReturnType<typeof useAdjustStock>
}) {
  const { toast } = useToast()

  const handleAdjust = useCallback(
    async (adj: number) => {
      try {
        await adjustStock.mutateAsync({
          productId: item.product.id,
          variantKey: item.variant.sku || item.variant.id,
          adjustment: adj,
        })
      } catch {
        toast.error('Failed to adjust stock')
      }
    },
    [item, adjustStock, toast],
  )

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); handleAdjust(-1) }}
        disabled={item.variant.stock === 0}
        className="flex items-center justify-center w-8 h-8 rounded-l-sm bg-white/80 border border-neutral-100 text-neutral-500 hover:bg-error-50 hover:text-error-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98] transition-transform duration-150"
      >
        <Minus size={12} />
      </button>
      <div className="flex items-center justify-center w-10 h-8 bg-white/80 border-y border-neutral-100 text-sm font-bold tabular-nums text-neutral-900">
        {item.variant.stock}
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); handleAdjust(1) }}
        className="flex items-center justify-center w-8 h-8 rounded-r-sm bg-white/80 border border-neutral-100 text-neutral-500 hover:bg-success-50 hover:text-success-600 cursor-pointer active:scale-[0.98] transition-transform duration-150"
      >
        <Plus size={12} />
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Batch adjustment sheet                                             */
/* ------------------------------------------------------------------ */

function BatchAdjustSheet({
  open,
  onClose,
  selected,
  adjustStock,
}: {
  open: boolean
  onClose: () => void
  selected: FlatVariant[]
  adjustStock: ReturnType<typeof useAdjustStock>
}) {
  const { toast } = useToast()
  const [adjustment, setAdjustment] = useState('')
  const [processing, setProcessing] = useState(false)

  const quickAmounts = [
    { label: '+5', value: 5 },
    { label: '+10', value: 10 },
    { label: '+25', value: 25 },
    { label: '+50', value: 50 },
  ]

  const handleBatchApply = useCallback(async (adj: number) => {
    if (adj === 0 || selected.length === 0) return
    setProcessing(true)
    let successCount = 0
    let failCount = 0
    for (const item of selected) {
      try {
        await adjustStock.mutateAsync({
          productId: item.product.id,
          variantKey: item.variant.sku || item.variant.id,
          adjustment: adj,
        })
        successCount++
      } catch {
        failCount++
      }
    }
    setProcessing(false)
    if (failCount === 0) {
      toast.success(`Adjusted ${successCount} variant${successCount !== 1 ? 's' : ''} by ${adj > 0 ? '+' : ''}${adj}`)
    } else {
      toast.error(`${failCount} failed, ${successCount} succeeded`)
    }
    setAdjustment('')
    onClose()
  }, [selected, adjustStock, toast, onClose])

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="space-y-5">
        <div>
          <h3 className="font-heading font-semibold text-neutral-900">Batch Stock Adjustment</h3>
          <p className="text-xs text-neutral-400 mt-1">
            Adjust {selected.length} variant{selected.length !== 1 ? 's' : ''} at once
          </p>
        </div>

        {/* Selected items preview */}
        <div className="max-h-32 overflow-y-auto space-y-1 rounded-sm bg-neutral-50 p-2.5">
          {selected.map((item) => (
            <div
              key={`${item.product.id}-${item.variant.id}`}
              className="flex items-center justify-between text-xs py-1"
            >
              <span className="text-neutral-600 truncate">
                {item.product.name} · {variantLabel(item.variant)}
              </span>
              <span className="font-semibold tabular-nums text-neutral-900 ml-2 shrink-0">
                {item.variant.stock}
              </span>
            </div>
          ))}
        </div>

        {/* Quick restock buttons */}
        <div>
          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
            Quick Restock
          </p>
          <div className="grid grid-cols-4 gap-2">
            {quickAmounts.map((qa) => (
              <button
                key={qa.value}
                type="button"
                disabled={processing}
                onClick={() => handleBatchApply(qa.value)}
                className="py-3 rounded-sm text-sm font-bold bg-success-600 text-white shadow-sm cursor-pointer active:scale-[0.98] transition-transform duration-150 disabled:opacity-50"
              >
                {qa.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom amount */}
        <div>
          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
            Custom Amount
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              value={adjustment}
              onChange={(e) => setAdjustment(e.target.value)}
              placeholder="+/- amount"
              className="flex-1 h-12 px-4 rounded-sm bg-neutral-50 text-sm font-semibold text-neutral-900 placeholder:text-neutral-400/50 outline-none focus:ring-2 focus:ring-primary-300/50 tabular-nums"
            />
            <Button
              variant="primary"
              loading={processing}
              disabled={!adjustment || Number(adjustment) === 0}
              onClick={() => handleBatchApply(Number(adjustment))}
              className="px-6"
            >
              Apply
            </Button>
          </div>
          <p className="text-[11px] text-neutral-400 mt-1.5">
            Positive to add, negative to remove
          </p>
        </div>
      </div>
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Product-grouped variant rows                                       */
/* ------------------------------------------------------------------ */

function ProductGroup({
  product,
  variants,
  selectedIds,
  onToggleSelect,
  adjustStock,
}: {
  product: Product
  variants: FlatVariant[]
  selectedIds: Set<string>
  onToggleSelect: (key: string) => void
  adjustStock: ReturnType<typeof useAdjustStock>
}) {
  const allSelected = variants.every((v) => selectedIds.has(`${product.id}-${v.variant.id}`))
  const someSelected = variants.some((v) => selectedIds.has(`${product.id}-${v.variant.id}`))

  const toggleAll = useCallback(() => {
    for (const v of variants) {
      const key = `${product.id}-${v.variant.id}`
      if (allSelected) {
        onToggleSelect(key) // deselect
      } else if (!selectedIds.has(key)) {
        onToggleSelect(key) // select
      }
    }
  }, [variants, product.id, allSelected, selectedIds, onToggleSelect])

  // Determine worst stock status for the product header color
  const hasOOS = variants.some((v) => v.variant.stock === 0)
  const hasLow = variants.some(
    (v) => v.variant.stock > 0 && v.variant.stock <= v.variant.low_stock_threshold,
  )
  const headerBorder = hasOOS
    ? 'border-error-200/40'
    : hasLow
      ? 'border-warning-200/40'
      : 'border-neutral-100'

  return (
    <div className={cn('rounded-md border overflow-hidden shadow-sm bg-white', headerBorder)}>
      {/* Product header row */}
      <button
        type="button"
        onClick={toggleAll}
        className="w-full flex items-center gap-3 p-3.5 cursor-pointer hover:bg-white/30 transition-colors"
      >
        <div className="shrink-0 text-neutral-400">
          {allSelected ? (
            <CheckSquare size={18} className="text-primary-600" />
          ) : someSelected ? (
            <CheckSquare size={18} className="text-neutral-400 opacity-50" />
          ) : (
            <Square size={18} />
          )}
        </div>
        <img
          src={product.images[0] ?? '/img/placeholder-merch.jpg'}
          alt={product.name}
          className="w-10 h-10 rounded-sm object-cover shrink-0"
        />
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-bold text-neutral-900 truncate">{product.name}</p>
          <p className="text-[11px] text-neutral-400">
            {variants.length} variant{variants.length !== 1 ? 's' : ''} ·{' '}
            {variants.reduce((sum, v) => sum + v.variant.stock, 0)} total units
          </p>
        </div>
      </button>

      {/* Variant rows */}
      <div className="divide-y divide-neutral-100/40">
        {variants.map((item) => {
          const key = `${product.id}-${item.variant.id}`
          const isSelected = selectedIds.has(key)
          const isOOS = item.variant.stock === 0
          const isLow = !isOOS && item.variant.stock <= item.variant.low_stock_threshold

          return (
            <div
              key={key}
              className={cn(
                'flex items-center gap-2.5 px-3.5 py-2.5 transition-colors',
                isSelected && 'bg-neutral-100/40',
              )}
            >
              <button
                type="button"
                onClick={() => onToggleSelect(key)}
                className="shrink-0 text-neutral-400 cursor-pointer"
              >
                {isSelected ? (
                  <CheckSquare size={16} className="text-primary-600" />
                ) : (
                  <Square size={16} />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-neutral-700 truncate">
                  {variantLabel(item.variant)}
                </p>
                <p className="text-[11px] text-neutral-400 truncate">
                  {item.variant.sku ?? ''}
                  {isOOS && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-error-100 text-error-700 font-semibold text-[10px]">
                      OUT
                    </span>
                  )}
                  {isLow && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-warning-100 text-warning-700 font-semibold text-[10px]">
                      LOW
                    </span>
                  )}
                </p>
              </div>

              <InlineStepper item={item} adjustStock={adjustStock} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main inventory tab                                                 */
/* ------------------------------------------------------------------ */

export default function InventoryTab() {
  const { data: products, isLoading } = useAdminProducts()
  const showLoading = useDelayedLoading(isLoading)
  const shouldReduceMotion = useReducedMotion()
  const adjustStock = useAdjustStock()

  const [filter, setFilter] = useState<StockFilter>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortMode>('name')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchOpen, setBatchOpen] = useState(false)

  // Flatten all products into variant-level rows
  const allItems: FlatVariant[] = useMemo(() => {
    if (!products) return []
    return products
      .filter((p) => p.status !== 'archived')
      .flatMap((product) =>
        product.variants.map((variant) => ({ product, variant })),
      )
  }, [products])

  // Apply filters
  const filtered = useMemo(() => {
    let items = allItems

    // Stock filter
    if (filter === 'low') {
      items = items.filter(
        (i) => i.variant.stock > 0 && i.variant.stock <= i.variant.low_stock_threshold,
      )
    } else if (filter === 'out') {
      items = items.filter((i) => i.variant.stock === 0)
    }

    // Search
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(
        (i) =>
          i.product.name.toLowerCase().includes(q) ||
          variantLabel(i.variant).toLowerCase().includes(q) ||
          (i.variant.sku ?? '').toLowerCase().includes(q),
      )
    }

    // Sort
    // Stable tiebreaker so items don't jump around when stock changes
    const tie = (a: FlatVariant, b: FlatVariant) =>
      a.product.name.localeCompare(b.product.name) ||
      variantLabel(a.variant).localeCompare(variantLabel(b.variant)) ||
      a.variant.id.localeCompare(b.variant.id)

    items = [...items].sort((a, b) => {
      switch (sort) {
        case 'stock-asc':
          return a.variant.stock - b.variant.stock || tie(a, b)
        case 'name':
          return tie(a, b)
        case 'product':
          return tie(a, b)
        default:
          return tie(a, b)
      }
    })

    return items
  }, [allItems, filter, search, sort])

  // Group by product for the grouped view
  const groupedByProduct = useMemo(() => {
    const map = new Map<string, { product: Product; variants: FlatVariant[] }>()
    for (const item of filtered) {
      const existing = map.get(item.product.id)
      if (existing) {
        existing.variants.push(item)
      } else {
        map.set(item.product.id, { product: item.product, variants: [item] })
      }
    }
    return [...map.values()]
  }, [filtered])

  const toggleSelect = useCallback((key: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  const selectedItems = useMemo(() => {
    return filtered.filter((item) =>
      selectedIds.has(`${item.product.id}-${item.variant.id}`),
    )
  }, [filtered, selectedIds])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filtered.map((item) => `${item.product.id}-${item.variant.id}`)))
  }, [filtered])

  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  if (showLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="stat-card" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} variant="card" />
        ))}
      </div>
    )
  }
  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
    >
      {/* Summary cards */}
      <motion.div variants={fadeUp}>
        <SummaryCards items={allItems} />
      </motion.div>

      {/* Filter tabs + sort */}
      <motion.div variants={fadeUp} className="flex items-end gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <TabBar
            tabs={STOCK_FILTERS.map((f) => ({ id: f.value, label: f.label }))}
            activeTab={filter}
            onChange={(id) => setFilter(id as StockFilter)}
            aria-label="Stock filter"
          />
        </div>
        <button
          type="button"
          onClick={() =>
            setSort((s) =>
              s === 'stock-asc' ? 'name' : s === 'name' ? 'product' : 'stock-asc',
            )
          }
          className="flex items-center gap-1.5 px-3 py-2 rounded-sm text-xs font-semibold whitespace-nowrap bg-white border border-neutral-100 text-neutral-700 cursor-pointer transition-[color,background-color,transform] hover:shadow-sm active:scale-[0.97] shrink-0 mb-px"
        >
          <ArrowUpDown size={12} />
          {sort === 'stock-asc' ? 'Stock ↑' : sort === 'name' ? 'A-Z' : 'Product'}
        </button>
      </motion.div>

      {/* Search */}
      <motion.div variants={fadeUp} className="mb-4">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search products or SKUs..."
          compact
        />
      </motion.div>

      {/* Batch action bar */}
      <AnimatePresence>
        {selectedItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4 flex items-center gap-2 p-3 rounded-md bg-primary-600 shadow-sm"
          >
            <span className="text-sm font-semibold text-white flex-1">
              {selectedItems.length} selected
            </span>
            <button
              type="button"
              onClick={selectAll}
              className="px-4 min-h-11 rounded-sm bg-white/15 text-sm font-semibold text-white hover:bg-white/25 cursor-pointer transition-colors"
            >
              All
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="px-4 min-h-11 rounded-sm bg-white/15 text-sm font-semibold text-white hover:bg-white/25 cursor-pointer transition-colors"
            >
              Clear
            </button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setBatchOpen(true)}
            >
              Adjust Stock
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Product-grouped inventory list */}
      <motion.div variants={fadeUp}>
        {filtered.length === 0 ? (
          <EmptyState
            illustration={filter === 'out' ? 'success' : 'search'}
            title={
              filter === 'out'
                ? 'No out-of-stock items'
                : filter === 'low'
                  ? 'No low stock items'
                  : 'No items found'
            }
            description={
              filter !== 'all'
                ? 'All your inventory looks healthy'
                : search
                  ? 'Try a different search term'
                  : 'Add products to see inventory here'
            }
          />
        ) : (
          <div className="space-y-3">
            {groupedByProduct.map(({ product, variants }) => (
              <ProductGroup
                key={product.id}
                product={product}
                variants={variants}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                adjustStock={adjustStock}
              />
            ))}
          </div>
        )}
      </motion.div>

      {/* Batch adjust sheet */}
      <BatchAdjustSheet
        open={batchOpen}
        onClose={() => {
          setBatchOpen(false)
          clearSelection()
        }}
        selected={selectedItems}
        adjustStock={adjustStock}
      />
    </motion.div>
  )
}
