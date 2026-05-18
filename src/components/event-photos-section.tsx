import { useState, useMemo } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Camera, ImagePlus, X, Trash2, Share2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAuth } from '@/hooks/use-auth'
import { useEventPhotos, useUploadEventPhoto, useDeleteEventPhoto, type EventPhoto } from '@/hooks/use-event-photos'
import { useCamera } from '@/hooks/use-camera'
import { useToast } from '@/components/toast'
import { Button } from '@/components/button'
import { Avatar } from '@/components/avatar'

interface EventPhotosSectionProps {
  eventId: string
  /** True if the viewer attended (or leads) - controls whether the upload CTA is shown. */
  canUpload: boolean
  /** End time of the event in ISO. Used to phrase the invite ("just happened" vs "from last year"). */
  eventEndIso?: string | null
  /** Title of the event for the recap header. */
  eventTitle: string
}

const MAX_PER_UPLOAD = 10

export function EventPhotosSection({
  eventId,
  canUpload,
  eventEndIso,
  eventTitle,
}: EventPhotosSectionProps) {
  const shouldReduceMotion = useReducedMotion()
  const { user } = useAuth()
  const { toast } = useToast()
  const { data: photos = [], isLoading } = useEventPhotos(eventId)
  const upload = useUploadEventPhoto(eventId)
  const delPhoto = useDeleteEventPhoto(eventId)
  const camera = useCamera()
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [uploadCount, setUploadCount] = useState({ done: 0, total: 0 })

  const isRecent = useMemo(() => {
    if (!eventEndIso) return false
    const ageMs = Date.now() - new Date(eventEndIso).getTime()
    return ageMs >= 0 && ageMs < 14 * 24 * 60 * 60 * 1000 // within 2 weeks
  }, [eventEndIso])

  async function handleCapture() {
    const result = await camera.capture()
    if (!result) return
    try {
      await upload.mutateAsync({ blob: result.blob })
      toast.success('Photo added to the album')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    }
  }

  async function handlePickMultiple() {
    // Multi-pick via plain file input - works on web + native via Capacitor's
    // bridged input. We cap at MAX_PER_UPLOAD to keep the UX predictable.
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = true
    input.onchange = async () => {
      const files = Array.from(input.files ?? []).slice(0, MAX_PER_UPLOAD)
      if (files.length === 0) return
      setUploadCount({ done: 0, total: files.length })
      let ok = 0
      let fail = 0
      for (const f of files) {
        try {
          await upload.mutateAsync({ blob: f })
          ok++
        } catch {
          fail++
        }
        setUploadCount((p) => ({ ...p, done: p.done + 1 }))
      }
      setUploadCount({ done: 0, total: 0 })
      if (ok > 0) toast.success(`Added ${ok} photo${ok !== 1 ? 's' : ''}`)
      if (fail > 0) toast.error(`${fail} upload${fail !== 1 ? 's' : ''} failed`)
    }
    input.click()
  }

  const uploaderIds = new Set(photos.map((p) => p.uploaded_by))
  const uploaderCount = uploaderIds.size
  const totalPhotos = photos.length

  return (
    <section className="w-full">
      {/* Header */}
      <div className="flex items-end justify-between mb-3">
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-bold text-neutral-900 leading-tight">
            Photos
          </h2>
          {totalPhotos > 0 && (
            <p className="text-[12px] text-neutral-500 mt-0.5">
              {totalPhotos} from {uploaderCount} {uploaderCount === 1 ? 'person' : 'people'}
            </p>
          )}
        </div>
        {canUpload && totalPhotos > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePickMultiple}
              className="flex items-center gap-1.5 text-xs font-semibold text-primary-700 bg-primary-50 px-3 py-1.5 rounded-full active:scale-[0.97] transition-transform duration-150"
            >
              <ImagePlus size={14} /> Add
            </button>
          </div>
        )}
      </div>

      {/* Empty state -> inviting upload CTA */}
      {!isLoading && totalPhotos === 0 && canUpload && (
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl bg-gradient-to-br from-primary-100 via-primary-50 to-success-50 p-6 text-center ring-1 ring-primary-100/60"
        >
          <div className="mx-auto w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center mb-3">
            <Camera size={26} className="text-primary-600" />
          </div>
          <p className="font-heading text-base font-bold text-neutral-900">
            {isRecent ? 'Share your photos from this event' : 'Add to the photo album'}
          </p>
          <p className="text-[13px] text-neutral-600 mt-1 max-w-xs mx-auto">
            Pictures live here forever so the memory stays with the collective.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mt-4">
            <Button onClick={handleCapture} variant="primary" icon={<Camera size={16} />} disabled={camera.loading || upload.isPending}>
              Take a photo
            </Button>
            <Button onClick={handlePickMultiple} variant="secondary" icon={<ImagePlus size={16} />} disabled={upload.isPending}>
              Choose from gallery
            </Button>
          </div>
        </motion.div>
      )}

      {/* Empty state - no upload permission */}
      {!isLoading && totalPhotos === 0 && !canUpload && (
        <div className="rounded-2xl bg-neutral-50 p-5 text-center">
          <p className="text-sm text-neutral-500">No photos yet for this event.</p>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-3 gap-1.5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="aspect-square rounded-xl bg-neutral-100 animate-pulse" style={{ animationDelay: `${i * 50}ms` }} />
          ))}
        </div>
      )}

      {/* Photo grid */}
      {!isLoading && totalPhotos > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setLightboxIndex(i)}
              className="relative aspect-square rounded-xl overflow-hidden bg-neutral-100 active:scale-[0.97] transition-transform duration-150"
              aria-label="View photo"
            >
              {p.url && (
                <img
                  src={p.url}
                  alt={p.caption ?? ''}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Upload progress overlay */}
      {uploadCount.total > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-primary-50 ring-1 ring-primary-100 p-3 text-xs font-semibold text-primary-700">
          <Loader2 size={14} className="animate-spin" />
          Uploading {uploadCount.done} of {uploadCount.total}…
        </div>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && photos[lightboxIndex] && (
          <Lightbox
            photo={photos[lightboxIndex]}
            count={photos.length}
            index={lightboxIndex}
            eventTitle={eventTitle}
            onClose={() => setLightboxIndex(null)}
            onPrev={() => setLightboxIndex((i) => (i === null ? null : (i - 1 + photos.length) % photos.length))}
            onNext={() => setLightboxIndex((i) => (i === null ? null : (i + 1) % photos.length))}
            onDelete={async () => {
              const p = photos[lightboxIndex]
              if (!p) return
              if (p.uploaded_by !== user?.id) return
              try {
                await delPhoto.mutateAsync({ photoId: p.id, storagePath: p.storage_path })
                toast.success('Photo removed')
                setLightboxIndex(null)
              } catch {
                toast.error('Could not delete')
              }
            }}
            canDelete={photos[lightboxIndex].uploaded_by === user?.id}
          />
        )}
      </AnimatePresence>
    </section>
  )
}

