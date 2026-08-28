import { useCallback, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  HeartHandshake,
  Sprout,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Phone,
  Link as LinkIcon,
} from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { AdminHeroStat, AdminHeroStatRow } from '@/components/admin-hero-stat'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Dropdown } from '@/components/dropdown'
import { BottomSheet } from '@/components/bottom-sheet'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { TabBar } from '@/components/tab-bar'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { useToast } from '@/components/toast'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useCategoryImages } from '@/hooks/use-good'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'

/* ------------------------------------------------------------------ */
/*  Surface definitions                                                */
/* ------------------------------------------------------------------ */
/*  Both surfaces are the same shape of work (a published, ordered,     */
/*  image-backed list) so they share one editor and differ only in      */
/*  their table, their categories and their fields.                     */

type FieldKind = 'text' | 'textarea' | 'select' | 'toggle' | 'number'

interface FieldDef {
  key: string
  label: string
  kind: FieldKind
  placeholder?: string
  options?: { value: string; label: string }[]
  helper?: string
}

interface SurfaceDef {
  id: 'feel_good' | 'do_good'
  label: string
  table: string
  queryKey: string
  icon: typeof HeartHandshake
  /** Line shown under the name in the admin list. */
  subtitle: (row: Row) => string
  fields: FieldDef[]
  blank: Row
}

type Row = Record<string, unknown>

const FEEL_GOOD_CATEGORIES = [
  { value: 'crisis', label: 'Crisis support' },
  { value: 'counselling', label: 'Counselling' },
  { value: 'youth', label: 'For young people' },
  { value: 'identity', label: 'LGBTIQ+' },
  { value: 'first_nations', label: 'First Nations' },
  { value: 'family', label: 'Family and safety' },
  { value: 'general', label: 'General' },
]

const DO_GOOD_CATEGORIES = [
  { value: 'conservation', label: 'Land' },
  { value: 'wildlife', label: 'Wildlife' },
  { value: 'marine', label: 'Ocean' },
  { value: 'climate', label: 'Climate' },
  { value: 'community', label: 'Community' },
  { value: 'first_nations', label: 'First Nations' },
  { value: 'youth', label: 'Youth' },
]

const SURFACES: SurfaceDef[] = [
  {
    id: 'feel_good',
    label: 'Feel Good',
    table: 'support_resources',
    queryKey: 'admin-support-resources',
    icon: HeartHandshake,
    subtitle: (r) => [r.phone, r.hours].filter(Boolean).join('  .  ') || String(r.tagline ?? ''),
    fields: [
      { key: 'name', label: 'Service name', kind: 'text', placeholder: 'Lifeline' },
      { key: 'tagline', label: 'One line about it', kind: 'textarea', placeholder: 'Someone to talk to, any hour of any day.' },
      {
        key: 'phone',
        label: 'Phone number',
        kind: 'text',
        placeholder: '13 11 14',
        helper: 'Type it the way it should READ. The app strips the spaces to dial it, so the shown and dialled number can never drift apart.',
      },
      { key: 'phone_note', label: 'Note under the number', kind: 'text', placeholder: 'Free from any phone' },
      { key: 'sms_number', label: 'Text number', kind: 'text', placeholder: '0477 13 11 14' },
      { key: 'hours', label: 'When they answer', kind: 'text', placeholder: '24 hours, 7 days' },
      { key: 'url', label: 'Website', kind: 'text', placeholder: 'lifeline.org.au' },
      { key: 'category', label: 'Category', kind: 'select', options: FEEL_GOOD_CATEGORIES },
      {
        key: 'is_crisis',
        label: 'Crisis line',
        kind: 'toggle',
        helper: 'Crisis lines pin to the top of the page, above everything else.',
      },
      { key: 'sort_order', label: 'Order', kind: 'number' },
      { key: 'is_published', label: 'Visible in the app', kind: 'toggle' },
    ],
    blank: {
      name: '', tagline: '', phone: '', phone_note: '', sms_number: '', hours: '', url: '',
      category: 'general', is_crisis: false, sort_order: 100, is_published: true, image_url: null,
    },
  },
  {
    id: 'do_good',
    label: 'Do Good',
    table: 'do_good_organisations',
    queryKey: 'admin-do-good-organisations',
    icon: Sprout,
    subtitle: (r) => String(r.opportunity ?? r.blurb ?? ''),
    fields: [
      { key: 'name', label: 'Organisation', kind: 'text', placeholder: 'Tangaroa Blue Foundation' },
      {
        key: 'opportunity',
        label: 'What someone can DO',
        kind: 'textarea',
        placeholder: 'Join a beach clean-up and log what you find into the national database.',
        helper: 'This is the headline on the card. Write the action, not the mission statement.',
      },
      { key: 'blurb', label: 'About the organisation', kind: 'textarea', placeholder: 'Runs the Australian Marine Debris Initiative.' },
      { key: 'url', label: 'Link', kind: 'text', placeholder: 'tangaroablue.org/get-involved/' },
      { key: 'logo_url', label: 'Logo URL', kind: 'text', placeholder: 'https://...' },
      { key: 'category', label: 'Category', kind: 'select', options: DO_GOOD_CATEGORIES },
      { key: 'location', label: 'Where', kind: 'text', placeholder: 'Sunshine Coast, QLD' },
      { key: 'sort_order', label: 'Order', kind: 'number' },
      { key: 'is_published', label: 'Visible in the app', kind: 'toggle' },
    ],
    blank: {
      name: '', opportunity: '', blurb: '', url: '', logo_url: '',
      category: 'conservation', location: '', sort_order: 100, is_published: true, image_url: null,
    },
  },
]

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

