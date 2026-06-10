import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion, useMotionValue, animate } from 'framer-motion'
import { Camera, ImagePlus, Video as VideoIcon, X, Trash2, Share2, Loader2, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAuth } from '@/hooks/use-auth'
import { useEventPhotos, useUploadEventPhoto, useDeleteEventPhoto, type EventPhoto } from '@/hooks/use-event-photos'
import { useCamera } from '@/hooks/use-camera'
import { useToast } from '@/components/toast'
import { Button } from '@/components/button'
import { Avatar } from '@/components/avatar'
import { saveToCameraRoll } from '@/lib/photo-download'

// Detect a video by storage_path extension. Keeps the schema flat.
// eslint-disable-next-line react-refresh/only-export-components
export function isVideoPath(path: string): boolean {
  const ext = path.split('?')[0].toLowerCase()
  return ext.endsWith('.mp4') || ext.endsWith('.mov') || ext.endsWith('.webm') || ext.endsWith('.m4v')
}

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
    // bridged input. Accepts both photos and videos. Cap at MAX_PER_UPLOAD.
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*,video/*'
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
    <section id="event-photos-section" className="w-full scroll-mt-20">
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

      {/* Photo / video grid */}
      {!isLoading && totalPhotos > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map((p, i) => {
            const isVid = isVideoPath(p.storage_path)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="relative aspect-square rounded-xl overflow-hidden bg-neutral-100 active:scale-[0.97] transition-transform duration-150"
                aria-label={isVid ? 'View video' : 'View photo'}
              >
                {p.url && (
                  isVid ? (
                    <video
                      src={p.url}
                      muted
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={p.url}
                      alt={p.caption ?? ''}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  )
                )}
                {isVid && (
                  <span className="absolute bottom-1 right-1 flex items-center justify-center w-6 h-6 rounded-full bg-black/60 text-white">
                    <VideoIcon size={11} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Upload progress overlay */}
      {uploadCount.total > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-primary-50 ring-1 ring-primary-100 p-3 text-xs font-semibold text-primary-700">
          <Loader2 size={14} className="animate-spin" />
          Uploading {uploadCount.done} of {uploadCount.total}…
        </div>
      )}

      {/* Carousel lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && photos[lightboxIndex] && (
          <PhotoCarouselLightbox
            photos={photos}
            initialIndex={lightboxIndex}
            eventTitle={eventTitle}
            onClose={() => setLightboxIndex(null)}
            onDelete={async (p) => {
              if (!p || p.uploaded_by !== user?.id) return
              try {
                await delPhoto.mutateAsync({ photoId: p.id, storagePath: p.storage_path })
                toast.success('Photo removed')
                setLightboxIndex(null)
              } catch {
                toast.error('Could not delete')
              }
            }}
            currentUserId={user?.id ?? null}
          />
        )}
      </AnimatePresence>
    </section>
  )
}

/**
 * PhotoCarouselLightbox - fullscreen carousel for an array of photos / videos.
 * Drag-to-swipe between items, snaps to the nearest on release. Suppresses
 * the page-level swipe-back gesture while mounted so left-edge swipes within
 * the carousel don't trigger nav-back.
 */
export function PhotoCarouselLightbox({
  photos,
  initialIndex,
  eventTitle,
  onClose,
  onDelete,
  currentUserId,
}: {
  photos: EventPhoto[]
  initialIndex: number
  eventTitle: string
  onClose: () => void
  /** When provided + delete button is shown, called with the active photo. */
  onDelete?: (photo: EventPhoto) => void
  currentUserId: string | null
}) {
  const [index, setIndex] = useState(initialIndex)
  const containerRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const [width, setWidth] = useState(0)

  // Mount: suppress page-level swipe-back globally + lock measurements.
  useEffect(() => {
    document.body.dataset.suppressSwipeBack = 'true'
    return () => { delete document.body.dataset.suppressSwipeBack }
  }, [])

  useEffect(() => {
    const update = () => {
      if (containerRef.current) setWidth(containerRef.current.clientWidth)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Snap to the active index whenever it changes (programmatic prev/next or
  // initial mount). Use framer's animate for spring-like feel.
  useEffect(() => {
    if (!width) return
    const controls = animate(x, -index * width, { type: 'spring', stiffness: 320, damping: 34, mass: 0.7 })
    return () => controls.stop()
  }, [index, width, x])

  function snap(direction: number) {
    setIndex((i) => Math.min(photos.length - 1, Math.max(0, i + direction)))
  }

  // Long-press to trigger save (mobile gesture parity with native gallery
  // apps). 550ms hold = save. Drag inside the carousel cancels. Hooks
  // must precede the early-return-on-no-current so rules-of-hooks holds.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)
  const handleSaveRef = useRef<() => void>(() => {})
  const onTouchStart = useCallback(() => {
    longPressFired.current = false
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      handleSaveRef.current()
    }, 550)
  }, [])
  const onTouchCancel = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])
  useEffect(() => () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }, [])

  const current = photos[index]
  if (!current) return null
  const canDelete = !!onDelete && current.uploaded_by === currentUserId

  async function handleShare() {
    const url = current.url
    if (!url) return
    try {
      if (navigator.share) {
        await navigator.share({ title: eventTitle, text: `From ${eventTitle} on Co-Exist`, url })
      } else {
        await navigator.clipboard.writeText(url)
      }
    } catch { /* cancelled / unsupported */ }
  }

  async function handleSave() {
    if (!current.url) return
    try {
      await saveToCameraRoll(current.url, current.storage_path, current.caption ?? undefined)
    } catch { /* user cancelled or save failed quietly */ }
  }
  // Keep the latest handleSave bound to the long-press ref so the
  // setTimeout closure always invokes the freshest closure (handleSave
  // closes over `current` which changes per render).
  handleSaveRef.current = handleSave

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[60] bg-black flex flex-col"
      role="dialog"
      aria-modal="true"
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3 text-white relative z-10"
        style={{ paddingTop: 'calc(var(--safe-top, 0px) + 0.75rem)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Avatar src={current.uploader?.avatar_url ?? null} name={current.uploader?.display_name ?? 'Member'} size="xs" />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{current.uploader?.display_name ?? 'Member'}</p>
            <p className="text-[11px] text-white/60">{index + 1} of {photos.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center justify-center w-10 h-10 rounded-full text-white/90 hover:bg-white/10 active:scale-[0.96] transition-transform duration-150"
            aria-label="Save to photos"
          >
            <Download size={18} />
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center justify-center w-10 h-10 rounded-full text-white/90 hover:bg-white/10 active:scale-[0.96] transition-transform duration-150"
            aria-label="Share"
          >
            <Share2 size={18} />
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete && onDelete(current)}
              className="flex items-center justify-center w-10 h-10 rounded-full text-white/90 hover:bg-white/10 active:scale-[0.96] transition-transform duration-150"
              aria-label="Delete"
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

      {/* Slides */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        {width > 0 && (
          <motion.div
            className="absolute inset-0 flex"
            style={{ x, width: width * photos.length }}
            drag="x"
            dragMomentum={false}
            dragElastic={0.18}
            dragConstraints={{ left: -width * (photos.length - 1), right: 0 }}
            onDragStart={onTouchCancel}
            onDragEnd={(_, info) => {
              onTouchCancel()
              const offset = info.offset.x
              const velocity = info.velocity.x
              const threshold = width * 0.3
              if ((offset < -threshold || velocity < -500) && index < photos.length - 1) {
                setIndex(index + 1)
              } else if ((offset > threshold || velocity > 500) && index > 0) {
                setIndex(index - 1)
              } else {
                // snap back
                animate(x, -index * width, { type: 'spring', stiffness: 320, damping: 34, mass: 0.7 })
              }
            }}
          >
            {photos.map((p) => (
              <div
                key={p.id}
                className="shrink-0 flex items-center justify-center p-3"
                style={{ width }}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchCancel}
                onTouchCancel={onTouchCancel}
                onTouchMove={onTouchCancel}
              >
                {p.url && (isVideoPath(p.storage_path) ? (
                  <video
                    src={p.url}
                    controls
                    playsInline
                    className="max-w-full max-h-full rounded-xl pointer-events-auto"
                  />
                ) : (
                  <img
                    src={p.url}
                    alt={p.caption ?? ''}
                    draggable={false}
                    className="max-w-full max-h-full object-contain rounded-xl select-none pointer-events-none"
                  />
                ))}
              </div>
            ))}
          </motion.div>
        )}

        {/* Prev/Next overlay buttons (desktop nicety; mobile users swipe) */}
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => snap(-1)}
              disabled={index === 0}
              className={cn(
                'hidden sm:flex absolute top-1/2 -translate-y-1/2 left-2 items-center justify-center w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm text-white',
                index === 0 ? 'opacity-30' : 'hover:bg-white/25',
              )}
              aria-label="Previous"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              onClick={() => snap(1)}
              disabled={index === photos.length - 1}
              className={cn(
                'hidden sm:flex absolute top-1/2 -translate-y-1/2 right-2 items-center justify-center w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm text-white',
                index === photos.length - 1 ? 'opacity-30' : 'hover:bg-white/25',
              )}
              aria-label="Next"
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}
      </div>

      {/* Footer: caption + dots */}
      <div className="px-4 pb-6 pt-3 text-white relative z-10" style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 1.25rem)' }}>
        {current.caption && (
          <p className="text-sm text-white/85 mb-3 text-center leading-relaxed">{current.caption}</p>
        )}
        {photos.length > 1 && (
          <div className="flex items-center justify-center gap-1.5">
            {photos.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'rounded-full transition-all duration-200',
                  i === index ? 'w-5 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40',
                )}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}
