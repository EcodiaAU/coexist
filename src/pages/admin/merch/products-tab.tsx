import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import {
    Plus, Edit3, Archive, AlertTriangle, X,
    ChevronDown, ImagePlus, GripVertical, Trash2,
} from 'lucide-react'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useImageUpload } from '@/hooks/use-image-upload'
import { SearchBar } from '@/components/search-bar'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { BottomSheet } from '@/components/bottom-sheet'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { useToast } from '@/components/toast'
import { Divider } from '@/components/divider'
import {
    useAdminProducts,
    useCreateProduct,
    useUpdateProduct,
    useAdjustStock,
} from '@/hooks/use-admin-merch'
import { formatPrice, variantLabel, PRODUCT_CATEGORIES, type Product, type ProductStatus, type ProductVariant } from '@/types/merch'
import { Dropdown } from '@/components/dropdown'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'

/* ------------------------------------------------------------------ */
/*  Variant option input - type values, press Enter/comma to add       */
/* ------------------------------------------------------------------ */

interface VariantOption {
  name: string      // e.g. "Size", "Colour"
  values: string[]  // e.g. ["S", "M", "L", "XL"]
}

function VariantOptionRow({
  option,
  onChange,
  onRemove,
}: {
  option: VariantOption
  onChange: (o: VariantOption) => void
  onRemove: () => void
}) {
  const [inputValue, setInputValue] = useState('')

  const addValue = useCallback((raw: string) => {
    const v = raw.trim()
    if (!v || option.values.includes(v)) return
    onChange({ ...option, values: [...option.values, v] })
    setInputValue('')
  }, [option, onChange])

  const removeValue = useCallback((idx: number) => {
    onChange({ ...option, values: option.values.filter((_, i) => i !== idx) })
  }, [option, onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      e.stopPropagation()
      addValue(inputValue)
    }
    if (e.key === 'Backspace' && !inputValue && option.values.length > 0) {
      removeValue(option.values.length - 1)
    }
  }, [inputValue, option.values, addValue, removeValue])

  const handleBlur = useCallback(() => {
    if (inputValue.trim()) addValue(inputValue)
  }, [inputValue, addValue])

  return (
    <div data-eos-id="src/pages/admin/merch/products-tab.tsx#0" className="p-3 bg-white/70 rounded-sm border border-neutral-100 space-y-2">
      <div data-eos-id="src/pages/admin/merch/products-tab.tsx#1" className="flex items-center gap-2">
        <input data-eos-id="src/pages/admin/merch/products-tab.tsx#2"
          type="text"
          value={option.name}
          onChange={(e) => onChange({ ...option, name: e.target.value })}
          placeholder="Option name (e.g. Size)"
          className="flex-1 h-11 px-3 rounded-sm bg-neutral-50 text-[16px] sm:text-sm font-semibold text-neutral-900 placeholder:text-neutral-400/50 outline-none focus:ring-2 focus:ring-primary-300/50"
        />
        <button data-eos-id="src/pages/admin/merch/products-tab.tsx#3"
          type="button"
          onClick={onRemove}
          className="w-11 h-11 flex items-center justify-center rounded-sm text-neutral-400 hover:text-error-600 hover:bg-error-50 active:bg-error-100 cursor-pointer transition-colors shrink-0"
        >
          <Trash2 data-eos-id="src/pages/admin/merch/products-tab.tsx#4" size={16} />
        </button>
      </div>

      {/* Values as pills + inline input */}
      <div data-eos-id="src/pages/admin/merch/products-tab.tsx#5" className="flex flex-wrap items-center gap-1.5 min-h-[44px] px-3 py-2 rounded-sm bg-white border border-neutral-100 focus-within:ring-2 focus-within:ring-primary-300/50">
        {option.values.map((val, idx) => (
          <span data-eos-id="src/pages/admin/merch/products-tab.tsx#6"
            key={val}
            className="inline-flex items-center gap-1 h-7 px-2.5 bg-neutral-100 text-neutral-700 rounded-full text-xs font-medium"
          >
            {val}
            <button data-eos-id="src/pages/admin/merch/products-tab.tsx#7"
              type="button"
              onClick={() => removeValue(idx)}
              className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-neutral-200 active:bg-neutral-300 cursor-pointer"
            >
              <X data-eos-id="src/pages/admin/merch/products-tab.tsx#8" size={10} />
            </button>
          </span>
        ))}
        <input data-eos-id="src/pages/admin/merch/products-tab.tsx#9"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={option.values.length === 0 ? 'Type values, press Enter' : 'Add more...'}
          className="flex-1 min-w-[80px] h-7 bg-transparent text-[16px] sm:text-sm text-neutral-900 placeholder:text-neutral-400/50 outline-none"
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Build the variant matrix from options                               */
/* ------------------------------------------------------------------ */

function buildVariantMatrix(
  options: VariantOption[],
  existingVariants: ProductVariant[],
  baseSlug: string,
  basePriceCents: number,
): ProductVariant[] {
  // Only use options that have a name and at least one value
  const valid = options.filter((o) => o.name.trim() && o.values.length > 0)

  if (valid.length === 0) return existingVariants

  // Generate all combinations
  const combos: Record<string, string>[] = [{}]
  for (const opt of valid) {
    const expanded: Record<string, string>[] = []
    for (const existing of combos) {
      for (const val of opt.values) {
        expanded.push({ ...existing, [opt.name.toLowerCase()]: val })
      }
    }
    combos.length = 0
    combos.push(...expanded)
  }

  // Map combos to variants, reusing existing ones where they match
  return combos.map((combo) => {
    const size = combo['size'] ?? combo['sizes'] ?? null
    const colour = combo['colour'] ?? combo['color'] ?? combo['colours'] ?? null

    // Try to find existing variant with same size+colour
    const existing = existingVariants.find(
      (v) => (v.size ?? null) === size && (v.colour ?? null) === colour,
    )

    if (existing) return existing

    const parts = Object.values(combo).filter(Boolean)
    const skuSuffix = parts.map((p) => p.toUpperCase().replace(/\s+/g, '')).join('-')

    return {
      id: crypto.randomUUID(),
      product_id: '',
      size,
      colour,
      sku: `${baseSlug}-${skuSuffix}`.toUpperCase(),
      price_cents: basePriceCents,
      stock: 0,
      low_stock_threshold: 5,
      is_active: true,
    }
  })
}

/* ------------------------------------------------------------------ */
/*  Extract options back from existing variants                        */
/* ------------------------------------------------------------------ */

function extractOptionsFromVariants(variants: ProductVariant[]): VariantOption[] {
  const opts: VariantOption[] = []
  const sizes = [...new Set(variants.map((v) => v.size).filter(Boolean))] as string[]
  const colours = [...new Set(variants.map((v) => v.colour).filter(Boolean))] as string[]
  if (sizes.length > 0) opts.push({ name: 'Size', values: sizes })
  if (colours.length > 0) opts.push({ name: 'Colour', values: colours })
  return opts
}

/* ------------------------------------------------------------------ */
/*  Product form sheet                                                 */
/* ------------------------------------------------------------------ */

const SNAP_POINTS_FORM = [0.92]

function ProductFormSheet({
  open,
  onClose,
  product,
}: {
  open: boolean
  onClose: () => void
  product?: Product
}) {
  const { toast } = useToast()
  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct()
  const { upload, uploading, progress } = useImageUpload({ bucket: 'merch-images', pathPrefix: 'products' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [basePriceCents, setBasePriceCents] = useState('')
  const [status, setStatus] = useState<ProductStatus>('draft')
  const [images, setImages] = useState<string[]>([])
  const [options, setOptions] = useState<VariantOption[]>([])
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  // Populate form
  useEffect(() => {
    if (open) {
      setName(product?.name ?? '')
      setSlug(product?.slug ?? '')
      setDescription(product?.description ?? '')
      setCategory(product?.category ?? '')
      setBasePriceCents(product ? String(product.base_price_cents / 100) : '')
      setStatus(product?.status ?? 'draft')
      setImages(product?.images ?? [])
      setOptions(product?.variants?.length ? extractOptionsFromVariants(product.variants) : [])
    }
  }, [open, product])

  // Auto-generate matrix preview
  const generatedVariants = useMemo(() => {
    const priceNum = Math.round(Number(basePriceCents || '0') * 100)
    const slugBase = slug.trim() || name.trim().toLowerCase().replace(/\s+/g, '-') || 'product'
    return buildVariantMatrix(options, product?.variants ?? [], slugBase, priceNum)
  }, [options, product?.variants, basePriceCents, slug, name])

  const handleAddImages = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    try {
      for (const file of Array.from(files)) {
        const result = await upload(file)
        setImages((prev) => [...prev, result.url])
      }
    } catch {
      toast.error('Failed to upload image')
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [upload, toast])

  const handleRemoveImage = useCallback((idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const handleMoveImage = useCallback((from: number, to: number) => {
    setImages((prev) => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }, [])

  const handleSave = useCallback(async () => {
    const priceNum = Math.round(Number(basePriceCents) * 100)
    if (!name.trim() || priceNum <= 0) {
      toast.error('Name and price are required')
      return
    }

    setSaving(true)
    try {
      const productSlug = slug.trim() || name.trim().toLowerCase().replace(/\s+/g, '-')
      const variantsToSave = generatedVariants.map((v) => ({
        ...v,
        price_cents: v.price_cents || priceNum,
      }))

      if (product) {
        await updateProduct.mutateAsync({
          id: product.id,
          name: name.trim(),
          slug: productSlug,
          description: description.trim(),
          category: category.trim() || null,
          base_price_cents: priceNum,
          status,
          images,
        })
        // Update variants as full JSONB replace
        const { error: variantError } = await supabase
          .from('merch_products')
          .update({ variants: variantsToSave })
          .eq('id', product.id)
        if (variantError) throw variantError
      } else {
        const created = await createProduct.mutateAsync({
          name: name.trim(),
          slug: productSlug,
          description: description.trim(),
          category: category.trim() || null,
          base_price_cents: priceNum,
          status,
          images,
        })
        const newId = (created as Record<string, unknown>)?.id as string | undefined
        if (newId && variantsToSave.length > 0) {
          await supabase
            .from('merch_products')
            .update({ variants: variantsToSave.map((v) => ({ ...v, product_id: newId })) })
            .eq('id', newId)
        }
      }

      toast.success(product ? 'Product updated' : 'Product created')
      onClose()
    } catch {
      toast.error('Failed to save product')
    } finally {
      setSaving(false)
    }
  }, [name, slug, description, category, basePriceCents, status, images, generatedVariants, product, createProduct, updateProduct, toast, onClose])

  const isPending = saving || createProduct.isPending || updateProduct.isPending

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') {
      e.preventDefault()
    }
  }, [])

  return (
    <BottomSheet data-eos-id="src/pages/admin/merch/products-tab.tsx#10" open={open} onClose={onClose} snapPoints={SNAP_POINTS_FORM}>
      <div data-eos-id="src/pages/admin/merch/products-tab.tsx#11" className="space-y-4" onKeyDown={handleKeyDown}>
        <h3 data-eos-id="src/pages/admin/merch/products-tab.tsx#12" className="font-heading font-semibold text-base text-neutral-900">
          {product ? 'Edit product' : 'New product'}
        </h3>

        {/* ---- Images ---- */}
        <div data-eos-id="src/pages/admin/merch/products-tab.tsx#13">
          <p data-eos-id="src/pages/admin/merch/products-tab.tsx#14" className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
            Images
            {images.length > 0 && <span data-eos-id="src/pages/admin/merch/products-tab.tsx#15" className="ml-1 text-neutral-400 normal-case font-normal">({images.length})</span>}
          </p>
          <div data-eos-id="src/pages/admin/merch/products-tab.tsx#16" className="flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
            {images.map((url, idx) => (
              <div data-eos-id="src/pages/admin/merch/products-tab.tsx#17"
                key={url + idx}
                className={cn(
                  'relative group w-16 h-16 rounded-sm overflow-hidden border-2 shrink-0 transition-colors',
                  idx === 0 ? 'border-primary-400 shadow-sm' : 'border-neutral-100',
                  dragIdx === idx && 'opacity-50 scale-95',
                )}
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIdx !== null && dragIdx !== idx) handleMoveImage(dragIdx, idx)
                  setDragIdx(null)
                }}
                onDragEnd={() => setDragIdx(null)}
              >
                <img data-eos-id="src/pages/admin/merch/products-tab.tsx#18" src={url} alt={`Product image ${idx + 1}`} loading="lazy" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                {idx === 0 && (
                  <span data-eos-id="src/pages/admin/merch/products-tab.tsx#19" className="absolute top-0.5 left-0.5 px-1 py-px bg-primary-500/90 text-white text-[8px] font-bold rounded">
                    Main
                  </span>
                )}
                <div data-eos-id="src/pages/admin/merch/products-tab.tsx#20" className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <GripVertical data-eos-id="src/pages/admin/merch/products-tab.tsx#21" size={12} className="text-white drop-shadow-sm" />
                </div>
                <button data-eos-id="src/pages/admin/merch/products-tab.tsx#22"
                  type="button"
                  onClick={() => handleRemoveImage(idx)}
                  className="absolute bottom-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:bg-error-500"
                >
                  <X data-eos-id="src/pages/admin/merch/products-tab.tsx#23" size={10} />
                </button>
              </div>
            ))}

            <button data-eos-id="src/pages/admin/merch/products-tab.tsx#24"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className={cn(
                'w-16 h-16 rounded-sm border-2 border-dashed border-primary-300/50 flex flex-col items-center justify-center gap-0.5 shrink-0',
                'text-neutral-400 hover:text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50',
                'active:bg-neutral-100 cursor-pointer transition-colors',
                uploading && 'opacity-60 pointer-events-none',
              )}
            >
              {uploading ? (
                <span data-eos-id="src/pages/admin/merch/products-tab.tsx#25" className="text-[10px] font-bold tabular-nums">{progress ?? 0}%</span>
              ) : (
                <>
                  <ImagePlus data-eos-id="src/pages/admin/merch/products-tab.tsx#26" size={18} />
                  <span data-eos-id="src/pages/admin/merch/products-tab.tsx#27" className="text-[9px] font-semibold">Add</span>
                </>
              )}
            </button>

            <input data-eos-id="src/pages/admin/merch/products-tab.tsx#28"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleAddImages(e.target.files)}
            />
          </div>
          {images.length > 1 && (
            <p data-eos-id="src/pages/admin/merch/products-tab.tsx#29" className="text-[10px] text-neutral-400 mt-1">Drag to reorder. First = main photo.</p>
          )}
        </div>

        <Divider data-eos-id="src/pages/admin/merch/products-tab.tsx#30" />

        {/* ---- Product details ---- */}
        <Input data-eos-id="src/pages/admin/merch/products-tab.tsx#31" label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input data-eos-id="src/pages/admin/merch/products-tab.tsx#32"
          label="Slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          helperText="Auto-generated if blank"
        />
        <Input data-eos-id="src/pages/admin/merch/products-tab.tsx#33"
          type="textarea"
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
        <div data-eos-id="src/pages/admin/merch/products-tab.tsx#34" className="grid grid-cols-2 gap-2.5">
          <Dropdown data-eos-id="src/pages/admin/merch/products-tab.tsx#35"
            label="Category"
            placeholder="Select category"
            options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))}
            value={category}
            onChange={setCategory}
          />
          <Input data-eos-id="src/pages/admin/merch/products-tab.tsx#36"
            label="Base price ($)"
            value={basePriceCents}
            onChange={(e) => setBasePriceCents(e.target.value)}
            required
          />
        </div>

        {/* Status selector */}
        <div data-eos-id="src/pages/admin/merch/products-tab.tsx#37">
          <p data-eos-id="src/pages/admin/merch/products-tab.tsx#38" className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">Status</p>
          <div data-eos-id="src/pages/admin/merch/products-tab.tsx#39" className="flex gap-1.5">
            {(['draft', 'active', 'archived'] as ProductStatus[]).map((s) => (
              <button data-eos-id="src/pages/admin/merch/products-tab.tsx#40"
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  'flex-1 min-h-[44px] rounded-sm text-sm font-semibold capitalize cursor-pointer transition-colors duration-150',
                  status === s && s === 'active' && 'bg-success-100 text-success-700 ring-2 ring-success-300 shadow-sm',
                  status === s && s === 'draft' && 'bg-warning-100 text-warning-700 ring-2 ring-warning-300 shadow-sm',
                  status === s && s === 'archived' && 'bg-primary-100 text-primary-600 ring-2 ring-primary-300 shadow-sm',
                  status !== s && 'bg-neutral-50 text-neutral-400 hover:bg-neutral-100 active:bg-neutral-100',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <Divider data-eos-id="src/pages/admin/merch/products-tab.tsx#41" />

        {/* ---- Variant options ---- */}
        <div data-eos-id="src/pages/admin/merch/products-tab.tsx#42">
          <div data-eos-id="src/pages/admin/merch/products-tab.tsx#43" className="flex items-center justify-between mb-2">
            <p data-eos-id="src/pages/admin/merch/products-tab.tsx#44" className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
              Variant options
            </p>
            <button data-eos-id="src/pages/admin/merch/products-tab.tsx#45"
              type="button"
              onClick={() => setOptions((prev) => [...prev, { name: '', values: [] }])}
              className="flex items-center gap-1 min-h-[36px] px-3 rounded-sm text-xs font-semibold text-neutral-600 hover:bg-neutral-100 active:bg-neutral-100 cursor-pointer transition-colors"
            >
              <Plus data-eos-id="src/pages/admin/merch/products-tab.tsx#46" size={14} />
              Add option
            </button>
          </div>

          {options.length === 0 ? (
            <div data-eos-id="src/pages/admin/merch/products-tab.tsx#47" className="py-3 px-4 rounded-sm bg-neutral-50 text-center">
              <p data-eos-id="src/pages/admin/merch/products-tab.tsx#48" className="text-xs text-neutral-400">No variant options yet</p>
              <p data-eos-id="src/pages/admin/merch/products-tab.tsx#49" className="text-[11px] text-neutral-400/70 mt-0.5">Add Size, Colour, etc.</p>
            </div>
          ) : (
            <div data-eos-id="src/pages/admin/merch/products-tab.tsx#50" className="space-y-2">
              {options.map((opt, idx) => (
                <VariantOptionRow data-eos-id="src/pages/admin/merch/products-tab.tsx#51"
                  key={idx}
                  option={opt}
                  onChange={(o) => setOptions((prev) => prev.map((p, i) => (i === idx ? o : p)))}
                  onRemove={() => setOptions((prev) => prev.filter((_, i) => i !== idx))}
                />
              ))}
            </div>
          )}
        </div>

        {/* ---- Generated matrix preview ---- */}
        {generatedVariants.length > 0 && options.some((o) => o.values.length > 0) && (
          <div data-eos-id="src/pages/admin/merch/products-tab.tsx#52">
            <p data-eos-id="src/pages/admin/merch/products-tab.tsx#53" className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
              Generated variants
              <span data-eos-id="src/pages/admin/merch/products-tab.tsx#54" className="ml-1 text-neutral-400 normal-case font-normal">({generatedVariants.length})</span>
            </p>
            <div data-eos-id="src/pages/admin/merch/products-tab.tsx#55" className="space-y-1 max-h-40 overflow-y-auto rounded-sm -mx-0.5 px-0.5">
              {generatedVariants.map((v) => (
                <div data-eos-id="src/pages/admin/merch/products-tab.tsx#56"
                  key={v.id}
                  className="flex items-center justify-between min-h-[36px] px-3 py-1.5 bg-white/70 rounded-sm text-xs"
                >
                  <div data-eos-id="src/pages/admin/merch/products-tab.tsx#57" className="flex items-center gap-1.5 min-w-0">
                    <span data-eos-id="src/pages/admin/merch/products-tab.tsx#58" className="font-medium text-neutral-900 truncate">{variantLabel(v)}</span>
                    <span data-eos-id="src/pages/admin/merch/products-tab.tsx#59" data-eos-var="v.sku" data-eos-var-label="Sku" data-eos-var-scope="item" className="text-neutral-400 font-mono text-[10px] hidden sm:inline">{v.sku}</span>
                  </div>
                  <span data-eos-id="src/pages/admin/merch/products-tab.tsx#60" data-eos-var="v.price_cents" data-eos-var-label="Price cents" data-eos-var-scope="item" className="text-neutral-500 tabular-nums font-semibold shrink-0">{formatPrice(v.price_cents)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---- Save ---- */}
        <div data-eos-id="src/pages/admin/merch/products-tab.tsx#61" className="pt-1 pb-safe">
          <Button data-eos-id="src/pages/admin/merch/products-tab.tsx#62"
            variant="primary"
            fullWidth
            loading={isPending}
            onClick={handleSave}
          >
            {product ? 'Save changes' : 'Create product'}
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Variant summary - expandable on product cards                      */
/* ------------------------------------------------------------------ */

function VariantSummary({
  product,
  onAdjustStock,
}: {
  product: Product
  onAdjustStock: (variantId: string, stock: number) => void
}) {
  const [expanded, setExpanded] = useState(false)

  if (product.variants.length === 0) return null

  const sizes = [...new Set(product.variants.map((v) => v.size).filter(Boolean))] as string[]
  const colours = [...new Set(product.variants.map((v) => v.colour).filter(Boolean))] as string[]

  const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0)
  const lowStockCount = product.variants.filter(
    (v) => v.stock > 0 && v.stock <= v.low_stock_threshold,
  ).length
  const outOfStockCount = product.variants.filter((v) => v.stock === 0).length

  return (
    <div data-eos-id="src/pages/admin/merch/products-tab.tsx#63" className="mt-2 -mx-0.5">
      {/* Toggle bar */}
      <button data-eos-id="src/pages/admin/merch/products-tab.tsx#64"
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between min-h-[40px] px-2.5 py-1.5 bg-white/60 rounded-sm text-[11px] cursor-pointer hover:bg-white/80 active:bg-white transition-colors"
      >
        <div data-eos-id="src/pages/admin/merch/products-tab.tsx#65" className="flex items-center gap-1.5 min-w-0 flex-wrap">
          {/* Compact pills for sizes/colours */}
          {sizes.length > 0 && (
            <div data-eos-id="src/pages/admin/merch/products-tab.tsx#66" className="flex items-center gap-0.5">
              {sizes.map((s) => (
                <span data-eos-id="src/pages/admin/merch/products-tab.tsx#67" key={s} className="px-1.5 py-px bg-info-50 text-info-700 rounded font-medium leading-snug">{s}</span>
              ))}
            </div>
          )}
          {sizes.length > 0 && colours.length > 0 && (
            <span data-eos-id="src/pages/admin/merch/products-tab.tsx#68" className="text-neutral-200">|</span>
          )}
          {colours.length > 0 && (
            <div data-eos-id="src/pages/admin/merch/products-tab.tsx#69" className="flex items-center gap-0.5">
              {colours.map((c) => (
                <span data-eos-id="src/pages/admin/merch/products-tab.tsx#70" key={c} className="px-1.5 py-px bg-plum-50 text-plum-700 rounded font-medium leading-snug">{c}</span>
              ))}
            </div>
          )}
        </div>
        <div data-eos-id="src/pages/admin/merch/products-tab.tsx#71" className="flex items-center gap-1 shrink-0 ml-1.5">
          <span data-eos-id="src/pages/admin/merch/products-tab.tsx#72" className="tabular-nums text-neutral-600 font-bold">{totalStock}</span>
          {lowStockCount > 0 && (
            <span data-eos-id="src/pages/admin/merch/products-tab.tsx#73" className="w-2 h-2 rounded-full bg-warning-400" title={`${lowStockCount} low stock`} />
          )}
          {outOfStockCount > 0 && (
            <span data-eos-id="src/pages/admin/merch/products-tab.tsx#74" className="w-2 h-2 rounded-full bg-error-400" title={`${outOfStockCount} out of stock`} />
          )}
          <ChevronDown data-eos-id="src/pages/admin/merch/products-tab.tsx#75"
            size={13}
            className={cn(
              'text-neutral-400 transition-transform duration-200',
              expanded && 'rotate-180',
            )}
          />
        </div>
      </button>

      {/* Expandable variant rows - pure CSS, no JS layout */}
      <div data-eos-id="src/pages/admin/merch/products-tab.tsx#76"
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div data-eos-id="src/pages/admin/merch/products-tab.tsx#77" className="overflow-hidden">
          <div data-eos-id="src/pages/admin/merch/products-tab.tsx#78" className="pt-1 space-y-px">
            {product.variants.map((v) => {
              const stockState = v.stock === 0
                ? 'out'
                : v.stock <= v.low_stock_threshold
                  ? 'low'
                  : 'ok'

              return (
                <div data-eos-id="src/pages/admin/merch/products-tab.tsx#79"
                  key={v.id}
                  className="flex items-center min-h-[44px] px-2.5 rounded-sm hover:bg-white/60 active:bg-white/80 transition-colors"
                >
                  {/* Label */}
                  <div data-eos-id="src/pages/admin/merch/products-tab.tsx#80" className="flex-1 min-w-0 flex items-center gap-1.5">
                    <span data-eos-id="src/pages/admin/merch/products-tab.tsx#81" className="text-xs text-neutral-900 font-medium truncate">{variantLabel(v)}</span>
                    <span data-eos-id="src/pages/admin/merch/products-tab.tsx#82" data-eos-var="v.sku" data-eos-var-label="Sku" data-eos-var-scope="item" className="text-[10px] text-neutral-300 font-mono truncate hidden sm:inline">{v.sku}</span>
                  </div>

                  {/* Price - desktop only */}
                  <span data-eos-id="src/pages/admin/merch/products-tab.tsx#83" data-eos-var="v.price_cents" data-eos-var-label="Price cents" data-eos-var-scope="item" className="text-[11px] text-neutral-400 tabular-nums mr-2 hidden sm:block">
                    {formatPrice(v.price_cents)}
                  </span>

                  {/* Stock indicator */}
                  <span data-eos-id="src/pages/admin/merch/products-tab.tsx#84" data-eos-var="v.stock" data-eos-var-label="Stock" data-eos-var-scope="item"
                    className={cn(
                      'text-xs tabular-nums font-semibold min-w-[32px] text-center px-1.5 py-0.5 rounded',
                      stockState === 'out' && 'bg-error-50 text-error-600',
                      stockState === 'low' && 'bg-warning-50 text-warning-600',
                      stockState === 'ok' && 'text-neutral-500',
                    )}
                  >
                    {v.stock}
                  </span>

                  {/* Adjust button - full touch target */}
                  <button data-eos-id="src/pages/admin/merch/products-tab.tsx#85"
                    type="button"
                    onClick={() => onAdjustStock(v.id, v.stock)}
                    className="ml-1 min-h-[44px] px-3 text-[11px] font-semibold text-neutral-500 hover:text-neutral-700 active:bg-neutral-100 cursor-pointer rounded-sm transition-colors"
                  >
                    Adjust
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Stock adjustment sheet                                             */
/* ------------------------------------------------------------------ */

function StockAdjustSheet({
  open,
  onClose,
  productId,
  variantId,
  currentStock,
}: {
  open: boolean
  onClose: () => void
  productId: string
  variantId: string
  currentStock: number
}) {
  const { toast } = useToast()
  const adjustStock = useAdjustStock()
  const [adjustment, setAdjustment] = useState('')
  const [reason, setReason] = useState('')

  const handleSave = useCallback(async () => {
    const adj = Number(adjustment)
    if (isNaN(adj) || adj === 0 || !reason.trim()) return
    try {
      await adjustStock.mutateAsync({ productId, variantKey: variantId, adjustment: adj })
      toast.success(`Stock adjusted by ${adj > 0 ? '+' : ''}${adj}`)
      onClose()
    } catch {
      toast.error('Failed to adjust stock')
    }
  }, [productId, variantId, adjustment, reason, adjustStock, toast, onClose])

  return (
    <BottomSheet data-eos-id="src/pages/admin/merch/products-tab.tsx#86" open={open} onClose={onClose}>
      <div data-eos-id="src/pages/admin/merch/products-tab.tsx#87" className="space-y-4">
        <h3 data-eos-id="src/pages/admin/merch/products-tab.tsx#88" className="font-heading font-semibold text-base text-neutral-900">Adjust stock</h3>
        <p data-eos-id="src/pages/admin/merch/products-tab.tsx#89" className="text-sm text-neutral-400">Current stock: <span data-eos-id="src/pages/admin/merch/products-tab.tsx#90" className="font-semibold text-neutral-600 tabular-nums">{currentStock}</span></p>
        <Input data-eos-id="src/pages/admin/merch/products-tab.tsx#91"
          label="Adjustment (+/-)"
          value={adjustment}
          onChange={(e) => setAdjustment(e.target.value)}
          helperText="Positive to add, negative to remove"
          required
        />
        <Input data-eos-id="src/pages/admin/merch/products-tab.tsx#92"
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
        />
        <Button data-eos-id="src/pages/admin/merch/products-tab.tsx#93" variant="primary" fullWidth loading={adjustStock.isPending} onClick={handleSave}>
          Adjust stock
        </Button>
      </div>
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Products tab                                                       */
/* ------------------------------------------------------------------ */

const STATUS_DOT: Record<ProductStatus, string> = {
  active: 'bg-success-500',
  draft: 'bg-warning-400',
  archived: 'bg-primary-300',
}

export default function ProductsTab() {
  const { data: products, isLoading } = useAdminProducts()
  const showLoading = useDelayedLoading(isLoading)
  const updateProduct = useUpdateProduct()
  const { toast } = useToast()
  const [formOpen, setFormOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | undefined>()
  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null)
  const [stockTarget, setStockTarget] = useState<{ productId: string; variantId: string; stock: number } | null>(null)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const shouldReduceMotion = useReducedMotion()

  const archivedCount = useMemo(() => products?.filter((p) => p.status === 'archived').length ?? 0, [products])

  const filteredProducts = useMemo(() => {
    if (!products) return []
    let list = products
    if (!showArchived) list = list.filter((p) => p.status !== 'archived')
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          (p.category ?? '').toLowerCase().includes(q),
      )
    }
    return list
  }, [products, search, showArchived])

  const handleArchive = useCallback(async () => {
    if (!archiveTarget) return
    try {
      await updateProduct.mutateAsync({ id: archiveTarget.id, status: 'archived' })
      toast.success('Product archived')
    } catch {
      toast.error('Failed to archive product')
    }
    setArchiveTarget(null)
  }, [archiveTarget, updateProduct, toast])

  if (showLoading) {
    return (
      <div data-eos-id="src/pages/admin/merch/products-tab.tsx#94" className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton data-eos-id="src/pages/admin/merch/products-tab.tsx#95" key={i} variant="list-item" />
        ))}
      </div>
    )
  }
  const { stagger, fadeUp } = adminVariants(!!shouldReduceMotion)

  return (
    <motion.div data-eos-id="src/pages/admin/merch/products-tab.tsx#96" variants={stagger} initial="hidden" animate="visible">
      {/* Search + Add */}
      <motion.div data-eos-id="src/pages/admin/merch/products-tab.tsx#97" variants={fadeUp} className="flex items-center gap-2 mb-2">
        <SearchBar data-eos-id="src/pages/admin/merch/products-tab.tsx#98"
          value={search}
          onChange={setSearch}
          placeholder="Search products..."
          compact
          className="flex-1"
        />
        <Button data-eos-id="src/pages/admin/merch/products-tab.tsx#99"
          variant="primary"
          size="sm"
          icon={<Plus data-eos-id="src/pages/admin/merch/products-tab.tsx#100" size={15} />}
          onClick={() => {
            setEditProduct(undefined)
            setFormOpen(true)
          }}
          aria-label="Add product"
        >
          <span data-eos-id="src/pages/admin/merch/products-tab.tsx#101" className="hidden sm:inline">Add</span>
        </Button>
      </motion.div>

      {/* Filters row */}
      <motion.div data-eos-id="src/pages/admin/merch/products-tab.tsx#102" variants={fadeUp} className="flex items-center justify-between mb-2.5">
        <p data-eos-id="src/pages/admin/merch/products-tab.tsx#103" className="text-[11px] text-neutral-400 tabular-nums">
          {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
          {search && ` of ${products?.length ?? 0}`}
        </p>
        {archivedCount > 0 && (
          <button data-eos-id="src/pages/admin/merch/products-tab.tsx#104"
            type="button"
            onClick={() => setShowArchived((p) => !p)}
            className="min-h-[32px] px-2 text-[11px] font-medium text-neutral-400 hover:text-neutral-600 active:bg-neutral-50 cursor-pointer rounded-md transition-colors"
          >
            {showArchived ? 'Hide' : 'Show'} {archivedCount} archived
          </button>
        )}
      </motion.div>

      {/* Product list */}
      <motion.div data-eos-id="src/pages/admin/merch/products-tab.tsx#105" variants={fadeUp}>
        {filteredProducts.length === 0 ? (
          <EmptyState data-eos-id="src/pages/admin/merch/products-tab.tsx#106"
            illustration="empty"
            title={search ? 'No matches' : 'No products yet'}
            description={search ? 'Try a different search' : 'Add your first merch product'}
          />
        ) : (
          <div data-eos-id="src/pages/admin/merch/products-tab.tsx#107" className="space-y-1.5">
            {filteredProducts.map((product) => (
              <div data-eos-id="src/pages/admin/merch/products-tab.tsx#108"
                key={product.id}
                className={cn(
                  'rounded-sm bg-surface-1 border border-neutral-100 overflow-hidden',
                  product.status === 'archived' && 'opacity-60',
                )}
              >
                {/* Main row - tappable to edit */}
                <div data-eos-id="src/pages/admin/merch/products-tab.tsx#109" className="flex items-center gap-2.5 p-2.5 sm:p-3">
                  {/* Thumbnail */}
                  <img data-eos-id="src/pages/admin/merch/products-tab.tsx#110"
                    src={product.images[0] ?? '/img/placeholder-merch.jpg'}
                    alt={product.name}
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-sm object-cover shrink-0"
                  />

                  {/* Info */}
                  <div data-eos-id="src/pages/admin/merch/products-tab.tsx#111" className="flex-1 min-w-0">
                    <div data-eos-id="src/pages/admin/merch/products-tab.tsx#112" className="flex items-start gap-1.5">
                      <span data-eos-id="src/pages/admin/merch/products-tab.tsx#113" className={cn('w-1.5 h-1.5 rounded-full shrink-0 mt-1.5', STATUS_DOT[product.status])} />
                      {/* Allow up to 2 lines + smaller font on tight widths so
                          the full product name stays visible instead of truncating. */}
                      <h3 data-eos-id="src/pages/admin/merch/products-tab.tsx#114" data-eos-var="product.name" data-eos-var-label="Name" data-eos-var-scope="item" className="text-[13px] sm:text-sm font-semibold text-neutral-900 leading-tight break-words line-clamp-2">
                        {product.name}
                      </h3>
                    </div>
                    <div data-eos-id="src/pages/admin/merch/products-tab.tsx#115" className="flex items-center gap-2 mt-0.5">
                      <span data-eos-id="src/pages/admin/merch/products-tab.tsx#116" data-eos-var="product.base_price_cents" data-eos-var-label="Base price cents" data-eos-var-scope="item" className="text-sm font-bold text-neutral-700 tabular-nums">
                        {formatPrice(product.base_price_cents)}
                      </span>
                      <span data-eos-id="src/pages/admin/merch/products-tab.tsx#117" className="text-[11px] text-neutral-400">
                        {product.variants.length} var{product.variants.length !== 1 ? 's' : ''}
                      </span>
                      {product.category && (
                        <span data-eos-id="src/pages/admin/merch/products-tab.tsx#118" data-eos-var="product.category" data-eos-var-label="Category" data-eos-var-scope="item" className="px-1.5 py-px bg-neutral-100 rounded text-[10px] font-medium text-neutral-500 hidden sm:inline">
                          {product.category}
                        </span>
                      )}
                    </div>

                    {product.variants.some((v) => v.stock > 0 && v.stock <= v.low_stock_threshold) && (
                      <div data-eos-id="src/pages/admin/merch/products-tab.tsx#119" className="flex items-center gap-1 mt-0.5 text-warning-600">
                        <AlertTriangle data-eos-id="src/pages/admin/merch/products-tab.tsx#120" size={10} />
                        <span data-eos-id="src/pages/admin/merch/products-tab.tsx#121" className="text-[10px] font-semibold">Low stock</span>
                      </div>
                    )}
                  </div>

                  {/* Quick actions - icon buttons */}
                  <div data-eos-id="src/pages/admin/merch/products-tab.tsx#122" className="flex items-center gap-0.5 shrink-0">
                    <button data-eos-id="src/pages/admin/merch/products-tab.tsx#123"
                      type="button"
                      onClick={() => {
                        setEditProduct(product)
                        setFormOpen(true)
                      }}
                      className="w-10 h-10 flex items-center justify-center rounded-sm text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 active:bg-neutral-100 cursor-pointer transition-colors"
                      aria-label={`Edit ${product.name}`}
                    >
                      <Edit3 data-eos-id="src/pages/admin/merch/products-tab.tsx#124" size={15} />
                    </button>
                    {product.status !== 'archived' && (
                      <button data-eos-id="src/pages/admin/merch/products-tab.tsx#125"
                        type="button"
                        onClick={() => setArchiveTarget(product)}
                        className="w-10 h-10 flex items-center justify-center rounded-sm text-neutral-300 hover:text-neutral-600 hover:bg-neutral-100 active:bg-neutral-100 cursor-pointer transition-colors"
                        aria-label={`Archive ${product.name}`}
                      >
                        <Archive data-eos-id="src/pages/admin/merch/products-tab.tsx#126" size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Variant expand section */}
                {product.variants.length > 0 && (
                  <div data-eos-id="src/pages/admin/merch/products-tab.tsx#127" className="px-2.5 pb-2 sm:px-3 sm:pb-2.5">
                    <VariantSummary data-eos-id="src/pages/admin/merch/products-tab.tsx#128"
                      product={product}
                      onAdjustStock={(variantId, stock) => setStockTarget({ productId: product.id, variantId, stock })}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </motion.div>

      <ProductFormSheet data-eos-id="src/pages/admin/merch/products-tab.tsx#129"
        open={formOpen}
        onClose={() => setFormOpen(false)}
        product={editProduct}
      />

      <ConfirmationSheet data-eos-id="src/pages/admin/merch/products-tab.tsx#130"
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={handleArchive}
        title="Archive product?"
        description={`"${archiveTarget?.name}" will be hidden from the store.`}
        confirmLabel="Archive"
        variant="warning"
      />

      {stockTarget && (
        <StockAdjustSheet data-eos-id="src/pages/admin/merch/products-tab.tsx#131"
          open
          onClose={() => setStockTarget(null)}
          productId={stockTarget.productId}
          variantId={stockTarget.variantId}
          currentStock={stockTarget.stock}
        />
      )}
    </motion.div>
  )
}
