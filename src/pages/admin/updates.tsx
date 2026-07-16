import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion'
import { adminVariants } from '@/lib/admin-motion'
import {
    Plus,
    Megaphone,
    Pin,
    AlertTriangle,
    Globe,
    Users,
    Pencil,
    Trash2,
    Eye,
    Image as ImageIcon,
    X,
    ExternalLink,
    Link as LinkIcon,
    Send,
    Sparkles,
    ChevronRight,
    ArrowLeft,
    Copy,
    Clock,
} from 'lucide-react'
import { useAdminHeader } from '@/components/admin-layout'
import { AdminHeroStat, AdminHeroStatRow } from '@/components/admin-hero-stat'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { SearchBar } from '@/components/search-bar'
import { Skeleton } from '@/components/skeleton'
import { EmptyState } from '@/components/empty-state'
import { BottomSheet } from '@/components/bottom-sheet'
import { ConfirmationSheet } from '@/components/confirmation-sheet'
import { UploadProgress } from '@/components/upload-progress'
import { Avatar } from '@/components/avatar'
import { useToast } from '@/components/toast'
import { cn } from '@/lib/cn'
import { formatDateLong, formatRelative } from '@/lib/date-format'
import { useDelayedLoading } from '@/hooks/use-delayed-loading'
import { useCollectives } from '@/hooks/use-collective'
import { useImageUpload } from '@/hooks/use-image-upload'
import {
    useAdminUpdates,
    useCreateUpdate,
    useUpdateUpdate,
    useDeleteUpdate,
    type AdminUpdate,
} from '@/hooks/use-updates'
import type { Enums } from '@/types/database.types'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function audienceLabel(update: AdminUpdate): string {
  if (update.target_audience === 'collective_specific' && update.collective?.name) {
    return update.collective.name
  }
  return 'All participants'
}

function getImages(update: AdminUpdate): string[] {
  if (update.image_urls && update.image_urls.length > 0) return update.image_urls
  if (update.image_url) return [update.image_url]
  return []
}

/* ------------------------------------------------------------------ */
/*  Render content with clickable links (for preview)                  */
/* ------------------------------------------------------------------ */

// Module-level /g pattern retains lastIndex across calls - must reset
// before each use or later renders skip matches near the start of the text.
const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/g

