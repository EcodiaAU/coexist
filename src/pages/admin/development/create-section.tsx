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
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, x: -20 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'group flex items-center gap-3 rounded-2xl p-3.5 transition-colors duration-200',
        isDragging
          ? 'bg-white shadow-sm ring-2 ring-neutral-300/50 z-10 scale-[1.02]'
          : 'bg-white shadow-sm',
      )}
    >
      <button type="button" className="cursor-grab touch-none text-neutral-300 hover:text-neutral-500 active:cursor-grabbing transition-colors" {...attributes} {...listeners}>
        <GripVertical size={18} />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-neutral-900 truncate">{item.module.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-secondary-600 font-medium capitalize">{item.module.category.replace('_', ' ')}</span>
          <span className="flex items-center gap-0.5 text-[11px] text-neutral-400"><Clock size={10} />{item.module.estimated_minutes}m</span>
        </div>
      </div>
      <motion.button
        type="button"
        onClick={onToggleRequired}
        whileTap={{ scale: 0.93 }}
        className={cn(
          'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors duration-200',
          item.is_required ? 'bg-moss-100 text-moss-700' : 'bg-neutral-50 text-neutral-400',
        )}
      >
        <AnimatePresence mode="wait">
          {item.is_required && (
            <motion.span key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.15 }}>
              <Check size={10} />
            </motion.span>
          )}
        </AnimatePresence>
        {item.is_required ? 'Required' : 'Optional'}
      </motion.button>
      <motion.button
        type="button"
        onClick={onRemove}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className="flex items-center justify-center w-9 h-9 rounded-xl text-error-400 hover:text-error-600 hover:bg-error-50 transition-colors"
      >
        <Trash2 size={16} />
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
    <div className="space-y-3">
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search published modules..." className="text-sm" />
      {filtered.length === 0 ? (
        <p className="text-[11px] text-neutral-400 text-center py-4">{search ? 'No matching modules' : 'All published modules are already added'}</p>
      ) : (
        <div className="max-h-60 overflow-y-auto space-y-1.5">
          {filtered.map((m) => (
            <motion.button key={m.id} type="button" onClick={() => onSelect(m)} whileTap={{ scale: 0.98 }}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-neutral-50 transition-colors text-left">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-neutral-900 truncate">{m.title}</p>
                <p className="text-[11px] text-neutral-500 capitalize">{m.category.replace('_', ' ')} · {m.estimated_minutes}m</p>
              </div>
              <Plus size={16} className="text-neutral-400 shrink-0" />
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
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto py-8">
        <SaveSuccessBanner show message={saved.status === 'published' ? 'Section published!' : 'Draft saved!'} subtitle={`"${title}" has been ${saved.status === 'published' ? 'published' : 'saved as a draft'}.`} editPath={`/admin/development/sections/${saved.id}/edit`} onDismiss={() => { setSaved(null); setTitle(''); setDescription(''); setModuleItems([]); setTargetRoles(['leader', 'co_leader', 'assist_leader']) }} />
      </motion.div>
    )
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="max-w-3xl mx-auto space-y-6">
      {/* Details */}
      <motion.div variants={fadeUp} className="rounded-2xl bg-white shadow-sm p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-secondary-500 to-secondary-700 shadow-lg shadow-secondary-600/20">
            <Layers size={16} className="text-white" />
          </div>
          <h2 className="font-heading text-base font-bold text-neutral-900">Section Details</h2>
        </div>
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Onboarding Pathway" required />
        <Input type="textarea" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this pathway cover?" rows={3} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Dropdown label="Category" options={CATEGORY_OPTIONS} value={category} onChange={(v) => setCategory(v as DevCategory)} />
          <Dropdown label="Prerequisite Section" options={prerequisiteOptions} value={prerequisiteId} onChange={setPrerequisiteId} />
        </div>
        <Input label="Thumbnail URL (optional)" value={thumbnailUrl} onChange={(e) => setThumbnailUrl(e.target.value)} placeholder="Upload to dev-assets bucket first" />
      </motion.div>

      {/* Audience */}
      <motion.div variants={fadeUp} className="rounded-2xl bg-white shadow-sm p-5 sm:p-6">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg shadow-primary-600/20">
            <Users size={16} className="text-white" />
          </div>
          <h2 className="font-heading text-base font-bold text-neutral-900">Target Audience</h2>
        </div>
        <AudiencePicker selectedRoles={targetRoles} onRolesChange={setTargetRoles} />
      </motion.div>

      {/* Modules */}
      <motion.div variants={fadeUp}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-2 font-heading text-[13px] font-bold text-neutral-700/60 uppercase tracking-widest">Modules</h2>
          <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setShowPicker(!showPicker)}>Add Modules</Button>
        </div>
        <AnimatePresence>
          {showPicker && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
              <div className="rounded-2xl bg-white shadow-sm p-4 mb-4">
                <ModulePicker modules={allModules} selectedIds={selectedIds} onSelect={(m) => setModuleItems((prev) => [...prev, { _key: `sm-${Date.now()}-${m.id}`, module: m, is_required: true }])} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence mode="wait">
          {moduleItems.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              className="flex flex-col items-center justify-center py-14 rounded-2xl bg-neutral-50"
            >
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-secondary-500 to-secondary-700 shadow-lg mb-3">
                <Layers size={24} strokeWidth={1.5} className="text-white" />
              </div>
              <p className="text-[13px] font-semibold text-neutral-600 mb-1">No modules added</p>
              <p className="text-[11px] text-neutral-400">Add modules to build this pathway</p>
            </motion.div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={moduleItems.map((m) => m._key)} strategy={verticalListSortingStrategy}>
                <motion.div key="list" className="space-y-2">
                  <AnimatePresence>
                    {moduleItems.map((item) => (
                      <SortableModuleItem key={item._key} item={item}
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
      <motion.div variants={fadeUp} className="sticky bottom-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 -mb-4 sm:-mb-6 lg:-mb-8 px-4 sm:px-6 lg:px-8 py-3 bg-white/95 backdrop-blur-sm border-t border-neutral-100 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold text-neutral-400">{moduleItems.length} module{moduleItems.length !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/development')}>Cancel</Button>
          <Button variant="secondary" size="sm" icon={<Save size={14} />} onClick={() => handleSave('draft')} loading={isSaving} disabled={!title.trim()}>Save Draft</Button>
          <Button variant="primary" size="sm" icon={<Send size={14} />} onClick={() => handleSave('published')} loading={isSaving} disabled={!canPublish}>Publish</Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
