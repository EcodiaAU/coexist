import { Suspense } from 'react'
import { cn } from '@/lib/cn'
import { lazyWithRetry } from '@/lib/lazy-with-retry'
import type { DevModuleContent } from '@/hooks/use-admin-development'

const MarkdownRenderer = lazyWithRetry(() => import('./markdown-renderer'))
const VideoPlayer = lazyWithRetry(() => import('./video-player'))
const PdfViewer = lazyWithRetry(() => import('./pdf-viewer'))
const Slideshow = lazyWithRetry(() => import('./slideshow'))

interface ContentBlockRendererProps {
  block: DevModuleContent
  className?: string
}

const BlockFallback = () => <div data-eos-id="src/components/development/content-block-renderer.tsx#0" data-eos-v="2" className="h-24 animate-pulse rounded-sm bg-white" />

export function ContentBlockRenderer({ block, className }: ContentBlockRendererProps) {
  return (
    <div data-eos-id="src/components/development/content-block-renderer.tsx#1" className={cn('space-y-2', className)}>
      {/* Optional block title */}
      {block.title && (
        <h3 data-eos-id="src/components/development/content-block-renderer.tsx#2" data-eos-var="block.title" data-eos-var-label="Title" data-eos-var-scope="prop" className="font-heading text-lg font-bold text-neutral-900">{block.title}</h3>
      )}

      {/* Text block */}
      {block.content_type === 'text' && block.text_content && (
        <Suspense data-eos-id="src/components/development/content-block-renderer.tsx#3" fallback={<BlockFallback data-eos-id="src/components/development/content-block-renderer.tsx#4" />}>
          <MarkdownRenderer data-eos-id="src/components/development/content-block-renderer.tsx#5" content={block.text_content} />
        </Suspense>
      )}

      {/* Video block */}
      {block.content_type === 'video' && block.video_url && (
        <Suspense data-eos-id="src/components/development/content-block-renderer.tsx#6" fallback={<BlockFallback data-eos-id="src/components/development/content-block-renderer.tsx#7" />}>
          <VideoPlayer data-eos-id="src/components/development/content-block-renderer.tsx#8"
            url={block.video_url}
            provider={block.video_provider}
          />
        </Suspense>
      )}

      {/* File block */}
      {block.content_type === 'file' && block.file_url && (
        <Suspense data-eos-id="src/components/development/content-block-renderer.tsx#9" fallback={<BlockFallback data-eos-id="src/components/development/content-block-renderer.tsx#10" />}>
          <PdfViewer data-eos-id="src/components/development/content-block-renderer.tsx#11"
            url={block.file_url}
            fileName={block.file_name}
            fileSizeBytes={block.file_size_bytes}
          />
        </Suspense>
      )}

      {/* Slideshow block */}
      {block.content_type === 'slideshow' && block.image_urls.length > 0 && (
        <Suspense data-eos-id="src/components/development/content-block-renderer.tsx#12" fallback={<BlockFallback data-eos-id="src/components/development/content-block-renderer.tsx#13" />}>
          <Slideshow data-eos-id="src/components/development/content-block-renderer.tsx#14"
            images={block.image_urls}
            captions={block.image_captions}
          />
        </Suspense>
      )}

      {/* Quiz block  rendered separately by the parent page */}
      {block.content_type === 'quiz' && (
        <div data-eos-id="src/components/development/content-block-renderer.tsx#15" className="rounded-sm bg-moss-50 border border-moss-200 p-4 text-center">
          <p data-eos-id="src/components/development/content-block-renderer.tsx#16" className="text-sm font-semibold text-moss-700">Quiz section</p>
          <p data-eos-id="src/components/development/content-block-renderer.tsx#17" className="text-xs text-moss-500 mt-0.5">Complete the quiz below to continue</p>
        </div>
      )}
    </div>
  )
}

export default ContentBlockRenderer
