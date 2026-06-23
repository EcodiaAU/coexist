import { useState, useCallback, useRef, useMemo } from 'react'
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core'
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
    GripVertical,
    FileText,
    Video,
    FileDown,
    Images,
    CircleDot,
    Trash2,
    Pencil,
    Plus,
    Type,
    X,
    Upload,
    Link as LinkIcon,
    Check,
    Presentation,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { SearchBar } from '@/components/search-bar'
import { UploadProgress } from '@/components/upload-progress'
import { cn } from '@/lib/cn'
import { useFileUpload } from '@/hooks/use-file-upload'
import { useImageUpload } from '@/hooks/use-image-upload'
import { useDevQuizzes, type ContentBlockInput, type DevContentType } from '@/hooks/use-admin-development'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const BLOCK_TYPES: { type: DevContentType; label: string; desc: string; icon: React.ReactNode; color: string }[] = [
  { type: 'text', label: 'Text', desc: 'Rich markdown content', icon: <Type size={18} />, color: 'bg-primary-100 text-primary-700' },
  { type: 'video', label: 'Video', desc: 'Upload or embed a video', icon: <Video size={18} />, color: 'bg-sky-100 text-sky-700' },
  { type: 'file', label: 'Document', desc: 'PDF, PowerPoint, or slides', icon: <FileDown size={18} />, color: 'bg-bark-100 text-bark-700' },
  { type: 'slideshow', label: 'Slideshow', desc: 'Image gallery with captions', icon: <Images size={18} />, color: 'bg-secondary-100 text-secondary-700' },
  { type: 'quiz', label: 'Quiz', desc: 'Assessment checkpoint', icon: <CircleDot size={18} />, color: 'bg-moss-100 text-moss-700' },
]

function blockMeta(type: DevContentType) {
  return BLOCK_TYPES.find((bt) => bt.type === type) ?? BLOCK_TYPES[0]
}

/* ------------------------------------------------------------------ */
/*  Drop zone component                                                */
/* ------------------------------------------------------------------ */

function DropZone({
  accept,
  label,
  hint,
  onFiles,
  uploading,
  progress,
  error,
  children,
}: {
  accept: string
  label: string
  hint?: string
  onFiles: (files: FileList) => void
  uploading: boolean
  progress: number | null
  error: string | null
  children?: React.ReactNode
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files)
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={cn(
          'relative flex flex-col items-center justify-center py-8 px-4 rounded-sm border-2 border-dashed transition-colors cursor-pointer',
          'active:scale-[0.98]',
          dragOver
            ? 'border-primary-400 bg-primary-50 scale-[1.01]'
            : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300 hover:bg-neutral-100',
          uploading && 'pointer-events-none opacity-70',
        )}
      >
        <Upload size={24} className="text-neutral-400 mb-2" />
        <p className="text-sm font-semibold text-neutral-900">{label}</p>
        {hint && <p className="text-xs text-neutral-500 mt-0.5 text-center">{hint}</p>}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => e.target.files && onFiles(e.target.files)}
          multiple={accept.startsWith('image/')}
        />
      </div>
      <UploadProgress progress={progress} uploading={uploading} error={error} />
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Slideshow slide item                                               */
/* ------------------------------------------------------------------ */

interface SlideItem {
  url: string
  caption: string
}

