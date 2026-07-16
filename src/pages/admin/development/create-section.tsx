import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import {
  Layers, Save, Send, Plus, Trash2, GripVertical, Clock, Check, Users,
} from 'lucide-react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAdminHeader } from '@/components/admin-layout'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Dropdown } from '@/components/dropdown'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { useAuth } from '@/hooks/use-auth'
import { AudiencePicker } from '@/components/development/audience-picker'
import { SaveSuccessBanner } from '@/components/development/save-success-banner'
import {
  useCreateSection, useSaveSectionModules, useDevModules, useDevSections,
  type DevCategory, type DevModule,
} from '@/hooks/use-admin-development'

const CATEGORY_OPTIONS = [
  { value: 'learning', label: 'Learning' },
  { value: 'leadership_development', label: 'Leadership Development' },
  { value: 'onboarding', label: 'Onboarding' },
]

interface ModuleItem { _key: string; module: DevModule; is_required: boolean }

function SortableModuleItem({ item, onToggleRequired, onRemove }: { item: ModuleItem; onToggleRequired: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item._key })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <motion.div data-eos-id="src/pages/admin/development/create-section.tsx#0" data-eos-v="2"
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, x: -20 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'group flex items-center gap-3 rounded-md p-3.5 transition-colors duration-200',
        isDragging
          ? 'bg-white shadow-sm ring-2 ring-neutral-300/50 z-10 scale-[1.02]'
          : 'bg-white shadow-sm',
      )}
    >
      <button data-eos-id="src/pages/admin/development/create-section.tsx#1" type="button" className="cursor-grab touch-none text-neutral-300 hover:text-neutral-500 active:cursor-grabbing transition-colors" {...attributes} {...listeners}>
        <GripVertical data-eos-id="src/pages/admin/development/create-section.tsx#2" size={18} />
      </button>
      <div data-eos-id="src/pages/admin/development/create-section.tsx#3" className="flex-1 min-w-0">
        <p data-eos-id="src/pages/admin/development/create-section.tsx#4" data-eos-var="item.module.title" data-eos-var-label="Title" data-eos-var-scope="prop" className="text-[13px] font-bold text-neutral-900 truncate">{item.module.title}</p>
        <div data-eos-id="src/pages/admin/development/create-section.tsx#5" className="flex items-center gap-2 mt-0.5">
          <span data-eos-id="src/pages/admin/development/create-section.tsx#6" data-eos-var="item.module.category" data-eos-var-label="Category" data-eos-var-scope="prop" className="text-[11px] text-secondary-600 font-medium capitalize">{item.module.category.replace('_', ' ')}</span>
          <span data-eos-id="src/pages/admin/development/create-section.tsx#7" data-eos-var="item.module.estimated_minutes" data-eos-var-label="Estimated minutes" data-eos-var-scope="prop" className="flex items-center gap-0.5 text-[11px] text-neutral-400"><Clock data-eos-id="src/pages/admin/development/create-section.tsx#8" size={10} />{item.module.estimated_minutes}m</span>
        </div>
      </div>
      <motion.button data-eos-id="src/pages/admin/development/create-section.tsx#9" data-eos-var="item.is_required" data-eos-var-label="Is required" data-eos-var-scope="prop"
        type="button"
        onClick={onToggleRequired}
        whileTap={{ scale: 0.93 }}
        className={cn(
          'inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-[11px] font-bold transition-colors duration-200',
          item.is_required ? 'bg-moss-100 text-moss-700' : 'bg-neutral-50 text-neutral-400',
        )}
      >
        <AnimatePresence data-eos-id="src/pages/admin/development/create-section.tsx#10" mode="wait">
          {item.is_required && (
            <motion.span data-eos-id="src/pages/admin/development/create-section.tsx#11" key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.15 }}>
              <Check data-eos-id="src/pages/admin/development/create-section.tsx#12" size={10} />
            </motion.span>
          )}
        </AnimatePresence>
        {item.is_required ? 'Required' : 'Optional'}
      </motion.button>
      <motion.button data-eos-id="src/pages/admin/development/create-section.tsx#13"
        type="button"
        onClick={onRemove}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className="flex items-center justify-center w-9 h-9 rounded-sm text-error-400 hover:text-error-600 hover:bg-error-50 transition-colors"
      >
        <Trash2 data-eos-id="src/pages/admin/development/create-section.tsx#14" size={16} />
      </motion.button>
    </motion.div>
  )
}

