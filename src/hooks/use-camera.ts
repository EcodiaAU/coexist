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
  /** Whether a camera operation is in progress */
  loading: boolean
  /** Last error message, if any */
  error: string | null
}

/**
 * Wraps the Capacitor Camera plugin for native, and falls back to
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
        let raw: CameraResult | null = null

        if (Capacitor.isNativePlatform()) {
          const { Camera, CameraResultType, CameraSource } = await import(
            '@capacitor/camera'
          )

          // Let Camera.getPhoto handle permission prompts natively — manual
          // checkPermissions can hang on iOS when status is 'limited'.
          const photo = await Camera.getPhoto({
            quality: 80,
            allowEditing: false,
            resultType: CameraResultType.DataUrl,
            source:
              source === 'camera'
                ? CameraSource.Camera
                : CameraSource.Photos,
            width: 1200,
            height: 1200,
            promptLabelHeader: source === 'camera' ? 'Take Photo' : 'Choose Photo',
            promptLabelPhoto: 'From Gallery',
            promptLabelPicture: 'From Gallery',
          })

          if (!photo.dataUrl) return null

          const blob = dataUrlToBlob(photo.dataUrl)
          raw = {
            dataUrl: photo.dataUrl,
            blob,
            width: 1200,
            height: 1200,
          }
        } else {
          // Web fallback: use file input
          raw = await pickFileWeb(source === 'camera' ? 'camera' : 'gallery')
        }

        if (!raw) return null

        // Compress (also fixes EXIF orientation via createImageBitmap)
        const compressed = await compressImage(raw.blob)
        const compressedUrl = URL.createObjectURL(compressed)

        // Get dimensions of compressed result
        const dims = await getImageDimensions(compressedUrl)

        return {
          dataUrl: compressedUrl,
          blob: compressed,
          width: dims.width,
          height: dims.height,
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Camera error'
        const name = e instanceof Error ? e.name : ''

        // User cancelled - not an error
        if (msg.includes('cancelled') || msg.includes('User cancelled') || msg.includes('pickImages')) {
          return null
        }

        // Capacitor Camera permission denied
        if (msg.includes('denied') || msg.includes('permission') || msg.includes('access')) {
          setError('Photo access denied. Please enable in your device Settings.')
          return null
        }

        // Storage full (QuotaExceededError from canvas/blob/createObjectURL)
        if (name === 'QuotaExceededError' || msg.includes('quota') || msg.includes('storage')) {
          setError('Not enough storage on your device. Free up some space and try again.')
          return null
        }

        // SecurityError - camera blocked by browser policy
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setError('Camera access was blocked. Please allow camera access in your browser or device settings.')
          return null
        }

        setError(msg)
        return null
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const capture = useCallback(() => takePhoto('camera'), [takePhoto])
  const pickFromGallery = useCallback(() => takePhoto('gallery'), [takePhoto])

  return { capture, pickFromGallery, loading, error }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg'
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

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
): Promise<CameraResult | null> {
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

      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        const img = new Image()
        img.onload = () => {
          cleanup()
          resolve({
            dataUrl,
            blob: file,
            width: img.naturalWidth,
            height: img.naturalHeight,
          })
        }
        img.onerror = () => { cleanup(); resolve(null) }
        img.src = dataUrl
      }
      reader.onerror = () => { cleanup(); resolve(null) }
      reader.readAsDataURL(file)
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
