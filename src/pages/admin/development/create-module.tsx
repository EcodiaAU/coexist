import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import { BookOpen, Save, Send, Users } from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Dropdown } from '@/components/dropdown'
import { useToast } from '@/components/toast'
import { useAuth } from '@/hooks/use-auth'
import { useCreateModule, useSaveModuleContent, type DevCategory, type ContentBlockInput } from '@/hooks/use-admin-development'
import { BlockEditor } from '@/components/development/block-editor'
import { AudiencePicker } from '@/components/development/audience-picker'
import { SaveSuccessBanner } from '@/components/development/save-success-banner'

const CATEGORY_OPTIONS = [
  { value: 'learning', label: 'Learning' },
  { value: 'leadership_development', label: 'Leadership Development' },
  { value: 'onboarding', label: 'Onboarding' },
]

export default function AdminCreateModulePage() {
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const { stagger, fadeUp } = adminVariants(rm)
  const navigate = useNavigate()
  const { user } = useAuth()
  const { toast } = useToast()

  useAdminHeader('Create Module')

  const createModule = useCreateModule()
  const saveContent = useSaveModuleContent()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<DevCategory>('learning')
  const [estimatedMinutes, setEstimatedMinutes] = useState(10)
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [targetRoles, setTargetRoles] = useState<string[]>(['leader', 'co_leader', 'assist_leader'])
  const [blocks, setBlocks] = useState<(ContentBlockInput & { _key: string })[]>([])
  const [saved, setSaved] = useState<{ status: 'draft' | 'published'; id: string } | null>(null)

  const isSaving = createModule.isPending || saveContent.isPending
  const canPublish = title.trim().length > 0 && blocks.length > 0

  const handleSave = useCallback(async (status: 'draft' | 'published') => {
    if (!user) return
    if (status === 'published' && !canPublish) { toast.error('Add a title and at least one content block to publish'); return }
    if (!title.trim()) { toast.error('Title is required'); return }
    try {
      const mod = await createModule.mutateAsync({ title: title.trim(), description: description.trim() || undefined, category, estimated_minutes: estimatedMinutes, thumbnail_url: thumbnailUrl || undefined, status, target_roles: targetRoles, created_by: user.id })
       
      if (blocks.length > 0) await saveContent.mutateAsync({ moduleId: mod.id, blocks: blocks.map(({ _key, ...rest }) => rest) })
      setSaved({ status, id: mod.id })
    } catch { toast.error('Failed to save module') }
  }, [user, title, description, category, estimatedMinutes, thumbnailUrl, targetRoles, blocks, canPublish, createModule, saveContent, toast])

  const resetForm = () => { setTitle(''); setDescription(''); setCategory('learning'); setEstimatedMinutes(10); setThumbnailUrl(''); setTargetRoles(['leader', 'co_leader', 'assist_leader']); setBlocks([]); setSaved(null) }

  if (saved) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto py-8">
        <SaveSuccessBanner show message={saved.status === 'published' ? 'Module published!' : 'Draft saved!'} subtitle={saved.status === 'published' ? `"${title}" is now live` : `"${title}" saved as draft.`} editPath={`/admin/development/modules/${saved.id}/edit`} onDismiss={resetForm} />
      </motion.div>
    )
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="max-w-3xl mx-auto space-y-6">
      <motion.div variants={fadeUp} className="rounded-2xl bg-white shadow-sm p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 shadow-sm shadow-amber-600/20">
            <BookOpen size={16} className="text-white" />
          </div>
          <h2 className="font-heading text-base font-bold text-neutral-900">Module Details</h2>
        </div>
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Welcome to Co-Exist Leadership" required />
        <Input type="textarea" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Dropdown label="Category" options={CATEGORY_OPTIONS} value={category} onChange={(v) => setCategory(v as DevCategory)} />
          <Input label="Estimated Minutes" type="number" value={String(estimatedMinutes)} onChange={(e) => setEstimatedMinutes(Math.max(1, parseInt(e.target.value) || 1))} />
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="rounded-2xl bg-white shadow-sm p-5 sm:p-6">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-sm shadow-primary-600/20">
            <Users size={16} className="text-white" />
          </div>
          <h2 className="font-heading text-base font-bold text-neutral-900">Target Audience</h2>
        </div>
        <AudiencePicker selectedRoles={targetRoles} onRolesChange={setTargetRoles} />
      </motion.div>

      <motion.div variants={fadeUp}>
        <h2 className="flex items-center gap-2 font-heading text-[13px] font-bold text-neutral-700/60 uppercase tracking-widest mb-3">Content Blocks</h2>
        <BlockEditor blocks={blocks} onChange={setBlocks} />
      </motion.div>

      <motion.div variants={fadeUp} className="sticky bottom-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 -mb-4 sm:-mb-6 lg:-mb-8 px-4 sm:px-6 lg:px-8 py-3 bg-white/95 backdrop-blur-sm border-t border-neutral-100 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold text-neutral-400">
          {blocks.length} block{blocks.length !== 1 ? 's' : ''}
          {targetRoles.length > 0 && ` · ${targetRoles.length} role${targetRoles.length !== 1 ? 's' : ''}`}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/development')}>Cancel</Button>
          <Button variant="secondary" size="sm" icon={<Save size={14} />} onClick={() => handleSave('draft')} loading={isSaving} disabled={!title.trim()}>Save Draft</Button>
          <Button variant="primary" size="sm" icon={<Send size={14} />} onClick={() => handleSave('published')} loading={isSaving} disabled={!canPublish}>Publish</Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
