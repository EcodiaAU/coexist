import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import {
  Plus,
  Sparkles,
  Image as ImageIcon,
  X,
  Trash2,
  Pencil,
  Eye,
  Power,
  Clock,
} from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { AdminHeroStat, AdminHeroStatRow } from '@/components/admin-hero-stat'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { UploadProgress } from '@/components/upload-progress'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { formatRelative } from '@/lib/date-format'
import { useImageUpload } from '@/hooks/use-image-upload'
import { AnnouncementModalContent } from '@/components/announcement-modal'
import {
  useAdminAnnouncements,
  useUpsertAnnouncement,
  useSetAnnouncementActive,
  useDeleteAnnouncement,
  type AnnouncementModal,
} from '@/hooks/use-announcement-modal'

/* ------------------------------------------------------------------ */
/*  Existing announcement row                                          */
/* ------------------------------------------------------------------ */

function AnnouncementRow({
  announcement,
  isEditing,
  onEdit,
  onToggleActive,
  onDelete,
  togglePending,
}: {
  announcement: AnnouncementModal
  isEditing: boolean
  onEdit: () => void
  onToggleActive: () => void
  onDelete: () => void
  togglePending: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3.5 p-4 rounded-sm bg-white ring-1 shadow-sm transition-all duration-150',
        isEditing ? 'ring-primary-400 bg-primary-50' : 'ring-neutral-100',
      )}
    >
      {announcement.image_url ? (
        <img
          src={announcement.image_url}
          alt=""
          className="w-14 h-14 rounded-sm object-cover shrink-0 ring-1 ring-black/[0.04]"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      ) : (
        <div className="w-14 h-14 rounded-sm bg-white border border-neutral-100 flex items-center justify-center shrink-0">
          <Sparkles size={20} className="text-neutral-400" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
          <h3 className="text-sm font-semibold text-neutral-900 truncate max-w-[200px] sm:max-w-none">
            {announcement.title}
          </h3>
          {announcement.is_active ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary-800 bg-primary-100 px-1.5 py-0.5 rounded-full shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-600" /> Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-neutral-500 bg-neutral-50 px-1.5 py-0.5 rounded-full shrink-0">
              Draft
            </span>
          )}
        </div>
        <p className="text-xs text-neutral-500 line-clamp-1 mb-1.5">{announcement.body}</p>
        <span className="text-[10px] text-neutral-300 flex items-center gap-1">
          <Clock size={10} /> Updated {formatRelative(announcement.updated_at)}
        </span>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={onToggleActive}
          disabled={togglePending}
          className={cn(
            'p-2 rounded-sm transition-colors cursor-pointer disabled:opacity-50',
            announcement.is_active
              ? 'text-primary-700 hover:bg-primary-50'
              : 'text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600',
          )}
          title={announcement.is_active ? 'Deactivate' : 'Set active'}
        >
          <Power size={15} />
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="p-2 rounded-sm text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 transition-colors cursor-pointer"
          title="Edit"
        >
          <Pencil size={15} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-2 rounded-sm text-neutral-400 hover:bg-error-50 hover:text-error-600 transition-colors cursor-pointer"
          title="Delete"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AdminAnnouncementPage() {
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const { toast } = useToast()

  const { data: announcements, isLoading } = useAdminAnnouncements()
  const upsert = useUpsertAnnouncement()
  const setActive = useSetAnnouncementActive()
  const deleteAnnouncement = useDeleteAnnouncement()
  const imageUpload = useImageUpload({ bucket: 'announcements' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Composer state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [ctaLabel, setCtaLabel] = useState('')
  const [ctaHref, setCtaHref] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementModal | null>(null)

  const didInit = useRef(false)

  const resetForm = () => {
    setEditingId(null)
    setTitle('')
    setBody('')
    setImageUrl(null)
    setCtaLabel('')
    setCtaHref('')
    setIsActive(true)
    setSelectedFile(null)
    setPreviewUrl((prev) => { if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev); return null })
  }

  const loadIntoForm = (a: AnnouncementModal) => {
    setEditingId(a.id)
    setTitle(a.title)
    setBody(a.body)
    setImageUrl(a.image_url)
    setCtaLabel(a.cta_label ?? '')
    setCtaHref(a.cta_href ?? '')
    setIsActive(a.is_active)
    setSelectedFile(null)
    setPreviewUrl((prev) => { if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev); return null })
  }

  // On first data load, pre-load the active (or most recent) announcement so the
  // admin edits "the current announcement" rather than a blank form.
  useEffect(() => {
    if (didInit.current) return
    if (!announcements) return
    didInit.current = true
    const current = announcements.find((a) => a.is_active) ?? announcements[0]
    if (current) loadIntoForm(current)
  }, [announcements])

  // Revoke the local preview object URL on unmount.
  useEffect(() => {
    return () => { if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFileSelected = (file: File | null) => {
    if (!file) return
    setSelectedFile(file)
    setPreviewUrl((prev) => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
  }

  const removeImage = () => {
    setSelectedFile(null)
    setImageUrl(null)
    setPreviewUrl((prev) => { if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev); return null })
  }

  const canSave = title.trim().length > 0 && body.trim().length > 0
  const isSaving = imageUpload.uploading || upsert.isPending

  const handleSave = async () => {
    if (!canSave) return
    try {
      let finalImageUrl = imageUrl
      if (selectedFile) {
        const result = await imageUpload.upload(selectedFile)
        finalImageUrl = result.url
      }
      const saved = await upsert.mutateAsync({
        id: editingId ?? undefined,
        title: title.trim(),
        body: body.trim(),
        image_url: finalImageUrl,
        cta_label: ctaLabel.trim() || null,
        cta_href: ctaHref.trim() || null,
        is_active: isActive,
      })
      setEditingId(saved.id)
      setImageUrl(saved.image_url)
      setSelectedFile(null)
      setPreviewUrl((prev) => { if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev); return null })
      toast.success(isActive ? 'Announcement published' : 'Announcement saved')
    } catch {
      toast.error('Failed to save announcement')
    }
  }

  const handleToggleActive = async (a: AnnouncementModal) => {
    try {
      await setActive.mutateAsync({ id: a.id, active: !a.is_active })
      if (editingId === a.id) setIsActive(!a.is_active)
      toast.success(a.is_active ? 'Announcement deactivated' : 'Announcement set active')
    } catch {
      toast.error('Failed to update announcement')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteAnnouncement.mutateAsync(deleteTarget.id)
      if (editingId === deleteTarget.id) resetForm()
      toast.success('Announcement deleted')
    } catch {
      toast.error('Failed to delete announcement')
    }
    setDeleteTarget(null)
  }

  const stats = useMemo(() => {
    const all = announcements ?? []
    return {
      total: all.length,
      active: all.filter((a) => a.is_active).length,
    }
  }, [announcements])

  const heroActions = useMemo(() => (
    <Button variant="primary" size="sm" icon={<Plus size={16} />} onClick={resetForm}>
      New
    </Button>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [])

  const heroStats = useMemo(() => {
    if (stats.total === 0) return undefined
    return (
      <AdminHeroStatRow>
        <AdminHeroStat value={stats.total} label="Total" icon={<Sparkles size={18} />} color="primary" delay={0} reducedMotion={rm} />
        <AdminHeroStat value={stats.active} label="Active" icon={<Power size={18} />} color="moss" delay={1} reducedMotion={rm} />
      </AdminHeroStatRow>
    )
  }, [stats, rm])

  useAdminHeader('Announcement', { actions: heroActions, heroContent: heroStats })

  const { stagger, fadeUp } = adminVariants(rm)

  // Build the live preview object from the current form state.
  const previewAnnouncement: AnnouncementModal = {
    id: editingId ?? 'preview',
    author_id: null,
    title: title.trim() || 'Your announcement title',
    body: body.trim() || 'Your message to members appears here. Keep it short and promote the one thing you want them to see.',
    image_url: previewUrl ?? imageUrl,
    cta_label: ctaLabel.trim() || null,
    cta_href: ctaHref.trim() || null,
    is_active: isActive,
    created_at: '',
    updated_at: '',
  }

  return (
    <div>
      <motion.div variants={stagger} initial="hidden" animate="visible">
        <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Composer */}
          <div className="space-y-5">
            <div className="rounded-md bg-white ring-1 ring-neutral-100 shadow-sm p-4 sm:p-5 space-y-5">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-sm bg-primary-100 text-primary-700">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h2 className="font-heading text-base font-semibold text-neutral-900">
                    {editingId ? 'Edit announcement' : 'New announcement'}
                  </h2>
                  <p className="text-[11px] text-neutral-400">Pops up once per member on their next app open</p>
                </div>
              </div>

              <Input
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What do you want members to see?"
                maxLength={120}
              />

              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-1.5">Message</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="A short message promoting the feature or update..."
                  rows={5}
                  maxLength={1000}
                  className={cn(
                    'w-full rounded-sm px-4 py-3 text-sm text-neutral-900 leading-relaxed',
                    'bg-white ring-1 ring-neutral-100 placeholder:text-neutral-300',
                    'focus:outline-none focus:ring-2 focus:ring-primary-400',
                    'resize-y min-h-[110px]',
                  )}
                />
                <div className="flex justify-end mt-1">
                  <span className="text-xs text-neutral-300">{body.length}/1,000</span>
                </div>
              </div>

              {/* Image */}
              <div>
                <label className="block text-sm font-semibold text-neutral-900 mb-2">Image (optional)</label>
                {(previewUrl || imageUrl) ? (
                  <div className="relative rounded-sm overflow-hidden ring-1 ring-neutral-100 aspect-[16/9]">
                    <img src={previewUrl ?? imageUrl ?? ''} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={removeImage}
                      className="absolute top-2 right-2 flex items-center justify-center w-8 h-8 rounded-full bg-black/60 text-white cursor-pointer hover:bg-black/70 transition-colors"
                      aria-label="Remove image"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      'flex items-center justify-center gap-2 w-full h-16 rounded-sm',
                      'border-2 border-dashed border-neutral-100 bg-neutral-50',
                      'text-sm text-neutral-500 font-medium',
                      'cursor-pointer hover:border-neutral-200 transition-colors duration-150',
                    )}
                  >
                    <ImageIcon size={16} /> Upload image
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileSelected(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
                <UploadProgress
                  progress={imageUpload.progress}
                  uploading={imageUpload.uploading}
                  error={imageUpload.error}
                  className="mt-2"
                />
              </div>

              {/* CTA */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Button label (optional)"
                  value={ctaLabel}
                  onChange={(e) => setCtaLabel(e.target.value)}
                  placeholder="e.g. See what's new"
                  maxLength={40}
                />
                <Input
                  label="Button link (optional)"
                  value={ctaHref}
                  onChange={(e) => setCtaHref(e.target.value)}
                  placeholder="/campouts or https://..."
                  maxLength={500}
                />
              </div>
              <p className="-mt-2 text-[11px] text-neutral-400 leading-relaxed">
                Link to an in-app page (starts with /) or a full web address. Leave both blank for a message-only pop-up.
              </p>

              {/* Active toggle */}
              <button
                type="button"
                onClick={() => setIsActive((v) => !v)}
                className={cn(
                  'flex items-center gap-3 w-full text-left p-3 rounded-sm ring-1 transition-colors duration-150 cursor-pointer',
                  isActive ? 'bg-primary-50 ring-primary-200' : 'bg-neutral-50 ring-neutral-100',
                )}
              >
                <span
                  className={cn(
                    'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors',
                    isActive ? 'bg-primary-600' : 'bg-neutral-200',
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform',
                      isActive ? 'translate-x-4' : 'translate-x-0.5',
                    )}
                  />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-neutral-900">
                    {isActive ? 'Active' : 'Draft'}
                  </span>
                  <span className="block text-[11px] text-neutral-400 leading-relaxed">
                    {isActive
                      ? 'Members see this once on their next app open. Editing it shows it again to everyone.'
                      : 'Saved but not shown to members until you set it active.'}
                  </span>
                </span>
              </button>

              <div className="flex items-center gap-3 pt-1">
                {editingId && (
                  <Button variant="ghost" onClick={resetForm} className="shrink-0">
                    Cancel
                  </Button>
                )}
                <Button
                  variant="primary"
                  fullWidth
                  loading={isSaving}
                  disabled={!canSave || isSaving}
                  onClick={handleSave}
                >
                  {editingId ? 'Save changes' : isActive ? 'Publish announcement' : 'Save draft'}
                </Button>
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div className="lg:sticky lg:top-0 self-start">
            <div className="flex items-center gap-1.5 mb-2 text-[11px] uppercase tracking-[0.15em] font-bold text-neutral-400">
              <Eye size={12} /> Preview
            </div>
            <div className="rounded-md bg-surface-1 ring-1 ring-neutral-100 p-4 sm:p-6 flex items-start justify-center">
              <div className="w-full max-w-md bg-surface-0 rounded-md shadow-sm px-5 py-6">
                <AnnouncementModalContent
                  announcement={previewAnnouncement}
                  onCta={() => {}}
                  onDismiss={() => {}}
                  preview
                />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Existing announcements */}
        <motion.div variants={fadeUp} className="mt-8">
          <h2 className="text-[11px] uppercase tracking-[0.15em] font-bold text-neutral-400 mb-3">
            All announcements
          </h2>
          {isLoading ? (
            <Skeleton variant="list-item" count={3} />
          ) : !announcements || announcements.length === 0 ? (
            <EmptyState
              illustration="empty"
              title="No announcements yet"
              description="Compose one above. It will pop up once for each member on their next app open."
            />
          ) : (
            <div className="space-y-2">
              {announcements.map((a) => (
                <AnnouncementRow
                  key={a.id}
                  announcement={a}
                  isEditing={editingId === a.id}
                  onEdit={() => loadIntoForm(a)}
                  onToggleActive={() => handleToggleActive(a)}
                  onDelete={() => setDeleteTarget(a)}
                  togglePending={setActive.isPending}
                />
              ))}
            </div>
          )}
        </motion.div>
      </motion.div>

      <ConfirmationSheet
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete announcement"
        description={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  )
}