function SlideCard({
  slide,
  index,
  onUpdateCaption,
  onRemove,
}: {
  slide: SlideItem
  index: number
  onUpdateCaption: (caption: string) => void
  onRemove: () => void
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="flex gap-3 p-2.5 rounded-sm bg-white border border-neutral-100 shadow-sm"
    >
      <img
        src={slide.url}
        alt={slide.caption || `Slide ${index + 1}`}
        loading="lazy"
        decoding="async"
        className="w-16 h-16 sm:w-20 sm:h-20 rounded-sm object-cover shrink-0 bg-primary-100"
      />
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
        <p className="text-[11px] text-neutral-500 font-medium">Slide {index + 1}</p>
        <Input
          label="Caption"
          value={slide.caption}
          onChange={(e) => onUpdateCaption(e.target.value)}
          placeholder="Add a caption..."
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="flex items-center justify-center w-8 h-8 rounded-sm text-error-300 hover:text-error-500 hover:bg-error-50 transition-colors self-center shrink-0"
      >
        <Trash2 size={14} />
      </button>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Quiz picker                                                        */
/* ------------------------------------------------------------------ */

function QuizPicker({
  value,
  onChange,
}: {
  value: string | null
  onChange: (quizId: string | null) => void
}) {
  const { data: quizzes = [], isLoading } = useDevQuizzes()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(!value)

  const selected = quizzes.find((q) => q.id === value)
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return quizzes.filter((quiz) => !q || quiz.title.toLowerCase().includes(q))
  }, [quizzes, search])

  if (selected && !open) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-sm bg-moss-50 border border-moss-200">
        <CircleDot size={16} className="text-moss-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-moss-800 truncate">{selected.title}</p>
          <p className="text-xs text-moss-500">Pass: {selected.pass_score}% · {selected.max_attempts === 0 ? 'Unlimited' : selected.max_attempts} attempts</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => setOpen(true)} className="text-xs text-moss-500 hover:text-moss-700 font-semibold">Change</button>
          <button type="button" onClick={() => onChange(null)} className="text-error-400 hover:text-error-600 ml-1"><X size={14} /></button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <SearchBar value={search} onChange={setSearch} placeholder="Search quizzes..." compact />
      {isLoading ? (
        <p className="text-xs text-neutral-500 text-center py-4">Loading quizzes...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-6 rounded-sm border-2 border-dashed border-neutral-200 bg-neutral-50">
          <CircleDot size={24} className="text-neutral-400 mx-auto mb-1" />
          <p className="text-xs text-neutral-500">
            {quizzes.length === 0 ? 'No quizzes yet  create one first' : 'No matching quizzes'}
          </p>
        </div>
      ) : (
        <div className="max-h-48 overflow-y-auto space-y-1 rounded-sm border border-neutral-200 p-1.5">
          {filtered.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => { onChange(q.id); setOpen(false); setSearch('') }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-left transition-colors',
                value === q.id ? 'bg-moss-50 ring-1 ring-moss-300' : 'hover:bg-neutral-50 active:bg-neutral-100',
              )}
            >
              <CircleDot size={14} className="text-moss-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900 truncate">{q.title}</p>
                <p className="text-xs text-neutral-500">Pass: {q.pass_score}%</p>
              </div>
              {value === q.id && <Check size={14} className="text-moss-600 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Sortable block card                                                */
/* ------------------------------------------------------------------ */

function SortableBlock({
  block,
  index,
  onEdit,
  onRemove,
}: {
  block: ContentBlockInput & { _key: string }
  index: number
  onEdit: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block._key,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const meta = blockMeta(block.content_type)
  const preview = getBlockPreview(block)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-start gap-3 rounded-sm border border-white/60 bg-white/80 p-3.5 shadow-sm transition-shadow',
        isDragging && 'shadow-sm ring-2 ring-primary-300/50 z-10',
      )}
    >
      <button
        type="button"
        className="mt-1 cursor-grab touch-none text-primary-300 hover:text-primary-500 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} />
      </button>

      {/* Thumbnail for visual types */}
      {block.content_type === 'slideshow' && block.image_urls?.[0] && (
        <img src={block.image_urls[0]} alt="" loading="lazy" decoding="async" className="w-10 h-10 rounded-sm object-cover shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold', meta.color)}>
            {meta.icon}
            {meta.label}
          </span>
          <span className="text-xs text-neutral-500 tabular-nums">#{index + 1}</span>
          {block.title && (
            <span className="text-sm font-medium text-neutral-900 truncate">{block.title}</span>
          )}
        </div>
        {preview && (
          <p className="text-xs text-neutral-500 line-clamp-1 mt-0.5">{preview}</p>
        )}
      </div>

      <div className="flex items-center gap-0.5 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center justify-center w-9 h-9 rounded-sm text-primary-400 hover:text-primary-600 hover:bg-neutral-100 transition-colors"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="flex items-center justify-center w-9 h-9 rounded-sm text-error-400 hover:text-error-600 hover:bg-error-100/60 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

function getBlockPreview(block: ContentBlockInput): string {
  switch (block.content_type) {
    case 'text':
      return block.text_content?.slice(0, 100) ?? ''
    case 'video':
      return block.video_url ? (block.video_provider === 'upload' ? block.file_name ?? 'Uploaded video' : block.video_url) : 'No video'
    case 'file':
      return block.file_name ?? 'No file attached'
    case 'slideshow':
      return `${block.image_urls?.length ?? 0} slide${(block.image_urls?.length ?? 0) !== 1 ? 's' : ''}`
    case 'quiz':
      return block.quiz_id ? 'Quiz attached' : 'No quiz selected'
    default:
      return ''
  }
}

/* ------------------------------------------------------------------ */
/*  Block edit form  real uploads, proper UX                          */
/* ------------------------------------------------------------------ */

function BlockEditForm({
  block,
  onSave,
  onCancel,
}: {
  block: ContentBlockInput
  onSave: (updated: ContentBlockInput) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<ContentBlockInput>({ ...block })
  const meta = blockMeta(draft.content_type)

  // Upload hooks
  const fileUpload = useFileUpload({ bucket: 'dev-assets', pathPrefix: 'files', maxSizeMB: 50 })
  const videoUpload = useFileUpload({ bucket: 'dev-assets', pathPrefix: 'videos', maxSizeMB: 50 })
  const imageUpload = useImageUpload({ bucket: 'dev-assets', pathPrefix: 'slides' })

  // Slideshow slides as unified array
  const slides: SlideItem[] = (draft.image_urls ?? []).map((url, i) => ({
    url,
    caption: (draft.image_captions ?? [])[i] ?? '',
  }))

  const setSlides = (updated: SlideItem[]) => {
    setDraft({
      ...draft,
      image_urls: updated.map((s) => s.url),
      image_captions: updated.map((s) => s.caption),
    })
  }

  const handleImageFiles = async (files: FileList) => {
    const newSlides = [...slides]
    for (let i = 0; i < files.length; i++) {
      try {
        const result = await imageUpload.upload(files[i])
        newSlides.push({ url: result.url, caption: '' })
      } catch { /* error shown by hook */ }
    }
    setSlides(newSlides)
  }

  const handleVideoFile = async (files: FileList) => {
    const file = files[0]
    if (!file) return
    try {
      const result = await videoUpload.upload(file)
      setDraft((d) => ({ ...d, video_url: result.url, video_provider: 'upload', file_name: file.name }))
    } catch { /* error shown by hook */ }
  }

  const handleDocFile = async (files: FileList) => {
    const file = files[0]
    if (!file) return
    try {
      const result = await fileUpload.upload(file)
      setDraft((d) => ({ ...d, file_url: result.url, file_name: result.fileName, file_size_bytes: file.size }))
    } catch { /* error shown by hook */ }
  }

  const isUploading = fileUpload.uploading || videoUpload.uploading || imageUpload.uploading

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="rounded-sm border-2 border-neutral-200 bg-neutral-50 p-4 sm:p-5 space-y-4 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold', meta.color)}>
            {meta.icon}
            {meta.label}
          </span>
          <span className="text-sm font-semibold text-neutral-900">Edit Block</span>
        </div>
        <button type="button" onClick={onCancel} className="flex items-center justify-center w-9 h-9 rounded-sm text-primary-400 hover:text-primary-600 hover:bg-neutral-100 transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Title (all types) */}
      <Input
        label="Block Title (optional)"
        value={draft.title ?? ''}
        onChange={(e) => setDraft({ ...draft, title: e.target.value || null })}
        placeholder="e.g. Introduction"
      />

      {/* ─── TEXT ─── */}
      {draft.content_type === 'text' && (
        <Input type="textarea" label="Content" value={draft.text_content ?? ''} onChange={(e) => setDraft({ ...draft, text_content: e.target.value })} placeholder="Write your content in Markdown..." rows={6} />
      )}

      {/* ─── VIDEO ─── */}
      {draft.content_type === 'video' && (
        <div className="space-y-3">
          {/* Source toggle */}
          <div>
            <label className="block text-sm font-medium text-neutral-900 mb-1.5">Video Source</label>
            <div className="flex gap-2">
              {([
                { key: 'upload', label: 'Upload', icon: <Upload size={14} /> },
                { key: 'youtube', label: 'YouTube', icon: <Video size={14} /> },
                { key: 'vimeo', label: 'Vimeo', icon: <Video size={14} /> },
              ] as const).map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setDraft({ ...draft, video_provider: p.key, video_url: p.key !== draft.video_provider ? '' : draft.video_url })}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-sm text-sm font-semibold transition-transform active:scale-[0.97]',
                    draft.video_provider === p.key
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'bg-white text-neutral-500 border border-neutral-200 hover:border-neutral-300',
                  )}
                >
                  {p.icon}
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {draft.video_provider === 'upload' ? (
            draft.video_url ? (
              <div className="flex items-center gap-3 p-3 rounded-sm bg-sky-50 border border-sky-200">
                <Video size={18} className="text-sky-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-sky-800 truncate">{draft.file_name ?? 'Uploaded video'}</p>
                  <p className="text-xs text-sky-500">Ready</p>
                </div>
                <button type="button" onClick={() => setDraft({ ...draft, video_url: null, file_name: null })} className="text-error-400 hover:text-error-600">
                  <Trash2 size={14} />
                </button>
              </div>
            ) : (
              <DropZone
                accept="video/mp4,video/webm,video/quicktime"
                label="Drop a video file or tap to browse"
                hint="MP4, WebM, or MOV (max 50MB)"
                onFiles={handleVideoFile}
                uploading={videoUpload.uploading}
                progress={videoUpload.progress}
                error={videoUpload.error}
              />
            )
          ) : (
            <Input
              label="Embed URL"
              value={draft.video_url ?? ''}
              onChange={(e) => setDraft({ ...draft, video_url: e.target.value })}
              placeholder={
                draft.video_provider === 'youtube'
                  ? 'https://www.youtube.com/watch?v=...'
                  : 'https://vimeo.com/...'
              }
              icon={<LinkIcon size={14} />}
            />
          )}
        </div>
      )}

      {/* ─── FILE / DOCUMENT ─── */}
      {draft.content_type === 'file' && (
        <div className="space-y-3">
          {draft.file_url ? (
            <div className="flex items-center gap-3 p-3.5 rounded-sm bg-bark-50 border border-bark-200">
              <div className="flex items-center justify-center w-10 h-10 rounded-sm bg-bark-100 shrink-0">
                {draft.file_name?.endsWith('.pdf') ? <FileDown size={18} className="text-bark-600" /> : <Presentation size={18} className="text-bark-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-bark-800 truncate">{draft.file_name}</p>
                <p className="text-xs text-bark-500">
                  {draft.file_size_bytes ? `${(draft.file_size_bytes / (1024 * 1024)).toFixed(1)} MB` : 'Uploaded'}
                </p>
              </div>
              <button type="button" onClick={() => setDraft({ ...draft, file_url: null, file_name: null, file_size_bytes: null })} className="text-error-400 hover:text-error-600">
                <Trash2 size={14} />
              </button>
            </div>
          ) : (
            <DropZone
              accept=".pdf,.pptx,.ppt,.key,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              label="Drop a document or tap to browse"
              hint="PDF, PowerPoint (.pptx), or Keynote (max 50MB)"
              onFiles={handleDocFile}
              uploading={fileUpload.uploading}
              progress={fileUpload.progress}
              error={fileUpload.error}
            />
          )}
          <p className="text-xs text-neutral-500">
            Supports PDF, PowerPoint, and Google Slides (export as .pptx first)
          </p>
        </div>
      )}

      {/* ─── SLIDESHOW ─── */}
      {draft.content_type === 'slideshow' && (
        <div className="space-y-3">
          {/* Existing slides */}
          {slides.length > 0 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-900">
                Slides ({slides.length})
              </label>
              <AnimatePresence mode="popLayout">
                {slides.map((slide, i) => (
                  <SlideCard
                    key={`${slide.url}-${i}`}
                    slide={slide}
                    index={i}
                    onUpdateCaption={(caption) => {
                      const updated = [...slides]
                      updated[i] = { ...updated[i], caption }
                      setSlides(updated)
                    }}
                    onRemove={() => {
                      setSlides(slides.filter((_, j) => j !== i))
                    }}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Add more images */}
          <DropZone
            accept="image/jpeg,image/png,image/webp,image/gif"
            label={slides.length > 0 ? 'Add more slides' : 'Drop images or tap to browse'}
            hint="JPEG, PNG, WebP, or GIF  select multiple"
            onFiles={handleImageFiles}
            uploading={imageUpload.uploading}
            progress={imageUpload.progress}
            error={imageUpload.error}
          />
        </div>
      )}

      {/* ─── QUIZ ─── */}
      {draft.content_type === 'quiz' && (
        <div>
          <label className="block text-sm font-medium text-neutral-900 mb-2">Select a Quiz</label>
          <QuizPicker
            value={draft.quiz_id ?? null}
            onChange={(id) => setDraft({ ...draft, quiz_id: id })}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={() => onSave(draft)} disabled={isUploading}>
          Save Block
        </Button>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main block editor component                                        */
/* ------------------------------------------------------------------ */

interface BlockEditorProps {
  blocks: (ContentBlockInput & { _key: string })[]
  onChange: (blocks: (ContentBlockInput & { _key: string })[]) => void
  className?: string
}

let nextKey = 0
// eslint-disable-next-line react-refresh/only-export-components
export function generateBlockKey() {
  return `block-${Date.now()}-${nextKey++}`
}

export function BlockEditor({ blocks, onChange, className }: BlockEditorProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [showTypePicker, setShowTypePicker] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (over && active.id !== over.id) {
        const oldIndex = blocks.findIndex((b) => b._key === active.id)
        const newIndex = blocks.findIndex((b) => b._key === over.id)
        const reordered = arrayMove(blocks, oldIndex, newIndex).map((b, i) => ({
          ...b,
          sort_order: i,
        }))
        onChange(reordered)
      }
    },
    [blocks, onChange],
  )

  const addBlock = (type: DevContentType) => {
    const newBlock: ContentBlockInput & { _key: string } = {
      _key: generateBlockKey(),
      content_type: type,
      sort_order: blocks.length,
      title: null,
      text_content: type === 'text' ? '' : null,
      video_url: null,
      video_provider: type === 'video' ? 'upload' : null,
      file_url: null,
      file_name: null,
      file_size_bytes: null,
      image_urls: [],
      image_captions: [],
      quiz_id: null,
    }
    onChange([...blocks, newBlock])
    setEditingKey(newBlock._key)
    setShowTypePicker(false)
  }

  const updateBlock = (key: string, updated: ContentBlockInput) => {
    onChange(blocks.map((b) => (b._key === key ? { ...updated, _key: key } : b)))
    setEditingKey(null)
  }

  const removeBlock = (key: string) => {
    onChange(
      blocks
        .filter((b) => b._key !== key)
        .map((b, i) => ({ ...b, sort_order: i })),
    )
    if (editingKey === key) setEditingKey(null)
  }

  return (
    <div className={cn('space-y-3', className)}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={blocks.map((b) => b._key)} strategy={verticalListSortingStrategy}>
          <AnimatePresence mode="popLayout">
            {blocks.map((block, index) => (
              <motion.div
                key={block._key}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {editingKey === block._key ? (
                  <BlockEditForm
                    block={block}
                    onSave={(updated) => updateBlock(block._key, updated)}
                    onCancel={() => setEditingKey(null)}
                  />
                ) : (
                  <SortableBlock
                    block={block}
                    index={index}
                    onEdit={() => setEditingKey(block._key)}
                    onRemove={() => removeBlock(block._key)}
                  />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </SortableContext>
      </DndContext>

      {/* Empty state */}
      {blocks.length === 0 && !showTypePicker && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-12 rounded-sm border-2 border-dashed border-neutral-200 bg-neutral-50"
        >
          <FileText size={32} className="text-neutral-400 mb-3" />
          <p className="text-sm font-medium text-neutral-500 mb-1">No content blocks yet</p>
          <p className="text-xs text-neutral-400 mb-4">Add blocks to build your module</p>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setShowTypePicker(true)}>
            Add First Block
          </Button>
        </motion.div>
      )}

      {/* Add block picker  full-width cards for better touch targets */}
      {(blocks.length > 0 || showTypePicker) && (
        <div className="pt-1">
          {showTypePicker ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-1.5 p-3 rounded-sm bg-neutral-50 border border-neutral-100"
            >
              {BLOCK_TYPES.map((bt) => (
                <button
                  key={bt.type}
                  type="button"
                  onClick={() => addBlock(bt.type)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 min-h-[52px] rounded-sm text-left transition-transform active:scale-[0.98]',
                    'bg-white border border-neutral-100 hover:border-neutral-300 hover:shadow-sm',
                  )}
                >
                  <span className={cn('flex items-center justify-center w-9 h-9 rounded-sm shrink-0', bt.color)}>
                    {bt.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">{bt.label}</p>
                    <p className="text-xs text-neutral-500">{bt.desc}</p>
                  </div>
                  <Plus size={16} className="text-neutral-400 shrink-0" />
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowTypePicker(false)}
                className="w-full flex items-center justify-center gap-1 min-h-[44px] rounded-sm text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
              >
                <X size={14} />
                Cancel
              </button>
            </motion.div>
          ) : (
            <button
              type="button"
              onClick={() => setShowTypePicker(true)}
              className="inline-flex items-center gap-1.5 px-4 min-h-[48px] rounded-sm border border-dashed border-neutral-300 text-sm font-semibold text-neutral-500 hover:border-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 transition-transform active:scale-[0.98] w-full justify-center"
            >
              <Plus size={15} />
              Add Block
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default BlockEditor
