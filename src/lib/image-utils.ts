import { supabase } from '@/lib/supabase'

/* ------------------------------------------------------------------ */
/*  Client-side image compression                                      */
/* ------------------------------------------------------------------ */

interface CompressOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  maxSizeKB?: number
}

/**
 * Compress an image blob to target <500KB (configurable).
 * Fixes EXIF orientation and re-encodes as JPEG via canvas.
 */
export async function compressImage(
  blob: Blob,
  options: CompressOptions = {},
): Promise<Blob> {
  const {
    maxWidth = 1200,
    maxHeight = 1200,
    quality = 0.8,
    maxSizeKB = 500,
  } = options

  const bitmap = await createImageBitmap(blob)
  const { width, height } = bitmap

  // Calculate new dimensions maintaining aspect ratio
  let newW = width
  let newH = height

  if (newW > maxWidth) {
    newH = Math.round((maxWidth / newW) * newH)
    newW = maxWidth
  }
  if (newH > maxHeight) {
    newW = Math.round((maxHeight / newH) * newW)
    newH = maxHeight
  }

  // createImageBitmap already handles EXIF orientation in modern browsers,
  // so drawing to canvas produces correctly-oriented output.
  const canvas = new OffscreenCanvas(newW, newH)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get canvas context')

  ctx.drawImage(bitmap, 0, 0, newW, newH)
  bitmap.close()

  // Try decreasing quality until under maxSizeKB
  let q = quality
  let result = await canvas.convertToBlob({ type: 'image/jpeg', quality: q })

  while (result.size > maxSizeKB * 1024 && q > 0.3) {
    q -= 0.1
    result = await canvas.convertToBlob({ type: 'image/jpeg', quality: q })
  }

  return result
}

/* ------------------------------------------------------------------ */
/*  Thumbnail generation                                               */
/* ------------------------------------------------------------------ */

/**
 * Generate a small thumbnail blob from an image.
 * Defaults to 200x200 max, quality 0.6.
 */
export async function generateThumbnail(
  blob: Blob,
  size = 200,
): Promise<Blob> {
  return compressImage(blob, {
    maxWidth: size,
    maxHeight: size,
    quality: 0.6,
    maxSizeKB: 50,
  })
}

/* ------------------------------------------------------------------ */
/*  Upload to Supabase Storage with progress                           */
/* ------------------------------------------------------------------ */

interface UploadOptions {
  bucket: string
  path: string
  file: Blob
  onProgress?: (percent: number) => void
}

interface UploadResult {
  url: string
  path: string
}

/**
 * Upload a file to Supabase Storage. Uses XMLHttpRequest
 * for progress tracking since the Supabase JS client doesn't
 * expose upload progress natively.
 */
export async function uploadWithProgress({
  bucket,
  path,
  file,
  onProgress,
}: UploadOptions): Promise<UploadResult> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated - cannot upload files')
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No active session - cannot upload files')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(path)
        resolve({ url: data.publicUrl, path })
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`))
      }
    })

    xhr.addEventListener('error', () => reject(new Error('Upload network error')))

    xhr.open('POST', `${supabaseUrl}/storage/v1/object/${bucket}/${path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('Content-Type', file.type || 'image/jpeg')
    xhr.setRequestHeader('x-upsert', 'true')
    xhr.timeout = 120000
    xhr.addEventListener('timeout', () => reject(new Error('Upload timed out - check your connection and try again.')))
    xhr.send(file)
  })
}

/* ------------------------------------------------------------------ */
/*  Supabase Storage transform URLs                                    */
/* ------------------------------------------------------------------ */

/**
 * Append Supabase Storage image transform params to a public URL.
 * Uses Supabase's built-in /render/image/public transform endpoint.
 */
export function getTransformUrl(
  publicUrl: string,
  opts: { width?: number; height?: number; quality?: number } = {},
): string {
  const { width, height, quality = 80 } = opts
  // Strip existing query params (e.g. cache-buster ?t=...) before building transform URL
  const [baseUrl] = publicUrl.split('?')
  const transformed = baseUrl.replace(
    '/storage/v1/object/public/',
    '/storage/v1/render/image/public/',
  )
  const params = new URLSearchParams()
  if (width) params.set('width', String(width))
  if (height) params.set('height', String(height))
  params.set('quality', String(quality))
  return `${transformed}?${params.toString()}`
}

/**
 * Get a thumbnail URL (200x200) from a Supabase Storage public URL.
 */
export function getThumbnailUrl(publicUrl: string): string {
  return getTransformUrl(publicUrl, { width: 200, height: 200 })
}

/**
 * Get a medium-sized URL (600x600) from a Supabase Storage public URL.
 */
export function getMediumUrl(publicUrl: string): string {
  return getTransformUrl(publicUrl, { width: 600, height: 600 })
}

/* ------------------------------------------------------------------ */
/*  Responsive srcset generation                                       */
/* ------------------------------------------------------------------ */

/** Standard breakpoints for srcset generation */
const SRCSET_WIDTHS = [320, 640, 768, 1024, 1280] as const

/**
 * Check whether a URL points to Supabase Storage (and can use transforms).
 */
export function isSupabaseStorageUrl(url: string): boolean {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  return url.startsWith(supabaseUrl) && url.includes('/storage/v1/')
}

/**
 * Generate a srcSet string for responsive images via Supabase transforms.
 * Falls back to the original URL if it's not a Supabase Storage URL.
 */
export function getSrcSet(
  publicUrl: string,
  widths: readonly number[] = SRCSET_WIDTHS,
  quality = 80,
): string {
  if (!isSupabaseStorageUrl(publicUrl)) return ''
  return widths
    .map((w) => `${getTransformUrl(publicUrl, { width: w, quality })} ${w}w`)
    .join(', ')
}

/**
 * Get a low-quality placeholder URL for blur-up loading (20px wide, quality 20).
 */
export function getPlaceholderUrl(publicUrl: string): string {
  if (!isSupabaseStorageUrl(publicUrl)) return ''
  return getTransformUrl(publicUrl, { width: 20, quality: 20 })
}

/* ------------------------------------------------------------------ */
/*  Unified uploadImage helper                                         */
/* ------------------------------------------------------------------ */

export interface UploadImageResult {
  url: string
  thumbnailUrl: string
  mediumUrl: string
  path: string
}

/**
 * Unified image upload pipeline:
 * 1. Compress client-side (target <500KB)
 * 2. Upload to Supabase Storage with progress
 * 3. Return full URL + Supabase transform URLs for thumbnails
 */
export async function uploadImage(
  file: Blob,
  bucket: string,
  path: string,
  onProgress?: (percent: number) => void,
): Promise<UploadImageResult> {
  // Compress
  const compressed = await compressImage(file)

  // Upload with progress
  const result = await uploadWithProgress({
    bucket,
    path,
    file: compressed,
    onProgress,
  })

  return {
    url: result.url,
    thumbnailUrl: getThumbnailUrl(result.url),
    mediumUrl: getMediumUrl(result.url),
    path: result.path,
  }
}
