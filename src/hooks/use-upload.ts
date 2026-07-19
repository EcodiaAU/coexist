import { useState, useCallback } from 'react'

/**
 * Base upload state hook.
 * Owns `uploading`, `progress`, `error`, and `reset` - the state management
 * that was duplicated between use-image-upload.ts and use-file-upload.ts.
 *
 * Accepts a generic `uploadFn` so callers can wrap any storage operation
 * (image-with-compression, raw file, etc.) with consistent state tracking.
 *
 * @example
 * const { uploading, progress, error, reset, run } = useUpload(
 *   async (file: File, onProgress) => {
 *     return uploadWithProgress({ bucket, path, file, onProgress })
 *   }
 * )
 * const result = await run(file)
 */
export function useUpload<TFile, TResult>(
  uploadFn: (file: TFile, onProgress: (p: number) => void) => Promise<TResult>,
) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setUploading(false)
    setProgress(null)
    setError(null)
  }, [])

  const run = useCallback(
    async (file: TFile): Promise<TResult> => {
      setUploading(true)
      setError(null)
      setProgress(0)

      try {
        const result = await uploadFn(file, (p) => setProgress(p))
        setProgress(100)
        return result
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Upload failed'
        setError(msg)
        throw e
      } finally {
        setUploading(false)
      }
    },
    [uploadFn],
  )

  /**
   * Upload a batch of files in one uploading window. Runs them in parallel,
   * reports count-based aggregate progress (per-file byte progress is coarse
   * across a batch, so we advance as each file settles), and keeps `uploading`
   * true for the whole batch. Never throws - returns the settled results so
   * the caller can split successes from failures.
   */
  const runMany = useCallback(
    async (files: TFile[]): Promise<PromiseSettledResult<TResult>[]> => {
      if (files.length === 0) return []
      setUploading(true)
      setError(null)
      setProgress(0)

      let done = 0
      try {
        const settled = await Promise.allSettled(
          files.map(async (file) => {
            const result = await uploadFn(file, () => {})
            done++
            setProgress(Math.round((done / files.length) * 100))
            return result
          }),
        )
        setProgress(100)
        if (settled.every((s) => s.status === 'rejected')) {
          setError('Upload failed')
        }
        return settled
      } finally {
        setUploading(false)
      }
    },
    [uploadFn],
  )

  return { uploading, progress, error, reset, run, runMany }
}
