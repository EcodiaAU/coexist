import { useCallback, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Capacitor } from '@capacitor/core'
import { Share2, Download, X, Loader2 } from 'lucide-react'
import html2canvas from 'html2canvas'
import { BottomSheet } from './bottom-sheet'
import { Button } from './button'
import {
  EventShareGraphic,
  SHARE_SIZES,
  type ShareSize,
} from './event-share-graphic'
import { cn } from '@/lib/cn'

/* ====================================================================== */
/*  EventShareSheet                                                        */
/*                                                                         */
/*  BottomSheet that previews three Co-Exist-branded share graphics for an */
/*  event (1:1, 4:5, 9:16) and lets the user download or system-share each */
/*  as a PNG.                                                              */
/*                                                                         */
/*  Download mechanic: captures a SEPARATE offscreen full-resolution       */
/*  EventShareGraphic (no CSS transform parent) so the downloaded image    */
/*  exactly matches the preview tile. Using the preview's CSS-scaled DOM   */
/*  node as the html2canvas target is a known source of mismatch.         */
/* ====================================================================== */

export interface EventShareSheetProps {
  open: boolean
  onClose: () => void
  eventId: string
  title: string
  dateLabel: string
  locationLabel: string
  collectiveName?: string | null
  coverImageUrl?: string | null
}

const SIZE_ORDER: ShareSize[] = ['story', 'portrait', 'square']

/* Preview tile widths per size. We render the full-resolution graphic
   inside a fixed-width preview container, then scale it down with CSS
   transform. Capture uses a SEPARATE offscreen instance (no transform). */
const PREVIEW_WIDTH = 220 // px - the on-screen preview width
function previewScale(size: ShareSize): number {
  return PREVIEW_WIDTH / SHARE_SIZES[size].width
}
function previewHeight(size: ShareSize): number {
  return SHARE_SIZES[size].height * previewScale(size)
}

