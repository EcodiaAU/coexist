import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
    Eye,
    Image as ImageIcon,
    Pin,
    AlertTriangle,
    Users,
    Globe,
    Shield,
    X, FileText, Megaphone, Send, Sparkles
} from 'lucide-react'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Avatar } from '@/components/avatar'
import { BottomSheet } from '@/components/bottom-sheet'
import { UploadProgress } from '@/components/upload-progress'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { useAuth } from '@/hooks/use-auth'
import { useCreateUpdate } from '@/hooks/use-updates'
import { useMyCollectives, useCollectives } from '@/hooks/use-collective'
import { useImageUpload } from '@/hooks/use-image-upload'
import { useAdminHeader } from '@/components/admin-layout'
import type { Enums } from '@/types/database.types'

/* ------------------------------------------------------------------ */
/*  Target audience options                                            */
/* ------------------------------------------------------------------ */

const audienceOptions: {
  value: Enums<'update_target'>
  label: string
  description: string
  icon: typeof Globe
}[] = [
  {
    value: 'all',
    label: 'Everyone',
    description: 'All participants nationally',
    icon: Globe,
  },
  {
    value: 'collective_specific',
    label: 'Specific Collective',
    description: 'Target one collective',
    icon: Users,
  },
]

/* ------------------------------------------------------------------ */
/*  Create update page – blog-post style, admin-only                   */
/* ------------------------------------------------------------------ */