function RichContent({ text, className }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  LINK_RE.lastIndex = 0

  while ((match = LINK_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    if (match[1] && match[2]) {
      parts.push(
        <a data-eos-href="dynamic" data-eos-href-label="Value" data-eos-href-scope="prop" data-eos-id="src/pages/admin/updates.tsx#0"
          key={key++}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-neutral-600 font-semibold underline underline-offset-2 decoration-primary-300 hover:decoration-primary-500 hover:text-neutral-700 transition-colors"
        >
          {match[1]}
          <ExternalLink data-eos-id="src/pages/admin/updates.tsx#1" size={11} className="shrink-0" />
        </a>,
      )
    } else if (match[3]) {
      parts.push(
        <a data-eos-href="dynamic" data-eos-href-label="Value" data-eos-href-scope="prop" data-eos-id="src/pages/admin/updates.tsx#2"
          key={key++}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-neutral-600 font-semibold underline underline-offset-2 decoration-primary-300 hover:decoration-primary-500 hover:text-neutral-700 transition-colors break-all"
        >
          {match[3]}
          <ExternalLink data-eos-id="src/pages/admin/updates.tsx#3" size={11} className="shrink-0" />
        </a>,
      )
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return <div data-eos-id="src/pages/admin/updates.tsx#4" className={className}>{parts}</div>
}

/* ------------------------------------------------------------------ */
/*  Link inserter helper                                               */
/* ------------------------------------------------------------------ */

function insertLink(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  content: string,
  setContent: (v: string) => void,
  url: string,
  label: string,
) {
  const linkText = label ? `[${label}](${url})` : url
  const el = textareaRef.current
  if (el) {
    const start = el.selectionStart ?? content.length
    const end = el.selectionEnd ?? content.length
    const updated = content.slice(0, start) + linkText + content.slice(end)
    setContent(updated)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + linkText.length
      el.setSelectionRange(pos, pos)
    })
  } else {
    setContent(content + linkText)
  }
}

/* ------------------------------------------------------------------ */
/*  Compose / Edit modal                                               */
/* ------------------------------------------------------------------ */

function ComposeModal({
  open,
  onClose,
  editTarget,
}: {
  open: boolean
  onClose: () => void
  editTarget?: AdminUpdate | null
}) {
  const { toast } = useToast()
  const { data: allCollectives } = useCollectives({ includeNational: true })
  const createUpdate = useCreateUpdate()
  const updateUpdate = useUpdateUpdate()
  const annUpload = useImageUpload({ bucket: 'announcements' })
  const contentRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isEdit = !!editTarget

  const [title, setTitle] = useState(editTarget?.title ?? '')
  const [content, setContent] = useState(editTarget?.content ?? '')
  const [priority, setPriority] = useState<Enums<'update_priority'>>(editTarget?.priority ?? 'normal')
  const [targetAudience, setTargetAudience] = useState<'all' | 'collective_specific'>(
    editTarget?.target_audience === 'collective_specific' ? 'collective_specific' : 'all',
  )
  const [selectedCollectiveId, setSelectedCollectiveId] = useState<string | null>(
    editTarget?.target_collective_id ?? null,
  )
  const [isPinned, setIsPinned] = useState(editTarget?.is_pinned ?? false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [existingImages, setExistingImages] = useState<string[]>(() => editTarget ? getImages(editTarget) : [])
  const [previews, setPreviews] = useState<string[]>([])

  // Link inserter state
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkLabel, setLinkLabel] = useState('')

  const canSubmit =
    title.trim().length > 0 &&
    content.trim().length > 0 &&
    (targetAudience !== 'collective_specific' || !!selectedCollectiveId)

  // Previews use object URLs (synchronous) so preview[i] always lines up
  // with selectedFiles[i]. FileReader readAsDataURL is async per file, so a
  // small file could finish ahead of a large one and the two arrays drift
  // out of order - removing index 0 then removed the wrong preview. Object
  // URLs are revoked on per-item removal and on unmount.
  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return
    const totalCurrent = existingImages.length + selectedFiles.length
    const newFiles = Array.from(files).slice(0, 10 - totalCurrent)
    const newPreviews = newFiles.map((f) => URL.createObjectURL(f))
    setSelectedFiles((prev) => [...prev, ...newFiles])
    setPreviews((prev) => [...prev, ...newPreviews])
  }

  const removeExisting = (index: number) => {
    setExistingImages((prev) => prev.filter((_, i) => i !== index))
  }

  const removeNew = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
    setPreviews((prev) => {
      const url = prev[index]
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
      return prev.filter((_, i) => i !== index)
    })
  }

  useEffect(() => {
    return () => {
      for (const url of previews) {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url)
      }
    }
    // Revoke only on unmount. Per-item revoke happens in removeNew above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleInsertLink = () => {
    if (!linkUrl.trim()) return
    insertLink(contentRef, content, setContent, linkUrl.trim(), linkLabel.trim())
    setLinkUrl('')
    setLinkLabel('')
    setShowLinkInput(false)
  }

  const handleSubmit = async () => {
    if (!canSubmit) return

    try {
      let imageUrls = [...existingImages]
      if (selectedFiles.length > 0) {
        const results = await annUpload.uploadMultiple(selectedFiles)
        imageUrls = [...imageUrls, ...results.map((r) => r.url)]
      }

      if (isEdit) {
        await updateUpdate.mutateAsync({
          id: editTarget!.id,
          title: title.trim(),
          content: content.trim(),
          imageUrls,
          priority,
          targetAudience,
          targetCollectiveId: targetAudience === 'collective_specific' ? selectedCollectiveId : null,
          isPinned,
        })
        toast.success('Update saved')
      } else {
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
      }
      onClose()
    } catch {
      toast.error(isEdit ? 'Failed to save update' : 'Failed to publish update')
    }
  }

  const isSubmitting = annUpload.uploading || createUpdate.isPending || updateUpdate.isPending
  const totalImages = existingImages.length + selectedFiles.length

  const selectedCollective = allCollectives?.find((c) => c.id === selectedCollectiveId)

  return (
    <BottomSheet data-eos-id="src/pages/admin/updates.tsx#5" open={open} onClose={onClose}>
      {/* Header */}
      <div data-eos-id="src/pages/admin/updates.tsx#6" className="flex items-center justify-between mb-4">
        <h2 data-eos-id="src/pages/admin/updates.tsx#7" className="font-heading text-lg font-semibold text-neutral-900">{isEdit ? 'Edit Update' : 'New Update'}</h2>
        <button data-eos-id="src/pages/admin/updates.tsx#8"
          onClick={onClose}
          className="flex items-center justify-center rounded-full min-w-11 min-h-11 text-neutral-400 hover:bg-neutral-50 active:scale-[0.98] transition-[colors,transform] duration-150 cursor-pointer"
          aria-label="Close"
        >
          <X data-eos-id="src/pages/admin/updates.tsx#9" size={20} />
        </button>
      </div>
      <div data-eos-id="src/pages/admin/updates.tsx#10" className="space-y-5 max-h-[70vh] overflow-y-auto pr-1 -mr-1">
        {/* Title */}
        <Input data-eos-id="src/pages/admin/updates.tsx#11"
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give it a title..."
          maxLength={200}
        />

        {/* Content */}
        <div data-eos-id="src/pages/admin/updates.tsx#12">
          <div data-eos-id="src/pages/admin/updates.tsx#13" className="flex items-center justify-between mb-1.5">
            <label data-eos-id="src/pages/admin/updates.tsx#14" className="block text-sm font-semibold text-neutral-900">Content</label>
            <button data-eos-id="src/pages/admin/updates.tsx#15"
              type="button"
              onClick={() => setShowLinkInput(!showLinkInput)}
              className={cn(
                'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-sm',
                'transition-colors duration-150 cursor-pointer select-none',
                showLinkInput
                  ? 'bg-primary-100 text-neutral-700'
                  : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700',
              )}
            >
              <LinkIcon data-eos-id="src/pages/admin/updates.tsx#16" size={12} />
              Insert link
            </button>
          </div>

          {/* Link inserter */}
          <AnimatePresence data-eos-id="src/pages/admin/updates.tsx#17">
            {showLinkInput && (
              <motion.div data-eos-id="src/pages/admin/updates.tsx#18"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden mb-2"
              >
                <div data-eos-id="src/pages/admin/updates.tsx#19" className="flex items-end gap-2 p-3 rounded-sm bg-neutral-50 ring-1 ring-neutral-100">
                  <div data-eos-id="src/pages/admin/updates.tsx#20" className="flex-1 space-y-2">
                    <Input data-eos-id="src/pages/admin/updates.tsx#21"
                      label="URL"
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="https://..."
                      inputClassName="!text-xs"
                    />
                    <Input data-eos-id="src/pages/admin/updates.tsx#22"
                      label="Label (optional)"
                      value={linkLabel}
                      onChange={(e) => setLinkLabel(e.target.value)}
                      placeholder="Click here"
                      inputClassName="!text-xs"
                    />
                  </div>
                  <Button data-eos-id="src/pages/admin/updates.tsx#23"
                    variant="primary"
                    size="sm"
                    onClick={handleInsertLink}
                    disabled={!linkUrl.trim()}
                    className="shrink-0 mb-0.5"
                  >
                    Insert
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <textarea data-eos-id="src/pages/admin/updates.tsx#24"
            ref={contentRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={"Write your update...\n\nYou can insert links using the button above, or paste markdown links like [text](url) directly."}
            rows={8}
            maxLength={10000}
            className={cn(
              'w-full rounded-sm px-4 py-3 text-sm text-neutral-900 leading-relaxed',
              'bg-white ring-1 ring-neutral-100 placeholder:text-neutral-300',
              'focus:outline-none focus:ring-2 focus:ring-primary-400',
              'resize-y min-h-[120px]',
            )}
          />
          <div data-eos-id="src/pages/admin/updates.tsx#25" className="flex items-center justify-between mt-1">
            <div data-eos-id="src/pages/admin/updates.tsx#26" className="flex items-center gap-1.5">
              {content && /\[.+?\]\(https?:\/\/.+?\)/.test(content) && (
                <span data-eos-id="src/pages/admin/updates.tsx#27" className="inline-flex items-center gap-1 text-[11px] text-neutral-400">
                  <ExternalLink data-eos-id="src/pages/admin/updates.tsx#28" size={10} />
                  Links will be clickable
                </span>
              )}
            </div>
            <span data-eos-id="src/pages/admin/updates.tsx#29" className="text-xs text-neutral-300">{content.length}/10,000</span>
          </div>
        </div>

        {/* Images */}
        <div data-eos-id="src/pages/admin/updates.tsx#30">
          <label data-eos-id="src/pages/admin/updates.tsx#31" className="block text-sm font-semibold text-neutral-900 mb-2">
            Images ({totalImages}/10)
          </label>

          {(existingImages.length > 0 || previews.length > 0) && (
            <div data-eos-id="src/pages/admin/updates.tsx#32" className="grid grid-cols-4 gap-2 mb-3">
              {existingImages.map((src, i) => (
                <div data-eos-id="src/pages/admin/updates.tsx#33" key={`existing-${i}`} className="relative aspect-square rounded-sm overflow-hidden group ring-1 ring-neutral-100">
                  <img data-eos-id="src/pages/admin/updates.tsx#34" src={src} alt="" loading="lazy" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                  <button data-eos-id="src/pages/admin/updates.tsx#35"
                    type="button"
                    onClick={() => removeExisting(i)}
                    className="absolute top-1 right-1 flex items-center justify-center w-6 h-6 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
                  >
                    <X data-eos-id="src/pages/admin/updates.tsx#36" size={12} />
                  </button>
                </div>
              ))}
              {previews.map((src, i) => (
                <div data-eos-id="src/pages/admin/updates.tsx#37" key={`new-${i}`} className="relative aspect-square rounded-sm overflow-hidden group ring-1 ring-neutral-100">
                  <img data-eos-id="src/pages/admin/updates.tsx#38" src={src} alt="" loading="lazy" className="w-full h-full object-cover" />
                  <button data-eos-id="src/pages/admin/updates.tsx#39"
                    type="button"
                    onClick={() => removeNew(i)}
                    className="absolute top-1 right-1 flex items-center justify-center w-6 h-6 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
                  >
                    <X data-eos-id="src/pages/admin/updates.tsx#40" size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {totalImages < 10 && (
            <button data-eos-id="src/pages/admin/updates.tsx#41"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex items-center justify-center gap-2 w-full h-16 rounded-sm',
                'border-2 border-dashed border-neutral-100 bg-neutral-50',
                'text-sm text-neutral-500 font-medium',
                'cursor-pointer hover:border-neutral-200 hover:bg-neutral-50',
                'transition-colors duration-150',
              )}
            >
              <ImageIcon data-eos-id="src/pages/admin/updates.tsx#42" size={16} />
              {totalImages > 0 ? 'Add more images' : 'Upload images'}
            </button>
          )}

          <input data-eos-id="src/pages/admin/updates.tsx#43"
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleFilesSelected(e.target.files)}
            className="hidden"
          />

          <UploadProgress data-eos-id="src/pages/admin/updates.tsx#44"
            progress={annUpload.progress}
            uploading={annUpload.uploading}
            error={annUpload.error}
            className="mt-2"
          />
        </div>

        {/* Settings row */}
        <div data-eos-id="src/pages/admin/updates.tsx#45" className="grid grid-cols-2 gap-3">
          {/* Priority */}
          <div data-eos-id="src/pages/admin/updates.tsx#46">
            <label data-eos-id="src/pages/admin/updates.tsx#47" className="block text-sm font-semibold text-neutral-900 mb-2">Priority</label>
            <div data-eos-id="src/pages/admin/updates.tsx#48" className="flex gap-2">
              <button data-eos-id="src/pages/admin/updates.tsx#49"
                type="button"
                onClick={() => setPriority('normal')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 h-10 rounded-sm text-xs font-semibold',
                  'transition-colors duration-150 cursor-pointer select-none',
                  priority === 'normal'
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-primary-50 text-neutral-600 ring-1 ring-primary-200/60 hover:bg-primary-100',
                )}
              >
                <Sparkles data-eos-id="src/pages/admin/updates.tsx#50" size={12} /> Normal
              </button>
              <button data-eos-id="src/pages/admin/updates.tsx#51"
                type="button"
                onClick={() => setPriority('urgent')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 h-10 rounded-sm text-xs font-semibold',
                  'transition-colors duration-150 cursor-pointer select-none',
                  priority === 'urgent'
                    ? 'bg-warning-500 text-white shadow-sm'
                    : 'bg-warning-50 text-warning-700 ring-1 ring-warning-200/60 hover:bg-warning-100',
                )}
              >
                <AlertTriangle data-eos-id="src/pages/admin/updates.tsx#52" size={12} /> Urgent
              </button>
            </div>
          </div>

          {/* Pin */}
          <div data-eos-id="src/pages/admin/updates.tsx#53">
            <label data-eos-id="src/pages/admin/updates.tsx#54" className="block text-sm font-semibold text-neutral-900 mb-2">Pinned</label>
            <button data-eos-id="src/pages/admin/updates.tsx#55"
              type="button"
              onClick={() => setIsPinned(!isPinned)}
              className={cn(
                'flex items-center justify-center gap-1.5 w-full h-10 rounded-sm text-xs font-semibold',
                'transition-colors duration-150 cursor-pointer select-none',
                isPinned
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-primary-50 text-neutral-600 ring-1 ring-primary-200/60 hover:bg-primary-100',
              )}
            >
              <Pin data-eos-id="src/pages/admin/updates.tsx#56" size={12} />
              {isPinned ? 'Pinned' : 'Not pinned'}
            </button>
          </div>
        </div>

        {/* Target audience - simplified: national or specific collective */}
        <div data-eos-id="src/pages/admin/updates.tsx#57">
          <label data-eos-id="src/pages/admin/updates.tsx#58" className="block text-sm font-semibold text-neutral-900 mb-2">
            Who sees this?
          </label>
          <div data-eos-id="src/pages/admin/updates.tsx#59" className="flex gap-2 mb-3">
            <button data-eos-id="src/pages/admin/updates.tsx#60"
              type="button"
              onClick={() => { setTargetAudience('all'); setSelectedCollectiveId(null) }}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 h-11 rounded-sm text-sm font-semibold',
                'transition-colors duration-150 cursor-pointer select-none',
                targetAudience === 'all'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-primary-50 text-neutral-600 ring-1 ring-primary-200/60 hover:bg-primary-100',
              )}
            >
              <Globe data-eos-id="src/pages/admin/updates.tsx#61" size={14} /> All Participants
            </button>
            <button data-eos-id="src/pages/admin/updates.tsx#62"
              type="button"
              onClick={() => setTargetAudience('collective_specific')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 h-11 rounded-sm text-sm font-semibold',
                'transition-colors duration-150 cursor-pointer select-none',
                targetAudience === 'collective_specific'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-primary-50 text-neutral-600 ring-1 ring-primary-200/60 hover:bg-primary-100',
              )}
            >
              <Users data-eos-id="src/pages/admin/updates.tsx#63" size={14} /> Specific Collective
            </button>
          </div>

          {/* Collective picker */}
          <AnimatePresence data-eos-id="src/pages/admin/updates.tsx#64">
            {targetAudience === 'collective_specific' && (
              <motion.div data-eos-id="src/pages/admin/updates.tsx#65"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div data-eos-id="src/pages/admin/updates.tsx#66" className="space-y-1.5 max-h-48 overflow-y-auto rounded-sm ring-1 ring-neutral-100 p-2 bg-neutral-50">
                  {(allCollectives ?? []).map((c) => {
                    const isSelected = selectedCollectiveId === c.id
                    return (
                      <button data-eos-id="src/pages/admin/updates.tsx#67"
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCollectiveId(c.id)}
                        className={cn(
                          'flex items-center gap-2.5 w-full px-3 py-2.5 rounded-sm text-left',
                          'transition-colors duration-150 cursor-pointer select-none',
                          isSelected
                            ? 'bg-primary-100 ring-1 ring-primary-400'
                            : 'hover:bg-neutral-50',
                        )}
                      >
                        {c.cover_image_url ? (
                          <img data-eos-id="src/pages/admin/updates.tsx#68" src={c.cover_image_url} alt="" loading="lazy" className="w-8 h-8 rounded-sm object-cover shrink-0" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                        ) : (
                          <div data-eos-id="src/pages/admin/updates.tsx#69" className="w-8 h-8 rounded-sm bg-primary-100 flex items-center justify-center shrink-0">
                            <Users data-eos-id="src/pages/admin/updates.tsx#70" size={14} className="text-neutral-400" />
                          </div>
                        )}
                        <div data-eos-id="src/pages/admin/updates.tsx#71" className="min-w-0">
                          <p data-eos-id="src/pages/admin/updates.tsx#72" data-eos-var="c.name" data-eos-var-label="Name" data-eos-var-scope="item" className={cn('text-sm font-semibold truncate', isSelected ? 'text-neutral-900' : 'text-neutral-700')}>
                            {c.name}
                          </p>
                          {c.region && (
                            <p data-eos-id="src/pages/admin/updates.tsx#73" data-eos-var="c.region,c.state" data-eos-var-label="Region, State" data-eos-var-scope="item" className="text-[11px] text-neutral-400">{c.region}, {c.state}</p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Targeting hint */}
          <p data-eos-id="src/pages/admin/updates.tsx#74" data-eos-var="selectedCollective.name" data-eos-var-label="Name" data-eos-var-scope="prop" className="mt-2 text-[11px] text-neutral-400 leading-relaxed">
            {targetAudience === 'all'
              ? 'This will be visible to every participant in the app, nationally.'
              : selectedCollective
                ? `Only members of ${selectedCollective.name} will see this update.`
                : 'Choose a collective above to target this update.'}
          </p>
        </div>

        {/* Actions */}
        <div data-eos-id="src/pages/admin/updates.tsx#75" className="flex items-center gap-3 pt-2">
          <Button data-eos-id="src/pages/admin/updates.tsx#76" variant="ghost" onClick={onClose} className="flex-shrink-0">
            Cancel
          </Button>
          <Button data-eos-id="src/pages/admin/updates.tsx#77"
            variant="primary"
            fullWidth
            icon={<Send data-eos-id="src/pages/admin/updates.tsx#78" size={16} />}
            onClick={handleSubmit}
            loading={isSubmitting}
            disabled={!canSubmit || isSubmitting}
          >
            {isEdit ? 'Save Changes' : 'Publish Update'}
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}

/* ------------------------------------------------------------------ */
/*  Detail panel - shown in the right column when an update is         */
/*  selected, giving admin a full preview + management actions         */
/* ------------------------------------------------------------------ */

function DetailPanel({
  update,
  onClose,
  onEdit,
  onDelete,
  reducedMotion,
}: {
  update: AdminUpdate
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  reducedMotion: boolean
}) {
  const images = getImages(update)
  const isUrgent = update.priority === 'urgent'
  const { toast } = useToast()

  const handleCopyContent = useCallback(() => {
    navigator.clipboard.writeText(update.content)
    toast.success('Content copied')
  }, [update.content, toast])

  return (
    <motion.div data-eos-id="src/pages/admin/updates.tsx#79"
      initial={reducedMotion ? false : { opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reducedMotion ? undefined : { opacity: 0, x: 12 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="h-full flex flex-col bg-white rounded-md shadow-sm ring-1 ring-neutral-100 overflow-hidden"
    >
      {/* Header */}
      <div data-eos-id="src/pages/admin/updates.tsx#80" className="flex items-center justify-between px-3 py-2 border-b border-neutral-100 shrink-0">
        <button data-eos-id="src/pages/admin/updates.tsx#81"
          type="button"
          onClick={onClose}
          className={cn(
            'flex items-center justify-center',
            'w-11 h-11 -ml-1 rounded-full',
            'text-neutral-900 hover:bg-neutral-100',
            'cursor-pointer select-none transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
          )}
          aria-label="Go back"
        >
          <ArrowLeft data-eos-id="src/pages/admin/updates.tsx#82" size={22} />
        </button>
        <div data-eos-id="src/pages/admin/updates.tsx#83" className="flex items-center gap-1">
          <button data-eos-id="src/pages/admin/updates.tsx#84"
            type="button"
            onClick={handleCopyContent}
            className="p-2 rounded-sm text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 transition-colors cursor-pointer"
            title="Copy content"
          >
            <Copy data-eos-id="src/pages/admin/updates.tsx#85" size={15} />
          </button>
          <button data-eos-id="src/pages/admin/updates.tsx#86"
            type="button"
            onClick={onEdit}
            className="p-2 rounded-sm text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 transition-colors cursor-pointer"
            title="Edit"
          >
            <Pencil data-eos-id="src/pages/admin/updates.tsx#87" size={15} />
          </button>
          <button data-eos-id="src/pages/admin/updates.tsx#88"
            type="button"
            onClick={onDelete}
            className="p-2 rounded-sm text-neutral-400 hover:bg-error-50 hover:text-error-600 transition-colors cursor-pointer"
            title="Delete"
          >
            <Trash2 data-eos-id="src/pages/admin/updates.tsx#89" size={15} />
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div data-eos-id="src/pages/admin/updates.tsx#90" className="flex-1 overflow-y-auto">
        {/* Hero image */}
        {images.length > 0 && (
          <div data-eos-id="src/pages/admin/updates.tsx#91" className="relative">
            <img data-eos-id="src/pages/admin/updates.tsx#92"
              src={images[0]}
              alt=""
              className="w-full aspect-[16/9] object-cover"
            />
            {images.length > 1 && (
              <span data-eos-id="src/pages/admin/updates.tsx#93" className="absolute bottom-2 right-2 inline-flex items-center gap-1 text-[10px] font-bold text-white bg-black/50 px-2 py-1 rounded-full backdrop-blur-sm">
                <ImageIcon data-eos-id="src/pages/admin/updates.tsx#94" size={10} /> {images.length}
              </span>
            )}
          </div>
        )}

        <div data-eos-id="src/pages/admin/updates.tsx#95" className="p-4 space-y-4">
          {/* Badges */}
          <div data-eos-id="src/pages/admin/updates.tsx#96" className="flex items-center gap-2 flex-wrap">
            {update.is_pinned && (
              <span data-eos-id="src/pages/admin/updates.tsx#97" className="inline-flex items-center gap-1 text-[10px] font-bold text-neutral-600 bg-primary-50 px-2 py-0.5 rounded-full">
                <Pin data-eos-id="src/pages/admin/updates.tsx#98" size={10} /> Pinned
              </span>
            )}
            {isUrgent && (
              <span data-eos-id="src/pages/admin/updates.tsx#99" className="inline-flex items-center gap-1 text-[10px] font-bold text-warning-700 bg-warning-50 px-2 py-0.5 rounded-full">
                <AlertTriangle data-eos-id="src/pages/admin/updates.tsx#100" size={10} /> Urgent
              </span>
            )}
            <span data-eos-id="src/pages/admin/updates.tsx#101" className={cn(
              'inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full',
              update.target_audience === 'collective_specific'
                ? 'bg-accent-50 text-accent-700'
                : 'bg-sprout-50 text-sprout-700',
            )}>
              {update.target_audience === 'collective_specific' ? <Users data-eos-id="src/pages/admin/updates.tsx#102" size={10} /> : <Globe data-eos-id="src/pages/admin/updates.tsx#103" size={10} />}
              {audienceLabel(update)}
            </span>
          </div>

          {/* Title */}
          <h2 data-eos-id="src/pages/admin/updates.tsx#104" data-eos-var="update.title" data-eos-var-label="Title" data-eos-var-scope="prop" className="font-heading text-lg font-bold text-neutral-900 leading-tight">
            {update.title}
          </h2>

          {/* Author + meta */}
          <div data-eos-id="src/pages/admin/updates.tsx#105" className="flex items-center gap-3 pb-3 border-b border-neutral-100">
            <Avatar data-eos-id="src/pages/admin/updates.tsx#106"
              src={update.author?.avatar_url}
              name={update.author?.display_name ?? 'Staff'}
              size="sm"
            />
            <div data-eos-id="src/pages/admin/updates.tsx#107" className="flex-1 min-w-0">
              <p data-eos-id="src/pages/admin/updates.tsx#108" data-eos-var="update.author.display_name" data-eos-var-label="Display name" data-eos-var-scope="prop" className="text-sm font-semibold text-neutral-900">
                {update.author?.display_name ?? 'Co-Exist Team'}
              </p>
              <div data-eos-id="src/pages/admin/updates.tsx#109" className="flex items-center gap-2 mt-0.5">
                <span data-eos-id="src/pages/admin/updates.tsx#110" data-eos-var="update.created_at" data-eos-var-label="Created at" data-eos-var-scope="prop" className="text-[11px] text-neutral-400 flex items-center gap-1">
                  <Clock data-eos-id="src/pages/admin/updates.tsx#111" size={10} />
                  {formatDateLong(update.created_at ?? '')}
                </span>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div data-eos-id="src/pages/admin/updates.tsx#112" className="flex items-center gap-4 py-2 px-3 rounded-sm bg-neutral-50">
            <div data-eos-id="src/pages/admin/updates.tsx#113" className="flex items-center gap-1.5">
              <Eye data-eos-id="src/pages/admin/updates.tsx#114" size={13} className="text-neutral-400" />
              <span data-eos-id="src/pages/admin/updates.tsx#115" data-eos-var="update.read_count" data-eos-var-label="Read count" data-eos-var-scope="prop" className="text-xs font-semibold text-neutral-700">{update.read_count}</span>
              <span data-eos-id="src/pages/admin/updates.tsx#116" className="text-[11px] text-neutral-400">read</span>
            </div>
            {images.length > 0 && (
              <div data-eos-id="src/pages/admin/updates.tsx#117" className="flex items-center gap-1.5">
                <ImageIcon data-eos-id="src/pages/admin/updates.tsx#118" size={13} className="text-neutral-400" />
                <span data-eos-id="src/pages/admin/updates.tsx#119" className="text-xs font-semibold text-neutral-700">{images.length}</span>
                <span data-eos-id="src/pages/admin/updates.tsx#120" className="text-[11px] text-neutral-400">{images.length === 1 ? 'image' : 'images'}</span>
              </div>
            )}
          </div>

          {/* Content preview with clickable links */}
          <RichContent data-eos-id="src/pages/admin/updates.tsx#121"
            text={update.content}
            className="text-sm text-neutral-700 leading-[1.8] whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
          />

          {/* Extra images */}
          {images.length > 1 && (
            <div data-eos-id="src/pages/admin/updates.tsx#122" className="space-y-2">
              {images.slice(1).map((src, i) => (
                <div data-eos-id="src/pages/admin/updates.tsx#123" key={i} className="rounded-sm overflow-hidden ring-1 ring-black/[0.04]">
                  <img data-eos-id="src/pages/admin/updates.tsx#124" src={src} alt="" loading="lazy" className="w-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div data-eos-id="src/pages/admin/updates.tsx#125" className="shrink-0 px-4 py-3 border-t border-neutral-100 flex items-center gap-2">
        <Button data-eos-id="src/pages/admin/updates.tsx#126"
          variant="secondary"
          size="sm"
          icon={<Pencil data-eos-id="src/pages/admin/updates.tsx#127" size={14} />}
          onClick={onEdit}
          className="flex-1"
        >
          Edit
        </Button>
        <Button data-eos-id="src/pages/admin/updates.tsx#128"
          variant="danger"
          size="sm"
          icon={<Trash2 data-eos-id="src/pages/admin/updates.tsx#129" size={14} />}
          onClick={onDelete}
          className="flex-1"
        >
          Delete
        </Button>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Update row card                                                    */
/* ------------------------------------------------------------------ */

function UpdateRow({
  update,
  onEdit,
  onDelete,
  onSelect,
  isSelected,
  index,
  reducedMotion,
}: {
  update: AdminUpdate
  onEdit: () => void
  onDelete: () => void
  onSelect: () => void
  isSelected: boolean
  index: number
  reducedMotion: boolean
}) {
  const images = getImages(update)
  const isUrgent = update.priority === 'urgent'

  return (
    <motion.div data-eos-id="src/pages/admin/updates.tsx#130"
      initial={reducedMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.025, 0.2), duration: 0.2, ease: 'easeOut' }}
      onClick={onSelect}
      className={cn(
        'flex items-start gap-3.5 p-4 rounded-sm bg-white cursor-pointer',
        'ring-1 transition-all duration-150',
        isSelected
          ? 'ring-primary-400 shadow-sm bg-primary-50'
          : 'ring-neutral-100 shadow-sm hover:shadow-sm hover:ring-neutral-200',
        isUrgent && !isSelected && 'ring-warning-200/60',
      )}
    >
      {/* Thumbnail */}
      {images.length > 0 ? (
        <img data-eos-id="src/pages/admin/updates.tsx#131"
          src={images[0]}
          alt=""
          className="w-14 h-14 rounded-sm object-cover shrink-0 ring-1 ring-black/[0.04]"
        />
      ) : (
        <div data-eos-id="src/pages/admin/updates.tsx#132" className="w-14 h-14 rounded-sm bg-white border border-neutral-100 flex items-center justify-center shrink-0">
          <Megaphone data-eos-id="src/pages/admin/updates.tsx#133" size={20} className="text-neutral-400" />
        </div>
      )}

      {/* Info */}
      <div data-eos-id="src/pages/admin/updates.tsx#134" className="flex-1 min-w-0">
        <div data-eos-id="src/pages/admin/updates.tsx#135" className="flex items-center gap-1.5 mb-0.5 flex-wrap">
          <h3 data-eos-id="src/pages/admin/updates.tsx#136" data-eos-var="update.title" data-eos-var-label="Title" data-eos-var-scope="prop" className="text-sm font-semibold text-neutral-900 truncate max-w-[200px] sm:max-w-none">
            {update.title}
          </h3>
          {update.is_pinned && (
            <span data-eos-id="src/pages/admin/updates.tsx#137" className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-neutral-500 bg-primary-50 px-1.5 py-0.5 rounded-full shrink-0">
              <Pin data-eos-id="src/pages/admin/updates.tsx#138" size={8} /> Pinned
            </span>
          )}
          {isUrgent && (
            <span data-eos-id="src/pages/admin/updates.tsx#139" className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-warning-700 bg-warning-50 px-1.5 py-0.5 rounded-full shrink-0">
              <AlertTriangle data-eos-id="src/pages/admin/updates.tsx#140" size={8} /> Urgent
            </span>
          )}
        </div>

        <p data-eos-id="src/pages/admin/updates.tsx#141" data-eos-var="update.content" data-eos-var-label="Content" data-eos-var-scope="prop" className="text-xs text-neutral-500 line-clamp-1 mb-1.5">{update.content}</p>

        <div data-eos-id="src/pages/admin/updates.tsx#142" className="flex items-center gap-2 flex-wrap">
          {/* Author */}
          <div data-eos-id="src/pages/admin/updates.tsx#143" className="flex items-center gap-1.5">
            <Avatar data-eos-id="src/pages/admin/updates.tsx#144"
              src={update.author?.avatar_url}
              name={update.author?.display_name ?? 'Staff'}
              size="xs"
            />
            <span data-eos-id="src/pages/admin/updates.tsx#145" data-eos-var="update.author.display_name" data-eos-var-label="Display name" data-eos-var-scope="prop" className="text-[11px] font-medium text-neutral-600">
              {update.author?.display_name ?? 'Staff'}
            </span>
          </div>
          <span data-eos-id="src/pages/admin/updates.tsx#146" data-eos-var="update.created_at" data-eos-var-label="Created at" data-eos-var-scope="prop" className="text-[10px] text-neutral-300">{formatRelative(update.created_at ?? '')}</span>

          {/* Audience badge */}
          <span data-eos-id="src/pages/admin/updates.tsx#147" className={cn(
            'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0',
            update.target_audience === 'collective_specific'
              ? 'bg-accent-50 text-accent-700'
              : 'bg-sprout-50 text-sprout-700',
          )}>
            {update.target_audience === 'collective_specific' ? <Users data-eos-id="src/pages/admin/updates.tsx#148" size={9} /> : <Globe data-eos-id="src/pages/admin/updates.tsx#149" size={9} />}
            {audienceLabel(update)}
          </span>

          {/* Read count */}
          <span data-eos-id="src/pages/admin/updates.tsx#150" data-eos-var="update.read_count" data-eos-var-label="Read count" data-eos-var-scope="prop" className="inline-flex items-center gap-0.5 text-[10px] text-neutral-400 shrink-0 ml-auto">
            <Eye data-eos-id="src/pages/admin/updates.tsx#151" size={9} /> {update.read_count}
          </span>

          {images.length > 0 && (
            <span data-eos-id="src/pages/admin/updates.tsx#152" className="inline-flex items-center gap-0.5 text-[10px] text-neutral-300 shrink-0">
              <ImageIcon data-eos-id="src/pages/admin/updates.tsx#153" size={9} /> {images.length}
            </span>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div data-eos-id="src/pages/admin/updates.tsx#154" className="flex items-center gap-0.5 shrink-0">
        <button data-eos-id="src/pages/admin/updates.tsx#155"
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          className="p-2 rounded-sm text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 transition-colors cursor-pointer"
          title="Edit"
        >
          <Pencil data-eos-id="src/pages/admin/updates.tsx#156" size={15} />
        </button>
        <button data-eos-id="src/pages/admin/updates.tsx#157"
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="p-2 rounded-sm text-neutral-400 hover:bg-error-50 hover:text-error-600 transition-colors cursor-pointer"
          title="Delete"
        >
          <Trash2 data-eos-id="src/pages/admin/updates.tsx#158" size={15} />
        </button>
        <ChevronRight data-eos-id="src/pages/admin/updates.tsx#159" size={14} className="text-neutral-300 ml-0.5" />
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

type AudienceFilter = 'all' | 'national' | 'collective'

export default function AdminUpdatesPage() {
  const shouldReduceMotion = useReducedMotion()
  const rm = !!shouldReduceMotion
  const { toast } = useToast()

  const [search, setSearch] = useState('')
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>('all')
  const [showCompose, setShowCompose] = useState(false)
  const [editTarget, setEditTarget] = useState<AdminUpdate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminUpdate | null>(null)
  const [selectedUpdate, setSelectedUpdate] = useState<AdminUpdate | null>(null)

  const { data: updates, isLoading } = useAdminUpdates()
  const showLoading = useDelayedLoading(isLoading)
  const deleteMutation = useDeleteUpdate()

  // Filter
  const filtered = useMemo(() => {
    let list = updates ?? []

    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (u) =>
          u.title.toLowerCase().includes(q) ||
          u.content.toLowerCase().includes(q) ||
          u.author?.display_name?.toLowerCase().includes(q) ||
          u.collective?.name?.toLowerCase().includes(q),
      )
    }

    if (audienceFilter === 'national') {
      list = list.filter((u) => u.target_audience === 'all' || u.target_audience === 'leaders')
    } else if (audienceFilter === 'collective') {
      list = list.filter((u) => u.target_audience === 'collective_specific')
    }

    return list
  }, [updates, search, audienceFilter])

  // Stats
  const stats = useMemo(() => {
    const all = updates ?? []
    return {
      total: all.length,
      pinned: all.filter((u) => u.is_pinned).length,
      urgent: all.filter((u) => u.priority === 'urgent').length,
      collective: all.filter((u) => u.target_audience === 'collective_specific').length,
    }
  }, [updates])

  // Keep selected update in sync with data
  const activeUpdate = useMemo(() => {
    if (!selectedUpdate) return null
    return (updates ?? []).find((u) => u.id === selectedUpdate.id) ?? null
  }, [selectedUpdate, updates])

  // Delete handler
  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync(deleteTarget.id)
      toast.success('Update deleted')
      if (selectedUpdate?.id === deleteTarget.id) setSelectedUpdate(null)
    } catch {
      toast.error('Failed to delete update')
    }
    setDeleteTarget(null)
  }

  // Hero
  const heroActions = useMemo(() => (
    <Button data-eos-id="src/pages/admin/updates.tsx#160"
      variant="primary"
      size="sm"
      icon={<Plus data-eos-id="src/pages/admin/updates.tsx#161" size={16} />}
      onClick={() => { setEditTarget(null); setShowCompose(true) }}
    >
      New Update
    </Button>
  ), [])

  const heroStats = useMemo(() => (
    <AdminHeroStatRow data-eos-id="src/pages/admin/updates.tsx#162">
      <AdminHeroStat data-eos-id="src/pages/admin/updates.tsx#163" value={stats.total} label="Total" icon={<Megaphone data-eos-id="src/pages/admin/updates.tsx#164" size={18} />} color="primary" delay={0} reducedMotion={rm} />
      <AdminHeroStat data-eos-id="src/pages/admin/updates.tsx#165" value={stats.pinned} label="Pinned" icon={<Pin data-eos-id="src/pages/admin/updates.tsx#166" size={18} />} color="moss" delay={1} reducedMotion={rm} />
      <AdminHeroStat data-eos-id="src/pages/admin/updates.tsx#167" value={stats.urgent} label="Urgent" icon={<AlertTriangle data-eos-id="src/pages/admin/updates.tsx#168" size={18} />} color="warning" delay={2} reducedMotion={rm} />
      <AdminHeroStat data-eos-id="src/pages/admin/updates.tsx#169" value={stats.collective} label="Targeted" icon={<Users data-eos-id="src/pages/admin/updates.tsx#170" size={18} />} color="sprout" delay={3} reducedMotion={rm} />
    </AdminHeroStatRow>
  ), [stats, rm])

  useAdminHeader('Updates', { actions: heroActions, heroContent: heroStats })

  const { stagger, fadeUp } = adminVariants(rm)

  return (
    <div data-eos-id="src/pages/admin/updates.tsx#171">
      <motion.div data-eos-id="src/pages/admin/updates.tsx#172" variants={stagger} initial="hidden" animate="visible">
        {/* Filters */}
        <motion.div data-eos-id="src/pages/admin/updates.tsx#173" variants={fadeUp} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
          <SearchBar data-eos-id="src/pages/admin/updates.tsx#174"
            value={search}
            onChange={setSearch}
            placeholder="Search updates..."
            compact
            className="flex-1"
          />
          <div data-eos-id="src/pages/admin/updates.tsx#175" className="flex items-center gap-0.5 rounded-sm shadow-sm bg-white p-0.5">
            {([
              { key: 'all', label: 'All' },
              { key: 'national', label: 'National' },
              { key: 'collective', label: 'Collective' },
            ] as const).map((f) => (
              <button data-eos-id="src/pages/admin/updates.tsx#176" data-eos-var="f.label" data-eos-var-label="Label" data-eos-var-scope="item"
                key={f.key}
                type="button"
                onClick={() => setAudienceFilter(f.key)}
                className={cn(
                  'px-3.5 min-h-11 rounded-sm text-sm font-semibold',
                  'transition-colors duration-150 cursor-pointer select-none',
                  audienceFilter === f.key
                    ? 'bg-primary-100 text-neutral-900'
                    : 'text-neutral-400 hover:text-neutral-600',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Content - list + optional detail panel */}
        <motion.div data-eos-id="src/pages/admin/updates.tsx#177" variants={fadeUp}>
          <div data-eos-id="src/pages/admin/updates.tsx#178" className="flex gap-4">
            {/* Update list */}
            <div data-eos-id="src/pages/admin/updates.tsx#179" className={cn(
              'transition-all duration-200',
              activeUpdate ? 'w-full lg:w-1/2 xl:w-[45%]' : 'w-full',
            )}>
              {showLoading ? (
                <Skeleton data-eos-id="src/pages/admin/updates.tsx#180" variant="list-item" count={5} />
              ) : !filtered.length ? (
                <EmptyState data-eos-id="src/pages/admin/updates.tsx#181"
                  illustration="empty"
                  title="No updates found"
                  description={search ? 'Try a different search term' : 'Publish your first update to get started'}
                  action={
                    !search
                      ? { label: 'New Update', onClick: () => { setEditTarget(null); setShowCompose(true) } }
                      : undefined
                  }
                />
              ) : (
                <div data-eos-id="src/pages/admin/updates.tsx#182" className="space-y-2">
                  {filtered.map((u, i) => (
                    <UpdateRow data-eos-id="src/pages/admin/updates.tsx#183"
                      key={u.id}
                      update={u}
                      index={i}
                      reducedMotion={rm}
                      isSelected={activeUpdate?.id === u.id}
                      onSelect={() => setSelectedUpdate(activeUpdate?.id === u.id ? null : u)}
                      onEdit={() => { setEditTarget(u); setShowCompose(true) }}
                      onDelete={() => setDeleteTarget(u)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Detail panel - desktop, slides in from right */}
            <AnimatePresence data-eos-id="src/pages/admin/updates.tsx#184" mode="wait">
              {activeUpdate && (
                <div data-eos-id="src/pages/admin/updates.tsx#185" className="hidden lg:block lg:w-1/2 xl:w-[55%] sticky top-0 h-[calc(100vh-12rem)]">
                  <DetailPanel data-eos-id="src/pages/admin/updates.tsx#186"
                    key={activeUpdate.id}
                    update={activeUpdate}
                    onClose={() => setSelectedUpdate(null)}
                    onEdit={() => { setEditTarget(activeUpdate); setShowCompose(true) }}
                    onDelete={() => setDeleteTarget(activeUpdate)}
                    reducedMotion={rm}
                  />
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* Mobile detail - full overlay.
              Padding accounts for the device safe areas (top: notch/dynamic
              island; bottom: home indicator) AND the global admin bottom tab
              bar (56px, same z-50, wins by DOM order). Without these, the
              back button hides under the dynamic island and the
              edit/delete footer hides behind the tab bar. */}
          <AnimatePresence data-eos-id="src/pages/admin/updates.tsx#187">
            {activeUpdate && (
              <motion.div data-eos-id="src/pages/admin/updates.tsx#188"
                initial={rm ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="lg:hidden fixed inset-0 z-50 bg-white"
                style={{
                  paddingTop: 'var(--safe-top, 0px)',
                  paddingBottom: 'calc(56px + var(--safe-bottom, 0px) + 0.75rem)',
                }}
              >
                <DetailPanel data-eos-id="src/pages/admin/updates.tsx#189"
                  key={`mobile-${activeUpdate.id}`}
                  update={activeUpdate}
                  onClose={() => setSelectedUpdate(null)}
                  onEdit={() => { setEditTarget(activeUpdate); setShowCompose(true) }}
                  onDelete={() => setDeleteTarget(activeUpdate)}
                  reducedMotion={rm}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>

      {/* Compose / Edit modal */}
      {showCompose && (
        <ComposeModal data-eos-id="src/pages/admin/updates.tsx#190"
          open={showCompose}
          onClose={() => { setShowCompose(false); setEditTarget(null) }}
          editTarget={editTarget}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmationSheet data-eos-id="src/pages/admin/updates.tsx#191"
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Update"
        description={`Are you sure you want to delete "${deleteTarget?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  )
}
