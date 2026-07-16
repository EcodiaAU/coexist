import { useState, useCallback, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import { Layers, Save, Send, Plus, Trash2, GripVertical, Clock, Check } from 'lucide-react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAdminHeader } from '@/components/admin-layout'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Dropdown } from '@/components/dropdown'
import { Skeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { useDevSection, useDevSectionModules, useUpdateSection, useSaveSectionModules, useDevModules, useDevSections, type DevCategory, type DevModule } from '@/hooks/use-admin-development'

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
    <div data-eos-id="src/pages/admin/development/edit-section.tsx#0" ref={setNodeRef} style={style} className={cn('group flex items-center gap-3 rounded-md bg-white p-3.5 shadow-sm transition-shadow', isDragging && 'shadow-sm ring-2 ring-neutral-300/50 z-10')}>
      <button data-eos-id="src/pages/admin/development/edit-section.tsx#1" type="button" className="cursor-grab touch-none text-neutral-300 hover:text-neutral-500 active:cursor-grabbing" {...attributes} {...listeners}><GripVertical data-eos-id="src/pages/admin/development/edit-section.tsx#2" size={18} /></button>
      <div data-eos-id="src/pages/admin/development/edit-section.tsx#3" className="flex-1 min-w-0">
        <p data-eos-id="src/pages/admin/development/edit-section.tsx#4" data-eos-var="item.module.title" data-eos-var-label="Title" data-eos-var-scope="prop" className="text-[13px] font-bold text-neutral-900 truncate">{item.module.title}</p>
        <span data-eos-id="src/pages/admin/development/edit-section.tsx#5" data-eos-var="item.module.estimated_minutes" data-eos-var-label="Estimated minutes" data-eos-var-scope="prop" className="flex items-center gap-0.5 text-[11px] text-neutral-400"><Clock data-eos-id="src/pages/admin/development/edit-section.tsx#6" size={10} />{item.module.estimated_minutes}m</span>
      </div>
      <button data-eos-id="src/pages/admin/development/edit-section.tsx#7" data-eos-var="item.is_required" data-eos-var-label="Is required" data-eos-var-scope="prop" type="button" onClick={onToggleRequired} className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-[11px] font-bold transition-colors', item.is_required ? 'bg-moss-100 text-moss-700' : 'bg-neutral-50 text-neutral-400')}>
        {item.is_required && <Check data-eos-id="src/pages/admin/development/edit-section.tsx#8" size={10} />}
        {item.is_required ? 'Required' : 'Optional'}
      </button>
      <button data-eos-id="src/pages/admin/development/edit-section.tsx#9" type="button" onClick={onRemove} className="flex items-center justify-center w-9 h-9 rounded-sm text-error-400 hover:text-error-600 hover:bg-error-50 transition-[transform,opacity] sm:opacity-0 sm:group-hover:opacity-100"><Trash2 data-eos-id="src/pages/admin/development/edit-section.tsx#10" size={16} /></button>
    </div>
  )
}