export default function CreateUpdatePage() {
  const navigate = useNavigate()
  const { profile, isAdmin } = useAuth()
  const { toast } = useToast()
  const createUpdate = useCreateUpdate()
  const annUpload = useImageUpload({ bucket: 'announcements' })
  const { data: myCollectives } = useMyCollectives()
  const { data: allCollectives } = useCollectives({ includeNational: true })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [priority, setPriority] = useState<Enums<'update_priority'>>('normal')
  const [targetAudience, setTargetAudience] = useState<Enums<'update_target'>>('all')
  const [selectedCollectiveId, setSelectedCollectiveId] = useState<string | null>(null)
  const [isPinned, setIsPinned] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [showPreview, setShowPreview] = useState(false)

  useAdminHeader('New Update', {
    subtitle: 'Compose and publish a blog-post update',
  })

  useEffect(() => {
    return () => {
      for (const url of previews) {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url)
      }
    }
    // Revoke only on unmount. Deliberately NOT tracking previews changes -
    // per-item revocation already happens in removeImage, and revoking on
    // every re-render would pull the rug from under still-visible <img>s.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Only admin staff can create updates
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center mb-5">
          <Shield size={28} className="text-neutral-400" />
        </div>
        <h2 className="font-heading text-lg font-bold text-neutral-900 mb-2">Admin Only</h2>
        <p className="text-sm text-neutral-500 text-center max-w-xs">
          Only admin staff can create updates. Contact your admin if you need to post an update.
        </p>
      </div>
    )
  }

  const canSubmit =
    title.trim().length > 0 &&
    content.trim().length > 0 &&
    (targetAudience !== 'collective_specific' || !!selectedCollectiveId)

  /* ---- Multi-image handling ----
   * Previews use object URLs (synchronous) so preview[i] always lines up
   * with selectedFiles[i]. The previous FileReader approach was async per
   * file, so a small file could finish ahead of a large one and the two
   * arrays would drift out of order — removing index 0 then removed the
   * wrong preview. Object URLs are revoked on removal and on unmount to
   * avoid memory leaks.
   */
  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return
    const newFiles = Array.from(files).slice(0, 10 - selectedFiles.length)
    const newPreviews = newFiles.map((f) => URL.createObjectURL(f))
    setSelectedFiles((prev) => [...prev, ...newFiles])
    setPreviews((prev) => [...prev, ...newPreviews])
  }

  const removeImage = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
    setPreviews((prev) => {
      const url = prev[index]
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
      return prev.filter((_, i) => i !== index)
    })
  }

  /* ---- Submit ---- */

  const handleSubmit = async () => {
    if (!canSubmit) return

    try {
      let imageUrls: string[] = []
      if (selectedFiles.length > 0) {
        const results = await annUpload.uploadMultiple(selectedFiles)
        imageUrls = results.map((r) => r.url)
      }

      await createUpdate.mutateAsync({
        title: title.trim(),
        content: content.trim(),
        imageUrls,
        priority,
        targetAudience,
        targetCollectiveId: targetAudience === 'collective_specific' ? selectedCollectiveId ?? undefined : undefined,
        isPinned,
      })

      toast.success('Update published!')
      navigate('/updates')
    } catch {
      toast.error('Failed to publish update')
    }
  }

  const isSubmitting = annUpload.uploading || createUpdate.isPending

  return (
    <div className="max-w-3xl mx-auto">
      <motion.div
        className="space-y-5"
        initial={rm ? undefined : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        {/* ── Compose Card ── */}
        <div className="rounded-2xl shadow-sm overflow-hidden border border-neutral-100">
          {/* Section header */}
          <div className="border-b border-neutral-100 bg-white px-5 py-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary-50 text-primary-600">
                <Megaphone size={18} />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-neutral-900 tracking-tight">Compose Update</h3>
                <p className="text-xs text-neutral-500">Write your blog-post style update</p>
              </div>
            </div>
          </div>

          {/* White body */}
          <div className="bg-white px-5 py-5 space-y-4">
            <Input
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give it a title..."
              maxLength={200}
              inputClassName="bg-surface-3 font-heading text-xl font-bold leading-tight"
            />

            <div>
              <Input
                type="textarea"
                label="Content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your update...&#10;&#10;Share news, event invites, recaps - anything the community needs to know."
                rows={10}
                maxLength={10000}
                helperText="Write your update, invite, recap, or anything you'd like to share."
              />
              <div className="flex justify-end mt-1">
                <span className="text-xs text-neutral-400">{content.length}/10,000</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Images Card ── */}
        <div className="rounded-2xl shadow-sm overflow-hidden border border-neutral-100">
          {/* Section header */}
          <div className="border-b border-neutral-100 bg-white px-5 py-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-moss-50 text-moss-600">
                <ImageIcon size={18} />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-neutral-900 tracking-tight">Images</h3>
                <p className="text-xs text-neutral-500">{selectedFiles.length}/10 selected  photos, infographics, flyers</p>
              </div>
            </div>
          </div>

          {/* White body */}
          <div className="bg-white px-5 py-5">
            {previews.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 mb-4">
                {previews.map((src, i) => (
                  <motion.div
                    key={i}
                    initial={rm ? false : { opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative aspect-square rounded-xl overflow-hidden group ring-1 ring-neutral-100"
                  >
                    <img
                      src={src}
                      alt={`Selected photo ${i + 1}`}
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className={cn(
                        'absolute top-1.5 right-1.5',
                        'flex items-center justify-center w-7 h-7 rounded-full',
                        'bg-black/60 text-white opacity-0 group-hover:opacity-100',
                        'cursor-pointer select-none',
                        'hover:bg-black/80 active:scale-[0.97] transition-transform duration-150',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:opacity-100',
                      )}
                      aria-label={`Remove photo ${i + 1}`}
                    >
                      <X size={14} />
                    </button>
                  </motion.div>
                ))}
              </div>
            )}

            {selectedFiles.length < 10 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'flex items-center justify-center gap-2.5 w-full h-24 rounded-xl',
                  'border-2 border-dashed border-neutral-300 bg-neutral-50',
                  'text-sm text-neutral-600 font-medium',
                  'cursor-pointer hover:border-neutral-400 hover:bg-neutral-100',
                  'transition-transform duration-150 active:scale-[0.99]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                )}
              >
                <ImageIcon size={20} aria-hidden="true" />
                {previews.length > 0 ? 'Add more images' : 'Click to upload images'}
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handleFilesSelected(e.target.files)}
              className="hidden"
              aria-hidden="true"
            />

            <UploadProgress
              progress={annUpload.progress}
              uploading={annUpload.uploading}
              error={annUpload.error}
              className="mt-2"
            />
          </div>
        </div>

        {/* ── Settings Card ── */}
        <div className="rounded-2xl shadow-sm overflow-hidden border border-neutral-100">
          {/* Section header */}
          <div className="border-b border-neutral-100 bg-white px-5 py-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-neutral-100 text-neutral-600">
                <FileText size={18} />
              </div>
              <div>
                <h3 className="text-[15px] font-bold text-neutral-900 tracking-tight">Settings</h3>
                <p className="text-xs text-neutral-500">Priority, audience, and pinning</p>
              </div>
            </div>
          </div>

          {/* White body */}
          <div className="bg-white px-5 py-5 space-y-5">
            {/* Priority */}
            <div>
              <label className="block text-sm font-semibold text-neutral-900 mb-2">
                Priority
              </label>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setPriority('normal')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold',
                    'transition-transform duration-150 active:scale-[0.97] cursor-pointer select-none',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                    priority === 'normal'
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'bg-primary-50 text-primary-600 hover:bg-primary-100 ring-1 ring-primary-200/60',
                  )}
                  aria-pressed={priority === 'normal'}
                >
                  <Sparkles size={14} aria-hidden="true" />
                  Normal
                </button>
                <button
                  type="button"
                  onClick={() => setPriority('urgent')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold',
                    'transition-transform duration-150 active:scale-[0.97] cursor-pointer select-none',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-400',
                    priority === 'urgent'
                      ? 'bg-warning-500 text-white shadow-sm'
                      : 'bg-warning-50 text-warning-700 hover:bg-warning-100 ring-1 ring-warning-200/60',
                  )}
                  aria-pressed={priority === 'urgent'}
                >
                  <AlertTriangle size={14} aria-hidden="true" />
                  Urgent
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-neutral-100" />

            {/* Target audience */}
            <div>
              <label className="block text-sm font-semibold text-neutral-900 mb-2.5">
                Target Audience
              </label>
              <div className="space-y-2">
                {audienceOptions.map((opt) => {
                  const Icon = opt.icon
                  const isSelected = targetAudience === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTargetAudience(opt.value)}
                      className={cn(
                        'flex items-center gap-3.5 w-full px-4 py-3.5 rounded-xl text-left',
                        'transition-transform duration-150 active:scale-[0.98] cursor-pointer select-none',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                        isSelected
                          ? 'bg-primary-50 ring-2 ring-primary-500 shadow-sm'
                          : 'bg-neutral-50 ring-1 ring-neutral-200 hover:bg-neutral-100 hover:ring-neutral-300',
                      )}
                      aria-pressed={isSelected}
                    >
                      <div className={cn(
                        'flex items-center justify-center w-10 h-10 rounded-xl shrink-0',
                        isSelected
                          ? 'bg-primary-600 text-white'
                          : 'bg-primary-100 text-primary-500',
                      )}>
                        <Icon size={18} aria-hidden="true" />
                      </div>
                      <div>
                        <p className={cn(
                          'text-sm font-semibold',
                          isSelected ? 'text-neutral-900' : 'text-neutral-700',
                        )}>
                          {opt.label}
                        </p>
                        <p className={cn(
                          'text-xs',
                          isSelected ? 'text-primary-500' : 'text-neutral-400',
                        )}>{opt.description}</p>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Collective picker */}
              {targetAudience === 'collective_specific' && (
                <div className="mt-3 space-y-2">
                  <label className="block text-xs font-bold text-neutral-500 uppercase tracking-wider">
                    Select collective
                  </label>
                  {(isAdmin ? (allCollectives ?? []).map(c => ({ id: c.id, name: c.name, cover_image_url: c.cover_image_url, region: c.region, state: c.state })) : (myCollectives ?? []).map(m => {
                    const c = m.collectives as unknown as { name: string; cover_image_url?: string | null; region?: string | null; state?: string | null } | null
                    return c ? { id: m.collective_id, name: c.name, cover_image_url: c.cover_image_url, region: c.region, state: c.state } : null
                  }).filter(Boolean) as { id: string; name: string; cover_image_url?: string | null; region?: string | null; state?: string | null }[]).map((collective) => {
                    const isSelected = selectedCollectiveId === collective.id
                    return (
                      <button
                        key={collective.id}
                        type="button"
                        onClick={() => setSelectedCollectiveId(collective.id)}
                        className={cn(
                          'flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left',
                          'transition-colors duration-150 cursor-pointer select-none',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                          isSelected
                            ? 'bg-primary-50 ring-2 ring-primary-500 shadow-sm'
                            : 'bg-neutral-50 ring-1 ring-neutral-200 hover:bg-neutral-100 hover:ring-neutral-300',
                        )}
                        aria-pressed={isSelected}
                      >
                        {collective.cover_image_url ? (
                          <img
                            src={collective.cover_image_url}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="w-10 h-10 rounded-xl object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
                            <Users size={16} className="text-neutral-400" />
                          </div>
                        )}
                        <div>
                          <p className={cn(
                            'text-sm font-semibold',
                            isSelected ? 'text-neutral-900' : 'text-neutral-700',
                          )}>
                            {collective.name}
                          </p>
                          {collective.region && (
                            <p className="text-xs text-neutral-400">{collective.region}, {collective.state}</p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-neutral-100" />

            {/* Pin toggle */}
            <button
              type="button"
              onClick={() => setIsPinned(!isPinned)}
              className={cn(
                'flex items-center gap-3.5 w-full px-4 py-3.5 rounded-xl',
                'transition-transform duration-150 active:scale-[0.98] cursor-pointer select-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                isPinned
                  ? 'bg-primary-50 ring-2 ring-primary-500 shadow-sm'
                  : 'bg-neutral-50 ring-1 ring-neutral-200 hover:bg-neutral-100 hover:ring-neutral-300',
              )}
              aria-pressed={isPinned}
            >
              <div className={cn(
                'flex items-center justify-center w-10 h-10 rounded-xl shrink-0',
                isPinned
                  ? 'bg-primary-600 text-white'
                  : 'bg-primary-100 text-primary-500',
              )}>
                <Pin size={18} aria-hidden="true" />
              </div>
              <div className="text-left">
                <p className={cn(
                  'text-sm font-semibold',
                  isPinned ? 'text-neutral-900' : 'text-neutral-700',
                )}>
                  Pin to top
                </p>
                <p className={cn(
                  'text-xs',
                  isPinned ? 'text-primary-500' : 'text-neutral-400',
                )}>Stays at the top of the feed</p>
              </div>
            </button>
          </div>
        </div>

        {/* ── Action Buttons ── */}
        <div className="flex items-center gap-3 pb-6">
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            disabled={!canSubmit}
            className={cn(
              'flex items-center justify-center gap-2 h-12 px-6 rounded-xl',
              'text-sm font-semibold',
              'bg-white text-primary-700 ring-1 ring-primary-200',
              'shadow-sm hover:bg-neutral-50',
              'transition-transform duration-150 active:scale-[0.97] cursor-pointer select-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            <Eye size={16} />
            Preview
          </button>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            icon={<Send size={16} />}
            onClick={handleSubmit}
            loading={isSubmitting}
            disabled={!canSubmit || isSubmitting}
            className="h-12"
          >
            Publish
          </Button>
        </div>
      </motion.div>

      {/* Preview sheet – blog-post style */}
      <BottomSheet
        open={showPreview}
        onClose={() => setShowPreview(false)}
        snapPoints={[0.85]}
      >
        <div className="space-y-4 max-h-[75vh] overflow-y-auto">
          <h3 className="font-heading text-lg font-bold text-neutral-900 text-center">
            Preview
          </h3>

          <div
            className="rounded-2xl shadow-sm overflow-hidden bg-white"
          >
            {isPinned && (
              <div className="flex items-center gap-1 px-4 pt-3">
                <Pin size={12} className="text-neutral-500" aria-hidden="true" />
                <span className="text-xs font-semibold text-neutral-500">Pinned</span>
              </div>
            )}

            {/* Preview images */}
            {previews.length > 0 && (
              <div className="mx-4 mt-3">
                {previews.length === 1 ? (
                  <div className="rounded-xl overflow-hidden">
                    <img
                      src={previews[0]}
                      alt=""
                      decoding="async"
                      className="w-full aspect-[16/9] object-cover"
                    />
                  </div>
                ) : (
                  <div className={cn(
                    'grid gap-1.5 rounded-xl overflow-hidden',
                    previews.length === 2 ? 'grid-cols-2' : 'grid-cols-3',
                  )}>
                    {previews.slice(0, 6).map((src, i) => (
                      <div key={i} className={cn(
                        'relative overflow-hidden',
                        previews.length === 2 ? 'aspect-[4/3]' :
                        i === 0 && previews.length >= 3 ? 'col-span-2 row-span-2 aspect-square' : 'aspect-square',
                      )}>
                        <img
                          src={src}
                          alt=""
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                        {i === 5 && previews.length > 6 && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <span className="text-white text-lg font-bold">+{previews.length - 6}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="px-4 pt-3 pb-4">
              <h4 className="font-heading font-bold text-lg text-neutral-900 leading-tight">
                {title || 'Update title'}
              </h4>
              <div className="mt-3 text-sm text-neutral-600 leading-relaxed whitespace-pre-wrap">
                {content || 'Update content will appear here...'}
              </div>
              <div className="flex items-center gap-2.5 mt-4 pt-3 border-t border-neutral-100">
                <Avatar
                  src={profile?.avatar_url}
                  name={profile?.display_name ?? 'Staff'}
                  size="xs"
                />
                <span className="text-xs font-semibold text-neutral-900">
                  {profile?.display_name ?? 'You'}
                </span>
                <span className="text-xs text-neutral-500">Just now</span>
              </div>
            </div>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
