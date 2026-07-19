import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useImageUpload } from '@/hooks/use-image-upload'
import type { useCamera } from '@/hooks/use-camera'

// Auth + storage leaves mocked; everything else is the real hook code.
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))
const uploadImage = vi.fn()
vi.mock('@/lib/image-utils', () => ({ uploadImage: (...a: unknown[]) => uploadImage(...a) }))

// Mirror of a CameraResult, without pulling canvas/EXIF into jsdom.
function camResult(tag: string) {
  return { dataUrl: `blob:${tag}`, blob: new Blob([tag], { type: 'image/jpeg' }), width: 1200, height: 900 }
}

/**
 * Harness reproduces log-impact.tsx's handleAddPhoto wiring verbatim: one "Add"
 * tap picks MANY photos, uploads them as a batch, and appends every url. Proves
 * the visual outcome Fei asked for - several thumbnails from a single add.
 */
function Harness({ camera }: { camera: ReturnType<typeof useCamera> }) {
  const uploader = useImageUpload({ bucket: 'event-images' })
  const [photos, setPhotos] = useState<string[]>([])

  const handleAdd = async () => {
    const results = await camera.pickMultipleFromGallery()
    if (results.length === 0) return
    const uploaded = await uploader.uploadMultiple(results.map((r) => r.blob))
    if (uploaded.length > 0) setPhotos((prev) => [...prev, ...uploaded.map((u) => u.url)])
  }

  return (
    <div>
      <button onClick={handleAdd}>Add</button>
      {photos.map((p, i) => (
        <img key={p} data-testid="thumb" src={p} alt={`Photo ${i + 1}`} />
      ))}
    </div>
  )
}

describe('log-impact multi-photo add wiring', () => {
  beforeEach(() => uploadImage.mockReset())

  it('adds several thumbnails from a single Add tap', async () => {
    uploadImage
      .mockResolvedValueOnce({ url: 'a.jpg', thumbnailUrl: 'a.jpg', mediumUrl: 'a.jpg' })
      .mockResolvedValueOnce({ url: 'b.jpg', thumbnailUrl: 'b.jpg', mediumUrl: 'b.jpg' })
      .mockResolvedValueOnce({ url: 'c.jpg', thumbnailUrl: 'c.jpg', mediumUrl: 'c.jpg' })

    const camera = {
      capture: vi.fn(),
      pickFromGallery: vi.fn(),
      pickMultipleFromGallery: vi.fn().mockResolvedValue([camResult('a'), camResult('b'), camResult('c')]),
      loading: false,
      error: null,
    } as unknown as ReturnType<typeof useCamera>

    render(<Harness camera={camera} />)
    await userEvent.click(screen.getByText('Add'))

    await waitFor(() => expect(screen.getAllByTestId('thumb')).toHaveLength(3))
    expect(uploadImage).toHaveBeenCalledTimes(3)
  })

  it('adds nothing when the picker is cancelled', async () => {
    const camera = {
      capture: vi.fn(),
      pickFromGallery: vi.fn(),
      pickMultipleFromGallery: vi.fn().mockResolvedValue([]),
      loading: false,
      error: null,
    } as unknown as ReturnType<typeof useCamera>

    render(<Harness camera={camera} />)
    await userEvent.click(screen.getByText('Add'))

    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryAllByTestId('thumb')).toHaveLength(0)
    expect(uploadImage).not.toHaveBeenCalled()
  })
})
