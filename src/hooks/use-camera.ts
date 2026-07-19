import { useState, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { compressImage } from '@/lib/image-utils'

interface CameraResult {
  dataUrl: string
  blob: Blob
  width: number
  height: number
}

interface UseCameraReturn {
  /** Open the device camera to capture a photo */
  capture: () => Promise<CameraResult | null>
  /** Open the device gallery to pick a photo */
  pickFromGallery: () => Promise<CameraResult | null>
  /**
   * Open the device gallery to pick several photos at once. Returns every
   * selected photo (compressed + EXIF-corrected). Empty array on cancel.
   * `limit` caps the selection (0 = unlimited).
   */
  pickMultipleFromGallery: (limit?: number) => Promise<CameraResult[]>
  /** Whether a camera operation is in progress */
  loading: boolean
  /** Last error message, if any */
  error: string | null
}

/**
 * Wraps the Capacitor Camera plugin (v8 APIs) for native, and falls back to
 * an `<input type="file">` for web.
 *
 * All results are compressed client-side (<500KB) and EXIF-corrected
 * before being returned, so the blob is ready for upload.
 */
export function useCamera(): UseCameraReturn {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const takePhoto = useCallback(
    async (source: 'camera' | 'gallery'): Promise<CameraResult | null> => {
      setLoading(true)
      setError(null)

      try {
        let blob: Blob | null = null

        if (Capacitor.isNativePlatform()) {
          const { Camera } = await import('@capacitor/camera')

          if (source === 'camera') {
            // v8 API: takePhoto returns MediaResult with webPath
            const result = await Camera.takePhoto({
              quality: 80,
              targetWidth: 1200,
              targetHeight: 1200,
              correctOrientation: true,
            })

            if (!result.webPath) return null
            const response = await fetch(result.webPath)
            blob = await response.blob()
          } else {
            // v8 API: chooseFromGallery returns MediaResults
            const result = await Camera.chooseFromGallery({
              quality: 80,
              targetWidth: 1200,
              targetHeight: 1200,
              correctOrientation: true,
            })

            const photo = result.results?.[0]
            if (!photo?.webPath) return null
            const response = await fetch(photo.webPath)
            blob = await response.blob()
          }
        } else {
          // Web fallback: use file input
          const raw = await pickFileWeb(source === 'camera' ? 'camera' : 'gallery')
          if (!raw) return null
          blob = raw.blob
        }

        if (!blob) return null

        return await blobToResult(blob)
      } catch (e) {
        const friendly = classifyCameraError(e)
        setError(friendly) // null when the user simply cancelled
        return null
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const pickMultiple = useCallback(
    async (limit = 0): Promise<CameraResult[]> => {
      setLoading(true)
      setError(null)

      try {
        let blobs: Blob[] = []

        if (Capacitor.isNativePlatform()) {
          const { Camera } = await import('@capacitor/camera')
          // v8 API: chooseFromGallery with allowMultipleSelection returns
          // MediaResults.results[] - one entry per selected photo.
          const result = await Camera.chooseFromGallery({
            allowMultipleSelection: true,
            limit,
            quality: 80,
            targetWidth: 1200,
            targetHeight: 1200,
            correctOrientation: true,
          })

          for (const photo of result.results ?? []) {
            if (!photo?.webPath) continue
            const response = await fetch(photo.webPath)
            blobs.push(await response.blob())
          }
        } else {
          // Web fallback: multi-select file input.
          blobs = await pickFilesWeb(limit)
        }

        if (blobs.length === 0) return []

        // Compress each in parallel; skip any that fail to decode rather than
        // losing the whole batch.
        const settled = await Promise.allSettled(blobs.map((b) => blobToResult(b)))
        const results = settled
          .filter((s): s is PromiseFulfilledResult<CameraResult> => s.status === 'fulfilled')
          .map((s) => s.value)

        if (results.length === 0 && settled.length > 0) {
          setError('Those photos could not be read. Please try again.')
        }
        return results
      } catch (e) {
        setError(classifyCameraError(e)) // null when cancelled
        return []
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const capture = useCallback(() => takePhoto('camera'), [takePhoto])
  const pickFromGallery = useCallback(() => takePhoto('gallery'), [takePhoto])

  return { capture, pickFromGallery, pickMultipleFromGallery: pickMultiple, loading, error }
}

/**
 * Compress a raw blob (also fixes EXIF orientation via createImageBitmap) and
 * measure the compressed result. Shared by single + multi pick paths.
 */
async function blobToResult(blob: Blob): Promise<CameraResult> {
  const compressed = await compressImage(blob)
  const compressedUrl = URL.createObjectURL(compressed)
  const dims = await getImageDimensions(compressedUrl)
  return {
    dataUrl: compressedUrl,
    blob: compressed,
    width: dims.width,
    height: dims.height,
  }
}

/**
 * Map a raw camera/gallery error to a friendly message, or null when the user
 * simply cancelled (which is not an error worth surfacing).
 */
function classifyCameraError(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : 'Camera error'
  const name = e instanceof Error ? e.name : ''

  // User cancelled - not an error
  if (msg.includes('cancelled') || msg.includes('User cancelled') || msg.includes('pickImages') || msg.includes('No image')) {
    return null
  }
  // Capacitor Camera permission denied
  if (msg.includes('denied') || msg.includes('permission') || msg.includes('access')) {
    return 'Photo access denied. Please enable in your device Settings.'
  }
  // Storage full (QuotaExceededError from canvas/blob/createObjectURL)
  if (name === 'QuotaExceededError' || msg.includes('quota') || msg.includes('storage')) {
    return 'Not enough storage on your device. Free up some space and try again.'
  }
  // SecurityError - camera blocked by browser policy
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access was blocked. Please allow camera access in your browser or device settings.'
  }
  return msg
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getImageDimensions(
  src: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve({ width: 0, height: 0 })
    img.src = src
  })
}

function pickFileWeb(
  mode: 'camera' | 'gallery',
): Promise<{ blob: Blob } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    if (mode === 'camera') input.capture = 'environment'
    // iOS WKWebView requires the input to be in the DOM
    input.style.position = 'fixed'
    input.style.opacity = '0'
    input.style.pointerEvents = 'none'
    document.body.appendChild(input)

    const cleanup = () => {
      input.remove()
    }

    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        cleanup()
        return resolve(null)
      }
      cleanup()
      resolve({ blob: file })
    }

    // Handle cancel (focus returns to window without change event)
    const onFocus = () => {
      setTimeout(() => {
        if (!input.files?.length) {
          cleanup()
          resolve(null)
        }
        window.removeEventListener('focus', onFocus)
      }, 300)
    }
    window.addEventListener('focus', onFocus)

    input.click()
  })
}

/**
 * Web multi-select gallery picker. Returns the selected files as blobs, capped
 * at `limit` (0 = unlimited). Empty array on cancel.
 */
function pickFilesWeb(limit = 0): Promise<Blob[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = true
    // iOS WKWebView requires the input to be in the DOM
    input.style.position = 'fixed'
    input.style.opacity = '0'
    input.style.pointerEvents = 'none'
    document.body.appendChild(input)

    const cleanup = () => {
      input.remove()
    }

    input.onchange = () => {
      let files = Array.from(input.files ?? [])
      if (limit > 0) files = files.slice(0, limit)
      cleanup()
      resolve(files)
    }

    // Handle cancel (focus returns to window without change event)
    const onFocus = () => {
      setTimeout(() => {
        if (!input.files?.length) {
          cleanup()
          resolve([])
        }
        window.removeEventListener('focus', onFocus)
      }, 300)
    }
    window.addEventListener('focus', onFocus)

    input.click()
  })
}
