import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { Button } from '@/components/button'
import { BottomSheet } from '@/components/bottom-sheet'
import { OptimizedImage } from '@/components/optimized-image'
import {
  useActiveAnnouncement,
  useDismissAnnouncement,
  type AnnouncementModal as Announcement,
} from '@/hooks/use-announcement-modal'

/* ------------------------------------------------------------------ */
/*  Presentational content - reused by the live modal and the admin    */
/*  preview so what an admin sees is exactly what a member sees.        */
/* ------------------------------------------------------------------ */

export function AnnouncementModalContent({
  announcement,
  onCta,
  onDismiss,
  preview = false,
}: {
  announcement: Announcement
  onCta: () => void
  onDismiss: () => void
  preview?: boolean
}) {
  const hasCta = !!(announcement.cta_label?.trim() && announcement.cta_href?.trim())

  return (
    <div className="pb-1">
      {/* Close affordance (member modal only; the preview frame has its own chrome) */}
      {!preview && (
        <div className="flex justify-end -mt-1 -mr-1 mb-1">
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="flex items-center justify-center rounded-full min-w-11 min-h-11 text-neutral-400 hover:bg-neutral-50 active:scale-[0.98] transition-[colors,transform] duration-150 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>
      )}

      {announcement.image_url && (
        <div className="mb-4 rounded-sm overflow-hidden ring-1 ring-black/[0.04]">
          <OptimizedImage
            src={announcement.image_url}
            alt=""
            aspectRatio="16/9"
            priority
            className="w-full"
          />
        </div>
      )}

      <h2 className="font-heading text-xl font-bold text-neutral-900 leading-tight">
        {announcement.title}
      </h2>

      {announcement.body?.trim() && (
        <p className="mt-2.5 text-sm text-neutral-600 leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere]">
          {announcement.body}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-2">
        {hasCta ? (
          <>
            <Button variant="primary" size="lg" fullWidth onClick={onCta}>
              {announcement.cta_label}
            </Button>
            <Button variant="ghost" size="sm" fullWidth onClick={onDismiss}>
              Maybe later
            </Button>
          </>
        ) : (
          <Button variant="primary" size="lg" fullWidth onClick={onDismiss}>
            Got it
          </Button>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  The gate - mounted once in the app shell. Shows the active          */
/*  announcement once per member on app open, then never again for      */
/*  that version. Not routed; does not block the app.                   */
/* ------------------------------------------------------------------ */

export function AnnouncementModal() {
  const { data: announcement } = useActiveAnnouncement()
  const dismiss = useDismissAnnouncement()
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState<Announcement | null>(null)
  // Guards against re-opening the same version within this session (e.g. after
  // a dismiss, before the seen-write invalidation lands, or a query refetch).
  const shownThisSession = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!announcement) return
    const key = `${announcement.id}:${announcement.updated_at}`
    if (shownThisSession.current.has(key)) return
    // Small delay so the modal does not fight the first paint of the app.
    const timer = setTimeout(() => {
      shownThisSession.current.add(key)
      setCurrent(announcement)
      setOpen(true)
    }, 700)
    return () => clearTimeout(timer)
  }, [announcement])

  const handleDismiss = () => {
    setOpen(false)
    if (current) dismiss.mutate(current)
  }

  const handleCta = () => {
    const href = current?.cta_href?.trim()
    setOpen(false)
    if (current) dismiss.mutate(current)
    if (!href) return
    if (href.startsWith('/')) {
      navigate(href)
    } else {
      window.open(href, '_blank', 'noopener,noreferrer')
    }
  }

  if (!current) return null

  return (
    <BottomSheet open={open} onClose={handleDismiss}>
      <AnnouncementModalContent
        announcement={current}
        onCta={handleCta}
        onDismiss={handleDismiss}
      />
    </BottomSheet>
  )
}
