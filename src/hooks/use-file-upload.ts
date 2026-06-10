import { useCallback } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { uploadWithProgress } from '@/lib/image-utils'
import { useUpload } from '@/hooks/use-upload'
import { buildStoragePath } from '@/lib/storage-path-builder'

interface UseFileUploadOptions {
  bucket: string
  pathPrefix?: string
  /** Max file size in MB (default 20) */
  maxSizeMB?: number
}

interface UseFileUploadReturn {
  upload: (file: File) => Promise<{ url: string; path: string; fileName: string }>
  uploading: boolean
  progress: number | null
  error: string | null
  reset: () => void
}

/**
 * General-purpose file upload (PDFs, docs, images - no compression).
 * Uploads directly to Supabase Storage and returns the public URL.
 */
export function useFileUpload({
  bucket,
  pathPrefix = '',
  maxSizeMB = 20,
}: UseFileUploadOptions): UseFileUploadReturn {
  const { user } = useAuth()

  const uploadFn = useCallback(
    async (file: File, onProgress: (p: number) => void) => {
      if (!user) throw new Error('Not authenticated')

      if (file.size > maxSizeMB * 1024 * 1024) {
        throw new Error(`File too large (max ${maxSizeMB}MB)`)
      }

      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
      const path = buildStoragePath(user.id, pathPrefix || undefined, ext)

      const result = await uploadWithProgress({ bucket, path, file, onProgress })
      return { url: result.url, path: result.path, fileName: file.name }
    },
    [user, bucket, pathPrefix, maxSizeMB],
  )

  const { uploading, progress, error, reset, run } = useUpload(uploadFn)

  return { upload: run, uploading, progress, error, reset }
}
