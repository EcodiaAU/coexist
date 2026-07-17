/**
 * Photo download / save helpers.
 *
 * - On web (laptop / desktop browser): triggers a regular browser download.
 * - On iOS / Android native (Capacitor): saves straight into the photo
 *   library via @capacitor-community/media (see src/lib/native-share.ts).
 *   The old navigator.share route was a silent no-op on Android (the system
 *   WebView has no Web Share API and Capacitor has no DownloadListener, so
 *   the <a download> fallback did nothing) - client bug, Tamika Wilton
 *   2026-07-17. If the direct save fails we fall back to the native share
 *   sheet so the user can still pick "Save Image" there.
 *
 * The long-press handler in the photo viewer fires saveToCameraRoll(); the
 * download button calls downloadOne / downloadMany.
 */
import JSZip from 'jszip'
import {
  isNativePlatform,
  isShareCancellation,
  saveMediaToGallery,
  shareBlobNative,
} from '@/lib/native-share'

function filenameFromPath(path: string, fallback = 'photo'): string {
  const cleaned = path.split('?')[0]
  const tail = cleaned.split('/').pop() || ''
  if (tail) return tail
  return `${fallback}.jpg`
}

function mimeFromPath(path: string): string {
  const lower = path.split('?')[0].toLowerCase()
  if (lower.endsWith('.mp4')) return 'video/mp4'
  if (lower.endsWith('.mov')) return 'video/quicktime'
  if (lower.endsWith('.webm')) return 'video/webm'
  if (lower.endsWith('.m4v')) return 'video/x-m4v'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.heic')) return 'image/heic'
  return 'image/jpeg'
}

async function fetchAsBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: 'cors' })
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
  return res.blob()
}

/**
 * Single-file download. On native, opens the share sheet (Save Image
 * appears inline). On web, triggers a regular browser download.
 */
export async function saveToCameraRoll(
  url: string,
  storagePath: string,
  caption?: string,
): Promise<void> {
  const name = filenameFromPath(storagePath)
  const mime = mimeFromPath(storagePath)

  // Native app: save straight into the photo library. The media plugin
  // downloads the remote URL natively, so no fetch->blob round trip needed.
  if (isNativePlatform()) {
    const kind = mime.startsWith('video/') ? 'video' : 'photo'
    try {
      await saveMediaToGallery(url, name, kind)
      return
    } catch (e) {
      console.error('[photo-download] direct gallery save failed', e)
      // Fall back to the native share sheet ("Save Image" lives there too).
      try {
        const blob = await fetchAsBlob(url)
        await shareBlobNative(blob, name, { text: caption ?? '' })
        return
      } catch (shareErr) {
        if (isShareCancellation(shareErr)) return
        console.error('[photo-download] share-sheet fallback failed', shareErr)
        // fall through to the browser-download path below
      }
    }
  }

  // Mobile-browser file share (NOT the native app - navigator.share exists
  // in iOS Safari / Chrome for Android). Lets the user pick "Save Image".
  try {
    const blob = await fetchAsBlob(url)
    const file = new File([blob], name, { type: mime })
    const nav = navigator as unknown as {
      canShare?: (data: { files?: File[] }) => boolean
      share?: (data: { files?: File[]; url?: string; text?: string }) => Promise<void>
    }
    if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], text: caption ?? '' })
      return
    }
  } catch {
    // fall through to browser-download path
  }

  // Web / fallback: trigger a download via blob URL.
  try {
    const blob = await fetchAsBlob(url)
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5000)
  } catch {
    // Absolute fallback - open in new tab; user can long-press to save.
    window.open(url, '_blank', 'noopener')
  }
}

export interface PhotoToZip {
  url: string
  storage_path: string
}

/**
 * Bundle N photos / videos into a single .zip and download it.
 * Used by the admin /admin/photos multi-select flow.
 */
export async function downloadAsZip(
  items: PhotoToZip[],
  zipName = 'co-exist-photos.zip',
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (items.length === 0) return
  const zip = new JSZip()
  let done = 0
  for (const item of items) {
    try {
      const blob = await fetchAsBlob(item.url)
      let baseName = filenameFromPath(item.storage_path)
      // Dedupe names so multiple uploads in the same event don't clobber.
      let suffix = 0
      while (zip.file(baseName)) {
        suffix++
        const dot = baseName.lastIndexOf('.')
        baseName = dot > 0
          ? `${baseName.slice(0, dot)}-${suffix}${baseName.slice(dot)}`
          : `${baseName}-${suffix}`
      }
      zip.file(baseName, blob)
    } catch {
      // skip files that fail to fetch
    }
    done++
    onProgress?.(done, items.length)
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const objectUrl = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = zipName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5000)
}