export default function AdminEditSectionPage() {
  const { sectionId } = useParams<{ sectionId: string }>()
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const { stagger, fadeUp } = adminVariants(rm)
  const navigate = useNavigate()
  const { toast } = useToast()
  useAdminHeader('Edit Section')

  const { data: section, isLoading: sectionLoading } = useDevSection(sectionId)
  const { data: existingSectionModules = [], isLoading: smLoading } = useDevSectionModules(sectionId)
  const updateSection = useUpdateSection()
  const saveSectionModules = useSaveSectionModules()
  const { data: allModules = [] } = useDevModules()
  const { data: allSections = [] } = useDevSections()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<DevCategory>('learning')
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [prerequisiteId, setPrerequisiteId] = useState('')
  const [moduleItems, setModuleItems] = useState<ModuleItem[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing server data into local form state
  useEffect(() => { if (section && !initialized) { setTitle(section.title); setDescription(section.description ?? ''); setCategory(section.category); setThumbnailUrl(section.thumbnail_url ?? ''); setPrerequisiteId(section.prerequisite_section_id ?? '') } }, [section, initialized])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing server data into local form state
  useEffect(() => { if (existingSectionModules.length > 0 && !initialized) { setModuleItems(existingSectionModules.filter((sm) => sm.module).map((sm) => ({ _key: `sm-${sm.id}`, module: sm.module!, is_required: sm.is_required }))); setInitialized(true) } }, [existingSectionModules, initialized])

  const selectedIds = useMemo(() => new Set(moduleItems.map((m) => m.module.id)), [moduleItems])
  const prerequisiteOptions = useMemo(() => [{ value: '', label: 'None' }, ...allSections.filter((s) => s.status === 'published' && s.id !== sectionId).map((s) => ({ value: s.id, label: s.title }))], [allSections, sectionId])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const handleDragEnd = (event: DragEndEvent) => { const { active, over } = event; if (over && active.id !== over.id) { const oi = moduleItems.findIndex((m) => m._key === active.id); const ni = moduleItems.findIndex((m) => m._key === over.id); setModuleItems(arrayMove(moduleItems, oi, ni)) } }
  const isSaving = updateSection.isPending || saveSectionModules.isPending

  const handleSave = useCallback(async (status: 'draft' | 'published') => {
    if (!sectionId) return
    try {
      await updateSection.mutateAsync({ id: sectionId, title: title.trim(), description: description.trim() || null, category, thumbnail_url: thumbnailUrl || null, status, prerequisite_section_id: prerequisiteId || null })
      await saveSectionModules.mutateAsync({ sectionId, modules: moduleItems.map((m, i) => ({ module_id: m.module.id, sort_order: i, is_required: m.is_required })) })
      toast.success('Section updated'); navigate('/admin/development')
    } catch { toast.error('Failed to update section') }
  }, [sectionId, title, description, category, thumbnailUrl, prerequisiteId, moduleItems, updateSection, saveSectionModules, toast, navigate])

  if (sectionLoading || smLoading) return <div data-eos-id="src/pages/admin/development/edit-section.tsx#11" className="max-w-3xl mx-auto space-y-6 py-4"><Skeleton data-eos-id="src/pages/admin/development/edit-section.tsx#12" className="h-10 w-32 rounded-sm" /><Skeleton data-eos-id="src/pages/admin/development/edit-section.tsx#13" className="h-48 rounded-md" /><Skeleton data-eos-id="src/pages/admin/development/edit-section.tsx#14" className="h-32 rounded-md" /></div>

  return (
    <motion.div data-eos-id="src/pages/admin/development/edit-section.tsx#15" variants={stagger} initial="hidden" animate="visible" className="max-w-3xl mx-auto space-y-6">
      <motion.div data-eos-id="src/pages/admin/development/edit-section.tsx#16" variants={fadeUp} className="rounded-md bg-white shadow-sm p-5 sm:p-6 space-y-4">
        <div data-eos-id="src/pages/admin/development/edit-section.tsx#17" className="flex items-center gap-2.5 mb-1">
          <div data-eos-id="src/pages/admin/development/edit-section.tsx#18" className="flex items-center justify-center w-9 h-9 rounded-sm bg-secondary-700 shadow-sm"><Layers data-eos-id="src/pages/admin/development/edit-section.tsx#19" size={16} className="text-white" /></div>
          <h2 data-eos-id="src/pages/admin/development/edit-section.tsx#20" className="font-heading text-base font-bold text-neutral-900">Section Details</h2>
        </div>
        <Input data-eos-id="src/pages/admin/development/edit-section.tsx#21" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <Input data-eos-id="src/pages/admin/development/edit-section.tsx#22" type="textarea" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        <div data-eos-id="src/pages/admin/development/edit-section.tsx#23" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Dropdown data-eos-id="src/pages/admin/development/edit-section.tsx#24" label="Category" options={CATEGORY_OPTIONS} value={category} onChange={(v) => setCategory(v as DevCategory)} />
          <Dropdown data-eos-id="src/pages/admin/development/edit-section.tsx#25" label="Prerequisite" options={prerequisiteOptions} value={prerequisiteId} onChange={setPrerequisiteId} />
        </div>
        <Input data-eos-id="src/pages/admin/development/edit-section.tsx#26" label="Thumbnail URL" value={thumbnailUrl} onChange={(e) => setThumbnailUrl(e.target.value)} />
      </motion.div>

      <motion.div data-eos-id="src/pages/admin/development/edit-section.tsx#27" variants={fadeUp}>
        <div data-eos-id="src/pages/admin/development/edit-section.tsx#28" className="flex items-center justify-between mb-3">
          <h2 data-eos-id="src/pages/admin/development/edit-section.tsx#29" className="font-heading text-[13px] font-bold text-neutral-700/60 uppercase tracking-widest">Modules</h2>
          <Button data-eos-id="src/pages/admin/development/edit-section.tsx#30" variant="secondary" size="sm" icon={<Plus data-eos-id="src/pages/admin/development/edit-section.tsx#31" size={14} />} onClick={() => setShowPicker(!showPicker)}>Add</Button>
        </div>
        {showPicker && (
          <div data-eos-id="src/pages/admin/development/edit-section.tsx#32" className="rounded-md bg-white shadow-sm p-4 mb-4 max-h-60 overflow-y-auto space-y-1.5">
            {allModules.filter((m) => m.status === 'published' && !selectedIds.has(m.id)).map((m) => (
              <button data-eos-id="src/pages/admin/development/edit-section.tsx#33" key={m.id} type="button" onClick={() => setModuleItems((prev) => [...prev, { _key: `sm-${Date.now()}-${m.id}`, module: m, is_required: true }])} className="w-full flex items-center gap-3 p-2.5 rounded-sm hover:bg-neutral-50 text-left transition-colors">
                <span data-eos-id="src/pages/admin/development/edit-section.tsx#34" data-eos-var="m.title" data-eos-var-label="Title" data-eos-var-scope="item" className="text-[13px] text-neutral-900 truncate flex-1 font-semibold">{m.title}</span><Plus data-eos-id="src/pages/admin/development/edit-section.tsx#35" size={14} className="text-neutral-400" />
              </button>
            ))}
          </div>
        )}
        <DndContext data-eos-id="src/pages/admin/development/edit-section.tsx#36" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext data-eos-id="src/pages/admin/development/edit-section.tsx#37" items={moduleItems.map((m) => m._key)} strategy={verticalListSortingStrategy}>
            <div data-eos-id="src/pages/admin/development/edit-section.tsx#38" className="space-y-2">{moduleItems.map((item) => <SortableModuleItem data-eos-id="src/pages/admin/development/edit-section.tsx#39" key={item._key} item={item} onToggleRequired={() => setModuleItems((prev) => prev.map((m) => m._key === item._key ? { ...m, is_required: !m.is_required } : m))} onRemove={() => setModuleItems((prev) => prev.filter((m) => m._key !== item._key))} />)}</div>
          </SortableContext>
        </DndContext>
      </motion.div>

      <motion.div data-eos-id="src/pages/admin/development/edit-section.tsx#40" variants={fadeUp} className="sticky bottom-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 -mb-4 sm:-mb-6 lg:-mb-8 px-4 sm:px-6 lg:px-8 py-3 bg-white/95 backdrop-blur-sm border-t border-neutral-100 flex items-center justify-between gap-3">
        <p data-eos-id="src/pages/admin/development/edit-section.tsx#41" className="text-[11px] font-semibold text-neutral-400">{moduleItems.length} module{moduleItems.length !== 1 ? 's' : ''}</p>
        <div data-eos-id="src/pages/admin/development/edit-section.tsx#42" className="flex items-center gap-2">
          <Button data-eos-id="src/pages/admin/development/edit-section.tsx#43" variant="ghost" size="sm" onClick={() => navigate('/admin/development')}>Cancel</Button>
          <Button data-eos-id="src/pages/admin/development/edit-section.tsx#44" variant="secondary" size="sm" icon={<Save data-eos-id="src/pages/admin/development/edit-section.tsx#45" size={14} />} onClick={() => handleSave('draft')} loading={isSaving}>Save Draft</Button>
          <Button data-eos-id="src/pages/admin/development/edit-section.tsx#46" variant="primary" size="sm" icon={<Send data-eos-id="src/pages/admin/development/edit-section.tsx#47" size={14} />} onClick={() => handleSave('published')} loading={isSaving} disabled={!title.trim()}>Publish</Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
