import { useState, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import { BookOpen, Save, Send, Users } from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Dropdown } from '@/components/dropdown'
import { Skeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import { useDevModule, useDevModuleContent, useUpdateModule, useSaveModuleContent, type DevCategory, type ContentBlockInput } from '@/hooks/use-admin-development'
import { BlockEditor, generateBlockKey } from '@/components/development/block-editor'
import { AudiencePicker } from '@/components/development/audience-picker'
import { SaveSuccessBanner } from '@/components/development/save-success-banner'

const CATEGORY_OPTIONS = [
  { value: 'learning', label: 'Learning' },
  { value: 'leadership_development', label: 'Leadership Development' },
  { value: 'onboarding', label: 'Onboarding' },
]

export default function AdminEditModulePage() {
  const { moduleId } = useParams<{ moduleId: string }>()
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const { stagger, fadeUp } = adminVariants(rm)
  const navigate = useNavigate()
  const { toast } = useToast()
  useAdminHeader('Edit Module')

  const { data: module, isLoading: moduleLoading } = useDevModule(moduleId)
  const { data: existingBlocks = [], isLoading: blocksLoading } = useDevModuleContent(moduleId)
  const updateModule = useUpdateModule()
  const saveContent = useSaveModuleContent()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<DevCategory>('learning')
  const [estimatedMinutes, setEstimatedMinutes] = useState(10)
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [targetRoles, setTargetRoles] = useState<string[]>([])
  const [blocks, setBlocks] = useState<(ContentBlockInput & { _key: string })[]>([])
  const [initialized, setInitialized] = useState(false)
  const [saved, setSaved] = useState<{ status: 'draft' | 'published' } | null>(null)

  // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing server data into local form state
  useEffect(() => { if (module && !initialized) { setTitle(module.title); setDescription(module.description ?? ''); setCategory(module.category); setEstimatedMinutes(module.estimated_minutes); setThumbnailUrl(module.thumbnail_url ?? ''); setTargetRoles(module.target_roles ?? []) } }, [module, initialized])
  // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing server data into local form state
  useEffect(() => { if (existingBlocks.length > 0 && !initialized) { setBlocks(existingBlocks.map((b) => ({ ...b, _key: generateBlockKey() }))); setInitialized(true) } }, [existingBlocks, initialized])

  const isSaving = updateModule.isPending || saveContent.isPending
  const canPublish = title.trim().length > 0 && blocks.length > 0

  const handleSave = useCallback(async (status: 'draft' | 'published') => {
    if (!moduleId) return
    try {
      await updateModule.mutateAsync({ id: moduleId, title: title.trim(), description: description.trim() || null, category, estimated_minutes: estimatedMinutes, thumbnail_url: thumbnailUrl || null, target_roles: targetRoles, status })
       
      await saveContent.mutateAsync({ moduleId, blocks: blocks.map(({ _key, ...rest }) => rest) })
      setSaved({ status })
    } catch { toast.error('Failed to update module') }
  }, [moduleId, title, description, category, estimatedMinutes, thumbnailUrl, targetRoles, blocks, updateModule, saveContent, toast])

  if (moduleLoading || blocksLoading) return <div data-eos-id="src/pages/admin/development/edit-module.tsx#0" className="max-w-3xl mx-auto space-y-6 py-4"><Skeleton data-eos-id="src/pages/admin/development/edit-module.tsx#1" className="h-10 w-32 rounded-sm" /><Skeleton data-eos-id="src/pages/admin/development/edit-module.tsx#2" className="h-48 rounded-md" /><Skeleton data-eos-id="src/pages/admin/development/edit-module.tsx#3" className="h-32 rounded-md" /></div>

  if (saved) {
    return (
      <motion.div data-eos-id="src/pages/admin/development/edit-module.tsx#4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto py-8">
        <SaveSuccessBanner data-eos-id="src/pages/admin/development/edit-module.tsx#5" show message={saved.status === 'published' ? 'Module published!' : 'Draft saved!'} subtitle={`"${title}" has been updated successfully.`} editPath={`/admin/development/modules/${moduleId}/edit`} onDismiss={() => setSaved(null)} />
      </motion.div>
    )
  }

  return (
    <motion.div data-eos-id="src/pages/admin/development/edit-module.tsx#6" variants={stagger} initial="hidden" animate="visible" className="max-w-3xl mx-auto space-y-6">
      <motion.div data-eos-id="src/pages/admin/development/edit-module.tsx#7" variants={fadeUp} className="rounded-md bg-white shadow-sm p-5 sm:p-6 space-y-4">
        <div data-eos-id="src/pages/admin/development/edit-module.tsx#8" className="flex items-center gap-2.5 mb-1">
          <div data-eos-id="src/pages/admin/development/edit-module.tsx#9" className="flex items-center justify-center w-9 h-9 rounded-sm bg-bark-700 shadow-sm"><BookOpen data-eos-id="src/pages/admin/development/edit-module.tsx#10" size={16} className="text-white" /></div>
          <h2 data-eos-id="src/pages/admin/development/edit-module.tsx#11" className="font-heading text-base font-bold text-neutral-900">Module Details</h2>
        </div>
        <Input data-eos-id="src/pages/admin/development/edit-module.tsx#12" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <Input data-eos-id="src/pages/admin/development/edit-module.tsx#13" type="textarea" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        <div data-eos-id="src/pages/admin/development/edit-module.tsx#14" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Dropdown data-eos-id="src/pages/admin/development/edit-module.tsx#15" label="Category" options={CATEGORY_OPTIONS} value={category} onChange={(v) => setCategory(v as DevCategory)} />
          <Input data-eos-id="src/pages/admin/development/edit-module.tsx#16" label="Estimated Minutes" type="number" value={String(estimatedMinutes)} onChange={(e) => setEstimatedMinutes(Math.max(1, parseInt(e.target.value) || 1))} />
        </div>
      </motion.div>

      <motion.div data-eos-id="src/pages/admin/development/edit-module.tsx#17" variants={fadeUp} className="rounded-md bg-white shadow-sm p-5 sm:p-6">
        <div data-eos-id="src/pages/admin/development/edit-module.tsx#18" className="flex items-center gap-2.5 mb-3">
          <div data-eos-id="src/pages/admin/development/edit-module.tsx#19" className="flex items-center justify-center w-9 h-9 rounded-sm bg-primary-700 shadow-sm"><Users data-eos-id="src/pages/admin/development/edit-module.tsx#20" size={16} className="text-white" /></div>
          <h2 data-eos-id="src/pages/admin/development/edit-module.tsx#21" className="font-heading text-base font-bold text-neutral-900">Target Audience</h2>
        </div>
        <AudiencePicker data-eos-id="src/pages/admin/development/edit-module.tsx#22" selectedRoles={targetRoles} onRolesChange={setTargetRoles} />
      </motion.div>

      <motion.div data-eos-id="src/pages/admin/development/edit-module.tsx#23" variants={fadeUp}>
        <h2 data-eos-id="src/pages/admin/development/edit-module.tsx#24" className="flex items-center gap-2 font-heading text-[13px] font-bold text-neutral-700/60 uppercase tracking-widest mb-3">Content Blocks</h2>
        <BlockEditor data-eos-id="src/pages/admin/development/edit-module.tsx#25" blocks={blocks} onChange={setBlocks} />
      </motion.div>

      <motion.div data-eos-id="src/pages/admin/development/edit-module.tsx#26" variants={fadeUp} className="sticky bottom-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 -mb-4 sm:-mb-6 lg:-mb-8 px-4 sm:px-6 lg:px-8 py-3 bg-white/95 backdrop-blur-sm border-t border-neutral-100 flex items-center justify-between gap-3">
        <p data-eos-id="src/pages/admin/development/edit-module.tsx#27" className="text-[11px] font-semibold text-neutral-400">{blocks.length} block{blocks.length !== 1 ? 's' : ''}{targetRoles.length > 0 && ` · ${targetRoles.length} role${targetRoles.length !== 1 ? 's' : ''}`}</p>
        <div data-eos-id="src/pages/admin/development/edit-module.tsx#28" className="flex items-center gap-2">
          <Button data-eos-id="src/pages/admin/development/edit-module.tsx#29" variant="ghost" size="sm" onClick={() => navigate('/admin/development')}>Cancel</Button>
          <Button data-eos-id="src/pages/admin/development/edit-module.tsx#30" variant="secondary" size="sm" icon={<Save data-eos-id="src/pages/admin/development/edit-module.tsx#31" size={14} />} onClick={() => handleSave('draft')} loading={isSaving} disabled={!title.trim()}>Save Draft</Button>
          <Button data-eos-id="src/pages/admin/development/edit-module.tsx#32" variant="primary" size="sm" icon={<Send data-eos-id="src/pages/admin/development/edit-module.tsx#33" size={14} />} onClick={() => handleSave('published')} loading={isSaving} disabled={!canPublish}>Publish</Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