export function EventShareSheet({
  open,
  onClose,
  eventId,
  title,
  dateLabel,
  locationLabel,
  collectiveName,
  coverImageUrl,
}: EventShareSheetProps) {
  // Preview refs (inside CSS scale() transform - for visual display only)
  const previewRefs = useRef<Record<ShareSize, HTMLDivElement | null>>({
    portrait: null,
    square: null,
    story: null,
  })

  // Capture refs (offscreen, NO CSS transform parent - used for html2canvas)
  // Separating these from the preview refs ensures download exactly matches preview:
  // html2canvas does not correctly handle elements inside CSS scale() transforms.
  const captureRefs = useRef<Record<ShareSize, HTMLDivElement | null>>({
    portrait: null,
    square: null,
    story: null,
  })

  const [busy, setBusy] = useState<ShareSize | null>(null)

  const buildFilename = useCallback(
    (size: ShareSize) =>
      `coexist-event-${eventId.slice(0, 8)}-${SHARE_SIZES[size].aspect.replace(':', 'x')}.png`,
    [eventId],
  )

  const captureBlob = useCallback(async (size: ShareSize): Promise<Blob | null> => {
    // Use the offscreen capture ref - clean full-res, no transform parent
    const node = captureRefs.current[size]
    if (!node) return null
    const canvas = await html2canvas(node, {
      scale: 1, // already at full resolution
      backgroundColor: null,
      useCORS: true,
      allowTaint: false,
      logging: false,
      width: SHARE_SIZES[size].width,
      height: SHARE_SIZES[size].height,
      // windowWidth/windowHeight intentionally omitted: overriding them
      // causes html2canvas to reflow layout at a different viewport width,
      // producing output that differs from the on-screen preview.
    })
    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png', 0.95)
    })
  }, [])

  // On laptop/desktop the OS share sheet is awkward (or absent), so we
  // skip Web Share entirely and just download the PNG. On native (Capacitor)
  // and on mobile browsers with file-share support we still hand off to the
  // system share sheet so users can post to IG/etc directly.
  const isNative = Capacitor.isNativePlatform()
  const isTouch =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(pointer: coarse)').matches
  const preferDownload = !isNative && !isTouch

  const handleSystemShare = useCallback(
    async (size: ShareSize) => {
      try {
        setBusy(size)
        const blob = await captureBlob(size)
        if (!blob) return

        const downloadBlob = () => {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = buildFilename(size)
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          setTimeout(() => URL.revokeObjectURL(url), 4000)
        }

        if (preferDownload) {
          downloadBlob()
          return
        }

        const file = new File([blob], buildFilename(size), { type: 'image/png' })
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            files: [file],
            title,
            text: `${title} - ${dateLabel}`,
          })
        } else {
          downloadBlob()
        }
      } catch (e) {
        // User cancellation throws AbortError - ignore silently
        if ((e as Error)?.name !== 'AbortError') {
          console.error('[event-share] share failed', e)
        }
      } finally {
        setBusy(null)
      }
    },
    [captureBlob, buildFilename, title, dateLabel, preferDownload],
  )

  const sharedGraphicProps = {
    title,
    dateLabel,
    locationLabel,
    collectiveName: collectiveName ?? null,
    coverImageUrl: coverImageUrl ?? null,
  }

  return (
    <BottomSheet open={open} onClose={onClose} className="max-h-[92vh]">

      {/* Offscreen capture instances - one per size, no CSS transform parent.
          These are the html2canvas capture targets. Rendered at native resolution,
          positioned far off-screen so they never appear to the user. */}
      {SIZE_ORDER.map((sz) => (
        <EventShareGraphic
          key={`capture-${sz}`}
          ref={(el) => { captureRefs.current[sz] = el }}
          size={sz}
          {...sharedGraphicProps}
          offscreen
        />
      ))}

      <div className="px-5 pt-3 pb-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div>
            <h2 className="font-heading text-lg font-bold text-neutral-900">Share this event</h2>
            <p className="text-[13px] text-neutral-500 mt-0.5">
              Save a graphic to your camera roll, then post it.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full flex items-center justify-center text-neutral-500 hover:bg-neutral-100 active:scale-95 transition-transform"
          >
            <X size={18} />
          </button>
        </div>

        {/* Preview row - horizontal scroll on mobile so all 3 fit */}
        <div className="mt-4 -mx-5 px-5 overflow-x-auto">
          <div className="flex gap-4 pb-2" style={{ minWidth: 'min-content' }}>
            {SIZE_ORDER.map((sz) => {
              const spec = SHARE_SIZES[sz]
              const scale = previewScale(sz)
              const ph = previewHeight(sz)
              return (
                <div key={sz} className="flex flex-col items-center shrink-0">
                  {/* Preview frame */}
                  <div
                    className={cn(
                      'rounded-2xl overflow-hidden ring-1 ring-neutral-200/80 shadow-sm bg-neutral-50',
                      'relative',
                    )}
                    style={{ width: PREVIEW_WIDTH, height: ph }}
                  >
                    {/* Scaled-down visual preview. Ref stored in previewRefs (not used for capture). */}
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        transform: `scale(${scale})`,
                        transformOrigin: 'top left',
                        width: spec.width,
                        height: spec.height,
                      }}
                    >
                      <EventShareGraphic
                        ref={(el) => { previewRefs.current[sz] = el }}
                        size={sz}
                        {...sharedGraphicProps}
                      />
                    </div>

                    {/* Busy overlay */}
                    {busy === sz && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute inset-0 bg-black/40 flex items-center justify-center text-white"
                      >
                        <Loader2 size={28} className="animate-spin" />
                      </motion.div>
                    )}
                  </div>

                  {/* Label + actions */}
                  <div className="mt-3 text-center">
                    <p className="text-[13px] font-bold text-neutral-900">{spec.label}</p>
                    <p className="text-[11px] text-neutral-500">
                      {spec.aspect}  ·  {spec.width}×{spec.height}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-col gap-1.5 w-full">
                    <Button
                      variant="primary"
                      size="sm"
                      icon={preferDownload ? <Download size={14} /> : <Share2 size={14} />}
                      onClick={() => handleSystemShare(sz)}
                      disabled={busy !== null}
                      fullWidth
                    >
                      {preferDownload ? 'Download' : 'Save'}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <p className="mt-4 text-[12px] text-neutral-500 leading-relaxed">
          Save the image, then open Instagram and post it from your camera roll.
          The graphic includes app store links so people can install Co-Exist
          and find this event.
        </p>
      </div>
    </BottomSheet>
  )
}
