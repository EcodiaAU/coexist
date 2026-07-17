import { useCallback, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Capacitor } from '@capacitor/core'
import { Share2, Download, X, Loader2, Link2, Check } from 'lucide-react'
import html2canvas from 'html2canvas'
import {
  isShareCancellation,
  saveBlobToGallery,
  shareBlobNative,
} from '@/lib/native-share'
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
  const [savedSize, setSavedSize] = useState<ShareSize | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  // Public, no-auth event page so interested attendees (who may not have the
  // app) can open it. IG strips links from captions, so the leader's ask is to
  // have the link to paste into DMs / texts directly.
  const shareUrl = `${
    import.meta.env.VITE_APP_URL || 'https://app.coexistaus.org'
  }/event/${eventId}`

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      // Fallback for WebViews where navigator.clipboard is unavailable.
      const ta = document.createElement('textarea')
      ta.value = shareUrl
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* best-effort */ }
      document.body.removeChild(ta)
    }
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }, [shareUrl])

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

  // NATIVE save: write the PNG straight into the photo library via
  // @capacitor-community/media. This replaces the old navigator.share path,
  // which was a silent no-op on Android (no Web Share API in the system
  // WebView) and flaky on iOS (transient user activation expires during the
  // 1-3s html2canvas capture). Client bug: Tamika Wilton 2026-07-17.
  const handleNativeSave = useCallback(
    async (size: ShareSize) => {
      try {
        setBusy(size)
        setSaveError(null)
        const blob = await captureBlob(size)
        if (!blob) throw new Error('Could not render the graphic')
        await saveBlobToGallery(blob, buildFilename(size))
        setSavedSize(size)
        setTimeout(() => setSavedSize((cur) => (cur === size ? null : cur)), 2500)
      } catch (e) {
        console.error('[event-share] native save failed', e)
        setSaveError(
          /denied|not allowed/i.test((e as Error)?.message ?? '')
            ? 'Photo access is off for Co-Exist. Allow "Add Photos" in your phone settings, then try again.'
            : 'Could not save the image. Please try again.',
        )
      } finally {
        setBusy(null)
      }
    },
    [captureBlob, buildFilename],
  )

  // NATIVE share: cache the PNG to a file and open the OS share sheet via
  // @capacitor/share (no user-activation constraint, works on both WebViews).
  const handleNativeShare = useCallback(
    async (size: ShareSize) => {
      try {
        setBusy(size)
        setSaveError(null)
        const blob = await captureBlob(size)
        if (!blob) throw new Error('Could not render the graphic')
        await shareBlobNative(blob, buildFilename(size), {
          title,
          text: `${title} - ${dateLabel}\n${shareUrl}`,
        })
      } catch (e) {
        if (!isShareCancellation(e)) {
          console.error('[event-share] native share failed', e)
          setSaveError('Could not open the share sheet. Please try again.')
        }
      } finally {
        setBusy(null)
      }
    },
    [captureBlob, buildFilename, title, dateLabel, shareUrl],
  )

  const handleSystemShare = useCallback(
    async (size: ShareSize) => {
      if (isNative) {
        // Button is labelled "Save" on native - save straight to camera roll.
        await handleNativeSave(size)
        return
      }
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
        const shareText = `${title} - ${dateLabel}\n${shareUrl}`
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title, text: shareText })
        } else if (navigator.share) {
          // Mobile browsers that can't share files but CAN share text+url.
          // Fall back to a link share so the event link still gets out, then
          // download the image so the user has the graphic too.
          await navigator.share({ title, text: shareText, url: shareUrl })
          downloadBlob()
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
    [
      captureBlob,
      buildFilename,
      title,
      dateLabel,
      preferDownload,
      shareUrl,
      isNative,
      handleNativeSave,
    ],
  )

  const sharedGraphicProps = {
    title,
    dateLabel,
    locationLabel,
    collectiveName: collectiveName ?? null,
    coverImageUrl: coverImageUrl ?? null,
  }

  return (
    <BottomSheet data-eos-id="src/components/event-share-sheet.tsx#0" data-eos-v="2" open={open} onClose={onClose} className="max-h-[92vh]">

      {/* Offscreen capture instances - one per size, no CSS transform parent.
          These are the html2canvas capture targets. Rendered at native resolution,
          positioned far off-screen so they never appear to the user. */}
      {SIZE_ORDER.map((sz) => (
        <EventShareGraphic data-eos-id="src/components/event-share-sheet.tsx#1"
          key={`capture-${sz}`}
          ref={(el) => { captureRefs.current[sz] = el }}
          size={sz}
          {...sharedGraphicProps}
          offscreen
        />
      ))}

      <div data-eos-id="src/components/event-share-sheet.tsx#2" className="px-5 pt-3 pb-6">
        {/* Header */}
        <div data-eos-id="src/components/event-share-sheet.tsx#3" className="flex items-center justify-between mb-1">
          <div data-eos-id="src/components/event-share-sheet.tsx#4">
            <h2 data-eos-id="src/components/event-share-sheet.tsx#5" className="font-heading text-lg font-bold text-neutral-900">Share this event</h2>
            <p data-eos-id="src/components/event-share-sheet.tsx#6" className="text-[13px] text-neutral-500 mt-0.5">
              Save a graphic to your camera roll, then post it.
            </p>
          </div>
          <button data-eos-id="src/components/event-share-sheet.tsx#7"
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full flex items-center justify-center text-neutral-500 hover:bg-neutral-100 active:scale-95 transition-transform"
          >
            <X data-eos-id="src/components/event-share-sheet.tsx#8" size={18} />
          </button>
        </div>

        {/* Preview row - horizontal scroll on mobile so all 3 fit */}
        <div data-eos-id="src/components/event-share-sheet.tsx#9" className="mt-4 -mx-5 px-5 overflow-x-auto">
          <div data-eos-id="src/components/event-share-sheet.tsx#10" className="flex gap-4 pb-2" style={{ minWidth: 'min-content' }}>
            {SIZE_ORDER.map((sz) => {
              const spec = SHARE_SIZES[sz]
              const scale = previewScale(sz)
              const ph = previewHeight(sz)
              return (
                <div data-eos-id="src/components/event-share-sheet.tsx#11" key={sz} className="flex flex-col items-center shrink-0">
                  {/* Preview frame */}
                  <div data-eos-id="src/components/event-share-sheet.tsx#12"
                    className={cn(
                      'rounded-md overflow-hidden ring-1 ring-neutral-200/80 shadow-sm bg-neutral-50',
                      'relative',
                    )}
                    style={{ width: PREVIEW_WIDTH, height: ph }}
                  >
                    {/* Scaled-down visual preview. Ref stored in previewRefs (not used for capture). */}
                    <div data-eos-id="src/components/event-share-sheet.tsx#13"
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
                      <EventShareGraphic data-eos-id="src/components/event-share-sheet.tsx#14"
                        ref={(el) => { previewRefs.current[sz] = el }}
                        size={sz}
                        {...sharedGraphicProps}
                      />
                    </div>

                    {/* Busy overlay */}
                    {busy === sz && (
                      <motion.div data-eos-id="src/components/event-share-sheet.tsx#15"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute inset-0 bg-black/40 flex items-center justify-center text-white"
                      >
                        <Loader2 data-eos-id="src/components/event-share-sheet.tsx#16" size={28} className="animate-spin" />
                      </motion.div>
                    )}
                  </div>

                  {/* Label + actions */}
                  <div data-eos-id="src/components/event-share-sheet.tsx#17" className="mt-3 text-center">
                    <p data-eos-id="src/components/event-share-sheet.tsx#18" data-eos-var="spec.label" data-eos-var-label="Label" data-eos-var-scope="prop" className="text-[13px] font-bold text-neutral-900">{spec.label}</p>
                    <p data-eos-id="src/components/event-share-sheet.tsx#19" data-eos-var="spec.aspect,spec.width,spec.height" data-eos-var-label="Aspect, Width, Height" data-eos-var-scope="prop" className="text-[11px] text-neutral-500">
                      {spec.aspect}  ·  {spec.width}×{spec.height}
                    </p>
                  </div>
                  <div data-eos-id="src/components/event-share-sheet.tsx#20" className="mt-2 flex flex-col gap-1.5 w-full">
                    <Button data-eos-id="src/components/event-share-sheet.tsx#21"
                      variant={savedSize === sz ? 'secondary' : 'primary'}
                      size="sm"
                      icon={
                        savedSize === sz
                          ? <Check data-eos-id="src/components/event-share-sheet.tsx#33" size={14} />
                          : isNative || preferDownload
                            ? <Download data-eos-id="src/components/event-share-sheet.tsx#22" size={14} />
                            : <Share2 data-eos-id="src/components/event-share-sheet.tsx#23" size={14} />
                      }
                      onClick={() => handleSystemShare(sz)}
                      disabled={busy !== null}
                      fullWidth
                    >
                      {savedSize === sz ? 'Saved' : preferDownload ? 'Download' : 'Save'}
                    </Button>
                    {isNative && (
                      <Button data-eos-id="src/components/event-share-sheet.tsx#34"
                        variant="secondary"
                        size="sm"
                        icon={<Share2 data-eos-id="src/components/event-share-sheet.tsx#35" size={14} />}
                        onClick={() => handleNativeShare(sz)}
                        disabled={busy !== null}
                        fullWidth
                      >
                        Share
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {saveError && (
          <p data-eos-id="src/components/event-share-sheet.tsx#36" className="mt-3 text-[12px] text-error-600 leading-relaxed" role="alert">
            {saveError}
          </p>
        )}

        {/* Event link - the graphic is just an image (no tappable link), so
            this Copy button is the only way to hand attendees a direct,
            openable link to the event. Instagram also strips links from
            captions, which is why a copyable URL matters.

            px-2 instead of p-3 (smaller side padding) + Copy stacked below
            the URL preview on full width. Tate verbatim 2026-05-28: "event
            link card has too much padding form the side of the screen and
            the copy button should be underneatht the url preview because
            its getting truncated way too much right now and looks bad". */}
        <div data-eos-id="src/components/event-share-sheet.tsx#24" className="mt-5 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-3">
          <p data-eos-id="src/components/event-share-sheet.tsx#25" className="text-[12px] font-bold text-neutral-900 mb-1.5 px-1">Event link</p>
          <div data-eos-id="src/components/event-share-sheet.tsx#26" className="rounded-sm bg-white border border-neutral-200 px-3 py-2">
            <p data-eos-id="src/components/event-share-sheet.tsx#27" className="text-[12px] text-neutral-600 break-all">{shareUrl}</p>
          </div>
          <Button data-eos-id="src/components/event-share-sheet.tsx#28"
            variant={linkCopied ? 'secondary' : 'primary'}
            size="sm"
            icon={linkCopied ? <Check data-eos-id="src/components/event-share-sheet.tsx#29" size={14} /> : <Link2 data-eos-id="src/components/event-share-sheet.tsx#30" size={14} />}
            onClick={handleCopyLink}
            fullWidth
            className="mt-2"
          >
            {linkCopied ? 'Copied' : 'Copy link'}
          </Button>
          <p data-eos-id="src/components/event-share-sheet.tsx#31" className="mt-2 text-[11px] text-neutral-500 leading-relaxed px-1">
            Anyone can open this link to see the event - no app or login needed.
          </p>
        </div>

        <p data-eos-id="src/components/event-share-sheet.tsx#32" className="mt-4 text-[12px] text-neutral-500 leading-relaxed">
          Save the image, then post it on Instagram from your camera roll. The
          image can&apos;t carry a tappable link, so copy the event link above
          to share in your story, bio, or DMs.
        </p>
      </div>
    </BottomSheet>
  )
}