function useSurfaceRows(surface: SurfaceDef) {
  return useQuery({
    queryKey: [surface.queryKey],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from(surface.table)
        .select('*')
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as Row[]
    },
    staleTime: 60 * 1000,
  })
}

/* ------------------------------------------------------------------ */
/*  Cover image picker                                                 */
/* ------------------------------------------------------------------ */

/** Uploads into the public `app-images` bucket under good-pages/<surface>/ and
 *  hands back the public URL. Same bucket the announcement composer uses, so no
 *  new bucket or policy is introduced for this feature. */
function CoverPicker({
  surfaceId,
  value,
  onChange,
}: {
  surfaceId: string
  value: string | null
  onChange: (url: string | null) => void
}) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const pick = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('That file is not an image'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Images need to be under 5MB'); return }
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `good-pages/${surfaceId}/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from('app-images').upload(path, file, {
        cacheControl: '31536000',
        upsert: false,
      })
      if (error) throw error
      const { data } = supabase.storage.from('app-images').getPublicUrl(path)
      onChange(data.publicUrl)
      toast.success('Cover image set')
    } catch {
      toast.error('Upload failed. Try again.')
    } finally {
      setUploading(false)
    }
  }, [surfaceId, onChange, toast])

  return (
    <div>
      <p className="text-[12px] font-semibold text-neutral-700 mb-1.5">Cover image</p>
      <div
        className={cn(
          'relative h-36 w-full overflow-hidden rounded-md bg-neutral-100',
          'flex items-center justify-center',
        )}
      >
        {value ? (
          <img src={value} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <p className="text-[12px] text-neutral-400 px-6 text-center">
            No cover yet. The card falls back to its category image.
          </p>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 size={20} className="animate-spin text-white" />
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          <ImagePlus size={14} />
          {value ? 'Replace' : 'Upload'}
        </Button>
        {value && (
          <Button variant="ghost" size="sm" onClick={() => onChange(null)} disabled={uploading}>
            Remove
          </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = '' }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Editor sheet                                                       */
/* ------------------------------------------------------------------ */

function EditorSheet({
  surface,
  open,
  row,
  onClose,
  onSave,
  saving,
}: {
  surface: SurfaceDef
  open: boolean
  row: Row | null
  onClose: () => void
  onSave: (values: Row) => void
  saving: boolean
}) {
  const [values, setValues] = useState<Row>(row ?? surface.blank)
  const [dirtyKey, setDirtyKey] = useState(0)

  // Re-seed the form whenever a different row is opened.
  const seed = row ? String(row.id) : `new-${surface.id}`
  const [seenSeed, setSeenSeed] = useState(seed)
  if (seed !== seenSeed) {
    setSeenSeed(seed)
    setValues(row ?? surface.blank)
    setDirtyKey((k) => k + 1)
  }

  const set = (k: string, v: unknown) => setValues((p) => ({ ...p, [k]: v }))

  return (
    <BottomSheet open={open} onClose={onClose}>
      {/* The editor carries up to eleven fields plus a cover picker, which is
          taller than the sheet on a phone. Measured 2026-08-28: the Save button
          landed at y=1282 in a 900px viewport and nothing scrolled to it, so
          the form could be filled and never submitted. The fields scroll in
          their own box and the actions are pinned, so Save is always on screen. */}
      <div className="flex max-h-[72vh] flex-col" key={dirtyKey}>
        <h2 className="shrink-0 px-5 pb-3 font-heading text-lg font-bold text-neutral-900">
          {row ? 'Edit' : `Add to ${surface.label}`}
        </h2>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4">

        <CoverPicker
          surfaceId={surface.id}
          value={(values.image_url as string | null) ?? null}
          onChange={(url) => set('image_url', url)}
        />

        {surface.fields.map((f) => {
          if (f.kind === 'toggle') {
            const on = !!values[f.key]
            return (
              <div key={f.key}>
                <button
                  type="button"
                  onClick={() => set(f.key, !on)}
                  className="flex w-full items-center justify-between rounded-md bg-neutral-50 px-4 py-3"
                >
                  <span className="text-[13px] font-semibold text-neutral-800">{f.label}</span>
                  <span
                    className={cn(
                      'relative h-6 w-11 rounded-full transition-colors',
                      on ? 'bg-sprout-500' : 'bg-neutral-300',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                        on ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
                      )}
                    />
                  </span>
                </button>
                {f.helper && <p className="text-[11px] text-neutral-400 mt-1 px-1">{f.helper}</p>}
              </div>
            )
          }
          if (f.kind === 'select') {
            return (
              <Dropdown
                key={f.key}
                label={f.label}
                options={f.options ?? []}
                value={String(values[f.key] ?? '')}
                onChange={(v) => set(f.key, v)}
              />
            )
          }
          return (
            <Input
              key={f.key}
              label={f.label}
              type={f.kind === 'textarea' ? 'textarea' : f.kind === 'number' ? 'number' : 'text'}
              value={String(values[f.key] ?? '')}
              placeholder={f.placeholder}
              helperText={f.helper}
              onChange={(e) =>
                set(f.key, f.kind === 'number' ? Number(e.target.value || 0) : e.target.value)
              }
            />
          )
        })}

        </div>

        <div className="shrink-0 flex gap-2 border-t border-neutral-100 bg-white px-5 pb-6 pt-3">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            onClick={() => onSave(values)}
            disabled={saving || !String(values.name ?? '').trim()}
            className="flex-1"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            {row ? 'Save' : 'Add'}
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminGoodPage() {
  const [activeTab, setActiveTab] = useState<'feel_good' | 'do_good'>('feel_good')
  const surface = SURFACES.find((s) => s.id === activeTab)!
  const [editing, setEditing] = useState<Row | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null)

  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data: rows, isLoading } = useSurfaceRows(surface)
  const { data: categoryCovers } = useCategoryImages()
  const showLoading = useDelayedLoading(isLoading)

  const feelGood = useSurfaceRows(SURFACES[0])
  const doGood = useSurfaceRows(SURFACES[1])

  const heroStats = useMemo(() => (
    <AdminHeroStatRow>
      <AdminHeroStat value={feelGood.data?.length ?? 0} label="Support lines" icon={<HeartHandshake size={18} />} color="plum" delay={0} reducedMotion={false} />
      <AdminHeroStat value={doGood.data?.length ?? 0} label="Organisations" icon={<Sprout size={18} />} color="sprout" delay={1} reducedMotion={false} />
    </AdminHeroStatRow>
  ), [feelGood.data?.length, doGood.data?.length])

  useAdminHeader('Feel Good & Do Good', { heroContent: heroStats })

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [surface.queryKey] })
    // The public pages read their own keys, so refresh those too or a staff
    // member sees a stale app immediately after editing.
    queryClient.invalidateQueries({ queryKey: ['support-resources'] })
    queryClient.invalidateQueries({ queryKey: ['do-good-organisations'] })
  }, [queryClient, surface.queryKey])

  const save = useMutation({
    mutationFn: async (values: Row) => {
      const payload: Row = { ...values }
      delete payload.id
      delete payload.created_at
      delete payload.updated_at
      // Empty strings are stored as NULL so the client's "is it set" checks are
      // a single null test rather than null-or-empty everywhere.
      for (const k of Object.keys(payload)) {
        if (payload[k] === '') payload[k] = null
      }
      if (values.id) {
        const { error } = await supabase.from(surface.table).update(payload).eq('id', values.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from(surface.table).insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success('Saved')
      setSheetOpen(false)
      setEditing(null)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save'),
  })

  const togglePublished = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await supabase
        .from(surface.table)
        .update({ is_published: !row.is_published })
        .eq('id', row.id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: () => toast.error('Could not change visibility'),
  })

  const remove = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await supabase.from(surface.table).delete().eq('id', row.id)
      if (error) throw error
    },
    onSuccess: () => { toast.success('Removed'); setDeleteTarget(null); invalidate() },
    onError: () => toast.error('Could not remove'),
  })

  return (
    <div className="pb-16">
      <TabBar
        tabs={SURFACES.map((s) => ({
          id: s.id,
          label: s.label,
          icon: <s.icon size={14} />,
        }))}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as 'feel_good' | 'do_good')}
      />

      <div className="px-4 pt-4">
        <Button
          onClick={() => { setEditing(null); setSheetOpen(true) }}
          className="w-full mb-4"
        >
          <Plus size={15} />
          Add to {surface.label}
        </Button>

        {showLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[76px] w-full rounded-md" />
            ))}
          </div>
        ) : !rows?.length ? (
          <EmptyState
            illustration="empty"
            title={`Nothing in ${surface.label} yet`}
            description="Add the first entry and it appears in the app straight away."
          />
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={String(row.id)}
                className={cn(
                  'flex items-center gap-2.5 rounded-md bg-white p-3 shadow-sm',
                  !row.is_published && 'opacity-60',
                )}
              >
                <div className="h-[52px] w-[52px] shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                  {(row.image_url || categoryCovers?.[`${surface.id}:${row.category}`]) ? (
                    <img
                      src={String(row.image_url || categoryCovers?.[`${surface.id}:${row.category}`])}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <surface.icon size={18} className="text-neutral-300" />
                    </div>
                  )}
                </div>

                {/* The NAME wraps, the meta line truncates.
                    Measured on the deployed page at 390px: a thumbnail, three
                    action buttons and a Crisis chip left the text column about
                    150px, so `truncate` cut every longer service to "Kids
                    Helplin..." and "Suicide Call ...". A staff member cannot
                    pick a row they cannot read, and the name is the only field
                    that identifies it, so the name gets two lines and the
                    number underneath keeps the single clipped line. */}
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold leading-snug text-neutral-900">
                    <span className="line-clamp-2">{String(row.name)}</span>
                    {surface.id === 'feel_good' && row.is_crisis ? (
                      <span className="mt-0.5 inline-block rounded-full bg-coral-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-coral-600">
                        Crisis
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-neutral-500">
                    {surface.id === 'feel_good' ? <Phone size={10} className="shrink-0" /> : <LinkIcon size={10} className="shrink-0" />}
                    <span className="truncate">{surface.subtitle(row)}</span>
                  </p>
                </div>

                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => togglePublished.mutate(row)}
                    aria-label={row.is_published ? 'Hide from the app' : 'Show in the app'}
                    className="flex h-9 w-8 items-center justify-center rounded-full text-neutral-400 hover:text-neutral-700"
                  >
                    {row.is_published ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditing(row); setSheetOpen(true) }}
                    aria-label="Edit"
                    className="flex h-9 w-8 items-center justify-center rounded-full text-neutral-400 hover:text-neutral-700"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(row)}
                    aria-label="Remove"
                    className="flex h-9 w-8 items-center justify-center rounded-full text-neutral-400 hover:text-error-600"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <EditorSheet
        surface={surface}
        open={sheetOpen}
        row={editing}
        onClose={() => { setSheetOpen(false); setEditing(null) }}
        onSave={(v) => save.mutate(v)}
        saving={save.isPending}
      />

      <ConfirmationSheet
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget)}
        title={`Remove ${String(deleteTarget?.name ?? '')}?`}
        description="It disappears from the app immediately. To take it down temporarily, use the eye icon instead."
        confirmLabel="Remove"
        variant="danger"
      />
    </div>
  )
}
