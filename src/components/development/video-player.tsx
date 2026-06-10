import { useMemo } from 'react'
import { cn } from '@/lib/cn'

interface VideoPlayerProps {
  url: string
  provider?: 'youtube' | 'vimeo' | 'upload' | null
  className?: string
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  )
  return match?.[1] ?? null
}

function extractVimeoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  return match?.[1] ?? null
}

export function VideoPlayer({ url, provider, className }: VideoPlayerProps) {
  const embedUrl = useMemo(() => {
    if (provider === 'youtube' || (!provider && url.includes('youtu'))) {
      const id = extractYouTubeId(url)
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
    }
    if (provider === 'vimeo' || (!provider && url.includes('vimeo'))) {
      const id = extractVimeoId(url)
      return id ? `https://player.vimeo.com/video/${id}` : null
    }
    return null
  }, [url, provider])

  // Direct upload  use native <video>
  if (provider === 'upload' || (!embedUrl && !url.includes('youtu') && !url.includes('vimeo'))) {
    return (
      <div className={cn('rounded-xl overflow-hidden bg-primary-900', className)}>
        <video
          src={url}
          controls
          preload="metadata"
          className="w-full aspect-video object-contain"
          controlsList="nodownload"
        >
          Your browser does not support the video tag.
        </video>
      </div>
    )
  }

  // Embed (YouTube / Vimeo)
  if (embedUrl) {
    return (
      <div className={cn('rounded-xl overflow-hidden bg-primary-900', className)}>
        <div className="relative w-full aspect-video">
          <iframe
            src={embedUrl}
            title="Video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
        </div>
      </div>
    )
  }

  // Fallback
  return (
    <div className={cn('rounded-xl bg-primary-100 p-4 text-center text-sm text-primary-500', className)}>
      Unable to load video
    </div>
  )
}

export default VideoPlayer
