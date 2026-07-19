import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

// Mock auth so the hook has a user to build paths for.
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

// Mock the storage layer so we control success / failure per file without
// touching the network or canvas.
const uploadImage = vi.fn()
vi.mock('@/lib/image-utils', () => ({
  uploadImage: (...args: unknown[]) => uploadImage(...args),
}))

import { useImageUpload } from '@/hooks/use-image-upload'

function blob(name: string): Blob {
  return new Blob([name], { type: 'image/jpeg' })
}

function ok(url: string) {
  return { url, thumbnailUrl: url, mediumUrl: url }
}

describe('useImageUpload.uploadMultiple (batch multi-photo add)', () => {
  beforeEach(() => {
    uploadImage.mockReset()
  })

  it('uploads every selected photo in one batch and returns all urls', async () => {
    uploadImage
      .mockResolvedValueOnce(ok('a.jpg'))
      .mockResolvedValueOnce(ok('b.jpg'))
      .mockResolvedValueOnce(ok('c.jpg'))

    const { result } = renderHook(() => useImageUpload({ bucket: 'event-images' }))

    let urls: string[] = []
    await act(async () => {
      const res = await result.current.uploadMultiple([blob('a'), blob('b'), blob('c')])
      urls = res.map((r) => r.url)
    })

    expect(uploadImage).toHaveBeenCalledTimes(3)
    expect(urls.sort()).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
    expect(result.current.hasFailed).toBe(false)
    // The batch window closes and progress lands at 100.
    await waitFor(() => expect(result.current.uploading).toBe(false))
    expect(result.current.progress).toBe(100)
  })

  it('surfaces per-file failures for retry without losing the successes', async () => {
    uploadImage
      .mockResolvedValueOnce(ok('a.jpg'))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(ok('c.jpg'))

    const { result } = renderHook(() => useImageUpload({ bucket: 'event-images' }))

    let urls: string[] = []
    await act(async () => {
      const res = await result.current.uploadMultiple([blob('a'), blob('b'), blob('c')])
      urls = res.map((r) => r.url)
    })

    // Two succeeded, one is parked as a retriable failure.
    expect(urls.sort()).toEqual(['a.jpg', 'c.jpg'])
    expect(result.current.failedUploads).toHaveLength(1)
    expect(result.current.hasFailed).toBe(true)

    // Retrying the failed file succeeds and clears it from the failed list.
    uploadImage.mockResolvedValueOnce(ok('b.jpg'))
    let retried = ''
    await act(async () => {
      retried = (await result.current.retry(0)).url
    })
    expect(retried).toBe('b.jpg')
    await waitFor(() => expect(result.current.hasFailed).toBe(false))
  })

  it('is a no-op for an empty selection (cancelled picker)', async () => {
    const { result } = renderHook(() => useImageUpload({ bucket: 'event-images' }))
    let res: unknown[] = []
    await act(async () => {
      res = await result.current.uploadMultiple([])
    })
    expect(res).toEqual([])
    expect(uploadImage).not.toHaveBeenCalled()
  })
})