function Lightbox({
  photo,
  count,
  index,
  eventTitle,
  onClose,
  onPrev,
  onNext,
  onDelete,
  canDelete,
}: {
  photo: EventPhoto
  count: number
  index: number
  eventTitle: string
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onDelete: () => void
  canDelete: boolean
}) {
  async function handleShare() {
    if (!photo.url) return
    try {
      if (navigator.share) {
        await navigator.share({
          title: eventTitle,
          text: `From ${eventTitle} on Co-Exist`,
          url: photo.url,
        })
      } else {
        await navigator.clipboard.writeText(photo.url)
      }
    } catch {
      // user cancelled or unsupported
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[60] bg-black/90 flex flex-col"
      role="dialog"
      aria-modal="true"
    >
      {/* Top bar - padded for safe-area-inset-top so share/close clear the notch */}
      <div
        className="flex items-center justify-between px-4 py-3 text-white"
        style={{ paddingTop: 'calc(var(--safe-top, 0px) + 0.75rem)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Avatar src={photo.uploader?.avatar_url ?? null} name={photo.uploader?.display_name ?? 'Member'} size="xs" />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{photo.uploader?.display_name ?? 'Member'}</p>
            <p className="text-[11px] text-white/60">{index + 1} of {count}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center justify-center w-10 h-10 rounded-full text-white/90 hover:bg-white/10 active:scale-[0.96] transition-transform duration-150"
            aria-label="Share photo"
          >
            <Share2 size={18} />
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center justify-center w-10 h-10 rounded-full text-white/90 hover:bg-white/10 active:scale-[0.96] transition-transform duration-150"
              aria-label="Delete photo"
            >
              <Trash2 size={18} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-10 h-10 rounded-full text-white/90 hover:bg-white/10 active:scale-[0.96] transition-transform duration-150"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center p-4" onClick={onClose}>
        {photo.url && (
          <img
            src={photo.url}
            alt={photo.caption ?? ''}
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>

      {/* Caption + nav */}
      <div className="px-4 pb-6 text-white">
        {photo.caption && (
          <p className="text-sm text-white/80 mb-3 text-center leading-relaxed">{photo.caption}</p>
        )}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onPrev}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-semibold transition-transform duration-150 active:scale-[0.97]',
              count > 1 ? 'bg-white/10 text-white' : 'opacity-30 cursor-not-allowed',
            )}
            disabled={count <= 1}
          >
            Previous
          </button>
          <button
            type="button"
            onClick={onNext}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-semibold transition-transform duration-150 active:scale-[0.97]',
              count > 1 ? 'bg-white/10 text-white' : 'opacity-30 cursor-not-allowed',
            )}
            disabled={count <= 1}
          >
            Next
          </button>
        </div>
      </div>
    </motion.div>
  )
}
