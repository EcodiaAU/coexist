/**
 * Photo download / save helpers.
 *
 * - On web (laptop / desktop browser): triggers a regular browser download.
 * - On iOS / Android WKWebView via Capacitor: opens the native share sheet
 *   so the user can pick "Save to Photos" / "Save Image". navigator.share
 *   exists in iOS Safari + WKWebView; when files: are passed it shares the
 *   bytes directly so iOS offers Save Image inline.
 *
 * The long-press handler in the photo viewer fires saveToCameraRoll(); the
 * download button calls downloadOne / downloadMany.
 */
import JSZip from 'jszip'

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

  // Try the native file-share path first (iOS / Android via WKWebView).
  // navigator.canShare with files is the cross-browser detection. If it
  // works the user can pick "Save Image" / "Save to Photos" from the sheet.
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