function ModulePicker({ modules, selectedIds, onSelect }: { modules: DevModule[]; selectedIds: Set<string>; onSelect: (module: DevModule) => void }) {
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return modules.filter((m) => m.status === 'published').filter((m) => !selectedIds.has(m.id)).filter((m) => !q || m.title.toLowerCase().includes(q))
  }, [modules, selectedIds, search])

  return (
    <div data-eos-id="src/pages/admin/development/create-section.tsx#15" className="space-y-3">
      <Input data-eos-id="src/pages/admin/development/create-section.tsx#16" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search published modules..." className="text-sm" />
      {filtered.length === 0 ? (
        <p data-eos-id="src/pages/admin/development/create-section.tsx#17" className="text-[11px] text-neutral-400 text-center py-4">{search ? 'No matching modules' : 'All published modules are already added'}</p>
      ) : (
        <div data-eos-id="src/pages/admin/development/create-section.tsx#18" className="max-h-60 overflow-y-auto space-y-1.5">
          {filtered.map((m) => (
            <motion.button data-eos-id="src/pages/admin/development/create-section.tsx#19" key={m.id} type="button" onClick={() => onSelect(m)} whileTap={{ scale: 0.98 }}
              className="w-full flex items-center gap-3 p-3 rounded-sm hover:bg-neutral-50 transition-colors text-left">
              <div data-eos-id="src/pages/admin/development/create-section.tsx#20" className="flex-1 min-w-0">
                <p data-eos-id="src/pages/admin/development/create-section.tsx#21" data-eos-var="m.title" data-eos-var-label="Title" data-eos-var-scope="item" className="text-[13px] font-semibold text-neutral-900 truncate">{m.title}</p>
                <p data-eos-id="src/pages/admin/development/create-section.tsx#22" data-eos-var="m.category,m.estimated_minutes" data-eos-var-label="Category, Estimated minutes" data-eos-var-scope="item" className="text-[11px] text-neutral-500 capitalize">{m.category.replace('_', ' ')} · {m.estimated_minutes}m</p>
              </div>
              <Plus data-eos-id="src/pages/admin/development/create-section.tsx#23" size={16} className="text-neutral-400 shrink-0" />
            </motion.button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminCreateSectionPage() {
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const { stagger, fadeUp } = adminVariants(rm)
  const navigate = useNavigate()
  const { user } = useAuth()
  const { toast } = useToast()

  useAdminHeader('Create Section')

  const createSection = useCreateSection()
  const saveSectionModules = useSaveSectionModules()
  const { data: allModules = [] } = useDevModules()
  const { data: allSections = [] } = useDevSections()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<DevCategory>('learning')
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [prerequisiteId, setPrerequisiteId] = useState<string>('')
  const [moduleItems, setModuleItems] = useState<ModuleItem[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [targetRoles, setTargetRoles] = useState<string[]>(['leader', 'co_leader', 'assist_leader'])
  const [saved, setSaved] = useState<{ status: 'draft' | 'published'; id: string } | null>(null)

  const selectedIds = useMemo(() => new Set(moduleItems.map((m) => m.module.id)), [moduleItems])
  const prerequisiteOptions = useMemo(() => [
    { value: '', label: 'None' },
    ...allSections.filter((s) => s.status === 'published').map((s) => ({ value: s.id, label: s.title })),
  ], [allSections])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setModuleItems(arrayMove(moduleItems, moduleItems.findIndex((m) => m._key === active.id), moduleItems.findIndex((m) => m._key === over.id)))
    }
  }

  const isSaving = createSection.isPending || saveSectionModules.isPending
  const canPublish = title.trim().length > 0 && moduleItems.length > 0

  const handleSave = useCallback(async (status: 'draft' | 'published') => {
    if (!user) return
    if (!title.trim()) { toast.error('Title is required'); return }
    try {
      const section = await createSection.mutateAsync({
        title: title.trim(), description: description.trim() || undefined, category,
        thumbnail_url: thumbnailUrl || undefined, status,
        prerequisite_section_id: prerequisiteId || null, target_roles: targetRoles, created_by: user.id,
      })
      if (moduleItems.length > 0) {
        await saveSectionModules.mutateAsync({ sectionId: section.id, modules: moduleItems.map((m, i) => ({ module_id: m.module.id, sort_order: i, is_required: m.is_required })) })
      }
      setSaved({ status, id: section.id })
    } catch { toast.error('Failed to save section') }
  }, [user, title, description, category, thumbnailUrl, prerequisiteId, moduleItems, targetRoles, createSection, saveSectionModules, toast])

  if (saved) {
    return (
      <motion.div data-eos-id="src/pages/admin/development/create-section.tsx#24" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto py-8">
        <SaveSuccessBanner data-eos-id="src/pages/admin/development/create-section.tsx#25" show message={saved.status === 'published' ? 'Section published!' : 'Draft saved!'} subtitle={`"${title}" has been ${saved.status === 'published' ? 'published' : 'saved as a draft'}.`} editPath={`/admin/development/sections/${saved.id}/edit`} onDismiss={() => { setSaved(null); setTitle(''); setDescription(''); setModuleItems([]); setTargetRoles(['leader', 'co_leader', 'assist_leader']) }} />
      </motion.div>
    )
  }

  return (
    <motion.div data-eos-id="src/pages/admin/development/create-section.tsx#26" variants={stagger} initial="hidden" animate="visible" className="max-w-3xl mx-auto space-y-6">
      {/* Details */}
      <motion.div data-eos-id="src/pages/admin/development/create-section.tsx#27" variants={fadeUp} className="rounded-md bg-white shadow-sm p-5 sm:p-6 space-y-4">
        <div data-eos-id="src/pages/admin/development/create-section.tsx#28" className="flex items-center gap-2.5 mb-1">
          <div data-eos-id="src/pages/admin/development/create-section.tsx#29" className="flex items-center justify-center w-9 h-9 rounded-sm bg-secondary-700 shadow-sm">
            <Layers data-eos-id="src/pages/admin/development/create-section.tsx#30" size={16} className="text-white" />
          </div>
          <h2 data-eos-id="src/pages/admin/development/create-section.tsx#31" className="font-heading text-base font-bold text-neutral-900">Section Details</h2>
        </div>
        <Input data-eos-id="src/pages/admin/development/create-section.tsx#32" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Onboarding Pathway" required />
        <Input data-eos-id="src/pages/admin/development/create-section.tsx#33" type="textarea" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this pathway cover?" rows={3} />
        <div data-eos-id="src/pages/admin/development/create-section.tsx#34" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Dropdown data-eos-id="src/pages/admin/development/create-section.tsx#35" label="Category" options={CATEGORY_OPTIONS} value={category} onChange={(v) => setCategory(v as DevCategory)} />
          <Dropdown data-eos-id="src/pages/admin/development/create-section.tsx#36" label="Prerequisite Section" options={prerequisiteOptions} value={prerequisiteId} onChange={setPrerequisiteId} />
        </div>
        <Input data-eos-id="src/pages/admin/development/create-section.tsx#37" label="Thumbnail URL (optional)" value={thumbnailUrl} onChange={(e) => setThumbnailUrl(e.target.value)} placeholder="Upload to dev-assets bucket first" />
      </motion.div>

      {/* Audience */}
      <motion.div data-eos-id="src/pages/admin/development/create-section.tsx#38" variants={fadeUp} className="rounded-md bg-white shadow-sm p-5 sm:p-6">
        <div data-eos-id="src/pages/admin/development/create-section.tsx#39" className="flex items-center gap-2.5 mb-3">
          <div data-eos-id="src/pages/admin/development/create-section.tsx#40" className="flex items-center justify-center w-9 h-9 rounded-sm bg-primary-700 shadow-sm">
            <Users data-eos-id="src/pages/admin/development/create-section.tsx#41" size={16} className="text-white" />
          </div>
          <h2 data-eos-id="src/pages/admin/development/create-section.tsx#42" className="font-heading text-base font-bold text-neutral-900">Target Audience</h2>
        </div>
        <AudiencePicker data-eos-id="src/pages/admin/development/create-section.tsx#43" selectedRoles={targetRoles} onRolesChange={setTargetRoles} />
      </motion.div>

      {/* Modules */}
      <motion.div data-eos-id="src/pages/admin/development/create-section.tsx#44" variants={fadeUp}>
        <div data-eos-id="src/pages/admin/development/create-section.tsx#45" className="flex items-center justify-between mb-3">
          <h2 data-eos-id="src/pages/admin/development/create-section.tsx#46" className="flex items-center gap-2 font-heading text-[13px] font-bold text-neutral-700/60 uppercase tracking-widest">Modules</h2>
          <Button data-eos-id="src/pages/admin/development/create-section.tsx#47" variant="secondary" size="sm" icon={<Plus data-eos-id="src/pages/admin/development/create-section.tsx#48" size={14} />} onClick={() => setShowPicker(!showPicker)}>Add Modules</Button>
        </div>
        <AnimatePresence data-eos-id="src/pages/admin/development/create-section.tsx#49">
          {showPicker && (
            <motion.div data-eos-id="src/pages/admin/development/create-section.tsx#50" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
              <div data-eos-id="src/pages/admin/development/create-section.tsx#51" className="rounded-md bg-white shadow-sm p-4 mb-4">
                <ModulePicker data-eos-id="src/pages/admin/development/create-section.tsx#52" modules={allModules} selectedIds={selectedIds} onSelect={(m) => setModuleItems((prev) => [...prev, { _key: `sm-${Date.now()}-${m.id}`, module: m, is_required: true }])} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence data-eos-id="src/pages/admin/development/create-section.tsx#53" mode="wait">
          {moduleItems.length === 0 ? (
            <motion.div data-eos-id="src/pages/admin/development/create-section.tsx#54" key="empty" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              className="flex flex-col items-center justify-center py-14 rounded-md bg-neutral-50"
            >
              <div data-eos-id="src/pages/admin/development/create-section.tsx#55" className="flex items-center justify-center w-12 h-12 rounded-md bg-secondary-700 shadow-sm mb-3">
                <Layers data-eos-id="src/pages/admin/development/create-section.tsx#56" size={24} strokeWidth={1.5} className="text-white" />
              </div>
              <p data-eos-id="src/pages/admin/development/create-section.tsx#57" className="text-[13px] font-semibold text-neutral-600 mb-1">No modules added</p>
              <p data-eos-id="src/pages/admin/development/create-section.tsx#58" className="text-[11px] text-neutral-400">Add modules to build this pathway</p>
            </motion.div>
          ) : (
            <DndContext data-eos-id="src/pages/admin/development/create-section.tsx#59" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext data-eos-id="src/pages/admin/development/create-section.tsx#60" items={moduleItems.map((m) => m._key)} strategy={verticalListSortingStrategy}>
                <motion.div data-eos-id="src/pages/admin/development/create-section.tsx#61" key="list" className="space-y-2">
                  <AnimatePresence data-eos-id="src/pages/admin/development/create-section.tsx#62">
                    {moduleItems.map((item) => (
                      <SortableModuleItem data-eos-id="src/pages/admin/development/create-section.tsx#63" key={item._key} item={item}
                        onToggleRequired={() => setModuleItems((prev) => prev.map((m) => m._key === item._key ? { ...m, is_required: !m.is_required } : m))}
                        onRemove={() => setModuleItems((prev) => prev.filter((m) => m._key !== item._key))} />
                    ))}
                  </AnimatePresence>
                </motion.div>
              </SortableContext>
            </DndContext>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Bottom bar */}
      <motion.div data-eos-id="src/pages/admin/development/create-section.tsx#64" variants={fadeUp} className="sticky bottom-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 -mb-4 sm:-mb-6 lg:-mb-8 px-4 sm:px-6 lg:px-8 py-3 bg-white/95 backdrop-blur-sm border-t border-neutral-100 flex items-center justify-between gap-3">
        <p data-eos-id="src/pages/admin/development/create-section.tsx#65" className="text-[11px] font-semibold text-neutral-400">{moduleItems.length} module{moduleItems.length !== 1 ? 's' : ''}</p>
        <div data-eos-id="src/pages/admin/development/create-section.tsx#66" className="flex items-center gap-2">
          <Button data-eos-id="src/pages/admin/development/create-section.tsx#67" variant="ghost" size="sm" onClick={() => navigate('/admin/development')}>Cancel</Button>
          <Button data-eos-id="src/pages/admin/development/create-section.tsx#68" variant="secondary" size="sm" icon={<Save data-eos-id="src/pages/admin/development/create-section.tsx#69" size={14} />} onClick={() => handleSave('draft')} loading={isSaving} disabled={!title.trim()}>Save Draft</Button>
          <Button data-eos-id="src/pages/admin/development/create-section.tsx#70" variant="primary" size="sm" icon={<Send data-eos-id="src/pages/admin/development/create-section.tsx#71" size={14} />} onClick={() => handleSave('published')} loading={isSaving} disabled={!canPublish}>Publish</Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
